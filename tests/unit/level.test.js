import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, compensation, withCompensation } from '../../src/level.js';
import { neutral, BUILTIN_PRESETS, applyMacros } from '../../src/chain.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} ±${tol}`);

test('neutral kedja behöver ingen kompensation', () => {
  assert.equal(compensation(neutral()), 0);
});

test('höjer man allt 6 dB sänks utgången 6 dB (under limitern)', () => {
  const quiet = { programDb: -30 };
  const p = neutral(); p.inputGain = 6;
  near(compensation(p, quiet), -6, 0.3, 'ingång +6');
  const q = neutral(); q.postEq.forEach((b) => { b.gain = 4; });
  near(compensation(q, quiet), -4, 0.3, 'post-EQ +4');
});

test('limitern tar en del av höjningen när det är högt', () => {
  const p = neutral(); p.inputGain = 6;
  const c = compensation(p);
  assert.ok(c < -2 && c > -6, `med limiter: ${c}`);
});

test('diskanthöjning kompenseras mindre än en bred höjning (den bär mindre energi)', () => {
  const p = applyMacros(neutral(), { bright: 100 });
  const c = compensation(p);
  assert.ok(c < 0 && c > -2.5, `ljusare: ${c}`);
});

test('kompression sänker nivån och kompenseras uppåt; minskningen per band rapporteras', () => {
  const p = neutral(); p.mbc.forEach((b) => Object.assign(b, { threshold: -40, ratio: 4 }));
  const e = estimate(p);
  assert.ok(e.mbcGr.every((g) => g > 0), 'alla band komprimeras');
  assert.ok(compensation(p) > 2);
});

test('alla presets hamnar nära originalets nivå efter kompensation', () => {
  const ref = estimate(neutral()).level;
  for (const pr of BUILTIN_PRESETS) {
    const l = estimate(withCompensation(pr.params)).level;
    near(l, ref, 0.6, pr.name);
  }
});

test('Konstant utnivå kompenserar inte bort Ut och limiterns Lyft (uttryckliga nivåreglage)', async () => {
  const { withCompensation } = await import('../../src/level.js');
  const { neutral } = await import('../../src/chain.js');
  const a = withCompensation({ ...neutral(), inputGain: 6 });
  const b = withCompensation({ ...neutral(), inputGain: 6, outputGain: 3 });
  assert.ok(Math.abs(b.outputGain - a.outputGain - 3) < 0.11);
  const c = withCompensation({ ...neutral(), inputGain: 6, limiter: { ...neutral().limiter, postGain: 2 } });
  assert.ok(Math.abs(c.outputGain - a.outputGain) < 0.11);
});
