import express from 'express';
import cors from 'cors';
import { db } from '../server/src/db.js';
import galleryRouter from '../server/src/routes/gallery.js';
import cloudRouter from '../server/src/routes/cloud.js';

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Dual routing so both /api/gallery and /gallery work seamlessly
app.use('/api/gallery', galleryRouter);
app.use('/gallery', galleryRouter);
app.use('/api/cloud', cloudRouter);
app.use('/cloud', cloudRouter);

// Proxy image handler: redirect to Google Drive
app.get(['/api/proxies/:projectId/:filename', '/proxies/:projectId/:filename'], (req, res) => {
  const { projectId, filename } = req.params;
  const project = db.getProject(projectId);
  const img = project?.images?.find(
    (i) => i.proxyFilename === filename || i.originalName === filename || i.stem === filename.replace(/\.[^/.]+$/, '')
  );
  if (img && img.gdriveId) {
    return res.redirect(302, `https://lh3.googleusercontent.com/d/${img.gdriveId}`);
  }
  res.status(404).send('Proxy not found');
});

// Lightweight projects API without native sharp/compressor dependencies
const projectsRouter = express.Router();
projectsRouter.get('/', (req, res) => {
  res.json({ success: true, projects: db.getProjects() });
});
projectsRouter.get('/:id', (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ success: false, error: 'Project not found' });
  res.json({ success: true, project: p });
});

app.use('/api/projects', projectsRouter);
app.use('/projects', projectsRouter);

app.get(['/api/settings', '/settings'], (req, res) => {
  res.json({ success: true, settings: db.getSettings() });
});

// Restore database from cloud backup ONLY if empty
if (!db.data.projects || db.data.projects.length === 0) {
  db.syncWithCloudBackup();
}

export default app;
