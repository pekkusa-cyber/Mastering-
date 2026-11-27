// Exportkontrollerna (riktvärden från mastringspraxis): nivå mot plattformar, PLR, limiter, true peak för höga masters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masterChecks } from '../../src/master.js';

const kinds = (m, gr) => masterChecks(m, gr).map(([k, t]) => `${k}:${t}`);
test('streamingnivå med god dynamik: inga varningar', () => {
  const c = kinds({ integrated: -14, truePeak: -1.2 }, { limiter: 1.5, mbc: [2, 1, 1, 0] });
  assert.ok(c.every((x) => x.startsWith('ok')), c.join('\n'));
});
test('hög och hårt pressad master varnar för PLR, Spotifys −2 dBTP och limitern', () => {
  const c = kinds({ integrated: -7, truePeak: -1.5 }, { limiter: 5, mbc: [3, 3, 3, 3] }).join('\n');
  assert.match(c, /warn:PLR 5,5 dB: mycket hårt pressad/);
  assert.match(c, /−2 dBTP/);
  assert.match(c, /Limitern trycker ned upp till 5,0 dB/);
});
test('för tyst master varnar', () => {
  assert.match(kinds({ integrated: -20, truePeak: -3 }).join('\n'), /warn:Nivå −20,0 LUFS är tystare/);
});
test('kompressor som arbetar orimligt hårt varnar', () => {
  assert.match(kinds({ integrated: -14, truePeak: -1 }, { mbc: [12, 0, 0, 0] }).join('\n'), /Kompressorn trycker ned upp till 12,0 dB/);
});
