import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../state/store';
import type { SoundNodeData, MasterNodeData } from '../../types';

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

      <div className="insp__section-title">Hotkey</div>
      <HotkeyField nodeId={id} />
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
            {node.type === 'master' ? 'Master Out' : (node.data as SoundNodeData).fileId
              ? ''
              : 'Sound Node'}
          </div>
          {node.type === 'sound' && <SoundInspector id={node.id} />}
          {node.type === 'master' && <MasterInspector id={node.id} />}
        </>
      )}
    </aside>
  );
}
