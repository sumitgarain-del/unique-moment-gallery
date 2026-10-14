import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Heart, Ban, MessageSquare, Check, Sparkles } from 'lucide-react';

export default function LightboxModal({
  images = [],
  currentIndex = 0,
  onClose,
  onSelect,
  onReject,
  onUpdateComment,
}) {
  const [index, setIndex] = useState(currentIndex);
  const [commentText, setCommentText] = useState('');
  const [isEditingComment, setIsEditingComment] = useState(false);

  const currentImage = images[index] || null;

  useEffect(() => {
    setIndex(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    if (currentImage) {
      setCommentText(currentImage.comment || '');
    }
  }, [currentImage]);

  // Keyboard navigation & quick shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditingComment) return; // don't trigger hotkeys while typing comment

      if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key.toLowerCase() === 's' || e.key === '1') {
        if (currentImage) onSelect(currentImage);
      } else if (e.key.toLowerCase() === 'r' || e.key === '2') {
        if (currentImage) onReject(currentImage);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, currentImage, isEditingComment, images]);

  const goToNext = () => {
    if (index < images.length - 1) {
      setIndex(index + 1);
    }
  };

  const goToPrev = () => {
    if (index > 0) {
      setIndex(index - 1);
    }
  };

  const saveComment = () => {
    if (currentImage && onUpdateComment) {
      onUpdateComment(currentImage, commentText);
    }
    setIsEditingComment(false);
  };

  if (!currentImage) return null;

  const isSelected = currentImage.status === 'selected';
  const isRejected = currentImage.status === 'rejected';

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between select-none">
      
      {/* Top Header Controls */}
      <div className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-white/10 bg-black/40">
        <div className="flex items-center space-x-3">
          <span className="font-mono text-sm font-semibold text-slate-200">
            {currentImage.originalName}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            ({index + 1} of {images.length})
          </span>
          {currentImage.width && (
            <span className="hidden sm:inline text-xs text-slate-500 font-mono">
              • {currentImage.width}×{currentImage.height}
            </span>
          )}
        </div>

        {/* Hotkey helper pill */}
        <div className="hidden md:flex items-center space-x-2 text-[11px] text-slate-400 font-mono bg-white/5 px-3 py-1 rounded-full border border-white/5">
          <span>Hotkeys:</span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">S</span>
          <span>Select</span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">R</span>
          <span>Reject</span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">← →</span>
          <span>Nav</span>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Photo Viewing Area */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
        
        {/* Left Arrow */}
        {index > 0 && (
          <button
            onClick={goToPrev}
            className="absolute left-4 z-20 p-3 rounded-full bg-black/60 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-md transition-all shadow-xl"
            title="Previous Photo (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Image Display */}
        <div className="max-w-full max-h-[75vh] flex items-center justify-center">
          <img
            src={currentImage.gdriveId ? `https://lh3.googleusercontent.com/d/${currentImage.gdriveId}` : currentImage.proxyUrl}
            onError={(e) => {
              if (currentImage.proxyUrl && e.target.src !== currentImage.proxyUrl) {
                e.target.src = currentImage.proxyUrl;
              }
            }}
            alt={currentImage.originalName}
            className={`max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl transition-all duration-200 ${
              isRejected ? 'filter grayscale contrast-125 opacity-70' : ''
            }`}
          />
        </div>

        {/* Right Arrow */}
        {index < images.length - 1 && (
          <button
            onClick={goToNext}
            className="absolute right-4 z-20 p-3 rounded-full bg-black/60 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-md transition-all shadow-xl"
            title="Next Photo (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="p-4 sm:p-6 border-t border-white/10 bg-black/60 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Client Note / Comment Area */}
        <div className="w-full sm:w-auto flex-1 max-w-lg">
          {isEditingComment ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add retouching notes (e.g. skin smoothing, album cover)..."
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveComment();
                }}
              />
              <button
                onClick={saveComment}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditingComment(false)}
                className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div
              onClick={() => setIsEditingComment(true)}
              className="cursor-pointer group flex items-center space-x-2 text-xs text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg border border-white/5 transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span className="truncate">
                {currentImage.comment ? `Note: "${currentImage.comment}"` : 'Add specific photo notes / retouching request...'}
              </span>
            </div>
          )}
        </div>

        {/* Selection Decision Buttons */}
        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          <button
            onClick={() => onReject(currentImage)}
            className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl font-medium text-xs transition-all ${
              isRejected
                ? 'bg-neutral-800 text-red-400 border border-red-500/50 shadow-lg'
                : 'bg-white/10 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-white/10'
            }`}
          >
            <Ban className="w-4 h-4 text-red-400" />
            <span>{isRejected ? 'Rejected ❌' : 'Reject Photo'}</span>
          </button>

          <button
            onClick={() => onSelect(currentImage)}
            className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl font-medium text-xs transition-all ${
              isSelected
                ? 'bg-rose-600 text-white shadow-xl shadow-rose-900/50 ring-2 ring-rose-400'
                : 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-lg'
            }`}
          >
            <Heart className={`w-4 h-4 ${isSelected ? 'fill-white' : ''}`} />
            <span>{isSelected ? 'Shortlisted ❤️' : 'Select Photo ❤️'}</span>
          </button>
        </div>

      </div>

    </div>
  );
}
