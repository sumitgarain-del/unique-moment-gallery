import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { db } from '../db.js';
import { CompressorService } from '../services/compressor.js';
import { GoogleDriveService } from '../services/gdrive.js';
import { socketHub } from '../services/websocket.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB per file (to support large high-res RAW/TIFF)
  },
});

// POST /api/projects/:id/upload
router.post('/:id/upload', upload.array('photos', 500), async (req, res) => {
  const { id } = req.params;
  const project = db.getProject(id);

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No photo files uploaded' });
  }

  try {
    const settings = db.getSettings();
    const uploadToDrive = Boolean(settings.gdrive?.enabled);
    let gdriveFolderId = null;
    let gdriveFolderUrl = null;

    if (uploadToDrive) {
      try {
        const folderRes = await GoogleDriveService.getOrCreateProjectFolder(project);
        gdriveFolderId = folderRes?.folderId;
        gdriveFolderUrl = folderRes?.folderUrl;
      } catch (e) {
        console.warn('[Upload] GDrive folder fetch failed:', e.message);
      }
    }

    const results = await CompressorService.processStreamPipeline({
      projectId: id,
      files: req.files,
      uploadToDrive: uploadToDrive && Boolean(gdriveFolderId),
      gdriveFolderId,
      onProgress: (progress) => {
        socketHub.broadcastToRoom(`project:${id}`, {
          type: 'UPLOAD_PROGRESS',
          ...progress,
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

    // Auto sync to Render cloud server
    const settings = db.getSettings();
    if (settings.cloudServerUrl) {
      try {
        const cloudUrl = settings.cloudServerUrl.replace(/\/$/, '') + '/api/cloud/sync-project';
        fetch(cloudUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: db.getProject(id) }),
        }).catch((e) => console.warn('[Cloud] Auto-sync note:', e.message));
      } catch (e) {}
    }

    // Notify project viewers
    socketHub.broadcastToRoom(`project:${id}`, {
      type: 'PHOTOS_ADDED',
      count: results.length,
      project: db.getProject(id),
    });

    res.json({
      success: true,
      count: results.length,
      images: results,
      project: db.getProject(id),
    });
  } catch (err) {
    console.error('[Upload] Error processing photos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
