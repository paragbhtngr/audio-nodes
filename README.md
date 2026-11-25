# Foaly

A node-based ambient sound mixer for tabletop RPG game masters. Build layered soundscapes (background music + weather + ambient + battle FX) on a visual graph, then trigger and crossfade them live during a session.

> Foaly is the product name; the repository and some internal identifiers still use the original working title, *Audio Nodes*.

## Status

Early but usable (v0.1.0). The core editor, audio engine, scenes, effects, hotkeys and packaging all work. Packaging is configured for macOS (Intel and Apple Silicon) and Windows, but the CI build is currently failing and no release has been published yet; only macOS is tested regularly. The app is not yet code-signed, and there is no Linux build.

## Features

- **Visual node graph** — drag sounds onto a canvas and wire them into Master Out
- **Node types**
  - *Sound* — a single file with volume, loop, fade in/out, pan, pan randomization, and pitch range
  - *Random Pool* — plays randomly chosen files from a set (good for thunder, creaks, distant fights)
  - *YouTube* — search, preview and play audio from YouTube, with loop and volume
  - *Group* — a container with its own icon, color, volume and hotkey; play or stop all members at once; collapsible
  - *Effect* — reverb, low-pass and high-pass filters
  - *Master Out* — final volume
- **Scenes** — each scene has its own canvas, nodes, and hotkeys, while the audio library is shared across the project. Switching scenes fades the outgoing scene out as the incoming one fades in
- **Live controls** — per-node volume, one-shot triggers, crossfade between groups, and ducking (lower chosen sounds while another plays)
- **Hotkeys + floating HUD** showing what is bound to what; hotkeys are suspended while you type in a text field
- **Audio library** — import files or whole folders (including drag and drop from Finder), see durations, and get warnings for missing or orphaned files
- **Freesound integration** — search, preview and import sounds from [Freesound](https://freesound.org) (requires your own API key; author and license are kept with each imported sound)
- **Group prefabs** — save a group with its members and reuse it in other projects
- **Projects stay local** — saved as JSON (schema v2; v1 files migrate automatically). Autosave with crash recovery, recent projects, and an untitled-project workflow
- **Themes** — Default, Pip-Boy, Gilmore, and Clippy skins

## Goals

- Local-first: no account and no cloud; your sounds and projects stay on your machine
- Fast to use at the table: everything important is one click or one key away
- Cross-platform via Electron (macOS and Windows packaged today; Linux planned)

## Tech Stack

- **Electron** — desktop shell, cross-platform
- **Vite + React 19 + TypeScript** — renderer
- **React Flow (`@xyflow/react`)** — node graph canvas
- **Web Audio API** (direct, not Howler) — graph primitives map naturally to node types
- **Zustand** — state store
- **vite-plugin-electron** — dev integration
- **electron-builder** — packaging

## Architecture

```
foaly/
├── electron/
│   ├── main.ts          Main process, BrowserWindow, menus, IPC handlers
│   └── preload.ts       contextBridge — secure renderer ↔ main API
├── src/
│   ├── audio/           Web Audio engine (singleton reconciler)
│   ├── components/      Node components, inspector, library, modals (settings, Freesound, YouTube)
│   ├── state/           Zustand stores (project, settings, themes, recents, prefabs, autosave)
│   ├── styles/          Global CSS and themes
│   ├── types/           Project, Node, Edge, AudioFile types
│   ├── views/           EditView
│   ├── App.tsx
│   └── main.tsx
├── build/               App icons
├── index.html
├── vite.config.ts
└── package.json
```

**Key design decision:** the audio engine is decoupled from React. The Zustand store describes what should exist; the audio engine subscribes and reconciles its internal Web Audio graph to match. React re-renders never restart audio.

**Security defaults:** `contextIsolation: true`, `nodeIntegration: false`, strict CSP in `index.html`. All filesystem/dialog access goes through typed IPC channels exposed by `preload.ts`.

## Getting Started

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev      # launches Vite + Electron with hot reload
```

The first run downloads Electron (~120 MB), which takes a couple of minutes. Subsequent runs start in ~2 seconds.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server + Electron with HMR; DevTools opens automatically |
| `npm run build` | Type-check + production build |
| `npm run dist` | Package as `.dmg` (macOS) / `.exe` (Windows) via electron-builder |

## Issue Tracking (beads)

This project uses [beads (`bd`)](https://github.com/gastownhall/beads) for issue tracking. All planned work is filed as `bd` issues.

```bash
bd ready              # next available work item
bd list --type epic   # see the four phase epics
bd show <id>          # details for an issue
bd update <id> --claim    # claim an issue (sets in_progress + assignee)
bd close <id>         # mark done
```

To re-seed the issue tracker from scratch (e.g., on a fresh checkout that doesn't have the `.beads/` Dolt DB synced), run:

```bash
bash scripts/seed-beads.sh
```

## Roadmap

Done: the core graph and audio engine, Sound / Random Pool / YouTube / Group / Effect nodes, hotkeys and HUD, crossfade and ducking, scenes with per-scene canvases, group prefabs, Freesound search, themes, autosave, and macOS/Windows packaging.

Next:

- Get CI producing and publishing release builds (the Build workflow is currently failing)
- Code signing and notarization for macOS, and signing for Windows
- A dedicated performance view (a stripped-down live-play layout)
- Linux packaging (AppImage)
- Undo/redo
- MIDI and Stream Deck triggers
- A starter sample library and tags for organizing sounds

Run `bd list` or `bd ready` to see the tracked issues.

## Cross-platform Notes

The codebase is written to be cross-platform (`path.join`, `CommandOrControl`, etc.), but development and manual testing happen on macOS. Windows installers are built in CI but have had little real-world testing. There is no Linux target in `package.json` yet.

## License

ISC (placeholder — confirm before wider distribution).
