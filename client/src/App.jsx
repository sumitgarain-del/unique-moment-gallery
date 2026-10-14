import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import StudioDashboard from './pages/StudioDashboard';
import ProjectDetail from './pages/ProjectDetail';
import ClientGallery from './pages/ClientGallery';
import CreateProjectModal from './components/CreateProjectModal';
import SettingsModal from './components/SettingsModal';
import FolderPickerModal from './components/FolderPickerModal';
import LocalSyncModal from './components/LocalSyncModal';
import LightboxModal from './components/LightboxModal';
import ShareModal from './components/ShareModal';

import { getProjects, deleteProject, browseNativeFolder } from './api';
import { socket } from './socket';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'project'
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncModalProject, setSyncModalProject] = useState(null);
  const [shareModalProject, setShareModalProject] = useState(null);

  // Folder picker state
  const [folderPickerConfig, setFolderPickerConfig] = useState(null); // { onSelect, title, initialPath }

  // Studio Lightbox state
  const [lightboxData, setLightboxData] = useState(null); // { images, index }

  // Global Toast Alert
  const [studioToast, setStudioToast] = useState(null);

  // Check URL pathname for /gallery/:token
  const pathname = window.location.pathname;
  const galleryMatch = pathname.match(/^\/gallery\/([a-zA-Z0-9_-]+)/);
  const clientGalleryToken = galleryMatch ? galleryMatch[1] : null;

function playNotificationChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {}
}

  // Load projects
  useEffect(() => {
    if (clientGalleryToken) return; // In client mode, skip loading studio projects

    loadProjects(false);
    socket.connect();

    // Listen for studio alert
    const unsubAlert = socket.on('STUDIO_ALERT', (data) => {
      playNotificationChime();
      setStudioToast(data.message);
      loadProjects(true); // refresh projects list silently
      setTimeout(() => setStudioToast(null), 8000);
    });

    const unsubDeleted = socket.on('PROJECT_DELETED', (data) => {
      setProjects((prev) => prev.filter((p) => p.id !== data.projectId));
      setSelectedProject((prev) => (prev?.id === data.projectId ? null : prev));
    });

    // Auto-poll projects list every 4 seconds in background
    const pollInterval = setInterval(() => {
      loadProjects(true);
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      unsubAlert();
      unsubDeleted();
    };
  }, [clientGalleryToken]);

  const loadProjects = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await getProjects();
      setProjects(data || []);
      // If a project was selected, refresh its reference
      if (selectedProject) {
        const found = (data || []).find((p) => p.id === selectedProject.id);
        if (found) setSelectedProject(found);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSelectProject = (project) => {
    setSelectedProject(project);
    setCurrentView('project');
  };

  const handleDeleteProject = async (id) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedProject?.id === id) {
        setSelectedProject(null);
        setCurrentView('dashboard');
      }
    } catch (err) {
      alert(`Delete error: ${err.message}`);
    }
  };

  // Helper to open folder picker (Native Windows Explorer dialog first)
  const openFolderPicker = async (onSelect, title = 'Select Folder', initialPath = '') => {
    try {
      const res = await browseNativeFolder(title, initialPath);
      if (res && res.success && res.path) {
        onSelect(res.path);
        return;
      }
      if (res && res.cancelled) {
        return; // User cancelled Windows dialog
      }
    } catch (err) {
      console.warn('[Browse] Native Windows dialog failed, falling back to web picker:', err);
    }
    setFolderPickerConfig({ onSelect, title, initialPath });
  };

  // If viewing client gallery directly via shareable link
  if (clientGalleryToken) {
    return <ClientGallery token={clientGalleryToken} />;
  }

  return (
    <div className="min-h-screen bg-[#0e1015] text-slate-100 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      
      {/* Navbar */}
      <Navbar
        currentView={currentView}
        onViewChange={(view) => {
          if (view === 'dashboard') {
            setSelectedProject(null);
          }
          setCurrentView(view);
        }}
        selectedProject={selectedProject}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        
        {/* Global Live Toast Alert */}
        {studioToast && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-900/40 flex items-center justify-between animate-bounce">
            <span className="font-semibold text-xs tracking-wide">{studioToast}</span>
            <button
              onClick={() => setStudioToast(null)}
              className="px-2 py-1 rounded bg-black/20 hover:bg-black/30 text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View Switcher */}
        {currentView === 'dashboard' ? (
          <StudioDashboard
            projects={projects}
            onSelectProject={handleSelectProject}
            onOpenNewProject={() => setIsNewProjectOpen(true)}
            onOpenSyncModal={(proj) => setSyncModalProject(proj)}
            onOpenShareModal={(proj) => setShareModalProject(proj)}
            onDeleteProject={handleDeleteProject}
          />
        ) : selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            onBack={() => {
              setSelectedProject(null);
              setCurrentView('dashboard');
            }}
            onOpenSyncModal={(proj) => setSyncModalProject(proj)}
            onOpenShareModal={(proj) => setShareModalProject(proj)}
            onUpdateProject={(updated) => {
              if (typeof updated === 'function') {
                setSelectedProject(updated);
              } else {
                setSelectedProject(updated);
              }
              loadProjects();
            }}
            onOpenLightbox={(images, index) => setLightboxData({ images, index })}
          />
        ) : (
          <div className="text-center py-20 text-xs text-slate-400">Loading project...</div>
        )}
      </main>

      {/* Modals */}
      {isNewProjectOpen && (
        <CreateProjectModal
          onClose={() => setIsNewProjectOpen(false)}
          onCreated={(newProj) => {
            setProjects((prev) => [newProj, ...prev]);
            setSelectedProject(newProj);
            setCurrentView('project');
          }}
          onBrowseFolder={(callback, title) => openFolderPicker(callback, title)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}

      {syncModalProject && (
        <LocalSyncModal
          project={syncModalProject}
          onClose={() => setSyncModalProject(null)}
          onBrowseFolder={(callback, title, initialPath) => openFolderPicker(callback, title, initialPath)}
          onSyncSuccess={() => {
            loadProjects();
          }}
        />
      )}

      {shareModalProject && (
        <ShareModal
          project={shareModalProject}
          onClose={() => setShareModalProject(null)}
        />
      )}

      {folderPickerConfig && (
        <FolderPickerModal
          title={folderPickerConfig.title}
          initialPath={folderPickerConfig.initialPath}
          onSelect={(chosenPath) => {
            folderPickerConfig.onSelect(chosenPath);
            setFolderPickerConfig(null);
          }}
          onClose={() => setFolderPickerConfig(null)}
        />
      )}

      {lightboxData && (
        <LightboxModal
          images={lightboxData.images}
          currentIndex={lightboxData.index}
          onClose={() => setLightboxData(null)}
          onSelect={() => {}}
          onReject={() => {}}
          onUpdateComment={() => {}}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-white/5 py-4 text-center text-[11px] text-slate-400 bg-black/20">
        Studio Sync • High-Speed Photography Proxy Sync & Local Master Matcher
      </footer>

    </div>
  );
}
