import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../../state/store';
import { usePrefabStore } from '../../state/prefabStore';
import { audioEngine } from '../../audio/engine';
import type { SoundNodeData, MasterNodeData, GroupNodeData, RandomPoolNodeData, EffectNodeData } from '../../types';

const EMOJI_CATEGORIES: Record<string, string[]> = {
  'Music':   ['🎵','🎶','🎸','🎹','🎺','🥁','🎻','🎷','🪗','🪘','🔔','📯'],
  'Nature':  ['🌧️','⛈️','🌊','🌬️','🌙','⭐','🌲','🌫️','🔥','🌋','❄️','🌑'],
  'Fantasy': ['🐉','⚔️','🛡️','🧙','💀','👻','🦇','🗡️','🧟','🪄','🔮','💎'],
  'Place':   ['🏰','🌿','🍺','🕯️','🗝️','🚪','🏕️','⛩️','🗺️','🌉','🏚️','⛺'],
};

function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} className="emoji-wrap">
      <button className="emoji-trigger" onClick={() => setOpen((o) => !o)}>
        {value || <span className="emoji-placeholder">Pick</span>}
      </button>
      {value && (
        <button className="insp__clear" onClick={() => onChange('')} title="Clear icon">×</button>
      )}
      {open && (
        <div className="emoji-popover">
          {Object.entries(EMOJI_CATEGORIES).map(([cat, emojis]) => (
            <div key={cat}>
              <div className="emoji-cat-label">{cat}</div>
              <div className="emoji-grid">
                {emojis.map((em) => (
                  <button
                    key={em}
                    className={`emoji-btn ${value === em ? 'emoji-btn--active' : ''}`}
                    onClick={() => { onChange(em); setOpen(false); }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="insp__field">
      <div className="insp__row">
        <span className="insp__label">{label}</span>
        <span className="insp__value">{display ?? value}</span>
      </div>
      <input
        type="range"
        className="insp__slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function HotkeyField({ nodeId }: { nodeId: string }) {
  const hotkeys = useStore((s) => s.project.hotkeys);
  const setHotkey = useStore((s) => s.setHotkey);
  const removeHotkey = useStore((s) => s.removeHotkey);
  const [listening, setListening] = useState(false);

  const currentKey = Object.entries(hotkeys).find(([, nid]) => nid === nodeId)?.[0];

  const startListening = () => setListening(true);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') {
        setListening(false);
        return;
      }
      // ignore bare modifier presses
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(key);

      // remove old binding for this node
      if (currentKey) removeHotkey(currentKey);
      setHotkey(parts.join('+'), nodeId);
      setListening(false);
    },
    [nodeId, currentKey, setHotkey, removeHotkey]
  );

  useEffect(() => {
    if (!listening) return;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [listening, onKeyDown]);

  return (
    <div className="insp__field">
      <div className="insp__row">
        <span className="insp__label">Hotkey</span>
        {currentKey && (
          <button
            className="insp__clear"
            onClick={() => removeHotkey(currentKey)}
            title="Clear hotkey"
          >
            ×
          </button>
        )}
      </div>
      <button
        className={`insp__hotkey-btn ${listening ? 'insp__hotkey-btn--listening' : ''}`}
        onClick={startListening}
      >
        {listening ? 'Press a key…' : (currentKey ?? 'Click to assign')}
      </button>
    </div>
  );
}

const GROUP_COLORS = ['#bb9af7', '#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#2ac3de', '#ff9e64', '#73daca'];

function GroupInspector({ id }: { id: string }) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as GroupNodeData | undefined;
  });
  const update = useStore((s) => s.updateNodeData);
  if (!data) return null;

  return (
    <>
      <div className="insp__section-title">Identity</div>
      <div className="insp__field">
        <div className="insp__row">
          <span className="insp__label">Icon</span>
          <EmojiPicker value={data.icon} onChange={(icon) => update(id, { icon })} />
        </div>
      </div>

      <div className="insp__field">
        <span className="insp__label">Color</span>
        <div className="insp__color-row">
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              className={`insp__swatch ${data.color === c ? 'insp__swatch--active' : ''}`}
              style={{ background: c }}
              onClick={() => update(id, { color: c })}
            />
          ))}
          <input
            type="color"
            className="insp__color-custom"
            value={data.color}
            onChange={(e) => update(id, { color: e.target.value })}
            title="Custom color"
          />
        </div>
      </div>

      <div className="insp__section-title">Output</div>
      <SliderRow
        label="Volume"
        value={data.volume}
        min={0} max={1} step={0.01}
        display={`${Math.round(data.volume * 100)}%`}
        onChange={(v) => update(id, { volume: v })}
      />

      <div className="insp__section-title">Hotkey</div>
      <HotkeyField nodeId={id} />

      <CrossfadeSection groupId={id} />

      <div className="insp__section-title">Prefab</div>
      <SavePrefabButton groupId={id} />
    </>
  );
}

