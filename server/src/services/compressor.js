import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';

/**
 * Extracts embedded JPEG from RAW files (CR2, CR3, NEF, ARW, DNG) if Sharp fails to read raw raster
 */
function extractEmbeddedJpeg(buffer) {
  // Look for standard JPEG magic bytes: FF D8 FF
  let start = -1;
  for (let i = 0; i < buffer.length - 3; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      start = i;
      break;
    }
  }

  if (start === -1) return null;

  // Look for JPEG end: FF D9
  let end = -1;
  for (let i = buffer.length - 2; i > start; i--) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
      end = i + 2;
      break;
    }
  }

  if (end !== -1 && end > start + 1024) {
    return buffer.subarray(start, end);
  }
  return null;
}

export class CompressorService {
  /**
   * Process a single photo file into a lightweight 1920px WebP proxy
   */
  static async createProxy({ projectId, filePath, originalName, originalSize }) {
    const ext = path.extname(originalName);
    const stem = path.basename(originalName, ext);
    const id = uuidv4();

    // Directory for project proxies
    const projectProxyDir = path.resolve(config.PROXIES_DIR, projectId);
    if (!fs.existsSync(projectProxyDir)) {
      fs.mkdirSync(projectProxyDir, { recursive: true });
    }

    const proxyFilename = `${stem}.webp`;
    const proxyFilePath = path.resolve(projectProxyDir, proxyFilename);

    let imageInput = filePath;
    const isRaw = /\.(cr2|cr3|nef|arw|dng|raf|rw2|orf|pef)$/i.test(ext);

    let metadata;
    let proxyBuffer;

    try {
      // First attempt: direct Sharp processing
      const sharpInstance = sharp(imageInput, { failOnError: false })
        .rotate() // auto-orient based on EXIF
        .resize({
          width: config.PROXY_MAX_WIDTH,
          height: config.PROXY_MAX_WIDTH,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: config.PROXY_QUALITY, effort: 4 });

      proxyBuffer = await sharpInstance.toBuffer();
      metadata = await sharp(proxyBuffer).metadata();
    } catch (err) {
      if (isRaw) {
        console.warn(`[Compressor] Standard decode failed for RAW ${originalName}, trying embedded preview extraction...`);
        const fileBuffer = fs.readFileSync(filePath);
        const jpegBuffer = extractEmbeddedJpeg(fileBuffer);
        if (jpegBuffer) {
          const sharpInstance = sharp(jpegBuffer)
            .rotate()
            .resize({
              width: config.PROXY_MAX_WIDTH,
              height: config.PROXY_MAX_WIDTH,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({ quality: config.PROXY_QUALITY, effort: 4 });

          proxyBuffer = await sharpInstance.toBuffer();
          metadata = await sharp(proxyBuffer).metadata();
        } else {
          throw new Error(`Could not decode RAW file ${originalName} nor find embedded JPEG preview`);
        }
      } else {
        throw err;
      }
    }

    // Write proxy to disk
    fs.writeFileSync(proxyFilePath, proxyBuffer);
    const proxySize = proxyBuffer.length;

    const bytesSaved = Math.max(0, originalSize - proxySize);
    const savingsPercent = originalSize > 0 
      ? Math.round((bytesSaved / originalSize) * 100) 
      : 0;

    return {
      id,
      originalName,
      stem,
      originalExt: ext,
      proxyFilename,
      proxyPath: proxyFilePath,
      proxyUrl: `/api/proxies/${projectId}/${encodeURIComponent(proxyFilename)}`,
      originalSize,
      proxySize,
      bytesSaved,
      savingsPercent,
      width: metadata.width || 1920,
      height: metadata.height || 1080,
      format: metadata.format || 'webp',
      status: 'unreviewed', // default selection status
      comment: '',
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Process multiple files with progress reporting
   */
  static async processBatch({ projectId, files, onProgress }) {
    const results = [];
    let completed = 0;

    for (const file of files) {
      try {
        const item = await this.createProxy({
          projectId,
          filePath: file.path,
          originalName: file.originalname || file.name,
          originalSize: file.size || fs.statSync(file.path).size,
        });

        results.push(item);

        // Delete temporary upload file if stored in temp
        if (file.path && fs.existsSync(file.path) && file.path.includes('temp')) {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            // ignore
          }
        }
      } catch (err) {
        console.error(`[Compressor] Error processing ${file.originalname || file.path}:`, err.message);
      }

      completed++;
      if (onProgress) {
        onProgress({
          completed,
          total: files.length,
          percent: Math.round((completed / files.length) * 100),
          lastFile: file.originalname || file.name,
        });
      }
    }

    return results;
  }

  /**
   * Process and upload simultaneously in a concurrent pipeline
   * CPU compresses next photo while Network uploads current photo!
   */
  static async processStreamPipeline({ projectId, files, onProgress, uploadToDrive = false, gdriveFolderId = null }) {
    const results = [];
    const total = files.length;
    let completed = 0;
    let uploadedCount = 0;
    const startTime = Date.now();

    // In-flight background Google Drive uploads pool
    const activeUploads = [];

    for (const file of files) {
      try {
        // 1. CPU Stage: Sharp lightweight WebP compression
        const item = await this.createProxy({
          projectId,
          filePath: file.path,
          originalName: file.originalname || file.name,
          originalSize: file.size || (fs.existsSync(file.path) ? fs.statSync(file.path).size : 0),
        });

        results.push(item);

        // Delete temporary upload file if stored in temp
        if (file.path && fs.existsSync(file.path) && file.path.includes('temp')) {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {}
        }

        // 2. Network Stage: Overlapped concurrent Google Drive upload
        if (uploadToDrive && gdriveFolderId) {
          const uploadPromise = GoogleDriveService.uploadSingleProxy({
            img: item,
            folderId: gdriveFolderId,
          }).then((res) => {
            if (res) {
              item.gdriveId = res.id;
              item.gdriveViewUrl = res.webViewLink;
            }
            uploadedCount++;
          }).catch((err) => {
            console.warn(`[Pipeline] Upload background note: ${err.message}`);
          });

          activeUploads.push(uploadPromise);
        }
      } catch (err) {
        console.error(`[Pipeline] Error processing ${file.originalname || file.path}:`, err.message);
      }

      completed++;

      // 3. Compute accurate Speed & ETA (Estimated Time Remaining)
      const elapsedSeconds = Math.max(0.1, (Date.now() - startTime) / 1000);
      const speed = completed / elapsedSeconds; // photos per second
      const remainingItems = total - completed;
      const etaSeconds = Math.round(remainingItems / Math.max(0.01, speed));

      let etaText = '';
      if (completed >= total) {
        etaText = 'Finalizing...';
      } else if (etaSeconds < 60) {
        etaText = `${etaSeconds}s remaining`;
      } else {
        const mins = Math.floor(etaSeconds / 60);
        const secs = etaSeconds % 60;
        etaText = `${mins}m ${secs}s remaining`;
      }

      if (onProgress) {
        onProgress({
          completed,
          uploaded: uploadedCount,
          total,
          remaining: remainingItems,
          percent: Math.round((completed / total) * 100),
          currentFile: file.originalname || file.name,
          etaText,
          speedText: `${speed.toFixed(1)} photos/sec`,
          stage: uploadToDrive ? 'compress_and_upload' : 'compressing',
        });
      }
    }

    // Wait for all in-flight Google Drive uploads to complete
    if (activeUploads.length > 0) {
      if (onProgress) {
        onProgress({
          completed: total,
          uploaded: uploadedCount,
          total,
          remaining: 0,
          percent: 98,
          currentFile: 'Completing Google Drive sync...',
          etaText: 'Almost done...',
          speedText: '',
          stage: 'finalizing',
        });
      }
      await Promise.all(activeUploads);
    }

    return results;
  }

  /**
   * Scans a local directory for supported photo & RAW files
   */
  static scanFolder(dirPath, recursive = true) {
    const validExtensions = new Set([
      '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif',
      '.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.rw2', '.orf', '.pef'
    ]);
    const files = [];

    function traverse(currentDir) {
      if (!fs.existsSync(currentDir)) return;
      let entries = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (e) {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (recursive && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'Selected Images') {
            traverse(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (validExtensions.has(ext)) {
            try {
              const stat = fs.statSync(fullPath);
              files.push({
                path: fullPath,
                originalname: entry.name,
                name: entry.name,
                size: stat.size,
              });
            } catch (e) {}
          }
        }
      }
    }

    traverse(dirPath);
    return files;
  }
}
