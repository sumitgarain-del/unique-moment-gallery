import { db } from '../db.js';
import { socketHub } from './websocket.js';

class CloudSyncWorker {
  constructor() {
    this.timer = null;
    this.isPolling = false;
  }

  start(intervalMs = 4000) {
    if (this.timer) clearInterval(this.timer);
    // Initial run immediately after 1 second
    setTimeout(() => this.pollActiveProjects(), 1000);
    this.timer = setInterval(() => this.pollActiveProjects(), intervalMs);
    console.log(`[CloudSync] Background auto-sync started (polling every ${intervalMs / 1000}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
          const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
          if (!res.ok) continue;

          const data = await res.json();
          if (!data || !data.success) continue;

          let hasChanges = false;
          let newlySubmitted = false;

          if (data.status === 'submitted' && project.status !== 'submitted') {
            newlySubmitted = true;
            hasChanges = true;
          }

          // Check if any image status or comments changed
          const currentImages = project.images || [];
          const updatedImages = currentImages.map((img) => {
            const cloudImg = (data.allImages || []).find(
              (ci) => ci.id === img.id || ci.originalName === img.originalName
            );
            if (cloudImg && cloudImg.status && cloudImg.status !== 'unreviewed' && cloudImg.status !== img.status) {
              hasChanges = true;
              return { ...img, status: cloudImg.status, comment: cloudImg.comment || img.comment };
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

            console.log(`[CloudSync] Detected real-time updates for "${project.title}" from cloud! Status: ${updated.status}`);

            // 1. Broadcast to specific project room
            socketHub.broadcastToRoom(`project:${project.id}`, {
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

              // 2. Broadcast high-priority Studio Alert to all connected photographer screens
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
