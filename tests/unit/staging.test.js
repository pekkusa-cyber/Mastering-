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
