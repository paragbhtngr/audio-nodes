import { useStore } from '../state/store';
import type { Project, SoundNodeData, GroupNodeData, RandomPoolNodeData, EffectNodeData, Scene } from '../types';

interface Track {
  gain: GainNode;
  panner: StereoPannerNode;
  source: AudioBufferSourceNode | null;
}

interface EffectProcessor {
  input: GainNode;
  output: GainNode;
  effect: BiquadFilterNode | ConvolverNode;
  dryGain?: GainNode;
  wetGain?: GainNode;
  lastDecay?: number;
}

type PlayableData = SoundNodeData | RandomPoolNodeData;

function createReverbImpulse(ctx: AudioContext, decay: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * Math.max(0.1, Math.min(decay, 5)));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay * 2);
  }
  return buf;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private tracks = new Map<string, Track>();
  private groupGains = new Map<string, GainNode>();
  private effectProcessors = new Map<string, EffectProcessor>();
  private bufferCache = new Map<string, AudioBuffer>();
  private loadingFiles = new Set<string>();
  private crossfadingGroups = new Set<string>();
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
    this.effectProcessors.clear();
    this.crossfadingGroups.clear();
    this.lastEdgeKey = '';
  }

  private resolveTargetGain(nodeId: string, project: Project): GainNode | null {
    const edge = project.edges.find((e) => e.source === nodeId);
    if (!edge) return null;
    const target = project.nodes.find((n) => n.id === edge.target);
    if (!target) return null;
    if (target.type === 'master') return this.masterGain;
    if (target.type === 'group') return this.groupGains.get(target.id) ?? null;
    if (target.type === 'effect') return this.effectProcessors.get(target.id)?.input ?? null;
    return null;
  }

  private recomputeRouting(project: Project) {
    for (const [id, track] of this.tracks) {
      const dest = this.resolveTargetGain(id, project);
      track.panner.disconnect();
      if (dest) track.panner.connect(dest);
    }
    for (const [id, groupGain] of this.groupGains) {
      const dest = this.resolveTargetGain(id, project);
      groupGain.disconnect();
      if (dest) groupGain.connect(dest);
    }
    for (const [id, ep] of this.effectProcessors) {
      const dest = this.resolveTargetGain(id, project);
      ep.output.disconnect();
      if (dest) ep.output.connect(dest);
    }
  }

  private async reconcile(project: Project) {
    const ctx = this.ctx_();

    // Master
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
      if (!this.crossfadingGroups.has(node.id)) {
        this.groupGains.get(node.id)!.gain.setTargetAtTime(data.volume, ctx.currentTime, 0.05);
      }
    }

    // Effect processors
    for (const [id] of this.effectProcessors) {
      if (!project.nodes.find((n) => n.id === id)) {
        const ep = this.effectProcessors.get(id)!;
        ep.input.disconnect(); ep.output.disconnect();
        this.effectProcessors.delete(id);
      }
    }
    for (const node of project.nodes) {
      if (node.type !== 'effect') continue;
      const data = node.data as EffectNodeData;
      if (!this.effectProcessors.has(node.id)) {
        this.createEffectProcessor(node.id, data, ctx);
      }
      this.updateEffectProcessor(node.id, data, ctx);
    }

    // Sound tracks
    for (const [id] of this.tracks) {
      if (!project.nodes.find((n) => n.id === id)) {
        this.stopTrack(id);
        const t = this.tracks.get(id)!;
        t.panner.disconnect(); t.gain.disconnect();
        this.tracks.delete(id);
      }
    }
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
      if (node.type === 'sound') this.reconcileSound(node.id, data as SoundNodeData, project);
      else this.reconcilePool(node.id, data as RandomPoolNodeData, project);
    }

    // Routing
    const edgeKey = project.edges.map((e) => `${e.source}>${e.target}`).sort().join('|');
    if (edgeKey !== this.lastEdgeKey) {
      this.lastEdgeKey = edgeKey;
      this.recomputeRouting(project);
    }
  }

  private createEffectProcessor(nodeId: string, data: EffectNodeData, ctx: AudioContext) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    if (data.effectType === 'reverb') {
      const convolver = ctx.createConvolver();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      dryGain.gain.value = 1 - data.wet;
      wetGain.gain.value = data.wet;
      input.connect(dryGain); dryGain.connect(output);
      input.connect(convolver); convolver.connect(wetGain); wetGain.connect(output);
      convolver.buffer = createReverbImpulse(ctx, data.decay);
      this.effectProcessors.set(nodeId, { input, output, effect: convolver, dryGain, wetGain, lastDecay: data.decay });
    } else {
      const filter = ctx.createBiquadFilter();
      filter.type = data.effectType;
      filter.frequency.value = data.frequency;
      filter.Q.value = data.q;
      input.connect(filter); filter.connect(output);
      this.effectProcessors.set(nodeId, { input, output, effect: filter });
    }
  }

  private updateEffectProcessor(nodeId: string, data: EffectNodeData, ctx: AudioContext) {
    const ep = this.effectProcessors.get(nodeId);
    if (!ep) return;
    if (data.effectType === 'reverb') {
      ep.dryGain?.gain.setTargetAtTime(1 - data.wet, ctx.currentTime, 0.05);
      ep.wetGain?.gain.setTargetAtTime(data.wet, ctx.currentTime, 0.05);
      if (ep.lastDecay !== data.decay) {
        ep.lastDecay = data.decay;
        (ep.effect as ConvolverNode).buffer = createReverbImpulse(ctx, data.decay);
      }
    } else {
      const f = ep.effect as BiquadFilterNode;
      f.frequency.setTargetAtTime(data.frequency, ctx.currentTime, 0.05);
      f.Q.setTargetAtTime(data.q, ctx.currentTime, 0.05);
    }
  }

  private reconcileSound(nodeId: string, data: SoundNodeData, project: Project) {
    const track = this.tracks.get(nodeId)!;
    if (data.fileId && !this.bufferCache.has(data.fileId)) {
      const file = project.library.find((f) => f.id === data.fileId);
      if (file) this.loadBuffer(file.path, data.fileId);
    }
    if (!data.fileId && track.source) { this.stopTrack(nodeId); return; }
    const buffer = data.fileId ? this.bufferCache.get(data.fileId) : null;
    if (data.playing && buffer && !track.source) this.startSource(nodeId, data, buffer);
    else if (!data.playing && track.source) this.stopTrack(nodeId, data.fadeOut);
  }

  private reconcilePool(nodeId: string, data: RandomPoolNodeData, project: Project) {
    const track = this.tracks.get(nodeId)!;
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
      useStore.getState().updateLibraryFileDuration(fileId, buffer.duration);
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
      const g = this.groupGains.get(groupId);
      if (!g) continue;
      const node = project.nodes.find((n) => n.id === groupId);
      if (!node) continue;
      const targetVol = (node.data as GroupNodeData).volume * (1 - data.duckAmount);
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.05);
    }
  }

  private releaseDucking(data: PlayableData) {
    if (!data.duckTargets.length || data.duckAmount <= 0) return;
    const ctx = this.ctx_();
    const project = useStore.getState().project;
    for (const groupId of data.duckTargets) {
      const g = this.groupGains.get(groupId);
      if (!g) continue;
      const node = project.nodes.find((n) => n.id === groupId);
      if (!node) continue;
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setTargetAtTime((node.data as GroupNodeData).volume, ctx.currentTime, data.duckRelease / 3);
    }
  }

  crossfade(fromGroupId: string, toGroupId: string, duration: number) {
    const ctx = this.ctx_();
    const fromGain = this.groupGains.get(fromGroupId);
    const toGain = this.groupGains.get(toGroupId);
    if (!fromGain || !toGain) return;
    const project = useStore.getState().project;
    const toNode = project.nodes.find((n) => n.id === toGroupId);
    const fromNode = project.nodes.find((n) => n.id === fromGroupId);
    if (!toNode || !fromNode) return;

    this.crossfadingGroups.add(fromGroupId);
    this.crossfadingGroups.add(toGroupId);

    project.edges.filter((e) => e.target === toGroupId)
      .forEach((e) => useStore.getState().updateNodeData(e.source, { playing: true }));

    toGain.gain.cancelScheduledValues(ctx.currentTime);
    toGain.gain.setValueAtTime(0, ctx.currentTime);
    toGain.gain.linearRampToValueAtTime((toNode.data as GroupNodeData).volume, ctx.currentTime + duration);

    fromGain.gain.cancelScheduledValues(ctx.currentTime);
    fromGain.gain.setValueAtTime((fromNode.data as GroupNodeData).volume, ctx.currentTime);
    fromGain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    setTimeout(() => {
      const state = useStore.getState();
      state.project.edges.filter((e) => e.target === fromGroupId)
        .forEach((e) => state.updateNodeData(e.source, { playing: false }));
      const updated = state.project.nodes.find((n) => n.id === fromGroupId);
      if (updated) fromGain.gain.setValueAtTime((updated.data as GroupNodeData).volume, this.ctx_().currentTime);
      this.crossfadingGroups.delete(fromGroupId);
      this.crossfadingGroups.delete(toGroupId);
    }, duration * 1000);
  }

  recallScene(scene: Scene, duration: number) {
    const ctx = this.ctx_();
    const project = useStore.getState().project;

    for (const gs of scene.groupStates) {
      const groupGain = this.groupGains.get(gs.groupId);
      if (!groupGain) continue;
      const node = project.nodes.find((n) => n.id === gs.groupId);
      if (!node) continue;

      this.crossfadingGroups.add(gs.groupId);
      const memberIds = project.edges.filter((e) => e.target === gs.groupId).map((e) => e.source);

      if (gs.active) {
        memberIds.forEach((id) => useStore.getState().updateNodeData(id, { playing: true }));
        groupGain.gain.cancelScheduledValues(ctx.currentTime);
        groupGain.gain.setValueAtTime(groupGain.gain.value, ctx.currentTime);
        groupGain.gain.linearRampToValueAtTime(gs.volume, ctx.currentTime + duration);
        setTimeout(() => {
          this.crossfadingGroups.delete(gs.groupId);
          useStore.getState().updateNodeData(gs.groupId, { volume: gs.volume });
        }, duration * 1000);
      } else {
        const fromVol = groupGain.gain.value;
        groupGain.gain.cancelScheduledValues(ctx.currentTime);
        groupGain.gain.setValueAtTime(fromVol, ctx.currentTime);
        groupGain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
        setTimeout(() => {
          memberIds.forEach((id) => useStore.getState().updateNodeData(id, { playing: false }));
          groupGain.gain.setValueAtTime(gs.volume, this.ctx_().currentTime);
          this.crossfadingGroups.delete(gs.groupId);
          useStore.getState().updateNodeData(gs.groupId, { volume: gs.volume });
        }, duration * 1000);
      }
    }
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

    const pan = data.panRandom > 0 ? data.pan + (Math.random() * 2 - 1) * data.panRandom : data.pan;
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
        const cur = useStore.getState().project.nodes.find((n) => n.id === nodeId)?.data as PlayableData | undefined;
        if (cur) this.releaseDucking(cur);
        const project = useStore.getState().project;
        const node = project.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const d = node.data as PlayableData;
        if (d.playing && d.loop && d.kind === 'randomPool') this.reconcilePool(nodeId, d, project);
        else if (!d.loop) useStore.getState().updateNodeData(nodeId, { playing: false });
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
