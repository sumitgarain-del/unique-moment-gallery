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
      // Preserve client status / votes if client has already voted on cloud!
      const mergedImages = (project.images || []).map((img) => {
        const existingImg = (existing.images || []).find(
          (i) => i.id === img.id || i.originalName === img.originalName
        );
        if (existingImg && existingImg.status && existingImg.status !== 'unreviewed') {
          return { ...img, status: existingImg.status, comment: existingImg.comment || img.comment };
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
        status: img.status,
        comment: img.comment,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
