import React, { useState, useEffect, useMemo } from 'react';
import {
  Heart,
  Ban,
  CheckCircle,
  Sparkles,
  Users,
  Send,
  MessageSquare,
  Camera,
  Check,
  ChevronRight,
  Filter,
  Folder
} from 'lucide-react';
import confetti from 'canvas-confetti';
import PhotoCard from '../components/PhotoCard';
import LightboxModal from '../components/LightboxModal';
import { getGallery, voteImage, submitGallery } from '../api';
import { socket } from '../socket';

export default function ClientGallery({ token }) {
  const [gallery, setGallery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'selected' | 'rejected' | 'unreviewed'
  const [subfolderFilter, setSubfolderFilter] = useState('all');
  const [activeViewers, setActiveViewers] = useState(1);
  const [voterName, setVoterName] = useState('Client');

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Submit modal state
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  useEffect(() => {
    loadGalleryData();
  }, [token]);

  const loadGalleryData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getGallery(token);
      setGallery(data);
      if (data.status === 'submitted') {
        setSubmittedSuccess(true);
      }
    } catch (err) {
      setError(err.message || 'Gallery not found or expired');
    } finally {
      setLoading(false);
    }
  };

  // Real-time collaborative synchronization via WebSocket
  useEffect(() => {
    if (!token) return;

    socket.connect();
    socket.joinRoom(`gallery:${token}`);

    const unsubRoomState = socket.on('ROOM_STATE', (data) => {
      if (data.activeViewers) {
        setActiveViewers(data.activeViewers);
      }
    });

    const unsubVoteUpdated = socket.on('VOTE_UPDATED', (data) => {
      if (data.token === token) {
        setGallery((prev) => {
          if (!prev) return prev;
          const updatedImages = prev.images.map((img) =>
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
      if (data.token === token) {
        setGallery((prev) => (prev ? { ...prev, status: 'submitted', stats: data.stats } : prev));
        setSubmittedSuccess(true);
      }
    });

    return () => {
      unsubRoomState();
      unsubVoteUpdated();
      unsubSubmitted();
      socket.leaveRoom(`gallery:${token}`);
    };
  }, [token]);

  const handleVote = async (image, targetStatus) => {
    const currentStatus = image.status;
    const newStatus = currentStatus === targetStatus ? 'unreviewed' : targetStatus;

    // Optimistic UI update
    setGallery((prev) => {
      if (!prev) return prev;
      const updatedImages = prev.images.map((img) =>
        img.id === image.id ? { ...img, status: newStatus } : img
      );
      return { ...prev, images: updatedImages };
    });

    try {
      await voteImage(token, image.id, newStatus, null, voterName);
    } catch (err) {
      console.error('Vote error:', err);
      // Revert if error
      loadGalleryData();
    }
  };

  const handleUpdateComment = async (image, comment) => {
    try {
      await voteImage(token, image.id, image.status || 'unreviewed', comment, voterName);
      setGallery((prev) => {
        if (!prev) return prev;
        const updatedImages = prev.images.map((img) =>
          img.id === image.id ? { ...img, comment } : img
        );
        return { ...prev, images: updatedImages };
      });
    } catch (err) {
      console.error('Comment error:', err);
    }
  };

  const handleSubmitSelection = async () => {
    try {
      setIsSubmitting(true);
      await submitGallery(token, submissionNotes, voterName);
      setSubmittedSuccess(true);
      setShowSubmitModal(false);

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#e11d48', '#facc15', '#38bdf8', '#4ade80'],
        });
      } catch (e) {
        // ignore
      }
    } catch (err) {
      alert(`Submission error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const images = gallery?.images || [];
  const selectedCount = images.filter((img) => img.status === 'selected').length;
  const rejectedCount = images.filter((img) => img.status === 'rejected').length;
  const unreviewedCount = images.filter((img) => !img.status || img.status === 'unreviewed').length;

  const availableSubfolders = useMemo(() => {
    const set = new Set();
    images.forEach((img) => {
      if (img.subfolder) set.add(img.subfolder);
    });
    return Array.from(set).sort();
  }, [images]);

  const filteredImages = useMemo(() => {
    return images.filter((img) => {
      if (subfolderFilter !== 'all' && img.subfolder !== subfolderFilter) return false;
      if (filter === 'selected') return img.status === 'selected';
      if (filter === 'rejected') return img.status === 'rejected';
      if (filter === 'unreviewed') return !img.status || img.status === 'unreviewed';
      return true;
    });
  }, [images, subfolderFilter, filter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e1015] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400 font-mono tracking-wider">Loading your gallery...</p>
        </div>
      </div>
    );
  }

  if (error || !gallery) {
    return (
      <div className="min-h-screen bg-[#0e1015] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-2xl bg-[#141720] border border-white/10 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
            <Ban className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Gallery Unavailable</h2>
          <p className="text-xs text-slate-400">{error || 'This gallery link does not exist.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e1015] text-slate-100 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      
      {/* Client Header */}
      <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-[#0e1015]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          
          {/* Studio & Project Details */}
          <div>
            <div className="flex items-center space-x-2">
              <Camera className="w-4 h-4 text-rose-500" />
              <span className="text-xs uppercase font-bold tracking-widest text-slate-400 font-sans">
                Unique Moment Photography
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white font-sans tracking-tight">
              {gallery.clientName}
            </h1>
          </div>

          {/* Real-time Collaboration Badge & Voter Identity */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>{activeViewers} viewing & shortlisting</span>
            </div>

            {submittedSuccess ? (
              <span className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-semibold">
                <CheckCircle className="w-4 h-4" />
                <span>Submitted</span>
              </span>
            ) : (
              <button
                onClick={() => setShowSubmitModal(true)}
                disabled={selectedCount === 0}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/30 transition-all disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Selection ({selectedCount})</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Main Gallery Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        
        {/* Submitted Success Banner */}
        {submittedSuccess && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-sm text-white">Your Selections Have Been Submitted!</h4>
                <p className="text-xs text-emerald-300/80">
                  The studio has received your shortlist of <strong>{selectedCount} photos</strong> for final master editing.
                </p>
              </div>
            </div>
            <Sparkles className="w-5 h-5 text-amber-400 hidden sm:block" />
          </div>
        )}

        {/* Subfolder Filter Bar */}
        {availableSubfolders.length > 0 && (
          <div className="flex items-center space-x-2 overflow-x-auto pb-2">
            <span className="text-xs text-slate-400 font-medium flex items-center space-x-1 shrink-0">
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              <span>Folders:</span>
            </span>
            <button
              onClick={() => setSubfolderFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-all shrink-0 ${
                subfolderFilter === 'all'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              All Folders ({images.length})
            </button>
            {availableSubfolders.map((sub) => {
              const count = images.filter((img) => img.subfolder === sub).length;
              return (
                <button
                  key={sub}
                  onClick={() => setSubfolderFilter(sub)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all shrink-0 ${
                    subfolderFilter === sub
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  📁 {sub} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Filter Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center space-x-1 bg-white/5 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'all'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Photos ({images.length})
            </button>
            <button
              onClick={() => setFilter('selected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'selected'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ❤️ Selected ({selectedCount})
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'rejected'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ❌ Rejected ({rejectedCount})
            </button>
            <button
              onClick={() => setFilter('unreviewed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'unreviewed'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⏳ Unreviewed ({unreviewedCount})
            </button>
          </div>

          <div className="text-xs text-slate-400 hidden sm:block">
            Showing <strong className="text-white">{filteredImages.length}</strong> photos
          </div>
        </div>

        {/* Photo Grid */}
        {filteredImages.length === 0 ? (
          <div className="py-24 text-center rounded-2xl bg-[#141720] border border-white/10 text-xs text-slate-400">
            No photos found in this filter category.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {filteredImages.map((image) => (
              <PhotoCard
                key={image.id}
                image={image}
                isClientView={true}
                showCompressionStats={false}
                onSelect={(img) => handleVote(img, 'selected')}
                onReject={(img) => handleVote(img, 'rejected')}
                onOpenLightbox={(img) => {
                  const idx = filteredImages.findIndex((i) => i.id === img.id);
                  setLightboxIndex(idx);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Bottom Sticky Selection Dock (Mobile & Desktop) */}
      {!submittedSuccess && (
        <div className="sticky bottom-0 z-30 w-full bg-[#12151c]/95 backdrop-blur-lg border-t border-white/10 py-3 px-4 shadow-2xl">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                <span className="font-bold text-sm text-white font-mono">{selectedCount}</span>
                <span className="text-xs text-slate-400">Shortlisted</span>
              </div>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                {unreviewedCount} left to review
              </span>
            </div>

            <button
              onClick={() => setShowSubmitModal(true)}
              disabled={selectedCount === 0}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/30 transition-all disabled:opacity-40"
            >
              <span>Submit Selection</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxIndex !== null && (
        <LightboxModal
          images={filteredImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onSelect={(img) => handleVote(img, 'selected')}
          onReject={(img) => handleVote(img, 'rejected')}
          onUpdateComment={handleUpdateComment}
        />
      )}

      {/* Final Submission Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141720] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20">
                <Heart className="w-6 h-6 fill-rose-500" />
              </div>
              <h3 className="text-base font-bold text-white">Finalize & Submit Selection</h3>
              <p className="text-xs text-slate-400">
                You have selected <strong className="text-rose-400">{selectedCount} photos</strong> for final master editing and retouching.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Your Name / Identity
                </label>
                <input
                  type="text"
                  value={voterName}
                  onChange={(e) => setVoterName(e.target.value)}
                  placeholder="e.g. Sarah Sterling"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Notes for the Photographer (Optional)
                </label>
                <textarea
                  rows={3}
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  placeholder="e.g. Please use photo #12 for the main album cover, and lighten shadows in family portraits..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium transition-colors"
              >
                Back to Review
              </button>
              <button
                type="button"
                onClick={handleSubmitSelection}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
