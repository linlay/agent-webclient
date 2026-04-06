import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';

import { resolveDesktopConfig } from './desktopConfig';
import { startLocalServer, type LocalServerHandle } from './localServer';

const DEV_SERVER_URL = 'http://127.0.0.1:11948';

let mainWindow: BrowserWindow | null = null;
let localServer: LocalServerHandle | null = null;

function getPreloadScriptPath(): string {
  return path.join(__dirname, 'preload.js');
}

function getRendererDistPath(): string {
  return path.join(__dirname, '..', 'dist');
}

async function ensureRendererUrl(): Promise<string> {
  if (!app.isPackaged) {
    return process.env.AGENT_WEBCLIENT_ELECTRON_DEV_SERVER_URL || DEV_SERVER_URL;
  }

  if (localServer) {
    return localServer.origin;
  }

  const resolvedConfig = resolveDesktopConfig({
    env: process.env,
    userDataPath: app.getPath('userData'),
  });

  localServer = await startLocalServer({
    config: resolvedConfig.config,
    staticDir: getRendererDistPath(),
  });

  return localServer.origin;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const targetUrl = await ensureRendererUrl();

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadScriptPath(),
    },
  });

  await window.loadURL(targetUrl);
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  return window;
}

async function bootstrap(): Promise<void> {
  try {
    mainWindow = await createMainWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox('AGENT Webclient Desktop Error', message);
    if (localServer) {
      await localServer.close().catch(() => undefined);
      localServer = null;
    }
    app.quit();
  }
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootstrap();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (localServer) {
    void localServer.close().catch(() => undefined);
    localServer = null;
  }
});
