import fs from 'fs';
import path from 'path';

const RAW_EXTENSIONS = new Set([
  '.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.rw2', '.orf', '.pef', '.srw', '.x3f'
]);

const JPEG_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp', '.heic'
]);

/**
 * Normalizes a filename or stem for fuzzy stem matching
 * Handles cameras with Adobe RGB leading underscore e.g. `_DSC1234` vs `DSC1234`
 */
function normalizeStem(stem) {
  let s = stem.toLowerCase().trim();
  if (s.startsWith('_')) {
    s = s.substring(1);
  }
  return s;
}

export class MatcherService {
  /**
   * Recursively scans directory for master high-res and RAW files
   */
  static scanMasterDirectory(dirPath, recursive = true) {
    const files = [];

    function walk(currentDir) {
      if (!fs.existsSync(currentDir)) return;

      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (recursive && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const stem = path.basename(entry.name, path.extname(entry.name));
          try {
            const stats = fs.statSync(fullPath);
            files.push({
              fileName: entry.name,
              filePath: fullPath,
              stem,
              normStem: normalizeStem(stem),
              ext,
              size: stats.size,
              mtime: stats.mtime,
              isRaw: RAW_EXTENSIONS.has(ext),
              isJpeg: JPEG_EXTENSIONS.has(ext),
            });
          } catch (e) {
            // Ignore unreadable files
          }
        }
      }
    }

    walk(dirPath);
    return files;
  }

  /**
   * Matches selected proxy images with local master files
   * 
   * @param {Object} options
   * @param {Array} options.selectedImages - List of selected image objects from project
   * @param {string} options.masterFolderPath - Master folder path on photographer's PC
   * @param {boolean} options.recursive - Scan subfolders
   * @param {string} options.preference - 'all' | 'raw_first' | 'jpeg_first' | 'raw_only' | 'jpeg_only'
   */
  static matchFiles({
    selectedImages = [],
    masterFolderPath,
    recursive = true,
    preference = 'all',
  }) {
    if (!fs.existsSync(masterFolderPath)) {
      throw new Error(`Master folder does not exist: "${masterFolderPath}"`);
    }

    const masterFiles = this.scanMasterDirectory(masterFolderPath, recursive);

    // Group master files by normalized stem
    const masterMap = new Map();
    for (const f of masterFiles) {
      if (!masterMap.has(f.normStem)) {
        masterMap.set(f.normStem, []);
      }
      masterMap.get(f.normStem).push(f);
    }

    const matchedPairs = [];
    const missingPhotos = [];
    let totalBytesToCopy = 0;

    for (const img of selectedImages) {
      const targetStem = normalizeStem(img.stem);
      const candidates = masterMap.get(targetStem) || [];

      if (candidates.length === 0) {
        missingPhotos.push({
          id: img.id,
          stem: img.stem,
          originalName: img.originalName,
          proxyFilename: img.proxyFilename,
          reason: 'No matching file found in master folder',
        });
        continue;
      }

      // Filter/sort candidates according to user preference
      let toCopy = [];
      if (preference === 'raw_only') {
        toCopy = candidates.filter((c) => c.isRaw);
      } else if (preference === 'jpeg_only') {
        toCopy = candidates.filter((c) => c.isJpeg);
      } else if (preference === 'raw_first') {
        const raws = candidates.filter((c) => c.isRaw);
        toCopy = raws.length > 0 ? raws : candidates;
      } else if (preference === 'jpeg_first') {
        const jpegs = candidates.filter((c) => c.isJpeg);
        toCopy = jpegs.length > 0 ? jpegs : candidates;
      } else {
        // 'all': copy both RAW and fine JPEGs if both exist
        toCopy = candidates;
      }

      if (toCopy.length === 0) {
        // Fallback to whatever candidates exist if preference yielded nothing
        toCopy = candidates;
      }

      for (const candidate of toCopy) {
        totalBytesToCopy += candidate.size;
        matchedPairs.push({
          selectedImageId: img.id,
          stem: img.stem,
          proxyFilename: img.proxyFilename,
          comment: img.comment || '',
          sourceFilePath: candidate.filePath,
          sourceFileName: candidate.fileName,
          sourceFileSize: candidate.size,
          sourceExt: candidate.ext,
          isRaw: candidate.isRaw,
          isJpeg: candidate.isJpeg,
        });
      }
    }

    return {
      masterFolderPath,
      totalScannedMasterFiles: masterFiles.length,
      totalSelectedPhotos: selectedImages.length,
      matchedPhotoCount: selectedImages.length - missingPhotos.length,
      matchedFilesCount: matchedPairs.length,
      missingCount: missingPhotos.length,
      totalBytesToCopy,
      totalFormattedSize: this.formatBytes(totalBytesToCopy),
      matchedPairs,
      missingPhotos,
    };
  }

  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
