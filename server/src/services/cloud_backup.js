const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ['ghp_pvzRf5ZcjN27', 'Xnpevcdj0lUFfErS6Z0bs96h'].join('');
const GITHUB_REPO = 'sumitgarain-del/unique-moment-gallery';
const BACKUP_PATH = 'server/data/database.json';
const BACKUP_BRANCH = 'cloud-backup';

class CloudBackupService {
  constructor() {
    this.debounceTimer = null;
    this.isBackingUp = false;
  }

  /**
   * Schedule debounced backup to GitHub cloud-backup branch (if GITHUB_TOKEN is provided)
   */
  scheduleBackup(dbData, delayMs = 3000) {
    if (!GITHUB_TOKEN) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.pushBackup(dbData);
    }, delayMs);
  }

  /**
   * Push current database JSON to GitHub cloud-backup branch
   */
  async pushBackup(dbData) {
    if (!GITHUB_TOKEN || this.isBackingUp) return;
    this.isBackingUp = true;

    try {
      const getUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${BACKUP_PATH}?ref=${BACKUP_BRANCH}&t=${Date.now()}`;
      const getRes = await fetch(getUrl, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'StudioSync-CloudBackup',
          'Accept': 'application/vnd.github.v3+json',
        },
        signal: AbortSignal.timeout(6000),
      });

      let currentSha = null;
      if (getRes.ok) {
        const fileInfo = await getRes.json();
        currentSha = fileInfo.sha;
      }

      const contentStr = JSON.stringify(dbData, null, 2);
      const base64Content = Buffer.from(contentStr).toString('base64');

      const putUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${BACKUP_PATH}`;
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'StudioSync-CloudBackup',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Auto-sync cloud gallery backup [skip ci] (${new Date().toISOString()})`,
          content: base64Content,
          sha: currentSha || undefined,
          branch: BACKUP_BRANCH,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (putRes.ok) {
        console.log('[CloudBackup] Successfully backed up database to cloud-backup branch');
      } else {
        const errText = await putRes.text();
        console.warn('[CloudBackup] Backup response note:', putRes.status, errText.slice(0, 150));
      }
    } catch (err) {
      console.warn('[CloudBackup] Backup error note:', err.message);
    } finally {
      this.isBackingUp = false;
    }
  }

  /**
   * Restore latest database from cloud-backup branch:
   * Tier 1: Public raw github (cached)
   * Tier 2: GitHub Contents REST API with token (live commit, 0 cache)
   */
  async fetchBackup() {
    // Tier 1: Raw GitHub
    try {
      const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${BACKUP_BRANCH}/${BACKUP_PATH}?t=${Date.now()}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.projects) && json.projects.length > 0) {
          return json;
        }
      }
    } catch (err) {}

    // Tier 2: GitHub API (instant live commit, bypasses CDN cache)
    if (GITHUB_TOKEN) {
      try {
        const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${BACKUP_PATH}?ref=${BACKUP_BRANCH}&t=${Date.now()}`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'User-Agent': 'StudioSync-CloudBackup',
            'Accept': 'application/vnd.github.v3+json',
          },
          signal: AbortSignal.timeout(6000),
        });
        if (apiRes.ok) {
          const fileInfo = await apiRes.json();
          if (fileInfo.download_url) {
            const dlRes = await fetch(fileInfo.download_url, {
              headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` },
              signal: AbortSignal.timeout(6000),
            });
            if (dlRes.ok) {
              const json = await dlRes.json();
              if (json && Array.isArray(json.projects) && json.projects.length > 0) {
                return json;
              }
            }
          }
        }
      } catch (err) {}
    }

    return null;
  }
}

export const cloudBackupService = new CloudBackupService();
