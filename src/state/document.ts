// Document lifecycle for the open project: save / open / new with unsaved-changes prompts,
// a throttled crash-recovery autosave, and restoring that autosave on launch.
import { useStore, selectIsDirty, type SceneSession } from './store';
import { useRecentStore } from './recentStore';
import type { Project } from '../types';

const AUTOSAVE_INTERVAL_MS = 1500;
const LEGACY_SESSION_KEY = 'audio-nodes-session'; // pre-autosave localStorage persistence

interface AutosaveFile extends SceneSession {
  version: 1;
  savedAt: number;
  filePath: string | null;
  project: Project; // library paths are absolute
}

const api = () => (typeof window !== 'undefined' ? window.audioNodes : undefined);

export function projectNameFromPath(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return base.replace(/\.anodes$/i, '');
}

// ── Serialization (library paths are stored relative to the project file) ──────────────────

async function serializeProject(project: Project, projectPath: string): Promise<string> {
  const a = api();
  if (!a) return JSON.stringify(project, null, 2);
  const clone = structuredClone(project);
  for (const file of clone.library) file.path = await a.relativizePath(projectPath, file.path);
  return JSON.stringify(clone, null, 2);
}

async function deserializeProject(json: string, projectPath: string): Promise<Project> {
  const project = JSON.parse(json) as Project;
  const a = api();
  if (a) {
    for (const file of project.library ?? []) file.path = await a.absolutizePath(projectPath, file.path);
  }
  return { ...project, scenes: project.scenes ?? [], hotkeys: project.hotkeys ?? {} };
}

// ── Save / open / new ──────────────────────────────────────────────────────────────────────

/** Save the project; prompts for a path when untitled or `saveAs`. Resolves false if cancelled. */
export async function saveDocument(saveAs = false): Promise<boolean> {
  const a = api();
  if (!a) return false;
  const { project, filePath } = useStore.getState();
  const savePath = !saveAs && filePath ? filePath : await a.showSaveDialog(project.name);
  if (!savePath) return false;
  const saved: Project = { ...project, name: projectNameFromPath(savePath) };
  await a.saveProject(savePath, await serializeProject(saved, savePath));
  useStore.getState().markSaved(project, saved, savePath);
  useRecentStore.getState().add(savePath);
  return true;
}

/** If there are unsaved changes, ask to save them. Resolves false if the user cancels. */
export async function confirmDiscardChanges(): Promise<boolean> {
  const a = api();
  if (!a || !selectIsDirty(useStore.getState())) return true;
  const choice = await a.showMessageBox({
    title: 'Unsaved changes',
    message: `Do you want to save changes to "${useStore.getState().project.name}"?`,
    buttons: ['Save', "Don't Save", 'Cancel'],
  });
  if (choice === 0) return saveDocument();
  return choice === 1;
}

export async function newDocument() {
  if (!(await confirmDiscardChanges())) return;
  useStore.getState().newProject();
}

export async function openDocument(path?: string) {
  const a = api();
  if (!a) return;
  if (!(await confirmDiscardChanges())) return;
  const target = path ?? (await a.showOpenDialog());
  if (!target) return;
  const project = await deserializeProject(await a.loadProject(target), target);
  useStore.getState().loadProject({ ...project, name: projectNameFromPath(target) }, target);
  useRecentStore.getState().add(target);
}

/** Save in response to the window's close prompt, then let the window close. */
export async function saveAndClose() {
  const a = api();
  if (!a) return;
  if (await saveDocument()) await a.confirmClose();
  else await a.cancelClose();
}

// ── Autosave + crash recovery ──────────────────────────────────────────────────────────────

function readLegacySession(): AutosaveFile | null {
  try {
    const raw = localStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return null;
    const { state } = JSON.parse(raw) as { state?: { project?: Project; filePath?: string | null } };
    const project = state?.project;
    if (!project || (project.nodes.length <= 1 && project.library.length === 0)) return null;
    return { version: 1, savedAt: 0, filePath: state?.filePath ?? null, project, currentSceneId: null, untitledScene: null };
  } catch {
    return null;
  }
}

function clearLegacySession() {
  try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* storage unavailable */ }
}

async function offerRecovery() {
  const a = api()!;
  let backup: AutosaveFile | null = null;
  try {
    const raw = await a.autosaveRead();
    if (raw) backup = JSON.parse(raw) as AutosaveFile;
  } catch { /* corrupt backup: ignore */ }
  backup ??= readLegacySession();
  if (!backup?.project) return;

  const when = backup.savedAt ? ` from ${new Date(backup.savedAt).toLocaleString()}` : '';
  const choice = await a.showMessageBox({
    title: 'Recover unsaved changes',
    message: `Foaly didn't close cleanly. Restore your unsaved changes to "${backup.project.name}"${when}?`,
    buttons: ['Restore', 'Discard'],
  });
  if (choice === 0) {
    const sceneIds = new Set(backup.project.scenes.map((s) => s.id));
    useStore.getState().loadProject(backup.project, backup.filePath, {
      dirty: true,
      scenes: {
        currentSceneId: backup.currentSceneId && sceneIds.has(backup.currentSceneId) ? backup.currentSceneId : null,
        untitledScene: backup.untitledScene ?? null,
      },
    });
  } else {
    await a.autosaveClear();
  }
  clearLegacySession();
}

function documentTitle(name: string, dirty: boolean) {
  return `${dirty ? '• ' : ''}${name} — Foaly`;
}

let started = false;

/** Run once at startup: offer crash recovery, then keep the autosave backup and window state in sync. */
export async function startDocumentSession() {
  const a = api();
  if (!a || started) return;
  started = true;

  await offerRecovery();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const writeBackup = () => {
    timer = null;
    const s = useStore.getState();
    if (!selectIsDirty(s)) return;
    const payload: AutosaveFile = {
      version: 1,
      savedAt: Date.now(),
      filePath: s.filePath,
      project: s.project,
      currentSceneId: s.currentSceneId,
      untitledScene: s.untitledScene,
    };
    a.autosaveWrite(JSON.stringify(payload)).catch(() => { /* disk full etc.; retry on next change */ });
  };

  const syncWindow = () => {
    const s = useStore.getState();
    const dirty = selectIsDirty(s);
    const title = documentTitle(s.project.name, dirty);
    document.title = title;
    a.setDocumentState({ dirty, filePath: s.filePath, title });
  };

  let wasDirty = selectIsDirty(useStore.getState());
  if (wasDirty) writeBackup();
  syncWindow();

  useStore.subscribe((s, prev) => {
    const dirty = selectIsDirty(s);
    if (dirty !== wasDirty || s.project.name !== prev.project.name || s.filePath !== prev.filePath) syncWindow();
    if (!dirty) {
      if (wasDirty) {
        if (timer) clearTimeout(timer);
        timer = null;
        a.autosaveClear();
      }
    } else if (
      !timer &&
      (s.project !== prev.project || s.currentSceneId !== prev.currentSceneId || s.untitledScene !== prev.untitledScene)
    ) {
      // Throttle (not debounce) so a long slider drag still gets backed up.
      timer = setTimeout(writeBackup, AUTOSAVE_INTERVAL_MS);
    }
    wasDirty = dirty;
  });

  // Best-effort flush on reload so the latest changes make it into the backup.
  window.addEventListener('beforeunload', () => {
    if (timer) { clearTimeout(timer); writeBackup(); }
  });
}
