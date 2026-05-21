import { useStore } from '../state/store';
import type { Project, SoundNodeData, GroupNodeData } from '../types';

interface Track {
  gain: GainNode;
  panner: StereoPannerNode;
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  loadingForFileId: string | null;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private tracks = new Map<string, Track>();       // sound node id → track
  private groupGains = new Map<string, GainNode>(); // group node id → gain
  private bufferCache = new Map<string, AudioBuffer>();
  private unsub: (() => void) | null = null;
  private lastEdgeKey = '';

  private ctx_(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
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
    this.groupGains.clear();
    this.lastEdgeKey = '';
  }

  private resolveTargetGain(nodeId: string, project: Project): GainNode | null {
    const edge = project.edges.find((e) => e.source === nodeId);
    if (!edge) return null;
    const target = project.nodes.find((n) => n.id === edge.target);
    if (!target) return null;
    if (target.type === 'master') return this.masterGain;
    if (target.type === 'group') return this.groupGains.get(target.id) ?? null;
    return null;
  }

  private recomputeRouting(project: Project) {
    for (const [nodeId, track] of this.tracks) {
      const dest = this.resolveTargetGain(nodeId, project);
      track.panner.disconnect();
      if (dest) track.panner.connect(dest);
    }
    for (const [groupId, groupGain] of this.groupGains) {
      const dest = this.resolveTargetGain(groupId, project);
      groupGain.disconnect();
      if (dest) groupGain.connect(dest);
    }
  }

  private async reconcile(project: Project) {
    const ctx = this.ctx_();

    // Master volume
    const masterNode = project.nodes.find((n) => n.type === 'master');
    if (masterNode && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        (masterNode.data as { volume: number }).volume,
        ctx.currentTime, 0.05
      );
    }

    // Remove group gains for deleted group nodes
    for (const [id] of this.groupGains) {
      if (!project.nodes.find((n) => n.id === id)) {
        this.groupGains.get(id)!.disconnect();
        this.groupGains.delete(id);
      }
    }

    // Create / update group gains
    for (const node of project.nodes) {
      if (node.type !== 'group') continue;
      const data = node.data as GroupNodeData;
      if (!this.groupGains.has(node.id)) {
        const g = ctx.createGain();
        g.gain.value = data.volume;
        this.groupGains.set(node.id, g);
      }
      this.groupGains.get(node.id)!.gain.setTargetAtTime(data.volume, ctx.currentTime, 0.05);
    }

    // Remove tracks for deleted sound nodes
    for (const [id] of this.tracks) {
      if (!project.nodes.find((n) => n.id === id)) {
        this.stopTrack(id);
        const t = this.tracks.get(id)!;
        t.panner.disconnect();
        t.gain.disconnect();
        this.tracks.delete(id);
      }
    }

    // Create / update sound tracks
    for (const node of project.nodes) {
      if (node.type !== 'sound') continue;
      const data = node.data as SoundNodeData;

      if (!this.tracks.has(node.id)) {
        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner();
        gain.gain.value = data.volume;
        panner.pan.value = data.pan;
        gain.connect(panner);
        // panner output wired by recomputeRouting below
        this.tracks.set(node.id, { gain, panner, source: null, buffer: null, loadingForFileId: null });
      }

      const track = this.tracks.get(node.id)!;
      track.gain.gain.setTargetAtTime(data.volume, ctx.currentTime, 0.05);
      if (!track.source) {
        track.panner.pan.setTargetAtTime(data.pan, ctx.currentTime, 0.05);
      }

      // Buffer loading
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

      // Play / stop
      if (data.playing && track.buffer && !track.source) {
        this.startSource(node.id, data);
      } else if (!data.playing && track.source) {
        this.stopTrack(node.id, data.fadeOut);
      }
    }

    // Recompute audio routing when edges change
    const edgeKey = project.edges.map((e) => `${e.source}>${e.target}`).sort().join('|');
    if (edgeKey !== this.lastEdgeKey) {
      this.lastEdgeKey = edgeKey;
      this.recomputeRouting(project);
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
        this.startSource(nodeId, node.data as SoundNodeData);
      }
    } catch (e) {
      console.error('Audio load failed:', filePath, e);
    }
  }

  private startSource(nodeId: string, data: SoundNodeData) {
    const ctx = this.ctx_();
    const track = this.tracks.get(nodeId);
    if (!track?.buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.loop = data.loop;
    source.playbackRate.value = data.pitchMin === data.pitchMax
      ? data.pitchMin
      : data.pitchMin + Math.random() * (data.pitchMax - data.pitchMin);

    const pan = data.panRandom > 0
      ? data.pan + (Math.random() * 2 - 1) * data.panRandom
      : data.pan;
    track.panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime);

    source.connect(track.gain);

    track.gain.gain.cancelScheduledValues(ctx.currentTime);
    if (data.fadeIn > 0) {
      track.gain.gain.setValueAtTime(0, ctx.currentTime);
      track.gain.gain.linearRampToValueAtTime(data.volume, ctx.currentTime + data.fadeIn);
    } else {
      track.gain.gain.setValueAtTime(data.volume, ctx.currentTime);
    }

    const launch = () => {
      source.start(0);
      track.source = source;
      source.onended = () => {
        if (track.source !== source) return;
        track.source = null;
        if (!data.loop) useStore.getState().updateNodeData(nodeId, { playing: false });
      };
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        const node = useStore.getState().project.nodes.find((n) => n.id === nodeId);
        if (node && (node.data as SoundNodeData).playing && !track.source) launch();
      });
    } else {
      launch();
    }
  }

  private stopTrack(nodeId: string, fadeOut = 0) {
    const track = this.tracks.get(nodeId);
    if (!track?.source) return;
    const source = track.source;
    const ctx = this.ctx_();
    if (fadeOut > 0) {
      track.gain.gain.setTargetAtTime(0, ctx.currentTime, fadeOut / 3);
      source.stop(ctx.currentTime + fadeOut);
    } else {
      try { source.stop(0); } catch { /* already stopped */ }
    }
    track.source = null;
  }
}

export const audioEngine = new AudioEngine();
