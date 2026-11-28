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
  const spectrumListeners = new Set();
  const globalWorks = q.get('global') !== '0';
  const perms = {
    notifications: false, microphone: false, battery: false, dump: q.get('dump') === '1',
    install: false, shizukuInstalled: q.get('shizuku') !== '0', shizukuRunning: q.get('shizuku') !== '0', shizukuGranted: false,
  };
  const s = {
    running: false, on: false, globalWanted: true, globalActive: false, dumpGranted: perms.dump,
    broadcastsReceived: 0, scans: 0, lastScanInfo: 'Ingen sökning ännu', playbackApiInfo: '',
    android: '17', sdk: 37, device: 'Simulator', params: {}, sessions: [],
    agc: { on: false, target: -14, gain: 0, closedLoop: 'true', postVolume: true, probing: false },
    analyzer: { running: false, error: '' },
    analysis: { running: false, seconds: 0 },
    bypass: false, volComp: true, volOffset: -12, correction: { on: false, name: '', preamp: 0 },
    output: { key: '8:Soundcore Liberty 4 Pro', name: 'Soundcore Liberty 4 Pro', kind: 'bluetooth' }, profileApplied: '', profiles: [],
  };
  let wavelet = q.get('wavelet') === '1';
  s.control = !wavelet;
  const micMsg = 'Mikrofonbehörighet krävs för analysen (Mer → Behörigheter). Inget spelas in.';
  if (q.get('mic') === '1') perms.microphone = true;
  // Ett rosa-aktigt spektrum med lite rörelse, och en "låt" som kan analyseras
  const centers = [24.5, 77.5, 122.5, 173.2, 223.6, 280.6, 355, 447.2, 561.2, 709.9, 894.4, 1118, 1414, 1789, 2236, 2806, 3550, 4472, 5612, 7099, 8944, 11180, 14140, 17890];
  const fakeBands = (t = 0) => centers.map((f, i) => -18 - 3 * Math.log2(f / 1000) + Math.sin(t / 300 + i) * 1.5 + (f > 2500 && f < 6300 ? 3 : 0));
  let monitor = 0, analysisStart = 0;
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
    async setParams({ params }) {
      s.params = params; window.__simParams = params;
      const total = s.running ? 1 : 0;
      return { total, ok: wavelet ? 0 : total, noControl: wavelet ? total : 0, errors: 0, running: s.running };
    },
    async setBypass({ on }) { s.bypass = !!on; if (!on) s.running = true; return refresh(); },
    async setCorrection({ on, correction }) { s.correction = { on: !!on, name: correction?.name || s.correction.name, preamp: correction?.preamp ?? s.correction.preamp }; window.__simCorrection = correction; if (on) s.running = true; return { ...refresh(), total: 1, ok: 1, noControl: 0, errors: 0, running: true }; },
    async setVolComp({ on }) { s.volComp = !!on; return refresh(); },
    async setProfiles({ profiles }) { window.__simProfiles = profiles; s.profiles = Object.keys(profiles); return refresh(); },
    /** Testhjälp: låtsas att en annan utgång ansluts. */
    simOutput(key, name) { s.output = { key, name, kind: 'bluetooth' }; const p = (window.__simProfiles || {})[key]; s.profileApplied = p ? name : ''; if (p) s.params = p.params; refresh(); },
    async takeControl() { wavelet = false; s.control = true; refresh(); return { total: 1, ok: 1, noControl: 0, errors: 0, running: s.running }; },
    async setGlobal({ on }) { s.globalWanted = !!on; return refresh(); },
    async copyReport() { const text = 'Masterlab felsökningsrapport (simulator)\n' + JSON.stringify(s, null, 2); window.__copied = text; return { text }; },
    async getPermissions() { return { ...perms, globalActive: s.running && s.globalWanted && globalWorks, running: s.running }; },
    async requestPermission({ name }) { if (name in perms) perms[name] = true; window.__opened = name; },
    async grantDumpWithShizuku() {
      if (!perms.shizukuRunning) throw new Error('Shizuku är inte igång. Öppna Shizuku och starta den via Trådlös felsökning.');
      perms.shizukuGranted = true; perms.dump = true; refresh(); return { ok: true };
    },
    async autoLevel() {
      if (s.agc.on) return { ok: false, deltaDb: 0, message: 'Jämn volym är på – PÅ och AV nivåmatchas redan automatiskt.' };
      if (!perms.microphone) throw new Error('Mikrofonbehörighet krävs för nivåmätningen (se Behörigheter).');
      if (!s.running) throw new Error('Starta Masterlab och spela en låt först.');
      return q.get('level') === '0' ? { ok: false, deltaDb: 0, message: 'Inget ljud uppmättes. Spela en låt och försök igen.' }
        : { ok: true, deltaDb: -2.5, message: 'Utgången justerad -2.5 dB' };
    },
    async setAgc({ on }) {
      if (on && !perms.microphone) throw new Error(micMsg);
      s.agc = { ...s.agc, on: !!on, gain: on ? -3.5 : 0 };
      if (on) s.running = true;
      return refresh();
    },
    async startMonitor() {
      if (!perms.microphone) throw new Error(micMsg);
      clearInterval(monitor);
      monitor = setInterval(() => {
        const sec = s.analysis.running ? (Date.now() - analysisStart) / 1000 * (window.__simSpeed || 1) : 0;
        spectrumListeners.forEach((l) => l({ bands: fakeBands(Date.now()), rms: -16, peak: window.__simPeak ?? -3, agcGain: s.agc.gain, analysisSeconds: sec }));
      }, 150);
    },
    async stopMonitor() { clearInterval(monitor); },
    async startAnalysis() {
      if (!perms.microphone) throw new Error(micMsg);
      s.running = true; s.analysis = { running: true, seconds: 0 }; analysisStart = Date.now();
      return refresh();
    },
    async stopAnalysis() {
      if (!s.analysis.running) throw new Error('Ingen analys pågick.');
      s.analysis = { running: false, seconds: 0 };
      refresh();
      const fps = 20, n = 20 * 120; // två minuter
      const pow = fakeBands(0).map((d) => 10 ** (d / 10));
      return { raw: {
        bandPow: pow.map((p, i) => (i >= 19 ? p * (window.__simBright || 1) : p)),
        rmsPow: Array.from({ length: n }, (_, i) => 10 ** ((-16 + 4 * Math.sin(i / 200)) / 10)),
        crest: Array.from({ length: n }, () => window.__simCrest || 12),
        framesPerSecond: fps, seconds: n / fps, source: 'live',
      } };
    },
    async addListener(ev, fn) {
      if (ev === 'status') listeners.add(fn);
      if (ev === 'spectrum') spectrumListeners.add(fn);
      return { remove: async () => { listeners.delete(fn); spectrumListeners.delete(fn); } };
    },
  };
}

export const LiveDsp = isNative ? registerPlugin('LiveDsp') : isSim ? simulator() : null;
if (isSim) window.__sim = LiveDsp;
