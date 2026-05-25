import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge as rfAddEdge,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../state/store';
import { MasterOutNode } from '../components/nodes/MasterOutNode';
import { SoundNode } from '../components/nodes/SoundNode';
import { GroupNode } from '../components/nodes/GroupNode';
import { RandomPoolNode } from '../components/nodes/RandomPoolNode';
import { EffectNode } from '../components/nodes/EffectNode';
import { YouTubeNode } from '../components/nodes/YouTubeNode';
import { usePrefabStore } from '../state/prefabStore';
import { useRecentStore } from '../state/recentStore';
import { audioEngine } from '../audio/engine';
import { Inspector } from '../components/inspector/Inspector';
import { HotkeyHUD } from '../components/HotkeyHUD';
import type { AudioFile, AudioNodeData, SoundNodeData, GroupNodeData, EffectType, Scene } from '../types';

const nodeTypes = { sound: SoundNode, master: MasterOutNode, group: GroupNode, randomPool: RandomPoolNode, effect: EffectNode, youtube: YouTubeNode };

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
}

function toRFNode(n: { id: string; type: string; position: { x: number; y: number }; data: AudioNodeData }, hidden = false, orphaned = false): Node {
  return { id: n.id, type: n.type, position: n.position, data: n.data as unknown as Record<string, unknown>, hidden, className: orphaned ? 'node-orphaned' : '' };
}

function computeOrphanedIds(project: { nodes: { id: string; type: string }[]; edges: { source: string; target: string }[] }): Set<string> {
  const reachable = new Set(project.nodes.filter((n) => n.type === 'master').map((n) => n.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of project.edges) {
      if (reachable.has(e.target) && !reachable.has(e.source)) { reachable.add(e.source); changed = true; }
    }
  }
  return new Set(project.nodes.filter((n) => n.type !== 'master' && !reachable.has(n.id)).map((n) => n.id));
}

function toRFEdge(e: { id: string; source: string; target: string }, hidden = false): Edge {
  return { id: e.id, source: e.source, target: e.target, hidden };
}

function collapsedHiddenIds(project: { nodes: { id: string; type: string; data: AudioNodeData }[]; edges: { source: string; target: string }[] }) {
  const collapsedGroupIds = new Set(
    project.nodes
      .filter((n) => n.type === 'group' && (n.data as GroupNodeData).collapsed)
      .map((n) => n.id)
  );
  return new Set(
    project.edges.filter((e) => collapsedGroupIds.has(e.target)).map((e) => e.source)
  );
}

// Serialize paths to relative before saving, restore after loading
async function serializeProject(project: object, projectPath: string): Promise<string> {
  if (!window.audioNodes) return JSON.stringify(project, null, 2);
  const clone = structuredClone(project) as { library: { path: string }[] };
  for (const file of clone.library) {
    file.path = await window.audioNodes.relativizePath(projectPath, file.path);
  }
  return JSON.stringify(clone, null, 2);
}

async function deserializeProject(json: string, projectPath: string): Promise<object> {
  const parsed = JSON.parse(json) as { library: { path: string }[] };
  if (!window.audioNodes) return parsed;
  for (const file of parsed.library) {
    if (!file.path.startsWith('/')) {
      file.path = await window.audioNodes.absolutizePath(projectPath, file.path);
    }
  }
  return parsed;
}

