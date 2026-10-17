import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Heart,
  Ban,
  MessageSquare,
  Check,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Folder
} from 'lucide-react';

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

  // Zoom & Pan state (strictly clamped to max 1.5x)
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);

  // Interactive Slide & Swipe Animation state
  const [slideOffset, setSlideOffset] = useState(0);
  const [slideOpacity, setSlideOpacity] = useState(1);
  const [isDraggingSlide, setIsDraggingSlide] = useState(false);

  // Refs for gesture tracking & animation lock
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const initialTouchDistanceRef = useRef(0);
  const initialScaleRef = useRef(1);
  const isPinchingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isSwipingSlideRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const lastTapRef = useRef(0);
  const currentPosRef = useRef({ x: 0, y: 0 });

  const currentImage = images[index] || null;

  useEffect(() => {
    setIndex(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    if (currentImage) {
      setCommentText(currentImage.comment || '');
    }
  }, [currentImage]);

  // Reset zoom & pan when photo changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    currentPosRef.current = { x: 0, y: 0 };
    isPinchingRef.current = false;
    isPanningRef.current = false;
  }, [index]);

  // Prefetch adjacent photos for instant, zero-delay sliding
  useEffect(() => {
    const prefetch = (img) => {
      if (!img) return;
      const src = img.gdriveId
        ? `https://lh3.googleusercontent.com/d/${img.gdriveId}`
        : img.proxyUrl;
      if (src) {
        const link = new Image();
        link.src = src;
      }
    };
    if (images[index + 1]) prefetch(images[index + 1]);
    if (images[index - 1]) prefetch(images[index - 1]);
    if (images[index + 2]) prefetch(images[index + 2]);
  }, [index, images]);

  // Smooth slide navigation transitions
  const goToNext = () => {
    if (isAnimatingRef.current || index >= images.length - 1) return;
    isAnimatingRef.current = true;

    // Slide current image out to the left
    setSlideOffset(-window.innerWidth * 0.45);
    setSlideOpacity(0.2);

    setTimeout(() => {
      setIndex((prev) => prev + 1);
      // Position new image slightly to the right, ready to slide in
      setSlideOffset(window.innerWidth * 0.35);
      setSlideOpacity(0.2);

      requestAnimationFrame(() => {
        setTimeout(() => {
          setSlideOffset(0);
          setSlideOpacity(1);
          setTimeout(() => {
            isAnimatingRef.current = false;
          }, 240);
        }, 20);
      });
    }, 180);
  };

  const goToPrev = () => {
    if (isAnimatingRef.current || index <= 0) return;
    isAnimatingRef.current = true;

    // Slide current image out to the right
    setSlideOffset(window.innerWidth * 0.45);
    setSlideOpacity(0.2);

    setTimeout(() => {
      setIndex((prev) => prev - 1);
      // Position new image slightly to the left, ready to slide in
      setSlideOffset(-window.innerWidth * 0.35);
      setSlideOpacity(0.2);

      requestAnimationFrame(() => {
        setTimeout(() => {
          setSlideOffset(0);
          setSlideOpacity(1);
          setTimeout(() => {
            isAnimatingRef.current = false;
          }, 240);
        }, 20);
      });
    }, 180);
  };

  const toggleZoom = () => {
    if (scale > 1.05) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      currentPosRef.current = { x: 0, y: 0 };
    } else {
      setScale(1.5);
      setPosition({ x: 0, y: 0 });
      currentPosRef.current = { x: 0, y: 0 };
    }
  };

  // Keyboard navigation & quick shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditingComment) return;

      if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'Escape') {
        if (scale > 1.05) {
          setScale(1);
          setPosition({ x: 0, y: 0 });
          currentPosRef.current = { x: 0, y: 0 };
        } else {
          onClose();
        }
      } else if (e.key.toLowerCase() === 's' || e.key === '1') {
        if (currentImage) onSelect(currentImage);
      } else if (e.key.toLowerCase() === 'r' || e.key === '2') {
        if (currentImage) onReject(currentImage);
      } else if (e.key === '+' || e.key === '=') {
        toggleZoom();
      } else if (e.key === '-' || e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, currentImage, isEditingComment, images, scale]);

  // Mobile Touch Event Handlers (Swipe Slide + Pinch Zoom)
  const handleTouchStart = (e) => {
    if (isAnimatingRef.current) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };

      // Double tap detection (within 280ms)
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        toggleZoom();
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (scale > 1.05) {
        // Zoomed in: pan mode
        isPanningRef.current = true;
        isSwipingSlideRef.current = false;
        setIsDraggingPan(true);
      } else {
        // Normal scale: ready for interactive slide gesture
        isSwipingSlideRef.current = true;
        isPanningRef.current = false;
      }
    } else if (e.touches.length === 2) {
      // Two fingers: Pinch to Zoom
      isPinchingRef.current = true;
      isPanningRef.current = false;
      isSwipingSlideRef.current = false;
      setIsDraggingSlide(false);
      setIsDraggingPan(false);

      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialTouchDistanceRef.current = dist;
      initialScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e) => {
    if (isAnimatingRef.current) return;

    if (e.touches.length === 2 && isPinchingRef.current) {
      // Pinch to Zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (initialTouchDistanceRef.current > 0) {
        const factor = dist / initialTouchDistanceRef.current;
        let newScale = initialScaleRef.current * factor;
        // Strictly clamp between 1.0x and 1.5x as requested
        newScale = Math.max(1, Math.min(1.5, newScale));
        setScale(newScale);
        if (newScale <= 1.03) {
          setPosition({ x: 0, y: 0 });
          currentPosRef.current = { x: 0, y: 0 };
        }
      }
    } else if (e.touches.length === 1 && scale > 1.05 && isPanningRef.current) {
      // Panning zoomed photo
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;

      const maxPanX = (scale - 1) * 140;
      const maxPanY = (scale - 1) * 140;
      const newX = Math.max(-maxPanX, Math.min(maxPanX, currentPosRef.current.x + dx));
      const newY = Math.max(-maxPanY, Math.min(maxPanY, currentPosRef.current.y + dy));
      setPosition({ x: newX, y: newY });
    } else if (e.touches.length === 1 && scale <= 1.05 && isSwipingSlideRef.current) {
      // Interactive Slide Drag (Finger following)
      const touch = e.touches[0];
      let dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      // Only track if horizontal movement dominates
      if (Math.abs(dx) > Math.abs(dy) * 0.9) {
        setIsDraggingSlide(true);

        // Rubber-band resistance at boundaries
        if (index === 0 && dx > 0) {
          dx = dx * 0.32;
        } else if (index === images.length - 1 && dx < 0) {
          dx = dx * 0.32;
        }

        setSlideOffset(dx);
        const screenW = window.innerWidth || 400;
        const opacityProgress = Math.max(0.6, 1 - (Math.abs(dx) / screenW) * 0.45);
        setSlideOpacity(opacityProgress);
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (isPinchingRef.current) {
      isPinchingRef.current = false;
      if (scale < 1.06) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        currentPosRef.current = { x: 0, y: 0 };
      }
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsDraggingPan(false);
      currentPosRef.current = { ...position };
    }

    if (isSwipingSlideRef.current) {
      isSwipingSlideRef.current = false;
      setIsDraggingSlide(false);

      if (e.changedTouches && e.changedTouches.length === 1) {
        const endTouch = e.changedTouches[0];
        const deltaX = endTouch.clientX - touchStartRef.current.x;
        const deltaY = endTouch.clientY - touchStartRef.current.y;
        const duration = Date.now() - touchStartRef.current.time;
        const velocity = Math.abs(deltaX) / Math.max(duration, 1);

        const screenW = window.innerWidth || 400;
        const threshold = Math.min(80, screenW * 0.2);

        // Swiped Left -> Next Photo
        if ((deltaX < -threshold || (velocity > 0.35 && deltaX < -30)) && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
          if (index < images.length - 1) {
            isAnimatingRef.current = true;
            // Smoothly complete the slide out to the left
            setSlideOffset(-screenW * 0.85);
            setSlideOpacity(0.1);

            setTimeout(() => {
              setIndex((prev) => prev + 1);
              // Prepare next photo entering from right
              setSlideOffset(screenW * 0.4);
              setSlideOpacity(0.2);

              requestAnimationFrame(() => {
                setTimeout(() => {
                  setSlideOffset(0);
                  setSlideOpacity(1);
                  setTimeout(() => {
                    isAnimatingRef.current = false;
                  }, 240);
                }, 20);
              });
            }, 180);
            return;
          }
        }

        // Swiped Right -> Previous Photo
        if ((deltaX > threshold || (velocity > 0.35 && deltaX > 30)) && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
          if (index > 0) {
            isAnimatingRef.current = true;
            // Smoothly complete the slide out to the right
            setSlideOffset(screenW * 0.85);
            setSlideOpacity(0.1);

            setTimeout(() => {
              setIndex((prev) => prev - 1);
              // Prepare previous photo entering from left
              setSlideOffset(-screenW * 0.4);
              setSlideOpacity(0.2);

              requestAnimationFrame(() => {
                setTimeout(() => {
                  setSlideOffset(0);
                  setSlideOpacity(1);
                  setTimeout(() => {
                    isAnimatingRef.current = false;
                  }, 240);
                }, 20);
              });
            }, 180);
            return;
          }
        }

        // Did not cross threshold -> smooth spring snap back to center
        setSlideOffset(0);
        setSlideOpacity(1);
      }
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
  const isZoomed = scale > 1.05;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between select-none">
      
      {/* Top Header Controls */}
      <div className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-white/10 bg-black/40 z-30">
        <div className="flex items-center space-x-3 overflow-hidden">
          <span className="font-mono text-sm font-semibold text-slate-200 truncate max-w-[150px] sm:max-w-none">
            {currentImage.originalName}
          </span>
          <span className="text-xs text-slate-500 font-mono shrink-0">
            ({index + 1} of {images.length})
          </span>
          {currentImage.subfolder && (
            <span className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
              <Folder className="w-3 h-3 text-amber-400" />
              <span>{currentImage.subfolder}</span>
            </span>
          )}
        </div>

        {/* Center / Right Control Actions */}
        <div className="flex items-center space-x-2">
          {/* Zoom Toggle Button (1.0x <-> 1.5x) */}
          <button
            onClick={toggleZoom}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium transition-all ${
              isZoomed
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white'
            }`}
            title="Toggle 1.5x Zoom (or double tap image)"
          >
            {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
            <span>{isZoomed ? '1.5x (Reset)' : '1.0x Zoom'}</span>
          </button>

          {/* Hotkey helper pill for desktop */}
          <div className="hidden lg:flex items-center space-x-2 text-[11px] text-slate-400 font-mono bg-white/5 px-3 py-1 rounded-full border border-white/5">
            <span>Keys:</span>
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">S</span>
            <span>Select</span>
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">R</span>
            <span>Reject</span>
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">← →</span>
            <span>Slide</span>
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
      </div>

      {/* Main Photo Viewing Area with Interactive Touch Slide & Zoom */}
      <div
        className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Left Arrow (Desktop / Tablet) */}
        {index > 0 && !isZoomed && (
          <button
            onClick={goToPrev}
            className="hidden sm:flex absolute left-4 z-20 p-3 rounded-full bg-black/60 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-md transition-all shadow-xl"
            title="Previous Photo (Left Arrow / Swipe Right)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Zoom Hint Banner */}
        {isZoomed && (
          <div className="absolute top-3 z-20 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-amber-500/30 text-[11px] font-mono text-amber-300 flex items-center space-x-1.5 shadow-lg animate-fade-in pointer-events-none">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>1.5x Max Preview Zoom • Drag to pan • Double tap to reset</span>
          </div>
        )}

        {/* Image Display Container with Real-Time Slide & Zoom Animation */}
        <div
          className="max-w-full max-h-[75vh] flex items-center justify-center cursor-pointer select-none will-change-transform"
          onDoubleClick={toggleZoom}
          style={{
            transform: isZoomed
              ? `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`
              : `translateX(${slideOffset}px) rotate(${slideOffset * 0.015}deg)`,
            opacity: isZoomed ? 1 : slideOpacity,
            transition: isDraggingSlide || isDraggingPan || isPinchingRef.current
              ? 'none'
              : 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.26s ease-out',
          }}
        >
          <img
            src={currentImage.gdriveId ? `https://lh3.googleusercontent.com/d/${currentImage.gdriveId}` : currentImage.proxyUrl}
            onError={(e) => {
              if (currentImage.proxyUrl && e.target.src !== currentImage.proxyUrl) {
                e.target.src = currentImage.proxyUrl;
              }
            }}
            alt={currentImage.originalName}
            draggable={false}
            className={`max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl transition-opacity duration-200 pointer-events-none ${
              isRejected ? 'filter grayscale contrast-125 opacity-70' : ''
            }`}
          />
        </div>

        {/* Right Arrow (Desktop / Tablet) */}
        {index < images.length - 1 && !isZoomed && (
          <button
            onClick={goToNext}
            className="hidden sm:flex absolute right-4 z-20 p-3 rounded-full bg-black/60 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-md transition-all shadow-xl"
            title="Next Photo (Right Arrow / Swipe Left)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="p-3 sm:p-6 border-t border-white/10 bg-black/70 flex flex-col sm:flex-row items-center justify-between gap-3 z-30">
        
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
