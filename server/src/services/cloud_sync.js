import { db } from '../db.js';
import { socketHub } from './websocket.js';

class CloudSyncWorker {
  constructor() {
    this.timer = null;
    this.isPolling = false;
  }

  start(intervalMs = 3000) {
    if (this.timer) clearInterval(this.timer);
    // Initial poll immediately
    setTimeout(() => {
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
      const deletedTokens = new Set(db.data.deletedTokens || []);
      const deletedIds = new Set(db.data.deletedProjectIds || []);

      for (const project of projects) {
        if (!project.token) continue;
        if (deletedTokens.has(project.token) || deletedIds.has(project.id)) continue;

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
      const deletedTokens = new Set(db.data.deletedTokens || []);
      const deletedIds = new Set(db.data.deletedProjectIds || []);

      for (const project of projects) {
        if (!project.token) continue;
        if (deletedTokens.has(project.token) || deletedIds.has(project.id)) continue;

        const token = project.token;
        try {
          const url = `${cloudBase}/api/cloud/project/${token}/selection`;
          const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) continue;

            const data = await res.json();
            if (!data || !data.success || !Array.isArray(data.allImages)) continue;

            let hasChanges = false;
            let newlySubmitted = false;
            let needsHealCloud = false;

            if (data.status && data.status !== project.status) {
              hasChanges = true;
              if (data.status === 'submitted' && project.status !== 'submitted') {
                newlySubmitted = true;
              }
            }

            const currentImages = project.images || [];

            // Multi-key index to match images across cloud and local:
            // 1. By UUID ID
            // 2. By Subfolder + Filename
            // 3. By Filename
            const cloudById = new Map();
            const cloudBySubAndName = new Map();
            const cloudByName = new Map();

            for (const ci of data.allImages) {
              if (ci.id) cloudById.set(ci.id, ci);
              const sub = ci.subfolder || (ci.proxyFilename && ci.proxyFilename.includes('_') ? ci.proxyFilename.split('_')[0] : '');
              if (sub && ci.originalName) {
                cloudBySubAndName.set(`${sub}_${ci.originalName}`.toLowerCase(), ci);
              }
              if (ci.originalName) {
                cloudByName.set(ci.originalName.toLowerCase(), ci);
              }
            }

            const findCloudImg = (img) => {
              if (img.id && cloudById.has(img.id)) return cloudById.get(img.id);
              const sub = img.subfolder || (img.proxyFilename && img.proxyFilename.includes('_') ? img.proxyFilename.split('_')[0] : '');
              const subKey = sub && img.originalName ? `${sub}_${img.originalName}`.toLowerCase() : null;
              if (subKey && cloudBySubAndName.has(subKey)) return cloudBySubAndName.get(subKey);
              if (img.originalName && cloudByName.has(img.originalName.toLowerCase())) {
                return cloudByName.get(img.originalName.toLowerCase());
              }
              return null;
            };

            const localSelectedCount = currentImages.filter((i) => i.status === 'selected').length;
            // Cold start detection: when cloud suddenly reports 0 while local had > 5 selections and no submission notes
            const isColdStartWipe = (data.selectedCount === 0 && localSelectedCount > 5 && !data.submittedAt && !data.submissionNotes);

            const updatedImages = currentImages.map((img) => {
              const cloudImg = findCloudImg(img);
              if (cloudImg) {
                const currentStatus = img.status || 'unreviewed';
                const cloudStatus = cloudImg.status || 'unreviewed';
                const currentComment = img.comment || '';
                const cloudComment = cloudImg.comment || '';

                if (cloudStatus !== currentStatus || cloudComment !== currentComment) {
                  // Safeguard against complete serverless cold-start data loss
                  if (isColdStartWipe && currentStatus === 'selected' && cloudStatus === 'unreviewed') {
                    needsHealCloud = true;
                    return img;
                  }

                  // Live client vote: selection, deselection, or comment
                  hasChanges = true;
                  return {
                    ...img,
                    status: cloudStatus,
                    comment: cloudComment,
                    lastVotedAt: cloudImg.lastVotedAt || new Date().toISOString(),
                    lastModifiedBy: cloudImg.lastModifiedBy || 'Client',
                  };
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

              console.log(`[CloudSync] Live update for "${project.title}": Status=${updated.status}, Selected=${updated.stats?.selected}`);

              // Real-time broadcast to all local screens
              socketHub.broadcastToRoom(`project:${project.id}`, {
                type: 'PROJECT_UPDATED',
                project: updated,
              });
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

            // If cloud lost data on cold-start, auto-heal cloud immediately
            if (needsHealCloud) {
              console.log(`[CloudSync] Auto-healing cloud gallery for "${project.title}"...`);
              fetch(`${cloudBase}/api/cloud/sync-project`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: db.getProject(project.id) || project }),
                signal: AbortSignal.timeout(8000),
              }).catch(() => {});
            }

          } catch (pollErr) {
            // ignore network glitch
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
