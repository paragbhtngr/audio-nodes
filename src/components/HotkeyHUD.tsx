import { useStore } from '../state/store';
import type { GroupNodeData, RandomPoolNodeData, SoundNodeData, YouTubeNodeData } from '../types';

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
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.type === 'sound' || node.type === 'randomPool' || node.type === 'youtube') {
      const data = node.data as SoundNodeData | RandomPoolNodeData | YouTubeNodeData;
      updateNodeData(nodeId, { playing: !data.playing });
    }
  };

  const getNodeName = (node: (typeof nodes)[number]): string => {
    if (node.type === 'group') return (node.data as GroupNodeData).label ?? 'Group';
    if (node.type === 'randomPool') return (node.data as RandomPoolNodeData).label ?? 'Random Pool';
    if (node.type === 'youtube') return (node.data as YouTubeNodeData).title || 'YouTube';
    if (node.type === 'sound') {
      const d = node.data as SoundNodeData;
      return d.fileId
        ? useStore.getState().project.library.find((f) => f.id === d.fileId)?.name ?? 'Sound'
        : 'Sound';
    }
    return node.type;
  };

  const isPlaying = (node: (typeof nodes)[number]): boolean => {
    if (node.type === 'sound' || node.type === 'randomPool' || node.type === 'youtube') {
      return (node.data as SoundNodeData | RandomPoolNodeData | YouTubeNodeData).playing;
    }
    return false;
  };

  return (
    <div className="hud nodrag nopan">
      <div className="hud__title">Hotkeys</div>
      <ul className="hud__list">
        {entries.map(({ key, node }) => {
          const name = getNodeName(node);
          const playing = isPlaying(node);
          return (
            <li key={key} className="hud__item">
              <kbd className="hud__key">{key.replace('CmdOrCtrl', '⌘')}</kbd>
              <span className="hud__name">{name}</span>
              <button
                className={`hud__trigger ${playing ? 'hud__trigger--active' : ''}`}
                onClick={() => trigger(node.id)}
                title={playing ? 'Stop' : 'Play'}
              >
                {playing ? '■' : '▶'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
