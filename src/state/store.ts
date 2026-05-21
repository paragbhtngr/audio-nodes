import { create } from 'zustand';
import type { Project, ProjectNode, ProjectEdge, AudioFile, AudioNodeData, SoundNodeData } from '../types';

export const MASTER_NODE_ID = 'master-out';

function defaultProject(): Project {
  return {
    schemaVersion: 1,
    name: 'Untitled Project',
    library: [],
    nodes: [
      {
        id: MASTER_NODE_ID,
        type: 'master',
        position: { x: 700, y: 300 },
        data: { kind: 'master', volume: 1 },
      },
    ],
    edges: [],
    hotkeys: {},
  };
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

interface StoreState {
  project: Project;
  selectedNodeId: string | null;
  filePath: string | null;

  setProject: (project: Project) => void;
  setFilePath: (path: string | null) => void;
  newProject: () => void;
  selectNode: (id: string | null) => void;

  addAudioFile: (file: AudioFile) => void;
  renameAudioFile: (id: string, name: string) => void;
  removeAudioFile: (id: string) => void;

  addSoundNode: (fileId: string | null, position: { x: number; y: number }) => string;
  updateNodeData: (id: string, patch: Partial<SoundNodeData> | Partial<AudioNodeData>) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;

  addEdge: (edge: Omit<ProjectEdge, 'id'>) => void;
  removeEdge: (id: string) => void;

  setHotkey: (key: string, nodeId: string) => void;
  removeHotkey: (key: string) => void;
}

export const useStore = create<StoreState>((set) => ({
  project: defaultProject(),
  selectedNodeId: null,
  filePath: null,

  setProject: (project) => set({ project, selectedNodeId: null }),
  setFilePath: (filePath) => set({ filePath }),
  newProject: () => set({ project: defaultProject(), filePath: null, selectedNodeId: null }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),

  addAudioFile: (file) =>
    set((s) => ({ project: { ...s.project, library: [...s.project.library, file] } })),

  renameAudioFile: (id, name) =>
    set((s) => ({
      project: {
        ...s.project,
        library: s.project.library.map((f) => (f.id === id ? { ...f, name } : f)),
      },
    })),

  removeAudioFile: (id) =>
    set((s) => ({
      project: { ...s.project, library: s.project.library.filter((f) => f.id !== id) },
    })),

  addSoundNode: (fileId, position) => {
    const id = `sound-${makeId()}`;
    const newNode: ProjectNode = {
      id,
      type: 'sound',
      position,
      data: { kind: 'sound', fileId, volume: 0.8, loop: true, playing: false, fadeIn: 0, fadeOut: 0, pan: 0, panRandom: 0, pitchMin: 1, pitchMax: 1 },
    };
    const autoEdge: ProjectEdge = {
      id: `edge-${id}-${MASTER_NODE_ID}`,
      source: id,
      target: MASTER_NODE_ID,
    };
    set((s) => ({
      project: {
        ...s.project,
        nodes: [...s.project.nodes, newNode],
        edges: [...s.project.edges, autoEdge],
      },
    }));
    return id;
  },

  updateNodeData: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        nodes: s.project.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } as AudioNodeData } : n
        ),
      },
    })),

  updateNodePosition: (id, position) =>
    set((s) => ({
      project: {
        ...s.project,
        nodes: s.project.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
      },
    })),

  removeNode: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        nodes: s.project.nodes.filter((n) => n.id !== id),
        edges: s.project.edges.filter((e) => e.source !== id && e.target !== id),
      },
    })),

  addEdge: (edge) =>
    set((s) => ({
      project: {
        ...s.project,
        edges: [...s.project.edges, { ...edge, id: `edge-${edge.source}-${edge.target}` }],
      },
    })),

  removeEdge: (id) =>
    set((s) => ({
      project: { ...s.project, edges: s.project.edges.filter((e) => e.id !== id) },
    })),

  setHotkey: (key, nodeId) =>
    set((s) => ({
      project: { ...s.project, hotkeys: { ...s.project.hotkeys, [key]: nodeId } },
    })),

  removeHotkey: (key) =>
    set((s) => {
      const { [key]: _removed, ...rest } = s.project.hotkeys;
      return { project: { ...s.project, hotkeys: rest } };
    }),
}));