function CrossfadeSection({ groupId }: { groupId: string }) {
  const groups = useStore((s) =>
    s.project.nodes.filter((n) => n.type === 'group' && n.id !== groupId)
  );
  const [targetId, setTargetId] = useState('');
  const [duration, setDuration] = useState(3);

  if (groups.length === 0) return null;

  return (
    <>
      <div className="insp__section-title">Crossfade</div>
      <div className="insp__field">
        <select
          className="insp__select nodrag"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">Fade to…</option>
          {groups.map((g) => {
            const d = g.data as GroupNodeData;
            return <option key={g.id} value={g.id}>{d.icon} {d.label}</option>;
          })}
        </select>
      </div>
      <SliderRow
        label="Duration"
        value={duration}
        min={0.5} max={10} step={0.5}
        display={`${duration}s`}
        onChange={setDuration}
      />
      <button
        className="an-btn an-btn--primary"
        style={{ width: '100%', marginTop: 4 }}
        disabled={!targetId}
        onClick={() => targetId && audioEngine.crossfade(groupId, targetId, duration)}
      >
        Crossfade →
      </button>
    </>
  );
}

function DuckingSection({ nodeId, data }: { nodeId: string; data: SoundNodeData | RandomPoolNodeData }) {
  const groups = useStore((s) => s.project.nodes.filter((n) => n.type === 'group'));
  const update = useStore((s) => s.updateNodeData);

  const toggle = (groupId: string) => {
    const next = data.duckTargets.includes(groupId)
      ? data.duckTargets.filter((id) => id !== groupId)
      : [...data.duckTargets, groupId];
    update(nodeId, { duckTargets: next });
  };

  if (groups.length === 0) return null;

  return (
    <>
      <div className="insp__section-title">Ducking</div>
      <div className="insp__field">
        {groups.map((g) => {
          const d = g.data as GroupNodeData;
          return (
            <label key={g.id} className="insp__check" style={{ marginBottom: 3 }}>
              <input
                type="checkbox"
                checked={data.duckTargets.includes(g.id)}
                onChange={() => toggle(g.id)}
              />
              <span style={{ color: d.color }}>{d.icon} {d.label}</span>
            </label>
          );
        })}
      </div>
      {data.duckTargets.length > 0 && (
        <>
          <SliderRow
            label="Duck amount"
            value={data.duckAmount}
            min={0} max={1} step={0.01}
            display={`${Math.round(data.duckAmount * 100)}%`}
            onChange={(v) => update(nodeId, { duckAmount: v })}
          />
          <SliderRow
            label="Release"
            value={data.duckRelease}
            min={0.1} max={5} step={0.1}
            display={`${data.duckRelease.toFixed(1)}s`}
            onChange={(v) => update(nodeId, { duckRelease: v })}
          />
        </>
      )}
    </>
  );
}

function SavePrefabButton({ groupId }: { groupId: string }) {
  const savePrefab = usePrefabStore((s) => s.savePrefab);
  const project = useStore((s) => s.project);

  const save = () => {
    const node = project.nodes.find((n) => n.id === groupId);
    if (!node || node.type !== 'group') return;
    const groupData = node.data as GroupNodeData;
    const groupPos = node.position;
    const memberEdges = project.edges.filter((e) => e.target === groupId);
    const fileIds = new Set<string>();
    const members = memberEdges.flatMap((e) => {
      const m = project.nodes.find((n) => n.id === e.source);
      if (!m || (m.type !== 'sound' && m.type !== 'randomPool')) return [];
      const d = m.data as import('../../types').SoundNodeData | import('../../types').RandomPoolNodeData;
      if (d.kind === 'sound' && d.fileId) fileIds.add(d.fileId);
      if (d.kind === 'randomPool') d.fileIds.forEach((fid) => fileIds.add(fid));
      return [{ data: d, relativePosition: { x: m.position.x - groupPos.x, y: m.position.y - groupPos.y } }];
    });
    const library = project.library.filter((f) => fileIds.has(f.id));
    savePrefab({ id: `prefab-${Date.now()}`, groupData, members, library });
  };

  return (
    <button className="an-btn an-btn--primary" style={{ width: '100%', marginTop: 4 }} onClick={save}>
      Save as Prefab
    </button>
  );
}

