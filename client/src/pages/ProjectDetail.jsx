import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  UploadCloud,
  FolderSync,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Cloud,
  HardDrive,
  Calendar,
  FileCheck2,
  Heart,
  Ban,
  Clock,
  Filter,
  CheckCircle2,
  FolderOpen,
  RefreshCw,
  Smartphone,
  QrCode,
  Globe,
  MessageCircle,
  Folder,
  FolderCheck,
  Play,
  Loader2
} from 'lucide-react';
import PhotoCard from '../components/PhotoCard';
import {
  uploadPhotos,
  syncProjectToGdrive,
  openFolderInExplorer,
  voteImage,
  getShareInfo,
  updateProject,
  importFolder,
  browseNativeFolder,
  cloudPullProject,
  cloudSyncProject
} from '../api';
import { socket } from '../socket';

export default function ProjectDetail({
  project,
  onBack,
  onOpenSyncModal,
  onOpenShareModal,
  onUpdateProject,
  onOpenLightbox,
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'selected' | 'rejected' | 'unreviewed'
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [compressionStatus, setCompressionStatus] = useState('');
  const [gdriveStatus, setGdriveStatus] = useState('');
  const [isSyncingGdrive, setIsSyncingGdrive] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [shareInfo, setShareInfo] = useState(null);

  // Master Folder & Live Processing States
  const [masterFolderPath, setMasterFolderPath] = useState(project.masterFolderPath || '');
  const [isBrowsingFolder, setIsBrowsingFolder] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [folderImportProgress, setFolderImportProgress] = useState(null);

  const fileInputRef = useRef(null);

  // Keep masterFolderPath synced with project
  useEffect(() => {
    if (project.masterFolderPath) {
      setMasterFolderPath(project.masterFolderPath);
    }
  }, [project.masterFolderPath]);

  // Load worldwide shareable public tunnel info
  useEffect(() => {
    let isMounted = true;
    const fetchShare = async () => {
      try {
        const info = await getShareInfo(project.token);
        if (isMounted) setShareInfo(info);
      } catch (e) {
        // silent
      }
    };
    fetchShare();
    const interval = setInterval(fetchShare, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [project.token]);

  // Subscribe to real-time events for this project
  useEffect(() => {
    socket.joinRoom(`project:${project.id}`);

    const unsubVote = socket.on('VOTE_UPDATED', (data) => {
      if (data.projectId === project.id) {
        onUpdateProject((prev) => {
          if (!prev || prev.id !== project.id) return prev;
          const updatedImages = (prev.images || []).map((img) =>
            img.id === data.imageId ? { ...img, status: data.status, comment: data.comment } : img
          );
          return {
            ...prev,
            images: updatedImages,
            stats: data.stats,
          };
        });
      }
    });

    const unsubSubmitted = socket.on('PROJECT_SUBMITTED', (data) => {
      if (data.projectId === project.id) {
        onUpdateProject((prev) => ({
          ...prev,
          status: 'submitted',
          submittedAt: data.submittedAt,
          submissionNotes: data.submissionNotes,
          stats: data.stats,
        }));
      }
    });

    const unsubUploadProgress = socket.on('UPLOAD_PROGRESS', (data) => {
      setCompressionStatus(`Compressing: ${data.completed} / ${data.total} (${data.percent}%)`);
    });

    const unsubGdriveProgress = socket.on('GDRIVE_UPLOAD_PROGRESS', (data) => {
      setGdriveStatus(`Auto-syncing to Google Drive: ${data.completed} / ${data.total} (${data.percent}%)`);
    });

    const unsubGdriveCompleted = socket.on('GDRIVE_SYNC_COMPLETED', (data) => {
      setGdriveStatus('Proxies synced to Google Drive successfully!');
      setTimeout(() => setGdriveStatus(''), 4500);
      onUpdateProject((prev) => ({
        ...prev,
        gdrive: { ...prev?.gdrive, uploaded: true, folderUrl: data.result?.folderUrl },
      }));
    });

    const unsubGdriveError = socket.on('GDRIVE_UPLOAD_ERROR', (data) => {
      setGdriveStatus(`Google Drive: ${data.error}`);
      setTimeout(() => setGdriveStatus(''), 6000);
    });

    const unsubImportProgress = socket.on('FOLDER_IMPORT_PROGRESS', (data) => {
      setFolderImportProgress(data);
    });

    const unsubImportCompleted = socket.on('FOLDER_IMPORT_COMPLETED', (data) => {
      setFolderImportProgress({
        completed: data.totalCount,
        total: data.totalCount,
        remaining: 0,
        percent: 100,
        isFinished: true,
      });
      setTimeout(() => setFolderImportProgress(null), 7000);
      if (data.project) {
        onUpdateProject(data.project);
      }
    });

    const unsubImportError = socket.on('FOLDER_IMPORT_ERROR', (data) => {
      alert(`Folder processing error: ${data.error}`);
      setFolderImportProgress(null);
    });

    return () => {
      unsubVote();
      unsubSubmitted();
      unsubUploadProgress();
      unsubGdriveProgress();
      unsubGdriveCompleted();
      unsubGdriveError();
      unsubImportProgress();
      unsubImportCompleted();
      unsubImportError();
    };
  }, [project.id]);

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      setUploadPercent(0);
      setCompressionStatus('Uploading files to compression queue...');

      const res = await uploadPhotos(project.id, files, (percent) => {
        setUploadPercent(percent);
        if (percent === 100) {
          setCompressionStatus('Generating lightweight 1920px WebP proxies with Sharp...');
        }
      });

      onUpdateProject(res.project);
      setCompressionStatus('Completed proxy generation!');
      setTimeout(() => {
        setIsUploading(false);
        setUploadPercent(0);
        setCompressionStatus('');
      }, 1500);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
      setIsUploading(false);
      setCompressionStatus('');
    }
  };

  const handleGdriveUpload = async () => {
    try {
      setIsSyncingGdrive(true);
      await syncProjectToGdrive(project.id);
      alert('Proxy previews uploaded to Google Drive!');
      onUpdateProject((prev) => ({
        ...prev,
        gdrive: { ...prev.gdrive, uploaded: true },
      }));
    } catch (err) {
      alert(`Google Drive sync: ${err.message}`);
    } finally {
      setIsSyncingGdrive(false);
    }
  };

  const clientPublicLink =
    shareInfo?.publicLink ||
    (shareInfo?.primaryLink && !shareInfo.primaryLink.includes('localhost') ? shareInfo.primaryLink : '') ||
    `https://unique-moment-gallery.onrender.com/gallery/${project.token}`;

  const publicQrImageUrl =
    shareInfo?.qrImageUrl ||
    (clientPublicLink ? `${new URL(clientPublicLink).origin}/api/network/qr-image/${project.token}.png` : '');

  const [isPullingCloud, setIsPullingCloud] = useState(false);

  const handlePullFromCloud = async () => {
    try {
      setIsPullingCloud(true);
      const res = await cloudPullProject(project.id);
      if (res.project) {
        onUpdateProject(res.project);
        alert(`Cloud Sync: Client has selected ${res.stats?.selectedCount || 0} photos!`);
      }
    } catch (err) {
      alert(`Cloud sync note: ${err.message}`);
    } finally {
      setIsPullingCloud(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(clientPublicLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleBrowseMasterFolder = async () => {
    try {
      setIsBrowsingFolder(true);
      const res = await browseNativeFolder('Select Master Photo Folder', masterFolderPath);
      const chosenPath = res?.path || res?.folderPath;
      if (chosenPath) {
        setMasterFolderPath(chosenPath);
        await updateProject(project.id, { masterFolderPath: chosenPath });
        onUpdateProject((prev) => ({ ...prev, masterFolderPath: chosenPath }));
      }
    } catch (err) {
      console.warn('Native folder selection note:', err.message);
    } finally {
      setIsBrowsingFolder(false);
    }
  };

  const handleStartFolderImport = async () => {
    if (!masterFolderPath) {
      alert('Please select a Master Folder first.');
      return;
    }
    try {
      setIsImporting(true);
      setFolderImportProgress({
        stage: 'scanning',
        completed: 0,
        total: 0,
        remaining: 0,
        percent: 0,
        currentFile: 'Scanning folder for images & RAW files...',
      });
      const res = await importFolder(project.id, masterFolderPath, true);
      if (res.project) {
        onUpdateProject(res.project);
      }
    } catch (err) {
      alert(`Auto-Backup error: ${err.message}`);
      setFolderImportProgress(null);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCopyQrImage = async () => {
    try {
      const qrUrl = `/api/network/qr-image/${project.token}.png`;
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setCopiedQr(true);
      setTimeout(() => setCopiedQr(false), 2500);
    } catch (err) {
      navigator.clipboard.writeText(publicQrImageUrl);
      setCopiedQr(true);
      setTimeout(() => setCopiedQr(false), 2500);
    }
  };

  const handleSelect = async (image) => {
    const newStatus = image.status === 'selected' ? 'unreviewed' : 'selected';
    await voteImage(project.token, image.id, newStatus, null, 'Studio');
  };

  const handleReject = async (image) => {
    const newStatus = image.status === 'rejected' ? 'unreviewed' : 'rejected';
    await voteImage(project.token, image.id, newStatus, null, 'Studio');
  };

  const filteredImages = (project.images || []).filter((img) => {
    if (filter === 'selected') return img.status === 'selected';
    if (filter === 'rejected') return img.status === 'rejected';
    if (filter === 'unreviewed') return !img.status || img.status === 'unreviewed';
    return true;
  });

  const isSubmitted = project.status === 'submitted';
  const stats = project.stats || {};

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      
      {/* Top Navigation & Project Metadata Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <button
            onClick={onBack}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>

          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {project.clientName}
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300 font-medium">
              {project.shootType}
            </span>
            {isSubmitted && (
              <span className="flex items-center space-x-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Submitted</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1 font-mono">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>{project.eventDate}</span>
            {project.notes && <span>• {project.notes}</span>}
          </div>
        </div>

        {/* Quick Actions Header */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handlePullFromCloud}
            disabled={isPullingCloud}
            className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-medium transition-colors disabled:opacity-50"
            title="Fetch client selections directly from Render.com cloud server"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isPullingCloud ? 'animate-spin' : ''}`} />
            <span>{isPullingCloud ? 'Syncing...' : 'Refresh from Cloud'}</span>
          </button>

          {/* Magic Sync Trigger Button */}
          <button
            onClick={() => onOpenSyncModal(project)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-semibold text-xs shadow-lg transition-all ${
              isSubmitted
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/40 ring-1 ring-emerald-400'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Sync & Extract Master Photos</span>
          </button>
        </div>
      </div>

      {/* PHASE 3: SUBMISSION NOTIFICATION BANNER (The Magic Feature Banner) */}
      {isSubmitted && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-teal-950/30 to-black border border-emerald-500/40 shadow-xl shadow-emerald-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">
                  Client Selection Finalized & Submitted!
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  {stats.selected} Selected Photos
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {project.clientName} has confirmed their shortlisted choices. Ready to run the automated local master auto-sorting script.
              </p>
              {project.submissionNotes && (
                <div className="mt-2 text-xs text-amber-300/90 italic bg-black/40 px-3 py-1.5 rounded-lg border border-amber-500/20 inline-block">
                  Client Note: "{project.submissionNotes}"
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => onOpenSyncModal(project)}
            className="flex-shrink-0 flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/50 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Launch Local Master Sync</span>
          </button>
        </div>
      )}

      {/* PHASE 1: SHAREABLE CLIENT LINK & STORAGE SAVINGS CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Shareable Client Gallery Link Card */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#141720] border border-white/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                Phase 1: Shareable Client Selection Link
              </span>
              <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>24/7 Cloud Gallery Live (Render.com + Google Drive)</span>
              </span>
            </div>

            <div className="mt-3 flex items-center space-x-2">
              <div className="flex-1 p-2.5 rounded-xl bg-black/50 border border-white/10 font-mono text-xs text-blue-300 select-all truncate">
                {clientPublicLink}
              </div>
              
              <button
                onClick={handleCopyLink}
                disabled={!clientPublicLink}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-colors flex-shrink-0 disabled:opacity-50"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>

              {clientPublicLink ? (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `📸 *Unique Moment Photography*\n` +
                    `নমস্কার / Greetings from *Unique Moment*! 🌸\n\n` +
                    `Dear *${project.clientName}*,\n` +
                    `Here is your private photo selection link from our studio:\n\n` +
                    `🔗 *Gallery Link:* ${clientPublicLink}\n` +
                    `🖼️ *QR Code Image:* ${publicQrImageUrl}\n\n` +
                    `Please tap the link or scan the QR code to select your favorite photos [❤️ Select] or [❌ Reject], and click "Submit Selection" when finished.\n\n` +
                    `Thank you,\n` +
                    `Team *Unique Moment* ✨`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-900/30 transition-all flex-shrink-0"
                  title="Send link & QR directly to client on WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
              ) : (
                <button
                  disabled
                  className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-600/40 text-white/50 text-xs font-medium cursor-not-allowed flex-shrink-0"
                  title="Connecting tunnel..."
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
              )}

              <button
                onClick={handleCopyQrImage}
                className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-colors flex-shrink-0"
                title="Copy QR Code image to clipboard (Paste directly into WhatsApp)"
              >
                {copiedQr ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>QR Copied!</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-3.5 h-3.5 text-pink-400" />
                    <span>Copy QR</span>
                  </>
                )}
              </button>

              <button
                onClick={() => onOpenShareModal(project)}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-medium text-xs shadow-md shadow-rose-900/30 transition-all flex-shrink-0"
                title="Open Mobile Sharing & QR Code modal"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>View QR</span>
              </button>

              <a
                href={clientPublicLink}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
                title="Preview gallery as client"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick instructions */}
          <div className="text-[11px] text-slate-300 flex items-center space-x-2">
            <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span>
              This link is live on the internet! Your client can open it from their home using mobile data (Jio, Airtel) or Wi-Fi on any smartphone.
            </span>
          </div>
        </div>

        {/* Cloud Storage Savings Metrics Card */}
        <div className="p-5 rounded-2xl bg-[#141720] border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Proxy Optimization</span>
              <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {stats.savingsPercent || 0}% Saved
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Original Master Size:</span>
                <span className="text-white font-mono">{formatSize(stats.totalOriginalBytes)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Uploaded Proxy Size:</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  {formatSize(stats.totalProxyBytes)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={handleGdriveUpload}
              disabled={isSyncingGdrive || stats.total === 0}
              className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              <Cloud className="w-3.5 h-3.5 text-blue-400" />
              <span>{isSyncingGdrive ? 'Syncing to Drive...' : 'Backup Proxies to Google Drive'}</span>
            </button>
          </div>
        </div>

      </div>

      {/* MASTER FOLDER & AUTO DRIVE BACKUP TOOL */}
      <div className="p-5 rounded-2xl bg-[#141720] border border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <Folder className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Local Master Folder & Auto-Drive Backup</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Select your high-res / RAW folder on PC. It will automatically compress proxies and backup to Google Drive.
            </p>
          </div>

          {masterFolderPath && (
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 self-start md:self-auto flex items-center space-x-1">
              <FolderCheck className="w-3.5 h-3.5" />
              <span>Master Folder Linked</span>
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1 flex items-center px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-xs font-mono text-slate-300 truncate">
            <HardDrive className="w-4 h-4 text-slate-500 mr-2 flex-shrink-0" />
            <span className="truncate">{masterFolderPath || 'No folder selected yet. Click Browse to select...'}</span>
          </div>

          <button
            type="button"
            onClick={handleBrowseMasterFolder}
            disabled={isBrowsingFolder || isImporting}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {isBrowsingFolder ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <FolderOpen className="w-4 h-4 text-amber-400" />
            )}
            <span>Browse Folder</span>
          </button>

          <button
            type="button"
            onClick={handleStartFolderImport}
            disabled={!masterFolderPath || isImporting}
            className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-amber-950/40 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:pointer-events-none flex-shrink-0"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>Scan & Auto-Backup to Drive</span>
          </button>
        </div>
      </div>

      {/* LIVE PROCESSING ANIMATION CARD (Total, Done, Remaining, Progress %, Speed & ETA) */}
      {folderImportProgress && (
        <div className="p-6 rounded-2xl bg-gradient-to-br from-[#121624] via-[#161a29] to-[#0c0e17] border border-amber-500/40 shadow-2xl shadow-amber-950/30 space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <RefreshCw className={`w-6 h-6 ${folderImportProgress.isFinished ? '' : 'animate-spin'}`} />
              </div>
              <div>
                <h4 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>
                    {folderImportProgress.isFinished
                      ? '✅ Folder Processing & Google Drive Backup Complete!'
                      : folderImportProgress.stage === 'compress_and_upload'
                      ? '⚡ Simultaneous CPU Compression & Google Drive Upload (Parallel Stream)...'
                      : folderImportProgress.stage === 'gdrive_upload'
                      ? '☁️ Auto-Syncing Proxies to Google Drive...'
                      : '⚡ Compressing & Generating Lightweight WebP Proxies...'}
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-0.5 font-mono">
                  {folderImportProgress.currentFile
                    ? `Current: ${folderImportProgress.currentFile}`
                    : 'Processing photos & streaming to cloud in parallel...'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {folderImportProgress.etaText && !folderImportProgress.isFinished && (
                <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-mono text-xs border border-amber-500/30 font-semibold shadow-sm">
                  ⏳ {folderImportProgress.etaText}
                </span>
              )}
              {folderImportProgress.speedText && !folderImportProgress.isFinished && (
                <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 font-mono text-xs border border-blue-500/30 font-semibold shadow-sm">
                  ⚡ {folderImportProgress.speedText}
                </span>
              )}
              <span className="text-2xl font-black font-mono text-amber-400">
                {folderImportProgress.percent || 0}%
              </span>
            </div>
          </div>

          {/* Glowing Animated Progress Bar */}
          <div className="w-full h-3.5 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/10 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-emerald-400 rounded-full transition-all duration-300 shadow-md relative overflow-hidden"
              style={{ width: `${folderImportProgress.percent || 0}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            </div>
          </div>

          {/* Real-time counters: Total, Completed, Remaining, Speed & ETA */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
              <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Total Photos</div>
              <div className="text-lg font-bold font-mono text-white mt-0.5">
                {folderImportProgress.total || 0}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
              <div className="text-[11px] text-emerald-400 font-medium uppercase tracking-wider">Completed</div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                {folderImportProgress.completed || 0}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
              <div className="text-[11px] text-amber-400 font-medium uppercase tracking-wider">Remaining</div>
              <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                {folderImportProgress.remaining ?? Math.max(0, (folderImportProgress.total || 0) - (folderImportProgress.completed || 0))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
              <div className="text-[11px] text-blue-400 font-medium uppercase tracking-wider">Estimated Time (ETA)</div>
              <div className="text-sm font-semibold font-mono text-blue-300 mt-1 truncate">
                {folderImportProgress.isFinished
                  ? 'Complete ✓'
                  : folderImportProgress.etaText || `${folderImportProgress.percent || 0}% In Progress`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 1: BULK DROPZONE UPLOADER */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFileUpload(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center ${
          dragOver
            ? 'border-rose-500 bg-rose-500/10 scale-[1.01]'
            : 'border-white/15 hover:border-white/30 bg-[#141720]/50 hover:bg-[#141720]'
        }`}
      >
        <input
          type="file"
          multiple
          ref={fileInputRef}
          accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.rw2,.orf,.tiff,.tif"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />

        <div className="max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-pink-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-rose-600/30">
            <UploadCloud className="w-6 h-6" />
          </div>

          <div>
            <h3 className="font-semibold text-sm text-white">
              Drop Master Photos or RAW Files Here
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Supports Canon CR2/CR3, Sony ARW, Nikon NEF, DNG, TIFF & high-res JPGs.
            </p>
            <p className="text-[11px] text-rose-400 mt-0.5">
              Automatically converted into lightweight 1920px WebP proxies.
            </p>
          </div>

          {isUploading && (
            <div className="pt-3 space-y-2">
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${uploadPercent}%` }}
                ></div>
              </div>
              <div className="text-xs font-mono text-slate-300">{compressionStatus}</div>
            </div>
          )}
        </div>
      </div>

      {/* Live Google Drive Sync Notification */}
      {gdriveStatus && (
        <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between shadow-lg shadow-blue-950/20">
          <div className="flex items-center space-x-2.5">
            <Cloud className="w-4 h-4 text-blue-400 animate-bounce" />
            <span className="text-xs text-blue-200 font-medium">{gdriveStatus}</span>
          </div>
          <span className="text-[11px] font-mono text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30">
            Auto Google Drive
          </span>
        </div>
      )}

      {/* PHOTOS FILTER TABS & GALLERY GRID */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-1 bg-white/5 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'all'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Photos ({stats.total || 0})
            </button>
            <button
              onClick={() => setFilter('selected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'selected'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ❤️ Selected ({stats.selected || 0})
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'rejected'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ❌ Rejected ({stats.rejected || 0})
            </button>
            <button
              onClick={() => setFilter('unreviewed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'unreviewed'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⏳ Pending ({stats.unreviewed || 0})
            </button>
          </div>

          <div className="text-xs text-slate-400">
            Showing <strong className="text-white">{filteredImages.length}</strong> photos
          </div>
        </div>

        {/* Gallery Grid */}
        {filteredImages.length === 0 ? (
          <div className="py-16 text-center rounded-2xl bg-[#141720] border border-white/10 text-xs text-slate-400">
            {stats.total === 0 ? 'No photos uploaded yet.' : 'No photos match the selected filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {filteredImages.map((image) => (
              <PhotoCard
                key={image.id}
                image={image}
                onSelect={handleSelect}
                onReject={handleReject}
                onOpenLightbox={(img) => {
                  const idx = filteredImages.findIndex((i) => i.id === img.id);
                  onOpenLightbox(filteredImages, idx);
                }}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
