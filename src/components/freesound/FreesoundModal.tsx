import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../state/settings';
import { useStore } from '../../state/store';
import { PlayButton } from '../nodes/NodeControls';
import type { FreesoundResult } from '../../types/global';

function licenseLabel(url: string): string {
  if (url.includes('/zero/')) return 'CC0';
  if (url.includes('/by-nc/')) return 'CC BY-NC';
  if (url.includes('/by/')) return 'CC BY';
  if (url.includes('sampling')) return 'Sampling+';
  return 'See source';
}

function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function FreesoundModal({ onClose }: { onClose: () => void }) {
  const apiKey = useSettingsStore((s) => s.freesoundApiKey);
  const library = useStore((s) => s.project.library);
  const addAudioFile = useStore((s) => s.addAudioFile);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FreesoundResult[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [importing, setImporting] = useState<Set<number>>(new Set());

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestId = useRef(0);

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPreviewing(null);
  }, []);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const search = useCallback(async (q: string, pageNum: number) => {
    const id = ++requestId.current;
    stopPreview();
    setLoading(true);
    setError(null);
    try {
      const res = await window.audioNodes.freesoundSearch(apiKey, q, pageNum);
      if (id !== requestId.current) return;
      setResults(res.results);
      setTotal(res.count);
      setHasNext(res.hasNext);
      setPage(pageNum);
    } catch (err) {
      if (id !== requestId.current) return;
      setResults([]);
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Search failed.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [apiKey, stopPreview]);

  // Debounced search as the user types.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      requestId.current++;
      setResults([]);
      setTotal(0);
      setHasNext(false);
      setLoading(false);
      setError(null);
      return;
    }
    const t = setTimeout(() => search(q, 1), 450);
    return () => clearTimeout(t);
  }, [query, search]);

  const togglePreview = (r: FreesoundResult) => {
    if (previewing === r.id) {
      stopPreview();
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(r.previewUrl);
    audio.onended = () => setPreviewing((cur) => (cur === r.id ? null : cur));
    audio.onerror = () => {
      setPreviewing((cur) => (cur === r.id ? null : cur));
      setError('Could not play that preview.');
    };
    audioRef.current = audio;
    setPreviewing(r.id);
    audio.play().catch(() => { /* surfaced via onerror */ });
  };

  const importSound = async (r: FreesoundResult) => {
    setImporting((s) => new Set(s).add(r.id));
    setError(null);
    try {
      const filePath = await window.audioNodes.freesoundDownload(r.id, r.previewUrl);
      if (!useStore.getState().project.library.some((f) => f.path === filePath)) {
        addAudioFile({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          path: filePath,
          name: r.name.replace(/\.[^.]+$/, ''),
          duration: r.duration,
          folder: 'Freesound',
          source: { provider: 'freesound', url: r.url, author: r.username, license: r.license },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Import failed.');
    } finally {
      setImporting((s) => {
        const next = new Set(s);
        next.delete(r.id);
        return next;
      });
    }
  };

  const isImported = (r: FreesoundResult) =>
    library.some((f) => f.source?.provider === 'freesound' && f.source.url === r.url);

  const go = (pageNum: number) => {
    stopPreview();
    search(query.trim(), pageNum);
  };

  return (
    <div className="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-modal" role="dialog" aria-modal="true" aria-label="Freesound">
        <header className="search-modal__header">
          <h2 className="search-modal__title">Freesound</h2>
          <input
            className="insp__input search-modal__search"
            autoFocus
            value={query}
            placeholder="Search sounds, e.g. rain, tavern, wolf howl"
            onChange={(e) => { stopPreview(); setQuery(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim().length >= 2) search(query.trim(), 1);
              e.stopPropagation();
            }}
          />
          <button className="settings__close search-modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="search-modal__body">
          {error && <p className="search-modal__error">{error}</p>}
          {!error && query.trim().length < 2 && <p className="settings__hint">Type to search Freesound's library.</p>}
          {!error && !loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="settings__hint">No results.</p>
          )}
          {loading && <p className="settings__hint">Searching…</p>}
          <ul className="search-list">
            {results.map((r) => {
              const imported = isImported(r);
              return (
                <li key={r.id} className="search-item">
                  <PlayButton playing={previewing === r.id} onClick={() => togglePreview(r)} />
                  <div className="search-item__info">
                    <div className="search-item__name" title={r.name}>{r.name}</div>
                    <div className="search-item__meta">
                      {formatDuration(r.duration)} · {r.username} · {licenseLabel(r.license)}
                    </div>
                  </div>
                  <button
                    className="an-btn search-item__import"
                    disabled={imported || importing.has(r.id)}
                    onClick={() => importSound(r)}
                  >
                    {imported ? 'In library' : importing.has(r.id) ? 'Importing…' : 'Import'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {results.length > 0 && (
          <footer className="search-modal__footer">
            <span>{total.toLocaleString()} results</span>
            <span className="search-modal__pager">
              <button className="an-btn" disabled={page <= 1 || loading} onClick={() => go(page - 1)}>Prev</button>
              <span>Page {page}</span>
              <button className="an-btn" disabled={!hasNext || loading} onClick={() => go(page + 1)}>Next</button>
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
