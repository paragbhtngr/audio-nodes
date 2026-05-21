import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('audioNodes', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  readFile: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  pickAudioFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('dialog:pickAudioFiles'),

  showSaveDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:showSaveDialog', defaultName),

  showOpenDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:showOpenDialog'),

  saveProject: (filePath: string, json: string): Promise<void> =>
    ipcRenderer.invoke('project:save', filePath, json),

  loadProject: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('project:load', filePath),

  relativizePath: (projectPath: string, filePath: string): Promise<string> =>
    ipcRenderer.invoke('path:relativize', projectPath, filePath),

  absolutizePath: (projectPath: string, relPath: string): Promise<string> =>
    ipcRenderer.invoke('path:absolutize', projectPath, relPath),

  registerHotkeys: (hotkeys: Record<string, string>): Promise<void> =>
    ipcRenderer.invoke('hotkeys:register', hotkeys),

  onMenuAction: (cb: (action: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, action: string) => cb(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },

  onHotkeyTriggered: (cb: (key: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, key: string) => cb(key);
    ipcRenderer.on('hotkey:triggered', handler);
    return () => ipcRenderer.removeListener('hotkey:triggered', handler);
  },
});
