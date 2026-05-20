import { useCallback, useEffect, useRef } from 'react';
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
import type { AudioFile, AudioNodeData } from '../types';

const nodeTypes = { sound: SoundNode, master: MasterOutNode };

function toRFNode(n: { id: string; type: string; position: { x: number; y: number }; data: AudioNodeData }): Node {
  return { id: n.id, type: n.type, position: n.position, data: n.data as unknown as Record<string, unknown> };
}

function toRFEdge(e: { id: string; source: string; target: string }): Edge {
  return { id: e.id, source: e.source, target: e.target };
}

function Canvas() {
  const project = useStore((s) => s.project);
  const { addSoundNode, addEdge: storeAddEdge, removeEdge: storeRemoveEdge, updateNodePosition } = useStore((s) => s);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(project.nodes.map(toRFNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(project.edges.map(toRFEdge));

  // sync RF state when the project is replaced (new/load)
  const prevProjectRef = useRef(project);
  useEffect(() => {
    if (prevProjectRef.current !== project) {
      setNodes(project.nodes.map(toRFNode));
      setEdges(project.edges.map(toRFEdge));
      prevProjectRef.current = project;
    }
  }, [project, setNodes, setEdges]);

  // keep RF node data in sync when audio state changes (playing, volume, etc.)
  useEffect(() => {
    setNodes((rn) =>
      rn.map((rfNode) => {
        const stored = project.nodes.find((n) => n.id === rfNode.id);
        return stored ? { ...rfNode, data: stored.data as unknown as Record<string, unknown> } : rfNode;
      })
    );
  }, [project.nodes, setNodes]);

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

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const fileId = e.dataTransfer.getData('fileId') || null;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = addSoundNode(fileId, position);
      const newNode = toRFNode(useStore.getState().project.nodes.find((n) => n.id === id)!);
      const autoEdge = toRFEdge({ id: `edge-${id}-master-out`, source: id, target: 'master-out' });
      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, autoEdge]);
    },
    [addSoundNode, screenToFlowPosition, setNodes, setEdges]
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
        fitView
      >
        <Background gap={16} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function LibraryPanel() {
  const library = useStore((s) => s.project.library);
  const addAudioFile = useStore((s) => s.addAudioFile);
  const removeAudioFile = useStore((s) => s.removeAudioFile);

  const pickFiles = async () => {
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
        {library.map((file) => (
          <li
            key={file.id}
            className="library-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('fileId', file.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="library-item__name">{file.name}</span>
            <button
              className="library-item__remove"
              onClick={() => removeAudioFile(file.id)}
              title="Remove from library"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function MenuHandler() {
  const { newProject, setProject, setFilePath } = useStore((s) => s);
  const filePath = useStore((s) => s.filePath);
  const project = useStore((s) => s.project);

  useEffect(() => {
    const unsub = window.audioNodes.onMenuAction(async (action) => {
      if (action === 'new') {
        newProject();
      } else if (action === 'open') {
        const path = await window.audioNodes.showOpenDialog();
        if (!path) return;
        const json = await window.audioNodes.loadProject(path);
        setProject(JSON.parse(json));
        setFilePath(path);
      } else if (action === 'save') {
        const savePath = filePath ?? (await window.audioNodes.showSaveDialog(project.name));
        if (!savePath) return;
        await window.audioNodes.saveProject(savePath, JSON.stringify(project, null, 2));
        setFilePath(savePath);
      } else if (action === 'saveAs') {
        const savePath = await window.audioNodes.showSaveDialog(project.name);
        if (!savePath) return;
        await window.audioNodes.saveProject(savePath, JSON.stringify(project, null, 2));
        setFilePath(savePath);
      }
    });
    return unsub;
  }, [newProject, setProject, setFilePath, filePath, project]);

  return null;
}

export function EditView() {
  return (
    <div className="edit-view">
      <MenuHandler />
      <LibraryPanel />
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
    </div>
  );
}