function SoundInspector({ id }: { id: string }) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as SoundNodeData | undefined;
  });
  const update = useStore((s) => s.updateNodeData);

  if (!data) return null;

  const u = (patch: Partial<SoundNodeData>) => update(id, patch);

  return (
    <>
      <div className="insp__section-title">Playback</div>
      <SliderRow
        label="Volume"
        value={data.volume}
        min={0} max={1} step={0.01}
        display={`${Math.round(data.volume * 100)}%`}
        onChange={(v) => u({ volume: v })}
      />
      <div className="insp__field">
        <label className="insp__check">
          <input type="checkbox" checked={data.loop} onChange={(e) => u({ loop: e.target.checked })} />
          Loop
        </label>
      </div>

      <div className="insp__section-title">Fade</div>
      <SliderRow
        label="Fade In"
        value={data.fadeIn}
        min={0} max={10} step={0.1}
        display={`${data.fadeIn.toFixed(1)}s`}
        onChange={(v) => u({ fadeIn: v })}
      />
      <SliderRow
        label="Fade Out"
        value={data.fadeOut}
        min={0} max={10} step={0.1}
        display={`${data.fadeOut.toFixed(1)}s`}
        onChange={(v) => u({ fadeOut: v })}
      />

      <div className="insp__section-title">Pan</div>
      <SliderRow
        label="Pan"
        value={data.pan}
        min={-1} max={1} step={0.01}
        display={data.pan === 0 ? 'C' : data.pan > 0 ? `R${Math.round(data.pan * 100)}` : `L${Math.round(-data.pan * 100)}`}
        onChange={(v) => u({ pan: v })}
      />
      <SliderRow
        label="Pan Random ±"
        value={data.panRandom}
        min={0} max={1} step={0.01}
        display={`±${Math.round(data.panRandom * 100)}`}
        onChange={(v) => u({ panRandom: v })}
      />

      <div className="insp__section-title">Pitch</div>
      <SliderRow
        label="Pitch Min"
        value={data.pitchMin}
        min={0.25} max={4} step={0.01}
        display={`×${data.pitchMin.toFixed(2)}`}
        onChange={(v) => u({ pitchMin: Math.min(v, data.pitchMax) })}
      />
      <SliderRow
        label="Pitch Max"
        value={data.pitchMax}
        min={0.25} max={4} step={0.01}
        display={`×${data.pitchMax.toFixed(2)}`}
        onChange={(v) => u({ pitchMax: Math.max(v, data.pitchMin) })}
      />

      <DuckingSection nodeId={id} data={data} />

      <div className="insp__section-title">Hotkey</div>
      <HotkeyField nodeId={id} />
    </>
  );
}

function RandomPoolInspector({ id }: { id: string }) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as RandomPoolNodeData | undefined;
  });
  const library = useStore((s) => s.project.library);
  const update = useStore((s) => s.updateNodeData);
  if (!data) return null;
  const u = (patch: Partial<RandomPoolNodeData>) => update(id, patch);
  const files = data.fileIds.map((fid) => library.find((f) => f.id === fid)).filter(Boolean) as typeof library;

  return (
    <>
      <div className="insp__section-title">Pool</div>
      <div className="insp__field">
        {files.length === 0
          ? <p className="hint" style={{ margin: 0 }}>Drag files from library onto the node.</p>
          : files.map((f) => (
            <div key={f.id} className="insp__row" style={{ marginBottom: 3 }}>
              <span className="insp__label" style={{ flex: 1 }}>{f.name}</span>
              <button className="insp__clear" onClick={() => u({ fileIds: data.fileIds.filter((x) => x !== f.id) })}>×</button>
            </div>
          ))
        }
      </div>

      <div className="insp__section-title">Playback</div>
      <SliderRow label="Volume" value={data.volume} min={0} max={1} step={0.01}
        display={`${Math.round(data.volume * 100)}%`} onChange={(v) => u({ volume: v })} />
      <div className="insp__field">
        <label className="insp__check">
          <input type="checkbox" checked={data.loop} onChange={(e) => u({ loop: e.target.checked })} />
          Loop (re-picks each time)
        </label>
      </div>
      <SliderRow label="Fade In" value={data.fadeIn} min={0} max={10} step={0.1}
        display={`${data.fadeIn.toFixed(1)}s`} onChange={(v) => u({ fadeIn: v })} />
      <SliderRow label="Fade Out" value={data.fadeOut} min={0} max={10} step={0.1}
        display={`${data.fadeOut.toFixed(1)}s`} onChange={(v) => u({ fadeOut: v })} />

      <div className="insp__section-title">Pan</div>
      <SliderRow label="Pan" value={data.pan} min={-1} max={1} step={0.01}
        display={data.pan === 0 ? 'C' : data.pan > 0 ? `R${Math.round(data.pan * 100)}` : `L${Math.round(-data.pan * 100)}`}
        onChange={(v) => u({ pan: v })} />
      <SliderRow label="Pan Random ±" value={data.panRandom} min={0} max={1} step={0.01}
        display={`±${Math.round(data.panRandom * 100)}`} onChange={(v) => u({ panRandom: v })} />

      <div className="insp__section-title">Pitch</div>
      <SliderRow label="Pitch Min" value={data.pitchMin} min={0.25} max={4} step={0.01}
        display={`×${data.pitchMin.toFixed(2)}`} onChange={(v) => u({ pitchMin: Math.min(v, data.pitchMax) })} />
      <SliderRow label="Pitch Max" value={data.pitchMax} min={0.25} max={4} step={0.01}
        display={`×${data.pitchMax.toFixed(2)}`} onChange={(v) => u({ pitchMax: Math.max(v, data.pitchMin) })} />

      <DuckingSection nodeId={id} data={data} />

      <div className="insp__section-title">Hotkey</div>
      <HotkeyField nodeId={id} />
    </>
  );
}

