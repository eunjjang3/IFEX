import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, session, shell } from 'electron';
import { isAllowedAppNavigation, isAllowedExternalUrl } from './urlPolicy.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const developmentUrl = process.env.IFEX_DESKTOP_DEV_URL;
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "img-src 'self' blob: data: https://tile.openstreetmap.org",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://nominatim.openstreetmap.org ws://127.0.0.1:* ws://localhost:*",
].join('; ');

let mainWindow;

function validatedDevelopmentUrl() {
  if (!developmentUrl) return undefined;
  const parsed = new URL(developmentUrl);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error('IFEX_DESKTOP_DEV_URL must use HTTP on localhost.');
  }
  return parsed.href;
}

function configureSession() {
  const defaultSession = session.defaultSession;
  defaultSession.setPermissionCheckHandler(() => false);
  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
        'Permissions-Policy': ['camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
      },
    });
  });
}

async function openExternalUrl(url) {
  if (!isAllowedExternalUrl(url)) return;
  try {
    await shell.openExternal(url);
  } catch (error) {
    console.error('Could not open an external URL.', error);
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: '#151411',
    title: 'IFEX',
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  mainWindow = window;
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL();
    if (isAllowedAppNavigation(url, currentUrl)) return;
    event.preventDefault();
    void openExternalUrl(url);
  });

  const localDevelopmentUrl = validatedDevelopmentUrl();
  if (localDevelopmentUrl) void window.loadURL(localDevelopmentUrl);
  else void window.loadFile(path.join(currentDirectory, '..', 'dist', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    configureSession();
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event) => event.preventDefault());
    });
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
