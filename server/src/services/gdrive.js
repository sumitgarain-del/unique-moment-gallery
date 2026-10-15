import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { db } from '../db.js';

export class GoogleDriveService {
  /**
   * Get Google Drive client instance if configured
   */
  static getDriveClient() {
    const settings = db.getSettings();
    const gdrive = settings.gdrive || {};

    if (!gdrive.enabled) {
      return null;
    }

    try {
      if (gdrive.clientId && gdrive.clientSecret && gdrive.refreshToken) {
        // Pure OAuth2 authentication (Full Google Drive storage quota)
        const oauth2Client = new google.auth.OAuth2(
          gdrive.clientId,
          gdrive.clientSecret
        );
        oauth2Client.setCredentials({ refresh_token: gdrive.refreshToken });
        return google.drive({ version: 'v3', auth: oauth2Client });
      }
    } catch (err) {
      console.error('[GDrive] OAuth initialization error:', err.message);
      return null;
    }
    return null;

    }

  /**
   * Generates Google OAuth Consent URL
   */
  static generateAuthUrl(clientId, clientSecret, redirectUri) {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
    });
  }

  /**
   * Exchanges authorization code for tokens
   */
  static async exchangeCodeForToken(clientId, clientSecret, redirectUri, code) {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  /**
   * Test connection to Google Drive
   */
  static async testConnection() {
    const drive = this.getDriveClient();
    if (!drive) {
      return {
        connected: false,
        mode: 'mock',
        message: 'Google Drive credentials not set. Running in Local High-Speed Proxy Mode.',
      };
    }

    try {
      const res = await drive.about.get({ fields: 'user, storageQuota' });
      return {
        connected: true,
        mode: 'live',
        user: res.data.user?.displayName || res.data.user?.emailAddress,
        email: res.data.user?.emailAddress,
        storageQuota: res.data.storageQuota,
        message: 'Connected to Google Drive successfully!',
      };
    } catch (err) {
      return {
        connected: false,
        mode: 'error',
        message: `Google Drive connection error: ${err.message}`,
      };
    }
  }

  /**
   * Creates a dedicated folder for the project on Google Drive
   */
  static async createProjectFolder(projectName, parentFolderId = null) {
    const drive = this.getDriveClient();
    if (!drive) {
      // Mock / local mode folder ID
      return {
        folderId: `mock_folder_${Date.now()}`,
        folderUrl: `https://drive.google.com/drive/folders/mock_project_${encodeURIComponent(projectName)}`,
        mode: 'mock',
      };
    }

    try {
      const fileMetadata = {
        name: `Studio Sync - ${projectName}`,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parentFolderId) {
        fileMetadata.parents = [parentFolderId];
      }

      const file = await drive.files.create({
        resource: fileMetadata,
        fields: 'id, webViewLink',
      });

      // Grant anyone with link can view (or keep restricted)
      try {
        await drive.permissions.create({
          fileId: file.data.id,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        });
      } catch (permErr) {
        console.warn('[GDrive] Permission setting note:', permErr.message);
      }

      return {
        folderId: file.data.id,
        folderUrl: file.data.webViewLink,
        mode: 'live',
      };
    } catch (err) {
      console.error('[GDrive] Error creating folder:', err.message);
      throw err;
    }
  }

  /**
   * Get existing project folder or create a new one
   */
  static async getOrCreateProjectFolder(project) {
    if (project?.gdrive?.folderId) {
      return {
        folderId: project.gdrive.folderId,
        folderUrl: project.gdrive.folderUrl,
      };
    }
    const settings = db.getSettings();
    const parentFolderId = settings.gdrive?.parentFolderId || null;
    return await this.createProjectFolder(project.title, parentFolderId);
  }

  /**
   * Permanently deletes a project folder and its contents from Google Drive
   */
  static async deleteProjectFolder(folderId) {
    const drive = this.getDriveClient();
    if (!drive || !folderId || folderId.startsWith('mock_')) return false;
    try {
      await drive.files.delete({ fileId: folderId });
      console.log(`[GDrive] Successfully deleted project folder ${folderId} from Google Drive.`);
      return true;
    } catch (err) {
      console.warn(`[GDrive] Warning deleting project folder ${folderId}:`, err.message);
      return false;
    }
  }

  /**
   * Upload a single proxy image directly to Google Drive
   */
  static async uploadSingleProxy({ img, folderId }) {
    const drive = this.getDriveClient();
    if (!drive || !fs.existsSync(img.proxyPath)) {
      return null;
    }
    try {
      const media = {
        mimeType: 'image/webp',
        body: fs.createReadStream(img.proxyPath),
      };
      const fileMetadata = {
        name: img.proxyFilename,
        parents: [folderId],
      };
      const driveFile = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: 'id, webViewLink, thumbnailLink',
      });

      // Grant anyone with link read access so Google CDN works seamlessly
      try {
        await drive.permissions.create({
          fileId: driveFile.data.id,
          requestBody: { role: 'reader', type: 'anyone' },
        });
      } catch (permErr) {}

      return {
        id: driveFile.data.id,
        webViewLink: driveFile.data.webViewLink,
      };
    } catch (err) {
      console.warn(`[GDrive] Upload single file error for ${img.proxyFilename}:`, err.message);
      return null;
    }
  }

  /**
   * Uploads project proxies to Google Drive
   */
  static async uploadProxies({ project, onProgress }) {
    const drive = this.getDriveClient();
    const isLive = Boolean(drive);

    let folderId = project.gdrive?.folderId;
    let folderUrl = project.gdrive?.folderUrl;

    if (!folderId) {
      const settings = db.getSettings();
      const parentFolderId = settings.gdrive?.parentFolderId || null;
      const folderRes = await this.createProjectFolder(project.title, parentFolderId);
      folderId = folderRes.folderId;
      folderUrl = folderRes.folderUrl;
    }

    const uploadedProxies = [];
    const images = project.images || [];
    let completed = 0;

    for (const img of images) {
      if (img.gdriveId) {
        completed++;
        uploadedProxies.push({
          imageId: img.id,
          gdriveId: img.gdriveId,
          gdriveViewUrl: img.gdriveViewUrl,
        });
        continue;
      }

      if (isLive && fs.existsSync(img.proxyPath)) {
        try {
          const media = {
            mimeType: 'image/webp',
            body: fs.createReadStream(img.proxyPath),
          };
          const fileMetadata = {
            name: img.proxyFilename,
            parents: [folderId],
          };

          const driveFile = await drive.files.create({
            resource: fileMetadata,
            media,
            fields: 'id, webViewLink, thumbnailLink',
          });

          try {
            await drive.permissions.create({
              fileId: driveFile.data.id,
              requestBody: { role: 'reader', type: 'anyone' },
            });
          } catch (permErr) {}

          img.gdriveId = driveFile.data.id;
          img.gdriveViewUrl = driveFile.data.webViewLink;

          uploadedProxies.push({
            imageId: img.id,
            gdriveId: driveFile.data.id,
            gdriveViewUrl: driveFile.data.webViewLink,
          });
        } catch (err) {
          console.error(`[GDrive] Error uploading ${img.proxyFilename}:`, err.message);
        }
      } else {
        // Mock mode progress simulation
        img.gdriveId = `gdrive_mock_${img.id}`;
        img.gdriveViewUrl = `https://drive.google.com/file/d/mock_${img.id}/view`;
        uploadedProxies.push({
          imageId: img.id,
          gdriveId: img.gdriveId,
          gdriveViewUrl: img.gdriveViewUrl,
        });
        // Small delay for natural UI feel if in mock mode
        await new Promise((r) => setTimeout(r, 40));
      }

      completed++;
      if (onProgress) {
        onProgress({
          completed,
          total: images.length,
          percent: Math.round((completed / images.length) * 100),
          currentFile: img.proxyFilename,
        });
      }
    }

    // Update project in DB
    db.updateProject(project.id, {
      images: project.images,
      gdrive: {
        uploaded: true,
        folderId,
        folderUrl,
        syncedCount: uploadedProxies.length,
        syncedAt: new Date().toISOString(),
        mode: isLive ? 'live' : 'mock',
      },
    });

    return {
      folderId,
      folderUrl,
      mode: isLive ? 'live' : 'mock',
      totalUploaded: uploadedProxies.length,
    };
  }
}
