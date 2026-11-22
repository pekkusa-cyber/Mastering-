import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_PRESETS, EQ_CUTOFFS, MBC_CUTOFFS, RANGES, applyMacros, bandLabel, deletePreset, exportPresets,
  importPresets, neutral, noMacros, renamePreset, sanitize, savePreset, toNative,
} from '../../src/chain.js';

const within = (v, [lo, hi]) => v >= lo && v <= hi;

test('neutral har rätt antal band (minst 6 i EQ, 4 i multibandet)', () => {
  const n = neutral();
  assert.equal(n.preEq.length, 8);
  assert.equal(n.postEq.length, 8);
  assert.equal(n.mbc.length, 4);
  assert.deepEqual(MBC_CUTOFFS, [120, 2000, 8000, 20000]);
});

test('sanitize fyller i saknade värden och klämmer orimliga', () => {
  const s = sanitize({ inputGain: 99, mbc: [{ ratio: 0, threshold: 'x' }], limiter: { threshold: 5 }, postEq: [{ gain: -40 }] });
  assert.equal(s.inputGain, RANGES.inputGain[1]);
  assert.equal(s.mbc[0].ratio, 1);
  assert.equal(s.mbc[0].threshold, 0);
  assert.equal(s.limiter.threshold, 0);
  assert.equal(s.postEq[0].gain, -12);
  assert.equal(s.mbc[3].release, 150);
  assert.deepEqual(sanitize(null), neutral());
});

test('inbyggda presets finns och håller sig inom gränserna', () => {
  const names = BUILTIN_PRESETS.map((p) => p.name);
  for (const n of ['Mjuk kick', 'Radio ljus', 'Silkeslen röst', 'Varm lim']) assert.ok(names.includes(n), n);
  for (const p of BUILTIN_PRESETS) assert.deepEqual(sanitize(p.params), p.params, p.name);
  const kick = BUILTIN_PRESETS.find((p) => p.id === 'mjuk-kick').params;
  assert.ok(kick.mbc[0].ratio > 1 && kick.mbc[0].attack <= 3, 'kick-bandet komprimeras med snabb attack');
});

test('reglagen på 0 ändrar ingenting', () => {
  for (const p of BUILTIN_PRESETS) assert.deepEqual(applyMacros(p.params, noMacros()), p.params);
});

test('reglagen påverkar rätt del av kedjan och åt rätt håll', () => {
  const base = neutral();
  const kick = applyMacros(base, { kick: 100 });
  assert.ok(kick.mbc[0].threshold < 0 && kick.mbc[0].ratio > 1 && kick.mbc[0].attack < base.mbc[0].attack);
  assert.equal(kick.mbc[1].threshold, 0);
  assert.ok(applyMacros(base, { bright: 100 }).postEq[7].gain > 0);
  assert.ok(applyMacros(base, { bright: -100 }).postEq[7].gain < 0);
  assert.equal(applyMacros(base, { punch: 100 }).inputGain, 6);
  const v = applyMacros(base, { vocal: 100 });
  assert.ok(v.postEq[6].gain < 0 && v.mbc[2].ratio > 1);
  // Ytterlägen klämmer i stället för att gå utanför gränserna
  const ext = applyMacros(BUILTIN_PRESETS[1].params, { kick: 1000, bright: 1000, punch: 1000, vocal: -1000 });
  assert.deepEqual(sanitize(ext), ext);
  assert.ok(within(ext.inputGain, RANGES.inputGain));
});

test('toNative skickar med bandgränserna', () => {
  const n = toNative(neutral());
  assert.deepEqual(n.preEq.map((b) => b.cutoff), EQ_CUTOFFS);
  assert.deepEqual(n.mbc.map((b) => b.cutoff), MBC_CUTOFFS);
});

test('bandetiketter', () => {
  assert.equal(bandLabel(EQ_CUTOFFS, 0), '0–60 Hz');
  assert.equal(bandLabel(EQ_CUTOFFS, 6), '3 k–8 k Hz');
  assert.equal(bandLabel(EQ_CUTOFFS, 7), '8 k+ Hz');
});

test('spara, döp om och ta bort presets – namn hålls unika', () => {
  let { presets, preset } = savePreset([], 'Min mix', neutral());
  assert.equal(preset.name, 'Min mix');
  ({ presets } = savePreset(presets, 'Min mix', neutral()));
  assert.equal(presets[1].name, 'Min mix (2)');
  ({ presets } = savePreset(presets, 'Mjuk kick', neutral()));
  assert.equal(presets[2].name, 'Mjuk kick (2)', 'krockar inte med inbyggda');
  presets = renamePreset(presets, presets[1].id, 'Kvällsmix');
  assert.equal(presets[1].name, 'Kvällsmix');
  presets = renamePreset(presets, presets[1].id, 'Min mix');
  assert.equal(presets[1].name, 'Min mix (2)');
  presets = deletePreset(presets, presets[0].id);
  assert.equal(presets.length, 2);
});

