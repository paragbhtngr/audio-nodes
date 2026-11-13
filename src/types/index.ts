export interface AudioFile {
  id: string;
  path: string;
  name: string;
  duration?: number;
  folder?: string; // relative path from import root, e.g. "Sounds/Ambience"; undefined = individually added
  source?: { provider: 'freesound'; url: string; author: string; license: string }; // attribution for downloaded sounds
}

export interface SoundNodeData {
  kind: 'sound';
  fileId: string | null;
  volume: number;
  loop: boolean;
  playing: boolean;
  fadeIn: number;
  fadeOut: number;
  pan: number;
  panRandom: number;
  pitchMin: number;
  pitchMax: number;
  duckTargets: string[];
  duckAmount: number;
  duckRelease: number;
}

export interface MasterNodeData {
  kind: 'master';
  volume: number;
}

export interface GroupNodeData {
  kind: 'group';
  label: string;
  icon: string;
  color: string;
  volume: number;
  collapsed: boolean;
}

export interface RandomPoolNodeData {
  kind: 'randomPool';
  label: string;
  fileIds: string[];
  volume: number;
  loop: boolean;
  playing: boolean;
  fadeIn: number;
  fadeOut: number;
  pan: number;
  panRandom: number;
  pitchMin: number;
  pitchMax: number;
  duckTargets: string[];
  duckAmount: number;
  duckRelease: number;
}

export type EffectType = 'reverb' | 'lowpass' | 'highpass';

export interface EffectNodeData {
  kind: 'effect';
  effectType: EffectType;
  wet: number;
  decay: number;
  frequency: number;
  q: number;
}

/** A scene's own canvas: the node graph and the hotkeys bound to its nodes. */
export interface SceneCanvas {
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  hotkeys: HotkeyMap;
}

export interface Scene extends SceneCanvas {
  id: string;
  name: string;
  /** Not yet given a name by the user. */
  untitled?: boolean;
}

export interface YouTubeNodeData {
  kind: 'youtube';
  videoId: string | null;
  title: string;
  playing: boolean;
  loop: boolean;
  volume: number;
}

export type AudioNodeData = SoundNodeData | MasterNodeData | GroupNodeData | RandomPoolNodeData | EffectNodeData | YouTubeNodeData;

export interface ProjectNode {
  id: string;
  type: 'sound' | 'master' | 'group' | 'randomPool' | 'effect' | 'youtube';
  position: { x: number; y: number };
  data: AudioNodeData;
}

export interface Prefab {
  id: string;
  groupData: GroupNodeData;
  members: Array<{
    data: SoundNodeData | RandomPoolNodeData | YouTubeNodeData;
    relativePosition: { x: number; y: number };
  }>;
  library: AudioFile[];
}

export interface ProjectEdge {
  id: string;
  source: string;
  target: string;
}

export type HotkeyMap = Record<string, string>;

/**
 * In-memory project. The current scene's canvas lives in the top-level nodes/edges/hotkeys
 * while it is being edited; its entry in `scenes` is stale until flushed (see flushScenes).
 */
export interface Project extends SceneCanvas {
  schemaVersion: 2;
  name: string;
  library: AudioFile[];
  scenes: Scene[];
  currentSceneId: string;
}

/** On-disk project format (v2): every scene carries its own canvas. */
export interface ProjectFileV2 {
  schemaVersion: 2;
  name: string;
  library: AudioFile[];
  scenes: Scene[];
}

/** Legacy on-disk format (v1): one shared canvas; scenes were group-state snapshots. */
export interface ProjectFileV1 extends SceneCanvas {
  schemaVersion: 1;
  name: string;
  library: AudioFile[];
  scenes?: Array<{ id: string; name: string; groupStates: Array<{ groupId: string; volume: number; active: boolean }> }>;
}
