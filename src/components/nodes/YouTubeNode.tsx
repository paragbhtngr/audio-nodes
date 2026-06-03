import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { useStore } from '../../state/store';
import type { GroupNodeData, YouTubeNodeData } from '../../types';

// Minimal YT IFrame API types
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  destroy(): void;
}
interface YTPlayerEvent { data: number }
declare global {
  interface Window {
    YT?: {
      Player: new (el: string | HTMLElement, opts: {
        height: string; width: string; videoId: string;
        playerVars?: Record<string, number>;
        events?: {
          onReady?: (e: { target: YTPlayer }) => void;
          onStateChange?: (e: YTPlayerEvent) => void;
        };
      }) => YTPlayer;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiReady = false;
const ytApiCallbacks: Array<() => void> = [];

function loadYTApi(): Promise<void> {
  if (ytApiReady) return Promise.resolve();
  return new Promise((resolve) => {
    ytApiCallbacks.push(resolve);
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      ytApiReady = true;
      ytApiCallbacks.splice(0).forEach((cb) => cb());
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
}

export function YouTubeNode({ id }: NodeProps) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as YouTubeNodeData | undefined;
  });
  const groupVolume = useStore((s) => {
    const edge = s.project.edges.find((e) => e.source === id);
    if (!edge) return 1;
    const target = s.project.nodes.find((n) => n.id === edge.target);
    if (!target || target.type !== 'group') return 1;
    return (target.data as GroupNodeData).volume;
  });
  const updateNodeData = useStore((s) => s.updateNodeData);
  const removeNode = useStore((s) => s.removeNode);

  const playerRef = useRef<YTPlayer | null>(null);
  const loopRef = useRef(false);
  const playerDivId = `yt-player-${id}`;

  // Keep loopRef in sync so the onStateChange closure sees the latest value
  useEffect(() => { loopRef.current = data?.loop ?? false; }, [data?.loop]);

  // Create/destroy player when videoId changes
  useEffect(() => {
    if (!data?.videoId) return;
    const videoId = data.videoId;
    let destroyed = false;

    loadYTApi().then(() => {
      if (destroyed || !window.YT) return;
      playerRef.current?.destroy();
      playerRef.current = new window.YT.Player(playerDivId, {
        height: '1', width: '1', videoId,
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (e) => e.target.setVolume(Math.round((data?.volume ?? 0.8) * groupVolume * 100)),
          onStateChange: (e) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) {
              if (loopRef.current) {
                playerRef.current?.seekTo(0, true);
                playerRef.current?.playVideo();
              } else {
                updateNodeData(id, { playing: false });
              }
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [data?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (data?.playing) p.playVideo();
    else p.pauseVideo();
  }, [data?.playing]);

  useEffect(() => {
    playerRef.current?.setVolume(Math.round((data?.volume ?? 0.8) * groupVolume * 100));
  }, [data?.volume, groupVolume]);

  if (!data) return null;

  return (
    <div className="an-node an-node--youtube">
      <div className="an-node__header">
        <span className="an-node__yt-label">▶ YouTube</span>
        <button className="an-node__delete" onClick={() => removeNode(id)} title="Remove node">×</button>
      </div>
      <div className="an-node__body">
        {data.videoId ? (
          <div className="an-node__yt-title" title={data.title}>{data.title || 'Untitled'}</div>
        ) : (
          <span className="an-node__muted" style={{ fontSize: 11 }}>No video — search in inspector</span>
        )}
        <div className="an-node__row">
          <label className="an-node__label">Volume</label>
          <span className="an-node__value">{Math.round(data.volume * 100)}%</span>
        </div>
        <input
          type="range" className="an-node__slider nodrag"
          min={0} max={1} step={0.01} value={data.volume}
          onChange={(e) => updateNodeData(id, { volume: parseFloat(e.target.value) })}
        />
        <div className="an-node__row an-node__row--controls">
          {data.loop && <span className="an-node__yt-loop-badge">↻</span>}
          <button
            className={`an-btn ${data.playing ? 'an-btn--stop' : 'an-btn--play'} nodrag`}
            style={{ marginLeft: 'auto' }}
            disabled={!data.videoId}
            onClick={() => updateNodeData(id, { playing: !data.playing })}
          >
            {data.playing ? '■ Stop' : '▶ Play'}
          </button>
        </div>
        {/* Hidden YT player element */}
        <div id={playerDivId} style={{ width: 1, height: 1, overflow: 'hidden', position: 'absolute' }} />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
