import { useEffect, useState } from 'react';

export const THEMES = [
  { id: 'default', label: 'Default' },
  { id: 'pipboy', label: 'Pip-Boy' },
  { id: 'neverwinter', label: 'Neverwinter' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'foaly.theme';

function load(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (THEMES.some((t) => t.id === v)) return v as ThemeId;
  } catch { /* storage unavailable */ }
  return 'default';
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
}

// Called before first render so there is no flash of the wrong skin.
export function initTheme() {
  applyTheme(load());
}

export function useTheme(): [ThemeId, (id: ThemeId) => void] {
  const [theme, setTheme] = useState<ThemeId>(load);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, setTheme];
}
