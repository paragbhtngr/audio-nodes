import { useStore } from '../state/store';
import type { Project, SoundNodeData } from '../types';

interface Track {
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  loadingForFileId: string | null;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private tracks = new Map<string, Track>();
  private bufferCache = new Map<string, AudioBuffer>();
  private unsub: (() => void) | null = null;

  private ctx_(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  resume() {
    this.ctx?.resume();
  }

  init() {
    this.unsub = useStore.subscribe((state) => this.reconcile(state.project));
    this.reconcile(useStore.getState().project);
  }

  destroy() {
    this.unsub?.();
    this.unsub = null;
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.tracks.clear();
  }

  private async reconcile(project: Project) {
    const ctx = this.ctx_();

    const masterNode = project.nodes.find((n) => n.type === 'master');
    if (masterNode && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        (masterNode.data as { volume: number }).volume,
        ctx.currentTime,
        0.05
      );
    }

    // remove tracks for nodes no longer in the project
    for (const [id] of this.tracks) {
      if (!project.nodes.find((n) => n.id === id)) {
        this.stopTrack(id);
        this.tracks.get(id)?.gain.disconnect();
        this.tracks.delete(id);
      }
    }

    for (const node of project.nodes) {
      if (node.type !== 'sound') continue;
      const data = node.data as SoundNodeData;

      if (!this.tracks.has(node.id)) {
        const gain = ctx.createGain();
        gain.gain.value = data.volume;
        gain.connect(this.masterGain!);
        this.tracks.set(node.id, { gain, source: null, buffer: null, loadingForFileId: null });
      }

      const track = this.tracks.get(node.id)!;
      track.gain.gain.setTargetAtTime(data.volume, ctx.currentTime, 0.05);

      if (data.fileId && track.loadingForFileId !== data.fileId) {
        const cached = this.bufferCache.get(data.fileId);
        if (cached) {
          track.buffer = cached;
          track.loadingForFileId = data.fileId;
        } else {
          const file = project.library.find((f) => f.id === data.fileId);
          if (file) {
            track.loadingForFileId = data.fileId;
            this.loadBuffer(file.path, data.fileId, node.id);
          }
        }
      }

      if (!data.fileId && track.source) {
        this.stopTrack(node.id);
        track.buffer = null;
        track.loadingForFileId = null;
      }

      if (data.playing && track.buffer && !track.source) {
        this.startSource(node.id, data.loop);
      } else if (!data.playing && track.source) {
        this.stopTrack(node.id);
      }
    }
  }

  private async loadBuffer(filePath: string, fileId: string, nodeId: string) {
    try {
      const arrayBuffer = await window.audioNodes.readFile(filePath);
      const buffer = await this.ctx_().decodeAudioData(arrayBuffer);
      this.bufferCache.set(fileId, buffer);

      const track = this.tracks.get(nodeId);
      if (!track || track.loadingForFileId !== fileId) return;
      track.buffer = buffer;

      const { project } = useStore.getState();
      const node = project.nodes.find((n) => n.id === nodeId);
      if (node && (node.data as SoundNodeData).playing && !track.source) {
        this.startSource(nodeId, (node.data as SoundNodeData).loop);
      }
    } catch (e) {
      console.error('Audio load failed:', filePath, e);
    }
  }

  private startSource(nodeId: string, loop: boolean) {
    const ctx = this.ctx_();
    const track = this.tracks.get(nodeId);
    if (!track?.buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.loop = loop;
    source.connect(track.gain);
    source.start(0);
    track.source = source;

    source.onended = () => {
      if (track.source !== source) return;
      track.source = null;
      if (!loop) {
        useStore.getState().updateNodeData(nodeId, { playing: false });
      }
    };
  }

  private stopTrack(nodeId: string) {
    const track = this.tracks.get(nodeId);
    if (!track?.source) return;
    try { track.source.stop(0); } catch { /* already stopped */ }
    track.source = null;
  }
}

export const audioEngine = new AudioEngine();
