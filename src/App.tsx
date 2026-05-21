import { useEffect } from 'react';
import { EditView } from './views/EditView';
import { audioEngine } from './audio/engine';

export function App() {
  useEffect(() => {
    audioEngine.init();
    return () => audioEngine.destroy();
  }, []);

  useEffect(() => {
    if (!window.audioNodes) return;
    const isTextInput = (el: EventTarget | null) =>
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    const onFocusIn = (e: FocusEvent) => {
      if (isTextInput(e.target)) window.audioNodes.setHotkeysEnabled(false);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isTextInput(e.target)) window.audioNodes.setHotkeysEnabled(true);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>Audio Nodes</h1>
      </header>
      <main className="app-main">
        <EditView />
      </main>
    </div>
  );
}
