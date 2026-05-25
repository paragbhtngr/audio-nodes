declare module '*.css' {}

export interface AudioNodesAPI {
  platform: NodeJS.Platform;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };

  // Audio file I/O
  readFile: (filePath: string) => Promise<ArrayBuffer>;
  pickAudioFiles: () => Promise<string[]>;
  pickFolder: () => Promise<Array<{ path: string; name: string; folder: string }>>;

  // Project persistence
  showSaveDialog: (defaultName: string) => Promise<string | null>;
  showOpenDialog: () => Promise<string | null>;
  showMessageBox: (opts: { title: string; message: string; buttons: string[] }) => Promise<number>;
  saveProject: (filePath: string, json: string) => Promise<void>;
  loadProject: (filePath: string) => Promise<string>;

  checkExists: (paths: string[]) => Promise<string[]>;
  setRecentProjects: (paths: string[]) => Promise<void>;

  // Path utilities (resolved in main process)
  relativizePath: (projectPath: string, filePath: string) => Promise<string>;
  absolutizePath: (projectPath: string, relPath: string) => Promise<string>;

  // Hotkeys
  registerHotkeys: (hotkeys: Record<string, string>) => Promise<void>;
  setHotkeysEnabled: (enabled: boolean) => Promise<void>;
  onHotkeyTriggered: (cb: (key: string) => void) => () => void;

  // Menu events from main process
  onMenuAction: (cb: (action: string) => void) => () => void;

  // YouTube search
  youtubeSearch: (query: string) => Promise<Array<{ videoId: string; title: string }>>;
}

declare global {
  interface Window {
    audioNodes: AudioNodesAPI;
  }
}
