import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { db } from './db.js';
import { socketHub } from './services/websocket.js';

import projectsRouter from './routes/projects.js';
import uploadRouter from './routes/upload.js';
import galleryRouter from './routes/gallery.js';
import syncRouter from './routes/sync.js';
import foldersRouter from './routes/folders.js';
import gdriveRouter from './routes/gdrive.js';
import networkRouter from './routes/network.js';
import cloudRouter from './routes/cloud.js';
import { tunnelService } from './services/tunnel.js';
import { cloudSyncWorker } from './services/cloud_sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Enable CORS for frontend client
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve proxy preview images statically, with automatic Google Drive streaming and disk caching
app.get(['/api/proxies/:projectId/:filename', '/proxies/:projectId/:filename'], async (req, res) => {
  try {
    const { projectId, filename } = req.params;
    const projectDir = path.resolve(config.PROXIES_DIR, projectId);
    const localFile = path.resolve(projectDir, filename);

    // 1. If cached on local disk, serve immediately
    if (fs.existsSync(localFile)) {
      return res.sendFile(localFile);
    }

    // 2. Find image in database
    const project = db.getProject(projectId);
    const img = project?.images?.find(
      (i) => i.proxyFilename === filename || i.originalName === filename || i.stem === filename.replace(/\.[^/.]+$/, '')
    );

    if (img && img.gdriveId) {
      // 3. Fetch from Google Drive, cache to disk, and stream to client
      try {
        const driveRes = await fetch(`https://lh3.googleusercontent.com/d/${img.gdriveId}`, {
          signal: AbortSignal.timeout(12000),
        });

        if (driveRes.ok) {
          const contentType = driveRes.headers.get('content-type') || 'image/webp';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400');

          const buffer = Buffer.from(await driveRes.arrayBuffer());

          // Save to local cache in background (so next view is instant offline)
          try {
            if (!fs.existsSync(projectDir)) {
              fs.mkdirSync(projectDir, { recursive: true });
            }
            fs.writeFile(localFile, buffer, () => {});
          } catch (e) {}

          return res.end(buffer);
        }
      } catch (e) {
        console.warn(`[Proxy] Google Drive stream error for ${filename}:`, e.message);
      }
    }

    // 4. Send 404 immediately so browser never hangs
    res.status(404).send('Proxy not found');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.use(['/api/proxies', '/proxies'], express.static(config.PROXIES_DIR));

// API Routes (Mounted under both /api/* and direct /* so all rewrite styles work seamlessly)
app.use('/api/projects', projectsRouter);
app.use('/projects', projectsRouter);
app.use('/api/projects', uploadRouter);
app.use('/projects', uploadRouter);
app.use('/api/projects', syncRouter);
app.use('/projects', syncRouter);
app.use('/api/gallery', galleryRouter);
app.use('/gallery', galleryRouter);
app.use('/api/folders', foldersRouter);
app.use('/folders', foldersRouter);
app.use('/api/gdrive', gdriveRouter);
app.use('/gdrive', gdriveRouter);
app.use('/api/network', networkRouter);
app.use('/network', networkRouter);
app.use('/api/cloud', cloudRouter);
app.use('/cloud', cloudRouter);

// Settings route
app.get(['/api/settings', '/settings'], (req, res) => {
  res.json({ success: true, settings: db.getSettings() });
});

app.post(['/api/settings', '/settings'], (req, res) => {
  const updated = db.saveSettings(req.body);
  res.json({ success: true, settings: updated });
});

// Serve client production build if available
const candidateDistPaths = [
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
];
const clientDist = candidateDistPaths.find((p) => fs.existsSync(p));

if (clientDist) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    } else {
      res.status(404).json({ success: false, error: 'Not found' });
    }
  });
}

// Start standalone server only when NOT running on Vercel serverless
if (!config.IS_VERCEL) {
  // Initialize WebSocket server
  socketHub.init(server);

  server.listen(config.PORT, () => {
    console.log(`=======================================================`);
    console.log(`📸 STUDIO SYNC BACKEND RUNNING ON http://localhost:${config.PORT}`);
    console.log(`⚡ WebSocket Server active on ws://localhost:${config.PORT}/ws`);
    console.log(`=======================================================`);

    // Automatically start worldwide public HTTPS tunnel for client access anywhere
    tunnelService.startTunnel().then((res) => {
      console.log(`🌍 PUBLIC WORLDWIDE CLIENT ACCESS ONLINE: ${res.url}`);
    }).catch((err) => {
      console.warn(`[Tunnel] Auto-start note: ${err.message}`);
    });

    // Start background auto-sync to pull client selections from cloud in real-time
    cloudSyncWorker.start(4000);

    // Automatically restore/sync projects from cloud backup
    db.syncWithCloudBackup();
  });
} else {
  // Restore/sync from cloud backup on serverless function boot
  db.syncWithCloudBackup();
}

export { app, server };
export default app;
