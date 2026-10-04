import type { CSSProperties } from 'react';

// Exposes how far a range input's thumb sits as --fill so the default skin can paint the track up to it
export function rangeFill(value: number, min: number, max: number): CSSProperties {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return { '--fill': `${Math.min(100, Math.max(0, pct))}%` } as CSSProperties;
}
