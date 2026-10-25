import express from 'express';
import { db } from '../db.js';

const router = express.Router();

/**
 * Endpoint on Render (or cloud server) to receive project metadata from local studio
 * POST /api/cloud/sync-project
 */
router.post('/sync-project', (req, res) => {
  try {
    const { project } = req.body;
    if (!project || !project.token) {
      return res.status(400).json({ success: false, error: 'Project data with token is required' });
    }

    const existing = db.getProjectByToken(project.token);
    let updated;
    if (existing) {
      // Preserve client status / votes if client has already voted or deselected on cloud!
      const mergedImages = (project.images || []).map((img) => {
        const existingImg = (existing.images || []).find(
          (i) => (img.id && i.id === img.id) ||
                 ((i.subfolder || '') === (img.subfolder || '') && i.originalName === img.originalName)
        );
        if (existingImg && (existingImg.lastVotedAt || (existingImg.status && existingImg.status !== 'unreviewed'))) {
          let preferredStatus = existingImg.status || 'unreviewed';
          let preferredComment = existingImg.comment || img.comment;
          let preferredVotedAt = existingImg.lastVotedAt || img.lastVotedAt;
          let preferredBy = existingImg.lastModifiedBy || img.lastModifiedBy;

          if (img.lastVotedAt && existingImg.lastVotedAt) {
            const localTime = new Date(img.lastVotedAt).getTime();
            const cloudTime = new Date(existingImg.lastVotedAt).getTime();
            if (localTime > cloudTime) {
              preferredStatus = img.status;
              preferredComment = img.comment;
              preferredVotedAt = img.lastVotedAt;
              preferredBy = img.lastModifiedBy;
            }
          } else if (img.status && img.status !== 'unreviewed' && (!existingImg.status || existingImg.status === 'unreviewed')) {
            preferredStatus = img.status;
            preferredComment = img.comment;
            preferredVotedAt = img.lastVotedAt;
            preferredBy = img.lastModifiedBy;
          }

          return {
            ...img,
            status: preferredStatus,
            comment: preferredComment,
            lastVotedAt: preferredVotedAt,
            lastModifiedBy: preferredBy,
          };
        }
        return img;
      });

      updated = db.updateProject(existing.id, {
        title: project.title,
        clientName: project.clientName,
        clientEmail: project.clientEmail,
        eventDate: project.eventDate,
        shootType: project.shootType,
        notes: project.notes,
        images: mergedImages,
        gdrive: project.gdrive,
        status: existing.status === 'submitted' ? 'submitted' : project.status,
        submittedAt: existing.submittedAt || project.submittedAt,
        submissionNotes: existing.submissionNotes || project.submissionNotes,
      });
    } else {
      updated = db.createProject(project);
    }

    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint to get latest client selection from cloud
 * GET /api/cloud/project/:token/selection
 */
router.get('/project/:token/selection', (req, res) => {
  try {
    const { token } = req.params;
    const project = db.getProjectByToken(token);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const selectedImages = (project.images || []).filter((img) => img.status === 'selected');
    const rejectedImages = (project.images || []).filter((img) => img.status === 'rejected');

    res.json({
      success: true,
      token,
      status: project.status,
      resetAt: project.resetAt || null,
      submittedAt: project.submittedAt,
      submissionNotes: project.submissionNotes,
      selectedCount: selectedImages.length,
      rejectedCount: rejectedImages.length,
      totalCount: (project.images || []).length,
      selectedImages: selectedImages.map((img) => ({
        id: img.id,
        originalName: img.originalName,
        stem: img.stem,
        comment: img.comment,
      })),
      allImages: (project.images || []).map((img) => ({
        id: img.id,
        originalName: img.originalName,
        status: img.status || 'unreviewed',
        comment: img.comment || '',
        lastVotedAt: img.lastVotedAt || null,
        lastModifiedBy: img.lastModifiedBy || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint on Render (or cloud server) to delete a project by token
 * DELETE /api/cloud/project/:token
 */
router.delete('/project/:token', (req, res) => {
  try {
    const { token } = req.params;
    const project = db.getProjectByToken(token);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    db.deleteProject(project.id);
    console.log(`[Cloud] Deleted project ${project.title} (${token}) from cloud.`);
    res.json({ success: true, message: 'Project deleted from cloud' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint on cloud to reset all client selections for a project
 * POST /api/cloud/project/:token/reset-selection
 */
router.post('/project/:token/reset-selection', (req, res) => {
  try {
    const { token } = req.params;
    const { resetAt = new Date().toISOString() } = req.body;
    const project = db.getProjectByToken(token);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const resetImages = (project.images || []).map((img) => ({
      ...img,
      status: 'unreviewed',
      comment: '',
      lastVotedAt: null,
      lastModifiedBy: null,
    }));

    const updated = db.updateProject(project.id, {
      images: resetImages,
      status: 'uploaded',
      submittedAt: null,
      submissionNotes: '',
      resetAt,
    });

    console.log(`[Cloud] Reset all selections for project "${project.title}" (${token})`);
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint on cloud to unlock/reopen a submitted project
 * POST /api/cloud/project/:token/reopen
 */
router.post('/project/:token/reopen', (req, res) => {
  try {
    const { token } = req.params;
    const project = db.getProjectByToken(token);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const updated = db.updateProject(project.id, {
      status: 'uploaded',
      submittedAt: null,
    });

    console.log(`[Cloud] Reopened project "${project.title}" (${token}) for re-verification`);
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