test('export och import tur och retur', () => {
  const { presets } = savePreset([], 'Export', applyMacros(neutral(), { kick: 50 }));
  const text = exportPresets(presets);
  const back = importPresets([], text);
  assert.equal(back.length, 1);
  assert.equal(back[0].name, 'Export');
  assert.deepEqual(back[0].params, presets[0].params);
  const twice = importPresets(back, text);
  assert.equal(twice[1].name, 'Export (2)');
});

test('import av trasig fil ger begripligt fel', () => {
  assert.throws(() => importPresets([], 'inte json'), /giltig JSON/);
  assert.throws(() => importPresets([], '{"presets":[]}'), /inga presets/);
  assert.throws(() => importPresets([], '{"foo":1}'), /inga presets/);
  // En enda preset utan omslag går också bra, och orimliga värden klämms
  const one = importPresets([], JSON.stringify({ name: 'X', params: { inputGain: 500 } }));
  assert.equal(one[0].params.inputGain, 12);
});

test('nya reglage: S-ljud och Mjuk topp', async () => {
  const { applyMacros, neutral } = await import('../../src/chain.js');
  const s = applyMacros(neutral(), { sibilance: 100 });
  assert.ok(s.mbc[2].ratio > 1 && s.mbc[3].ratio > 1 && s.mbc[3].attack <= neutral().mbc[3].attack * 0.25); // snabb attack
  // relativt: bandets egen attack verkar fortfarande när S-ljud är på
  const slower = applyMacros({ ...neutral(), mbc: neutral().mbc.map((b) => ({ ...b, attack: 40 })) }, { sibilance: 100 });
  assert.ok(slower.mbc[3].attack > s.mbc[3].attack);
  const g = applyMacros(neutral(), { glitter: 100 });
  assert.ok(g.postEq[7].gain < -3 && g.mbc[3].threshold < 0);
});

test('på/av per del: avslagen del blir neutral, resten orört', async () => {
  const { applyEnables, activeMacros, BUILTIN_PRESETS, sanitize } = await import('../../src/chain.js');
  const p = BUILTIN_PRESETS.find((x) => x.id === 'suno-fix').params;
  const only = applyEnables(p, { preEq: false, postEq: false, mbc1: false, mbc2: false, mbc3: false, limiter: false });
  assert.ok(only.preEq.every((b) => b.gain === 0) && only.postEq.every((b) => b.gain === 0));
  assert.deepEqual(only.mbc[0], sanitize(p).mbc[0], 'kickbandet kvar');
  assert.equal(only.mbc[2].ratio, 1);
  assert.equal(only.limiter.ratio, 1);
  assert.deepEqual(applyEnables(p, {}), sanitize(p), 'allt på = oförändrat');
  assert.deepEqual(activeMacros({ kick: 50, bright: 30 }, { m_bright: false }), { kick: 50, bright: 0, punch: 0, vocal: 0, sibilance: 0, glitter: 0 });
});

test('Påverkar: Mjuk kick ändrar kompression och limiter, inte EQ', async () => {
  const { presetEffects, BUILTIN_PRESETS, neutral, MACROS } = await import('../../src/chain.js');
  const fx = presetEffects(BUILTIN_PRESETS.find((p) => p.id === 'mjuk-kick').params);
  assert.ok(fx.includes('Ingång +3 dB'));
  assert.ok(fx.includes('Kick 4:1 (snabb)'));
  assert.ok(fx.some((t) => t.startsWith('Limiter 12:1')));
  assert.ok(!fx.some((t) => /EQ/.test(t)), 'ingen EQ');
  const radio = presetEffects(BUILTIN_PRESETS.find((p) => p.id === 'radio-ljus').params);
  assert.ok(radio.some((t) => t === 'Post-EQ 3 k–8 k +1, 8 k+ +3'), radio.join(' | '));
  assert.deepEqual(presetEffects(neutral()), ['Ingen bearbetning (bara skyddslimiter)']);
  assert.ok(MACROS.every((m) => m.affects && m.group));
});

test('Orörd: allt neutralt och limitern av', async () => {
  const { BUILTIN_PRESETS, presetEffects, neutral } = await import('../../src/chain.js');
  const f = BUILTIN_PRESETS[0];
  assert.equal(f.id, 'flat');
  assert.equal(f.params.limiter.ratio, 1);
  assert.equal(f.params.limiter.threshold, 0);
  assert.deepEqual({ ...f.params, limiter: neutral().limiter }, neutral());
  assert.deepEqual(presetEffects(f.params), ['Ingen bearbetning alls – låten är orörd']);
  assert.ok(BUILTIN_PRESETS.length >= 30);
});

