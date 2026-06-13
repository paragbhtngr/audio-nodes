import { app, BrowserWindow, ipcMain, dialog, Menu, shell, globalShortcut } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
const ICON_PATH = path.join(process.env.APP_ROOT, 'build',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png'
);

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
    backgroundColor: '#232323',
    title: 'Foaly',
    icon: ICON_PATH,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus']);

async function scanFolderForAudio(
  rootParentDir: string,
  dir: string
): Promise<Array<{ path: string; name: string; folder: string }>> {
  const results: Array<{ path: string; name: string; folder: string }> = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  const folder = path.relative(rootParentDir, dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await scanFolderForAudio(rootParentDir, fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        results.push({ path: fullPath, name: entry.name.replace(/\.[^.]+$/, ''), folder });
      }
    }
  }
  return results;
}

ipcMain.handle('dialog:pickFolder', async () => {
  if (!mainWindow) return [];
  clearHotkeys();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Sound Folder',
    properties: ['openDirectory'],
  });
  applyHotkeys();
  if (result.canceled || result.filePaths.length === 0) return [];
  const rootDir = result.filePaths[0];
  return scanFolderForAudio(path.dirname(rootDir), rootDir);
});

ipcMain.handle('dialog:pickAudioFiles', async () => {
  if (!mainWindow) return [];
  clearHotkeys();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Audio Files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'] }],
  });
  applyHotkeys();
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:showSaveDialog', async (_, defaultName: string) => {
  if (!mainWindow) return null;
  clearHotkeys();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: defaultName,
    filters: [{ name: 'Foaly Project', extensions: ['anodes'] }],
  });
  applyHotkeys();
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:showMessageBox', async (_, opts: { title: string; message: string; buttons: string[] }) => {
  if (!mainWindow) return 0;
  clearHotkeys();
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: opts.title,
    message: opts.message,
    buttons: opts.buttons,
    cancelId: opts.buttons.length - 1,
  });
  applyHotkeys();
  return result.response;
});

ipcMain.handle('dialog:showOpenDialog', async () => {
  if (!mainWindow) return null;
  clearHotkeys();
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Project',
    properties: ['openFile'],
    filters: [{ name: 'Foaly Project', extensions: ['anodes'] }],
  });
  applyHotkeys();
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

ipcMain.handle('youtube:search', async (_evt, query: string) => {
  const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en' } },
      query,
      params: 'EgIQAQ==', // videos only
    }),
  });
  const data = await res.json() as Record<string, unknown>;
  const results: Array<{ videoId: string; title: string; duration: string; thumbnail: string }> = [];
  try {
    type Thumbnail = { url: string; width: number; height: number };
    type Section = { itemSectionRenderer?: { contents: Item[] } };
    type Item = {
      videoRenderer?: {
        videoId: string;
        title: { runs: { text: string }[] };
        lengthText?: { simpleText: string };
        thumbnail?: { thumbnails: Thumbnail[] };
      };
    };
    const sections = (
      (data.contents as Record<string, unknown>)
        ?.twoColumnSearchResultsRenderer as Record<string, unknown>
    )?.primaryContents as Record<string, unknown>;
    const list = (sections?.sectionListRenderer as Record<string, unknown>)?.contents as Section[] ?? [];
    for (const section of list) {
      for (const item of section.itemSectionRenderer?.contents ?? []) {
        const vr = item.videoRenderer;
        if (vr?.videoId) {
          const thumbs = vr.thumbnail?.thumbnails ?? [];
          results.push({
            videoId: vr.videoId,
            title: vr.title?.runs?.[0]?.text ?? '',
            duration: vr.lengthText?.simpleText ?? '',
            thumbnail: thumbs[thumbs.length - 1]?.url ?? '',
          });
        }
        if (results.length >= 8) break;
      }
      if (results.length >= 8) break;
    }
  } catch { /* ignore parse errors */ }
  return results;
});

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

app.setName('Foaly');

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.setIcon(ICON_PATH);
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
