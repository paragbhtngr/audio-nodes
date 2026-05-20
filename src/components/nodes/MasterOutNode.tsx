import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from '../../state/store';
import type { MasterNodeData } from '../../types';

export function MasterOutNode({ id }: NodeProps) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as MasterNodeData | undefined;
  });
  const updateNodeData = useStore((s) => s.updateNodeData);

  if (!data) return null;

  return (
    <div className="an-node an-node--master">
      <Handle type="target" position={Position.Left} />
      <div className="an-node__header">Master Out</div>
      <div className="an-node__body">
        <div className="an-node__row">
          <label className="an-node__label">Volume</label>
          <span className="an-node__value">{Math.round(data.volume * 100)}%</span>
        </div>
        <input
          type="range"
          className="an-node__slider"
          min={0}
          max={1}
          step={0.01}
          value={data.volume}
          onChange={(e) => updateNodeData(id, { volume: parseFloat(e.target.value) })}
        />
      </div>
    </div>
  );
}
