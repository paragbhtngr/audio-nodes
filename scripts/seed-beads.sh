#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# --- Epics ---
E1=$(bd create "Phase 1: MVP — Core graph + audio engine" -t epic -p 0 --silent \
  -d "Get a working node-based mixer: data model, Web Audio engine, first sound node, master out, save/load.")
E2=$(bd create "Phase 2: Live performance features" -t epic -p 1 --silent \
  -d "Features needed during an actual session: random pool, hotkeys, HUD, crossfade, ducking, groups.")
E3=$(bd create "Phase 3: Polish, packaging & distribution" -t epic -p 2 --silent \
  -d "Effects, presets, scenes, performance mode, packaging for macOS/Windows/Linux, icon, error handling.")
E4=$(bd create "Future ideas (post-v1)" -t epic -p 3 --silent \
  -d "MIDI, Stream Deck, sample library, undo/redo, auto-save, tags.")

echo "Epics: $E1 $E2 $E3 $E4"

# --- Phase 1 (P0) ---
bd create "Define core data model in src/types" --parent "$E1" -t task -p 0 --silent \
  -d "Project, AudioFile, Node (sound, group, master), Edge, HotkeyMap, SavedPreset. Pure TS, no React."
bd create "Create Zustand store for project state" --parent "$E1" -t task -p 0 --silent \
  -d "Holds nodes/edges/library/hotkeys. Exposes mutation actions (addNode, updateNode, removeNode, connect, etc.). No audio side effects in the store."
bd create "Build Web Audio engine (reconciler)" --parent "$E1" -t task -p 0 --silent \
  -d "Singleton in src/audio/. Subscribes to store. Reconciles internal Web Audio graph (sources, GainNodes, StereoPanners, filters) to match store. Never restart audio on React re-renders. Exposes play(nodeId), stop(nodeId), setVolume, etc."
bd create "Implement Master Out node" --parent "$E1" -t task -p 0 --silent \
  -d "Implicit, single-instance node connected to AudioContext.destination. Visible on canvas but cannot be deleted."
bd create "Implement SoundNode (file/loop/volume/play+stop)" --parent "$E1" -t task -p 0 --silent \
  -d "First real node. React Flow custom node with: file picker, volume slider, loop toggle, play/stop button. Wires its audio output to next gain in graph."
bd create "Auto-wire new sound nodes to Master Out" --parent "$E1" -t task -p 0 --silent \
  -d "When a SoundNode is created with no outgoing edges, automatically connect it to the Master Out node so it plays by default."
bd create "Audio file library panel + IPC file picker" --parent "$E1" -t task -p 0 --silent \
  -d "Sidebar lists audio files. 'Add files' button opens Electron file dialog via IPC. Files stored in project.library with id/path/displayName."
bd create "Drag audio file from library to canvas" --parent "$E1" -t task -p 0 --silent \
  -d "Drag-and-drop from library panel into React Flow canvas creates a SoundNode pre-bound to that file."
bd create "Save/load project as JSON via Electron dialogs" --parent "$E1" -t task -p 0 --silent \
  -d "IPC channels for showSaveDialog/showOpenDialog. Project serializes to JSON (nodes, edges, library, hotkeys, presets). Round-trip safe."
bd create "Application menu (File: New/Open/Save/Save As/Quit)" --parent "$E1" -t task -p 0 --silent \
  -d "Native menu via Menu.setApplicationMenu. macOS app menu + standard File/Edit/View menus. CommandOrControl shortcuts for cross-platform."
bd create "Inspector/properties panel for selected node" --parent "$E1" -t task -p 1 --silent \
  -d "Right-side panel shows the selected node's properties (volume, loop, fade, etc.) in a more spacious form than the in-node UI."
bd create "Asset path strategy (relative-to-project)" --parent "$E1" -t task -p 1 --silent \
  -d "Decide and implement: store audio file paths relative to the project file so projects move across machines. Resolve to absolute at load time."

# --- Phase 2 (P1) ---
bd create "RandomPool node (pick from multiple files)" --parent "$E2" -t feature -p 1 --silent \
  -d "Node type that holds N audio files and selects one at random per playback. Useful for thunder/wolves/door-slam variation."
bd create "Random-interval playback mode" --parent "$E2" -t feature -p 1 --silent \
  -d "Per-node: instead of looping continuously, fire a one-shot at random intervals between min/max seconds."
bd create "Fade in/out per node" --parent "$E2" -t feature -p 1 --silent \
  -d "Configurable fade-in and fade-out durations on play/stop. Implemented via GainNode.linearRampToValueAtTime."
