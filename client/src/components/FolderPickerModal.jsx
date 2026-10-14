import React, { useState, useEffect } from 'react';
import { X, Folder, HardDrive, CornerLeftUp, Check, ChevronRight, FolderCheck } from 'lucide-react';
import { getFolderShortcuts, browseFolder } from '../api';

export default function FolderPickerModal({ initialPath = '', title = 'Select Folder', onSelect, onClose }) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [shortcuts, setShortcuts] = useState([]);
  const [browserData, setBrowserData] = useState({
    folders: [],
    currentPath: '',
    parentPath: null,
    fileCount: 0,
    extensions: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load Windows drive shortcuts
    getFolderShortcuts()
      .then((data) => setShortcuts(data || []))
      .catch(() => {});

    // Browse initial path
    loadDirectory(initialPath || null);
  }, []);

  const loadDirectory = async (dirPath) => {
    try {
      setLoading(true);
      setError('');
      const data = await browseFolder(dirPath);
      setBrowserData(data);
      setCurrentPath(data.currentPath);
    } catch (err) {
      setError(err.message || 'Could not access folder');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCurrent = () => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#141720] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">{title}</h3>
              <p className="text-[11px] text-slate-400">Browse Windows drives and folders</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Path Input & Shortcuts Bar */}
        <div className="p-4 bg-black/30 border-b border-white/5 space-y-3">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadDirectory(currentPath);
              }}
              placeholder="Paste or enter full folder path (e.g. D:\Photos\Weddings\RAW)"
              className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <button
              onClick={() => loadDirectory(currentPath)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium"
            >
              Go
            </button>
          </div>

          {/* Quick Drive Shortcuts */}
          <div className="flex flex-wrap gap-1.5">
            {shortcuts.map((sc) => (
              <button
                key={sc.path}
                onClick={() => loadDirectory(sc.path)}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[11px] font-medium text-slate-300 hover:text-white border border-white/5 transition-colors"
              >
                <HardDrive className="w-3 h-3 text-rose-400" />
                <span>{sc.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Directory Contents Explorer */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          {browserData.parentPath && (
            <button
              onClick={() => loadDirectory(browserData.parentPath)}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/10 text-xs text-slate-300 transition-colors"
            >
              <CornerLeftUp className="w-4 h-4 text-slate-400" />
              <span className="font-mono text-slate-400">.. (Parent Directory)</span>
            </button>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Scanning directory...</div>
          ) : browserData.folders.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No subdirectories found in this folder.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {browserData.folders.map((folder) => (
                <button
                  key={folder.path}
                  onClick={() => loadDirectory(folder.path)}
                  className="group flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/30 text-left transition-all"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span className="text-xs text-slate-200 group-hover:text-rose-300 font-medium truncate">
                      {folder.name}
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 flex-shrink-0 ml-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current Folder Stats & Confirmation Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 truncate max-w-sm">
            {browserData.fileCount > 0 ? (
              <span>
                📁 Contains <strong className="text-white">{browserData.fileCount} files</strong>{' '}
                {browserData.extensions?.length > 0 && `(${browserData.extensions.join(', ')})`}
              </span>
            ) : (
              <span>Empty or zero direct files</span>
            )}
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelectCurrent}
              disabled={!currentPath}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-lg shadow-rose-600/30 disabled:opacity-50 transition-all"
            >
              <FolderCheck className="w-4 h-4" />
              <span>Select This Folder</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
