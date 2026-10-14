import React, { useState, useEffect } from 'react';
import { Camera, Cloud, FolderSync, Settings, Plus, Sparkles, HardDrive, ExternalLink } from 'lucide-react';
import { getGdriveStatus } from '../api';

export default function Navbar({ onOpenNewProject, onOpenSettings, currentView, onViewChange, selectedProject }) {
  const [gdriveStatus, setGdriveStatus] = useState(null);

  useEffect(() => {
    getGdriveStatus()
      .then((data) => setGdriveStatus(data))
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0e1015]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onViewChange('dashboard')}>
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-500 p-[2px] shadow-lg shadow-rose-500/20">
            <div className="w-full h-full bg-[#12141a] rounded-[10px] flex items-center justify-center">
              <Camera className="w-5 h-5 text-rose-500" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white font-sans">
                STUDIO <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-400">SYNC</span>
              </span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 tracking-wide hidden sm:block">
              Proxy Cloud Sync & Local Master Matcher
            </p>
          </div>
        </div>

        {/* View Navigation */}
        <div className="hidden md:flex items-center space-x-1 bg-white/5 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => onViewChange('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentView === 'dashboard'
                ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Dashboard
          </button>
          {selectedProject && (
            <button
              onClick={() => onViewChange('project')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'project'
                  ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Project: {selectedProject.clientName}
            </button>
          )}
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center space-x-3">
          
          {/* Cloud Storage Mode Badge */}
          <div 
            onClick={onOpenSettings}
            className="cursor-pointer group hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition-colors"
            title="Click to configure Google Drive storage"
          >
            {gdriveStatus?.status?.connected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-300 font-medium">Google Drive Sync</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-300 font-medium">Local Proxy Mode</span>
              </>
            )}
          </div>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
            title="Studio & Google Drive Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
}
