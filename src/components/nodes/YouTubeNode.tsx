import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { LoopButton, PlayButton } from './NodeControls';
import type { GroupNodeData, YouTubeNodeData } from '../../types';
import { rangeFill } from '../rangeFill';

// Minimal YT IFrame API types
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}
interface YTPlayerEvent { data: number }
declare global {
  interface Window {
    YT?: {
      Player: new (el: string | HTMLElement, opts: {
        height: string; width: string; videoId: string; host?: string;
        playerVars?: Record<string, number | string>;
        events?: {
          onError?: (e: YTPlayerEvent) => void;
          onReady?: (e: { target: YTPlayer }) => void;
          onStateChange?: (e: YTPlayerEvent) => void;
        };
      }) => YTPlayer;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_ORIGIN = 'https://foaly.app';

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
  const progressRef = useRef<HTMLDivElement>(null);
  // Bumped when the player becomes ready so play/volume effects re-apply current state
  const [ready, setReady] = useState(false);

  // Keep loopRef in sync so the onStateChange closure sees the latest value
  useEffect(() => { loopRef.current = data?.loop ?? false; }, [data?.loop]);

  // Create/destroy player when videoId changes
  useEffect(() => {
    if (!data?.videoId) return;
    const videoId = data.videoId;
    let destroyed = false;
    let player: YTPlayer | null = null;

    loadYTApi().then(() => {
      if (destroyed || !window.YT) return;
      player = new window.YT.Player(playerDivId, {
        height: '1', width: '1', videoId,
        // Packaged builds run on app://, which YouTube rejects as an origin; see YT_REFERRER in main.ts.
        host: 'https://www.youtube.com',
        playerVars: {
          autoplay: 0, controls: 0,
          ...(window.location.protocol === 'app:' ? { origin: YT_ORIGIN } : {}),
        },
        events: {
          onError: (e) => {
            console.error('[YouTubeNode] player error', e.data, 'videoId:', videoId);
            updateNodeData(id, { playing: false });
          },
          // The player's methods don't exist until onReady, so only expose it via playerRef then
          onReady: (e) => {
            if (destroyed) { e.target.destroy(); return; }
            playerRef.current = e.target;
            setReady(true);
          },
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
      setReady(false);
      playerRef.current = null;
      player?.destroy?.();
    };
  }, [data?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (data?.playing) p.playVideo();
    else p.pauseVideo();
  }, [data?.playing, ready]);

  useEffect(() => {
    playerRef.current?.setVolume(Math.round((data?.volume ?? 0.8) * groupVolume * 100));
  }, [data?.volume, groupVolume, ready]);

  useEffect(() => {
    const setBar = (ratio: number) => {
      if (progressRef.current) progressRef.current.style.setProperty('--progress', String(ratio));
    };
    if (!data?.playing) { setBar(0); return; }
    let raf: number;
    let last = 0;
    // Write straight to the DOM (no React render) and throttle; width would force layout each frame
    const tick = (now: number) => {
      if (now - last >= 66) {
        last = now;
        const p = playerRef.current;
        const duration = p?.getDuration?.() ?? 0;
        if (p && duration > 0) setBar(Math.min(1, p.getCurrentTime() / duration));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data?.playing]);

  if (!data) return null;

  return (
    <div className={`an-node an-node--youtube${data.playing ? ' an-node--playing' : ''}`}>
      <div className="an-node__header">
        {data.videoId
          ? <span className="an-node__filename" title={data.title}>{data.title || 'Untitled'}</span>
          : <span className="an-node__muted">No video — search in inspector</span>}
        <button className="an-node__delete" onClick={() => removeNode(id)} title="Remove node">×</button>
      </div>
      <div className="an-node__progress">
        <div className="an-node__progress-fill" ref={progressRef} />
      </div>
      <div className="an-node__body">
        <div className="an-node__row">
          <label className="an-node__label">Volume</label>
          <span className="an-node__value">{Math.round(data.volume * 100)}%</span>
        </div>
        <input
          type="range" className="an-node__slider nodrag"
          min={0} max={1} step={0.01} value={data.volume}
          style={rangeFill(data.volume, 0, 1)}
          onChange={(e) => updateNodeData(id, { volume: parseFloat(e.target.value) })}
        />
        <div className="an-node__row an-node__row--controls">
          <LoopButton active={data.loop} onClick={() => updateNodeData(id, { loop: !data.loop })} />
          <PlayButton playing={data.playing} disabled={!data.videoId} onClick={() => updateNodeData(id, { playing: !data.playing })} />
        </div>
        {/* Hidden YT player element */}
        <div id={playerDivId} style={{ width: 1, height: 1, overflow: 'hidden', position: 'absolute' }} />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
