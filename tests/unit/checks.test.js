// Exportkontrollerna (riktvärden från mastringspraxis): nivå mot plattformar, PLR, limiter, true peak för höga masters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masterChecks } from '../../src/master.js';

const kinds = (m, gr) => masterChecks(m, gr).map(([k, t]) => `${k}:${t}`);
test('streamingnivå med god dynamik: inga varningar', () => {
  const c = kinds({ integrated: -14, truePeak: -1.2 }, { limiter: 1.5, mbc: [9, 6, 5, 0], avg: { mbc: [2, 1, 1, 0], limiter: 0.5, glue: 1 } });
  assert.ok(c.every((x) => x.startsWith('ok')), c.join('\n'));
});
test('hög och hårt pressad master varnar för PLR, Spotifys −2 dBTP och limitern', () => {
  const c = kinds({ integrated: -7, truePeak: -1.5 }, { limiter: 5, mbc: [9, 9, 9, 9], avg: { mbc: [3, 3, 3, 3], limiter: 2.5, glue: 1 } }).join('\n');
  assert.match(c, /warn:PLR 5,5 dB: mycket hårt pressad/);
  assert.match(c, /−2 dBTP/);
  assert.match(c, /Limitern trycker ned 2,5 dB i snitt \(upp till 5,0 dB\)/);
});
test('för tyst master varnar', () => {
  assert.match(kinds({ integrated: -20, truePeak: -3 }).join('\n'), /warn:Nivå −20,0 LUFS är tystare/);
});
test('kompressor som arbetar orimligt hårt varnar', () => {
  assert.match(kinds({ integrated: -14, truePeak: -1 }, { mbc: [14, 0, 0, 0], avg: { mbc: [6, 0, 0, 0] } }).join('\n'), /Kompressorn trycker ned 6,0 dB i snitt/);
});

test('toppar i nedtryckningen ensamma ger ingen varning – snittet avgör (en preset med 3 dB snitt är normal)', () => {
  const c = kinds({ integrated: -14, truePeak: -1 }, { limiter: 3.5, mbc: [14, 11, 8, 6], glue: 6, avg: { mbc: [3, 3, 3, 3], limiter: 0.8, glue: 2.5 } });
  assert.ok(c.every((x) => x.startsWith('ok')), c.join('\n'));
});
