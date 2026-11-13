import { useEffect, useRef, useState } from 'react';

export interface YouTubeResult {
  videoId: string;
  title: string;
  duration: string;
  thumbnail: string;
}

/** Search YouTube and pick a video. The caller decides what picking means (new node vs. replace). */
export function YouTubeModal({ actionLabel, onSelect, onClose }: {
  actionLabel: string;
  onSelect: (r: YouTubeResult) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  // YouTube pages forward only (continuation tokens), so fetched pages are kept to let Prev work.
  const [pages, setPages] = useState<YouTubeResult[][]>([]);
  const [tokens, setTokens] = useState<(string | null)[]>([]); // tokens[i] fetches the page after pages[i]
  const [pageIndex, setPageIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const searchedQuery = useRef('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [pageIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = pages[pageIndex] ?? [];
  const nextToken = tokens[pageIndex] ?? null;
  const hasNext = pageIndex < pages.length - 1 || nextToken !== null;

  const fail = () => setError('YouTube search failed. Check your connection and try again.');

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    const id = ++requestId.current;
    searchedQuery.current = q;
    setSearching(true);
    setError(null);
    setPages([]);
    setTokens([]);
    setPageIndex(0);
    try {
      const r = await window.audioNodes.youtubeSearch(q);
      if (id !== requestId.current) return;
      setPages([r.results]);
      setTokens([r.continuation]);
      setSearched(true);
    } catch {
      if (id === requestId.current) fail();
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  };

  const goNext = async () => {
    if (pageIndex < pages.length - 1) {
      setPageIndex(pageIndex + 1);
      return;
    }
    if (!nextToken) return;
    const id = ++requestId.current;
    setSearching(true);
    setError(null);
    try {
      const r = await window.audioNodes.youtubeSearch(searchedQuery.current, nextToken);
      if (id !== requestId.current) return;
      setPages((p) => [...p, r.results]);
      setTokens((t) => [...t, r.continuation]);
      setPageIndex(pageIndex + 1);
    } catch {
      if (id === requestId.current) fail();
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  };

  return (
    <div className="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-modal" role="dialog" aria-modal="true" aria-label="YouTube">
        <header className="search-modal__header">
          <h2 className="search-modal__title">YouTube</h2>
          <input
            className="insp__input search-modal__search"
            autoFocus
            value={query}
            placeholder="Search for a video, e.g. tavern ambience 1 hour"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search();
              e.stopPropagation();
            }}
          />
          <button className="an-btn" onClick={search} disabled={searching || !query.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
          <button className="settings__close search-modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="search-modal__body" ref={bodyRef}>
          {error && <p className="search-modal__error">{error}</p>}
          {!error && !searching && !searched && <p className="settings__hint">Type a search and press Enter.</p>}
          {!error && !searching && searched && results.length === 0 && <p className="settings__hint">No results.</p>}
          {searching && <p className="settings__hint">Searching…</p>}
          <ul className="search-list">
            {results.map((r) => (
              <li key={r.videoId} className="search-item">
                {r.thumbnail && <img className="search-item__thumb" src={r.thumbnail} alt="" />}
                <div className="search-item__info">
                  <div className="search-item__name search-item__name--wrap" title={r.title}>{r.title}</div>
                  {r.duration && <div className="search-item__meta">{r.duration}</div>}
                </div>
                <button className="an-btn search-item__import" onClick={() => onSelect(r)}>{actionLabel}</button>
              </li>
            ))}
          </ul>
        </div>

        {pages.length > 0 && (
          <footer className="search-modal__footer">
            <span />
            <span className="search-modal__pager">
              <button className="an-btn" disabled={pageIndex === 0 || searching} onClick={() => setPageIndex(pageIndex - 1)}>Prev</button>
              <span>Page {pageIndex + 1}</span>
              <button className="an-btn" disabled={!hasNext || searching} onClick={goNext}>Next</button>
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
