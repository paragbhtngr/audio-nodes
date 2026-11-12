import { create } from 'zustand';
import type {
  Project, ProjectNode, ProjectEdge, AudioFile, AudioNodeData,
  SoundNodeData, EffectType, Scene, SceneCanvas, Prefab, YouTubeNodeData,
  ProjectFileV1, ProjectFileV2,
} from '../types';

export const MASTER_NODE_ID = 'master-out';
export const UNTITLED_SCENE_NAME = 'Untitled scene';

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Scenes ─────────────────────────────────────────────────────────────────────────────────

export function emptyCanvas(): SceneCanvas {
  return {
    nodes: [{ id: MASTER_NODE_ID, type: 'master', position: { x: 700, y: 300 }, data: { kind: 'master', volume: 1 } }],
    edges: [],
    hotkeys: {},
  };
}

export function isEmptyCanvas(c: SceneCanvas): boolean {
  return c.edges.length === 0 && c.nodes.every((n) => n.type === 'master');
}

function newUntitledScene(): Scene {
  return { id: `scene-${makeId()}`, name: UNTITLED_SCENE_NAME, untitled: true, ...emptyCanvas() };
}

/** The project's scenes with the live canvas written back into the current scene. */
export function flushScenes(p: Project): Scene[] {
  return p.scenes.map((sc) =>
    sc.id !== p.currentSceneId || (sc.nodes === p.nodes && sc.edges === p.edges && sc.hotkeys === p.hotkeys)
      ? sc
      : { ...sc, nodes: p.nodes, edges: p.edges, hotkeys: p.hotkeys }
  );
}

/** Make `id` the current scene, loading its canvas as the live one. */
function loadScene(p: Omit<Project, 'nodes' | 'edges' | 'hotkeys' | 'currentSceneId'>, id: string): Project {
  const sc = p.scenes.find((x) => x.id === id)!;
  return { ...p, currentSceneId: id, nodes: sc.nodes, edges: sc.edges, hotkeys: sc.hotkeys };
}

/** Build an in-memory project that opens on an empty Untitled scene (reusing one if the file has it). */
export function projectFromFile(file: ProjectFileV2): Project {
  const scenes = [...file.scenes];
  let start = scenes.find((sc) => sc.untitled && isEmptyCanvas(sc));
  if (!start) {
    start = newUntitledScene();
    scenes.push(start);
  }
  return loadScene({ schemaVersion: 2, name: file.name, library: file.library, scenes }, start.id);
}

export function defaultProject(): Project {
  return projectFromFile({ schemaVersion: 2, name: 'Untitled Project', library: [], scenes: [] });
}

export function toProjectFile(p: Project): ProjectFileV2 {
  return { schemaVersion: 2, name: p.name, library: p.library, scenes: flushScenes(p) };
}

/**
 * Upgrade a parsed project file to v2. A v1 file had one shared canvas plus group-state
 * snapshot scenes: the canvas becomes a "Main" scene and each snapshot becomes its own copy
 * of the canvas with those group volumes / playing states applied.
 */
export function migrateProjectFile(raw: ProjectFileV1 | ProjectFileV2): ProjectFileV2 {
  if (raw.schemaVersion === 2) return { ...raw, scenes: raw.scenes ?? [], library: raw.library ?? [] };
  const base: SceneCanvas = { nodes: raw.nodes ?? emptyCanvas().nodes, edges: raw.edges ?? [], hotkeys: raw.hotkeys ?? {} };
  const scenes: Scene[] = [{ id: `scene-${makeId()}`, name: 'Main', ...base }];
  for (const old of raw.scenes ?? []) {
    const states = new Map(old.groupStates.map((g) => [g.groupId, g]));
    const memberOf = new Map(base.edges.filter((e) => states.has(e.target)).map((e) => [e.source, e.target]));
    const nodes = base.nodes.map((n): ProjectNode => {
      const gs = states.get(n.id);
      if (gs && n.type === 'group') return { ...n, data: { ...n.data, volume: gs.volume } as AudioNodeData };
      const group = memberOf.get(n.id);
      if (group && 'playing' in n.data) return { ...n, data: { ...n.data, playing: states.get(group)!.active } as AudioNodeData };
      return n;
    });
    scenes.push({ id: old.id, name: old.name, nodes, edges: base.edges, hotkeys: base.hotkeys });
  }
  return { schemaVersion: 2, name: raw.name, library: raw.library ?? [], scenes };
}

