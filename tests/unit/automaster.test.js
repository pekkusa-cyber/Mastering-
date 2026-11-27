// Automastringen: väljer preset efter stil, sänker bara det som sticker ut, rättar typiska problem och skalar styrkan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMaster, selfBalanceCurve, selfDeviation, edgeLevels } from '../../src/automaster.js';
import { BAND_CENTERS } from '../../src/analysis.js';

const tilt = (f) => -3 * Math.log2(f / 1000); // en mjuk lutning, som musik
const flat = () => ({ bands: BAND_CENTERS.map(tilt), level: -18, crest: 9, dynamics: 3, seconds: 60, version: 1 });

test('utan problem: ingen extra EQ, Suno-fix som grund', () => {
  const r = autoMaster({ profile: flat() });
  assert.equal(r.presetId, 'suno-fix');
  assert.ok(r.params.matchEq.every((b) => b.gain === 0), JSON.stringify(r.params.matchEq));
  assert.match(r.actions.join(' '), /Inga tydliga resonanser/);
});

test('en grumlig bump vid 250–400 Hz sänks – och inget höjs någonsin', () => {
  const p = flat(); p.bands = p.bands.map((v, i) => v + (BAND_CENTERS[i] > 220 && BAND_CENTERS[i] < 420 ? 4 : 0));
  const c = selfBalanceCurve(p.bands);
  assert.ok(c.every((v) => v <= 0), 'bara sänkningar');
  const r = autoMaster({ profile: p });
  const g250 = r.params.matchEq[3].gain;
  assert.ok(g250 < -1, `250 Hz ${g250}`);
  assert.ok(r.params.matchEq.every((b) => b.gain <= 0));
  assert.match(r.actions.join(' '), /sänkte 250 Hz/);
});

test('hårt 3–6 kHz ger mer de-esser, skimmer ger mer Mjuk topp', () => {
  const base = autoMaster({ profile: flat() }).params;
  const p = flat(); p.bands = p.bands.map((v, i) => v + (BAND_CENTERS[i] > 2800 && BAND_CENTERS[i] < 5500 ? 3 : 0) + (BAND_CENTERS[i] > 10000 && BAND_CENTERS[i] < 16000 ? 6 : 0));
  const r = autoMaster({ profile: p });
  assert.ok(r.params.deEss > base.deEss);
  assert.ok(r.params.glitter > base.glitter);
});

test('bred bas ger bas i mono; redan pressad låt ger mindre tryck; tvärt slut ger fade ut', () => {
  const base = autoMaster({ profile: flat() }).params;
  const p = flat(); p.crest = 6.5;
  const r = autoMaster({ profile: p, stereo: { bands: [{ id: 'bas', corr: 0.5, monoLoss: -2 }] }, edges: { startDb: -40, endDb: -3 } });
  assert.equal(r.params.monoBass, 120);
  assert.ok(r.params.trim < base.trim);
  assert.equal(r.params.fadeOut, 2);
  assert.equal(r.params.fadeIn, 0);
});

test('stil och styrka: Reggae som grund, Kraftig mer än Varsam', () => {
  const v = autoMaster({ profile: flat(), style: 'reggae', strength: 'varsam' }).params;
  const k = autoMaster({ profile: flat(), style: 'reggae', strength: 'kraftig' });
  assert.equal(k.presetId, 'reggae');
  assert.ok(k.params.deEss > v.deEss && k.params.clip > v.clip && k.params.trim > v.trim);
});

test('kanterna: tyst början och slut mäts som tysta', () => {
  const fs = 8000, n = fs * 4, L = new Float32Array(n);
  for (let i = fs; i < n - fs; i++) L[i] = Math.sin(i / 3) * 0.5;
  const e = edgeLevels([L, L], fs);
  assert.ok(e.startDb < -40 && e.endDb < -40);
  assert.ok(selfDeviation(BAND_CENTERS.map(tilt)).every((v, i) => BAND_CENTERS[i] < 200 || BAND_CENTERS[i] > 10000 || Math.abs(v) < 0.6), 'jämn lutning = ingen avvikelse i mellanregistret');
});

test('diagnos: en färdig, polerad låt säger "rör så lite som möjligt" och föreslår Varsam', async () => {
  const { diagnose } = await import('../../src/automaster.js');
  const d = diagnose({ profile: flat(), original: { integrated: -15, truePeak: -2.5, lra: 6 } });
  assert.equal(d.verdict, 'klar');
  assert.equal(d.strength, 'varsam');
  assert.match(d.title, /redan färdig/);
});

test('diagnos: låg nivå, toppar över taket och hårdhet ger "Behöver mastras"', async () => {
  const { diagnose } = await import('../../src/automaster.js');
  const p = flat(); p.bands = p.bands.map((v, i) => v + (BAND_CENTERS[i] > 2800 && BAND_CENTERS[i] < 5500 ? 3 : 0));
  const d = diagnose({ profile: p, original: { integrated: -22, truePeak: -0.2, lra: 8 }, edges: { endDb: -3 } });
  assert.equal(d.verdict, 'mer');
  assert.equal(d.strength, 'balans');
  const t = d.points.map((x) => x[1]).join(' ');
  assert.match(t, /Nivån är låg/); assert.match(t, /över −1 dBTP/); assert.match(t, /hårt i 2,5–5 kHz/); assert.match(t, /tvärt/);
});

test('redan komprimerad låt: kompressor och lim halveras', () => {
  const p = flat(); p.crest = 7.4;
  const soft = autoMaster({ profile: p, style: 'tat-pop', strength: 'kraftig' }).params;
  const norm = autoMaster({ profile: flat(), style: 'tat-pop', strength: 'kraftig' }).params;
  assert.ok(soft.mbc[1].ratio < norm.mbc[1].ratio && soft.glue.ratio < norm.glue.ratio);
});
