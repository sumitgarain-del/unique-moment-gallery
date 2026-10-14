import React, { useState, useEffect } from 'react';
import { X, Cloud, HardDrive, Key, CheckCircle, AlertTriangle, ShieldCheck, Save, Sparkles, Upload, ExternalLink, HelpCircle, Globe } from 'lucide-react';
import { getSettings, saveSettings, getGdriveStatus, getGoogleAuthUrl } from '../api';

export default function SettingsModal({ onClose }) {
  const [settings, setSettings] = useState({
    studioName: '',
    photographerEmail: '',
    gdrive: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      parentFolderId: '',
      serviceAccountKey: '',
    },
  });
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('gdrive'); // 'gdrive' | 'studio'

  useEffect(() => {
    getSettings().then((data) => {
      if (data) setSettings(data);
    });
  }, []);

  const [authMethod, setAuthMethod] = useState(
    settings.gdrive?.serviceAccountKey ? 'service_account' : 'service_account'
  );

  const handleUploadJsonFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonContent = event.target.result;
        JSON.parse(jsonContent); // Test valid JSON
        setSettings((prev) => ({
          ...prev,
          gdrive: {
            ...prev.gdrive,
            serviceAccountKey: jsonContent,
          },
        }));
      } catch (err) {
        alert('Invalid JSON file format. Please upload the key file downloaded from Google Cloud.');
      }
    };
    reader.readAsText(file);
  };

  const handleConnectWithGoogle = async () => {
    if (!settings.gdrive?.clientId || !settings.gdrive?.clientSecret) {
      alert('Please enter your Client ID and Client Secret first.');
      return;
    }
    try {
      setIsTesting(true);
      await saveSettings(settings);
      const res = await getGoogleAuthUrl({
        clientId: settings.gdrive.clientId,
        clientSecret: settings.gdrive.clientSecret,
      });
      if (res.authUrl) {
        window.location.href = res.authUrl;
      }
    } catch (err) {
      alert(`Google Auth Error: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      // Save first
      await saveSettings(settings);
      const res = await getGdriveStatus();
      setTestResult(res.status);
    } catch (err) {
      setTestResult({
        connected: false,
        message: err.message,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await saveSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert(`Error saving settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#141720] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Studio & Storage Settings</h3>
              <p className="text-[11px] text-slate-400">Configure Google Drive cloud sync and studio identity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-white/10 px-6 bg-white/[0.01]">
          <button
            onClick={() => setActiveTab('gdrive')}
            className={`py-3 px-3 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'gdrive'
                ? 'border-rose-500 text-rose-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Google Drive Cloud Sync
          </button>
          <button
            onClick={() => setActiveTab('studio')}
            className={`py-3 px-3 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'studio'
                ? 'border-rose-500 text-rose-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Studio Profile
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'gdrive' && (
            <div className="space-y-4">
              
              {/* Concept Explainer Banner */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-rose-950/40 to-amber-950/20 border border-rose-500/20 text-xs space-y-1">
                <div className="font-semibold text-rose-300 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Storage Optimization Architecture</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Studio Sync only uploads <strong>lightweight compressed proxies (1920px WebP)</strong> to the cloud. Original multi-gigabyte RAW master photos stay safe and local on your PC, saving 99% of your Google Drive quota!
                </p>
              </div>

              {/* Enable Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
                <div>
                  <div className="text-xs font-semibold text-white">Enable Google Drive Proxy Sync</div>
                  <div className="text-[11px] text-slate-400">
                    Upload proxies to your Google Drive account when creating client galleries
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.gdrive?.enabled || false}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        gdrive: { ...settings.gdrive, enabled: e.target.checked },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              {settings.gdrive?.enabled && (
                <div className="space-y-4 pt-2">
                  {/* Parent Folder ID Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-300">
                        Target Google Drive Folder ID (Optional)
                      </label>
                      <span className="text-[10px] text-slate-500">
                        e.g. drive.google.com/drive/folders/<strong>1AbCdEfGh...</strong>
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="Paste the folder ID from your Google Drive URL"
                      value={settings.gdrive?.parentFolderId || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          gdrive: { ...settings.gdrive, parentFolderId: e.target.value.trim() },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Open your desired folder in Google Drive, and copy the string of characters at the end of the browser URL.
                    </p>
                  </div>

                  {/* Authentication Method Selector Tabs */}
                  <div className="p-1 bg-white/5 rounded-xl border border-white/5 grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setAuthMethod('service_account')}
                      className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                        authMethod === 'service_account'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Method 1: Service Account Key
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMethod('oauth')}
                      className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                        authMethod === 'oauth'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Method 2: Google OAuth Login
                    </button>
                  </div>

                  {/* Method 1: Service Account Key */}
                  {authMethod === 'service_account' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-black/30 border border-white/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-slate-200">
                            Service Account JSON Key
                          </span>
                          <p className="text-[10px] text-slate-400">
                            Created in Google Cloud Console &gt; IAM & Admin &gt; Service Accounts
                          </p>
                        </div>
                        <label className="cursor-pointer flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors">
                          <Upload className="w-3.5 h-3.5 text-rose-400" />
                          <span>Upload .JSON File</span>
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleUploadJsonFile}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <textarea
                        rows={3}
                        placeholder='Paste Service Account JSON key content here: { "type": "service_account", "client_email": "...", "private_key": "..." }'
                        value={settings.gdrive?.serviceAccountKey || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            gdrive: { ...settings.gdrive, serviceAccountKey: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />

                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                        💡 <strong>Important:</strong> In your Google Drive, right-click the target parent folder &gt; <strong>Share</strong> &gt; Add the <code>client_email</code> from this JSON key as <strong>Editor</strong>.
                      </div>
                    </div>
                  )}

                  {/* Method 2: OAuth 2.0 Google Login */}
                  {authMethod === 'oauth' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-black/30 border border-white/5">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-200">
                          Google Cloud OAuth 2.0 Client
                        </span>
                        <p className="text-[10px] text-slate-400">
                          Created in Google Cloud Console &gt; APIs &amp; Services &gt; Credentials
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Client ID</label>
                          <input
                            type="text"
                            placeholder="e.g. 123456...apps.googleusercontent.com"
                            value={settings.gdrive?.clientId || ''}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                gdrive: { ...settings.gdrive, clientId: e.target.value.trim() },
                              })
                            }
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Client Secret</label>
                          <input
                            type="password"
                            placeholder="GOCSPX-..."
                            value={settings.gdrive?.clientSecret || ''}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                gdrive: { ...settings.gdrive, clientSecret: e.target.value.trim() },
                              })
                            }
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                        <span>Authorized Redirect URI:</span>
                        <code className="text-rose-400 font-bold select-all">http://localhost:5000/api/gdrive/callback</code>
                      </div>

                      <button
                        type="button"
                        onClick={handleConnectWithGoogle}
                        className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-blue-900/30 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Sign In with Google / Connect Google Drive</span>
                      </button>
                    </div>
                  )}

                  {/* Test Connection Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/10 transition-colors"
                    >
                      {isTesting ? 'Testing Drive Connection...' : 'Test Google Drive Connection'}
                    </button>
                  </div>

                  {testResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                        testResult.connected
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                      }`}
                    >
                      {testResult.connected ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              )}

              {!settings.gdrive?.enabled && (
                <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-xs text-slate-300 space-y-1">
                  <div className="flex items-center space-x-1.5 font-semibold text-emerald-400">
                    <HardDrive className="w-4 h-4" />
                    <span>Local High-Speed Mode Active</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Your lightweight WebP previews are served directly at sub-millisecond latency. You can enable Google Drive cloud backup whenever you like.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'studio' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Photography Studio Name
                </label>
                <input
                  type="text"
                  value={settings.studioName || ''}
                  onChange={(e) => setSettings({ ...settings, studioName: e.target.value })}
                  placeholder="e.g. Unique Moment"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Studio Contact Email
                </label>
                <input
                  type="email"
                  value={settings.photographerEmail || ''}
                  onChange={(e) => setSettings({ ...settings, photographerEmail: e.target.value })}
                  placeholder="e.g. mail2uniquemoment@gmail.com"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* 24/7 Cloud Gallery Server Settings */}
              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    24/7 Cloud Gallery Server (Render.com)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  আপনার ল্যাপটপ বন্ধ থাকলেও ক্লায়েন্টরা ২৪ ঘণ্টা গ্যালারি দেখতে ও ছবি সিলেক্ট করতে পারবে। এখানে আপনার Render-এর সার্ভিস URL দিন:
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Render Cloud Server URL
                  </label>
                  <input
                    type="text"
                    value={settings.cloudServerUrl || 'https://unique-moment-gallery.onrender.com'}
                    onChange={(e) => setSettings({ ...settings, cloudServerUrl: e.target.value.trim() })}
                    placeholder="https://unique-moment-gallery.onrender.com"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-emerald-400 mt-1 block">
                    ✓ ক্লায়েন্টদের শেয়ার করার সব লিঙ্ক এবং হোয়াটসঅ্যাপ মেসেজে স্বয়ংক্রিয়ভাবে এই ২৪/৭ লিঙ্ক ব্যবহার হবে।
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Save Button */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            {saveSuccess ? (
              <span className="text-xs text-emerald-400 font-medium">✓ Settings saved successfully</span>
            ) : (
              <span></span>
            )}

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}