test('inbyggda presets: inga kompressorer snabbare än 3 ms/100 ms, limiter-release minst 60 ms', async () => {
  const { BUILTIN_PRESETS, sanitize } = await import('../../src/chain.js');
  for (const p of BUILTIN_PRESETS.filter((x) => x.id !== 'test' && x.id !== 'flat')) {
    const q = sanitize(p.params);
    for (const b of q.mbc) if (b.ratio > 1) assert.ok(b.attack >= 3 && b.release >= 100, `${p.name}: ${b.attack}/${b.release}`);
    assert.ok(q.limiter.release >= 60, p.name);
  }
});

// ---- Parametrisk EQ, solo och modulpresets ----
import { PEQ_BANDS, allEnabled, applyEnables, peqDb, soloEnables, soloParams, applyModule, moduleActive, THIRD_OCTAVE_CENTERS } from '../../src/chain.js';
import { estimate } from '../../src/level.js';

test('parametrisk EQ: gain vid frekvensen, smalare Q påverkar grannarna mindre, 31 band till motorn', () => {
  const wide = [{}, {}, { freq: 1000, gain: 6, q: 0.7 }];
  const narrow = [{}, {}, { freq: 1000, gain: 6, q: 6 }];
  assert.ok(Math.abs(peqDb(sanitize({ peq: wide }).peq, 1000) - 6) < 0.01);
  assert.ok(peqDb(sanitize({ peq: narrow }).peq, 1600) < peqDb(sanitize({ peq: wide }).peq, 1600) - 2);
  const n = toNative({ peq: wide });
  assert.equal(n.post31.length, 31);
  assert.equal(THIRD_OCTAVE_CENTERS.length, 31);
  assert.ok(Math.abs(n.post31[THIRD_OCTAVE_CENTERS.indexOf(1000)] - 6) < 0.01);
  assert.ok(toNative(neutral()).post31.every((g) => g === 0));
  // gränser: frekvens inom bandets område, Q och gain klämda
  const s = sanitize({ peq: [{ freq: 5, gain: 40, q: 99 }] }).peq[0];
  assert.deepEqual(s, { freq: PEQ_BANDS[0].range[0], gain: 12, q: 8 });
  // nivåmodellen ser höjningen
  assert.ok(estimate({ peq: wide }).level > estimate(neutral()).level + 0.5);
});

test('PEQ kan slås av som helhet och per band', () => {
  const p = { peq: [{ freq: 80, gain: 3, q: 0.7 }, { freq: 250, gain: -2, q: 1 }] };
  assert.ok(applyEnables(p, { peq: false }).peq.every((b) => b.gain === 0));
  const one = applyEnables(p, { peq1: false }).peq;
  assert.equal(one[0].gain, 3); assert.equal(one[1].gain, 0);
});

test('solo: bara den solade delen är på, utgången behålls, skyddslimitern ligger kvar', () => {
  const e = soloEnables(allEnabled(), 'mbc0');
  assert.equal(e.mbc0, true); assert.equal(e.output, true);
  for (const k of ['input', 'preEq', 'mbc1', 'postEq', 'peq', 'limiter', 'm_kick']) assert.equal(e[k], false, k);
  assert.deepEqual(soloEnables(allEnabled(), null), allEnabled());
  const base = BUILTIN_PRESETS.find((p) => p.id === 'suno-fix').params;
  const p = soloParams(base, noMacros(), allEnabled(), 'postEq');
  assert.deepEqual(p.postEq, sanitize(base).postEq);
  assert.ok(p.preEq.every((b) => b.gain === 0) && p.mbc.every((b) => b.ratio === 1));
  assert.deepEqual(p.limiter, neutral().limiter);
  // solo på ett PEQ-band: bara det bandet
  const q = soloParams({ peq: [{ freq: 80, gain: 3, q: 0.7 }, { freq: 250, gain: -2, q: 1 }] }, noMacros(), allEnabled(), 'peq1').peq;
  assert.equal(q[0].gain, 0); assert.equal(q[1].gain, -2);
  // solo på ett enkelt reglage: bara reglagets ändring på en platt kedja
  const m = soloParams(base, { ...noMacros(), bright: 100 }, allEnabled(), 'm_bright');
  assert.ok(m.postEq[7].gain > 0);
  assert.ok(m.mbc.every((b) => b.ratio === 1));
});

