// Live-vyn: PÅ/AV och Bypass, smarta funktioner (jämn volym, konstant utnivå, volymoberoende kompression,
// hörlurskorrigering, profil per enhet), presets, Enkelt/Avancerat med på/av, ⓘ, ↺ och −/+ på allt, och kurvor
// som visar vad inställningarna gör.
import { LiveDsp, isNative } from '../livedsp.js';
import { ui, app } from '../state.js';
import { load, save } from '../store.js';
import {
  BUILTIN_PRESETS, EQ_CUTOFFS, MACROS, MODULES, PEQ_BANDS, AMOUNT_KEYS, areaRange, listenCurve, withListen, applyAmounts, noAmounts, applyModule, moduleActive, soloParams, MACRO_GROUPS, MBC_CUTOFFS, presetEffects, MBC_NAMES, RANGES, activeMacros, allEnabled, applyEnables,
  applyMacros, bandLabel, deletePreset, exportPresets, importPresets, neutral, noMacros, renamePreset, sanitize,
  savePreset, toNative,
} from '../chain.js';
import { ask, bindPicker, bindSliders, esc, fmtDb, getPath, infoBtn, picker, setPath, sheet, slider, saveFile, soloBtn, split, toggle, vfader } from '../ui.js';
import { gainComputer } from '../dsp/dynamics.js';
import { compensation, estimate, withCompensation } from '../level.js';
import { eqCurveSvg, compCurvesSvg, spectrumEqSvg, freqToX, xToFreq } from '../viz.js';
import { BAND_EDGES } from '../analysis.js';
import { BUILTIN_HEADPHONES, accuracy, appliedCurve, correctionFor, exactCurve, parseParametric, withLevelComp } from '../headphones.js';
import { correctionGraphSvg } from '../viz.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const allPresets = () => [...BUILTIN_PRESETS, ...ui.userPresets];
export const currentPreset = () => allPresets().find((p) => p.id === ui.presetId);
/** Kedjan som den låter: preset + enkla reglage, med avslagna delar neutrala. */
const withAmounts = () => applyAmounts(ui.base, ui.amounts);
export const effective = () => applyEnables(applyMacros(withAmounts(), activeMacros(ui.macros, ui.enabled)), ui.enabled);
/** Det som hörs: som effective(), men med solo bara den solade delen (solo sparas aldrig i en preset). */
export const heard = () => (ui.solo ? soloParams(withAmounts(), ui.macros, ui.enabled, ui.solo) : effective());
/** Lyssningsfiltret för M/S per frekvensområde (null = inget). */
const listenNow = () => (ui.listen ? listenCurve(ui.listen.area, ui.listen.mode, heard()) : null);
/** Det som skickas till motorn: med nivåkompensation om Konstant utnivå är på. */
export const sendParams = () => (ui.constant ? withCompensation(heard()) : heard());
const presetBase = () => sanitize(currentPreset()?.params ?? neutral());
const isDirty = () => {
  const p = currentPreset();
  return !p || JSON.stringify(applyMacros(withAmounts(), ui.macros)) !== JSON.stringify(sanitize(p.params));
};
const en = (k) => ui.enabled[k] !== false;
const solo = (k, label) => soloBtn(k, ui.solo === k, label);
const SOLO_NAMES = () => ({ input: 'Ingång', preEq: 'Pre-EQ', mbc: 'Multiband', ...Object.fromEntries(MBC_NAMES.map((n, i) => [`mbc${i}`, n])), postEq: 'Post-EQ',
  peq: 'Parametrisk EQ', ...Object.fromEntries(PEQ_BANDS.map((b, i) => [`peq${i}`, `PEQ ${b.name}`])), limiter: 'Limiter',
  ...Object.fromEntries(MACROS.map((m) => [`m_${m.key}`, m.label])) });
const headphones = () => [...BUILTIN_HEADPHONES, ...ui.customHeadphones];
const fileDeps = () => ({ isNative, Filesystem, Directory, Encoding, Share });

let sendTimer = 0, saveTimer = 0;
/** Sätts av main.js: startar/stoppar live-spektrumet. */
let setSpectrum = () => {};
export const onSpectrumWanted = (fn) => { setSpectrum = fn; };

// ---- Ångra: varje ändring sparar läget före; ett helt drag räknas som ett steg ----
let lastSnap = null, lastChangeAt = 0;
const snap = () => JSON.stringify({ presetId: ui.presetId, base: ui.base, macros: ui.macros, enabled: ui.enabled, mods: ui.mods || {}, amounts: ui.amounts || noAmounts() });
function recordUndo(user) {
  const now = Date.now();
  if (user && lastSnap && now - lastChangeAt > 1200) {
    ui.undo = [...(ui.undo || []), lastSnap].slice(-20);
  }
  if (user) lastChangeAt = now;
  lastSnap = snap();
}
/** Ångrar senaste ändringen. */
export function undo() {
  const prev = ui.undo?.pop();
  if (!prev) return false;
  Object.assign(ui, JSON.parse(prev));
  lastSnap = prev;
  lastChangeAt = 0;
  changed({ now: true, user: false, keepUndo: true, undone: true });
  app.render();
  return true;
}
/** Skickar kedjan till motorn (lite fördröjt medan ett reglage dras), sparar lokalt och ritar om kurvorna. */
export function changed({ now = false, user = true, keepUndo = false, undone = false } = {}) {
  if (!keepUndo) recordUndo(user);
  clearTimeout(sendTimer);
  const send = async () => {
    if (!LiveDsp) return;
    const r = await LiveDsp.setParams({ params: withListen(toNative(sendParams()), listenNow()) });
    if (r && typeof r === 'object') { ui.report = { ...r, at: Date.now(), user: user || undone, undone }; app.renderPart('confirm'); }
  };
  if (now) send(); else sendTimer = setTimeout(send, 60);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save('state', { presetId: ui.presetId, base: ui.base, macros: ui.macros, mode: ui.mode, enabled: ui.enabled, constant: ui.constant, mods: ui.mods, amounts: ui.amounts, liveBlock: ui.liveBlock }), 300);
  const d = document.querySelector('#dirty');
  if (d) d.hidden = !isDirty();
  const u = document.querySelector('#undo');
  if (u) u.disabled = !ui.undo?.length;
  app.renderPart('viz');
}

export async function initLive() {
  const st = await load('state', null);
  ui.userPresets = await load('presets', []);
  ui.customHeadphones = await load('headphones', []);
  ui.corr = await load('corr', { on: false, id: 'liberty4pro' });
  ui.profiles = await load('profiles', {});
  ui.enabled = allEnabled();
  ui.constant = true;
  if (st) {
    ui.presetId = st.presetId ?? ui.presetId;
    ui.base = sanitize(st.base);
    ui.macros = { ...noMacros(), ...st.macros };
    ui.mode = ['advanced', 'curve'].includes(st.mode) ? st.mode : 'mixer';
    ui.amounts = { ...noAmounts(), ...st.amounts };
    ui.liveBlock = st.liveBlock || 'quick';
    ui.enabled = { ...allEnabled(), ...st.enabled };
    ui.constant = st.constant !== false;
    ui.mods = st.mods || {};
  }
  ui.solo = null; ui.listen = null; // solo och områdeslyssning gäller bara medan man lyssnar
  ui.amounts ||= noAmounts();
}

// ---- Delar ----

const PRESET_ICONS = { 'mjuk-kick': '🥁', 'radio-ljus': '📻', 'silkeslen-rost': '🎤', 'varm-lim': '🧡', transparent: '◻️', 'suno-fix': '🛠️',
  'bas-varm': '🔊', 'tat-pop': '✨', 'hiphop-punch': '👊', 'edm-hogt': '⚡', akustisk: '🎸', ballad: '🎙️', rock: '🤘', lofi: '📼', natt: '🌙', horlurar: '🎧', test: '🧪',
  flat: '⚪', 'rnb-silke': '🌙', 'trap-808': '🔈', schlager: '💃', indie: '🌿', metal: '🔥', jazz: '🎷', film: '🎬', reggaeton: '🌴', bil: '🚗', telefon: '📱', gym: '🏋️', 'demo-check': '🔍' };

