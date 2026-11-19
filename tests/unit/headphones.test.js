import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_HEADPHONES, THIRD_OCTAVE, correctionFor, parseParametric } from '../../src/headphones.js';

test('Liberty 4 Pro: 10 filter, preamp −5,8 dB, 31 tersband', () => {
  const p = parseParametric(BUILTIN_HEADPHONES[0].text);
  assert.equal(p.filters.length, 10);
  assert.equal(p.preamp, -5.8);
  const c = correctionFor(BUILTIN_HEADPHONES[0]);
  assert.equal(c.gains.length, THIRD_OCTAVE.length);
  // Största höjningen ligger runt 5 kHz (filter 2: +6 dB vid 5158 Hz), basen sänks
  const i5k = THIRD_OCTAVE.indexOf(5000);
  assert.ok(c.gains[i5k] > 4, `5 kHz ${c.gains[i5k]}`);
  assert.ok(c.gains[THIRD_OCTAVE.indexOf(125)] < -3, 'bas sänkt');
  // Preamp gör att ingenting höjs över 0 dB totalt (ingen klippning)
  assert.ok(Math.max(...c.gains) + c.preamp <= 0.5);
});

test('trasig text ger begripligt fel', () => {
  assert.throws(() => parseParametric('hej'), /Hittade inga filter/);
});

test('samma volym: korrigeringen nivåkompenseras till ±0,1 dB', async () => {
  const { BUILTIN_HEADPHONES, correctionFor, loudnessDelta, withLevelComp, accuracy } = await import('../../src/headphones.js');
  const c = correctionFor(BUILTIN_HEADPHONES[0]);
  const before = loudnessDelta(c);
  assert.ok(before < -3, `utan kompensation blir det tystare: ${before.toFixed(1)} dB`);
  const comp = withLevelComp(c);
  assert.ok(Math.abs(loudnessDelta(comp)) < 0.1, `med kompensation: ${loudnessDelta(comp).toFixed(2)}`);
  assert.ok(comp.levelComp > 3);
  const acc = accuracy(BUILTIN_HEADPHONES[0]);
  assert.ok(acc.mean < 0.3 && acc.max < 2, JSON.stringify(acc));
});
