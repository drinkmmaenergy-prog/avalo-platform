import { app, BrowserWindow, ipcMain, session, protocol } from 'electron';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import path from 'path';
import { setupSecureIPC } from './ipc/secure-bridge';
import { setupAutoUpdater } from './services/auto-updater';
import { initializeDeviceFingerprint } from './services/device-fingerprint';
import { setupOfflineQueue } from './services/offline-queue';
import { WindowManager } from './window-manager';
import { SecurityManager } from './security/security-manager';
import { setupDesktopNotifications } from './services/notifications';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = !isDevelopment;

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager | null = null;
let securityManager: SecurityManager | null = null;

const store = new Store({
  name: 'avalo-desktop-config',
  encryptionKey: process.env.STORE_ENCRYPTION_KEY || 'avalo-secure-key-2025',
  clearInvalidConfig: true
});

async function createMainWindow(): Promise<BrowserWindow> {
  windowManager = new WindowManager();
  securityManager = new SecurityManager();

  await windowManager.initialize();
  await securityManager.initialize();

  const webAppUrl = isDevelopment
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../../app-web/out/index.html')}`;

  mainWindow = windowManager.createMainWindow({
    url: webAppUrl,
    title: 'Avalo Desktop',
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 768
  });

  setupSecureIPC(mainWindow);
  setupDesktopNotifications(mainWindow);
  setupOfflineQueue(mainWindow);
  
  if (isProduction) {
    setupAutoUpdater(mainWindow);
  }

  initializeDeviceFingerprint();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

async function setupSecurity() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' https://*.avalo.com https://*.firebaseio.com https://*.googleapis.com https://*.google.com",
          "script-src 'self' 'unsafe-inline' https://*.avalo.com https://*.firebaseio.com https://*.googleapis.com",
          "style-src 'self' 'unsafe-inline' https://*.googleapis.com",
          "img-src 'self' data: blob: https://*.avalo.com https://*.googleapis.com https://*.googleusercontent.com https://firebasestorage.googleapis.com",
          "media-src 'self' blob: https://*.avalo.com https://firebasestorage.googleapis.com",
          "connect-src 'self' https://*.avalo.com https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com",
          "font-src 'self' data: https://*.googleapis.com https://*.gstatic.com",
          "frame-src 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'"
        ].join('; ')
      }
    });
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'notifications', 'clipboard-read'];
    callback(allowedPermissions.includes(permission));
  });

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const allowedDomains = [
      'avalo.com',
      'firebaseio.com',
      'googleapis.com',
      'google.com',
      'googleusercontent.com',
      'gstatic.com',
      'localhost'
    ];

    const isAllowed = allowedDomains.some(domain => 
      url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed && !url.protocol.startsWith('file:')) {
      console.warn(`Blocked request to unauthorized domain: ${url.hostname}`);
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });

  if (isProduction) {
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = request.url.substr(6);
      callback({ path: path.normalize(`${__dirname}/${url}`) });
    });
  }
}

app.on('ready', async () => {
  await setupSecurity();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (windowManager) {
    windowManager.cleanup();
  }
  if (securityManager) {
    securityManager.cleanup();
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

app.setAboutPanelOptions({
  applicationName: 'Avalo Desktop',
  applicationVersion: app.getVersion(),
  copyright: 'Copyright © 2025 Avalo',
  website: 'https://avalo.com'
});

export { store };