// Nivåanpassning in (gain staging): en preset ska låta likadant oavsett om låten kommer in tyst eller hög.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMaster } from '../../src/dsp/render.js';
import { liveToFile, inputStage } from '../../src/master.js';
import { BUILTIN_PRESETS } from '../../src/chain.js';

const FS = 44100;
function song(gain) {
  const n = FS * 6, L = new Float32Array(n), R = new Float32Array(n);
  let s = 3;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const kick = Math.exp(-((i % (FS / 2)) / FS) * 20) * Math.sin(2 * Math.PI * 55 * i / FS) * 0.5;
    const v = kick + (s / 2 ** 31 - 1) * 0.08 + 0.05 * Math.sin(2 * Math.PI * 440 * i / FS);
    L[i] = v * gain; R[i] = v * gain;
  }
  return [L, R];
}
const rms = (x, a, b) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / (b - a)); };

test('samma preset ger samma ljud från en tyst och en hög version av låten', () => {
  const p = liveToFile(BUILTIN_PRESETS.find((x) => x.id === 'tat-pop').params, { target: 'streaming' }, 'tat-pop');
  const q = renderMaster({ channels: song(0.5), fs: FS }, p), l = renderMaster({ channels: song(1.5), fs: FS }, p); // −24 resp. −14,6 LUFS in
  assert.ok(q.gr.mbc[0] > 0.5, 'kompressorn arbetar');
  assert.ok(Math.abs(q.gr.mbc[0] - l.gr.mbc[0]) < 0.5, `nedtryckning ${q.gr.mbc[0].toFixed(2)} vs ${l.gr.mbc[0].toFixed(2)} dB`);
  const a = q.channels[0], b = l.channels[0], s0 = FS, s1 = FS * 5;
  let d = 0; for (let i = s0; i < s1; i++) d += (a[i] - b[i]) ** 2;
  const diffDb = 20 * Math.log10(Math.sqrt(d / (s1 - s0)) / rms(a, s0, s1));
  assert.ok(diffDb < -30, `skillnad ${diffDb.toFixed(1)} dB`);
});

test('nivåanpassningen: −14 LUFS-referens, begränsad till ±12 dB, av med målet Egen', () => {
  assert.equal(inputStage({ inLufs: -20, target: 'streaming' }), 6);
  assert.equal(inputStage({ inLufs: -8, target: 'streaming' }), -6);
  assert.equal(inputStage({ inLufs: -40, target: 'streaming' }), 12);
  assert.equal(inputStage({ inLufs: -20, target: 'egen' }), 0);
  assert.equal(inputStage({ inLufs: null, target: 'streaming' }), 0);
});

test('presettens In följer med till Fil', () => {
  const id = 'edm-hogt', p = BUILTIN_PRESETS.find((x) => x.id === id);
  assert.equal(liveToFile(p.params, {}, id).trim, p.params.inputGain);
});

test('bas i mono: sidosignalen under gränsen tas bort, ovanför lämnas den', async () => {
  const { PreChain } = await import('../../src/dsp/chain.js');
  const { sanitizeFile, fileNeutral } = await import('../../src/master.js');
  const n = FS * 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { const lo = Math.sin(2 * Math.PI * 40 * i / FS) * 0.3, hi = Math.sin(2 * Math.PI * 2000 * i / FS) * 0.3; L[i] = lo + hi; R[i] = -lo - hi; } // helt i sidan
  const c = new PreChain(FS, sanitizeFile({ ...fileNeutral(), monoBass: 120 }));
  for (let s = 0; s < n; s += 1024) { const e = Math.min(n, s + 1024); c.run(L.subarray(s, e), R.subarray(s, e), e - s); }
  // Sidan (L−R)/2 efter: 40 Hz ska vara borta (>20 dB), 2 kHz kvar
  const side = Float64Array.from({ length: n }, (_, i) => (L[i] - R[i]) / 2);
  const tone = (f) => { let re = 0, im = 0; for (let i = FS; i < n; i++) { re += side[i] * Math.cos(2 * Math.PI * f * i / FS); im += side[i] * Math.sin(2 * Math.PI * f * i / FS); } return 2 * Math.hypot(re, im) / (n - FS); };
  assert.ok(20 * Math.log10(tone(40) / 0.3) < -20, `40 Hz i sidan: ${(20 * Math.log10(tone(40) / 0.3)).toFixed(1)} dB`);
  assert.ok(Math.abs(20 * Math.log10(tone(2000) / 0.3)) < 0.5, '2 kHz orört');
});

