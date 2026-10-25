const API_BASE = '/api';

export async function fetchJson(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP error ${response.status}`);
  }
  return data;
}

// Projects API
export async function getProjects() {
  const res = await fetchJson('/projects');
  return res.projects;
}

export async function getProject(id) {
  const res = await fetchJson(`/projects/${id}`);
  return res.project;
}

export async function createProject(data) {
  const res = await fetchJson('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.project;
}

export async function updateProject(id, updates) {
  const res = await fetchJson(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return res.project;
}

export async function deleteProject(id) {
  return await fetchJson(`/projects/${id}`, {
    method: 'DELETE',
  });
}

// Bulk Upload & Folder Import API
export async function importFolder(projectId, folderPath, recursive = true) {
  return await fetchJson(`/projects/${projectId}/import-folder`, {
    method: 'POST',
    body: JSON.stringify({ folderPath, recursive }),
  });
}

export async function uploadPhotos(projectId, files, onProgress = null) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('photos', file, file.name);
    formData.append('relativePaths', file.webkitRelativePath || '');
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/projects/${projectId}/upload`);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json.success) {
          resolve(json);
        } else {
          reject(new Error(json.error || `Upload failed with status ${xhr.status}`));
        }
      } catch (err) {
        reject(new Error('Invalid response from server'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

// Gallery API (Client Public View)
export async function getGallery(token) {
  const res = await fetchJson(`/gallery/${token}`);
  return res.gallery;
}

export async function voteImage(token, imageId, status, comment = null, voterName = 'Client') {
  return await fetchJson(`/gallery/${token}/vote`, {
    method: 'POST',
    body: JSON.stringify({ imageId, status, comment, voterName }),
  });
}

export async function submitGallery(token, submissionNotes, clientName, selectedImageIds = []) {
  return await fetchJson(`/gallery/${token}/submit`, {
    method: 'POST',
    body: JSON.stringify({ submissionNotes, clientName, selectedImageIds }),
  });
}

export async function reopenGallery(token) {
  return await fetchJson(`/gallery/${token}/reopen`, {
    method: 'POST',
  });
}

export async function resetProjectSelections(projectId) {
  return await fetchJson(`/projects/${projectId}/reset-selections`, {
    method: 'POST',
  });
}

export async function reopenProject(projectId) {
  return await fetchJson(`/projects/${projectId}/reopen`, {
    method: 'POST',
  });
}

// Local Sync API (Phase 3: The Magic Feature)
export async function previewSync(projectId, { masterFolderPath, recursive = true, preference = 'all' }) {
  const res = await fetchJson(`/projects/${projectId}/sync/preview`, {
    method: 'POST',
    body: JSON.stringify({ masterFolderPath, recursive, preference }),
  });
  return res.report;
}

export async function executeSync(projectId, {
  masterFolderPath,
  outputFolderPath,
  folderName = 'Selected Images',
  recursive = true,
  preference = 'all',
}) {
  return await fetchJson(`/projects/${projectId}/sync/execute`, {
    method: 'POST',
    body: JSON.stringify({
      masterFolderPath,
      outputFolderPath,
      folderName,
      recursive,
      preference,
    }),
  });
}

export async function openFolderInExplorer(projectId, folderPath) {
  return await fetchJson(`/projects/${projectId}/sync/open-folder`, {
    method: 'POST',
    body: JSON.stringify({ folderPath }),
  });
}

// Directory Browser API
export async function getFolderShortcuts() {
  const res = await fetchJson('/folders/shortcuts');
  return res.shortcuts;
}

export async function browseFolder(dirPath = null) {
  const query = dirPath ? `?dir=${encodeURIComponent(dirPath)}` : '';
  return await fetchJson(`/folders/browse${query}`);
}

export async function browseNativeFolder(title = 'Select Folder', initialPath = '') {
  return await fetchJson('/folders/native-browse', {
    method: 'POST',
    body: JSON.stringify({ title, initialPath }),
  });
}

// Google Drive API
export async function getGdriveStatus() {
  return await fetchJson('/gdrive/status');
}

export async function saveGdriveSettings(gdrive) {
  return await fetchJson('/gdrive/settings', {
    method: 'POST',
    body: JSON.stringify({ gdrive }),
  });
}

export async function syncProjectToGdrive(projectId) {
  return await fetchJson(`/gdrive/upload/${projectId}`, {
    method: 'POST',
  });
}

export async function getGoogleAuthUrl(credentials = {}) {
  return await fetchJson('/gdrive/auth-url', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

// Network & Remote Access API
export async function getShareInfo(token) {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const res = await fetchJson(`/network/share-info${query}`);
  return res.info;
}

export async function startPublicTunnel(token) {
  const res = await fetchJson('/network/tunnel/start', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return res.info;
}

export async function stopPublicTunnel(token) {
  const res = await fetchJson('/network/tunnel/stop', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return res.info;
}

// Settings API
export async function getSettings() {
  const res = await fetchJson('/settings');
  return res.settings;
}

export async function saveSettings(settings) {
  const res = await fetchJson('/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return res.settings;
}

// Cloud Synchronization API (Render.com)
export async function cloudSyncProject(projectId) {
  return await fetchJson(`/projects/${projectId}/cloud-sync`, {
    method: 'POST',
  });
}

export async function cloudPullProject(projectId) {
  return await fetchJson(`/projects/${projectId}/cloud-pull`, {
    method: 'POST',
  });
}
