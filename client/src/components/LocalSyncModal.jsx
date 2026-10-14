import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderCheck,
  Play,
  CheckCircle,
  AlertTriangle,
  FolderOpen,
  Copy,
  Check,
  Sparkles,
  HardDrive,
  FileCheck2,
  ExternalLink,
  Layers,
  Loader2
} from 'lucide-react';
import { previewSync, executeSync, openFolderInExplorer, browseNativeFolder } from '../api';
import { socket } from '../socket';

export default function LocalSyncModal({ project, onClose, onBrowseFolder, onSyncSuccess }) {
  const [masterFolder, setMasterFolder] = useState(project?.masterFolderPath || '');
  const [outputFolder, setOutputFolder] = useState(project?.outputFolderPath || '');
  const [isBrowsingMaster, setIsBrowsingMaster] = useState(false);
  const [isBrowsingOutput, setIsBrowsingOutput] = useState(false);
  const [folderName, setFolderName] = useState('Selected Images');
  const [preference, setPreference] = useState('all'); // 'all' | 'raw_first' | 'jpeg_first' | 'raw_only' | 'jpeg_only'
  const [recursive, setRecursive] = useState(true);

  const [step, setStep] = useState('config'); // 'config' | 'preview' | 'syncing' | 'completed'
  const [previewReport, setPreviewReport] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedLightroom, setCopiedLightroom] = useState(false);

  // Subscribe to live copy progress over WebSocket
  useEffect(() => {
    socket.joinRoom(`project:${project.id}`);

    const unsubProgress = socket.on('SYNC_PROGRESS', (data) => {
      if (data.projectId === project.id) {
        setSyncProgress(data);
      }
    });

    const unsubCompleted = socket.on('SYNC_COMPLETED', (data) => {
      if (data.projectId === project.id) {
        setSyncResult(data.result);
        setStep('completed');
        if (onSyncSuccess) onSyncSuccess(data.result);
      }
    });

    return () => {
      unsubProgress();
      unsubCompleted();
    };
  }, [project.id]);

  useEffect(() => {
    if (project?.masterFolderPath && !masterFolder) {
      setMasterFolder(project.masterFolderPath);
    }
    if (project?.outputFolderPath && !outputFolder) {
      setOutputFolder(project.outputFolderPath);
    }
  }, [project?.masterFolderPath, project?.outputFolderPath]);

  const handleBrowseMaster = async () => {
    try {
      setIsBrowsingMaster(true);
      const res = await browseNativeFolder('Select Master Photos Folder', masterFolder);
      const chosen = res?.path || res?.folderPath;
      if (chosen) {
        setMasterFolder(chosen);
        return;
      }
      if (res && res.cancelled) return;
    } catch (err) {
      console.warn('Native browse failed, using fallback:', err);
      if (onBrowseFolder) {
        onBrowseFolder((chosen) => setMasterFolder(chosen), 'Select Master Photos Folder', masterFolder);
      }
    } finally {
      setIsBrowsingMaster(false);
    }
  };

  const handleBrowseOutput = async () => {
    try {
      setIsBrowsingOutput(true);
      const res = await browseNativeFolder('Select Destination Directory', outputFolder);
      const chosen = res?.path || res?.folderPath;
      if (chosen) {
        setOutputFolder(chosen);
        return;
      }
      if (res && res.cancelled) return;
    } catch (err) {
      console.warn('Native browse failed, using fallback:', err);
      if (onBrowseFolder) {
        onBrowseFolder((chosen) => setOutputFolder(chosen), 'Select Destination Directory', outputFolder);
      }
    } finally {
      setIsBrowsingOutput(false);
    }
  };

  // Step 1 -> 2: Preview Match
  const handlePreview = async () => {
    if (!masterFolder.trim()) {
      setError('Please specify the Master Folder where your original high-res photos are located.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      const report = await previewSync(project.id, {
        masterFolderPath: masterFolder,
        recursive,
        preference,
      });
      setPreviewReport(report);
      setStep('preview');
    } catch (err) {
      setError(err.message || 'Failed to match files in Master Folder');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 -> 3: Execute Sync & Copy
  const handleStartSync = async () => {
    if (!outputFolder.trim()) {
      setError('Please specify an Output Directory.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      setStep('syncing');
      setSyncProgress({
        percent: 0,
        copiedCount: 0,
        totalFiles: previewReport?.matchedFilesCount || 0,
        currentFile: 'Initializing copy engine...',
      });

      const res = await executeSync(project.id, {
        masterFolderPath: masterFolder,
        outputFolderPath: outputFolder,
        folderName,
        recursive,
        preference,
      });

      setSyncResult(res.copyResult);
      setStep('completed');
      if (onSyncSuccess) onSyncSuccess(res.copyResult);
    } catch (err) {
      setError(err.message || 'Failed to complete auto-sync');
      setStep('config');
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Click Open in Windows File Explorer
  const handleOpenExplorer = async () => {
    const target = syncResult?.targetFolder || `${outputFolder}\\${folderName}`;
    try {
      await openFolderInExplorer(project.id, target);
    } catch (err) {
      alert(`Could not open folder directly: ${err.message}`);
    }
  };

  // Copy Lightroom filter search string
  const handleCopyLightroom = () => {
    if (!previewReport && !syncResult) return;
    const stems = previewReport?.matchedPairs.map((p) => p.stem) || [];
    const uniqueStems = [...new Set(stems)].join(', ');
    navigator.clipboard.writeText(uniqueStems);
    setCopiedLightroom(true);
    setTimeout(() => setCopiedLightroom(false), 2500);
  };

  const selectedCount = project?.stats?.selected || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#141720] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white shadow-md shadow-rose-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-sm text-white">Local Master Auto-Sorting Engine</h3>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Magic Feature
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Auto-extract original RAW / high-res files for <strong className="text-white">{project?.clientName}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: CONFIGURATION */}
          {step === 'config' && (
            <div className="space-y-4">
              
              {/* Shortlist Summary Card */}
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">Client Selected Photos</span>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-lg font-bold text-white">{selectedCount} photos</span>
                    <span className="text-xs text-rose-400 font-medium">shortlisted by client</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <FileCheck2 className="w-5 h-5" />
                </div>
              </div>

              {/* Input A: Master Folder Browser */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Input A: Local Master Folder Browser
                  <span className="block text-[11px] font-normal text-slate-400">
                    Where your heavy original RAW files (.CR3, .ARW, .NEF, .DNG) or high-res JPGs reside on your PC:
                  </span>
                </label>
                <div className="flex space-x-2 mt-1.5">
                  <div className="relative flex-1">
                    <Folder className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="e.g. D:\Photos\Weddings\2026-Sarah\RAW"
                      value={masterFolder}
                      onChange={(e) => setMasterFolder(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowseMaster}
                    disabled={isBrowsingMaster}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs font-medium transition-colors disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    {isBrowsingMaster && <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />}
                    <span>{isBrowsingMaster ? 'Opening...' : 'Browse Folder'}</span>
                  </button>
                </div>
              </div>

              {/* Input B: Output Directory Browser */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Input B: Output Directory Browser
                  <span className="block text-[11px] font-normal text-slate-400">
                    Where the new output folder should be created on your PC:
                  </span>
                </label>
                <div className="flex space-x-2 mt-1.5">
                  <div className="relative flex-1">
                    <FolderCheck className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="e.g. D:\Photos\Weddings\2026-Sarah\Deliverables"
                      value={outputFolder}
                      onChange={(e) => setOutputFolder(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowseOutput}
                    disabled={isBrowsingOutput}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs font-medium transition-colors disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    {isBrowsingOutput && <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />}
                    <span>{isBrowsingOutput ? 'Opening...' : 'Browse Folder'}</span>
                  </button>
                </div>
              </div>

              {/* Created Folder Name Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Created Folder Name
                  </label>
                  <input
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    File Type Priority
                  </label>
                  <select
                    value={preference}
                    onChange={(e) => setPreference(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1b1f2b] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="all">Copy All Matches (RAW + High-Res JPG)</option>
                    <option value="raw_first">Prefer RAW (fallback to JPG)</option>
                    <option value="jpeg_first">Prefer High-Res JPG (fallback to RAW)</option>
                    <option value="raw_only">RAW Only (.CR3, .ARW, .NEF, etc.)</option>
                    <option value="jpeg_only">High-Res JPG Only</option>
                  </select>
                </div>
              </div>

              {/* Recursive Option */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="recursive-check"
                  checked={recursive}
                  onChange={(e) => setRecursive(e.target.checked)}
                  className="rounded bg-white/10 border-white/20 text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="recursive-check" className="text-xs text-slate-300 cursor-pointer">
                  Include subfolders (e.g. Camera A, Camera B, Card 1, Card 2)
                </label>
              </div>

            </div>
          )}

          {/* STEP 2: MATCH PREVIEW */}
          {step === 'preview' && previewReport && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                <div className="flex items-center space-x-2 font-semibold text-sm">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span>Matching Analysis Successful!</span>
                </div>
                <p className="text-xs text-emerald-400/80 mt-1">
                  Scanned <strong>{previewReport.totalScannedMasterFiles} master files</strong> in folder.
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="text-[11px] text-slate-400">Shortlisted</div>
                  <div className="text-lg font-bold text-white mt-0.5">
                    {previewReport.totalSelectedPhotos}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="text-[11px] text-slate-400">Matched Files</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">
                    {previewReport.matchedFilesCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="text-[11px] text-slate-400">Total High-Res Size</div>
                  <div className="text-lg font-bold text-rose-400 mt-0.5">
                    {previewReport.totalFormattedSize}
                  </div>
                </div>
              </div>

              {/* Destination preview */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs space-y-1">
                <div className="text-slate-400 font-mono text-[11px]">Will create folder:</div>
                <div className="text-white font-mono font-medium truncate">
                  {outputFolder}\{folderName}
                </div>
              </div>

              {/* Missing files warning if any */}
              {previewReport.missingCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                  <div className="font-semibold flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>{previewReport.missingCount} photos were not found in master folder:</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-amber-200/80 max-h-24 overflow-y-auto">
                    {previewReport.missingPhotos.map((m) => (
                      <div key={m.id}>• {m.originalName || m.stem}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched sample items list */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                <div className="text-xs font-semibold text-slate-300">Ready to Extract:</div>
                {previewReport.matchedPairs.slice(0, 8).map((pair, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5 text-[11px]"
                  >
                    <span className="font-mono text-slate-200 truncate max-w-xs">{pair.sourceFileName}</span>
                    <span className="text-slate-400 font-mono">
                      {(pair.sourceFileSize / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                ))}
                {previewReport.matchedPairs.length > 8 && (
                  <div className="text-[11px] text-slate-500 text-center italic py-1">
                    ...and {previewReport.matchedPairs.length - 8} more master photos
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: SYNCING IN PROGRESS */}
          {step === 'syncing' && (
            <div className="py-8 space-y-6 text-center">
              <div className="relative w-20 h-20 mx-auto">
                <div className="w-full h-full rounded-full border-4 border-white/10 border-t-rose-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-sm text-white font-mono">
                  {syncProgress?.percent || 0}%
                </div>
              </div>

              <div>
                <h4 className="text-base font-semibold text-white">Extracting High-Res Masters...</h4>
                <p className="text-xs text-slate-400 mt-1 font-mono truncate max-w-md mx-auto">
                  {syncProgress?.currentFile || 'Copying files...'}
                </p>
              </div>

              {/* Progress bar */}
              <div className="max-w-md mx-auto space-y-2">
                <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-200"
                    style={{ width: `${syncProgress?.percent || 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>
                    {syncProgress?.copiedCount || 0} of {syncProgress?.totalFiles || 0} copied
                  </span>
                  <span>{syncProgress?.speedMBps ? `${syncProgress.speedMBps} MB/s` : 'Active'}</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: COMPLETED */}
          {step === 'completed' && syncResult && (
            <div className="py-4 space-y-5">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-white">Automated Master Sync Complete!</h4>
                <p className="text-xs text-emerald-300 mt-1">
                  Successfully matched and copied <strong>{syncResult.copiedCount} high-res master photos</strong>.
                </p>
              </div>

              {/* Output Directory Card */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Output Location on PC</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                    Ready
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-slate-200 select-all truncate">
                  {syncResult.targetFolder}
                </div>

                {/* Primary Action: Open in File Explorer */}
                <button
                  onClick={handleOpenExplorer}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-lg shadow-emerald-900/30 transition-all"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Open 'Selected Images' Folder in Windows Explorer</span>
                </button>
              </div>

              {/* Secondary Action: Lightroom Quick Search String */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Lightroom / Capture One Filter</div>
                  <div className="text-[11px] text-slate-400">
                    Paste directly into Lightroom's Library search bar
                  </div>
                </div>
                <button
                  onClick={handleCopyLightroom}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                >
                  {copiedLightroom ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Filter String</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <div>
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => setStep('config')}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                ← Back to Settings
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              {step === 'completed' ? 'Close' : 'Cancel'}
            </button>

            {step === 'config' && (
              <button
                type="button"
                onClick={handlePreview}
                disabled={isLoading || selectedCount === 0}
                className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-medium shadow-lg shadow-rose-600/30 disabled:opacity-50 transition-all"
              >
                <span>Preview Master Match</span>
              </button>
            )}

            {step === 'preview' && (
              <button
                type="button"
                onClick={handleStartSync}
                disabled={isLoading || previewReport?.matchedFilesCount === 0}
                className="flex items-center space-x-2 px-6 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-medium shadow-lg shadow-emerald-600/30 disabled:opacity-50 transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>OK / Start Sync & Copy</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
