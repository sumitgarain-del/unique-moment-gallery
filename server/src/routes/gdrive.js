import express from 'express';
import { db } from '../db.js';
import { GoogleDriveService } from '../services/gdrive.js';
import { socketHub } from '../services/websocket.js';

const router = express.Router();

// GET /api/gdrive/status
router.get('/status', async (req, res) => {
  try {
    const status = await GoogleDriveService.testConnection();
    const settings = db.getSettings();
    res.json({
      success: true,
      status,
      configured: Boolean(settings.gdrive?.enabled),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/gdrive/settings
router.post('/settings', (req, res) => {
  try {
    const { gdrive } = req.body;
    if (!gdrive) {
      return res.status(400).json({ success: false, error: 'gdrive settings required' });
    }

    const currentSettings = db.getSettings();
    const updated = db.saveSettings({
      gdrive: { ...currentSettings.gdrive, ...gdrive },
    });
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/gdrive/auth-url
router.post('/auth-url', (req, res) => {
  try {
    const settings = db.getSettings();
    const clientId = req.body.clientId || settings.gdrive?.clientId;
    const clientSecret = req.body.clientSecret || settings.gdrive?.clientSecret;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Both Client ID and Client Secret are required to generate Google Auth URL',
      });
    }

    // Save clientId and clientSecret
    db.saveSettings({
      gdrive: {
        ...settings.gdrive,
        clientId,
        clientSecret,
      },
    });

    const protocol = req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/gdrive/callback`;

    const authUrl = GoogleDriveService.generateAuthUrl(clientId, clientSecret, redirectUri);
    res.json({ success: true, authUrl, redirectUri });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/gdrive/callback
router.get('/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.send(`<h2>Google Login Cancelled</h2><p>${error}</p><a href="/">Return to Studio Sync</a>`);
    }

    if (!code) {
      return res.status(400).send('Authorization code missing');
    }

    const settings = db.getSettings();
    const { clientId, clientSecret } = settings.gdrive || {};

    const protocol = req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/gdrive/callback`;

    const tokens = await GoogleDriveService.exchangeCodeForToken(clientId, clientSecret, redirectUri, code);

    // Save tokens in database
    db.saveSettings({
      gdrive: {
        ...settings.gdrive,
        enabled: true,
        refreshToken: tokens.refresh_token || settings.gdrive?.refreshToken,
        status: 'connected',
      },
    });

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Drive Connected</title>
          <style>
            body { font-family: -apple-system, sans-serif; background: #0f1115; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background: #181c25; padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); max-width: 450px; }
            h2 { color: #34d399; margin-bottom: 8px; }
            p { color: #9ca3af; font-size: 14px; margin-bottom: 24px; }
            a { background: #e11d48; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>🎉 Google Drive Connected Successfully!</h2>
            <p>Studio Sync is now linked to your Google Drive account. You can close this window or return to the app.</p>
            <a href="/">Return to Studio Sync</a>
          </div>
          <script>
            setTimeout(() => { window.location.href = '/'; }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[GDrive Callback] Error:', err);
    res.status(500).send(`<h2>Connection Failed</h2><p>${err.message}</p><a href="/">Return to Studio Sync</a>`);
  }
});

// POST /api/projects/:id/gdrive/upload
router.post('/upload/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProject(id);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!project.images || project.images.length === 0) {
      return res.status(400).json({ success: false, error: 'Project has no proxy images to sync' });
    }

    const result = await GoogleDriveService.uploadProxies({
      project,
      onProgress: (progress) => {
        socketHub.broadcastToRoom(`project:${id}`, {
          type: 'GDRIVE_UPLOAD_PROGRESS',
          ...progress,
        });
      },
    });

    // Auto sync updated project with Google Drive IDs to Render
    const settings = db.getSettings();
    if (settings.cloudServerUrl) {
      try {
        const cloudUrl = settings.cloudServerUrl.replace(/\/$/, '') + '/api/cloud/sync-project';
        fetch(cloudUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: db.getProject(id) }),
        }).catch((e) => console.warn('[Cloud] GDrive auto-sync note:', e.message));
      } catch (e) {}
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('[GDrive Upload] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
