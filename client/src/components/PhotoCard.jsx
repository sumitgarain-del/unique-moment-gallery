import React from 'react';
import { Heart, X, MessageSquare, ZoomIn, Check, Sparkles } from 'lucide-react';

export default function PhotoCard({
  image,
  onSelect,
  onReject,
  onOpenLightbox,
  isClientView = false,
  showCompressionStats = true,
}) {
  const isSelected = image.status === 'selected';
  const isRejected = image.status === 'rejected';

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const gdriveSrc = image.gdriveId ? `https://lh3.googleusercontent.com/d/${image.gdriveId}` : null;
  const displaySrc = gdriveSrc || image.proxyUrl;

  return (
    <div
      className={`group relative rounded-xl overflow-hidden bg-[#161a23] border transition-all duration-200 select-none ${
        isSelected
          ? 'border-rose-500 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500'
          : isRejected
          ? 'border-red-950/60 opacity-60 hover:opacity-85'
          : 'border-white/10 hover:border-white/20'
      }`}
    >
      {/* Image Thumbnail Container */}
      <div
        className="relative aspect-[3/2] overflow-hidden cursor-pointer bg-[#12151c]"
        onClick={() => onOpenLightbox(image)}
      >
        <img
          src={displaySrc}
          onError={(e) => {
            if (image.proxyUrl && e.target.src !== image.proxyUrl) {
              e.target.src = image.proxyUrl;
            }
          }}
          alt={image.originalName}
          loading="lazy"
          className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
            isRejected ? 'filter grayscale contrast-125' : ''
          }`}
        />

        {/* Hover overlay hint */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <div className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white/90">
            <ZoomIn className="w-5 h-5" />
          </div>
        </div>

        {/* Status Badge in Top-Right Corner */}
        <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 z-10">
          {isSelected && (
            <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-600 text-white shadow-md shadow-rose-950/80 animate-fade-in">
              <Heart className="w-3.5 h-3.5 fill-white" />
              <span>Selected</span>
            </span>
          )}

          {isRejected && (
            <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-900/90 text-red-400 border border-red-500/30">
              <X className="w-3.5 h-3.5" />
              <span>Rejected</span>
            </span>
          )}

          {image.comment && (
            <span
              className="p-1.5 rounded-full bg-black/75 backdrop-blur-md text-amber-300 border border-amber-400/30"
              title={image.comment}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        {/* Savings Badge for Photographer View */}
        {!isClientView && showCompressionStats && image.savingsPercent > 0 && (
          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[10px] font-mono text-emerald-400 border border-emerald-500/30">
            ⚡ {image.savingsPercent}% saved
          </div>
        )}
      </div>

      {/* Card Footer Details & Quick Action Buttons */}
      <div className="p-3 bg-[#141821] flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-slate-200 truncate max-w-[170px]" title={image.originalName}>
            {image.originalName}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {formatSize(image.proxySize)}
          </span>
        </div>

        {image.subfolder && (
          <div className="text-[10px] font-mono text-amber-300/90 truncate flex items-center space-x-1" title={`Folder: ${image.subfolder}`}>
            <span className="truncate">📁 {image.subfolder}</span>
          </div>
        )}

        {/* Quick Selection Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(image);
            }}
            className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
              isSelected
                ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40 ring-1 ring-rose-400'
                : 'bg-white/5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-400 border border-white/5'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isSelected ? 'fill-white text-white' : 'text-rose-400'}`} />
            <span>{isSelected ? 'Shortlisted' : 'Select'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReject(image);
            }}
            className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
              isRejected
                ? 'bg-neutral-800 text-red-400 border border-red-500/40'
                : 'bg-white/5 text-slate-300 hover:bg-red-500/20 hover:text-red-400 border border-white/5'
            }`}
          >
            <X className="w-3.5 h-3.5 text-red-400" />
            <span>{isRejected ? 'Rejected' : 'Reject'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
