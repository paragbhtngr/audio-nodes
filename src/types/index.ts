export interface AudioFile {
  id: string;
  path: string;
  name: string;
  duration?: number;
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

export type AudioNodeData = SoundNodeData | MasterNodeData | GroupNodeData;

export interface ProjectNode {
  id: string;
  type: 'sound' | 'master' | 'group';
  position: { x: number; y: number };
  data: AudioNodeData;
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
}
