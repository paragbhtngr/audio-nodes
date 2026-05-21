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

  // Project persistence
  showSaveDialog: (defaultName: string) => Promise<string | null>;
  showOpenDialog: () => Promise<string | null>;
  saveProject: (filePath: string, json: string) => Promise<void>;
  loadProject: (filePath: string) => Promise<string>;

  // Path utilities (resolved in main process)
  relativizePath: (projectPath: string, filePath: string) => Promise<string>;
  absolutizePath: (projectPath: string, relPath: string) => Promise<string>;

  // Hotkeys
  registerHotkeys: (hotkeys: Record<string, string>) => Promise<void>;
  onHotkeyTriggered: (cb: (key: string) => void) => () => void;

  // Menu events from main process
  onMenuAction: (cb: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    audioNodes: AudioNodesAPI;
  }
}
