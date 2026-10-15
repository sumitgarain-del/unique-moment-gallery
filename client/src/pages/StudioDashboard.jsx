import React, { useState } from 'react';
import {
  Plus,
  FolderSync,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Calendar,
  Sparkles,
  Camera,
  Heart,
  HardDrive,
  Cloud,
  CheckCircle2,
  Clock,
  ArrowRight,
  Share2,
  Smartphone,
} from 'lucide-react';
import { getShareInfo } from '../api';

export default function StudioDashboard({
  projects = [],
  onSelectProject,
  onOpenNewProject,
  onOpenSyncModal,
  onOpenShareModal,
  onDeleteProject,
}) {
  const [copiedToken, setCopiedToken] = useState(null);

  // Compute aggregate stats across all projects
  const totalProjects = projects.length;
  const submittedProjects = projects.filter((p) => p.status === 'submitted').length;
  let totalSavedBytes = 0;
  let totalSelectedPhotos = 0;

  projects.forEach((p) => {
    totalSavedBytes += p.stats?.bytesSaved || 0;
    totalSelectedPhotos += p.stats?.selected || 0;
  });

  const formatStorage = (bytes) => {
    if (bytes === 0) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const handleCopyLink = async (project, e) => {
    e.stopPropagation();
    try {
      const share = await getShareInfo(project.token);
      const link = share?.publicLink || (share?.tunnelActive ? share?.primaryLink : null);
      if (link) {
        navigator.clipboard.writeText(link);
        setCopiedToken(project.token);
        setTimeout(() => setCopiedToken(null), 2500);
        return;
      }
    } catch (err) {}
    if (onOpenShareModal) onOpenShareModal(project);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Studio Header & Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
            Studio Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Eliminate Google Drive storage bloat with lightweight proxy sync & automated local master sorting.
          </p>
        </div>

        <button
          onClick={onOpenNewProject}
          className="self-start md:self-auto flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-medium text-xs shadow-lg shadow-rose-600/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Shoot Project</span>
        </button>
      </div>

      {/* Highlights Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Projects */}
        <div className="p-4 rounded-2xl bg-[#141720] border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Projects</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Camera className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3 font-mono">
            {totalProjects}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Client galleries created</div>
        </div>

        {/* Cloud Storage Saved (Core Value Prop) */}
        <div className="p-4 rounded-2xl bg-[#141720] border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Cloud Storage Saved</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Cloud className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-3 font-mono">
            {formatStorage(totalSavedBytes)}
          </div>
          <div className="text-[11px] text-emerald-500/80 mt-1">Via lightweight 1920px proxies</div>
        </div>

        {/* Client Shortlists Completed */}
        <div className="p-4 rounded-2xl bg-[#141720] border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Selections Completed</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-400 mt-3 font-mono">
            {submittedProjects}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Ready for local master sync</div>
        </div>

        {/* Total Photos Selected */}
        <div className="p-4 rounded-2xl bg-[#141720] border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Shortlisted Photos</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Heart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-3 font-mono">
            {totalSelectedPhotos}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Marked with ❤️ by clients</div>
        </div>

      </div>

      {/* Projects List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            Active Client Projects ({projects.length})
          </h2>
        </div>

        {projects.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#141720] border border-white/10 space-y-3">
            <Camera className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-white">No projects created yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Create your first project, drop in photos, and let Studio Sync generate lightweight proxies and client links.
            </p>
            <button
              onClick={onOpenNewProject}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
            >
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const isSubmitted = project.status === 'submitted';
              const isUploaded = project.status === 'uploaded';
              const stats = project.stats || {};

              return (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project)}
                  className={`group relative rounded-2xl bg-[#141720] border p-5 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
                    isSubmitted
                      ? 'border-emerald-500/40 hover:border-emerald-500 shadow-emerald-950/20'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Card Top: Client & Status Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400">
                          {project.shootType || 'Photoshoot'}
                        </span>
                        <h3 className="font-bold text-base text-white group-hover:text-rose-400 transition-colors mt-0.5">
                          {project.clientName}
                        </h3>
                      </div>

                      {/* Status Badges */}
                      {isSubmitted ? (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Submitted 🎉</span>
                        </span>
                      ) : isUploaded ? (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Client Selecting</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/5 text-slate-400 border border-white/10">
                          Draft
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-2 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>{project.eventDate || 'Date not set'}</span>
                    </div>

                    {/* Stats Summary Bar */}
                    <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500">Total</div>
                        <div className="text-xs font-bold text-white font-mono mt-0.5">
                          {stats.total || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-rose-400">Selected ❤️</div>
                        <div className="text-xs font-bold text-rose-400 font-mono mt-0.5">
                          {stats.selected || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Savings</div>
                        <div className="text-xs font-bold text-emerald-400 font-mono mt-0.5">
                          {stats.savingsPercent || 0}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Quick Actions */}
                  <div className="mt-5 pt-3 border-t border-white/5 flex flex-col space-y-2">
                    
                    {/* If client submitted, show prominent "Sync Selected Photos" button */}
                    {isSubmitted && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSyncModal(project);
                        }}
                        className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-900/30 transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Sync Selected Master Photos</span>
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      {/* Open Share & Mobile Link Hub */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenShareModal) onOpenShareModal(project);
                        }}
                        className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/20 text-xs font-medium transition-colors"
                        title="Share gallery with mobile phone or remote client"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-rose-400" />
                        <span>Share / Mobile Link</span>
                      </button>

                      {/* Direct Gallery Link */}
                      <a
                        href={`/gallery/${project.token}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-colors"
                        title="Open client preview in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      {/* Delete Project */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              `Delete project "${project.clientName}"?\n\nThis will permanently remove the local project, its folder on Google Drive, and its online gallery on Render.`
                            )
                          ) {
                            onDeleteProject(project.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 border border-white/5 transition-colors"
                        title="Delete project (cleans up Google Drive and Cloud)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
