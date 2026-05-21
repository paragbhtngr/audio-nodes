import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from '../../state/store';
import type { EffectNodeData } from '../../types';

const LABELS: Record<string, string> = { reverb: 'Reverb', lowpass: 'Low Pass', highpass: 'High Pass' };

export function EffectNode({ id }: NodeProps) {
  const data = useStore((s) => s.project.nodes.find((n) => n.id === id)?.data as EffectNodeData | undefined);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const removeNode = useStore((s) => s.removeNode);
  if (!data) return null;

  const label = LABELS[data.effectType] ?? data.effectType;

  return (
    <div className="an-node an-node--effect">
      <Handle type="target" position={Position.Left} />
      <div className="an-node__header">
        <span>{label}</span>
        <button className="an-node__delete" onClick={() => removeNode(id)}>×</button>
      </div>
      <div className="an-node__body">
        {data.effectType === 'reverb' ? (
          <>
            <div className="an-node__row">
              <span className="an-node__label">Wet</span>
              <span className="an-node__value">{Math.round(data.wet * 100)}%</span>
            </div>
            <input type="range" className="an-node__slider nodrag" min={0} max={1} step={0.01}
              value={data.wet} onChange={(e) => updateNodeData(id, { wet: parseFloat(e.target.value) })} />
          </>
        ) : (
          <>
            <div className="an-node__row">
              <span className="an-node__label">Cutoff</span>
              <span className="an-node__value">{Math.round(data.frequency)} Hz</span>
            </div>
            <input type="range" className="an-node__slider nodrag"
              min={Math.log10(20)} max={Math.log10(20000)} step={0.01}
              value={Math.log10(data.frequency)}
              onChange={(e) => updateNodeData(id, { frequency: Math.round(Math.pow(10, parseFloat(e.target.value))) })} />
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
