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
import { Inspector } from '../components/inspector/Inspector';
import { HotkeyHUD } from '../components/HotkeyHUD';
import type { AudioFile, AudioNodeData, SoundNodeData } from '../types';

const nodeTypes = { sound: SoundNode, master: MasterOutNode };

function toRFNode(n: { id: string; type: string; position: { x: number; y: number }; data: AudioNodeData }): Node {
  return { id: n.id, type: n.type, position: n.position, data: n.data as unknown as Record<string, unknown> };
}

function toRFEdge(e: { id: string; source: string; target: string }): Edge {
  return { id: e.id, source: e.source, target: e.target };
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
  const { addSoundNode, addAudioFile, addEdge: storeAddEdge, removeEdge: storeRemoveEdge, updateNodePosition, selectNode } = useStore((s) => s);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(project.nodes.map(toRFNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(project.edges.map(toRFEdge));

  const prevProjectRef = useRef(project);
  useEffect(() => {
    if (prevProjectRef.current !== project) {
      setNodes(project.nodes.map(toRFNode));
      setEdges(project.edges.map(toRFEdge));
      prevProjectRef.current = project;
    }
  }, [project, setNodes, setEdges]);

  // keep RF node data in sync when audio state changes
  useEffect(() => {
    setNodes((rn) =>
      rn.map((rfNode) => {
        const stored = project.nodes.find((n) => n.id === rfNode.id);
        return stored ? { ...rfNode, data: stored.data as unknown as Record<string, unknown> } : rfNode;
      })
    );
  }, [project.nodes, setNodes]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => selectNode(node.id),
    [selectNode]
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) => rfAddEdge(conn, eds));
      storeAddEdge({ source: conn.source!, target: conn.target! });
    },
    [setEdges, storeAddEdge]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes);
      changes.forEach((c) => { if (c.type === 'remove') storeRemoveEdge(c.id); });
    },
    [onEdgesChange, storeRemoveEdge]
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
    [addAudioFile, spawnNode, screenToFlowPosition, audioExts]
  );

  return (
    <div className="canvas" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background gap={16} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
      <HotkeyHUD />
    </div>
  );
}

function LibraryItem({ file }: { file: AudioFile }) {
  const renameAudioFile = useStore((s) => s.renameAudioFile);
  const removeAudioFile = useStore((s) => s.removeAudioFile);
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
          title="Click to rename"
          onClick={() => { setDraft(file.name); setEditing(true); }}
        >
          {file.name}
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

function LibraryPanel() {
  const library = useStore((s) => s.project.library);
  const addAudioFile = useStore((s) => s.addAudioFile);

  const pickFiles = async () => {
    if (!window.audioNodes) return;
    const paths = await window.audioNodes.pickAudioFiles();
    for (const filePath of paths) {
      const name = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filePath;
      const file: AudioFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        path: filePath,
        name,
      };
      addAudioFile(file);
    }
  };

  return (
    <aside className="sidebar">
      <h2>Library</h2>
      <button className="an-btn an-btn--primary sidebar__add" onClick={pickFiles}>
        + Add Files
      </button>
      {library.length === 0 && (
        <p className="hint">Add audio files, then drag them onto the canvas.</p>
      )}
      <ul className="library-list">
        {library.map((file) => <LibraryItem key={file.id} file={file} />)}
      </ul>
    </aside>
  );
}

function HotkeyHandler() {
  const hotkeys = useStore((s) => s.project.hotkeys);
  const nodes = useStore((s) => s.project.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);

  // re-register global shortcuts whenever hotkeys change
  useEffect(() => {
    if (!window.audioNodes) return;
    window.audioNodes.registerHotkeys(hotkeys);
  }, [hotkeys]);

  // handle triggered hotkeys from main process
  useEffect(() => {
    if (!window.audioNodes) return;
    return window.audioNodes.onHotkeyTriggered((key) => {
      const nodeId = hotkeys[key];
      if (!nodeId) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || node.type !== 'sound') return;
      updateNodeData(nodeId, { playing: !(node.data as SoundNodeData).playing });
    });
  }, [hotkeys, nodes, updateNodeData]);

  return null;
}

function MenuHandler() {
  const { newProject, setProject, setFilePath } = useStore((s) => s);
  const filePath = useStore((s) => s.filePath);
  const project = useStore((s) => s.project);

  useEffect(() => {
    if (!window.audioNodes) return;
    return window.audioNodes.onMenuAction(async (action) => {
      if (action === 'new') {
        newProject();
      } else if (action === 'open') {
        const path = await window.audioNodes.showOpenDialog();
        if (!path) return;
        const json = await window.audioNodes.loadProject(path);
        const parsed = await deserializeProject(json, path);
        setProject(parsed as Parameters<typeof setProject>[0]);
        setFilePath(path);
      } else if (action === 'save') {
        const savePath = filePath ?? (await window.audioNodes.showSaveDialog(project.name));
        if (!savePath) return;
        const json = await serializeProject(project, savePath);
        await window.audioNodes.saveProject(savePath, json);
        setFilePath(savePath);
      } else if (action === 'saveAs') {
        const savePath = await window.audioNodes.showSaveDialog(project.name);
        if (!savePath) return;
        const json = await serializeProject(project, savePath);
        await window.audioNodes.saveProject(savePath, json);
        setFilePath(savePath);
      }
    });
  }, [newProject, setProject, setFilePath, filePath, project]);

  return null;
}

export function EditView() {
  return (
    <div className="edit-view">
      <MenuHandler />
      <HotkeyHandler />
      <LibraryPanel />
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
      <Inspector />
    </div>
  );
}
