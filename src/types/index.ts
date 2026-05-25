export interface AudioFile {
  id: string;
  path: string;
  name: string;
  duration?: number;
  folder?: string; // relative path from import root, e.g. "Sounds/Ambience"; undefined = individually added
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

export interface Scene {
  id: string;
  name: string;
  groupStates: Array<{ groupId: string; volume: number; active: boolean }>;
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
    data: SoundNodeData | RandomPoolNodeData;
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

export interface Project {
  schemaVersion: 1;
  name: string;
  library: AudioFile[];
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  hotkeys: HotkeyMap;
  scenes: Scene[];
}
