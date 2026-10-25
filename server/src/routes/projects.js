import express from 'express';
import fs from 'fs';
import { db } from '../db.js';
import { CompressorService } from '../services/compressor.js';
import { GoogleDriveService } from '../services/gdrive.js';
import { socketHub } from '../services/websocket.js';

const router = express.Router();

// GET /api/projects
router.get('/', (req, res) => {
  try {
    const projects = db.getProjects();
    res.json({ success: true, projects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects
router.post('/', (req, res) => {
  try {
    const { clientName, eventDate, shootType, notes, title, masterFolderPath, outputFolderPath } = req.body;
    if (!clientName) {
      return res.status(400).json({ success: false, error: 'Client Name is required' });
    }

    const project = db.createProject({
      clientName,
      eventDate,
      shootType,
      notes,
      title,
      masterFolderPath,
      outputFolderPath,
    });

    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  try {
    const project = db.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/projects/:id
router.patch('/:id', (req, res) => {
  try {
    const updated = db.updateProject(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProject(id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // 1. Permanently delete project folder and all its proxies from Google Drive
    if (project.gdrive?.folderId) {
      try {
        await GoogleDriveService.deleteProjectFolder(project.gdrive.folderId);
        console.log(`[Delete] Google Drive folder ${project.gdrive.folderId} removed.`);
      } catch (gdriveErr) {
        console.warn(`[Delete] Google Drive deletion note: ${gdriveErr.message}`);
      }
    }

    // 2. Delete project from Render cloud server if configured
    const settings = db.getSettings();
    if (settings.cloudServerUrl && project.token) {
      try {
        const cloudUrl = `${settings.cloudServerUrl.replace(/\/$/, '')}/api/cloud/project/${project.token}`;
        await fetch(cloudUrl, { method: 'DELETE' });
        console.log(`[Delete] Project ${project.token} removed from Render cloud.`);
      } catch (cloudErr) {
        console.warn(`[Delete] Render cloud deletion note: ${cloudErr.message}`);
      }
    }

    // 3. Delete local proxy files and database record
    const success = db.deleteProject(id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Failed to delete local project' });
    }

    socketHub.broadcast('PROJECT_DELETED', { projectId: id });
    res.json({ success: true, message: 'Project, Google Drive backup, and cloud gallery deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects/:id/import-folder
router.post('/:id/import-folder', async (req, res) => {
  try {
    const { id } = req.params;
    const { folderPath, recursive = true } = req.body;

    const project = db.getProject(id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!folderPath || !fs.existsSync(folderPath)) {
      return res.status(400).json({ success: false, error: 'Folder path does not exist on this computer' });
    }

    // Save masterFolderPath to project in DB
    db.updateProject(id, { masterFolderPath: folderPath });

    // Scan folder for supported photos
    const files = CompressorService.scanFolder(folderPath, recursive);
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'No supported photo or RAW files found in this folder' });
    }

    // Respond immediately so client UI stays responsive
    res.json({
      success: true,
      message: `Found ${files.length} photos. Processing and syncing started in background.`,
      totalFiles: files.length,
      masterFolderPath: folderPath,
    });

    // Start background processing and concurrent Google Drive sync pipeline
    (async () => {
      try {
        console.log(`[Import] Starting concurrent compression & upload pipeline of ${files.length} photos from ${folderPath} for project ${id}...`);
        
        const settings = db.getSettings();
        const uploadToDrive = Boolean(settings.gdrive?.enabled);
        let gdriveFolderId = null;
        let gdriveFolderUrl = null;

        if (uploadToDrive) {
          try {
            const folderRes = await GoogleDriveService.getOrCreateProjectFolder(project);
            gdriveFolderId = folderRes?.folderId;
            gdriveFolderUrl = folderRes?.folderUrl;
          } catch (driveErr) {
            console.warn('[Import] Warning getting Google Drive folder:', driveErr.message);
          }
        }

        const results = await CompressorService.processStreamPipeline({
          projectId: id,
          files,
          uploadToDrive: uploadToDrive && Boolean(gdriveFolderId),
          gdriveFolderId,
          onProgress: (p) => {
            socketHub.broadcastToRoom(`project:${id}`, {
              type: 'FOLDER_IMPORT_PROGRESS',
              stage: p.stage,
              completed: p.completed,
              uploaded: p.uploaded,
              total: p.total,
              remaining: p.remaining,
              percent: p.percent,
              currentFile: p.currentFile,
              etaText: p.etaText,
              speedText: p.speedText,
            });
          },
        });

        const updatedProject = db.addImagesToProject(id, results);
        if (gdriveFolderId) {
          db.updateProject(id, {
            gdrive: {
              uploaded: true,
              folderId: gdriveFolderId,
              folderUrl: gdriveFolderUrl,
              syncedCount: results.filter((r) => r.gdriveId).length,
              syncedAt: new Date().toISOString(),
              mode: 'live',
            },
          });
        }

        // Auto push to Render.com cloud server if configured
        if (settings.cloudServerUrl) {
          try {
            const cloudUrl = settings.cloudServerUrl.replace(/\/$/, '') + '/api/cloud/sync-project';
            console.log(`[Cloud] Auto-syncing project ${id} to Render cloud: ${cloudUrl}`);
            await fetch(cloudUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project: db.getProject(id) }),
            });
            console.log(`[Cloud] Project ${id} synced to Render successfully.`);
          } catch (cloudErr) {
            console.warn(`[Cloud] Render auto-sync note: ${cloudErr.message}`);
          }
        }

        socketHub.broadcastToRoom(`project:${id}`, {
          type: 'PHOTOS_ADDED',
          count: results.length,
          project: db.getProject(id),
        });

        socketHub.broadcastToRoom(`project:${id}`, {
          type: 'FOLDER_IMPORT_COMPLETED',
          totalCount: results.length,
          project: db.getProject(id),
        });
      } catch (bgErr) {
        console.error('[Import] Background processing error:', bgErr.message);
        socketHub.broadcastToRoom(`project:${id}`, {
          type: 'FOLDER_IMPORT_ERROR',
          error: bgErr.message,
        });
      }
    })();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects/:id/cloud-sync (Push local project metadata to Render cloud server)
router.post('/:id/cloud-sync', async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProject(id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const settings = db.getSettings();
    if (!settings.cloudServerUrl) {
      return res.status(400).json({ success: false, error: 'Render Cloud Server URL not configured in Settings' });
    }

    const cloudUrl = settings.cloudServerUrl.replace(/\/$/, '') + '/api/cloud/sync-project';
    const response = await fetch(cloudUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to sync with Render cloud server');
    }

    res.json({ success: true, message: 'Project synced to Render cloud server successfully', data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects/:id/cloud-pull (Pull latest client selections from Render cloud server)
router.post('/:id/cloud-pull', async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProject(id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const settings = db.getSettings();
    if (!settings.cloudServerUrl) {
      return res.status(400).json({ success: false, error: 'Render Cloud Server URL not configured in Settings' });
    }

    const cloudUrl = `${settings.cloudServerUrl.replace(/\/$/, '')}/api/cloud/project/${project.token}/selection`;
    const response = await fetch(cloudUrl);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch selection from Render cloud server');
    }

    // Update local project images with latest client statuses
    if (data.allImages && Array.isArray(data.allImages)) {
      const currentImages = project.images || [];
      const cloudMap = new Map((data.allImages || []).map((ci) => [ci.id, ci]));

      const updatedImages = currentImages.map((img) => {
        const cloudImg = cloudMap.get(img.id);
        if (cloudImg) {
          const cloudStatus = cloudImg.status || 'unreviewed';
          const cloudComment = cloudImg.comment || '';
          return { ...img, status: cloudStatus, comment: cloudComment };
        }
        return img;
      });

      const updated = db.updateProject(id, {
        images: updatedImages,
        status: data.status === 'submitted' ? 'submitted' : project.status,
        submittedAt: data.submittedAt || project.submittedAt,
        submissionNotes: data.submissionNotes || project.submissionNotes,
      });

      if (data.status === 'submitted' && project.status !== 'submitted') {
        socketHub.broadcastToRoom(`project:${id}`, {
          type: 'PROJECT_SUBMITTED',
          projectId: id,
          token: project.token,
          submittedAt: data.submittedAt,
          stats: updated.stats,
        });

        socketHub.broadcastAll({
          type: 'STUDIO_ALERT',
          message: `🎉 Client ${project.clientName} has finalized their selection! (${updated.stats.selected} photos shortlisted)`,
          projectId: id,
          clientName: project.clientName,
          selectedCount: updated.stats.selected,
        });
      } else {
        socketHub.broadcastToRoom(`project:${id}`, {
          type: 'VOTE_UPDATED',
          projectId: id,
          stats: updated.stats,
        });
        socketHub.broadcastAll({
          type: 'PROJECT_UPDATED',
          project: updated,
        });
      }

      return res.json({ success: true, project: updated, stats: data });
    }

    res.json({ success: true, project: db.getProject(id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
