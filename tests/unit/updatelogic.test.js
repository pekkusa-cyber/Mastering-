import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, nativeFromVersionName, versionText } from '../../src/updatelogic.js';

const now = { bundle: 10, native: 3, bad: null };

test('nyare webbpaket för samma app laddas ner', () => {
  assert.equal(decide({ version: 11, native: 3 }, now), 'bundle');
});

test('samma eller äldre paket gör ingenting', () => {
  assert.equal(decide({ version: 10, native: 3 }, now), null);
  assert.equal(decide({ version: 9, native: 3 }, now), null);
});

test('ny nativenivå betyder att en ny APK behövs', () => {
  assert.equal(decide({ version: 12, native: 4 }, now), 'apk');
});

test('paket byggt för en äldre app används inte', () => {
  assert.equal(decide({ version: 12, native: 2 }, now), null);
});

test('paket som inte startade förra gången hoppas över', () => {
  assert.equal(decide({ version: 11, native: 3 }, { ...now, bad: '11' }), null);
  assert.equal(decide({ version: 12, native: 3 }, { ...now, bad: '11' }), 'bundle');
});

test('trasig manifestfil gör ingenting', () => {
  for (const m of [null, {}, { version: '11', native: 3 }, { version: 11 }]) assert.equal(decide(m, now), null);
});

test('nativenivå och versionstext', () => {
  assert.equal(nativeFromVersionName('0.3.17'), 3);
  assert.equal(nativeFromVersionName('1.0'), 0);
  assert.equal(versionText('0.3.17', 18, ''), '0.3.17 · webb 18');
  assert.equal(versionText('', 0, ''), 'webb');
});
