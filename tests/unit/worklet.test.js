// A/B i Fil: A ska vara det orörda originalet (bara fördröjt som limitern och ev. nivåmatchat), B den mastrade kedjan.
// Körs på riktiga AudioWorklet-processorn med minimal Web Audio-attrapp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveToFile } from '../../src/master.js';
import { BUILTIN_PRESETS } from '../../src/chain.js';

let Proc;
const posted = [];
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: (m) => posted.push(m) }; } };
globalThis.registerProcessor = (_, c) => { Proc = c; };
globalThis.sampleRate = 48000;
await import('../../src/dsp/worklet.js');

const FS = 48000;
function song(sec) {
  const n = sec * FS, L = new Float32Array(n), R = new Float32Array(n);
  let s = 5, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0; const w = s / 2 ** 31 - 1;
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
    const t = (i % (FS / 2)) / FS;
    const v = (b0 + b1 + b2 + w * 0.1848) * 0.04 + Math.exp(-t * 25) * Math.sin(2 * Math.PI * 60 * t) * 0.5 + 0.05 * Math.sin((2 * Math.PI * 4000 * i) / FS);
    L[i] = v; R[i] = v * 0.9;
  }
  return [L, R];
}
/** Kör processorn och samlar utsignalen (vänster kanal) efter en uppvärmning. */
function run(which, matchGain, params, [L, R], extra = {}) {
  const p = new Proc();
  p.onMessage({ type: 'params', params, drive: 0 });
  p.onMessage({ type: 'ab', which, matchGain, auto: !!extra.auto });
  if (extra.monitor) p.onMessage({ type: 'monitor', ...extra.monitor });
  const out = new Float32Array(L.length);
  for (let s = 0; s + 128 <= L.length; s += 128) {
    const o = [new Float32Array(128), new Float32Array(128)];
    p.process([[L.subarray(s, s + 128), R.subarray(s, s + 128)]], [o]);
    out.set(o[0], s);
  }
  return { out, latency: p.post.latency };
}
const rms = (a, from = 0) => Math.sqrt(a.subarray(from).reduce((x, v) => x + v * v, 0) / (a.length - from));

test('A är det orörda originalet (fördröjt som limitern), B är den mastrade kedjan', () => {
  const src = song(4);
  const params = liveToFile(BUILTIN_PRESETS.find((p) => p.id === 'suno-fix').params);
  const A = run('orig', 1, params, src), B = run('master', 1, params, src);
  // A: exakt originalet, förskjutet med limiterns latens
  const lag = A.latency;
  let maxDiff = 0;
  for (let i = FS; i < src[0].length; i++) maxDiff = Math.max(maxDiff, Math.abs(A.out[i] - src[0][i - lag]));
  assert.ok(maxDiff < 1e-6, `A avviker från originalet med ${maxDiff}`);
  // B: tydligt annorlunda än originalet (kedjan gör något hörbart)
  let diffE = 0, origE = 0;
  for (let i = FS; i < src[0].length; i++) { const d = B.out[i] - src[0][i - lag]; diffE += d * d; origE += src[0][i - lag] ** 2; }
  assert.ok(10 * Math.log10(diffE / origE) > -20, 'B skiljer sig för lite från A');
});

test('Lika nivå: matchGain skalar bara A', () => {
  const src = song(3);
  const params = liveToFile(BUILTIN_PRESETS[1].params);
  const a1 = run('orig', 1, params, src).out, a2 = run('orig', 2, params, src).out;
  assert.ok(Math.abs(rms(a2, FS) / rms(a1, FS) - 2) < 1e-3);
});

// ---- Lyssningshjälpen (påverkar aldrig exporten) ----
import { Biquad, coeffs } from '../../src/dsp/biquad.js';
const bandEnergy = (x, f, from) => { // energi runt f (bandpass, Q 2)
  const y = new Float32Array(x.subarray(from)); const b = new Biquad(coeffs('peaking', FS, f, 2, 0), 1);
  const w = (2 * Math.PI * f) / FS, al = Math.sin(w) / 4, a0 = 1 + al;
  b.set({ b0: al / a0, b1: 0, b2: -al / a0, a1: (-2 * Math.cos(w)) / a0, a2: (1 - al) / a0 }); b.run(y, 0);
  return y.reduce((a, v) => a + v * v, 0);
};
function tones() { const n = 2 * FS, L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = 0.2 * Math.sin(2 * Math.PI * 100 * i / FS) + 0.2 * Math.sin(2 * Math.PI * 2000 * i / FS); return [L, new Float32Array(L)]; }

test('solo på ett område släpper bara fram det, mute tar bort det', () => {
  const src = tones(), params = liveToFile({});
  const all = run('master', 1, params, src).out;
  const solo = run('master', 1, params, src, { monitor: { listen: { lo: 1000, hi: 4000, mode: 'solo' } } }).out;
  const mute = run('master', 1, params, src, { monitor: { listen: { lo: 1000, hi: 4000, mode: 'mute' } } }).out;
  const r = (x, f) => 10 * Math.log10(bandEnergy(x, f, FS) / bandEnergy(all, f, FS));
  assert.ok(r(solo, 2000) > -1.5 && r(solo, 100) < -30, `solo: 2k ${r(solo, 2000).toFixed(1)} dB, 100 Hz ${r(solo, 100).toFixed(1)} dB`);
  assert.ok(r(mute, 100) > -1.5 && r(mute, 2000) < -30, `mute: 100 Hz ${r(mute, 100).toFixed(1)} dB, 2k ${r(mute, 2000).toFixed(1)} dB`);
});

test('mono, lyssna som mobil, Δ på de-essern och automatisk Lika nivå', () => {
  const [L] = song(3), R = new Float32Array(L.length).map((_, i) => -L[i]); // helt ur fas: försvinner i mono
  const params = liveToFile({});
  const mono = run('master', 1, params, [L, R], { monitor: { mono: true } }).out;
  assert.ok(rms(mono, FS) < 1e-3, 'mono av motfas ska bli tyst');
  const src = tones();
  const mob = run('master', 1, params, src, { monitor: { sim: 'mobil' } }).out, nor = run('master', 1, params, src).out;
  assert.ok(bandEnergy(mob, 100, FS) < bandEnergy(nor, 100, FS) / 100, 'mobil: ingen bas');
  // Δ: med de-esser av blir det som tas bort tyst
  const off = run('master', 1, liveToFile({}, { deEss: 0 }), song(2), { monitor: { delta: 'deEss' } }).out;
  assert.ok(rms(off, FS) < 1e-6);
  // automatisk Lika nivå: A (original) får samma K-vägda nivå som B
  const quiet = song(6).map((c) => c.map((v) => v * 0.25));
  posted.length = 0;
  const loud = liveToFile({}, { output: -6, deEss: 0, glitter: 0, clip: 0, glue: { threshold: -16, ratio: 1, attack: 30, release: 200, makeup: 0 } });
  run('orig', 1, loud, quiet, { auto: true });
  const m = posted.filter((x) => x.type === 'meter').at(-1);
  assert.ok(m && m.matchGain > 0.45 && m.matchGain < 0.56, `matchGain ${m?.matchGain}`); // B är 6 dB lägre ⇒ A sänks ≈ ×0,5
  assert.ok(Array.isArray(m.gr.mbc) && Number.isFinite(m.gr.limiter));
});
