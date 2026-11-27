// Presets ska skilja sig i varje flik – inte bara i EQ och kompressor. Kontrollerar Live (In, EQ 1, Kompr., EQ 2, Limiter)
// och Fil (samma + Färg, Limiter, Kick) för alla inbyggda presets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PRESETS, sanitize } from '../../src/chain.js';
import { liveToFile } from '../../src/master.js';

const real = BUILTIN_PRESETS.filter((p) => !['flat', 'test', 'demo-check'].includes(p.id));
const live = (p) => sanitize(p.params);
const fil = (p) => liveToFile(p.params, {}, p.id);
const tabs = {
  'Live Limiter': (p) => live(p).limiter,
  'Live EQ 1': (p) => live(p).preEq,
  'Live EQ 2': (p) => live(p).postEq,
  'Live Kompr.': (p) => live(p).mbc,
  'Fil Färg': (p) => { const f = fil(p); return [f.deEss, f.glitter, f.width, f.glue]; },
  'Fil Limiter': (p) => { const f = fil(p); return [f.clip, f.limRelease]; },
  'Fil Kick': (p) => fil(p).kickPunch,
};

for (const [tab, get] of Object.entries(tabs)) {
  test(`${tab}: presetsen skiljer sig åt (inte samma inställning i alla)`, () => {
    const vals = real.map((p) => JSON.stringify(get(p)));
    const unique = new Set(vals).size;
    // Ingen inställning får delas av fler än en fjärdedel av presetsen
    const counts = {}; vals.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    const most = Math.max(...Object.values(counts));
    assert.ok(unique >= 6, `${tab}: bara ${unique} olika inställningar på ${real.length} presets`);
    assert.ok(most <= Math.ceil(real.length / 4), `${tab}: ${most} av ${real.length} presets har exakt samma inställning`);
  });
}

test('hela presetten är unik i både Live och Fil', () => {
  for (const f of [live, fil]) {
    const vals = real.map((p) => JSON.stringify(f(p)));
    assert.equal(new Set(vals).size, real.length);
  }
});

test('Fil: Färg och Limiter följer presetten, egen preset får standardvärden', () => {
  const g = (id) => liveToFile(BUILTIN_PRESETS.find((p) => p.id === id).params, {}, id);
  assert.ok(g('silkeslen-rost').deEss > g('jazz').deEss);
  assert.ok(g('gym').clip > g('akustisk').clip);
  assert.notDeepEqual(g('lofi').glue, g('edm-hogt').glue);
  const own = liveToFile({}, {});
  assert.equal(own.deEss, 25); assert.equal(own.clip, 1.5);
});

test('Live: limiterns attack är högst 1 ms i alla presets (Androids limiter ser inte framåt)', () => {
  for (const p of BUILTIN_PRESETS) assert.ok(sanitize(p.params).limiter.attack <= 1, `${p.id}: ${p.params.limiter.attack} ms`);
});
