import { app, BrowserWindow, ipcMain, dialog, Menu, shell, globalShortcut, protocol, net, session } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Give the renderer a real origin so YouTube's iframe API works from production builds.
// file:// has a null origin which YouTube rejects; app:// behaves like https://.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
const ICON_PATH = path.join(process.env.APP_ROOT, 'build',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png'
);

let mainWindow: BrowserWindow | null = null;

// Document state reported by the renderer, used to guard window close.
let docDirty = false;
let allowClose = false;   // set once the user has resolved the unsaved-changes prompt
let quitting = false;     // close was triggered by app quit, so quit once the window closes

const AUTOSAVE_PATH = () => path.join(app.getPath('userData'), 'autosave.json');

async function clearAutosave() {
  await fs.rm(AUTOSAVE_PATH(), { force: true });
}

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
    mainWindow.loadURL('app://localhost/');
  }

  mainWindow.on('close', async (e) => {
    if (allowClose || !docDirty) {
      if (!docDirty) await clearAutosave().catch(() => {});
      return;
    }
    e.preventDefault();
    const win = mainWindow!;
    clearHotkeys();
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      message: 'Do you want to save changes to this project?',
      detail: "Your changes will be lost if you don't save them.",
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    });
    applyHotkeys();
    if (response === 0) {
      // Renderer saves, then calls doc:closeConfirmed (or leaves the window open if the save is cancelled).
      sendMenuAction('saveAndClose');
    } else if (response === 1) {
      allowClose = true;
      await clearAutosave().catch(() => {});
      closeNow();
    } else {
      quitting = false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    allowClose = false;
    docDirty = false;
  });
}

function closeNow() {
  allowClose = true;
  mainWindow?.close();
  if (quitting) app.quit();
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

// Crash-recovery autosave: a single backup of the open document in userData.
ipcMain.handle('autosave:write', async (_evt, json: string) => {
  if (allowClose) return; // window is closing; don't resurrect a discarded backup
  const target = AUTOSAVE_PATH();
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, target);
});

ipcMain.handle('autosave:read', async () => {
  try { return await fs.readFile(AUTOSAVE_PATH(), 'utf8'); } catch { return null; }
});

ipcMain.handle('autosave:clear', () => clearAutosave());

ipcMain.handle('doc:setState', (_evt, state: { dirty: boolean; filePath: string | null; title: string }) => {
  docDirty = state.dirty;
  if (!mainWindow) return;
  mainWindow.setTitle(state.title);
  if (process.platform === 'darwin') {
    mainWindow.setDocumentEdited(state.dirty);
    mainWindow.setRepresentedFilename(state.filePath ?? '');
  }
});

ipcMain.handle('doc:closeConfirmed', async () => {
  allowClose = true;
  await clearAutosave().catch(() => {});
  closeNow();
});

ipcMain.handle('doc:closeCancelled', () => { quitting = false; });

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

// Freesound: search and preview download. Network calls live here to stay clear of the renderer CSP.
interface FreesoundResult {
  id: number;
  name: string;
  username: string;
  license: string;
  duration: number;
  url: string;
  previewUrl: string;
}

ipcMain.handle('freesound:search', async (_evt, apiKey: string, query: string, page: number) => {
  const params = new URLSearchParams({
    query,
    page: String(page),
    page_size: '15',
    fields: 'id,name,username,license,duration,url,previews',
    token: apiKey,
  });
  const res = await fetch(`https://freesound.org/apiv2/search/text/?${params}`);
  if (res.status === 401 || res.status === 403) throw new Error('Freesound rejected the API key.');
  if (res.status === 429) throw new Error('Freesound rate limit reached. Try again in a minute.');
  if (!res.ok) throw new Error(`Freesound search failed (${res.status}).`);
  const data = await res.json() as {
    count: number;
    next: string | null;
    results: Array<{
      id: number; name: string; username: string; license: string; duration: number; url: string;
      previews?: Record<string, string>;
    }>;
  };
  const results: FreesoundResult[] = data.results.flatMap((r) => {
    const previewUrl = r.previews?.['preview-hq-ogg'] ?? r.previews?.['preview-hq-mp3'];
    return previewUrl
      ? [{ id: r.id, name: r.name, username: r.username, license: r.license, duration: r.duration, url: r.url, previewUrl }]
      : [];
  });
  return { count: data.count, hasNext: data.next !== null, results };
});

ipcMain.handle('freesound:download', async (_evt, id: number, previewUrl: string) => {
  if (!/^https:\/\/(cdn\.)?freesound\.org\//.test(previewUrl)) throw new Error('Unexpected download URL.');
  const ext = path.extname(new URL(previewUrl).pathname) || '.ogg';
  const dir = path.join(app.getPath('userData'), 'freesound');
  const dest = path.join(dir, `${Math.trunc(id)}${ext}`);
  try {
    await fs.access(dest);
    return dest;
  } catch { /* not downloaded yet */ }
  const res = await fetch(previewUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
});

// YouTube search is paged with continuation tokens: the first call takes a query, later calls take the
// token returned with the previous page.
interface YouTubeSearchItem { videoId: string; title: string; duration: string; thumbnail: string }

ipcMain.handle('youtube:search', async (_evt, query: string, continuation?: string) => {
  const context = { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en' } };
  const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      continuation
        ? { context, continuation }
        : { context, query, params: 'EgIQAQ==' } // videos only
    ),
  });
  if (!res.ok) throw new Error(`YouTube search failed (${res.status}).`);
  const data = await res.json() as Record<string, unknown>;
  const results: YouTubeSearchItem[] = [];
  let nextToken: string | null = null;
  try {
    type Thumbnail = { url: string; width: number; height: number };
    type Entry = {
      itemSectionRenderer?: { contents: Array<{
        videoRenderer?: {
          videoId: string;
          title: { runs: { text: string }[] };
          lengthText?: { simpleText: string };
          thumbnail?: { thumbnails: Thumbnail[] };
        };
      }> };
      continuationItemRenderer?: { continuationEndpoint?: { continuationCommand?: { token?: string } } };
    };
    let entries: Entry[];
    if (continuation) {
      // Continuation replies list their commands under onResponseReceivedCommands.
      const cmds = (data.onResponseReceivedCommands ?? data.onResponseCommands) as Array<{
        appendContinuationItemsAction?: { continuationItems?: Entry[] };
      }> | undefined;
      entries = cmds?.flatMap((c) => c.appendContinuationItemsAction?.continuationItems ?? []) ?? [];
    } else {
      const primary = (
        (data.contents as Record<string, unknown>)
          ?.twoColumnSearchResultsRenderer as Record<string, unknown>
      )?.primaryContents as Record<string, unknown>;
      entries = (primary?.sectionListRenderer as Record<string, unknown>)?.contents as Entry[] ?? [];
    }
    for (const entry of entries) {
      for (const item of entry.itemSectionRenderer?.contents ?? []) {
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
      }
      nextToken = entry.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? nextToken;
    }
  } catch { /* ignore parse errors */ }
  return { results, continuation: nextToken };
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

// YouTube's embed rejects non-http(s) referrers (error 153), and app://localhost isn't one.
// Present an https referrer on YouTube requests; must match YT_ORIGIN in YouTubeNode.tsx.
const YT_REFERRER = 'https://foaly.app/';

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      if (!VITE_DEV_SERVER_URL) details.requestHeaders['Referer'] = YT_REFERRER;
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const filePath = path.join(RENDERER_DIST, pathname === '/' ? 'index.html' : pathname);
    return net.fetch('file://' + filePath);
  });

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

app.on('before-quit', () => { quitting = true; });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
