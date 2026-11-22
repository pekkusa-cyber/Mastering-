// Filmastringens motor i gränssnittet: rendering i Web Worker och A/B-spelare (original/mastrad, nivåmatchad).
let worker = null;
let job = 0;

/** Renderar i bakgrunden. En ny rendering avbryter en pågående. */
export function renderInWorker(input, params, onProgress) {
  if (worker) worker.terminate();
  worker = new Worker(new URL('./dsp/worker.js', import.meta.url), { type: 'module' });
  const id = ++job;
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.progress != null) onProgress?.(m.progress);
      if (m.result) resolve(m.result);
      if (m.error) reject(new Error(m.error));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Renderingen misslyckades.'));
    worker.postMessage({ id, channels: input.channels, fs: input.fs, params });
  });
}

export function cancelRender() { if (worker) { worker.terminate(); worker = null; job++; } }

/** Två källor som spelar samtidigt; A/B växlar mjukt mellan dem (30 ms). */
export class AbPlayer {
  constructor() { this.ctx = null; this.bufs = {}; this.nodes = null; this.which = 'master'; this.matchGain = 1; this.offset = 0; this.startedAt = 0; this.playing = false; this.onEnd = null; }

  ensure() {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: 48000 });
    return this.ctx;
  }

  setBuffer(key, channels, fs) {
    const ctx = this.ensure();
    const b = ctx.createBuffer(2, channels[0].length, fs);
    b.copyToChannel(channels[0], 0); b.copyToChannel(channels[1] || channels[0], 1);
    this.bufs[key] = b;
    if (this.playing) this.play(this.position());
  }

  get duration() { return this.bufs.orig?.duration || 0; }
  position() { return this.playing ? Math.min(this.duration, this.offset + this.ctx.currentTime - this.startedAt) : this.offset; }

  gains() { return { orig: this.which === 'orig' ? this.matchGain : 0, master: this.which === 'master' ? 1 : 0 }; }

  play(at = this.offset) {
    const ctx = this.ensure();
    ctx.resume();
    this.stopNodes();
    const g = this.gains();
    this.nodes = {};
    for (const key of ['orig', 'master']) {
      const buf = this.bufs[key];
      if (!buf) continue;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gain = ctx.createGain(); gain.gain.value = g[key];
      src.connect(gain).connect(ctx.destination);
      src.start(0, Math.min(at, buf.duration));
      this.nodes[key] = { src, gain };
    }
    const first = this.nodes.orig || this.nodes.master;
    if (first) first.src.onended = () => { if (this.playing && this.position() >= this.duration - 0.05) { this.playing = false; this.offset = 0; this.onEnd?.(); } };
    this.offset = at; this.startedAt = ctx.currentTime; this.playing = true;
  }

  pause() { if (!this.playing) return; this.offset = this.position(); this.stopNodes(); this.playing = false; }
  seek(t) { this.offset = Math.max(0, Math.min(this.duration, t)); if (this.playing) this.play(this.offset); }

  stopNodes() {
    if (!this.nodes) return;
    for (const n of Object.values(this.nodes)) { try { n.src.onended = null; n.src.stop(); } catch { /* */ } }
    this.nodes = null;
  }

  /** which: 'orig' | 'master'. matchGain: originalets förstärkning när nivåmatchat. */
  setAb(which, matchGain = this.matchGain) {
    this.which = which; this.matchGain = matchGain;
    if (!this.nodes) return;
    const g = this.gains(), t = this.ctx.currentTime;
    for (const [key, n] of Object.entries(this.nodes)) {
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setValueAtTime(n.gain.gain.value, t);
      n.gain.gain.linearRampToValueAtTime(g[key], t + 0.03);
    }
  }

  stop() { this.pause(); this.offset = 0; }
}

// ---- Direktlyssning (AudioWorklet) ----
import workletUrl from './dsp/worklet.js?worker&url';

