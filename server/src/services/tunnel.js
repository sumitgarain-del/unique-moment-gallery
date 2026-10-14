import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import localtunnel from 'localtunnel';
import QRCode from 'qrcode';
import { config } from '../config.js';

import { db } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TunnelService {
  constructor() {
    this.activeTunnel = null;
    this.tunnelProcess = null;
    this.publicUrl = null;
    this.tunnelType = null;
    this.isStarting = false;
    this.reconnectTimer = null;
  }

  /**
   * Get the primary LAN IP of this computer (e.g., 192.168.1.5)
   */
  getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal/loopback and non-IPv4
        if (iface.family === 'IPv4' && !iface.internal) {
          // Prefer standard private Wi-Fi / Ethernet subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
          if (
            iface.address.startsWith('192.168.') ||
            iface.address.startsWith('10.') ||
            iface.address.startsWith('172.')
          ) {
            return iface.address;
          }
        }
      }
    }
    return 'localhost';
  }

  /**
   * Start Cloudflare Named Tunnel using Zero Trust Token (Permanent domain forever)
   */
  startCloudflareNamedTunnel(token) {
    return new Promise((resolve, reject) => {
      const localBinary = path.resolve(__dirname, '../../bin/cloudflared.exe');
      const binPath = fs.existsSync(localBinary) ? localBinary : 'cloudflared';

      console.log(`[Tunnel] Launching Cloudflare Named Tunnel with permanent token...`);

      const proc = spawn(binPath, ['tunnel', 'run', '--token', token.trim()], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.tunnelProcess = proc;
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.tunnelType = 'cloudflare-named';
          console.log(`[Tunnel] Cloudflare Named Tunnel active.`);
          resolve({ url: this.publicUrl, active: true, type: 'cloudflare-named' });
        }
      }, 5000);

      const checkOutput = (data) => {
        const text = data.toString();
        if (text.includes('Registered tunnel connection') || text.includes('Connection registered') || text.includes('INF')) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            this.tunnelType = 'cloudflare-named';
            console.log(`[Tunnel] Cloudflare Named Tunnel connected successfully.`);
            resolve({ url: this.publicUrl, active: true, type: 'cloudflare-named' });
          }
        }
      };

      proc.stdout.on('data', checkOutput);
      proc.stderr.on('data', checkOutput);

      proc.on('close', (code) => {
        console.log(`[Tunnel] Cloudflare Named tunnel process exited with code ${code}`);
        this.tunnelProcess = null;
        this.scheduleAutoReconnect();
      });

      proc.on('error', (err) => {
        console.warn(`[Tunnel] Cloudflare Named tunnel error: ${err.message}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  /**
   * Start Cloudflare Quick Tunnel (Zero config, No signup, Global Edge, No warning pages)
   */
  startCloudflareTunnel(port) {
    return new Promise((resolve, reject) => {
      const localBinary = path.resolve(__dirname, '../../bin/cloudflared.exe');
      const binPath = fs.existsSync(localBinary) ? localBinary : 'cloudflared';

      console.log(`[Tunnel] Launching Cloudflare Tunnel from ${binPath} on port ${port}...`);

      const proc = spawn(binPath, ['tunnel', '--url', `http://localhost:${port}`], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.tunnelProcess = proc;
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Cloudflare Tunnel startup timed out after 25s'));
        }
      }, 25000);

      const checkOutput = (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.publicUrl = match[0];
          this.tunnelType = 'cloudflare';
          console.log(`[Tunnel] Cloudflare Public Tunnel Online: ${this.publicUrl}`);
          resolve({ url: this.publicUrl, active: true, type: 'cloudflare' });
        }
      };

      proc.stdout.on('data', checkOutput);
      proc.stderr.on('data', checkOutput);

      proc.on('close', (code) => {
        console.log(`[Tunnel] Cloudflare tunnel process exited with code ${code}`);
        this.tunnelProcess = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Cloudflare process exited with code ${code}`));
        } else {
          this.publicUrl = null;
          this.scheduleAutoReconnect();
        }
      });

      proc.on('error', (err) => {
        console.warn(`[Tunnel] Cloudflare spawn error: ${err.message}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  /**
   * Automatically attempt reconnection if tunnel drops
   */
  scheduleAutoReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[Tunnel] Auto-reconnecting tunnel in background...');
      this.startTunnel().catch((err) => {
        console.warn(`[Tunnel] Auto-reconnect note: ${err.message}`);
      });
    }, 7000);
  }

  /**
   * Start 1-Click Public HTTPS Tunnel
   */
  async startTunnel(port = config.PORT) {
    if (this.publicUrl) {
      return { url: this.publicUrl, active: true, type: this.tunnelType || 'cloudflare' };
    }

    if (this.isStarting) {
      return { url: this.publicUrl, active: Boolean(this.publicUrl), type: this.tunnelType };
    }

    this.isStarting = true;
    try {
      // 0. Render Cloud Server environment
      if (process.env.RENDER) {
        this.publicUrl = process.env.RENDER_EXTERNAL_URL || null;
        this.tunnelType = 'render';
        console.log(`[Tunnel] Running on Render Cloud Server: ${this.publicUrl}`);
        return { url: this.publicUrl, active: true, type: 'render' };
      }

      const settings = db.getSettings();

      // 1. Permanent Custom Domain configured by photographer
      if (settings.customDomain && settings.customDomain.trim().length > 0) {
        let customUrl = settings.customDomain.trim();
        if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://')) {
          customUrl = `https://${customUrl}`;
        }
        this.publicUrl = customUrl.replace(/\/$/, '');
        this.tunnelType = 'custom';
        console.log(`[Tunnel] Using permanent custom domain: ${this.publicUrl}`);

        if (settings.cloudflareTunnelToken) {
          this.startCloudflareNamedTunnel(settings.cloudflareTunnelToken).catch((e) => {
            console.warn(`[Tunnel] Cloudflare token note: ${e.message}`);
          });
        }
        return { url: this.publicUrl, active: true, type: 'custom' };
      }

      // 2. Cloudflare Zero Trust Named Tunnel Token
      if (settings.cloudflareTunnelToken && settings.cloudflareTunnelToken.trim().length > 0) {
        return await this.startCloudflareNamedTunnel(settings.cloudflareTunnelToken);
      }

      // 3. Try Cloudflare Quick Tunnel (Zero config, High speed, Global Edge)
      const res = await this.startCloudflareTunnel(port);
      return res;
    } catch (cfErr) {
      console.warn(`[Tunnel] Cloudflare tunnel note (${cfErr.message}), trying localtunnel fallback...`);
      try {
        this.activeTunnel = await localtunnel({ port });
        this.publicUrl = this.activeTunnel.url;
        this.tunnelType = 'localtunnel';
        console.log(`[Tunnel] Localtunnel URL online: ${this.publicUrl}`);

        this.activeTunnel.on('close', () => {
          this.activeTunnel = null;
          this.publicUrl = null;
          this.scheduleAutoReconnect();
        });
        return { url: this.publicUrl, active: true, type: 'localtunnel' };
      } catch (ltErr) {
        console.error('[Tunnel] Both Cloudflare and Localtunnel failed:', ltErr.message);
        this.publicUrl = null;
        throw ltErr;
      }
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop Public Tunnel
   */
  async stopTunnel() {
    if (this.tunnelProcess) {
      try {
        this.tunnelProcess.kill();
      } catch (e) {}
      this.tunnelProcess = null;
    }
    if (this.activeTunnel) {
      try {
        this.activeTunnel.close();
      } catch (e) {}
      this.activeTunnel = null;
    }
    this.publicUrl = null;
    this.tunnelType = null;
    return { active: false };
  }

  /**
   * Get full network info and shareable links for a project gallery
   */
  async getShareInfo(token = null) {
    const localIp = this.getLocalIp();
    const settings = db.getSettings();
    const cloudBase = (settings.cloudServerUrl && settings.cloudServerUrl.trim()) ||
                      (settings.customDomain && settings.customDomain.trim()) ||
                      this.publicUrl;
    let publicBase = null;
    if (cloudBase) {
      publicBase = (cloudBase.startsWith('http://') || cloudBase.startsWith('https://'))
        ? cloudBase.replace(/\/$/, '')
        : `https://${cloudBase.replace(/\/$/, '')}`;
    }

    const galleryPath = token ? `/gallery/${token}` : '';

    const localLink = `${localBase}${galleryPath}`;
    const publicLink = publicBase ? `${publicBase}${galleryPath}` : null;
    const localhostLink = `http://localhost:${port}${galleryPath}`;

    // Target link for QR Code: prioritize publicLink, fallback to localLink
    const primaryLink = publicLink || localLink;
    let qrCode = null;
    try {
      qrCode = await QRCode.toDataURL(primaryLink, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0e1015',
          light: '#ffffff',
        },
      });
    } catch (e) {
      console.warn('[Tunnel] QR code error:', e.message);
    }

    const qrImagePath = token ? `/api/network/qr-image/${token}.png` : null;
    const qrImageUrl = publicBase && qrImagePath ? `${publicBase}${qrImagePath}` : (qrImagePath ? `${localBase}${qrImagePath}` : null);

    return {
      localIp,
      port,
      localLink,
      publicLink,
      localhostLink,
      primaryLink,
      qrImageUrl,
      tunnelActive: Boolean(this.publicUrl),
      tunnelType: this.tunnelType || 'cloudflare',
      qrCode,
    };
  }
}

export const tunnelService = new TunnelService();
