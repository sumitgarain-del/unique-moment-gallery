import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Helper to get available drive letters on Windows
 */
function getWindowsDrives() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve([{ name: 'Root', path: '/' }]);
    }

    exec('wmic logicaldisk get name', (err, stdout) => {
      if (err) {
        // Fallback default drives
        return resolve([
          { name: 'C: Drive', path: 'C:\\' },
          { name: 'D: Drive', path: 'D:\\' },
        ]);
      }

      const lines = stdout.split('\r\r\n');
      const drives = [];
      for (const line of lines) {
        const drive = line.trim();
        if (drive && drive !== 'Name') {
          drives.push({
            name: `${drive} Drive`,
            path: `${drive}\\`,
          });
        }
      }
      resolve(drives.length > 0 ? drives : [{ name: 'C: Drive', path: 'C:\\' }]);
    });
  });
}

// GET /api/folders/shortcuts
router.get('/shortcuts', async (req, res) => {
  try {
    const drives = await getWindowsDrives();
    const homeDir = os.homedir();

    const shortcuts = [
      ...drives,
      { name: 'Pictures', path: path.join(homeDir, 'Pictures') },
      { name: 'Desktop', path: path.join(homeDir, 'Desktop') },
      { name: 'Documents', path: path.join(homeDir, 'Documents') },
      { name: 'Downloads', path: path.join(homeDir, 'Downloads') },
    ].filter((s) => fs.existsSync(s.path));

    res.json({ success: true, shortcuts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/folders/native-browse
router.post('/native-browse', (req, res) => {
  try {
    const { title = 'Select Folder', initialPath = '' } = req.body;
    const scriptPath = path.resolve(__dirname, '../services/pick_folder.ps1');

    execFile(
      'powershell',
      ['-Sta', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, title, initialPath],
      { encoding: 'utf8', timeout: 35000 },
      (err, stdout, stderr) => {
        if (err) {
          console.warn('[Native Browse] Dialog error or closed:', err.message);
          return res.json({ success: false, cancelled: true, error: err.message });
        }
        const selected = stdout ? stdout.trim() : '';
        if (selected) {
          return res.json({ success: true, path: selected, folderPath: selected });
        }
        return res.json({ success: false, cancelled: true });
      }
    );
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/folders/browse?dir=...
router.get('/browse', (req, res) => {
  try {
    const targetDir = req.query.dir ? path.resolve(req.query.dir.toString()) : os.homedir();

    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ success: false, error: 'Path does not exist' });
    }

    const stat = fs.statSync(targetDir);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'Path is not a directory' });
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const folders = [];
    let fileCount = 0;
    const extensionsFound = new Set();

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('$') && !entry.name.startsWith('.')) {
          folders.push({
            name: entry.name,
            path: path.join(targetDir, entry.name),
          });
        }
      } else if (entry.isFile()) {
        fileCount++;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext) extensionsFound.add(ext);
      }
    }

    // Sort folders alphabetically
    folders.sort((a, b) => a.name.localeCompare(b.name));

    const parentDir = path.dirname(targetDir);

    res.json({
      success: true,
      currentPath: targetDir,
      parentPath: parentDir !== targetDir ? parentDir : null,
      folders,
      fileCount,
      extensions: Array.from(extensionsFound).slice(0, 8),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
