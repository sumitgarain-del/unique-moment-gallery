import fs from 'fs';
import path from 'path';
import { config } from './config.js';

class Database {
  constructor() {
    this.dbFile = config.DB_FILE;
    this.settingsFile = config.SETTINGS_FILE;
    this.data = { projects: [] };
    this.settings = {
      studioName: 'Unique Moment',
      photographerEmail: 'contact@uniquemoment.com',
      customDomain: '', // e.g. https://gallery.uniquemoment.com
      cloudflareTunnelToken: '', // Cloudflare Zero Trust permanent tunnel token
      cloudServerUrl: 'https://unique-moment-gallery.onrender.com', // 24/7 Render cloud gallery server URL
      gdrive: {
        enabled: false,
        clientId: '',
        clientSecret: '',
        refreshToken: '',
        parentFolderId: '',
        status: 'unconfigured', // 'unconfigured' | 'connected' | 'mock'
      },
      exportSettings: {
        folderNameTemplate: 'Selected Images',
        copyRaws: true,
        copyJpegs: true,
        recursiveSearch: true,
      }
    };

    this.init();
  }

  init() {
    try {
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf8');
        this.data = JSON.parse(raw);
      } else {
        this.saveDatabase();
      }
    } catch (err) {
      console.error('[DB] Failed to load database, initializing new:', err.message);
      this.data = { projects: [] };
      this.saveDatabase();
    }

    try {
      if (fs.existsSync(this.settingsFile)) {
        const rawSettings = fs.readFileSync(this.settingsFile, 'utf8');
        this.settings = { ...this.settings, ...JSON.parse(rawSettings) };
      } else {
        this.saveSettings(this.settings);
      }
    } catch (err) {
      console.error('[DB] Failed to load settings, initializing defaults:', err.message);
      this.saveSettings(this.settings);
    }
  }

  saveDatabase() {
    try {
      const dataStr = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(this.dbFile, dataStr, 'utf8');
    } catch (err) {
      console.error('[DB] Error saving database:', err);
    }
  }

  saveSettings(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      const settingsStr = JSON.stringify(this.settings, null, 2);
      fs.writeFileSync(this.settingsFile, settingsStr, 'utf8');
      return this.settings;
    } catch (err) {
      console.error('[DB] Error saving settings:', err);
      return this.settings;
    }
  }

  getSettings() {
    return this.settings;
  }

  getProjects() {
    return this.data.projects.map((p) => this.computeProjectStats(p));
  }

  getProject(id) {
    const project = this.data.projects.find((p) => p.id === id);
    if (!project) return null;
    return this.computeProjectStats(project);
  }

  getProjectByToken(token) {
    const project = this.data.projects.find((p) => p.token === token);
    if (!project) return null;
    return this.computeProjectStats(project);
  }

  createProject(projectData) {
    const newProject = {
      id: projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: projectData.title || `${projectData.clientName} - ${projectData.shootType || 'Photoshoot'}`,
      clientName: projectData.clientName || 'Valued Client',
      clientEmail: projectData.clientEmail || '',
      eventDate: projectData.eventDate || new Date().toISOString().split('T')[0],
      shootType: projectData.shootType || 'Wedding',
      notes: projectData.notes || '',
      token: projectData.token || `gallery_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`,
      status: 'draft', // 'draft' | 'uploaded' | 'submitted'
      images: [],
      masterFolderPath: projectData.masterFolderPath || '',
      outputFolderPath: projectData.outputFolderPath || '',
      gdrive: {
        uploaded: false,
        folderId: null,
        folderUrl: null,
        syncedCount: 0,
      },
      submittedAt: null,
      submissionNotes: '',
      lastSyncResult: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.data.projects.unshift(newProject);
    this.saveDatabase();
    return this.computeProjectStats(newProject);
  }

  updateProject(id, updates) {
    const index = this.data.projects.findIndex((p) => p.id === id);
    if (index === -1) return null;

    this.data.projects[index] = {
      ...this.data.projects[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.saveDatabase();
    return this.computeProjectStats(this.data.projects[index]);
  }

  deleteProject(id) {
    const index = this.data.projects.findIndex((p) => p.id === id);
    if (index === -1) return false;

    // Remove proxy files folder if exists
    const project = this.data.projects[index];
    const proxyDir = path.resolve(config.PROXIES_DIR, project.id);
    if (fs.existsSync(proxyDir)) {
      try {
        fs.rmSync(proxyDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[DB] Failed to remove proxy folder for ${project.id}:`, err.message);
      }
    }

    this.data.projects.splice(index, 1);
    this.saveDatabase();
    return true;
  }

  addImagesToProject(id, newImages) {
    const project = this.data.projects.find((p) => p.id === id);
    if (!project) return null;

    project.images.push(...newImages);
    if (project.status === 'draft' && project.images.length > 0) {
      project.status = 'uploaded';
    }
    project.updatedAt = new Date().toISOString();
    this.saveDatabase();
    return this.computeProjectStats(project);
  }

  updateImageVote(projectId, imageId, voteStatus, comment = null, voterName = 'Client') {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) return null;

    const image = project.images.find((img) => img.id === imageId);
    if (!image) return null;

    image.status = voteStatus; // 'selected' | 'rejected' | 'unreviewed'
    if (comment !== null) {
      image.comment = comment;
    }
    image.lastModifiedBy = voterName;
    image.lastVotedAt = new Date().toISOString();
    project.updatedAt = new Date().toISOString();

    this.saveDatabase();
    return {
      project: this.computeProjectStats(project),
      image,
    };
  }

  submitProjectSelection(projectId, submissionNotes = '') {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) return null;

    project.status = 'submitted';
    project.submittedAt = new Date().toISOString();
    project.submissionNotes = submissionNotes;
    project.updatedAt = new Date().toISOString();

    this.saveDatabase();
    return this.computeProjectStats(project);
  }

  computeProjectStats(project) {
    const images = project.images || [];
    const total = images.length;
    const selected = images.filter((img) => img.status === 'selected').length;
    const rejected = images.filter((img) => img.status === 'rejected').length;
    const unreviewed = images.filter((img) => !img.status || img.status === 'unreviewed').length;

    let totalOriginalBytes = 0;
    let totalProxyBytes = 0;
    images.forEach((img) => {
      totalOriginalBytes += img.originalSize || 0;
      totalProxyBytes += img.proxySize || 0;
    });

    const bytesSaved = Math.max(0, totalOriginalBytes - totalProxyBytes);
    const savingsPercent = totalOriginalBytes > 0 
      ? Math.round((bytesSaved / totalOriginalBytes) * 100) 
      : 0;

    return {
      ...project,
      stats: {
        total,
        selected,
        rejected,
        unreviewed,
        totalOriginalBytes,
        totalProxyBytes,
        bytesSaved,
        savingsPercent,
      }
    };
  }
}

export const db = new Database();
