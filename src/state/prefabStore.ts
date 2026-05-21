import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Prefab } from '../types';

interface PrefabState {
  prefabs: Prefab[];
  savePrefab: (prefab: Prefab) => void;
  deletePrefab: (id: string) => void;
}

export const usePrefabStore = create<PrefabState>()(
  persist(
    (set) => ({
      prefabs: [],
      savePrefab: (prefab) =>
        set((s) => ({ prefabs: [...s.prefabs.filter((p) => p.id !== prefab.id), prefab] })),
      deletePrefab: (id) =>
        set((s) => ({ prefabs: s.prefabs.filter((p) => p.id !== id) })),
    }),
    { name: 'audio-nodes-prefabs' }
  )
);
