import { useStore } from '../state/store';
import { audioEngine } from '../audio/engine';
import type { SoundNodeData } from '../types';

export function HotkeyHUD() {
  const hotkeys = useStore((s) => s.project.hotkeys);
  const nodes = useStore((s) => s.project.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);

  const entries = Object.entries(hotkeys).map(([key, nodeId]) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node ? { key, node } : null;
  }).filter(Boolean) as { key: string; node: (typeof nodes)[number] }[];

  if (entries.length === 0) return null;

  const trigger = (nodeId: string) => {
    audioEngine.resume();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'sound') return;
    const data = node.data as SoundNodeData;
    updateNodeData(nodeId, { playing: !data.playing });
  };

  return (
    <div className="hud nodrag nopan">
      <div className="hud__title">Hotkeys</div>
      <ul className="hud__list">
        {entries.map(({ key, node }) => {
          const data = node.data as SoundNodeData;
          const name = node.type === 'sound' && data.fileId
            ? useStore.getState().project.library.find((f) => f.id === data.fileId)?.name ?? 'Sound'
            : 'Sound';
          return (
            <li key={key} className="hud__item">
              <kbd className="hud__key">{key.replace('CmdOrCtrl', '⌘')}</kbd>
              <span className="hud__name">{name}</span>
              <button
                className={`hud__trigger ${data.playing ? 'hud__trigger--active' : ''}`}
                onClick={() => trigger(node.id)}
                title={data.playing ? 'Stop' : 'Play'}
              >
                {data.playing ? '■' : '▶'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
