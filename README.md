# Audio Nodes

A node-based ambient sound mixer for tabletop RPG game masters. Build layered soundscapes (background music + weather + ambient + battle FX) on a visual graph, then trigger and crossfade them live during a session.

## Status

Early scaffolding. The Electron + React + React Flow shell runs; the audio engine and node types are not yet implemented. See **Roadmap** below or run `bd ready` for the next available work item.

## Goals

- **Visual node graph** for composing soundscapes (audio sources → effects → master out)
- **Layered playback** — background music, weather, ambient, and one-shot FX simultaneously
- **Live controls** — master volume, per-node volume, one-shot triggers, crossfade between music
- **Hotkeys + floating HUD** showing what's mapped to what
- **Local-only** — projects saved as JSON, audio file library, no cloud
- **Cross-platform** — macOS, Windows, Linux via Electron

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
audio nodes/
├── electron/
│   ├── main.ts          Main process, BrowserWindow, IPC handlers
│   └── preload.ts       contextBridge — secure renderer ↔ main API
├── src/
│   ├── audio/           Web Audio engine (singleton reconciler)
│   ├── components/      React Flow node components, panels
│   ├── state/           Zustand stores
│   ├── types/           Project, Node, Edge, AudioFile types
│   ├── views/           EditView, PerformanceView, HotkeyHUD
│   ├── styles/          Global CSS
│   ├── App.tsx
│   └── main.tsx
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
| `npm run dist` | Package as `.dmg` / `.exe` / `.AppImage` via electron-builder |

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

The project is broken into four epics. Run `bd list --type epic` to see them, or `bd ready` to get the next P0 item.

### Phase 1 — MVP (P0)

Core graph + audio engine. Goal: drag an audio file onto the canvas, hear it play through Master Out, save the project, reopen it.

- Data model & types
- Zustand store
- Web Audio engine reconciler
- Master Out node
- SoundNode (file / loop / volume / play)
- Audio library panel + file picker IPC
- Drag-from-library-to-canvas
- Save/load project JSON
- Application menu

### Phase 2 — Live performance features (P1)

- RandomPool node, random-interval playback
- Fade in/out, pitch & pan randomization
- GroupNode containers
- Global hotkeys + floating HUD
- Crossfade between groups
- Ducking

### Phase 3 — Polish, packaging & distribution (P2)

- Effect nodes (reverb, lowpass, highpass)
- Reusable presets, scenes/snapshots
- Performance mode view
- Cross-platform packaging (.dmg / .exe / .AppImage)
- App icon, error handling, file path strategy

### Phase 4 — Future ideas (P3)

MIDI, Stream Deck, starter sample library, undo/redo, auto-save, tags.

## Cross-platform Notes

The codebase is cross-platform from the start (uses `path.join`, `CommandOrControl`, etc.), but only macOS is tested during development. Packaging configs for Windows and Linux exist in `package.json` but haven't been exercised yet — see the corresponding `bd` issues in Phase 3.

## License

ISC (placeholder — set as appropriate before distribution).
