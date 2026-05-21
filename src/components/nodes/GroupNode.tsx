import { useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from '../../state/store';
import type { GroupNodeData } from '../../types';

export function GroupNode({ id }: NodeProps) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as GroupNodeData | undefined;
  });
  const edges = useStore((s) => s.project.edges);
  const nodes = useStore((s) => s.project.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const removeNode = useStore((s) => s.removeNode);

  const [editingLabel, setEditingLabel] = useState(false);
  const [draft, setDraft] = useState('');
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLabel) labelRef.current?.select();
  }, [editingLabel]);

  if (!data) return null;

  const members = edges
    .filter((e) => e.target === id)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter(Boolean);

  const commitLabel = () => {
    const trimmed = draft.trim();
    if (trimmed) updateNodeData(id, { label: trimmed });
    setEditingLabel(false);
  };

  return (
    <div className="an-node an-node--group">
      <Handle type="target" position={Position.Left} />

      <div className="an-node__header">
        {editingLabel ? (
          <input
            ref={labelRef}
            className="an-node__label-input nodrag"
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
            title="Click to rename"
            onDoubleClick={() => { setDraft(data.label); setEditingLabel(true); }}
          >
            {data.label}
          </span>
        )}
        <button className="an-node__delete" onClick={() => removeNode(id)} title="Remove group">×</button>
      </div>

      <div className="an-node__body">
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
        {members.length > 0 && (
          <div className="an-node__members">
            {members.map((n) => (
              <span key={n!.id} className="an-node__member-chip">
                {n!.type === 'sound'
                  ? ((n!.data as { fileId?: string | null }).fileId
                      ? useStore.getState().project.library.find((f) => f.id === (n!.data as { fileId: string }).fileId)?.name ?? 'Sound'
                      : 'Sound')
                  : n!.type}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
