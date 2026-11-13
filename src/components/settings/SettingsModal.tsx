import { useEffect, useState } from 'react';
import { ThemePicker } from '../ThemePicker';
import { INTEGRATIONS, useSettingsStore } from '../../state/settings';

type Category = 'skin' | 'integrations';

const CATEGORIES: { group: string; items: { id: Category; label: string }[] }[] = [
  { group: 'Appearance', items: [{ id: 'skin', label: 'Skin' }] },
  { group: 'Sources', items: [{ id: 'integrations', label: 'Integrations' }] },
];

function SkinPanel() {
  return (
    <>
      <h3 className="settings__title">Skin</h3>
      <p className="settings__hint">Change the look of the whole app.</p>
      <ThemePicker />
    </>
  );
}

function IntegrationsPanel() {
  const enabled = useSettingsStore((s) => s.integrations);
  const setEnabled = useSettingsStore((s) => s.setIntegrationEnabled);
  const apiKey = useSettingsStore((s) => s.freesoundApiKey);
  const setApiKey = useSettingsStore((s) => s.setFreesoundApiKey);

  return (
    <>
      <h3 className="settings__title">Integrations</h3>
      <p className="settings__hint">Choose which audio sources you want available.</p>
      <ul className="settings__list">
        {INTEGRATIONS.map((i) => (
          <li key={i.id} className="settings__integration">
            <label className="settings__toggle">
              <input
                type="checkbox"
                checked={enabled[i.id]}
                onChange={(e) => setEnabled(i.id, e.target.checked)}
              />
              <span className="settings__integration-name">{i.label}</span>
            </label>
            <p className="settings__integration-desc">{i.description}</p>
            {i.id === 'freesound' && enabled.freesound && (
              <label className="settings__field">
                <span>API key</span>
                <input
                  type="password"
                  className="insp__input"
                  value={apiKey}
                  placeholder="Paste your Freesound API key"
                  onChange={(e) => setApiKey(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category>('skin');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings" role="dialog" aria-modal="true" aria-label="Settings">
        <nav className="settings__nav">
          <h2 className="settings__nav-title">Settings</h2>
          {CATEGORIES.map((g) => (
            <div key={g.group} className="settings__group">
              <div className="settings__group-label">{g.group}</div>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  className={`settings__nav-item${category === item.id ? ' settings__nav-item--active' : ''}`}
                  onClick={() => setCategory(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="settings__panel">
          <button className="settings__close" onClick={onClose} aria-label="Close settings">×</button>
          {category === 'skin' ? <SkinPanel /> : <IntegrationsPanel />}
        </section>
      </div>
    </div>
  );
}
