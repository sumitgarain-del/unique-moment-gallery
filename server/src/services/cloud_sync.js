import { db } from '../db.js';
import { socketHub } from './websocket.js';

class CloudSyncWorker {
  constructor() {
    this.timer = null;
    this.isPolling = false;
  }

  start(intervalMs = 4000) {
    if (this.timer) clearInterval(this.timer);
    // Initial run immediately: ensure all local projects are pushed to Render cloud
    setTimeout(() => {
      this.syncAllProjectsToCloud();
      this.pollActiveProjects();
    }, 1200);
    this.timer = setInterval(() => this.pollActiveProjects(), intervalMs);
    console.log(`[CloudSync] Background auto-sync started (polling every ${intervalMs / 1000}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncAllProjectsToCloud() {
    try {
      const settings = db.getSettings();
      if (!settings.cloudServerUrl) return;
      const cloudBase = settings.cloudServerUrl.replace(/\/$/, '');
      const projects = db.getProjects() || [];
      for (const project of projects) {
        if (!project.token) continue;
        await fetch(`${cloudBase}/api/cloud/sync-project`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project }),
          signal: AbortSignal.timeout(6000),
        }).catch(() => {});
      }
    } catch (e) {}
  }

  async pollActiveProjects() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const settings = db.getSettings();
      if (!settings.cloudServerUrl) return;

      const cloudBase = settings.cloudServerUrl.replace(/\/$/, '');
      const projects = db.getProjects() || [];

      for (const project of projects) {
        if (!project.token) continue;

        try {
          const url = `${cloudBase}/api/cloud/project/${project.token}/selection`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) {
            // Cloud gallery missing. Re-sync project immediately!
            console.log(`[CloudSync] Cloud gallery missing for "${project.title}". Re-syncing to cloud...`);
            await fetch(`${cloudBase}/api/cloud/sync-project`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project }),
              signal: AbortSignal.timeout(10000),
            }).catch(() => {});
            continue;
          }

          const data = await res.json();
          if (!data || !data.success) continue;

          let hasChanges = false;
          let newlySubmitted = false;

          if (data.status && data.status !== project.status) {
            hasChanges = true;
            if (data.status === 'submitted' && project.status !== 'submitted') {
              newlySubmitted = true;
            }
          }

          // Check if any image status or comments changed (supports selecting, deselecting, and commenting)
          const currentImages = project.images || [];
          const cloudMap = new Map((data.allImages || []).map((ci) => [ci.id, ci]));

          const updatedImages = currentImages.map((img) => {
            const cloudImg = cloudMap.get(img.id);
            if (cloudImg) {
              const currentStatus = img.status || 'unreviewed';
              const cloudStatus = cloudImg.status || 'unreviewed';
              const currentComment = img.comment || '';
              const cloudComment = cloudImg.comment || '';

              if (cloudStatus !== currentStatus || cloudComment !== currentComment) {
                hasChanges = true;
                return { ...img, status: cloudStatus, comment: cloudComment };
              }
            }
            return img;
          });

          if (hasChanges) {
            const updated = db.updateProject(project.id, {
              images: updatedImages,
              status: data.status === 'submitted' ? 'submitted' : project.status,
              submittedAt: data.submittedAt || project.submittedAt,
              submissionNotes: data.submissionNotes || project.submissionNotes,
            });

            console.log(`[CloudSync] Detected real-time updates for "${project.title}" from cloud! Status: ${updated.status}, Selected: ${updated.stats?.selected}`);

            // 1. Broadcast to specific project room
            socketHub.broadcastToRoom(`project:${project.id}`, {
              type: 'PROJECT_UPDATED',
              project: updated,
            });

            // 2. Broadcast to all screens (updates Dashboard cards instantly)
            socketHub.broadcastAll({
              type: 'PROJECT_UPDATED',
              project: updated,
            });

            if (newlySubmitted) {
              socketHub.broadcastToRoom(`project:${project.id}`, {
                type: 'PROJECT_SUBMITTED',
                projectId: project.id,
                token: project.token,
                submittedAt: data.submittedAt,
                stats: updated.stats,
              });

              // Broadcast high-priority Studio Alert to all connected photographer screens
              socketHub.broadcastAll({
                type: 'STUDIO_ALERT',
                message: `🎉 Client ${project.clientName} has finalized their selection! (${updated.stats.selected} photos shortlisted)`,
                projectId: project.id,
                clientName: project.clientName,
                selectedCount: updated.stats.selected,
              });
            } else {
              socketHub.broadcastToRoom(`project:${project.id}`, {
                type: 'VOTE_UPDATED',
                projectId: project.id,
                stats: updated.stats,
              });
              socketHub.broadcastAll({
                type: 'VOTE_UPDATED',
                projectId: project.id,
                stats: updated.stats,
              });
            }
          }
        } catch (pollErr) {
          // ignore network timeout
        }
      }
    } catch (err) {
      // ignore
    } finally {
      this.isPolling = false;
    }
  }
}

export const cloudSyncWorker = new CloudSyncWorker();