function Canvas() {
  const project = useStore((s) => s.project);
  const { addSoundNode, addGroupNode, addRandomPoolNode, addEffectNode, addYouTubeNode, addAudioFile, instantiatePrefab, addEdge: storeAddEdge, removeEdge: storeRemoveEdge, removeNode: storeRemoveNode, removeGroupReconnect, removeGroupWithMembers, updateNodePosition, selectNode } = useStore((s) => s);
  const { screenToFlowPosition } = useReactFlow();

  const hiddenIds = collapsedHiddenIds(project);
  const orphanedIds = computeOrphanedIds(project);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(project.nodes.map((n) => toRFNode(n, hiddenIds.has(n.id), orphanedIds.has(n.id))));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(project.edges.map((e) => toRFEdge(e, hiddenIds.has(e.source))));

  const prevProjectRef = useRef(project);
  useEffect(() => {
    if (prevProjectRef.current !== project) {
      const hids = collapsedHiddenIds(project);
      const orphs = computeOrphanedIds(project);
      setNodes(project.nodes.map((n) => toRFNode(n, hids.has(n.id), orphs.has(n.id))));
      setEdges(project.edges.map((e) => toRFEdge(e, hids.has(e.source))));
      prevProjectRef.current = project;
    }
  }, [project, setNodes, setEdges]);

  // keep RF node data in sync when audio state changes
  useEffect(() => {
    const hids = collapsedHiddenIds(project);
    const orphs = computeOrphanedIds(project);
    setNodes((rn) =>
      rn.map((rfNode) => {
        const stored = project.nodes.find((n) => n.id === rfNode.id);
        return stored
          ? { ...rfNode, data: stored.data as unknown as Record<string, unknown>, hidden: hids.has(rfNode.id), className: orphs.has(rfNode.id) ? 'node-orphaned' : '' }
          : rfNode;
      })
    );
    setEdges((re) =>
      re.map((rfEdge) => ({ ...rfEdge, hidden: hids.has(rfEdge.source) }))
    );
  }, [project.nodes, setNodes]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => selectNode(node.id),
    [selectNode]
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const sourceId = conn.source!;
      // Sound and group nodes have a single output — replace any existing outgoing edge
      const displaced = useStore.getState().project.edges.filter((e) => e.source === sourceId);
      displaced.forEach((e) => storeRemoveEdge(e.id));
      setEdges((eds) => rfAddEdge(conn, eds.filter((e) => e.source !== sourceId)));
      storeAddEdge({ source: sourceId, target: conn.target! });
    },
    [setEdges, storeAddEdge, storeRemoveEdge]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes);
      changes.forEach((c) => { if (c.type === 'remove') storeRemoveEdge(c.id); });
    },
    [onEdgesChange, storeRemoveEdge]
  );

  const onBeforeDelete = useCallback(
    async ({ nodes: toDelete }: { nodes: Node[]; edges: Edge[] }) => {
      const groupNodes = toDelete.filter((n) => n.type === 'group');
      for (const group of groupNodes) {
        const memberIds = useStore.getState().project.edges
          .filter((e) => e.target === group.id).map((e) => e.source);
        if (memberIds.length === 0) { storeRemoveNode(group.id); continue; }
        const data = group.data as { label?: string };
        const choice = await window.audioNodes.showMessageBox({
          title: 'Delete Group',
          message: `"${data.label ?? 'Group'}" has ${memberIds.length} connected sound${memberIds.length !== 1 ? 's' : ''}. What should happen to them?`,
          buttons: ['Reconnect to Master', 'Delete Sounds', 'Cancel'],
        });
        if (choice === 0) removeGroupReconnect(group.id);
        else if (choice === 1) removeGroupWithMembers(group.id);
        // choice === 2 (Cancel) — do nothing
      }
      // Handle non-group nodes normally
      toDelete.filter((n) => n.type !== 'group').forEach((n) => storeRemoveNode(n.id));
      return false; // we handled store updates ourselves; tell RF not to apply its own deletion
    },
    [storeRemoveNode, removeGroupReconnect, removeGroupWithMembers]
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => updateNodePosition(node.id, node.position),
    [updateNodePosition]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const spawnNode = useCallback(
    (fileId: string | null, position: { x: number; y: number }) => {
      const id = addSoundNode(fileId, position);
      const newNode = toRFNode(useStore.getState().project.nodes.find((n) => n.id === id)!);
      const autoEdge = toRFEdge({ id: `edge-${id}-master-out`, source: id, target: 'master-out' });
      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, autoEdge]);
    },
    [addSoundNode, setNodes, setEdges]
  );

  const audioExts = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus']);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      // Prefab drop — store handles all node/edge/library creation atomically;
      // the project useEffect will sync RF state on the next render
      const prefabId = e.dataTransfer.getData('prefabId');
      if (prefabId) {
        const prefab = usePrefabStore.getState().prefabs.find((p) => p.id === prefabId);
        if (prefab) instantiatePrefab(prefab, position);
        return;
      }

      // Files dragged from Finder / Explorer
      if (e.dataTransfer.files.length > 0) {
        Array.from(e.dataTransfer.files).forEach((file, i) => {
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          if (!audioExts.has(ext)) return;
          const filePath = file.path;
          if (!filePath) return;

          const existing = useStore.getState().project.library.find((f) => f.path === filePath);
          let fileId: string;
          if (existing) {
            fileId = existing.id;
          } else {
            fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            addAudioFile({ id: fileId, path: filePath, name: file.name.replace(/\.[^.]+$/, '') });
          }
          spawnNode(fileId, { x: position.x + i * 220, y: position.y });
        });
        return;
      }

      // File dragged from the library sidebar
      const fileId = e.dataTransfer.getData('fileId') || null;
      spawnNode(fileId, position);
    },
    [addAudioFile, spawnNode, instantiatePrefab, screenToFlowPosition, audioExts]
  );

  const addNodeToCanvas = useCallback((id: string) => {
    const node = useStore.getState().project.nodes.find((n) => n.id === id)!;
    const edge = useStore.getState().project.edges.find((e) => e.source === id);
    setNodes((nds) => [...nds, toRFNode(node)]);
    if (edge) setEdges((eds) => [...eds, toRFEdge(edge)]);
  }, [setNodes, setEdges]);

  const addGroup = useCallback(() => {
    const id = addGroupNode({ x: 300, y: 200 });
    addNodeToCanvas(id);
  }, [addGroupNode, addNodeToCanvas]);

  const addPool = useCallback(() => {
    const id = addRandomPoolNode({ x: 300, y: 200 });
    addNodeToCanvas(id);
  }, [addRandomPoolNode, addNodeToCanvas]);

  const addEffect = useCallback((effectType: EffectType) => {
    const id = addEffectNode(effectType, { x: 400, y: 200 });
    addNodeToCanvas(id);
  }, [addEffectNode, addNodeToCanvas]);

  const addYT = useCallback(() => {
    const id = addYouTubeNode({ x: 300, y: 200 });
    addNodeToCanvas(id);
  }, [addYouTubeNode, addNodeToCanvas]);

  return (
    <div className="canvas-wrapper">
      <div className="canvas-toolbar">
        <button className="an-btn" onClick={addGroup}>+ Group</button>
        <button className="an-btn" onClick={addPool}>+ Random Pool</button>
        <select className="an-btn" style={{ cursor: 'pointer' }}
          value="" onChange={(e) => { if (e.target.value) { addEffect(e.target.value as EffectType); e.target.value = ''; } }}>
          <option value="">+ Effect…</option>
          <option value="reverb">Reverb</option>
          <option value="lowpass">Low Pass</option>
          <option value="highpass">High Pass</option>
        </select>
        <button className="an-btn" onClick={addYT}>+ YouTube</button>
      </div>
      <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onBeforeDelete={onBeforeDelete}
        fitView
      >
        <Background gap={16} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
      <HotkeyHUD />
    </div>
    </div>
  );
}

