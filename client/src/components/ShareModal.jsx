import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  QrCode,
  MessageCircle,
  ExternalLink,
  Loader2,
  Sparkles
} from 'lucide-react';
import { getShareInfo } from '../api';

export default function ShareModal({ project, onClose }) {
  const [shareInfo, setShareInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedType, setCopiedType] = useState(null); // 'link' | 'qr'

  useEffect(() => {
    loadInfo();
  }, [project.token]);

  const loadInfo = async () => {
    try {
      setLoading(true);
      const info = await getShareInfo(project.token);
      setShareInfo(info);
    } catch (err) {
      console.error('Failed to load share info:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleCopyQrImage = async () => {
    try {
      const qrUrl = `/api/network/qr-image/${project.token}.png`;
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setCopiedType('qr');
      setTimeout(() => setCopiedType(null), 2500);
    } catch (err) {
      if (shareInfo?.qrImageUrl) {
        navigator.clipboard.writeText(shareInfo.qrImageUrl);
        setCopiedType('qr');
        setTimeout(() => setCopiedType(null), 2500);
      }
    }
  };

  const publicLink =
    shareInfo?.publicLink ||
    (shareInfo?.primaryLink && !shareInfo.primaryLink.includes('localhost') ? shareInfo.primaryLink : '') ||
    `https://spry-teal-c1983ep.vercel.app/gallery/${project.token}`;
  const qrImageUrl =
    shareInfo?.qrImageUrl ||
    (publicLink ? `${publicLink.replace(/\/gallery\/.*$/, '')}/api/network/qr-image/${project.token}.png` : '');

  const whatsappMessage = encodeURIComponent(
    `📸 *Unique Moment Photography*\n` +
    `নমস্কার / Greetings from *Unique Moment*! 🌸\n\n` +
    `Dear *${project.clientName}*,\n` +
    `Here is your private photo selection link from our studio:\n\n` +
    `🔗 *Gallery Link:* ${publicLink}\n` +
    `🖼️ *QR Code Image:* ${qrImageUrl}\n\n` +
    `Please tap the link or scan the QR code to select your favorite photos [❤️ Select] or [❌ Reject], and click "Submit Selection" when finished.\n\n` +
    `Thank you,\n` +
    `Team *Unique Moment* ✨`
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#141720] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Unique Moment • Share Gallery</h3>
              <p className="text-[11px] text-slate-400">Client: <strong className="text-white">{project.clientName}</strong></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
              <span>Generating Worldwide Link & QR Code...</span>
            </div>
          ) : (
            <>
              {/* Option 1: Copy Link */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                    1. Copy Gallery Link
                  </span>
                  <a
                    href={publicLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                  >
                    <span>Open in Browser</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={publicLink || 'Connecting link...'}
                    className="flex-1 px-3.5 py-2.5 bg-black/70 border border-white/10 rounded-xl text-xs font-mono text-blue-300 select-all truncate"
                  />
                  <button
                    onClick={() => handleCopy(publicLink, 'link')}
                    disabled={!publicLink}
                    className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/30 transition-all flex-shrink-0 disabled:opacity-50"
                  >
                    {copiedType === 'link' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Option 2: WhatsApp Share Button */}
              <div>
                <a
                  href={publicLink ? `https://wa.me/?text=${whatsappMessage}` : '#'}
                  target="_blank"
                  rel="noreferrer"
                  className={`w-full flex items-center justify-center space-x-2.5 py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition-all hover:scale-[1.01] ${
                    !publicLink ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <MessageCircle className="w-4 h-4 fill-white" />
                  <span>2. Send via WhatsApp (Unique Moment Greeting + QR Photo)</span>
                </a>
              </div>

              {/* QR Code Card & Direct Copy */}
              <div className="p-4 rounded-xl bg-black/30 border border-white/10 flex items-center gap-4">
                {shareInfo?.qrCode ? (
                  <div className="p-2 rounded-xl bg-white flex-shrink-0 shadow-lg">
                    <img src={shareInfo.qrCode} alt="Client Gallery QR Code" className="w-24 h-24" />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 flex-shrink-0">
                    <QrCode className="w-8 h-8 animate-pulse" />
                  </div>
                )}

                <div className="space-y-2 flex-1">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <QrCode className="w-3.5 h-3.5 text-pink-400" />
                      <span>Instant Mobile QR Code</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Client can scan this QR using any mobile camera to open their gallery instantly.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyQrImage}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/10 transition-colors"
                    title="Copy QR image to paste directly into WhatsApp"
                  >
                    {copiedType === 'qr' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>QR Image Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy QR Image</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-white/[0.02] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