/** Structural (reference-per-scene) comparison, so switching scenes alone doesn't dirty the document. */
export function isProjectDirty(project: Project, saved: Project | null): boolean {
  if (!saved) return true;
  if (project === saved) return false;
  if (project.name !== saved.name || project.library !== saved.library) return true;
  const a = flushScenes(project);
  const b = flushScenes(saved);
  return a.length !== b.length || a.some((sc, i) => {
    const o = b[i];
    return sc.id !== o.id || sc.name !== o.name || !!sc.untitled !== !!o.untitled
      || sc.nodes !== o.nodes || sc.edges !== o.edges || sc.hotkeys !== o.hotkeys;
  });
}

// ── Store ──────────────────────────────────────────────────────────────────────────────────

interface StoreState {
  project: Project;
  selectedNodeId: string | null;
  filePath: string | null;
  /** The project as last loaded from / written to disk; the document is dirty when it differs. */
  savedProject: Project | null;

  /** Replace the open document. `dirty` marks it as having unsaved changes (e.g. crash recovery). */
  loadProject: (project: Project, filePath: string | null, opts?: { dirty?: boolean }) => void;
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

  /** Switch the canvas to another scene. An empty Untitled scene being left is discarded. */
  switchScene: (id: string) => void;
  /** Start a new, empty Untitled scene and switch to it. */
  newScene: () => void;
  /** Copy the current scene's canvas into a new named scene and switch to it. */
  duplicateScene: (name: string) => void;
  /** Rename a scene; naming an Untitled scene saves it as a named scene. */
  renameScene: (id: string, name: string) => void;
  /** Delete a scene; deleting the current one switches to a neighbour (or a new Untitled scene). */
  deleteScene: (id: string) => void;

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

export const useStore = create<StoreState>()(
    (set) => {
      const initial = defaultProject();
      return {
      project: initial,
      savedProject: initial,
      selectedNodeId: null,
      filePath: null,

      loadProject: (project, filePath, opts) =>
        set({ project, filePath, savedProject: opts?.dirty ? null : project, selectedNodeId: null }),
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
        set({ project, savedProject: project, filePath: null, selectedNodeId: null });
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
          const clean = s.savedProject && !isProjectDirty(s.project, s.savedProject);
          return { project, savedProject: clean ? { ...s.savedProject!, library: project.library } : s.savedProject };
        }),

      switchScene: (id) =>
        set((s) => {
          const p = s.project;
          if (id === p.currentSceneId || !p.scenes.some((sc) => sc.id === id)) return {};
          const scenes = flushScenes(p).filter((sc) =>
            !(sc.id === p.currentSceneId && sc.untitled && isEmptyCanvas(sc)));
          return { project: loadScene({ ...p, scenes }, id), selectedNodeId: null };
        }),

      newScene: () =>
        set((s) => {
          const p = s.project;
          const cur = flushScenes(p).find((sc) => sc.id === p.currentSceneId);
          if (cur?.untitled && isEmptyCanvas(cur)) return {};
          const scene = newUntitledScene();
          return { project: loadScene({ ...p, scenes: [...flushScenes(p), scene] }, scene.id), selectedNodeId: null };
        }),

      duplicateScene: (name) =>
        set((s) => {
          const p = s.project;
          const scenes = flushScenes(p);
          const idx = scenes.findIndex((sc) => sc.id === p.currentSceneId);
          // Node ids are scene-local, so the copy keeps them (ducking targets and hotkeys stay valid).
          const copy: Scene = { id: `scene-${makeId()}`, name, nodes: p.nodes, edges: p.edges, hotkeys: p.hotkeys };
          scenes.splice(idx + 1, 0, copy);
          return { project: loadScene({ ...p, scenes }, copy.id) };
        }),

      renameScene: (id, name) =>
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => sc.id === id ? { ...sc, name, untitled: false } : sc),
          },
        })),

      deleteScene: (id) =>
        set((s) => {
          const p = s.project;
          const idx = p.scenes.findIndex((sc) => sc.id === id);
          if (idx < 0) return {};
          const scenes = flushScenes(p).filter((sc) => sc.id !== id);
          if (id !== p.currentSceneId) return { project: { ...p, scenes } };
          const next = scenes[Math.min(idx, scenes.length - 1)] ?? newUntitledScene();
          if (!scenes.includes(next)) scenes.push(next);
          return { project: loadScene({ ...p, scenes }, next.id), selectedNodeId: null };
        }),

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

export const selectIsDirty = (s: { project: Project; savedProject: Project | null }) =>
  isProjectDirty(s.project, s.savedProject);
