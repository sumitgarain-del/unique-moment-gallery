import os from 'os';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { db } from '../db.js';

class TunnelService {
  constructor() {
    this.tunnelType = 'render_cloud';
  }

  /**
   * Get the primary LAN IP of this computer (e.g., 192.168.1.5)
   */
  getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
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
   * Get the active 24/7 Cloud Gallery URL
   */
  getCloudBaseUrl() {
    const settings = db.getSettings();
    let cloudBase = (settings.cloudServerUrl && settings.cloudServerUrl.trim()) ||
                    (settings.customDomain && settings.customDomain.trim()) ||
                    'https://unique-moment-gallery.onrender.com';

    if (!cloudBase.startsWith('http://') && !cloudBase.startsWith('https://')) {
      cloudBase = `https://${cloudBase}`;
    }
    return cloudBase.replace(/\/$/, '');
  }

  /**
   * Start / Connect (Instant resolution using Render Cloud Server)
   */
  async startTunnel() {
    const cloudUrl = this.getCloudBaseUrl();
    return {
      url: cloudUrl,
      active: true,
      type: 'render_cloud',
    };
  }

  /**
   * Stop Public Tunnel
   */
  async stopTunnel() {
    return { active: false };
  }

  /**
   * Get full network info and shareable links for a project gallery
   */
  async getShareInfo(token = null) {
    const localIp = this.getLocalIp();
    const port = config.PORT;
    const cloudBase = this.getCloudBaseUrl();
    const galleryPath = token ? `/gallery/${token}` : '';

    const localLink = `http://${localIp}:${port}${galleryPath}`;
    const publicLink = `${cloudBase}${galleryPath}`;
    const localhostLink = `http://localhost:${port}${galleryPath}`;

    // Target link for client: 24/7 Render cloud link
    const primaryLink = publicLink;
    let qrCode = null;
    try {
      qrCode = await QRCode.toDataURL(primaryLink, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0e1015',
          light: '#ffffff',
        },
      });
    } catch (e) {
      console.warn('[Share] QR code generation note:', e.message);
    }

    const qrImagePath = token ? `/api/network/qr-image/${token}.png` : null;
    const qrImageUrl = qrImagePath ? `${cloudBase}${qrImagePath}` : null;

    return {
      localIp,
      port,
      localLink,
      publicLink,
      localhostLink,
      primaryLink,
      qrImageUrl,
      tunnelActive: true,
      tunnelType: 'render_cloud',
      qrCode,
    };
  }
}

export const tunnelService = new TunnelService();