function EffectInspector({ id }: { id: string }) {
  const data = useStore((s) => s.project.nodes.find((n) => n.id === id)?.data as EffectNodeData | undefined);
  const update = useStore((s) => s.updateNodeData);
  if (!data) return null;
  const u = (patch: Partial<EffectNodeData>) => update(id, patch);
  const logFreq = Math.log10(data.frequency);

  return (
    <>
      {data.effectType === 'reverb' ? (
        <>
          <div className="insp__section-title">Reverb</div>
          <SliderRow label="Wet" value={data.wet} min={0} max={1} step={0.01}
            display={`${Math.round(data.wet * 100)}%`} onChange={(v) => u({ wet: v })} />
          <SliderRow label="Decay" value={data.decay} min={0.1} max={5} step={0.1}
            display={`${data.decay.toFixed(1)}s`} onChange={(v) => u({ decay: v })} />
        </>
      ) : (
        <>
          <div className="insp__section-title">{data.effectType === 'lowpass' ? 'Low Pass Filter' : 'High Pass Filter'}</div>
          <div className="insp__field">
            <div className="insp__row">
              <span className="insp__label">Cutoff</span>
              <span className="insp__value">{Math.round(data.frequency)} Hz</span>
            </div>
            <input type="range" className="insp__slider"
              min={Math.log10(20)} max={Math.log10(20000)} step={0.01}
              value={logFreq}
              onChange={(e) => u({ frequency: Math.round(Math.pow(10, parseFloat(e.target.value))) })} />
          </div>
          <SliderRow label="Resonance (Q)" value={data.q} min={0.1} max={10} step={0.1}
            display={data.q.toFixed(1)} onChange={(v) => u({ q: v })} />
        </>
      )}
    </>
  );
}

function MasterInspector({ id }: { id: string }) {
  const data = useStore((s) => {
    const node = s.project.nodes.find((n) => n.id === id);
    return node?.data as MasterNodeData | undefined;
  });
  const update = useStore((s) => s.updateNodeData);

  if (!data) return null;

  return (
    <>
      <div className="insp__section-title">Output</div>
      <SliderRow
        label="Master Volume"
        value={data.volume}
        min={0} max={1} step={0.01}
        display={`${Math.round(data.volume * 100)}%`}
        onChange={(v) => update(id, { volume: v })}
      />
    </>
  );
}

export function Inspector() {
  const selectedId = useStore((s) => s.selectedNodeId);
  const node = useStore((s) => s.project.nodes.find((n) => n.id === selectedId));

  return (
    <aside className="inspector">
      {!node ? (
        <p className="hint" style={{ marginTop: 8 }}>Select a node to inspect.</p>
      ) : (
        <>
          <div className="insp__header">
            {node.type === 'master' ? 'Master Out'
              : node.type === 'group' ? (node.data as GroupNodeData).label
              : node.type === 'randomPool' ? 'Random Pool'
              : 'Sound Node'}
          </div>
          {node.type === 'sound' && <SoundInspector id={node.id} />}
          {node.type === 'master' && <MasterInspector id={node.id} />}
          {node.type === 'group' && <GroupInspector id={node.id} />}
          {node.type === 'randomPool' && <RandomPoolInspector id={node.id} />}
          {node.type === 'effect' && <EffectInspector id={node.id} />}
        </>
      )}
    </aside>
  );
}