test('renderingen ger både största och genomsnittlig nedtryckning (snittet är mindre än toppen)', () => {
  const p = liveToFile(BUILTIN_PRESETS.find((x) => x.id === 'gym').params, { target: 'streaming' }, 'gym');
  const r = renderMaster({ channels: song(1), fs: FS }, p);
  assert.ok(r.gr.avg, 'snitt finns');
  for (let b = 0; b < 4; b++) assert.ok(r.gr.avg.mbc[b] <= r.gr.mbc[b] + 1e-9, `band ${b}`);
  assert.ok(r.gr.avg.mbc.some((x) => x > 0.3), 'kompressorn arbetar i snitt');
  assert.ok(r.gr.avg.limiter >= 0 && r.gr.avg.limiter <= r.gr.limiter + 1e-9, 'limiterns snitt');
});

test('fade in/ut: tyst i början och slutet, full nivå däremellan, och taket hålls', async () => {
  const { applyFades } = await import('../../src/dsp/render.js');
  const n = FS * 4, c = [new Float32Array(n).fill(0.5), new Float32Array(n).fill(0.5)];
  applyFades(c, FS, 0.2, 1);
  assert.equal(c[0][0], 0);
  assert.ok(Math.abs(c[0][n - 1]) < 1e-6);
  assert.ok(Math.abs(c[0][Math.round(FS * 0.1)] - 0.25) < 0.01, 'halvvägs i fade in = halv nivå');
  assert.equal(c[0][FS * 2], 0.5);
  assert.ok(c[1].every((v) => v <= 0.5 + 1e-9));
});

test('inställningsfil: rundtur, gränser klipps och fel ger svensk text', async () => {
  const { exportFileSettings, parseFileSettings, fileNeutral, sanitizeFile } = await import('../../src/master.js');
  const p = sanitizeFile({ ...fileNeutral(), deEss: 40, monoBass: 100, fadeOut: 3, target: 'hog' });
  p.postEq[7].gain = -2; p.matchEq[3].gain = 1.5;
  const s = parseFileSettings(exportFileSettings({ name: 'Home v2', params: p, enabled: { mbc1: false, glue: true }, presetId: 'suno-fix' }));
  assert.equal(s.name, 'Home v2'); assert.equal(s.presetId, 'suno-fix');
  assert.equal(s.params.deEss, 40); assert.equal(s.params.monoBass, 100); assert.equal(s.params.fadeOut, 3); assert.equal(s.params.target, 'hog');
  assert.equal(s.params.postEq[7].gain, -2); assert.equal(s.params.matchEq[3].gain, 1.5);
  assert.deepEqual(s.enabled, { mbc1: false }); // bara avstängda delar sparas
  const wild = parseFileSettings(JSON.stringify({ kind: 'fil-installning', params: { deEss: 9999, preEq: [{ gain: 99 }] } }));
  assert.equal(wild.params.deEss, 100); assert.equal(wild.params.preEq[0].gain, 12);
  assert.throws(() => parseFileSettings('inte json'), /giltig JSON/);
  assert.throws(() => parseFileSettings('{"foo":1}'), /inte ut som en inställning/);
  assert.throws(() => parseFileSettings('{"presets":[]}'), /preset-fil för Live/);
});
