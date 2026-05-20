import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from '../../state/store';
import { audioEngine } from '../../audio/engine';
import type { SoundNodeData } from '../../types';

export function SoundNode({ id }: NodeProps) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as SoundNodeData | undefined;
  });
  const library = useStore((s) => s.project.library);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const removeNode = useStore((s) => s.removeNode);

  if (!data) return null;

  const file = library.find((f) => f.id === data.fileId);

  const togglePlay = () => {
    audioEngine.resume();
    updateNodeData(id, { playing: !data.playing });
  };

  return (
    <div className="an-node an-node--sound">
      <div className="an-node__header">
        {file ? file.name : <span className="an-node__muted">No file</span>}
        <button
          className="an-node__delete"
          onClick={() => removeNode(id)}
          title="Remove node"
        >
          ×
        </button>
      </div>
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
        <div className="an-node__row an-node__row--controls">
          <label className="an-node__check">
            <input
              type="checkbox"
              checked={data.loop}
              onChange={(e) => updateNodeData(id, { loop: e.target.checked })}
            />
            Loop
          </label>
          <button
            className={`an-btn ${data.playing ? 'an-btn--stop' : 'an-btn--play'}`}
            onClick={togglePlay}
            disabled={!file}
          >
            {data.playing ? '■ Stop' : '▶ Play'}
          </button>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
