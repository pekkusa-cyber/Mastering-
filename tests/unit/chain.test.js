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
  assert.ok(kick.mbc[0].ratio > 1 && kick.mbc[0].attack <= 2, 'kick-bandet komprimeras med snabb attack');
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
  assert.ok(s.mbc[2].ratio > 1 && s.mbc[3].ratio > 1 && s.mbc[3].attack <= 1.5);
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