/**
 * Spelar originalet genom mastringskedjan i realtid – ändringar hörs direkt. Faller tillbaka på AbPlayer
 * (renderade buffertar) om webbläsaren saknar AudioWorklet.
 */
export class RealtimePlayer {
  constructor() { this.ctx = null; this.node = null; this.buf = null; this.src = null; this.offset = 0; this.startedAt = 0; this.playing = false; this.ready = null; this.onEnd = null; this.params = null; this.drive = 0; this.which = 'master'; this.matchGain = 1; this.auto = false; this.mon = {}; this.loop = null; this.onMeter = null; }
  static supported() { return typeof AudioWorkletNode !== 'undefined'; }
  /** Lyssningshjälp i spelaren (påverkar aldrig exporten): { listen: {lo,hi,mode}|null, mono, sim, delta }. */
  setMonitor(m) { this.mon = { ...this.mon, ...m }; this.node?.port.postMessage({ type: 'monitor', ...this.mon }); }
  /** Loopa [a, b] sekunder (null = av). */
  setLoop(loop) {
    this.loop = loop && loop[1] - loop[0] > 0.5 ? [Math.max(0, loop[0]), Math.min(this.duration, loop[1])] : null;
    if (this.playing) this.play(this.loop ? Math.min(Math.max(this.position(), this.loop[0]), this.loop[1] - 0.05) : this.position());
  }

  async ensure() {
    if (!this.ready) {
      if (!this.ctx) this.ctx = new AudioContext({ sampleRate: 48000 });
      this.ready = this.ctx.audioWorklet.addModule(workletUrl).then(() => {
        this.node = new AudioWorkletNode(this.ctx, 'masterlab-master', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        this.node.connect(this.ctx.destination);
        this.node.port.onmessage = (e) => { if (e.data?.type === 'meter') this.onMeter?.(e.data); };
        if (this.params) this.setParams(this.params, this.drive);
        this.setAb(this.which, this.matchGain, this.auto);
        this.setMonitor({});
      });
    }
    await this.ready;
    return this.ctx;
  }

  setBuffer(channels, fs) {
    const ctx = this.ctx || new AudioContext({ sampleRate: 48000 });
    this.ctx = ctx;
    const b = ctx.createBuffer(2, channels[0].length, fs);
    b.copyToChannel(channels[0], 0); b.copyToChannel(channels[1] || channels[0], 1);
    this.buf = b;
  }

  setParams(params, drive) {
    this.params = params; this.drive = drive;
    this.node?.port.postMessage({ type: 'params', params, drive });
  }

  setAb(which, matchGain = this.matchGain, auto = this.auto) {
    this.which = which; this.matchGain = matchGain; this.auto = auto;
    this.node?.port.postMessage({ type: 'ab', which, matchGain, auto });
  }

  get duration() { return this.buf?.duration || 0; }
  position() {
    if (!this.playing) return this.offset;
    const t = this.offset + this.ctx.currentTime - this.startedAt;
    if (this.loop && t >= this.loop[1]) { const [a, b] = this.loop; return a + ((t - a) % (b - a)); }
    return Math.min(this.duration, t);
  }

  async play(at = this.offset) {
    await this.ensure();
    await this.ctx.resume();
    this.stopSrc();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buf;
    if (this.loop) { src.loop = true; src.loopStart = this.loop[0]; src.loopEnd = this.loop[1]; }
    src.connect(this.node);
    src.start(0, Math.min(at, this.duration));
    src.onended = () => { if (this.playing && this.position() >= this.duration - 0.05) { this.playing = false; this.offset = 0; this.onEnd?.(); } };
    this.src = src; this.offset = at; this.startedAt = this.ctx.currentTime; this.playing = true;
  }

  pause() { if (!this.playing) return; this.offset = this.position(); this.stopSrc(); this.playing = false; }
  seek(t) { this.offset = Math.max(0, Math.min(this.duration, t)); if (this.playing) this.play(this.offset); }
  stopSrc() { if (this.src) { try { this.src.onended = null; this.src.stop(); } catch { /* */ } this.src = null; } }
}
