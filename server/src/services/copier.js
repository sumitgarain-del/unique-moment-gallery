import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { socketHub } from './websocket.js';

export class CopierService {
  /**
   * Copies matched files to the destination directory with live progress
   */
  static async copyMatchedFiles({
    projectId,
    matchedPairs = [],
    outputDirectory,
    folderName = 'Selected Images',
    projectTitle = 'Project',
    clientName = 'Client',
    onProgress = null,
  }) {
    if (!outputDirectory) {
      throw new Error('Output directory path must be provided');
    }

    // Resolve target folder
    const targetFolder = path.resolve(outputDirectory, folderName);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const totalFiles = matchedPairs.length;
    let totalBytes = matchedPairs.reduce((acc, p) => acc + (p.sourceFileSize || 0), 0);
    let copiedBytes = 0;
    let copiedCount = 0;
    const errors = [];
    const copiedFilesList = [];

    const startTime = Date.now();

    for (let i = 0; i < totalFiles; i++) {
      const pair = matchedPairs[i];
      const destPath = path.join(targetFolder, pair.sourceFileName);

      try {
        // Fast file copy
        fs.copyFileSync(pair.sourceFilePath, destPath);

        // Preserve modification and access timestamps
        try {
          const stats = fs.statSync(pair.sourceFilePath);
          fs.utimesSync(destPath, stats.atime, stats.mtime);
        } catch (utimeErr) {
          // ignore timestamp failure
        }

        copiedBytes += pair.sourceFileSize || 0;
        copiedCount++;

        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedMBps = elapsedSec > 0 ? ((copiedBytes / (1024 * 1024)) / elapsedSec).toFixed(1) : 0;
        const percent = Math.round((copiedCount / totalFiles) * 100);

        copiedFilesList.push({
          fileName: pair.sourceFileName,
          destPath,
          size: pair.sourceFileSize,
          comment: pair.comment,
        });

        const progressData = {
          projectId,
          copiedCount,
          totalFiles,
          copiedBytes,
          totalBytes,
          percent,
          currentFile: pair.sourceFileName,
          speedMBps,
          targetFolder,
        };

        if (onProgress) {
          onProgress(progressData);
        }

        // Also broadcast via WebSocket
        socketHub.broadcastToRoom(`project:${projectId}`, {
          type: 'SYNC_PROGRESS',
          ...progressData,
        });
      } catch (err) {
        console.error(`[Copier] Failed to copy ${pair.sourceFileName}:`, err.message);
        errors.push({
          fileName: pair.sourceFileName,
          error: err.message,
        });
      }
    }

    // Generate selection_manifest.json in the destination folder
    const manifestPath = path.join(targetFolder, 'selection_manifest.json');
    const manifestData = {
      projectTitle,
      clientName,
      extractedAt: new Date().toISOString(),
      totalSelected: matchedPairs.length,
      successfullyCopied: copiedCount,
      failedCount: errors.length,
      totalBytesCopied: copiedBytes,
      files: copiedFilesList,
      errors,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');

    // Generate Lightroom / Photo Mechanic quick search file
    // Comma-separated list of filenames and stems
    const lightroomTxtPath = path.join(targetFolder, 'Lightroom_Shortlist.txt');
    const stemsList = [...new Set(matchedPairs.map((p) => p.stem))];
    const filenamesList = matchedPairs.map((p) => p.sourceFileName);

    const lightroomSummary = [
      `==================================================================`,
      `STUDIO SYNC - CLIENT SELECTION SHORTLIST`,
      `Project: ${projectTitle}`,
      `Client: ${clientName}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Total Photos Selected: ${stemsList.length} (${totalFiles} files copied)`,
      `==================================================================`,
      ``,
      `--- LIGHTROOM / CAPTURE ONE FILTER STRING (Copy & Paste into Text Filter): ---`,
      stemsList.join(', '),
      ``,
      `--- EXACT FILENAMES LIST: ---`,
      filenamesList.join('\n'),
      ``,
      `--- CLIENT NOTES & COMMENTS: ---`,
      ...matchedPairs
        .filter((p) => p.comment)
        .map((p) => `* ${p.sourceFileName}: "${p.comment}"`),
    ].join('\n');

    fs.writeFileSync(lightroomTxtPath, lightroomSummary, 'utf8');

    const result = {
      targetFolder,
      totalFiles,
      copiedCount,
      failedCount: errors.length,
      totalBytesCopied: copiedBytes,
      manifestPath,
      lightroomTxtPath,
      errors,
      completedAt: new Date().toISOString(),
    };

    // Broadcast completion
    socketHub.broadcastToRoom(`project:${projectId}`, {
      type: 'SYNC_COMPLETED',
      projectId,
      result,
    });

    return result;
  }

  /**
   * Opens the destination folder in Windows File Explorer
   */
  static openInExplorer(folderPath) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(folderPath)) {
        return reject(new Error(`Folder does not exist: ${folderPath}`));
      }

      // Windows explorer command
      const normalizedPath = path.normalize(folderPath);
      exec(`explorer.exe "${normalizedPath}"`, (err) => {
        if (err) {
          console.warn('[Copier] Error opening explorer:', err.message);
          return resolve(false);
        }
        resolve(true);
      });
    });
  }
}
