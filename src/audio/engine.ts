import { useStore } from '../state/store';
import type { Project, SoundNodeData, GroupNodeData, RandomPoolNodeData } from '../types';

interface Track {
  gain: GainNode;
  panner: StereoPannerNode;
  source: AudioBufferSourceNode | null;
}

type PlayableData = SoundNodeData | RandomPoolNodeData;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private tracks = new Map<string, Track>();
  private groupGains = new Map<string, GainNode>();
  private bufferCache = new Map<string, AudioBuffer>();
  private loadingFiles = new Set<string>();
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
        (masterNode.data as { volume: number }).volume, ctx.currentTime, 0.05
      );
    }

    // Group gains
    for (const [id] of this.groupGains) {
      if (!project.nodes.find((n) => n.id === id)) {
        this.groupGains.get(id)!.disconnect();
        this.groupGains.delete(id);
      }
    }
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

    // Remove stale tracks
    for (const [id] of this.tracks) {
      if (!project.nodes.find((n) => n.id === id)) {
        this.stopTrack(id);
        const t = this.tracks.get(id)!;
        t.panner.disconnect();
        t.gain.disconnect();
        this.tracks.delete(id);
      }
    }

    // Sound + RandomPool nodes
    for (const node of project.nodes) {
      if (node.type !== 'sound' && node.type !== 'randomPool') continue;
      const data = node.data as PlayableData;

      if (!this.tracks.has(node.id)) {
        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner();
        gain.gain.value = data.volume;
        panner.pan.value = data.pan;
        gain.connect(panner);
        this.tracks.set(node.id, { gain, panner, source: null });
      }

      const track = this.tracks.get(node.id)!;
      track.gain.gain.setTargetAtTime(data.volume, ctx.currentTime, 0.05);
      if (!track.source) track.panner.pan.setTargetAtTime(data.pan, ctx.currentTime, 0.05);

      if (node.type === 'sound') {
        this.reconcileSound(node.id, data as SoundNodeData, project);
      } else {
        this.reconcilePool(node.id, data as RandomPoolNodeData, project);
      }
    }

    // Routing
    const edgeKey = project.edges.map((e) => `${e.source}>${e.target}`).sort().join('|');
    if (edgeKey !== this.lastEdgeKey) {
      this.lastEdgeKey = edgeKey;
      this.recomputeRouting(project);
    }
  }

  private reconcileSound(nodeId: string, data: SoundNodeData, project: Project) {
    const track = this.tracks.get(nodeId)!;

    if (data.fileId && !this.bufferCache.has(data.fileId)) {
      const file = project.library.find((f) => f.id === data.fileId);
      if (file) this.loadBuffer(file.path, data.fileId);
    }
    if (!data.fileId && track.source) {
      this.stopTrack(nodeId);
      return;
    }

    const buffer = data.fileId ? this.bufferCache.get(data.fileId) : null;
    if (data.playing && buffer && !track.source) {
      this.startSource(nodeId, data, buffer);
    } else if (!data.playing && track.source) {
      this.stopTrack(nodeId, data.fadeOut);
    }
  }

  private reconcilePool(nodeId: string, data: RandomPoolNodeData, project: Project) {
    const track = this.tracks.get(nodeId)!;

    // Pre-load all pool files
    for (const fileId of data.fileIds) {
      if (!this.bufferCache.has(fileId)) {
        const file = project.library.find((f) => f.id === fileId);
        if (file) this.loadBuffer(file.path, fileId);
      }
    }

    if (data.playing && !track.source) {
      const cachedIds = data.fileIds.filter((id) => this.bufferCache.has(id));
      if (cachedIds.length > 0) {
        const picked = cachedIds[Math.floor(Math.random() * cachedIds.length)];
        this.startSource(nodeId, data, this.bufferCache.get(picked)!);
      }
    } else if (!data.playing && track.source) {
      this.stopTrack(nodeId, data.fadeOut);
    }
  }

  private async loadBuffer(filePath: string, fileId: string) {
    if (this.loadingFiles.has(fileId) || this.bufferCache.has(fileId)) return;
    this.loadingFiles.add(fileId);
    try {
      const arrayBuffer = await window.audioNodes.readFile(filePath);
      const buffer = await this.ctx_().decodeAudioData(arrayBuffer);
      this.bufferCache.set(fileId, buffer);
      this.reconcile(useStore.getState().project);
    } catch (e) {
      console.error('Audio load failed:', filePath, e);
    } finally {
      this.loadingFiles.delete(fileId);
    }
  }

  private applyDucking(data: PlayableData) {
    if (!data.duckTargets.length || data.duckAmount <= 0) return;
    const ctx = this.ctx_();
    const project = useStore.getState().project;
    for (const groupId of data.duckTargets) {
      const groupGain = this.groupGains.get(groupId);
      if (!groupGain) continue;
      const groupNode = project.nodes.find((n) => n.id === groupId);
      if (!groupNode) continue;
      const targetVol = (groupNode.data as GroupNodeData).volume * (1 - data.duckAmount);
      groupGain.gain.cancelScheduledValues(ctx.currentTime);
      groupGain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.05);
    }
  }

  private releaseDucking(data: PlayableData) {
    if (!data.duckTargets.length || data.duckAmount <= 0) return;
    const ctx = this.ctx_();
    const project = useStore.getState().project;
    for (const groupId of data.duckTargets) {
      const groupGain = this.groupGains.get(groupId);
      if (!groupGain) continue;
      const groupNode = project.nodes.find((n) => n.id === groupId);
      if (!groupNode) continue;
      const fullVol = (groupNode.data as GroupNodeData).volume;
      groupGain.gain.cancelScheduledValues(ctx.currentTime);
      groupGain.gain.setTargetAtTime(fullVol, ctx.currentTime, data.duckRelease / 3);
    }
  }

  crossfade(fromGroupId: string, toGroupId: string, duration: number) {
    const ctx = this.ctx_();
    const fromGain = this.groupGains.get(fromGroupId);
    const toGain = this.groupGains.get(toGroupId);
    if (!fromGain || !toGain) return;

    const project = useStore.getState().project;
    const fromNode = project.nodes.find((n) => n.id === fromGroupId);
    const toNode = project.nodes.find((n) => n.id === toGroupId);
    if (!fromNode || !toNode) return;

    const toVol = (toNode.data as GroupNodeData).volume;
    const fromVol = (fromNode.data as GroupNodeData).volume;

    // Start target group members
    const toMemberIds = project.edges.filter((e) => e.target === toGroupId).map((e) => e.source);
    toMemberIds.forEach((id) => useStore.getState().updateNodeData(id, { playing: true }));

    // Ramp target up, source down
    toGain.gain.cancelScheduledValues(ctx.currentTime);
    toGain.gain.setValueAtTime(0, ctx.currentTime);
    toGain.gain.linearRampToValueAtTime(toVol, ctx.currentTime + duration);

    fromGain.gain.cancelScheduledValues(ctx.currentTime);
    fromGain.gain.setValueAtTime(fromVol, ctx.currentTime);
    fromGain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    // After fade: stop source members, restore its gain for next time
    setTimeout(() => {
      const state = useStore.getState();
      const fromMemberIds = state.project.edges.filter((e) => e.target === fromGroupId).map((e) => e.source);
      fromMemberIds.forEach((id) => state.updateNodeData(id, { playing: false }));
      const updatedFrom = state.project.nodes.find((n) => n.id === fromGroupId);
      if (updatedFrom) {
        fromGain.gain.setValueAtTime((updatedFrom.data as GroupNodeData).volume, this.ctx_().currentTime);
      }
    }, duration * 1000);
  }

  private startSource(nodeId: string, data: PlayableData, buffer: AudioBuffer) {
    const ctx = this.ctx_();
    const track = this.tracks.get(nodeId);
    if (!track) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = data.kind === 'sound' ? data.loop : false;
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
      this.applyDucking(data);
      source.start(0);
      track.source = source;
      source.onended = () => {
        if (track.source !== source) return;
        track.source = null;
        // Use current node data for release (user may have changed settings)
        const current = useStore.getState().project.nodes.find((n) => n.id === nodeId)?.data as PlayableData | undefined;
        if (current) this.releaseDucking(current);
        const project = useStore.getState().project;
        const node = project.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const cur = node.data as PlayableData;
        if (cur.playing && cur.loop && cur.kind === 'randomPool') {
          this.reconcilePool(nodeId, cur, project);
        } else if (!cur.loop) {
          useStore.getState().updateNodeData(nodeId, { playing: false });
        }
      };
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        const node = useStore.getState().project.nodes.find((n) => n.id === nodeId);
        if (node && (node.data as PlayableData).playing && !track.source) launch();
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
