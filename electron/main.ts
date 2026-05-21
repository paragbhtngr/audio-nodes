import { app, BrowserWindow, ipcMain, dialog, Menu, shell, globalShortcut } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

let mainWindow: BrowserWindow | null = null;

function sendMenuAction(action: string) {
  mainWindow?.webContents.send('menu:action', action);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const recentSubmenu: Electron.MenuItemConstructorOptions[] = currentRecentPaths.length > 0
    ? [
        ...currentRecentPaths.map((p) => ({
          label: path.basename(p),
          click: () => sendMenuAction(`open:${p}`),
        })),
        { type: 'separator' as const },
        { label: 'Clear Recent', click: () => sendMenuAction('clearRecent') },
      ]
    : [{ label: 'No Recent Projects', enabled: false }];

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open') },
        { label: 'Open Recent', submenu: recentSubmenu },
        { type: 'separator' as const },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction('saveAs') },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    { role: 'editMenu' as const },
    {
      role: 'viewMenu' as const,
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    { role: 'windowMenu' as const },
    {
      role: 'help' as const,
      submenu: [
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://github.com/gastownhall/audio-nodes'),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a1a',
    title: 'Audio Nodes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// IPC handlers

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  const buf = await fs.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

ipcMain.handle('dialog:pickAudioFiles', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Audio Files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:showSaveDialog', async (_, defaultName: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: defaultName,
    filters: [{ name: 'Audio Nodes Project', extensions: ['anodes'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:showOpenDialog', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Project',
    properties: ['openFile'],
    filters: [{ name: 'Audio Nodes Project', extensions: ['anodes'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('project:save', async (_, filePath: string, json: string) => {
  await fs.writeFile(filePath, json, 'utf8');
});

ipcMain.handle('project:load', async (_, filePath: string) => {
  return fs.readFile(filePath, 'utf8');
});

ipcMain.handle('fs:checkExists', async (_evt, paths: string[]) => {
  const missing: string[] = [];
  await Promise.all(paths.map(async (p) => {
    try { await fs.access(p); } catch { missing.push(p); }
  }));
  return missing;
});

let currentRecentPaths: string[] = [];

ipcMain.handle('menu:setRecentProjects', (_evt, paths: string[]) => {
  currentRecentPaths = paths;
  Menu.setApplicationMenu(buildMenu());
});

ipcMain.handle('path:relativize', (_evt, projectPath: string, filePath: string) =>
  path.relative(path.dirname(projectPath), filePath)
);

ipcMain.handle('path:absolutize', (_evt, projectPath: string, relPath: string) =>
  path.resolve(path.dirname(projectPath), relPath)
);

let currentHotkeys: Record<string, string> = {};
const registeredKeys = new Set<string>();

let hotkeysEnabled = true;

function applyHotkeys() {
  for (const key of registeredKeys) globalShortcut.unregister(key);
  registeredKeys.clear();
  if (!hotkeysEnabled) return;
  for (const key of Object.keys(currentHotkeys)) {
    try {
      const ok = globalShortcut.register(key, () => {
        mainWindow?.webContents.send('hotkey:triggered', key);
      });
      if (ok) registeredKeys.add(key);
      else console.warn('Could not register hotkey:', key);
    } catch (e) {
      console.warn('Invalid hotkey:', key, e);
    }
  }
}

function clearHotkeys() {
  for (const key of registeredKeys) globalShortcut.unregister(key);
  registeredKeys.clear();
}

ipcMain.handle('hotkeys:register', (_evt, hotkeys: Record<string, string>) => {
  currentHotkeys = hotkeys;
  if (mainWindow?.isFocused()) applyHotkeys();
});

ipcMain.handle('hotkeys:setEnabled', (_evt, enabled: boolean) => {
  hotkeysEnabled = enabled;
  if (enabled && mainWindow?.isFocused()) applyHotkeys();
  else clearHotkeys();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('browser-window-focus', () => applyHotkeys());
app.on('browser-window-blur', () => clearHotkeys());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
