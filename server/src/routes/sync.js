import express from 'express';
import { db } from '../db.js';
import { MatcherService } from '../services/matcher.js';
import { CopierService } from '../services/copier.js';

const router = express.Router();

// POST /api/projects/:id/sync/preview
router.post('/:id/sync/preview', (req, res) => {
  try {
    const { id } = req.params;
    const { masterFolderPath, recursive = true, preference = 'all' } = req.body;

    const project = db.getProject(id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!masterFolderPath) {
      return res.status(400).json({ success: false, error: 'Master folder path is required' });
    }

    const selectedImages = (project.images || []).filter((img) => img.status === 'selected');

    if (selectedImages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images have been selected by the client yet.',
      });
    }

    const matchReport = MatcherService.matchFiles({
      selectedImages,
      masterFolderPath,
      recursive,
      preference,
    });

    res.json({ success: true, report: matchReport });
  } catch (err) {
    console.error('[Sync Preview] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects/:id/sync/execute
router.post('/:id/sync/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      masterFolderPath,
      outputFolderPath,
      folderName = 'Selected Images',
      recursive = true,
      preference = 'all',
    } = req.body;

    const project = db.getProject(id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!masterFolderPath || !outputFolderPath) {
      return res.status(400).json({
        success: false,
        error: 'Both Master Folder and Output Directory paths are required',
      });
    }

    // Save folder paths to project for future convenience
    db.updateProject(id, {
      masterFolderPath,
      outputFolderPath,
    });

    const selectedImages = (project.images || []).filter((img) => img.status === 'selected');
    if (selectedImages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images have been selected by the client yet.',
      });
    }

    // Step 1: Match files
    const matchReport = MatcherService.matchFiles({
      selectedImages,
      masterFolderPath,
      recursive,
      preference,
    });

    if (matchReport.matchedPairs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Could not find any matching master files in the provided Master Folder.',
        report: matchReport,
      });
    }

    // Step 2: Copy matched files
    const copyResult = await CopierService.copyMatchedFiles({
      projectId: id,
      matchedPairs: matchReport.matchedPairs,
      outputDirectory: outputFolderPath,
      folderName,
      projectTitle: project.title,
      clientName: project.clientName,
    });

    // Update project with last sync result
    const updatedProject = db.updateProject(id, {
      lastSyncResult: {
        timestamp: new Date().toISOString(),
        targetFolder: copyResult.targetFolder,
        copiedCount: copyResult.copiedCount,
        totalBytesCopied: copyResult.totalBytesCopied,
      },
    });

    res.json({
      success: true,
      message: `Successfully synced and copied ${copyResult.copiedCount} master files!`,
      matchReport,
      copyResult,
      project: updatedProject,
    });
  } catch (err) {
    console.error('[Sync Execute] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects/:id/sync/open-folder
router.post('/:id/sync/open-folder', async (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ success: false, error: 'folderPath is required' });
    }

    await CopierService.openInExplorer(folderPath);
    res.json({ success: true, message: 'Opened folder in Windows Explorer' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