/** Korrigeringen som skickas till motorn: nivåkompenserad (samma volym) om det är valt. */
export function correctionToSend(hp, corr = ui.corr) {
  const full = correctionFor(hp);
  // Styrka: 100 % = hela AutoEq-korrektionen; lägre gör den mildare (t.ex. om Harman-kurvan låter för ljus)
  const k = Math.max(0, Math.min(100, corr?.strength ?? 100)) / 100;
  const c = { ...full, gains: full.gains.map((g) => +(g * k).toFixed(2)), preamp: +(full.preamp * k).toFixed(2) };
  return corr?.level === false ? c : withLevelComp(c);
}

/**
 * Inställningar (⚙): det man sällan ändrar – hörlurar (modell, samma volym, graf), nivå (jämn volym, konstant nivå,
 * volymoberoende kompression) och profil för enheten.
 */
export function settingsBody() {
  const s = ui.status || {};
  const a = s.agc || {};
  const comp = ui.constant ? compensation(effective()) : 0;
  const hp = headphones().find((h) => h.id === ui.corr?.id) || BUILTIN_HEADPHONES[0];
  const sent = correctionToSend(hp);
  const acc = accuracy(hp);
  const out = s.output || {};
  const prof = out.key && ui.profiles[out.key];
  const freqs = Array.from({ length: 160 }, (_, i) => 20 * 1000 ** (i / 159));
  const exact = exactCurve(hp, freqs).map((v) => v * (ui.corr?.strength ?? 100) / 100);
  const sw = (id, on, label, extra = '') => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${esc(label)}</label>${extra}`;
  return `<h2>Inställningar</h2>
    <h3 class="set-h">🎧 Hörlurar</h3>
    <button class="picker" id="corr-pick" aria-label="Välj hörlurar"><span class="pi">🎧</span><span class="pv">${esc(hp.name)}</span><span class="chev">▾</span></button>
    <p class="hint small">${esc(hp.source || 'importerad')}</p>
    ${slider({ id: 'corr-strength', label: 'Styrka', value: ui.corr?.strength ?? 100, range: [0, 100, 5, '%'], info: 'corrStrength', resetTo: 100, kind: 'corr', key: 'strength' })}
    <div class="row">${sw('corr-level', ui.corr?.level !== false, 'Samma volym som utan korrigering')}${infoBtn('corrLevel')}</div>
    ${correctionGraphSvg({ freqs, exact, applied: appliedCurve(sent, freqs), preamp: sent.preamp })}
    <p class="hint small" data-testid="corr-acc">Appen följer AutoEq-kurvan med i snitt ${acc.mean.toFixed(2)} dB avvikelse (som mest ${acc.max.toFixed(1)} dB vid ${acc.at >= 1000 ? `${(acc.at / 1000).toFixed(1)} kHz` : `${acc.at} Hz`}).
      ${ui.corr?.level !== false ? `Nivån höjs ${fmtDb(sent.levelComp)} dB så att det låter lika högt; en säkerhetslimiter tar toppar som annars skulle klippa.` : `Preamp ${fmtDb(sent.preamp)} dB – därför låter det lägre.`}${infoBtn('corrAccuracy')}</p>
    ${ui.corrMsg ? `<p class="hint small" id="corrmsg">${esc(ui.corrMsg)}</p>` : ''}

    <h3 class="set-h">Nivå</h3>
    <div class="row">${sw('agc', a.on, 'Jämn volym')}${infoBtn('agc')}<span class="grow"></span>${a.on ? `<small class="dim" data-testid="agcread">${fmtDb(a.gain)} dB${a.probing ? ' · mäter' : ''}</small>` : ''}</div>
    ${ui.agcMsg ? `<p class="hint small" id="agcmsg">${esc(ui.agcMsg)}</p>` : ''}
    <div class="row">${sw('constant', ui.constant, 'Konstant utnivå')}${infoBtn('constant')}<span class="grow"></span>${ui.constant ? `<small class="dim" data-testid="compread">${fmtDb(comp)} dB</small>` : ''}</div>
    <div class="row">${sw('volcomp', s.volComp !== false, 'Volymoberoende kompression')}${infoBtn('volComp')}</div>
    ${s.volComp !== false && !a.postVolumeKnown ? '<p class="hint small" data-testid="volcomp-wait">Inte aktiv ännu: appen har inte mätt om din telefon lägger volymen före effekten. Slå på Jämn volym, spela musik och ändra volymen en gång.</p>' : ''}

    <h3 class="set-h">Profil för ${esc(out.name || 'utgången')}${infoBtn('deviceProfile')}</h3>
    <div class="row">${prof ? `<span class="ok small" data-testid="profile">✓ ${esc(prof.label)}</span><span class="grow"></span><button class="btn small ghost" id="prof-del" aria-label="Ta bort profilen">Ta bort</button>`
      : '<span class="hint small">Ingen profil – samma inställning för alla utgångar.</span><span class="grow"></span><button class="btn small" id="prof-save">Spara nuvarande</button>'}</div>
    ${s.profileApplied ? `<p class="hint small" id="profmsg">Profilen för ${esc(s.profileApplied)} används.</p>` : ''}`;
}

let settingsDialog = null;
/** Öppnar inställningarna (⚙). Arket ritas om när något ändras. */
export function openSettings() {
  settingsDialog = sheet(`<div id="settings-body">${settingsBody()}</div>`, { cls: 'settingssheet' });
  settingsDialog.addEventListener('close', () => { settingsDialog = null; app.render(); });
  bindSettings(settingsDialog);
}
export function renderSettings() {
  if (!settingsDialog) return;
  const body = settingsDialog.querySelector('#settings-body');
  const top = body.parentElement.scrollTop;
  body.innerHTML = settingsBody();
  body.parentElement.scrollTop = top;
  bindSettings(settingsDialog);
}

/** Alternativen i presetväljaren: mina först, sedan inbyggda – med ikon och beskrivning. */
export function presetGroups({ withTest = true } = {}) {
  const o = (p) => ({ value: p.id, label: p.name, desc: p.desc || 'Din egen preset', icon: PRESET_ICONS[p.id] || '⭐' });
  return [
    ...(ui.userPresets.length ? [{ label: 'Mina', options: ui.userPresets.map(o) }] : []),
    { label: 'Inbyggda', options: BUILTIN_PRESETS.filter((p) => withTest || p.id !== 'test').map(o) },
  ];
}

/**
 * Ett reglage i Avancerat och Kurva: samma lodräta fader som i Mixern (dra uppåt/nedåt, dubbeltryck på namnet =
 * presetens värde). short = kort namn under fadern; label = hela namnet (skärmläsare, ⓘ).
 */
const path = (key, label, range, info = key, enableKey = null, short = label) =>
  vfader({ id: `p-${key.replace(/\./g, '-')}`, label, short, value: getPath(ui.base, key), range, info, resetTo: getPath(presetBase(), key), kind: 'path', key,
    enable: enableKey ? { key: enableKey, on: en(enableKey) } : null, buttons: !!enableKey });
/** En rad fadrar sida vid sida. */
const frow = (items) => `<div class="faders adv" style="--n:${items.length}">${items.join('')}</div>`;
const EQ_SHORT = ['60', '120', '250', '500', '1k', '3k', '8k', '20k'];


// ---- Layout B: rubrikrad, smal rad, graf överst, block i flödesordning, panel ----

/** Runda av/på-knappar i rubriken: 🎧 Hörlurar (bara korrigeringen) och 🎚️ Masterlab (allt annat). Gröna = på. */
export function headerToggles() {
  if (!LiveDsp) return '';
  const s = ui.status || {};
  const hpOn = !!s.correction?.on, appOn = !s.bypass;
  return `<span class="hdt" id="hdt">
    <label class="rb ${hpOn ? 'on' : 'off'}" title="Hörlurar (korrigering)"><input type="checkbox" id="corr" ${hpOn ? 'checked' : ''} aria-label="Hörlurskorrigering">🎧</label>
    <label class="rb ${appOn ? 'on' : 'off'}" title="Masterlab (bearbetning)"><input type="checkbox" id="masterlab" ${appOn ? 'checked' : ''} aria-label="Masterlab (bearbetning)">🎚️</label></span>`;
}

/** Läget i klartext (överst i grafen). */
function statusLine() {
  const s = ui.status || {};
  const hpOn = !!s.correction?.on, appOn = !s.bypass;
  const mode = !s.running && (s.on || hpOn) ? 'STARTAR…' : !appOn ? (hpOn ? 'BARA HÖRLURSKORRIGERING' : 'HELT ORIGINAL') : s.on ? 'MASTRAT' : s.agc?.on ? 'ORIGINAL · NIVÅMATCHAT' : 'ORIGINAL';
  const motor = s.running ? (s.globalActive ? 'Bearbetar allt ljud' : `Bearbetar ${(s.sessions || []).filter((x) => x.attached).length} spelande appar`) : 'Motorn står still';
  return `<span id="lstat"><b data-testid="mode">${mode}</b> · <span data-testid="motor">${motor}</span></span>${infoBtn('mains', 'Om huvudbrytarna')}`;
}

/** Smal rad: preset, Före/Efter, Ångra, Hantera. */
function subbar() {
  const p = currentPreset(), s = ui.status || {};
  return `<div class="subbar" id="subbar">
    <button class="pp" id="preset" aria-label="Preset" aria-haspopup="listbox"><span class="ico">${PRESET_ICONS[p?.id] || (p ? '⭐' : '🎛️')}</span><b class="pv">${esc(p?.name || '(egen)')}</b><small id="dirty" title="Ändrad från presetten" aria-label="ändrad" ${isDirty() ? '' : 'hidden'}>●</small>▾</button>
    <button class="abmini ${s.on ? 'on' : ''}" id="onoff" aria-pressed="${!!s.on}" aria-label="Mastrad på/av" ${s.bypass ? 'disabled' : ''}><span class="o">Före</span><span class="m">Efter</span></button>
    <button class="rb sm" id="undo" aria-label="↶ Ångra" ${ui.undo?.length ? '' : 'disabled'}>↶</button>
    <button class="rb sm" id="p-menu" aria-label="Hantera presets">⋯</button>
  </div>`;
}

/** Kort bekräftelse uppe i grafen – försvinner av sig själv. En annan app med kontrollen visas tills det är löst. */
export function toast() {
  if (!LiveDsp) return '<div id="confirm" hidden></div>';
  const s = ui.status || {}, r = ui.report;
  const active = !s.bypass || s.correction?.on; // helt original: ingen effekt ska ligga på – då är "kontrollen" ointressant
  if (active && (s.running && s.control === false || r?.noControl > 0 && Date.now() - r.at < 60000 && s.control !== true)) {
    return `<div class="toast warn" id="confirm" role="status"><span>⚠ En annan app (t.ex. Wavelet) styr ljudet.</span><button class="btn small" id="takeControl">Ta tillbaka</button></div>`;
  }
  if (ui.msg && Date.now() - (ui.msgAt || 0) < 3500) return `<div class="toast" id="confirm" role="status"><span id="msg">${esc(ui.msg)}</span></div>`;
  if (!(r && Date.now() - r.at < 3000 && r.user)) return '<div id="confirm" hidden></div>';
  if (r.undone) return '<div class="toast" id="confirm" role="status">↶ Ångrat.</div>';
  if (r.errors > 0 && r.ok > 0) return `<div class="toast warn" id="confirm" role="status">Hörs, men ${r.errors} av ${r.total} appar kunde inte nås</div>`;
  if (r.errors > 0) return `<div class="toast bad" id="confirm" role="status">✕ Kunde inte läggas på${r.firstError ? `: ${esc(String(r.firstError).slice(0, 60))}` : ''}</div>`;
  if (!r.running || !r.total) return '<div class="toast warn" id="confirm" role="status">Sparat – motorn är av</div>';
  if (!s.on && !s.agc?.on && !s.correction?.on) return '<div class="toast" id="confirm" role="status">✓ Sparat – hörs på Efter</div>';
  return '<div class="toast" id="confirm" role="status">✓ Ändringen hörs nu</div>';
}

const SOLO_LABEL = () => ({ ...SOLO_NAMES(), preEq: 'EQ 1 (före kompressorn)', eq2: 'EQ 2 (efter kompressorn)', mbc: 'Kompressor', input: 'In', limiter: 'Limiter' });
const soloChip = () => {
  if (ui.listen) {
    const [lo, hi] = areaRange(ui.listen.area, heard());
    const hz = (f) => (f >= 1000 ? `${+(f / 1000).toFixed(1)}k` : `${Math.round(f)}`);
    return `<div class="solochip" data-testid="listenbar"><b>${ui.listen.mode === 'solo' ? 'S' : 'M'}</b> ${ui.listen.mode === 'solo' ? 'Bara' : 'Utan'} ${esc(AREA_NAME(ui.listen.area))} (${hz(lo)}–${hz(hi)} Hz)<button id="solo-off" aria-label="Avsluta solo">✕</button></div>`;
  }
  return ui.solo ? `<div class="solochip" data-testid="solobar"><b>S</b> Solo: ${esc(SOLO_LABEL()[ui.solo] || ui.solo)}<button id="solo-off" aria-label="Avsluta solo">✕</button></div>` : '';
};

// Blocken står i exakt samma ordning som ljudet går genom effekten: In → EQ 1 → Kompressor → EQ 2 → Limiter → Ut.
// Snabb är ingen del av kedjan utan en genväg som styr flera delar samtidigt (därför skild från resten).
const BLOCKS = [
  { id: 'quick', label: 'Snabb', sub: 'genväg' },
  { id: 'in', label: 'In', sub: 'först' },
  { id: 'eq1', label: 'EQ 1', sub: 'före' },
  { id: 'comp', label: 'Kompr.', sub: 'tryck' },
  { id: 'eq2', label: 'EQ 2', sub: 'efter' },
  { id: 'limiter', label: 'Limiter', sub: 'volym' },
  { id: 'out', label: 'Ut', sub: 'sist' },
];
const block = () => (BLOCKS.some((b) => b.id === ui.liveBlock) ? ui.liveBlock : ui.liveBlock === 'eq' ? 'eq2' : 'quick');
const anyOn = (keys) => keys.some((k) => en(k));
const blockOn = (id) => ({ quick: anyOn(MACROS.map((m) => `m_${m.key}`)), in: en('input'), eq1: en('preEq'), eq2: anyOn(['postEq', 'peq']), comp: anyOn(['mbc0', 'mbc1', 'mbc2', 'mbc3']), limiter: en('limiter'), out: en('output') }[id]);
const SHORT_MACRO = { kick: 'Kick', bright: 'Ljus', punch: 'Tryck', vocal: 'Röst', sibilance: 'S-ljud', glitter: 'Topp' };
const PEQ_NAMES = ['Bas', 'Lågmitt', 'Mitt', 'Närvaro', 'Diskant'];
const COMP_NAMES = ['Kick', 'Mellan', 'Närvaro', 'Luft'];
const eqSel = () => (ui.eqSel ?? 2);
const compSel = () => (Number.isInteger(ui.compSel) ? Math.max(0, Math.min(3, ui.compSel)) : 0); // 'all' (Hela låten) visar band 0

/** Den övre halvan: alltid grafen för det block som är öppet. */
function topPart(b = block()) {
  const p = heard();
  let g = '';
  if (['quick', 'in', 'eq1', 'eq2'].includes(b)) {
    // EQ 1 och EQ 2 visar bara sin egen del av kurvan; Snabb och In visar hela
    const zero = (a) => a.map((x) => ({ ...x, gain: 0 }));
    const shown = b === 'eq1' ? { ...p, postEq: zero(p.postEq), peq: zero(p.peq) } : b === 'eq2' ? { ...p, preEq: zero(p.preEq) } : p;
    const handles = b === 'eq2' && ui.eqView !== 'graphic' ? p.peq.map((x, i) => ({ f: x.freq, gain: x.gain, sel: i === eqSel(), off: !en('peq') || !en(`peq${i}`) })) : [];
    g = `<div class="scrbox${handles.length ? ' edit' : ''}" data-screen="${b}">${spectrumEqSvg({ bands: ui.spectrum?.bands, edges: BAND_EDGES, p: shown, handles, H: 240, W: 380 })}</div>`;
  } else if (b === 'comp') {
    const e = estimate(p);
    const sel = compSel(), m = p.mbc[sel];
    g = `<div class="grwrap">${p.mbc.map((x, i) => `<div class="grb${i === sel ? ' sel' : ''}${en(`mbc${i}`) ? '' : ' off'}"><b>${x.ratio > 1.0001 ? `−${(e.mbcGr[i] || 0).toFixed(1)}` : '0.0'}</b><div class="grt"><em style="height:${Math.min(100, (e.mbcGr[i] || 0) * 8)}%"></em></div><span>${COMP_NAMES[i]}</span></div>`).join('')}
      <div class="tfbox">${transferSvg({ threshold: m.threshold, ratio: m.ratio, knee: m.knee, preGain: m.preGain, postGain: m.postGain })}${COMP_NAMES[sel]}: in → ut</div></div>`;
  } else if (b === 'limiter') {
    const e = estimate(p), l = p.limiter;
    g = `<div class="lvwrap" style="grid-template-columns:1.4fr 1fr"><div class="tfbox">${transferSvg({ threshold: l.threshold, ratio: l.ratio, knee: 0, postGain: l.postGain })}in → ut</div>
      <div class="lvinfo"><b>${l.ratio <= 1.0001 ? 'av' : `−${e.limGr.toFixed(1)} dB`}</b>uppskattad sänkning av topparna<br><br><b>${fmtDb(l.threshold)} dB</b>tak</div></div>`;
  } else {
    const before = estimate(neutral()).level, after = estimate(sendParams()).level;
    const h = (v) => Math.max(4, Math.min(100, (v - before + 18) / 30 * 100));
    g = `<div class="lvwrap"><div class="lvb"><b>${fmtDb(0)}</b><div class="lvt"><em style="height:${h(before)}%"></em></div>Original</div>
      <div class="lvb after"><b>${fmtDb(after - before)}</b><div class="lvt"><em style="height:${h(after)}%"></em></div>Efter</div>
      <div class="lvinfo">${ui.constant ? `<b data-testid="compread2">${fmtDb(compensation(effective()))} dB</b>kompenseras så att Efter låter lika högt som Original (Konstant utnivå)` : '<b>av</b>Konstant utnivå – ställ nivån själv med Ut'}</div></div>`;
  }
  return `<div class="lbl">${statusLine()}<span class="grow"></span></div>${g}${soloChip()}${toast()}`;
}

/** Liten in/ut-kurva för en kompressor eller limiter. */
function transferSvg({ threshold, ratio, knee = 0, preGain = 0, postGain = 0 }) {
  const S = 100, P = 6;
  const x = (v) => P + ((v + 60) / 66) * (S - 2 * P);
  const y = (v) => S - P - ((Math.max(-60, Math.min(6, v)) + 60) / 66) * (S - 2 * P);
  const ins = Array.from({ length: 67 }, (_, i) => -60 + i);
  const pts = ins.map((v) => `${x(v).toFixed(1)},${y(v + preGain + gainComputer(v + preGain, threshold, ratio, knee) + postGain).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${S} ${S}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="In → ut"><rect x="${P}" y="${P}" width="${S - 2 * P}" height="${S - 2 * P}" rx="5" fill="none" stroke="#262b33"/>
    <line x1="${x(-60)}" y1="${y(-60)}" x2="${x(6)}" y2="${y(6)}" stroke="#3a424d" stroke-dasharray="2 3"/>
    <polyline fill="none" stroke="#3fd3b0" stroke-width="2.2" points="${pts}"/>${ratio > 1.0001 ? `<circle cx="${x(threshold - preGain)}" cy="${y(threshold + postGain)}" r="3" fill="#e0a03c"/>` : ''}</svg>`;
}

/** Rubrik i panelen: på/av (mute), namn, solo och delpreset. */
function phead({ title, sub = '', enableKey = null, soloKey = null, mod = null }) {
  const modBtn = mod ? `<button class="pick2" id="mod-${mod}" aria-label="${MODULES[mod].name}-preset">Preset${ui.mods?.[mod] ? `: <b>${esc(ui.mods[mod])}</b>` : ''} ▾</button>` : '';
  return `<div class="phead">${enableKey ? toggle(enableKey, enableKey.startsWith('grp_') ? blockOn(enableKey.slice(4)) : en(enableKey), title) : ''}<b>${esc(title)}</b>${soloKey ? solo(soloKey, title) : ''}
    ${sub ? `<small>${esc(sub)}</small>` : ''}<span class="grow"></span>${modBtn}</div>`;
}
const frowN = (items) => `<div class="faders" style="--n:${items.length}">${items.join('')}</div>`;
const srows = (items) => `<div class="srows">${items.join('')}</div>`;

/**
 * Det reglagen visar: presetten + mängder + Snabb (enkla reglage). Ändrar man Ljus i Snabb syns det alltså direkt
 * på EQ 2:s fader för 8k – och drar man den fadern ändras grunden så att fadern hamnar exakt där man drog.
 */
const shown = () => sanitize(applyMacros(withAmounts(), activeMacros(ui.macros, ui.enabled)));
const shownPreset = () => sanitize(applyMacros(presetBase(), activeMacros(ui.macros, ui.enabled)));
/** Sätter en parameter så att det man ser (inkl. Snabb) blir v. */
function setShown(key, v) {
  // Snabb kan lägga till (EQ, tröskel) eller skala (attack, release): sök det grundvärde som ger exakt v
  for (let k = 0; k < 8; k++) {
    const cur = getPath(shown(), key);
    if (Math.abs(v - cur) < 1e-6) return;
    const b0 = getPath(ui.base, key);
    setPath(ui.base, key, b0 + 1e-3);
    const slope = (getPath(shown(), key) - cur) / 1e-3;
    setPath(ui.base, key, b0);
    // vid en gräns (Snabb har drivit värdet till kanten) flyttas grunden rakt, tills fadern lossnar
    const next = b0 + (Math.abs(slope) > 1e-6 ? (v - cur) / slope : v - cur);
    setPath(ui.base, key, Math.round(next * 1e4) / 1e4); // inga flyttalsrester (3.0000000002)
    ui.base = sanitize(ui.base);
  }
}

/** Lodrät fader (bara i EQ). */
const vpath = (key, label, short, range, info = key, opts = {}) => vfader({ id: `p-${key.replace(/\./g, '-')}`, label, short, value: getPath(shown(), key), range, info,
  resetTo: getPath(shownPreset(), key), kind: 'path', key, buttons: false, ...opts });
/** Vågrätt reglage (allt utom EQ). */
const hpath = (key, label, range, info = key, opts = {}) => slider({ id: `p-${key.replace(/\./g, '-')}`, label, value: getPath(shown(), key), range, info,
  resetTo: getPath(shownPreset(), key), kind: 'path', key, ...opts });

/** M och S för ett frekvensområde: S = bara området hörs, M = området tas bort. Som på en riktig EQ/multiband. */
function areaBtns(area, label) {
  const on = (mode) => ui.listen?.area === area && ui.listen?.mode === mode;
  return `<button type="button" class="mbtn${on('mute') ? ' on' : ''}" data-amute="${area}" aria-pressed="${on('mute')}" aria-label="Ta bort ${esc(label)}" title="Mute: ta bort området">M</button>`
    + `<button type="button" class="solo${on('solo') ? ' on' : ''}" data-asolo="${area}" aria-pressed="${on('solo')}" aria-label="Bara ${esc(label)}" title="Solo: hör bara området">S</button>`;
}
const AREA_NAME = (area) => {
  const [k, i] = area.split(':');
  if (k === 'mbc') return COMP_NAMES[i];
  if (k === 'peq') return PEQ_NAMES[i];
  return `${k === 'preEq' ? 'EQ 1' : 'EQ 2'} ${bandLabel(EQ_CUTOFFS, Number(i))}`;
};

function panelQuick() {
  const f = MACROS.map((m) => slider({ id: `m-${m.key}`, label: m.label, value: ui.macros[m.key] ?? 0, range: [-100, 100, 5, ''],
    kind: 'macro', key: m.key, resetTo: 0, info: m.key, enable: { key: `m_${m.key}`, on: en(`m_${m.key}`) }, extra: solo(`m_${m.key}`, m.label) }));
  return `<div class="phead"><b>Snabb</b>${infoBtn('mixer')}<span class="grow"></span><button class="btn small" id="reset-all">Återställ alla</button></div>${srows(f)}`;
}

/** Åtta band som lodräta fadrar, med M/S per band (område). */
const eqBands = (k) => frowN(EQ_CUTOFFS.map((_, i) => vpath(`${k}.${i}.gain`, bandLabel(EQ_CUTOFFS, i), EQ_SHORT[i], RANGES.eqGain, `${k}.${i}.gain`,
  { btns: areaBtns(`${k}:${i}`, bandLabel(EQ_CUTOFFS, i)) })));

/** EQ 1: åttabandsEQ:n FÖRE kompressorn. */
function panelEq1() {
  return `${phead({ title: 'EQ 1', sub: 'före komp.', enableKey: 'preEq', soloKey: 'preEq', mod: 'eq' })}${eqBands('preEq')}`;
}

/** EQ 2: EFTER kompressorn – åttabandsEQ:n och sedan de fem EQ-punkterna (frekvens, höj/sänk, bredd). */
function panelEq2() {
  const graphic = ui.eqView === 'graphic';
  const sel = eqSel(), b = PEQ_BANDS[sel];
  const chips = `<div class="bandrow"><button class="chip${graphic ? ' sel' : ''}" data-eqband="graphic">8 band</button>
    ${PEQ_NAMES.map((n, i) => `<button class="chip${!graphic && i === sel ? ' sel' : ''}${en(`peq${i}`) ? '' : ' off'}" data-eqband="${i}">${n}</button>`).join('')}</div>`;
  let body;
  if (graphic) {
    body = eqBands('postEq');
  } else {
    body = `<div class="bandrow"><small class="dim grow">${esc(PEQ_NAMES[sel])} – ${b.type === 'peaking' ? 'runt frekvensen' : sel === 0 ? 'allt under frekvensen' : 'allt över frekvensen'}</small>
      <button class="btn small" id="peq-flat">Platta ut</button><span class="bms">${areaBtns(`peq:${sel}`, PEQ_NAMES[sel])}${infoBtn('areaSolo')}</span></div>
      ${frowN([vpath(`peq.${sel}.freq`, 'Frekvens', 'Frekvens', b.range, 'peqFreq', { log: true }), vpath(`peq.${sel}.gain`, 'Höj / sänk', 'Höj / sänk', RANGES.peqGain, 'peqGain'),
        vpath(`peq.${sel}.q`, 'Bredd (Q)', 'Bredd (Q)', RANGES.peqQ, 'peqQ')])}`;
  }
  return `${phead({ title: 'EQ 2', sub: 'efter komp.', enableKey: 'grp_eq2', soloKey: 'eq2', mod: 'eq' })}${chips}${body}`;
}

const COMP_ROWS = [
  ['ratio', 'Styrka (ratio)', 'ratio'], ['threshold', 'Startar vid (tröskel)', 'threshold'], ['attack', 'Reaktion (attack)', 'attack'],
  ['release', 'Släpper (release)', 'release'], ['knee', 'Mjukhet (knä)', 'knee'], ['postGain', 'Lyft efter', 'postGain'],
];
function panelComp() {
  const all = ui.compSel === 'all';
  const i = all ? 0 : compSel();
  const chips = `<div class="bandrow"><button class="chip${all ? ' sel' : ''}" data-compband="all">Hela låten</button>
    ${COMP_NAMES.map((n, k) => `<button class="chip${!all && k === i ? ' sel' : ''}${en(`mbc${k}`) ? '' : ' off'}" data-compband="${k}">${n}</button>`).join('')}</div>`;
  const rows = COMP_ROWS.map(([p, label, r]) => (all
    ? slider({ id: `p-mbcall-${p}`, label, value: shown().mbc[0][p], range: RANGES[r], info: `mbc.0.${p}`, resetTo: shownPreset().mbc[0][p], kind: 'mbcall', key: p })
    : hpath(`mbc.${i}.${p}`, label, RANGES[r], `mbc.${i}.${p}`)));
  const head = all ? '<div class="bandrow"><small class="dim grow">Alla fyra band får samma inställning – hela låten trycks ihop jämnt.</small>' + infoBtn('compAll') + '</div>'
    : `<div class="bandrow"><small class="dim grow">${COMP_NAMES[i]}: ${bandLabel(MBC_CUTOFFS, i)}</small><span class="bms">${areaBtns(`mbc:${i}`, COMP_NAMES[i])}${infoBtn('areaSolo')}</span></div>`;
  return `${phead({ title: 'Kompressor', enableKey: 'grp_comp', soloKey: 'mbc', mod: 'comp' })}${chips}${head}${srows(rows)}`;
}

function panelLimiter() {
  return `${phead({ title: 'Limiter', enableKey: 'limiter', soloKey: 'limiter', mod: 'limiter' })}
    ${srows([hpath('limiter.threshold', 'Tak', RANGES.limThreshold), hpath('limiter.ratio', 'Styrka (ratio)', RANGES.limRatio),
      hpath('limiter.attack', 'Reaktion (attack)', RANGES.limAttack), hpath('limiter.release', 'Släpper (release)', RANGES.limRelease),
      hpath('limiter.postGain', 'Lyft efter', RANGES.limPostGain)])}`;
}

const resetRow = () => '<div class="pfoot"><button class="btn small" id="flat">Platt</button><button class="btn small" id="all-on">Slå på allt</button><button class="btn small" id="reset-all">Återställ alla</button></div>';

/** In: längst fram i kedjan – hur hårt ljudet driver in i EQ 1, kompressorn och limitern. */
function panelIn() {
  return `${phead({ title: 'In', sub: 'först i kedjan', enableKey: 'input', soloKey: 'input' })}
    ${srows([hpath('inputGain', 'Ingångsförstärkning', RANGES.inputGain, 'inputGain')])}${resetRow()}`;
}

/** Ut: längst bak – slutlig nivå efter limitern. */
function panelOut() {
  const agcOn = ui.status?.agc?.on;
  return `${phead({ title: 'Ut', sub: 'sist i kedjan', enableKey: 'output' })}
    ${srows([hpath('outputGain', 'Utgångsnivå', RANGES.outputGain, 'outputGain')])}
    <div class="pfoot">${agcOn || ui.constant ? '<span class="hint">Nivån hålls automatiskt (Jämn volym / Konstant utnivå). Ut finjusterar.</span>'
      : `<button class="btn small" id="autolevel">Auto-nivåmatcha</button>${infoBtn('autolevel')}`}
      ${ui.levelMsg ? `<span class="hint" id="levelmsg">${esc(ui.levelMsg)}</span>` : ''}</div>${resetRow()}`;
}

export function liveView() {
  const b = block();
  const panel = { quick: panelQuick, in: panelIn, eq1: panelEq1, comp: panelComp, eq2: panelEq2, limiter: panelLimiter, out: panelOut }[b]();
  return `${subbar()}${split({ view: 'live', top: topPart(b), blocks: BLOCKS.map((x) => ({ ...x, dot: blockOn(x.id) })), active: b, panel, topCls: 'tall' })}`;
}

/** Ritar om grafen och raden (vid nytt spektrum, ändring eller ny status) utan att röra fadrarna. */
let curveDrag = false;
export function renderViz(root) {
  const st = root.querySelector('#stop');
  if (st && ui.view === 'live') {
    const box = st.querySelector('.scrbox.edit');
    if (curveDrag && box) { // mitt i ett drag: byt bara bilden, inte elementet som tar emot fingret
      const tmp = document.createElement('div'); tmp.innerHTML = topPart();
      box.innerHTML = tmp.querySelector('.scrbox').innerHTML;
    } else { st.innerHTML = topPart(); bindTop(root); }
  }
  root.querySelectorAll('.blk[data-block]').forEach((el) => { const d = el.querySelector('.dot'); if (d) d.classList.toggle('no', !blockOn(el.dataset.block)); });
  renderSettings();
}
export const renderScreen = renderViz;
/** Live vill ha spektrum när grafen visar det. */
export const wantsSpectrum = () => ui.view === 'live' && ['quick', 'in', 'eq1', 'eq2'].includes(block());
/** Status ändrades: rubrikens knappar, raden och grafens statustext. */
export function refreshStatus(root) {
  const h = root.querySelector('#hdt');
  if (h) { h.outerHTML = headerToggles(); bindStatus(root); }
  const sb = root.querySelector('#subbar');
  if (sb && ui.view === 'live') { sb.outerHTML = subbar(); bindSubbar(root); }
  if (ui.view === 'live') renderViz(root);
}

function bindTop(root) {
  const so = root.querySelector('#solo-off');
  if (so) so.onclick = () => { ui.solo = null; ui.listen = null; changed({ now: true, keepUndo: true }); app.render(); };
  const t = root.querySelector('#takeControl');
  if (t) t.onclick = async () => {
    t.textContent = 'Tar tillbaka…';
    const r = await LiveDsp.takeControl();
    ui.report = { ...r, at: Date.now(), user: true };
    ui.status = await LiveDsp.getStatus();
    renderViz(root);
  };
  bindCurve(root);
  clearTimeout(toastTimer);
  if (root.querySelector('.toast:not(.warn)')) toastTimer = setTimeout(() => { const c = root.querySelector('#confirm.toast:not(.warn)'); if (c) c.outerHTML = '<div id="confirm" hidden></div>'; }, 3100);
}
let toastTimer = 0;

/** Kurvredigeraren: dra en punkt (frekvens i sidled, gain i höjdled), två fingrar = Q. Ett tryck väljer punkten. */
function bindCurve(root) {
  const box = root.querySelector('.scrbox.edit');
  if (!box) return;
  const pts = new Map();
  let drag = null;
  const rect = () => (box.querySelector('svg') || box).getBoundingClientRect();
  const toFG = (e) => {
    const r = rect();
    const x = (e.clientX - r.left) / r.width, yy = (e.clientY - r.top) / r.height;
    const H = 240, range = 12;
    const gain = range - ((yy * H - 6) / (H - 18)) * 2 * range;
    return { f: xToFreq(x), gain };
  };
  box.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { box.setPointerCapture(e.pointerId); } catch { /* */ }
    if (pts.size === 2 && drag) { // nyp: Q
      const [a, b] = [...pts.values()];
      drag.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, q: ui.base.peq[drag.i].q };
      return;
    }
    const r = rect();
    const x = (e.clientX - r.left) / r.width;
    // närmaste punkt i sidled (inom en tiondel av bredden), annars vald punkt
    let best = -1, bd = 0.1;
    ui.base.peq.forEach((b, i) => { const d = Math.abs(freqToX(b.freq) - x); if (d < bd) { bd = d; best = i; } });
    const i = best >= 0 ? best : (eqSel());
    if (ui.eqSel !== i) { ui.eqSel = i; }
    drag = { i, x: e.clientX, y: e.clientY, active: false };
    curveDrag = true;
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const b = ui.base.peq[drag.i], band = PEQ_BANDS[drag.i];
    if (drag.pinch && pts.size === 2) {
      const [p1, p2] = [...pts.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      b.q = Math.round(Math.min(RANGES.peqQ[1], Math.max(RANGES.peqQ[0], drag.pinch.q * (drag.pinch.d / d))) * 10) / 10; // isär = bredare
      changed();
      return;
    }
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return; // ett tryck flyttar inget
    drag.active = true;
    e.preventDefault();
    const { f, gain } = toFG(e);
    const [lo, hi, st] = band.range;
    b.freq = Math.min(hi, Math.max(lo, Math.round(f / st) * st));
    b.gain = Math.min(RANGES.peqGain[1], Math.max(RANGES.peqGain[0], Math.round(gain * 2) / 2));
    changed();
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (pts.size) return;
    const moved = drag && (drag.active || drag.pinch);
    drag = null;
    curveDrag = false;
    app.render(); // reglagen under följer med (och vald punkt)
    if (!moved) return;
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
}

// ---- Händelser ----

export async function toggleOn() {
  if (ui.busy) return;
  ui.busy = true;
  try { ui.status = await LiveDsp.setOn({ on: !ui.status?.on }); } finally { ui.busy = false; app.renderPart('status'); }
}

function selectPreset(id) {
  const p = allPresets().find((x) => x.id === id);
  if (!p) return;
  ui.presetId = id;
  ui.base = structuredClone(sanitize(p.params));
  ui.macros = noMacros();
  ui.amounts = noAmounts();
  ui.mods = {};
  ui.msg = '';
  changed({ now: true });
  app.render();
}

/** Modulpresets: lägg in bara EQ, bara kompressorn eller bara limitern från en annan preset. */
function moduleGroups(mod) {
  const o = (p) => ({ value: p.id, label: p.name, desc: presetEffects(applyModule(neutral(), p.params, mod)).filter((t) => mod === 'limiter' || !t.startsWith('Limiter')).join(' · ').replace(/^Ingen bearbetning.*/, mod === 'limiter' ? 'Bara skyddslimiter vid −1 dB' : 'Platt'), icon: PRESET_ICONS[p.id] || '⭐' });
  const ok = (p) => p.id !== 'test' && (p.id === 'flat' || moduleActive(p.params, mod));
  return [
    ...(ui.userPresets.filter(ok).length ? [{ label: 'Mina', options: ui.userPresets.filter(ok).map(o) }] : []),
    { label: 'Inbyggda', options: BUILTIN_PRESETS.filter(ok).map(o) },
  ];
}
function selectModule(mod, id) {
  const p = allPresets().find((x) => x.id === id);
  if (!p) return;
  ui.base = applyModule(ui.base, p.params, mod);
  ui.mods = { ...ui.mods, [mod]: p.name };
  say(`${MODULES[mod].name} från "${p.name}" – resten är kvar.`);
  changed({ now: true });
  app.render();
}

async function presetMenu() {
  const user = ui.userPresets.some((p) => p.id === ui.presetId);
  const cur = currentPreset();
  const d = sheet(`<h2>${esc(cur?.name || 'Egen inställning')}</h2>
    <p class="hint small" id="pdesc">${esc(cur?.desc || (cur ? 'Din egen preset.' : 'Ändrad från en preset eller platt.'))}</p>
    <p class="affects small" data-testid="affects"><b>Påverkar:</b> ${esc(presetEffects(cur?.params ?? ui.base).join(' · '))}</p>
    <h2 style="margin-top:10px">Presets</h2>
    <div class="menu">
      <button class="btn wide" data-act="save">Spara som…</button>
      <button class="btn wide" data-act="rename" ${user ? '' : 'disabled'}>Döp om</button>
      <button class="btn wide" data-act="delete" ${user ? '' : 'disabled'}>Ta bort</button>
      <button class="btn wide" data-act="export" ${ui.userPresets.length ? '' : 'disabled'}>Exportera mina (${ui.userPresets.length})</button>
      <label class="btn wide file">Importera<input type="file" id="p-import" accept=".json,application/json" hidden></label>
    </div>
    <p class="hint small">Inbyggda presets kan inte döpas om eller tas bort – spara en kopia med "Spara som". Avslagna delar sparas som neutrala.</p>`);
  const done = () => { d.close(); app.render(); };
  d.querySelector('[data-act=save]').onclick = async () => {
    d.close();
    const cur = currentPreset();
    const name = await ask({ title: 'Spara som preset', value: cur?.builtin ? `${cur.name} – min` : (cur?.name || 'Min preset'), okText: 'Spara' });
    if (name === null) return;
    const r = savePreset(ui.userPresets, name, effective());
    ui.userPresets = r.presets;
    await save('presets', ui.userPresets);
    ui.presetId = r.preset.id;
    ui.base = structuredClone(r.preset.params);
    ui.macros = noMacros();
    ui.enabled = allEnabled();
    say(`Sparad som "${r.preset.name}".`);
    changed();
    app.render();
  };
  d.querySelector('[data-act=rename]').onclick = async () => {
    d.close();
    const p = currentPreset();
    const name = await ask({ title: 'Döp om preset', value: p.name, okText: 'Döp om' });
    if (name === null) return;
    ui.userPresets = renamePreset(ui.userPresets, p.id, name);
    await save('presets', ui.userPresets);
    app.render();
  };
  d.querySelector('[data-act=delete]').onclick = async () => {
    d.close();
    const p = currentPreset();
    if (!(await ask({ title: `Ta bort "${p.name}"?`, okText: 'Ta bort' }))) return;
    ui.userPresets = deletePreset(ui.userPresets, p.id);
    await save('presets', ui.userPresets);
    ui.presetId = '';
    say(`"${p.name}" borttagen.`);
    changed();
    app.render();
  };
  d.querySelector('[data-act=export]').onclick = async () => {
    try { await saveFile('masterlab-presets.json', exportPresets(ui.userPresets), 'application/json', fileDeps()); say(`${ui.userPresets.length} presets exporterade.`); } catch (e) { say(`Exporten misslyckades: ${e.message}`); }
    done();
  };
  d.querySelector('#p-import').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const before = ui.userPresets.length;
      ui.userPresets = importPresets(ui.userPresets, await f.text());
      await save('presets', ui.userPresets);
      say(`${ui.userPresets.length - before} presets importerade.`);
    } catch (err) { say(err.message); }
    done();
  };
}

/** Hörlurskorrigeringen skickas till motorn (31 tersband). */
export async function sendCorrection(on = ui.status?.correction?.on) {
  const hp = headphones().find((h) => h.id === ui.corr.id) || BUILTIN_HEADPHONES[0];
  ui.corr = { ...ui.corr, on: !!on, id: hp.id };
  await save('corr', ui.corr);
  const r = await LiveDsp.setCorrection({ on: !!on, correction: correctionToSend(hp) });
  if (r && typeof r === 'object' && 'total' in r) ui.report = { ...r, at: Date.now(), user: true };
  ui.status = await LiveDsp.getStatus();
}

function pickHeadphones() {
  const d = sheet(`<h2>Hörlurar</h2>
    <div class="menu">${headphones().map((h) => `<button class="btn wide ${h.id === ui.corr.id ? 'primary' : ''}" data-hp="${esc(h.id)}">${esc(h.name)}<br><span class="small">${esc(h.source || 'importerad')}</span></button>`).join('')}</div>
    <h2 style="margin-top:14px">Importera från AutoEq</h2>
    <p class="hint small">Sök dina hörlurar på github.com/jaakkopasanen/AutoEq (results), öppna "… ParametricEQ.txt" och klistra in texten här.</p>
    <input id="hp-name" placeholder="Namn, t.ex. Sony WH-1000XM5" maxlength="60">
    <textarea id="hp-text" rows="5" placeholder="Preamp: -6.1 dB&#10;Filter 1: ON LSC Fc 105 Hz Gain 5.2 dB Q 0.70&#10;…"></textarea>
    <button class="btn wide" id="hp-import">Lägg till</button>
    <p class="hint small" id="hp-msg"></p>`);
  d.querySelectorAll('[data-hp]').forEach((b) => {
    b.onclick = async () => { ui.corr.id = b.dataset.hp; d.close(); await sendCorrection(true); ui.corrMsg = ''; renderSettings(); app.renderPart('status'); };
  });
  d.querySelector('#hp-import').onclick = async () => {
    const name = d.querySelector('#hp-name').value.trim() || 'Mina hörlurar';
    const text = d.querySelector('#hp-text').value;
    try {
      parseParametric(text);
      const hp = { id: `hp-${Date.now().toString(36)}`, name, source: 'importerad från AutoEq', text };
      ui.customHeadphones = [...ui.customHeadphones, hp];
      await save('headphones', ui.customHeadphones);
      ui.corr.id = hp.id;
      d.close();
      await sendCorrection(true);
      ui.corrMsg = `"${name}" tillagd och påslagen.`;
      renderSettings();
      app.renderPart('status');
    } catch (e) { d.querySelector('#hp-msg').textContent = e.message; }
  };
}

/** Profiler per ljudutgång: sparas lokalt och i motorn (så att bytet sker även när appen ligger i bakgrunden). */
async function sendProfiles() {
  const native = {};
  for (const [key, p] of Object.entries(ui.profiles)) {
    const hp = headphones().find((h) => h.id === p.corr?.id);
    const eff = applyEnables(applyMacros(applyAmounts(p.base, p.amounts), activeMacros(p.macros, p.enabled)), p.enabled);
    native[key] = { params: toNative(p.constant ? withCompensation(eff) : eff), correction: hp ? { on: !!p.corr.on, ...correctionToSend(hp, p.corr) } : { on: false } };
  }
  await save('profiles', ui.profiles);
  ui.status = await LiveDsp.setProfiles({ profiles: native });
}

/** Utgången bytte och motorn lade på en profil: visa samma inställning i appen. */
export function syncProfileFromStatus(prevKey) {
  const out = ui.status?.output;
  if (!out?.key || out.key === prevKey) return false;
  const p = ui.profiles[out.key];
  if (!p) return false;
  Object.assign(ui, { presetId: p.presetId, base: structuredClone(p.base), macros: { ...noMacros(), ...p.macros }, amounts: { ...noAmounts(), ...p.amounts }, enabled: { ...allEnabled(), ...p.enabled }, constant: p.constant !== false });
  if (p.corr) ui.corr = { ...p.corr };
  return true;
}

export function bindLive(root) {
  bindStatus(root);
  bindSubbar(root);
  bindTop(root);
  bindSliders(root, (kind, key, v) => {
    if (kind === 'path') setShown(key, v);
    if (kind === 'mbcall') [0, 1, 2, 3].forEach((i) => setShown(`mbc.${i}.${key}`, v));
    // Når inte reglaget dit (Snabb håller det vid en gräns): visa det verkliga värdet i stället för att låtsas
    if (kind === 'path' && Math.abs(getPath(shown(), key) - v) > 1e-3) { changed(); app.render(); return; }
    if (kind === 'macro') ui.macros[key] = v;
    changed();
  }, (key, on) => {
    if (key === 'grp_comp') [0, 1, 2, 3].forEach((i) => { ui.enabled[`mbc${i}`] = on; });
    else if (key === 'grp_eq2') ['postEq', 'peq'].forEach((k) => { ui.enabled[k] = on; });
    else ui.enabled[key] = on;
    changed();
    app.render();
  });
  for (const mod of Object.keys(MODULES)) {
    bindPicker(root, `mod-${mod}`, () => ({ title: `${MODULES[mod].name}-preset – bara ${MODULES[mod].name.toLowerCase()} byts`, value: '', groups: moduleGroups(mod) }), (id) => selectModule(mod, id));
  }
  root.querySelectorAll('#spanel [data-solo]').forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      ui.solo = ui.solo === b.dataset.solo ? null : b.dataset.solo;
      if (ui.solo) ui.listen = null;
      changed({ now: true, keepUndo: true });
      app.render();
    };
  });
  root.querySelectorAll('[data-eqband]').forEach((b) => { b.onclick = () => {
    if (b.dataset.eqband === 'graphic') ui.eqView = 'graphic'; else { ui.eqView = 'peq'; ui.eqSel = Number(b.dataset.eqband); }
    app.render();
  }; });
  root.querySelectorAll('[data-eqstage]').forEach((b) => { b.onclick = () => { ui.eqStage = b.dataset.eqstage; app.render(); }; });
  root.querySelectorAll('[data-compband]').forEach((b) => { b.onclick = () => { ui.compSel = b.dataset.compband === 'all' ? 'all' : Number(b.dataset.compband); app.render(); }; });
  // M/S per frekvensområde (lyssningsfilter). Bara ett åt gången, och inte samtidigt som solo på en hel del.
  const listen = (area, mode) => {
    ui.listen = ui.listen?.area === area && ui.listen?.mode === mode ? null : { area, mode };
    if (ui.listen) ui.solo = null;
    changed({ now: true, keepUndo: true });
    app.render();
  };
  root.querySelectorAll('[data-asolo]').forEach((b) => { b.onclick = () => listen(b.dataset.asolo, 'solo'); });
  root.querySelectorAll('[data-amute]').forEach((b) => { b.onclick = () => listen(b.dataset.amute, 'mute'); });
  const pf = root.querySelector('#peq-flat');
  if (pf) pf.onclick = () => { ui.base.peq.forEach((b) => { b.gain = 0; }); changed({ now: true }); app.render(); };
  // svep i sidled i panelen = nästa/föregående block
  const panel = root.querySelector('#spanel');
  if (panel) {
    let sw = null;
    panel.addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY }; });
    panel.addEventListener('pointerup', (e) => {
      if (!sw) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
      if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return;
      const i = BLOCKS.findIndex((x) => x.id === block()) + (dx < 0 ? 1 : -1);
      if (i < 0 || i >= BLOCKS.length) return;
      ui.liveBlock = BLOCKS[i].id;
      app.render();
      setSpectrum(wantsSpectrum());
    });
  }
  root.querySelectorAll('#reset-all').forEach((el) => { el.onclick = () => {
    ui.base = presetBase(); ui.macros = noMacros(); ui.amounts = noAmounts();
    ui.enabled = allEnabled();
    ui.mods = {}; ui.solo = null; ui.listen = null;
    say(currentPreset() ? `Återställd till "${currentPreset().name}".` : 'Återställd.');
    changed({ now: true });
    app.render();
  }; });
  const flat = root.querySelector('#flat');
  if (flat) flat.onclick = () => {
    ui.base = neutral(); ui.macros = noMacros(); ui.amounts = noAmounts(); ui.presetId = ''; ui.mods = {};
    say('Platt: all bearbetning neutral (limitern skyddar fortfarande vid −1 dB).');
    changed({ now: true });
    app.render();
  };
  const allOn = root.querySelector('#all-on');
  if (allOn) allOn.onclick = () => { ui.enabled = allEnabled(); changed({ now: true }); app.render(); };
  const al = root.querySelector('#autolevel');
  if (al) al.onclick = async () => {
    ui.levelMsg = 'Mäter… (ca 8 sekunder, ljudet växlar mellan av och på)';
    app.render();
    try {
      const r = await LiveDsp.autoLevel();
      if (r.ok) { ui.base.outputGain = sanitize({ ...ui.base, outputGain: ui.base.outputGain + r.deltaDb }).outputGain; changed({ now: true }); }
      ui.levelMsg = r.message;
    } catch (e) { ui.levelMsg = e.message; }
    app.render();
  };
}

/** Ett kort meddelande uppe i grafen. */
export function say(msg) { ui.msg = msg; ui.msgAt = Date.now(); }

function bindSubbar(root) {
  bindPicker(root, 'preset', () => ({ title: 'Välj preset', value: ui.presetId, groups: presetGroups() }), selectPreset);
  const o = root.querySelector('#onoff');
  if (o) o.onclick = toggleOn;
  const u = root.querySelector('#undo');
  if (u) u.onclick = () => undo();
  const m = root.querySelector('#p-menu');
  if (m) m.onclick = presetMenu;
}

export function bindStatus(root) {
  const m = root.querySelector('#masterlab');
  if (m) m.onchange = async () => { ui.status = await LiveDsp.setBypass({ on: !m.checked }); app.render(); };
  const c = root.querySelector('#corr');
  if (c) c.onchange = async () => { await sendCorrection(c.checked); app.render(); };
}

/** Kopplar inställningsarket. */
function bindSettings(root) {
  const a = root.querySelector('#agc');
  a.onchange = async () => {
    ui.agcMsg = '';
    try { ui.status = await LiveDsp.setAgc({ on: a.checked }); } catch (e) { ui.agcMsg = e.message; }
    renderSettings();
    app.renderPart('status');
  };
  root.querySelector('#constant').onchange = (e) => { ui.constant = e.target.checked; changed({ now: true }); renderSettings(); };
  root.querySelector('#volcomp').onchange = async (e) => { ui.status = await LiveDsp.setVolComp({ on: e.target.checked }); renderSettings(); };
  root.querySelector('#corr-level').onchange = async (e) => {
    ui.corr = { ...ui.corr, level: e.target.checked };
    await save('corr', ui.corr);
    if (ui.status?.correction?.on) await sendCorrection(true);
    renderSettings();
  };
  root.querySelector('#corr-pick').onclick = pickHeadphones;
  let strengthTimer = 0;
  bindSliders(root.querySelector('#settings-body') || root, (kind, key, v) => {
    if (kind !== 'corr') return;
    ui.corr = { ...ui.corr, strength: v };
    clearTimeout(strengthTimer);
    strengthTimer = setTimeout(async () => { await save('corr', ui.corr); if (ui.status?.correction?.on) await sendCorrection(true); renderSettings(); }, 250);
  });
  const ps = root.querySelector('#prof-save');
  if (ps) ps.onclick = async () => {
    const out = ui.status.output;
    const label = currentPreset()?.name || 'egen inställning';
    ui.profiles = { ...ui.profiles, [out.key]: { label, presetId: ui.presetId, base: ui.base, macros: ui.macros, amounts: ui.amounts, enabled: ui.enabled, constant: ui.constant, corr: { ...ui.corr, on: !!ui.status.correction?.on } } };
    await sendProfiles();
    renderSettings();
  };
  const pd = root.querySelector('#prof-del');
  if (pd) pd.onclick = async () => {
    const { [ui.status.output.key]: _, ...rest } = ui.profiles;
    ui.profiles = rest;
    await sendProfiles();
    renderSettings();
  };
}
