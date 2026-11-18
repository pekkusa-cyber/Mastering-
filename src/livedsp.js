// Bryggan till den inbyggda Kotlin-pluginen LiveDsp (android/.../live/LiveDspPlugin.kt).
// I webbläsaren finns ingen live-motor. Med ?sim=1 i adressen används en simulator i stället,
// så att gränssnittet kan testas (Playwright) utan telefon. Simulatorns flaggor:
//   dump=0       DUMP-behörigheten saknas      shizuku=0  Shizuku är inte igång
//   global=0     global session fungerar inte   level=0    nivåmätningen hör inget
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const isSim = !isNative && new URLSearchParams(location.search).has('sim');

function simulator() {
  const q = new URLSearchParams(location.search);
  const listeners = new Set();
  const globalWorks = q.get('global') !== '0';
  const perms = {
    notifications: false, microphone: false, battery: false, dump: q.get('dump') === '1',
    install: false, shizukuInstalled: q.get('shizuku') !== '0', shizukuRunning: q.get('shizuku') !== '0', shizukuGranted: false,
  };
  const s = {
    running: false, on: false, globalWanted: true, globalActive: false, dumpGranted: perms.dump,
    broadcastsReceived: 0, scans: 0, lastScanInfo: 'Ingen sökning ännu', playbackApiInfo: '',
    android: '17', sdk: 37, device: 'Simulator', params: {}, sessions: [],
  };
  window.__simParams = null;
  const sessionList = () => {
    const out = [];
    if (s.globalWanted) out.push({ sessionId: 0, pkg: 'global (session 0)', label: 'global (session 0)', source: 'global',
      attached: globalWorks, enabled: globalWorks && s.on, hasControl: globalWorks,
      error: globalWorks ? '' : 'UnsupportedOperationException: Effect library not loaded', note: '' });
    const ga = s.globalWanted && globalWorks;
    if (perms.dump) out.push({ sessionId: 2345, pkg: 'com.suno.android', label: 'Suno', source: 'dumpsys audio', state: 'started',
      attached: !ga, enabled: !ga && s.on, hasControl: !ga, error: '', note: ga ? 'global session används – ingen egen effekt' : '' });
    return out.map((x) => ({ state: '', usage: '', lastSeen: Date.now(), ...x }));
  };
  const refresh = () => {
    s.dumpGranted = perms.dump;
    s.sessions = s.running ? sessionList() : [];
    s.globalActive = s.running && s.globalWanted && globalWorks;
    if (s.running) { s.scans++; s.lastScanInfo = perms.dump ? `dumpsys audio: ${s.sessions.length} sessioner` : 'DUMP-behörighet saknas – sessionssökning av'; }
    const copy = structuredClone(s);
    listeners.forEach((l) => l(copy));
    return copy;
  };
  return {
    async getStatus() { return structuredClone(s); },
    async start() { s.running = true; return refresh(); },
    async stop() { s.running = false; return refresh(); },
    async setOn({ on }) { s.on = !!on; if (on) s.running = true; return refresh(); },
    async setParams({ params }) { s.params = params; window.__simParams = params; },
    async setGlobal({ on }) { s.globalWanted = !!on; return refresh(); },
    async copyReport() { const text = 'Masterlab felsökningsrapport (simulator)\n' + JSON.stringify(s, null, 2); window.__copied = text; return { text }; },
    async getPermissions() { return { ...perms, globalActive: s.running && s.globalWanted && globalWorks, running: s.running }; },
    async requestPermission({ name }) { if (name in perms) perms[name] = true; window.__opened = name; },
    async grantDumpWithShizuku() {
      if (!perms.shizukuRunning) throw new Error('Shizuku är inte igång. Öppna Shizuku och starta den via Trådlös felsökning.');
      perms.shizukuGranted = true; perms.dump = true; refresh(); return { ok: true };
    },
    async autoLevel() {
      if (!perms.microphone) throw new Error('Mikrofonbehörighet krävs för nivåmätningen (se Behörigheter).');
      if (!s.running) throw new Error('Starta Masterlab och spela en låt först.');
      return q.get('level') === '0' ? { ok: false, deltaDb: 0, message: 'Inget ljud uppmättes. Spela en låt och försök igen.' }
        : { ok: true, deltaDb: -2.5, message: 'Utgången justerad -2.5 dB' };
    },
    async addListener(ev, fn) { if (ev === 'status') listeners.add(fn); return { remove: async () => listeners.delete(fn) }; },
  };
}

export const LiveDsp = isNative ? registerPlugin('LiveDsp') : isSim ? simulator() : null;
