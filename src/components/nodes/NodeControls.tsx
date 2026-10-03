export function PlayButton({ playing, disabled, onClick }: {
  playing: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      className={`an-icon-btn an-icon-btn--${playing ? 'stop' : 'play'} nodrag`}
      onClick={onClick}
      disabled={disabled}
      title={playing ? 'Stop' : 'Play'}
      aria-label={playing ? 'Stop' : 'Play'}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
        {playing ? <rect x="3.5" y="3.5" width="9" height="9" rx="1" /> : <path d="M5 3l8 5-8 5z" />}
      </svg>
    </button>
  );
}

export function LoopButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className={`an-icon-btn an-icon-btn--loop${active ? ' an-icon-btn--on' : ''} nodrag`}
      onClick={onClick}
      title={active ? 'Loop on' : 'Loop off'}
      aria-label="Loop"
      aria-pressed={active}
    >
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7V6.5A2.5 2.5 0 0 1 5.5 4H13" />
        <path d="M11 2l2 2-2 2" />
        <path d="M13 9v.5A2.5 2.5 0 0 1 10.5 12H3" />
        <path d="M5 14l-2-2 2-2" />
      </svg>
    </button>
  );
}
