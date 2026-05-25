import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import type { YouTubeNodeData } from '../../types';

// Minimal YT IFrame API types
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
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
        events?: { onReady?: (e: { target: YTPlayer }) => void; onStateChange?: (e: YTPlayerEvent) => void };
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
  const updateNodeData = useStore((s) => s.updateNodeData);
  const removeNode = useStore((s) => s.removeNode);

  const playerRef = useRef<YTPlayer | null>(null);
  const playerDivId = `yt-player-${id}`;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ videoId: string; title: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

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
          onReady: (e) => e.target.setVolume(Math.round((data?.volume ?? 0.8) * 100)),
          onStateChange: (e) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) {
              updateNodeData(id, { playing: false });
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

  // Sync play/pause
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (data?.playing) p.playVideo();
    else p.pauseVideo();
  }, [data?.playing]);

  // Sync volume
  useEffect(() => {
    playerRef.current?.setVolume(Math.round((data?.volume ?? 0.8) * 100));
  }, [data?.volume]);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const r = await window.audioNodes.youtubeSearch(query.trim());
      setResults(r);
    } finally {
      setSearching(false);
    }
  };

  const selectVideo = (videoId: string, title: string) => {
    updateNodeData(id, { videoId, title, playing: false });
    setResults([]);
    setQuery('');
    setShowSearch(false);
  };

  if (!data) return null;

  const hasVideo = !!data.videoId;

  return (
    <div className="an-node an-node--youtube">
      <div className="an-node__header">
        <span className="an-node__yt-label">▶ YouTube</span>
        <button className="an-node__delete" onClick={() => removeNode(id)} title="Remove node">×</button>
      </div>

      {hasVideo && !showSearch ? (
        <div className="an-node__body">
          <div className="an-node__yt-title" title={data.title}>{data.title || 'Untitled'}</div>
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
            <button className="an-btn an-node__yt-change nodrag" onClick={() => setShowSearch(true)}>
              Change
            </button>
            <button
              className={`an-btn ${data.playing ? 'an-btn--stop' : 'an-btn--play'} nodrag`}
              onClick={() => updateNodeData(id, { playing: !data.playing })}
            >
              {data.playing ? '■ Stop' : '▶ Play'}
            </button>
          </div>
          {/* Hidden player element */}
          <div id={playerDivId} style={{ width: 1, height: 1, overflow: 'hidden', position: 'absolute' }} />
        </div>
      ) : (
        <div className="an-node__body">
          {hasVideo && (
            <button className="an-btn an-node__yt-back nodrag" onClick={() => { setShowSearch(false); setResults([]); }}>
              ← Back
            </button>
          )}
          <div className="an-node__yt-search-row">
            <input
              className="an-node__yt-input nodrag"
              placeholder="Search YouTube…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); e.stopPropagation(); }}
            />
            <button className="an-btn nodrag" onClick={search} disabled={searching}>
              {searching ? '…' : '🔍'}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="an-node__yt-results nodrag">
              {results.map((r) => (
                <li key={r.videoId} className="an-node__yt-result" onClick={() => selectVideo(r.videoId, r.title)}>
                  {r.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
