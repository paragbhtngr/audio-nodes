import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const INTEGRATIONS = [
  {
    id: 'freesound',
    label: 'Freesound',
    description: 'Search and download CC-licensed ambience and sound effects.',
    needsApiKey: true,
  },
] as const;

export type IntegrationId = (typeof INTEGRATIONS)[number]['id'];

interface SettingsState {
  integrations: Record<IntegrationId, boolean>;
  freesoundApiKey: string;
  setIntegrationEnabled: (id: IntegrationId, enabled: boolean) => void;
  setFreesoundApiKey: (key: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      integrations: { freesound: false },
      freesoundApiKey: '',
      setIntegrationEnabled: (id, enabled) =>
        set((s) => ({ integrations: { ...s.integrations, [id]: enabled } })),
      setFreesoundApiKey: (key) => set({ freesoundApiKey: key }),
    }),
    { name: 'foaly.settings' }
  )
);
