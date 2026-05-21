import { useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from '../../state/store';
import type { GroupNodeData, SoundNodeData } from '../../types';

export function GroupNode({ id }: NodeProps) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as GroupNodeData | undefined;
  });
  const edges = useStore((s) => s.project.edges);
  const nodes = useStore((s) => s.project.nodes);
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

  const members = edges
    .filter((e) => e.target === id)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter(Boolean) as typeof nodes;

  const anyPlaying = members.some((n) => n.type === 'sound' && (n.data as SoundNodeData).playing);
  const soundMembers = members.filter((n) => n.type === 'sound');

  const toggleAll = () => {
    soundMembers.forEach((n) => updateNodeData(n.id, { playing: !anyPlaying }));
  };

  const commitLabel = () => {
    const trimmed = draft.trim();
    if (trimmed) updateNodeData(id, { label: trimmed });
    setEditingLabel(false);
  };

  const toggleCollapse = () => updateNodeData(id, { collapsed: !data.collapsed });

  const memberName = (n: typeof nodes[number]) => {
    if (n.type !== 'sound') return n.type;
    const d = n.data as SoundNodeData;
    return d.fileId ? (library.find((f) => f.id === d.fileId)?.name ?? 'Sound') : 'Sound';
  };

  return (
    <div className="an-node an-node--group" style={{ borderColor: data.color }}>
      <Handle type="target" position={Position.Left} />

      <div className="an-node__header" style={{ color: data.color }}>
        {data.icon && <span className="an-node__icon">{data.icon}</span>}

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
            title="Double-click to rename"
            onDoubleClick={() => { setDraft(data.label); setEditingLabel(true); }}
          >
            {data.label}
          </span>
        )}

        <button
          className="an-node__collapse"
          onClick={toggleCollapse}
          title={data.collapsed ? 'Expand members' : 'Collapse members'}
        >
          {data.collapsed ? '▸' : '▾'}
        </button>
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

        {data.collapsed ? (
          <div className="an-node__collapsed-badge" style={{ borderColor: data.color, color: data.color }}>
            {members.length} sound{members.length !== 1 ? 's' : ''}
            {anyPlaying && <span className="an-node__playing-dot" />}
          </div>
        ) : (
          members.length > 0 && (
            <div className="an-node__members">
              {members.map((n) => (
                <span
                  key={n.id}
                  className="an-node__member-chip"
                  style={{ borderColor: `${data.color}55`, background: `${data.color}15`, color: data.color }}
                >
                  {memberName(n)}
                </span>
              ))}
            </div>
          )
        )}

        <button
          className={`an-btn nodrag ${anyPlaying ? 'an-btn--stop' : 'an-btn--play'} an-node__play-all`}
          onClick={toggleAll}
          disabled={soundMembers.length === 0}
          style={anyPlaying ? {} : { borderColor: data.color, color: data.color, background: `${data.color}15` }}
        >
          {anyPlaying ? '■ Stop All' : '▶ Play All'}
        </button>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
