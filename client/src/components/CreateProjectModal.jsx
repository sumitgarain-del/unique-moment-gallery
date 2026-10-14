import React, { useState } from 'react';
import { X, Folder, Calendar, User, Tag, FileText, Sparkles, Loader2 } from 'lucide-react';
import { createProject, importFolder, browseNativeFolder } from '../api';

export default function CreateProjectModal({ onClose, onCreated, onBrowseFolder }) {
  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    eventDate: new Date().toISOString().split('T')[0],
    shootType: 'Wedding',
    notes: '',
    masterFolderPath: '',
    outputFolderPath: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [error, setError] = useState('');

  const handleBrowseMaster = async () => {
    try {
      setIsBrowsing(true);
      const res = await browseNativeFolder('Select Master Photos Folder', formData.masterFolderPath);
      const chosenPath = res?.path || res?.folderPath;
      if (chosenPath) {
        setFormData((prev) => ({ ...prev, masterFolderPath: chosenPath }));
        return;
      }
      if (res && res.cancelled) return;
    } catch (err) {
      console.warn('Native browse failed, using fallback:', err);
      if (onBrowseFolder) {
        onBrowseFolder((chosenPath) => setFormData((prev) => ({ ...prev, masterFolderPath: chosenPath })), 'Select Master Photos Folder', formData.masterFolderPath);
      }
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.clientName.trim()) {
      setError('Please provide the Client Name');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      const project = await createProject(formData);

      // If Master Folder provided, auto-trigger scan, proxy compression & Google Drive backup!
      if (formData.masterFolderPath && formData.masterFolderPath.trim()) {
        importFolder(project.id, formData.masterFolderPath.trim()).catch((err) => {
          console.warn('Auto import on create failed:', err);
        });
      }

      onCreated(project);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#141720] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Create New Studio Project</h3>
              <p className="text-[11px] text-slate-400">Setup client profile for proxy generation & cloud sync</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Client Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Client Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                required
                placeholder="e.g. Sarah & Michael Sterling"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Shoot Type & Event Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Shoot Type
              </label>
              <div className="relative">
                <Tag className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <select
                  value={formData.shootType}
                  onChange={(e) => setFormData({ ...formData, shootType: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-[#1b1f2b] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="Wedding">Wedding</option>
                  <option value="Pre-Wedding / Engagement">Pre-Wedding / Engagement</option>
                  <option value="Portrait / Headshot">Portrait / Headshot</option>
                  <option value="Fashion / Editorial">Fashion / Editorial</option>
                  <option value="Maternity / Newborn">Maternity / Newborn</option>
                  <option value="Commercial / Product">Commercial / Product</option>
                  <option value="Event / Reception">Event / Reception</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Event Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="date"
                  value={formData.eventDate}
                  onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>
          </div>

          {/* Local Master Folder (Optional initial path) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Local Master Folder <span className="text-slate-500 font-normal">(where original RAW/high-res files reside)</span>
            </label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Folder className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="e.g. D:\Photos\Weddings\2026-Sarah\RAW"
                  value={formData.masterFolderPath}
                  onChange={(e) => setFormData({ ...formData, masterFolderPath: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <button
                type="button"
                onClick={handleBrowseMaster}
                disabled={isBrowsing}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs font-medium transition-colors disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isBrowsing && <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />}
                <span>{isBrowsing ? 'Opening...' : 'Browse'}</span>
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Notes & Client Requests
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Deliverable: 50 album retouches, warm cinematic grading"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-medium shadow-lg shadow-rose-600/30 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'Creating Project...' : 'Create Project'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
