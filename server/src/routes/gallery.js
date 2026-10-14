import express from 'express';
import { db } from '../db.js';
import { socketHub } from '../services/websocket.js';

const router = express.Router();

// GET /api/gallery/:token
router.get('/:token', (req, res) => {
  try {
    const { token } = req.params;
    const project = db.getProjectByToken(token);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Gallery link not found or expired' });
    }

    // Return client-safe view (without internal master paths)
    const clientSafeProject = {
      id: project.id,
      title: project.title,
      clientName: project.clientName,
      eventDate: project.eventDate,
      shootType: project.shootType,
      notes: project.notes,
      token: project.token,
      status: project.status,
      submittedAt: project.submittedAt,
      submissionNotes: project.submissionNotes,
      stats: project.stats,
      images: project.images.map((img) => ({
        id: img.id,
        originalName: img.originalName,
        stem: img.stem,
        proxyFilename: img.proxyFilename,
        proxyUrl: img.proxyUrl,
        proxySize: img.proxySize,
        width: img.width,
        height: img.height,
        status: img.status || 'unreviewed',
        comment: img.comment || '',
        lastVotedAt: img.lastVotedAt,
        gdriveId: img.gdriveId || null,
        gdriveViewUrl: img.gdriveViewUrl || null,
      })),
    };

    res.json({ success: true, gallery: clientSafeProject });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/gallery/:token/vote
router.post('/:token/vote', (req, res) => {
  try {
    const { token } = req.params;
    const { imageId, status, comment, voterName = 'Client' } = req.body;

    const project = db.getProjectByToken(token);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Gallery not found' });
    }

    if (!imageId || !status) {
      return res.status(400).json({ success: false, error: 'Missing imageId or status' });
    }

    const result = db.updateImageVote(project.id, imageId, status, comment, voterName);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Image not found in gallery' });
    }

    // Real-time broadcast to both client gallery room and photographer dashboard room!
    const broadcastPayload = {
      type: 'VOTE_UPDATED',
      projectId: project.id,
      token: project.token,
      imageId,
      status,
      comment: result.image.comment,
      voterName,
      stats: result.project.stats,
    };

    socketHub.broadcastToRoom(`gallery:${token}`, broadcastPayload);
    socketHub.broadcastToRoom(`project:${project.id}`, broadcastPayload);

    res.json({
      success: true,
      image: result.image,
      stats: result.project.stats,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/gallery/:token/submit
router.post('/:token/submit', (req, res) => {
  try {
    const { token } = req.params;
    const { submissionNotes = '', clientName = '' } = req.body;

    const project = db.getProjectByToken(token);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Gallery not found' });
    }

    const updated = db.submitProjectSelection(project.id, submissionNotes);

    // Real-time alert to studio dashboard
    const broadcastPayload = {
      type: 'PROJECT_SUBMITTED',
      projectId: project.id,
      token: project.token,
      clientName: clientName || project.clientName,
      submittedAt: updated.submittedAt,
      submissionNotes,
      stats: updated.stats,
    };

    socketHub.broadcastToRoom(`gallery:${token}`, broadcastPayload);
    socketHub.broadcastToRoom(`project:${project.id}`, broadcastPayload);
    socketHub.broadcastAll({
      type: 'STUDIO_ALERT',
      message: `🎉 Client ${project.clientName} has finalized their selection! (${updated.stats.selected} photos shortlisted)`,
      projectId: project.id,
    });

    res.json({
      success: true,
      message: 'Selections submitted successfully!',
      project: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
