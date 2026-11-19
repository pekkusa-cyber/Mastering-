import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_CENTERS, NBANDS, applyLiveMatch, compareProfiles, fft, finishProfile, matchEqCurve, profileFromChannels,
  toFileMatchEq, toLiveEq,
} from '../../src/analysis.js';
import { Biquad, coeffs } from '../../src/dsp/biquad.js';
import { sanitize } from '../../src/chain.js';

const FS = 48000;
function noise(seconds, seed = 7) {
  const n = seconds * FS, L = new Float32Array(n);
  let s = seed, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0; const w = s / 2 ** 31 - 1;
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
    L[i] = (b0 + b1 + b2 + w * 0.1848) * 0.05;
  }
  return [L, new Float32Array(L)];
}
const filtered = (ch, type, f, gain) => ch.map((x, c) => { const y = new Float32Array(x); new Biquad(coeffs(type, FS, f, 0.7071, gain)).run(y, c); return y; });

test('FFT ger rätt bin för en sinus', () => {
  const n = 1024, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 64 * i) / n);
  fft(re, im);
  const mag = Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k], im[k]));
  assert.equal(mag.indexOf(Math.max(...mag)), 64);
});

test('en sinus hamnar i rätt analysband', () => {
  const n = FS * 3, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.3 * Math.sin((2 * Math.PI * 1000 * i) / FS);
  const p = profileFromChannels([L, L], FS);
  assert.equal(p.bands.length, NBANDS);
  const loudest = p.bands.indexOf(Math.max(...p.bands));
  assert.ok(BAND_CENTERS[loudest] > 890 && BAND_CENTERS[loudest] < 1120, `band ${BAND_CENTERS[loudest]}`);
  assert.ok(Math.abs(p.crest - 3.01) < 0.3, `crest för sinus ${p.crest}`);
});

test('samma låt mot sig själv: redo, inga avvikelser, ingen match-EQ', () => {
  const p = profileFromChannels(noise(6), FS);
  const c = compareProfiles(p, p);
  assert.equal(c.verdict, 'redo');
  assert.ok(c.regions.every((r) => r.status === 'ok'));
  assert.ok(matchEqCurve(p, p).every((v) => v === 0));
});

test('för mycket diskant upptäcks och match-EQ sänker den', () => {
  const ref = profileFromChannels(noise(6), FS);
  const own = profileFromChannels(filtered(noise(6), 'highshelf', 6000, 8), FS);
  const c = compareProfiles(own, ref);
  const diskant = c.regions.find((r) => r.id === 'diskant');
  assert.equal(diskant.status, 'mycket');
  assert.ok(diskant.diff > 3.5);
  assert.match(diskant.text, /vasst/);
  assert.notEqual(c.verdict, 'redo');
  const curve = matchEqCurve(own, ref);
  const live = toLiveEq(curve), file = toFileMatchEq(curve);
  assert.ok(live[7] < -2, `live 8k+ ${live[7]}`);
  assert.ok(live[2] > -1 && live[2] < 1, 'basen orörd');
  assert.ok(file[8] < -2, `fil 8 kHz ${file[8]}`);
  assert.ok(curve.every((v) => Math.abs(v) <= 6));
  const p = applyLiveMatch(sanitize({}), curve);
  assert.ok(p.postEq[7].gain < -2);
});

test('för lite bas upptäcks', () => {
  const ref = profileFromChannels(noise(6), FS);
  const own = profileFromChannels(filtered(noise(6), 'lowshelf', 200, -9), FS);
  const bas = compareProfiles(own, ref).regions.find((r) => r.id === 'bas');
  assert.ok(bas.diff < -3.5 && /för lite bas/.test(bas.text), bas.text);
});

test('hårdare toppar än referensen ger ett tips om kicken', () => {
  const base = { bands: new Array(NBANDS).fill(-30), level: -14, dynamics: 4, seconds: 180, version: 1 };
  const c = compareProfiles({ ...base, crest: 16 }, { ...base, crest: 10 });
  assert.ok(c.crestDiff === 6);
  assert.ok(c.tips.some((t) => /Kick mjukare/.test(t)));
});

test('finishProfile räknar dynamik och nivå', () => {
  const rms = [...new Array(300).fill(0.01), ...new Array(300).fill(0.1)];
  const p = finishProfile({ bandPow: new Array(NBANDS).fill(1e-4), rmsPow: rms, crest: [10, 12], framesPerSecond: 10, seconds: 60, source: 'live' });
  assert.equal(p.crest, 11);
  assert.ok(Math.abs(p.dynamics - 10) < 0.5, `dynamik ${p.dynamics}`);
  assert.equal(p.source, 'live');
});