bd create "Pitch random range per node" --parent "$E2" -t feature -p 1 --silent \
  -d "playbackRate randomized within [min,max] on each play. Adds variation to looped samples."
bd create "Pan + pan random range per node" --parent "$E2" -t feature -p 1 --silent \
  -d "StereoPannerNode with optional randomization per playback for spatial variation."
bd create "Hotkey system (global registration)" --parent "$E2" -t feature -p 1 --silent \
  -d "Register Electron globalShortcut bound to node IDs. Use CommandOrControl. Persist mapping in project file."
bd create "Floating hotkey HUD view" --parent "$E2" -t feature -p 1 --silent \
  -d "Tear-off window (or overlay panel) showing every hotkey + which sound it triggers. Click a hotkey to test-fire."
bd create "GroupNode (container with own output gain)" --parent "$E2" -t feature -p 1 --silent \
  -d "Holds child nodes. Has its own GainNode that all children route through. Can be collapsed in UI."
bd create "Crossfade between GroupNode outputs" --parent "$E2" -t feature -p 1 --silent \
  -d "UI control: fade from Group A to Group B over N seconds. Implemented via GainNode automation on both groups."
bd create "Ducking system (one-shots duck other buses)" --parent "$E2" -t feature -p 1 --silent \
  -d "When a one-shot plays, automatically lower volume of designated 'ambient' buses, then restore. Per-node duck-target config."

# --- Phase 3 (P2) ---
bd create "EffectNode: Reverb (ConvolverNode)" --parent "$E3" -t feature -p 2 --silent
bd create "EffectNode: Lowpass filter (BiquadFilterNode)" --parent "$E3" -t feature -p 2 --silent
bd create "EffectNode: Highpass filter (BiquadFilterNode)" --parent "$E3" -t feature -p 2 --silent
bd create "Save/load reusable presets" --parent "$E3" -t feature -p 2 --silent \
  -d "Export a GroupNode + its children as a reusable preset (e.g., 'Tavern'). Insert into any project."
bd create "Scenes/snapshots" --parent "$E3" -t feature -p 2 --silent \
  -d "Capture which presets/groups are active + their volumes as a 'scene'. One-click recall with crossfade."
bd create "Performance mode view" --parent "$E3" -t feature -p 2 --silent \
  -d "Alternate view: auto-generated control surface (sliders/buttons) from the graph, optimized for live use during a session."
bd create "Orphaned-node visual indicator" --parent "$E3" -t task -p 2 --silent \
  -d "Visually flag nodes that aren't connected (directly or transitively) to Master Out so users notice silent nodes."
bd create "Recently opened projects list" --parent "$E3" -t task -p 2 --silent
bd create "Drag-and-drop audio files from Finder/Explorer" --parent "$E3" -t feature -p 2 --silent
bd create "Display audio file duration in library" --parent "$E3" -t task -p 2 --silent
bd create "Project file versioning + migration" --parent "$E3" -t task -p 2 --silent \
  -d "Add schemaVersion to project JSON. Write migration functions for breaking changes."
bd create "Error handling for missing audio files" --parent "$E3" -t task -p 2 --silent \
  -d "When a project references a missing file, surface a warning and offer 'find replacement' UI."
bd create "Cross-platform packaging: macOS .dmg" --parent "$E3" -t chore -p 2 --silent
bd create "Cross-platform packaging: Windows .exe" --parent "$E3" -t chore -p 2 --silent
bd create "Cross-platform packaging: Linux AppImage" --parent "$E3" -t chore -p 2 --silent
bd create "Application icon design" --parent "$E3" -t chore -p 2 --silent

# --- Phase 4 (P3) ---
bd create "MIDI controller support" --parent "$E4" -t feature -p 3 --silent
bd create "Stream Deck integration" --parent "$E4" -t feature -p 3 --silent
bd create "Ship with starter CC0 audio sample library" --parent "$E4" -t feature -p 3 --silent
bd create "Undo/redo system" --parent "$E4" -t feature -p 3 --silent
bd create "Auto-save with crash recovery" --parent "$E4" -t feature -p 3 --silent
bd create "Tags/categories for audio files in library" --parent "$E4" -t feature -p 3 --silent
bd create "Node search/filter in canvas" --parent "$E4" -t feature -p 3 --silent

echo ""
echo "Done. Summary:"
bd list --json 2>/dev/null | python3 -c "import json,sys; data=json.load(sys.stdin); print(f'Total issues: {len(data)}')" || bd list 2>&1 | tail -5
