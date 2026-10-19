import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL);
const ROOT_DIR = path.resolve(__dirname, '../../');
const STORAGE_DIR = isVercel ? path.resolve(os.tmpdir(), 'storage') : path.resolve(ROOT_DIR, 'storage');
const PROXIES_DIR = path.resolve(STORAGE_DIR, 'proxies');
const TEMP_DIR = path.resolve(STORAGE_DIR, 'temp');
const DATA_DIR = path.resolve(__dirname, '../data');

// Ensure directories exist safely
[STORAGE_DIR, PROXIES_DIR, TEMP_DIR].forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {}
});

export const config = {
  PORT: process.env.PORT || 5000,
  CLIENT_PORT: process.env.CLIENT_PORT || 3000,
  HOST: process.env.HOST || 'localhost',
  ROOT_DIR,
  STORAGE_DIR,
  PROXIES_DIR,
  TEMP_DIR,
  DATA_DIR,
  DB_FILE: path.resolve(DATA_DIR, 'database.json'),
  SETTINGS_FILE: path.resolve(DATA_DIR, 'settings.json'),
  PROXY_MAX_WIDTH: 1920,
  PROXY_QUALITY: 80,
  PROXY_FORMAT: 'webp', // webp or jpeg
  IS_VERCEL: isVercel,
};
