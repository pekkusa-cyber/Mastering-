/* Uppdateringar utan server. Varje bygge i GitHub Actions lägger tre filer i releasen "live":
   latest.json ({ version, native }), bundle.zip (webbdelen) och masterlab.apk.
   - Webbdelen (gränssnitt, presets, hjälptexter) byts automatiskt: laddas ner, packas upp och WebView pekas om.
   - Kotlin-ändringar kräver ny APK: appen erbjuder den med ett tryck.
   Ett paket används bara om det är byggt för samma nativenivå som den installerade appen (native-level). */
import { Capacitor, WebView, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { decide, nativeFromVersionName, versionText as vt } from './updatelogic.js';

const REPO = 'pekkusa-cyber/Mastering-';
export const BASE = `https://github.com/${REPO}/releases/download/live/`;
/* global __BUNDLE_VERSION__, __BUILD_TIME__ */
export const BUNDLE = typeof __BUNDLE_VERSION__ === 'number' ? __BUNDLE_VERSION__ : 0;
export const BUILT = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

const AppUpdate = registerPlugin('AppUpdate');
// Samma nycklar som vakten i index.html
const LS = { pending: 'ml-bundle-pending', pendingPath: 'ml-bundle-pending-path', bad: 'ml-bundle-bad', good: 'ml-bundle-good', prev: 'ml-bundle-prev' };
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } },
};
const native = Capacitor.isNativePlatform();
let busy = false;

async function appInfo() {
  const info = await App.getInfo();
  return { version: info.version, native: nativeFromVersionName(info.version) };
}

export async function versionText() {
  if (!native) return vt('', BUNDLE, BUILT);
  return vt((await appInfo()).version, BUNDLE, BUILT);
}

/** Anropas när första skärmen ritats: bekräftar att det nya paketet fungerar (annars backar vakten). */
export async function markBooted() {
  if (window.__mlWatchdog) { clearTimeout(window.__mlWatchdog); window.__mlWatchdog = 0; }
  if (!native || !ls.get(LS.pending)) return;
  const path = ls.get(LS.pendingPath);
  ls.del(LS.pending); ls.del(LS.pendingPath); ls.del(LS.prev);
  if (path) ls.set(LS.good, path);
  try { await WebView.persistServerBasePath(); } catch { /* */ }
}

async function manifest() {
  const { text } = await AppUpdate.getText({ url: `${BASE}latest.json?t=${Date.now()}` });
  return JSON.parse(text);
}

/**
 * Söker efter uppdatering. En ny webbdel laddas ner och tas i bruk direkt (skärmen laddas om – live-motorn
 * påverkas inte). Svarar { kind: 'bundle'|'apk'|null, manifest }.
 */
export async function check() {
  if (!native || busy) return { kind: null };
  busy = true;
  try {
    const m = await manifest();
    const kind = decide(m, { bundle: BUNDLE, native: (await appInfo()).native, bad: ls.get(LS.bad) });
    if (kind === 'bundle') {
      const current = ls.get(LS.good) || '';
      const { path } = await AppUpdate.downloadBundle({ url: `${BASE}bundle.zip?v=${m.version}`, version: m.version, keep: current });
      ls.set(LS.prev, current);
      ls.set(LS.pending, String(m.version));
      ls.set(LS.pendingPath, path);
      await WebView.setServerBasePath({ path }); // WebView laddar om med den nya webbdelen
    }
    return { kind, manifest: m };
  } catch (e) {
    console.warn('uppdateringskontroll misslyckades', e);
    return { kind: null, error: String(e?.message || e) };
  } finally {
    busy = false;
  }
}

/** Laddar ner nya APK:n och öppnar Androids installerare. onProgress(procent). */
export async function installApk(onProgress) {
  const { allowed } = await AppUpdate.canInstall();
  if (!allowed) { await AppUpdate.openInstallSettings(); return 'settings'; }
  const h = await AppUpdate.addListener('progress', (p) => onProgress?.(p.percent));
  try { await AppUpdate.downloadAndInstall({ url: `${BASE}masterlab.apk` }); } finally { h.remove(); }
  return 'ok';
}

export async function canInstall() {
  if (!native) return false;
  try { return (await AppUpdate.canInstall()).allowed; } catch { return false; }
}

export const openInstallSettings = () => AppUpdate.openInstallSettings();
