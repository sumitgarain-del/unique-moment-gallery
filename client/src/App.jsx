import React, { useState, useEffect, useRef } from 'react';
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

  // Synchronized refs to avoid stale closures in window event listeners
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;

  const selectedProjectRef = useRef(selectedProject);
  selectedProjectRef.current = selectedProject;

  const lightboxDataRef = useRef(lightboxData);
  lightboxDataRef.current = lightboxData;

  const isNewProjectOpenRef = useRef(isNewProjectOpen);
  isNewProjectOpenRef.current = isNewProjectOpen;

  const isSettingsOpenRef = useRef(isSettingsOpen);
  isSettingsOpenRef.current = isSettingsOpen;

  const syncModalProjectRef = useRef(syncModalProject);
  syncModalProjectRef.current = syncModalProject;

  const shareModalProjectRef = useRef(shareModalProject);
  shareModalProjectRef.current = shareModalProject;

  const folderPickerConfigRef = useRef(folderPickerConfig);
  folderPickerConfigRef.current = folderPickerConfig;

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

  // Load projects & socket connection
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

    const unsubProjectUpdated = socket.on('PROJECT_UPDATED', (data) => {
      if (data.project) {
        setProjects((prev) =>
          prev.map((p) => (p.id === data.project.id ? data.project : p))
        );
        setSelectedProject((prev) =>
          prev?.id === data.project.id ? data.project : prev
        );
      }
    });

    // Auto-poll projects list every 4 seconds in background
    const pollInterval = setInterval(() => {
      loadProjects(true);
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      unsubAlert();
      unsubDeleted();
      unsubProjectUpdated();
    };
  }, [clientGalleryToken]);

  // History & App Navigation Management (Desktop App Experience)
  useEffect(() => {
    if (clientGalleryToken) return;

    // Anchor history on dashboard so back buttons stay inside the app
    const initialHash = window.location.hash;
    if (!initialHash || initialHash === '#dashboard' || initialHash === '#') {
      window.history.replaceState({ view: 'dashboard' }, '', '#dashboard');
      window.history.pushState({ view: 'dashboard' }, '', '#dashboard');
    }

    const handlePopState = () => {
      // 1. If full-screen lightbox is open, back button closes it
      if (lightboxDataRef.current) {
        setLightboxData(null);
        return;
      }

      // 2. If any modal dialog is open, back button dismisses it
      if (isNewProjectOpenRef.current) {
        setIsNewProjectOpen(false);
        return;
      }
      if (isSettingsOpenRef.current) {
        setIsSettingsOpen(false);
        return;
      }
      if (syncModalProjectRef.current) {
        setSyncModalProject(null);
        return;
      }
      if (shareModalProjectRef.current) {
        setShareModalProject(null);
        return;
      }
      if (folderPickerConfigRef.current) {
        setFolderPickerConfig(null);
        return;
      }

      // 3. Check hash for project view
      const hash = window.location.hash;
      if (hash && hash.startsWith('#project-')) {
        const projId = hash.replace('#project-', '');
        const targetProj = projectsRef.current.find((p) => String(p.id) === String(projId));
        if (targetProj) {
          setSelectedProject(targetProj);
          setCurrentView('project');
          document.title = `${targetProj.clientName || 'Project'} • Studio Sync`;
          return;
        }
      }

      // 4. Default: return safely to Dashboard
      setSelectedProject(null);
      setCurrentView('dashboard');
      document.title = 'Studio Sync';

      // Keep user protected from exiting the app when on dashboard
      window.history.pushState({ view: 'dashboard' }, '', '#dashboard');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [clientGalleryToken]);

  const loadProjects = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await getProjects();
      setProjects(data || []);

      // If page was loaded with a specific project hash (e.g. #project-xyz)
      const hash = window.location.hash;
      const currentSelected = selectedProjectRef.current;
      if (!currentSelected && hash && hash.startsWith('#project-')) {
        const projId = hash.replace('#project-', '');
        const found = (data || []).find((p) => String(p.id) === String(projId));
        if (found) {
          setSelectedProject(found);
          setCurrentView('project');
          document.title = `${found.clientName || 'Project'} • Studio Sync`;
        }
      } else if (currentSelected) {
        const found = (data || []).find((p) => p.id === currentSelected.id);
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
    window.history.pushState({ view: 'project', projectId: project.id }, '', `#project-${project.id}`);
    document.title = `${project.clientName || 'Project'} • Studio Sync`;
  };

  const handleBackToDashboard = () => {
    if (currentViewRef.current === 'dashboard' && !selectedProjectRef.current) return;
    setSelectedProject(null);
    setCurrentView('dashboard');
    document.title = 'Studio Sync';
    if (window.location.hash && window.location.hash !== '#dashboard') {
      window.history.pushState({ view: 'dashboard' }, '', '#dashboard');
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedProject?.id === id) {
        handleBackToDashboard();
      }
    } catch (err) {
      alert(`Delete error: ${err.message}`);
    }
  };

  // Modal open/close helpers that coordinate with browser history
  const handleOpenNewProject = () => {
    setIsNewProjectOpen(true);
    window.history.pushState({ view: 'modal' }, '', window.location.hash);
  };
  const handleCloseNewProject = () => {
    setIsNewProjectOpen(false);
    if (window.history.state?.view === 'modal') {
      window.history.back();
    }
  };

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
    window.history.pushState({ view: 'modal' }, '', window.location.hash);
  };
  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    if (window.history.state?.view === 'modal') {
      window.history.back();
    }
  };

  const handleOpenSyncModal = (proj) => {
    setSyncModalProject(proj);
    window.history.pushState({ view: 'modal' }, '', window.location.hash);
  };
  const handleCloseSyncModal = () => {
    setSyncModalProject(null);
    if (window.history.state?.view === 'modal') {
      window.history.back();
    }
  };

  const handleOpenShareModal = (proj) => {
    setShareModalProject(proj);
    window.history.pushState({ view: 'modal' }, '', window.location.hash);
  };
  const handleCloseShareModal = () => {
    setShareModalProject(null);
    if (window.history.state?.view === 'modal') {
      window.history.back();
    }
  };

  const handleOpenLightbox = (images, index) => {
    setLightboxData({ images, index });
    window.history.pushState({ view: 'lightbox' }, '', window.location.hash);
  };
  const handleCloseLightbox = () => {
    setLightboxData(null);
    if (window.history.state?.view === 'lightbox') {
      window.history.back();
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
            handleBackToDashboard();
          } else {
            setCurrentView(view);
          }
        }}
        selectedProject={selectedProject}
        onOpenNewProject={handleOpenNewProject}
        onOpenSettings={handleOpenSettings}
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
            onOpenNewProject={handleOpenNewProject}
            onOpenSyncModal={handleOpenSyncModal}
            onOpenShareModal={handleOpenShareModal}
            onDeleteProject={handleDeleteProject}
          />
        ) : selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            onBack={handleBackToDashboard}
            onOpenSyncModal={handleOpenSyncModal}
            onOpenShareModal={handleOpenShareModal}
            onUpdateProject={(updated) => {
              if (typeof updated === 'function') {
                setSelectedProject(updated);
              } else {
                setSelectedProject(updated);
              }
              loadProjects();
            }}
            onOpenLightbox={handleOpenLightbox}
          />
        ) : (
          <div className="text-center py-20 text-xs text-slate-400">Loading project...</div>
        )}
      </main>

      {/* Modals */}
      {isNewProjectOpen && (
        <CreateProjectModal
          onClose={handleCloseNewProject}
          onCreated={(newProj) => {
            setProjects((prev) => [newProj, ...prev]);
            handleSelectProject(newProj);
          }}
          onBrowseFolder={(callback, title) => openFolderPicker(callback, title)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal onClose={handleCloseSettings} />
      )}

      {syncModalProject && (
        <LocalSyncModal
          project={syncModalProject}
          onClose={handleCloseSyncModal}
          onBrowseFolder={(callback, title, initialPath) => openFolderPicker(callback, title, initialPath)}
          onSyncSuccess={() => {
            loadProjects();
          }}
        />
      )}

      {shareModalProject && (
        <ShareModal
          project={shareModalProject}
          onClose={handleCloseShareModal}
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
          onClose={handleCloseLightbox}
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
