import { useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from '../../state/store';
import type { RandomPoolNodeData } from '../../types';

export function RandomPoolNode({ id }: NodeProps) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as RandomPoolNodeData | undefined;
  });
  const library = useStore((s) => s.project.library);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const removeNode = useStore((s) => s.removeNode);

  const [editingLabel, setEditingLabel] = useState(false);
  const [draft, setDraft] = useState('');
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLabel) labelRef.current?.select();
  }, [editingLabel]);

  if (!data) return null;

  const commitLabel = () => {
    const trimmed = draft.trim();
    if (trimmed) updateNodeData(id, { label: trimmed });
    setEditingLabel(false);
  };

  const files = data.fileIds.map((fid) => library.find((f) => f.id === fid)).filter(Boolean) as typeof library;

  const toggle = () => updateNodeData(id, { playing: !data.playing });

  const removeFile = (fid: string) =>
    updateNodeData(id, { fileIds: data.fileIds.filter((f) => f !== fid) });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fileId = e.dataTransfer.getData('fileId');
    if (fileId && !data.fileIds.includes(fileId)) {
      updateNodeData(id, { fileIds: [...data.fileIds, fileId] });
    }
  };

  return (
    <div className="an-node an-node--pool">
      <div className="an-node__header">
        {editingLabel ? (
          <input
            ref={labelRef}
            className="an-node__label-input an-node__label-input--pool nodrag"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel();
              if (e.key === 'Escape') setEditingLabel(false);
              e.stopPropagation();
            }}
          />
        ) : (
          <span
            className="an-node__label-text"
            title="Double-click to rename"
            onDoubleClick={() => { setDraft(data.label ?? 'Random Pool'); setEditingLabel(true); }}
          >
            {data.label ?? 'Random Pool'}
          </span>
        )}
        <button className="an-node__delete" onClick={() => removeNode(id)} title="Remove">×</button>
      </div>

      <div
        className="an-node__body"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDrop}
      >
        <div className="pool-files">
          {files.length === 0 ? (
            <p className="pool-hint">Drag files from library here</p>
          ) : (
            files.map((f) => (
              <div key={f.id} className="pool-file">
                <span className="pool-file__name">{f.name}</span>
                <button className="an-node__delete" onClick={() => removeFile(f.id)}>×</button>
              </div>
            ))
          )}
        </div>

        <div className="an-node__row an-node__row--controls" style={{ marginTop: 6 }}>
          <label className="an-node__check">
            <input
              type="checkbox"
              checked={data.loop}
              onChange={(e) => updateNodeData(id, { loop: e.target.checked })}
            />
            Loop
          </label>
          <button
            className={`an-btn ${data.playing ? 'an-btn--stop' : 'an-btn--play'} nodrag`}
            onClick={toggle}
            disabled={data.fileIds.length === 0}
          >
            {data.playing ? '■ Stop' : '▶ Play'}
          </button>
        </div>

        <div className="an-node__row">
          <span className="an-node__label">Volume</span>
          <span className="an-node__value">{Math.round(data.volume * 100)}%</span>
        </div>
        <input
          type="range"
          className="an-node__slider nodrag"
          min={0} max={1} step={0.01}
          value={data.volume}
          onChange={(e) => updateNodeData(id, { volume: parseFloat(e.target.value) })}
        />
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