test('modulpreset: byter bara EQ, kompressor eller limiter', () => {
  const a = BUILTIN_PRESETS.find((p) => p.id === 'mjuk-kick').params;
  const b = BUILTIN_PRESETS.find((p) => p.id === 'radio-ljus').params;
  const eq = applyModule(a, b, 'eq');
  assert.deepEqual(eq.postEq, sanitize(b).postEq);
  assert.deepEqual(eq.mbc, sanitize(a).mbc);
  assert.deepEqual(eq.limiter, sanitize(a).limiter);
  const lim = applyModule(a, b, 'limiter');
  assert.deepEqual(lim.limiter, sanitize(b).limiter);
  assert.deepEqual(lim.postEq, sanitize(a).postEq);
  const comp = applyModule(a, b, 'comp');
  assert.deepEqual(comp.mbc, sanitize(b).mbc);
  assert.equal(moduleActive(neutral(), 'eq'), false);
  assert.equal(moduleActive(b, 'eq'), true);
});

import { applyAmounts, noAmounts } from '../../src/chain.js';
test('mixerns mängd: 100 % = oförändrat, 0 % = ingen EQ/kompression, 200 % = dubbelt', () => {
  const base = BUILTIN_PRESETS.find((p) => p.id === 'radio-ljus').params;
  assert.deepEqual(applyAmounts(base, noAmounts()), sanitize(base));
  const zero = applyAmounts(base, { preEq: 0, comp: 0, postEq: 0, peq: 0 });
  assert.ok(zero.postEq.every((b) => b.gain === 0) && zero.preEq.every((b) => b.gain === 0));
  assert.ok(zero.mbc.every((b) => b.ratio === 1));
  const dbl = applyAmounts({ postEq: [{ gain: 2 }], mbc: [{ ratio: 3 }] }, { postEq: 200, comp: 200 });
  assert.equal(dbl.postEq[0].gain, 4);
  assert.equal(dbl.mbc[0].ratio, 5);
});

import { areaRange, listenCurve, withListen, setAllBands } from '../../src/chain.js';
test('områdeslyssning: solo släpper bara fram bandets område, mute tar bort det', () => {
  assert.deepEqual(areaRange('preEq:3'), [250, 500]);
  assert.deepEqual(areaRange('mbc:3'), [8000, 20000]);
  const s = listenCurve('mbc:0', 'solo');
  assert.equal(s.length, 31);
  assert.equal(s[THIRD_OCTAVE_CENTERS.indexOf(63)], 0);
  assert.equal(s[THIRD_OCTAVE_CENTERS.indexOf(1000)], -24);
  const m = listenCurve('mbc:0', 'mute');
  assert.equal(m[THIRD_OCTAVE_CENTERS.indexOf(63)], -24);
  assert.equal(m[THIRD_OCTAVE_CENTERS.indexOf(1000)], 0);
  // klocka: smalare Q = smalare område
  const wide = areaRange('peq:2', { peq: [{}, {}, { freq: 1000, gain: 0, q: 0.7 }] });
  const narrow = areaRange('peq:2', { peq: [{}, {}, { freq: 1000, gain: 0, q: 6 }] });
  assert.ok(narrow[1] / narrow[0] < wide[1] / wide[0]);
  assert.ok(listenCurve('peq:2', 'solo', { peq: [{}, {}, { freq: 1000, gain: 0, q: 8 }] }).some((g) => g === 0)); // alltid minst ett band
  // läggs på motorns post31 och hålls inom ±24
  const n = withListen(toNative({ peq: [{}, {}, { freq: 1000, gain: 6, q: 1 }] }), listenCurve('mbc:0', 'solo'));
  assert.ok(n.post31.every((g) => g >= -24 && g <= 24));
  assert.equal(withListen(toNative(neutral()), null).post31.every((g) => g === 0), true);
});

test('Hela låten: samma värde på alla fyra kompressorband', () => {
  const p = setAllBands(BUILTIN_PRESETS.find((x) => x.id === 'mjuk-kick').params, 'ratio', 2.5);
  assert.deepEqual(p.mbc.map((b) => b.ratio), [2.5, 2.5, 2.5, 2.5]);
});

test('tak-skydd: Ut och limiterns Lyft efter limitern sänker tröskeln, så att det verkliga taket hålls', () => {
  const base = BUILTIN_PRESETS.find((p) => p.id === 'mjuk-kick').params;
  const thr = sanitize(base).limiter.threshold;
  for (const [out, lyft] of [[0, 0], [3, 0], [6, 2], [-4, 0], [12, 12]]) {
    const n = toNative({ ...base, outputGain: out, limiter: { ...base.limiter, postGain: lyft } });
    const post = out + lyft;
    assert.ok(n.limiter.threshold + Math.max(0, post) <= thr + 1e-9 || n.limiter.threshold === -30, `Ut ${out} + Lyft ${lyft}: tak ${n.limiter.threshold + post}`);
    if (post <= 0) assert.equal(n.limiter.threshold, thr); // minusnivåer rör inte tröskeln
  }
  // limitern av (ratio 1) rörs inte
  assert.equal(toNative({ ...neutral(), outputGain: 6, limiter: { ...neutral().limiter, ratio: 1, threshold: 0 } }).limiter.threshold, 0);
});
