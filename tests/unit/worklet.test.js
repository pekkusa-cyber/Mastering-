// A/B i Fil: A ska vara det orörda originalet (bara fördröjt som limitern och ev. nivåmatchat), B den mastrade kedjan.
// Körs på riktiga AudioWorklet-processorn med minimal Web Audio-attrapp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveToFile } from '../../src/master.js';
import { BUILTIN_PRESETS } from '../../src/chain.js';

let Proc;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = {}; } };
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
function run(which, matchGain, params, [L, R]) {
  const p = new Proc();
  p.onMessage({ type: 'params', params, drive: 0 });
  p.onMessage({ type: 'ab', which, matchGain });
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
