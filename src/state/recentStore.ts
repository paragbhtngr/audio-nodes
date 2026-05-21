import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RecentState {
  paths: string[];
  add: (path: string) => void;
  clear: () => void;
}

export const useRecentStore = create<RecentState>()(
  persist(
    (set) => ({
      paths: [],
      add: (path) =>
        set((s) => ({ paths: [path, ...s.paths.filter((p) => p !== path)].slice(0, 8) })),
      clear: () => set({ paths: [] }),
    }),
    { name: 'audio-nodes-recent' }
  )
);
