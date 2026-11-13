declare module '*.css' {}

export interface FreesoundResult {
  id: number;
  name: string;
  username: string;
  license: string;
  duration: number;
  url: string;
  previewUrl: string;
}

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

  // Crash-recovery autosave + document state
  autosaveWrite: (json: string) => Promise<void>;
  autosaveRead: () => Promise<string | null>;
  autosaveClear: () => Promise<void>;
  setDocumentState: (state: { dirty: boolean; filePath: string | null; title: string }) => Promise<void>;
  confirmClose: () => Promise<void>;
  cancelClose: () => Promise<void>;

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

  // Freesound
  freesoundSearch: (apiKey: string, query: string, page: number) => Promise<{ count: number; hasNext: boolean; results: FreesoundResult[] }>;
  freesoundDownload: (id: number, previewUrl: string) => Promise<string>;

  // YouTube search
  youtubeSearch: (query: string, continuation?: string) => Promise<{
    results: Array<{ videoId: string; title: string; duration: string; thumbnail: string }>;
    continuation: string | null;
  }>;
}

declare global {
  interface Window {
    audioNodes: AudioNodesAPI;
  }
}
