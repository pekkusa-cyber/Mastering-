// Bryggan till den inbyggda Kotlin-pluginen LiveDsp (android/.../live/LiveDspPlugin.kt).
// I webbläsaren finns ingen live-motor. Med ?sim=1 i adressen används en simulator i stället,
// så att gränssnittet kan testas (Playwright) utan telefon.
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const isSim = !isNative && new URLSearchParams(location.search).has('sim');

function simulator() {
  const listeners = new Set();
  const dumpGranted = new URLSearchParams(location.search).get('dump') !== '0';
  const s = {
    running: false, testOn: false, globalWanted: false, dumpGranted,
    broadcastsReceived: 0, scans: 0, lastScanInfo: 'Ingen sökning ännu', playbackApiInfo: '',
    android: '15', sdk: 35, device: 'Simulator', sessions: [],
  };
  const sessions = () => [
    { sessionId: 2345, pkg: 'com.suno.android', label: 'Suno', source: 'dumpsys audio', state: 'started', usage: 'USAGE_MEDIA' },
    { sessionId: 2401, pkg: 'com.android.chrome', label: 'Chrome', source: 'dumpsys audio', state: 'started', usage: 'USAGE_MEDIA' },
  ].map((x) => ({ ...x, attached: true, enabled: s.testOn, hasControl: true, error: '', lastSeen: Date.now() }));
  const global = () => ({ sessionId: 0, pkg: 'global (session 0)', label: 'global (session 0)', source: 'global', state: '', usage: '',
    attached: false, enabled: false, hasControl: false, error: 'UnsupportedOperationException: Effect library not loaded', lastSeen: Date.now() });
  const refresh = () => {
    s.sessions = !s.running ? [] : [...(s.dumpGranted ? sessions() : []), ...(s.globalWanted ? [global()] : [])];
    if (s.running) { s.scans++; s.lastScanInfo = s.dumpGranted ? `dumpsys audio: ${s.sessions.length} sessioner` : 'DUMP-behörighet saknas – sessionssökning av'; }
    const copy = structuredClone(s);
    listeners.forEach((l) => l(copy));
    return copy;
  };
  return {
    async getStatus() { return structuredClone(s); },
    async start() { s.running = true; return refresh(); },
    async stop() { s.running = false; s.testOn = false; return refresh(); },
    async setTestMode({ on }) { s.testOn = !!on; return refresh(); },
    async setGlobal({ on }) { s.globalWanted = !!on; return refresh(); },
    async copyReport() { const text = 'Masterlab felsökningsrapport (simulator)\n' + JSON.stringify(s, null, 2); window.__copied = text; return { text }; },
    async addListener(ev, fn) { if (ev === 'status') listeners.add(fn); return { remove: async () => listeners.delete(fn) }; },
  };
}

export const LiveDsp = isNative ? registerPlugin('LiveDsp') : isSim ? simulator() : null;
