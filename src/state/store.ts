import { create } from 'zustand';
import type {
  Project, ProjectNode, ProjectEdge, AudioFile, AudioNodeData,
  SoundNodeData, EffectType, Scene, Prefab, YouTubeNodeData,
} from '../types';

export const MASTER_NODE_ID = 'master-out';

export function defaultProject(): Project {
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
    scenes: [],
  };
}

export type GroupState = Scene['groupStates'][number];

/** Snapshot the live state of every group: its volume, and whether any member is playing. */
export function captureGroupStates(project: Project): GroupState[] {
  return project.nodes
    .filter((n) => n.type === 'group')
    .map((n) => {
      const memberIds = project.edges.filter((e) => e.target === n.id).map((e) => e.source);
      const active = memberIds.some((id) => {
        const m = project.nodes.find((x) => x.id === id);
        return !!m && !!(m.data as { playing?: boolean }).playing;
      });
      return { groupId: n.id, volume: (n.data as { volume: number }).volume, active };
    });
}

/** True when a saved scene no longer matches the live group states (ignoring groups deleted since). */
export function sceneDiffersFromLive(scene: GroupState[], live: GroupState[]): boolean {
  const saved = new Map(scene.map((g) => [g.groupId, g]));
  return live.some((g) => {
    const s = saved.get(g.groupId);
    if (!s) return g.active;
    return s.active !== g.active || Math.abs(s.volume - g.volume) > 0.001;
  });
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface SceneSession {
  /** Named scene the live state was last recalled from / saved as; null = the Untitled scene. */
  currentSceneId: string | null;
  /** Untitled scene's group states, stashed while a named scene is current. */
  untitledScene: GroupState[] | null;
}

interface StoreState extends SceneSession {
  project: Project;
  selectedNodeId: string | null;
  filePath: string | null;
  /** The project as last loaded from / written to disk; the document is dirty when it differs. */
  savedProject: Project | null;

  /** Replace the open document. `dirty` marks it as having unsaved changes (e.g. crash recovery). */
  loadProject: (project: Project, filePath: string | null, opts?: { dirty?: boolean; scenes?: SceneSession }) => void;
  /** Record that `source` (the project at save time) was written to `filePath` as `saved`. */
  markSaved: (source: Project, saved: Project, filePath: string) => void;
  newProject: () => void;
  selectNode: (id: string | null) => void;

  addAudioFile: (file: AudioFile) => void;
  renameAudioFile: (id: string, name: string) => void;
  removeAudioFile: (id: string) => void;
  removeFolder: (folder: string) => void;

  addSoundNode: (fileId: string | null, position: { x: number; y: number }) => string;
  addGroupNode: (position: { x: number; y: number }) => string;
  addRandomPoolNode: (position: { x: number; y: number }) => string;
  addEffectNode: (effectType: EffectType, position: { x: number; y: number }) => string;
  addYouTubeNode: (position: { x: number; y: number }) => string;
  instantiatePrefab: (prefab: Prefab, position: { x: number; y: number }) => void;

  updateLibraryFileDuration: (fileId: string, duration: number) => void;

  /** Capture the live state as a new named scene and make it current. */
  saveSceneAs: (name: string) => void;
  /** Overwrite the current named scene with the live state. */
  saveCurrentScene: () => void;
  /** Leave the current named scene and start a fresh Untitled scene from the live state. */
  newScene: () => void;
  /** Switch which scene is current (call before recalling it, so the Untitled state gets stashed). */
  setCurrentScene: (id: string | null) => void;
  deleteScene: (id: string) => void;
  renameScene: (id: string, name: string) => void;

  missingFileIds: Set<string>;
  setMissingFileIds: (ids: Set<string>) => void;

  updateNodeData: (id: string, patch: Partial<SoundNodeData> | Partial<AudioNodeData>) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  removeGroupReconnect: (id: string) => void;
  removeGroupWithMembers: (id: string) => void;

  addEdge: (edge: Omit<ProjectEdge, 'id'>) => void;
  removeEdge: (id: string) => void;

  setHotkey: (key: string, nodeId: string) => void;
  removeHotkey: (key: string) => void;
}

const freshScenes = (): SceneSession => ({ currentSceneId: null, untitledScene: null });

export const useStore = create<StoreState>()(
    (set) => {
      const initial = defaultProject();
      return {
      project: initial,
      savedProject: initial,
      selectedNodeId: null,
      filePath: null,
      ...freshScenes(),

      loadProject: (project, filePath, opts) =>
        set({
          project,
          filePath,
          savedProject: opts?.dirty ? null : project,
          selectedNodeId: null,
          ...(opts?.scenes ?? freshScenes()),
        }),
      markSaved: (source, saved, filePath) =>
        set((s) => {
          // Edits made while the write was in flight keep the document dirty.
          const unchanged = s.project === source;
          return {
            filePath,
            savedProject: saved,
            project: unchanged ? saved : { ...s.project, name: saved.name },
          };
        }),
      newProject: () => {
        const project = defaultProject();
        set({ project, savedProject: project, filePath: null, selectedNodeId: null, ...freshScenes() });
      },
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

      removeFolder: (folder) =>
        set((s) => ({
          project: { ...s.project, library: s.project.library.filter((f) => f.folder !== folder) },
        })),

      addSoundNode: (fileId, position) => {
        const id = `sound-${makeId()}`;
        const newNode: ProjectNode = {
          id,
          type: 'sound',
          position,
          data: { kind: 'sound', fileId, volume: 0.8, loop: true, playing: false, fadeIn: 0, fadeOut: 0, pan: 0, panRandom: 0, pitchMin: 1, pitchMax: 1, duckTargets: [], duckAmount: 0.5, duckRelease: 1 },
        };
        const autoEdge: ProjectEdge = { id: `edge-${id}-${MASTER_NODE_ID}`, source: id, target: MASTER_NODE_ID };
        set((s) => ({ project: { ...s.project, nodes: [...s.project.nodes, newNode], edges: [...s.project.edges, autoEdge] } }));
        return id;
      },

      addGroupNode: (position) => {
        const id = `group-${makeId()}`;
        const newNode: ProjectNode = {
          id,
          type: 'group',
          position,
          data: { kind: 'group', label: 'Group', icon: '', color: '#bb9af7', volume: 1, collapsed: false },
        };
        const autoEdge: ProjectEdge = { id: `edge-${id}-${MASTER_NODE_ID}`, source: id, target: MASTER_NODE_ID };
        set((s) => ({ project: { ...s.project, nodes: [...s.project.nodes, newNode], edges: [...s.project.edges, autoEdge] } }));
        return id;
      },

      addEffectNode: (effectType, position) => {
        const id = `effect-${makeId()}`;
        const defaults: Record<EffectType, object> = {
          reverb:   { wet: 0.3, decay: 2, frequency: 800, q: 1 },
          lowpass:  { wet: 1,   decay: 2, frequency: 800, q: 1 },
          highpass: { wet: 1,   decay: 2, frequency: 400, q: 1 },
        };
        const newNode: ProjectNode = {
          id,
          type: 'effect',
          position,
          data: { kind: 'effect', effectType, ...defaults[effectType] } as AudioNodeData,
        };
        const autoEdge: ProjectEdge = { id: `edge-${id}-${MASTER_NODE_ID}`, source: id, target: MASTER_NODE_ID };
        set((s) => ({ project: { ...s.project, nodes: [...s.project.nodes, newNode], edges: [...s.project.edges, autoEdge] } }));
        return id;
      },

      addRandomPoolNode: (position) => {
        const id = `pool-${makeId()}`;
        const newNode: ProjectNode = {
          id,
          type: 'randomPool',
          position,
          data: { kind: 'randomPool', label: 'Random Pool', fileIds: [], volume: 0.8, loop: false, playing: false, fadeIn: 0, fadeOut: 0, pan: 0, panRandom: 0, pitchMin: 1, pitchMax: 1, duckTargets: [], duckAmount: 0.5, duckRelease: 1 },
        };
        const autoEdge: ProjectEdge = { id: `edge-${id}-${MASTER_NODE_ID}`, source: id, target: MASTER_NODE_ID };
        set((s) => ({ project: { ...s.project, nodes: [...s.project.nodes, newNode], edges: [...s.project.edges, autoEdge] } }));
        return id;
      },

      addYouTubeNode: (position) => {
        const id = `yt-${makeId()}`;
        const newNode: ProjectNode = {
          id,
          type: 'youtube',
          position,
          data: { kind: 'youtube', videoId: null, title: '', playing: false, loop: false, volume: 0.8 } as YouTubeNodeData,
        };
        const autoEdge: ProjectEdge = { id: `edge-${id}-${MASTER_NODE_ID}`, source: id, target: MASTER_NODE_ID };
        set((s) => ({ project: { ...s.project, nodes: [...s.project.nodes, newNode], edges: [...s.project.edges, autoEdge] } }));
        return id;
      },

      instantiatePrefab: (prefab, position) =>
        set((s) => {
          const p = s.project;
          const fileIdMap = new Map<string, string>();
          const newLibrary = [...p.library];

          for (const file of prefab.library) {
            const existing = newLibrary.find((f) => f.path === file.path);
            if (existing) {
              fileIdMap.set(file.id, existing.id);
            } else {
              const newId = `file-${makeId()}`;
              fileIdMap.set(file.id, newId);
              newLibrary.push({ ...file, id: newId });
            }
          }

          const groupId = `group-${makeId()}`;
          const newNodes: ProjectNode[] = [
            ...p.nodes,
            { id: groupId, type: 'group', position, data: { ...prefab.groupData, collapsed: false } },
          ];
          const newEdges: ProjectEdge[] = [
            ...p.edges,
            { id: `edge-${groupId}-${MASTER_NODE_ID}`, source: groupId, target: MASTER_NODE_ID },
          ];

          for (const member of prefab.members) {
            const kindToType = { sound: 'sound', randomPool: 'randomPool', youtube: 'youtube' } as const;
            const kindToPrefix = { sound: 'sound', randomPool: 'pool', youtube: 'yt' } as const;
            const memberId = `${kindToPrefix[member.data.kind]}-${makeId()}`;
            const memberPos = { x: position.x + member.relativePosition.x, y: position.y + member.relativePosition.y };

            let data: AudioNodeData;
            if (member.data.kind === 'sound') {
              data = { ...member.data, playing: false, fileId: member.data.fileId ? (fileIdMap.get(member.data.fileId) ?? null) : null };
            } else if (member.data.kind === 'randomPool') {
              data = { ...member.data, label: member.data.label ?? 'Random Pool', playing: false, fileIds: member.data.fileIds.map((fid) => fileIdMap.get(fid) ?? fid) };
            } else {
              data = { ...member.data, playing: false };
            }

            newNodes.push({ id: memberId, type: kindToType[member.data.kind], position: memberPos, data });
            newEdges.push({ id: `edge-${memberId}-${groupId}`, source: memberId, target: groupId });
          }

          return { project: { ...p, library: newLibrary, nodes: newNodes, edges: newEdges } };
        }),

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
        id === MASTER_NODE_ID ? undefined : set((s) => ({
          project: {
            ...s.project,
            nodes: s.project.nodes.filter((n) => n.id !== id),
            edges: s.project.edges.filter((e) => e.source !== id && e.target !== id),
          },
        })),

      removeGroupReconnect: (id) =>
        set((s) => {
          const memberIds = s.project.edges.filter((e) => e.target === id).map((e) => e.source);
          const newEdges = s.project.edges.filter((e) => e.source !== id && e.target !== id);
          const reconnectEdges = memberIds.map((mid) => ({
            id: `edge-${mid}-${MASTER_NODE_ID}`,
            source: mid,
            target: MASTER_NODE_ID,
          }));
          return {
            project: {
              ...s.project,
              nodes: s.project.nodes.filter((n) => n.id !== id),
              edges: [...newEdges, ...reconnectEdges],
            },
          };
        }),

      removeGroupWithMembers: (id) =>
        set((s) => {
          const memberIds = new Set(s.project.edges.filter((e) => e.target === id).map((e) => e.source));
          return {
            project: {
              ...s.project,
              nodes: s.project.nodes.filter((n) => n.id !== id && !memberIds.has(n.id)),
              edges: s.project.edges.filter((e) => e.source !== id && e.target !== id && !memberIds.has(e.source)),
            },
          };
        }),

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

      updateLibraryFileDuration: (fileId, duration) =>
        set((s) => {
          // Durations are derived metadata filled in after load; they shouldn't dirty a clean document.
          const project = { ...s.project, library: s.project.library.map((f) => f.id === fileId ? { ...f, duration } : f) };
          return { project, savedProject: s.savedProject === s.project ? project : s.savedProject };
        }),

      saveSceneAs: (name) =>
        set((s) => {
          const scene: Scene = { id: `scene-${makeId()}`, name, groupStates: captureGroupStates(s.project) };
          return {
            project: { ...s.project, scenes: [...s.project.scenes, scene] },
            currentSceneId: scene.id,
            // Saving the Untitled scene turns it into this named scene.
            untitledScene: s.currentSceneId === null ? null : s.untitledScene,
          };
        }),

      saveCurrentScene: () =>
        set((s) => {
          if (!s.currentSceneId) return {};
          const groupStates = captureGroupStates(s.project);
          return {
            project: {
              ...s.project,
              scenes: s.project.scenes.map((sc) => sc.id === s.currentSceneId ? { ...sc, groupStates } : sc),
            },
          };
        }),

      newScene: () => set({ currentSceneId: null, untitledScene: null }),

      setCurrentScene: (id) =>
        set((s) => {
          if (id === s.currentSceneId) return {};
          if (id === null) return { currentSceneId: null, untitledScene: null };
          return {
            currentSceneId: id,
            untitledScene: s.currentSceneId === null ? captureGroupStates(s.project) : s.untitledScene,
          };
        }),

      deleteScene: (id) =>
        set((s) => ({
          project: { ...s.project, scenes: s.project.scenes.filter((sc) => sc.id !== id) },
          ...(s.currentSceneId === id ? { currentSceneId: null, untitledScene: null } : {}),
        })),

      renameScene: (id, name) =>
        set((s) => ({ project: { ...s.project, scenes: s.project.scenes.map((sc) => sc.id === id ? { ...sc, name } : sc) } })),

      missingFileIds: new Set<string>(),
      setMissingFileIds: (ids) => set({ missingFileIds: ids }),

      setHotkey: (key, nodeId) =>
        set((s) => ({
          project: { ...s.project, hotkeys: { ...s.project.hotkeys, [key]: nodeId } },
        })),

      removeHotkey: (key) =>
        set((s) => {
          const { [key]: _removed, ...rest } = s.project.hotkeys;
          return { project: { ...s.project, hotkeys: rest } };
        }),
      };
    }
);

export const selectIsDirty = (s: { project: Project; savedProject: Project | null }) => s.project !== s.savedProject;
