import { useEffect } from 'react';
import { EditView } from './views/EditView';
import { audioEngine } from './audio/engine';

export function App() {
  useEffect(() => {
    audioEngine.init();
    return () => audioEngine.destroy();
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
