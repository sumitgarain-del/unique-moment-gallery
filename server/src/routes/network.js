import express from 'express';
import QRCode from 'qrcode';
import { tunnelService } from '../services/tunnel.js';

const router = express.Router();

// GET /api/network/qr-image/:token.png
router.get('/qr-image/:token.png', async (req, res) => {
  try {
    const { token } = req.params;
    const info = await tunnelService.getShareInfo(token);
    const link = info.primaryLink || info.publicLink || info.localLink;

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    QRCode.toFileStream(res, link, {
      width: 512,
      margin: 2,
      color: {
        dark: '#0e1015',
        light: '#ffffff',
      },
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /api/network/share-info?token=...
router.get('/share-info', async (req, res) => {
  try {
    const { token } = req.query;
    const info = await tunnelService.getShareInfo(token);
    res.json({ success: true, info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/network/tunnel/start
router.post('/tunnel/start', async (req, res) => {
  try {
    const result = await tunnelService.startTunnel();
    const { token } = req.body;
    const info = await tunnelService.getShareInfo(token);
    res.json({ success: true, result, info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/network/tunnel/stop
router.post('/tunnel/stop', async (req, res) => {
  try {
    const result = await tunnelService.stopTunnel();
    const { token } = req.body;
    const info = await tunnelService.getShareInfo(token);
    res.json({ success: true, result, info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
