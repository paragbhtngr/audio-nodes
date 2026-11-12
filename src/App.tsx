import { useEffect } from "react";
import { EditView } from "./views/EditView";
import { audioEngine } from "./audio/engine";
import { useStore, selectIsDirty } from "./state/store";
import { startDocumentSession } from "./state/document";

function TitleBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore(selectIsDirty);
  // Windows/Linux show document.title in the native title bar; macOS uses a hidden-inset bar.
  const showTitle = window.audioNodes?.platform === 'darwin';
  return (
    <div className="titlebar-drag">
      {showTitle && <span className="titlebar-title">
        {name}
        {dirty && <span className="titlebar-title__edited"> — Edited</span>}
      </span>}
    </div>
  );
}

export function App() {
  useEffect(() => {
    audioEngine.init();
    return () => audioEngine.destroy();
  }, []);

  useEffect(() => {
    startDocumentSession();
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
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return (
    <div className="app-root">
      <TitleBar />
      <main className="app-main">
        <EditView />
      </main>
    </div>
  );
}