function LibraryItem({ file }: { file: AudioFile }) {
  const renameAudioFile = useStore((s) => s.renameAudioFile);
  const removeAudioFile = useStore((s) => s.removeAudioFile);
  const isMissing = useStore((s) => s.missingFileIds.has(file.id));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) renameAudioFile(file.id, trimmed);
    else setDraft(file.name);
    setEditing(false);
  };

  return (
    <li
      className="library-item"
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('fileId', file.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="library-item__rename"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(file.name); setEditing(false); }
            e.stopPropagation();
          }}
        />
      ) : (
        <span
          className="library-item__name"
          title={isMissing ? 'File not found' : 'Click to rename'}
          onClick={() => { setDraft(file.name); setEditing(true); }}
          style={isMissing ? { color: '#f7768e' } : undefined}
        >
          {isMissing && '⚠ '}{file.name}
          {file.duration != null && <span className="library-item__dur">{formatDuration(file.duration)}</span>}
        </span>
      )}
      <button
        className="library-item__remove"
        onClick={() => removeAudioFile(file.id)}
        title="Remove from library"
      >
        ×
      </button>
    </li>
  );
}

function ScenesPanel() {
  const scenes = useStore((s) => s.project.scenes);
  const addScene = useStore((s) => s.addScene);
  const deleteScene = useStore((s) => s.deleteScene);
  const renameScene = useStore((s) => s.renameScene);
  const [crossfadeDur, setCrossfadeDur] = useState(2);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (scenes.length === 0 && true) {
    return (
      <div className="sidebar__section">
        <div className="sidebar__section-header">
          <h2>Scenes</h2>
          <button className="an-btn" onClick={() => addScene(`Scene ${scenes.length + 1}`)}>+</button>
        </div>
        <p className="hint">Capture group states to recall later.</p>
      </div>
    );
  }

  return (
    <div className="sidebar__section">
      <div className="sidebar__section-header">
        <h2>Scenes</h2>
        <button className="an-btn" onClick={() => addScene(`Scene ${scenes.length + 1}`)}>+</button>
      </div>
      <div className="scenes__fade-row">
        <span className="an-node__label">Fade</span>
        <input type="range" className="insp__slider" min={0.5} max={10} step={0.5}
          value={crossfadeDur} onChange={(e) => setCrossfadeDur(parseFloat(e.target.value))} />
        <span className="an-node__value">{crossfadeDur}s</span>
      </div>
      <ul className="library-list">
        {scenes.map((sc: Scene) => (
          <li key={sc.id} className="library-item">
            {editingId === sc.id ? (
              <input
                className="library-item__rename"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { renameScene(sc.id, draft || sc.name); setEditingId(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { renameScene(sc.id, draft || sc.name); setEditingId(null); }
                  if (e.key === 'Escape') setEditingId(null);
                  e.stopPropagation();
                }}
              />
            ) : (
              <span className="library-item__name" onDoubleClick={() => { setDraft(sc.name); setEditingId(sc.id); }}>
                {sc.name}
              </span>
            )}
            <button className="an-btn an-btn--play" style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => audioEngine.recallScene(sc, crossfadeDur)}>▶</button>
            <button className="library-item__remove" onClick={() => deleteScene(sc.id)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissingFileChecker() {
  const library = useStore((s) => s.project.library);
  const setMissingFileIds = useStore((s) => s.setMissingFileIds);

  useEffect(() => {
    if (!window.audioNodes || library.length === 0) { setMissingFileIds(new Set()); return; }
    const paths = library.map((f) => f.path);
    window.audioNodes.checkExists(paths).then((missingPaths) => {
      const missing = new Set(library.filter((f) => missingPaths.includes(f.path)).map((f) => f.id));
      setMissingFileIds(missing);
    });
  }, [library, setMissingFileIds]);

  return null;
}

function PrefabsPanel() {
  const prefabs = usePrefabStore((s) => s.prefabs);
  const deletePrefab = usePrefabStore((s) => s.deletePrefab);
  if (prefabs.length === 0) return null;
  return (
    <div className="sidebar__section">
      <h2>Prefabs</h2>
      <ul className="library-list">
        {prefabs.map((p) => (
          <li
            key={p.id}
            className="library-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('prefabId', p.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="library-item__name">
              {p.groupData.icon && <span style={{ marginRight: 4 }}>{p.groupData.icon}</span>}
              {p.groupData.label}
            </span>
            <button className="library-item__remove" onClick={() => deletePrefab(p.id)} title="Delete prefab">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LibraryFolderGroup({ folder, files }: { folder: string; files: AudioFile[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const removeFolder = useStore((s) => s.removeFolder);
  const label = folder.split('/').join(' / ');
  return (
    <li className="library-folder-group">
      <div className="library-folder__header-row">
        <button className="library-folder__header" onClick={() => setCollapsed((c) => !c)}>
          <span className="library-folder__chevron">{collapsed ? '▶' : '▼'}</span>
          <span className="library-folder__name" title={folder}>{label}</span>
          <span className="library-folder__count">{files.length}</span>
        </button>
        <button className="library-item__remove" onClick={() => removeFolder(folder)} title="Remove folder">×</button>
      </div>
      {!collapsed && (
        <ul className="library-list library-folder__children">
          {files.map((file) => <LibraryItem key={file.id} file={file} />)}
        </ul>
      )}
    </li>
  );
}

function LibraryPanel() {
  const library = useStore((s) => s.project.library);
  const addAudioFile = useStore((s) => s.addAudioFile);

  const pickFiles = async () => {
    if (!window.audioNodes) return;
    const paths = await window.audioNodes.pickAudioFiles();
    for (const filePath of paths) {
      if (library.some((f) => f.path === filePath)) continue;
      const name = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filePath;
      addAudioFile({ id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, path: filePath, name });
    }
  };

  const pickFolder = async () => {
    if (!window.audioNodes) return;
    const entries = await window.audioNodes.pickFolder();
    for (const entry of entries) {
      if (library.some((f) => f.path === entry.path)) continue;
      addAudioFile({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        path: entry.path,
        name: entry.name,
        folder: entry.folder,
      });
    }
  };

  const ungrouped = library.filter((f) => f.folder === undefined);
  const byFolder = new Map<string, AudioFile[]>();
  for (const file of library) {
    if (file.folder !== undefined) {
      const arr = byFolder.get(file.folder) ?? [];
      arr.push(file);
      byFolder.set(file.folder, arr);
    }
  }
  const sortedFolders = [...byFolder.keys()].sort();

  return (
    <aside className="sidebar">
      <h2>Library</h2>
      <div className="sidebar__add-row">
        <button className="an-btn an-btn--primary sidebar__add-btn" onClick={pickFiles}>+ Files</button>
        <button className="an-btn sidebar__add-btn" onClick={pickFolder}>Open Folder</button>
      </div>
      {library.length === 0 && (
        <p className="hint">Add audio files, then drag them onto the canvas.</p>
      )}
      <ul className="library-list">
        {ungrouped.map((file) => <LibraryItem key={file.id} file={file} />)}
        {sortedFolders.map((folder) => (
          <LibraryFolderGroup key={folder} folder={folder} files={byFolder.get(folder)!} />
        ))}
      </ul>
      <PrefabsPanel />
      <ScenesPanel />
    </aside>
  );
}

function HotkeyHandler() {
  const hotkeys = useStore((s) => s.project.hotkeys);
  const nodes = useStore((s) => s.project.nodes);
  const edges = useStore((s) => s.project.edges);
  const updateNodeData = useStore((s) => s.updateNodeData);

  useEffect(() => {
    if (!window.audioNodes) return;
    window.audioNodes.registerHotkeys(hotkeys);
  }, [hotkeys]);

  useEffect(() => {
    if (!window.audioNodes) return;
    return window.audioNodes.onHotkeyTriggered((key) => {
      const nodeId = hotkeys[key];
      if (!nodeId) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (node.type === 'sound' || node.type === 'randomPool') {
        updateNodeData(nodeId, { playing: !(node.data as SoundNodeData).playing });
      } else if (node.type === 'group') {
        const memberIds = new Set(edges.filter((e) => e.target === nodeId).map((e) => e.source));
        const members = nodes.filter((n) => memberIds.has(n.id) && n.type === 'sound');
        const anyPlaying = members.some((n) => (n.data as SoundNodeData).playing);
        members.forEach((n) => updateNodeData(n.id, { playing: !anyPlaying }));
      }
    });
  }, [hotkeys, nodes, edges, updateNodeData]);

  return null;
}

function MenuHandler() {
  const { newProject, setProject, setFilePath } = useStore((s) => s);
  const filePath = useStore((s) => s.filePath);
  const project = useStore((s) => s.project);
  const addRecent = useRecentStore((s) => s.add);
  const clearRecent = useRecentStore((s) => s.clear);
  const recentPaths = useRecentStore((s) => s.paths);

  // Keep native File menu in sync with recent list
  useEffect(() => {
    if (window.audioNodes) window.audioNodes.setRecentProjects(recentPaths);
  }, [recentPaths]);

  const openProject = async (path: string) => {
    const json = await window.audioNodes.loadProject(path);
    const parsed = await deserializeProject(json, path);
    setProject(parsed as Parameters<typeof setProject>[0]);
    setFilePath(path);
    addRecent(path);
  };

  useEffect(() => {
    if (!window.audioNodes) return;
    return window.audioNodes.onMenuAction(async (action) => {
      if (action === 'new') {
        newProject();
      } else if (action === 'open' || action.startsWith('open:')) {
        const path = action.startsWith('open:') ? action.slice(5) : await window.audioNodes.showOpenDialog();
        if (!path) return;
        await openProject(path);
      } else if (action === 'save') {
        const savePath = filePath ?? (await window.audioNodes.showSaveDialog(project.name));
        if (!savePath) return;
        const json = await serializeProject(project, savePath);
        await window.audioNodes.saveProject(savePath, json);
        setFilePath(savePath);
        addRecent(savePath);
      } else if (action === 'saveAs') {
        const savePath = await window.audioNodes.showSaveDialog(project.name);
        if (!savePath) return;
        const json = await serializeProject(project, savePath);
        await window.audioNodes.saveProject(savePath, json);
        setFilePath(savePath);
        addRecent(savePath);
      } else if (action === 'clearRecent') {
        clearRecent();
      }
    });
  }, [newProject, setProject, setFilePath, filePath, project, addRecent, clearRecent, openProject]);

  return null;
}

export function EditView() {
  return (
    <div className="edit-view">
      <MenuHandler />
      <HotkeyHandler />
      <MissingFileChecker />
      <LibraryPanel />
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
      <Inspector />
    </div>
  );
}
