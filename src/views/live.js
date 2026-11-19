// Live-vyn: PÅ/AV och Bypass, smarta funktioner (jämn volym, konstant utnivå, volymoberoende kompression,
// hörlurskorrigering, profil per enhet), presets, Enkelt/Avancerat med på/av, ⓘ, ↺ och −/+ på allt, och kurvor
// som visar vad inställningarna gör.
import { LiveDsp, isNative } from '../livedsp.js';
import { ui, app } from '../state.js';
import { load, save } from '../store.js';
import {
  BUILTIN_PRESETS, EQ_CUTOFFS, MACROS, MODULES, PEQ_BANDS, AMOUNT_KEYS, applyAmounts, noAmounts, applyModule, moduleActive, soloParams, MACRO_GROUPS, MBC_CUTOFFS, presetEffects, MBC_NAMES, RANGES, activeMacros, allEnabled, applyEnables,
  applyMacros, bandLabel, deletePreset, exportPresets, importPresets, neutral, noMacros, renamePreset, sanitize,
  savePreset, toNative,
} from '../chain.js';
import { ask, bindPicker, bindSliders, esc, fmtDb, getPath, infoBtn, picker, setPath, sheet, slider, saveFile, soloBtn, toggle, vfader } from '../ui.js';
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
    const r = await LiveDsp.setParams({ params: toNative(sendParams()) });
    if (r && typeof r === 'object') { ui.report = { ...r, at: Date.now(), user: user || undone, undone }; app.renderPart('confirm'); }
  };
  if (now) send(); else sendTimer = setTimeout(send, 60);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save('state', { presetId: ui.presetId, base: ui.base, macros: ui.macros, mode: ui.mode, enabled: ui.enabled, constant: ui.constant, mods: ui.mods, amounts: ui.amounts, mixPage: ui.mixPage }), 300);
  const d = document.querySelector('#dirty');
  if (d) d.hidden = !isDirty();
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
    ui.mixPage = st.mixPage === 'chain' ? 'chain' : 'macros';
    ui.enabled = { ...allEnabled(), ...st.enabled };
    ui.constant = st.constant !== false;
    ui.mods = st.mods || {};
  }
  ui.solo = null; // solo gäller bara medan man lyssnar
  ui.amounts ||= noAmounts();
}

// ---- Delar ----

const PRESET_ICONS = { 'mjuk-kick': '🥁', 'radio-ljus': '📻', 'silkeslen-rost': '🎤', 'varm-lim': '🧡', transparent: '◻️', 'suno-fix': '🛠️',
  'bas-varm': '🔊', 'tat-pop': '✨', 'hiphop-punch': '👊', 'edm-hogt': '⚡', akustisk: '🎸', ballad: '🎙️', rock: '🤘', lofi: '📼', natt: '🌙', horlurar: '🎧', test: '🧪',
  flat: '⚪', 'rnb-silke': '🌙', 'trap-808': '🔈', schlager: '💃', indie: '🌿', metal: '🔥', jazz: '🎷', film: '🎬', reggaeton: '🌴', bil: '🚗', telefon: '📱', gym: '🏋️', 'demo-check': '🔍' };

/**
 * Två huvudbrytare högst upp: 🎧 Hörlurar (bara korrigeringen) och Masterlab (allt annat). Med Masterlab på finns
 * växeln Original | Mastrad för att jämföra.
 */
export function onButton() {
  const s = ui.status || {};
  const agc = s.agc?.on;
  const hpOn = !!s.correction?.on, appOn = !s.bypass;
  const mode = !s.running && (s.on || hpOn) ? 'STARTAR…' : !appOn ? (hpOn ? 'BARA HÖRLURSKORRIGERING' : 'HELT ORIGINAL') : s.on ? 'MASTRAT' : agc ? 'ORIGINAL · NIVÅMATCHAT' : 'ORIGINAL';
  return `<div class="mains">
      <label class="main ${hpOn ? 'on' : ''}"><input type="checkbox" id="corr" ${hpOn ? 'checked' : ''} aria-label="Hörlurskorrigering">
        <span class="mi">🎧</span><span class="mt"><b>Hörlurar</b><small>${hpOn ? esc(headphones().find((h) => h.id === ui.corr?.id)?.name || 'neutralt') : 'av'}</small></span><i class="mtog"></i></label>
      <label class="main ${appOn ? 'on' : ''}"><input type="checkbox" id="masterlab" ${appOn ? 'checked' : ''} aria-label="Masterlab (bearbetning)">
        <span class="mi">🎚️</span><span class="mt"><b>Masterlab</b><small>${appOn ? 'mastring och smart' : 'av – gör inget'}</small></span><i class="mtog"></i></label>
    </div>
    ${appOn ? `<button class="abswitch ${s.on ? 'on' : ''}" id="onoff" aria-pressed="${!!s.on}" aria-label="Mastrad på/av">
      <span class="o">Original</span><span class="m">Mastrad</span></button>` : ''}
    <p class="status"><b data-testid="mode">${mode}</b> · <span data-testid="motor">${s.running
      ? (s.globalActive ? 'Bearbetar allt ljud' : `Bearbetar ${s.sessions.filter((x) => x.attached).length} spelande appar`)
      : 'Motorn står still – slå på Mastrad eller Hörlurar'}</span>${s.output?.name ? ` · ${esc(s.output.name)}` : ''}${infoBtn('mains', 'Om huvudbrytarna')}</p>`;
}

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

/** Bara vald preset syns – tryck för att byta (appens egen lista). */
function presetCard() {
  const p = currentPreset();
  return `<section class="card presetcard">
    <button class="pselect" id="preset" aria-label="Preset" aria-haspopup="listbox">
      <span class="ico">${PRESET_ICONS[p?.id] || (p ? '⭐' : '✎')}</span>
      <span class="pt"><small class="lbl">PRESET <span id="dirty" ${isDirty() ? '' : 'hidden'}>· ändrad</span></small><b class="pv">${esc(p?.name || '(egen inställning)')}</b></span>
      <span class="chev">Byt ▾</span>
    </button>
    <p class="affects" data-testid="affects"><b>Påverkar:</b> ${esc(presetEffects(p?.params ?? ui.base).join(' · '))}</p>
    <div class="mods" aria-label="Byt en del">${Object.entries(MODULES).map(([k, m]) => `<button class="modbtn${ui.mods?.[k] ? ' set' : ''}" id="mod-${k}" aria-label="${m.name}-preset">
      <small>${m.name}</small><b>${esc(ui.mods?.[k] || 'Byt ▾')}</b></button>`).join('')}${infoBtn('modules')}</div>
    <div class="row prow"><span class="hint small" id="pdesc">${esc(p?.desc || (p ? 'Din egen preset.' : 'Ändrad från en preset eller platt.'))}</span>
      <button class="btn small ghost" id="p-menu" aria-label="Hantera presets">⋯</button>${infoBtn('presets')}</div>
    ${ui.msg ? `<p class="hint small" id="msg">${esc(ui.msg)}</p>` : ''}
  </section>`;
}

const path = (key, label, range, info = key, enableKey = null) =>
  slider({ id: `p-${key.replace(/\./g, '-')}`, label, value: getPath(ui.base, key), range, info, resetTo: getPath(presetBase(), key), kind: 'path', key,
    enable: enableKey ? { key: enableKey, on: en(enableKey) } : null });

function levelBlock() {
  const agcOn = ui.status?.agc?.on;
  return `${path('outputGain', 'Utgångsnivå', RANGES.outputGain, 'outputGain', 'output')}
    ${agcOn || ui.constant ? '<p class="hint small">Nivån hålls automatiskt (Jämn volym / Konstant utnivå). Reglaget finjusterar.</p>'
      : `<div class="btnrow"><button class="btn small" id="autolevel">Auto-nivåmatcha</button>${infoBtn('autolevel')}</div>`}
    ${ui.levelMsg ? `<p class="hint" id="levelmsg">${esc(ui.levelMsg)}</p>` : ''}`;
}

/** Kurvorna: klangkurva + kompression. Ritas om medan du drar (app.renderPart('viz')). */
export function vizPart(kind = 'all') {
  const p = heard();
  const e = estimate(p);
  const hp = headphones().find((h) => h.id === ui.corr?.id);
  const corr = ui.status?.correction?.on && hp ? correctionToSend(hp) : null;
  const eq = kind !== 'comp' ? eqCurveSvg({ pre: p.preEq.map((b) => b.gain), post: p.postEq.map((b) => b.gain), peq: p.peq, corr }) : '';
  const comp = kind !== 'eq' ? compCurvesSvg({ mbc: p.mbc, limiter: p.limiter, gr: e.mbcGr, limGr: e.limGr, enabled: ui.enabled }) : '';
  return eq + comp;
}

const SHORT_MACRO = { kick: 'Kick', bright: 'Ljus', punch: 'Tryck', vocal: 'Röst', sibilance: 'S-ljud', glitter: 'Topp' };

/** Skärmen överst i Mixer: spektrum (om analysen går) och klangkurvan – alltid synlig (fäst när man scrollar). */
function screenPart(kind) {
  const p = heard();
  const sel = ui.curveSel ?? 2;
  const handles = kind === 'curve' ? p.peq.map((b, i) => ({ f: b.freq, gain: b.gain, sel: i === sel, off: !en('peq') || !en(`peq${i}`) })) : [];
  return spectrumEqSvg({ bands: ui.spectrum?.bands, edges: BAND_EDGES, p, handles, H: kind === 'curve' ? 230 : 110 })
    + (ui.spectrum?.bands ? '' : '<small class="dim scrhint">Spektrum visas när ljudanalysen är tillåten (Mer → Behörigheter).</small>');
}

/** Mixer: lodräta fadrar med M och S. Två sidor – Reglage (de sex enkla) och Kedjan (varje del). Svep i sidled byter. */
function mixerCard() {
  const page = ui.mixPage === 'chain' ? 'chain' : 'macros';
  const macros = MACROS.map((m) => vfader({ id: `m-${m.key}`, label: m.label, short: SHORT_MACRO[m.key] || m.label, value: ui.macros[m.key] ?? 0, range: [-100, 100, 1, ''],
    kind: 'macro', key: m.key, resetTo: 0, enable: { key: `m_${m.key}`, on: en(`m_${m.key}`) }, soloKey: `m_${m.key}`, soloOn: ui.solo === `m_${m.key}`, info: m.key })).join('');
  const am = (k, label, short, en1, soloKey, info, on = en(en1)) => vfader({ info, id: `a-${k}`, label: `${label} mängd`, short, value: ui.amounts?.[k] ?? 100, range: [0, 200, 5, '%'], kind: 'amount', key: k,
    resetTo: 100, enable: { key: en1, on }, soloKey, soloOn: ui.solo === soloKey });
  const pb = presetBase();
  const chain = [
    vfader({ id: 'p-inputGain', label: 'Ingång', short: 'In', value: ui.base.inputGain, range: RANGES.inputGain, kind: 'path', key: 'inputGain', resetTo: pb.inputGain, enable: { key: 'input', on: en('input') }, soloKey: 'input', soloOn: ui.solo === 'input', info: 'inputGain' }),
    am('preEq', 'Pre-EQ', 'Pre-EQ', 'preEq', 'preEq', 'sec_preEq'),
    am('comp', 'Kompressor', 'Kompr.', 'grp_comp', 'mbc', 'sec_mbc', [0, 1, 2, 3].some((i) => en(`mbc${i}`))),
    am('postEq', 'Post-EQ', 'Post-EQ', 'postEq', 'postEq', 'sec_postEq'),
    am('peq', 'Parametrisk EQ', 'PEQ', 'peq', 'peq', 'sec_peq'),
    vfader({ id: 'p-limiter-threshold', label: 'Limiterns tak', short: 'Limiter', value: ui.base.limiter.threshold, range: RANGES.limThreshold, kind: 'path', key: 'limiter.threshold', resetTo: pb.limiter.threshold, enable: { key: 'limiter', on: en('limiter') }, soloKey: 'limiter', soloOn: ui.solo === 'limiter', info: 'limiter.threshold' }),
    vfader({ id: 'p-outputGain', label: 'Utgångsnivå', short: 'Ut', value: ui.base.outputGain, range: RANGES.outputGain, kind: 'path', key: 'outputGain', resetTo: pb.outputGain, enable: { key: 'output', on: en('output') }, info: 'outputGain' }),
  ].join('');
  return `<section class="card mixer" id="mixer">
    <div class="mixtabs" role="tablist"><button data-mixpage="macros" class="${page === 'macros' ? 'sel' : ''}" role="tab">Reglage</button><button data-mixpage="chain" class="${page === 'chain' ? 'sel' : ''}" role="tab">Kedjan</button>
      <span class="grow"></span>${infoBtn(page === 'macros' ? 'mixer' : 'mixerChain')}</div>
    <div class="faders ${page}" id="faders">${page === 'macros' ? macros : chain}</div>
    <p class="hint small mixhint">Dra uppåt/nedåt. Dubbeltryck på namnet = nollställ. M = av, S = hör bara den. Svep i sidled = byt sida.</p>
    ${page === 'chain' ? (ui.status?.agc?.on || ui.constant ? '<p class="hint small">Nivån hålls automatiskt (Jämn volym / Konstant utnivå). Ut finjusterar.</p>'
      : `<div class="btnrow"><button class="btn small" id="autolevel">Auto-nivåmatcha</button>${infoBtn('autolevel')}</div>`) : ''}
    ${ui.levelMsg ? `<p class="hint" id="levelmsg">${esc(ui.levelMsg)}</p>` : ''}
    <div class="row bottomrow"><span class="grow"></span><button class="btn small" id="reset-all">Återställ alla</button></div>
  </section>`;
}

/** Kurva: dra de fem EQ-punkterna direkt i spektrumet (två fingrar = Q), finjustera med reglagen under. */
function curveCard() {
  const sel = ui.curveSel ?? 2, b = PEQ_BANDS[sel];
  return `<section class="card curve" id="curve">
    <div class="chips" role="tablist">${PEQ_BANDS.map((x, i) => `<button class="chip${i === sel ? ' sel' : ''}${en(`peq${i}`) ? '' : ' off'}" data-band="${i}" role="tab" aria-selected="${i === sel}">${i + 1} ${esc(x.name.replace(/ \(hylla\)/, ''))}</button>`).join('')}</div>
    <div class="row cbhead"><label class="mbtn big" title="Mute"><input type="checkbox" data-enable="peq${sel}" ${en(`peq${sel}`) ? 'checked' : ''} aria-label="Mute ${esc(b.name)}"><span>M</span></label>
      ${solo(`peq${sel}`, b.name)}<b class="grow">${esc(b.name)}</b><small class="dim">${b.type === 'peaking' ? 'klocka' : 'hylla'}</small>${infoBtn('sec_peq')}</div>
    ${path(`peq.${sel}.freq`, 'Frekvens', b.range, 'peqFreq')}
    ${path(`peq.${sel}.gain`, 'Gain', RANGES.peqGain, 'peqGain')}
    ${path(`peq.${sel}.q`, b.type === 'peaking' ? 'Q (bredd)' : 'Q (branthet)', RANGES.peqQ, 'peqQ')}
    <div class="row bottomrow"><button class="btn small" id="peq-flat">Platta ut kurvan</button><span class="grow"></span><button class="btn small" id="reset-all">Återställ alla</button></div>
  </section>`;
}

const section = (id, title, info, body, { open = false, enableKey = null, soloKey = enableKey } = {}) =>
  `<details class="sec${enableKey && !en(enableKey) ? ' off' : ''}" data-sec="${id}" ${open ? 'open' : ''}><summary>${enableKey ? toggle(enableKey, en(enableKey), title) : ''}${esc(title)}${infoBtn(info, `Om ${title}`)}${soloKey ? `<span class="grow"></span>${solo(soloKey, title)}` : ''}</summary><div class="secbody">${body}</div></details>`;

function advancedCard() {
  const eq = (k) => EQ_CUTOFFS.map((_, i) => path(`${k}.${i}.gain`, bandLabel(EQ_CUTOFFS, i), RANGES.eqGain)).join('');
  const mbc = MBC_CUTOFFS.map((_, i) => `<details class="band${en(`mbc${i}`) ? '' : ' off'}"><summary>${toggle(`mbc${i}`, en(`mbc${i}`), MBC_NAMES[i])}${esc(MBC_NAMES[i])}${infoBtn(`mbcBand${i}`)}<span class="grow"></span>${solo(`mbc${i}`, MBC_NAMES[i])}</summary>
      ${path(`mbc.${i}.threshold`, 'Tröskel', RANGES.threshold)}
      ${path(`mbc.${i}.ratio`, 'Ratio', RANGES.ratio)}
      ${path(`mbc.${i}.attack`, 'Attack', RANGES.attack)}
      ${path(`mbc.${i}.release`, 'Release', RANGES.release)}
      ${path(`mbc.${i}.knee`, 'Knä', RANGES.knee)}
      ${path(`mbc.${i}.preGain`, 'Förstärkning före', RANGES.preGain)}
      ${path(`mbc.${i}.postGain`, 'Förstärkning efter', RANGES.postGain)}
    </details>`).join('');
  const peq = PEQ_BANDS.map((b, i) => `<details class="band${en(`peq${i}`) ? '' : ' off'}"><summary>${toggle(`peq${i}`, en(`peq${i}`), b.name)}${esc(b.name)}
      <small class="dim pqsum">${ui.base.peq[i].gain ? `${fmtDb(ui.base.peq[i].gain)} dB` : 'platt'}</small><span class="grow"></span>${solo(`peq${i}`, b.name)}</summary>
      ${path(`peq.${i}.freq`, 'Frekvens', b.range, 'peqFreq')}
      ${path(`peq.${i}.gain`, 'Gain', RANGES.peqGain, 'peqGain')}
      ${path(`peq.${i}.q`, b.type === 'peaking' ? 'Q (bredd)' : 'Q (branthet)', RANGES.peqQ, 'peqQ')}
    </details>`).join('');
  return `<section class="card" id="advanced">
    <div class="vizbox" data-vizbox="eq">${vizPart('eq')}</div>
    ${section('input', 'Ingång', 'sec_input', path('inputGain', 'Ingångsförstärkning', RANGES.inputGain), { open: true, enableKey: 'input' })}
    ${section('preEq', 'Pre-EQ', 'sec_preEq', eq('preEq'), { enableKey: 'preEq' })}
    ${section('mbc', 'Multiband-kompressor', 'sec_mbc', `<div class="vizbox" data-vizbox="comp">${vizPart('comp')}</div>${mbc}`, { soloKey: 'mbc' })}
    ${section('postEq', 'Post-EQ', 'sec_postEq', eq('postEq'), { enableKey: 'postEq' })}
    ${section('peq', 'Parametrisk EQ (Q)', 'sec_peq', peq, { enableKey: 'peq' })}
    ${section('limiter', 'Limiter', 'sec_limiter', `
      ${path('limiter.threshold', 'Tak', RANGES.limThreshold)}
      ${path('limiter.ratio', 'Ratio', RANGES.limRatio)}
      ${path('limiter.attack', 'Attack', RANGES.limAttack)}
      ${path('limiter.release', 'Release', RANGES.limRelease)}
      ${path('limiter.postGain', 'Efterförstärkning', RANGES.limPostGain)}`, { enableKey: 'limiter' })}
    ${section('output', 'Utgång', 'sec_output', levelBlock())}
    <div class="btnrow"><button class="btn small" id="reset-all">Återställ alla</button><button class="btn small" id="flat">Platt</button><button class="btn small" id="all-on">Slå på allt</button></div>
  </section>`;
}

/** Så länge något är solat: tydlig rad med knapp för att sluta. */
function soloBar() {
  if (!ui.solo) return '';
  return `<div class="solobar" role="status" data-testid="solobar"><span><b>S</b> Solo: bara <b>${esc(SOLO_NAMES()[ui.solo] || ui.solo)}</b> hörs – resten av kedjan är neutral.${infoBtn('solo')}</span>
    <button class="btn small" id="solo-off">Avsluta solo</button></div>`;
}

export function liveView() {
  const m = ui.mode;
  const screen = m === 'advanced' ? '' : `<div class="screen ${m}" id="screen"><div class="scrbox" data-screen="${m}">${screenPart(m)}</div></div>`;
  return `
    <section class="hero" id="statusArea">${onButton()}</section>
    ${presetCard()}
    ${soloBar()}
    <div class="seg seg3" role="tablist">
      <button data-mode="mixer" class="${m === 'mixer' ? 'sel' : ''}">Mixer</button>
      <button data-mode="curve" class="${m === 'curve' ? 'sel' : ''}">Kurva</button>
      <button data-mode="advanced" class="${m === 'advanced' ? 'sel' : ''}">Avancerat</button>
      ${infoBtn(m === 'mixer' ? 'mixer' : m === 'curve' ? 'curveMode' : 'advanced')}
    </div>
    ${screen}
    ${m === 'mixer' ? mixerCard() : m === 'curve' ? curveCard() : advancedCard()}`;
}

/** Ritar om kurvorna (och nivåkompensationen) utan att röra reglagen. */
export function renderViz(root) {
  root.querySelectorAll('[data-vizbox]').forEach((el) => { el.innerHTML = vizPart(el.dataset.vizbox); });
  renderScreen(root);
  root.querySelectorAll('[data-gsum]').forEach((el) => {
    const ms = MACROS.filter((m) => m.group === el.dataset.gsum);
    el.textContent = ms.map((m) => `${m.label} ${en(`m_${m.key}`) ? (ui.macros[m.key] > 0 ? '+' : '') + (ui.macros[m.key] || 0) : 'av'}`).join(' · ');
  });
  renderSettings();
}

/** Ritar om skärmen (spektrum + kurva) – vid nytt spektrum och vid varje ändring. */
export function renderScreen(root) {
  root.querySelectorAll('[data-screen]').forEach((el) => { el.innerHTML = screenPart(el.dataset.screen); });
}
/** Live-vyn vill ha spektrum i Mixer och Kurva. */
export const wantsSpectrum = () => ui.view === 'live' && ui.mode !== 'advanced';

/** Bakar in enkla reglage och mängder i grunden (när man går från Mixer till Kurva/Avancerat). */
function bakeMixer() {
  ui.base = applyMacros(withAmounts(), activeMacros(ui.macros, ui.enabled));
  ui.macros = noMacros();
  ui.amounts = noAmounts();
}

/** Kurvredigeraren: dra en punkt (frekvens i sidled, gain i höjdled), två fingrar = Q. Ett tryck väljer punkten. */
function bindCurve(root) {
  const box = root.querySelector('.scrbox[data-screen="curve"]');
  if (!box) return;
  const pts = new Map();
  let drag = null;
  const rect = () => (box.querySelector('svg') || box).getBoundingClientRect();
  const toFG = (e) => {
    const r = rect();
    const x = (e.clientX - r.left) / r.width, yy = (e.clientY - r.top) / r.height;
    const H = 230, range = 12;
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
    const i = best >= 0 ? best : (ui.curveSel ?? 2);
    if (ui.curveSel !== i) { ui.curveSel = i; renderScreen(root); }
    drag = { i, x: e.clientX, y: e.clientY, active: false };
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
  ui.msg = `${MODULES[mod].name} från "${p.name}" – resten är kvar.`;
  changed({ now: true });
  app.render();
}

async function presetMenu() {
  const user = ui.userPresets.some((p) => p.id === ui.presetId);
  const d = sheet(`<h2>Presets</h2>
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
    ui.msg = `Sparad som "${r.preset.name}".`;
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
    ui.msg = `"${p.name}" borttagen.`;
    changed();
    app.render();
  };
  d.querySelector('[data-act=export]').onclick = async () => {
    try { await saveFile('masterlab-presets.json', exportPresets(ui.userPresets), 'application/json', fileDeps()); ui.msg = `${ui.userPresets.length} presets exporterade.`; } catch (e) { ui.msg = `Exporten misslyckades: ${e.message}`; }
    done();
  };
  d.querySelector('#p-import').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const before = ui.userPresets.length;
      ui.userPresets = importPresets(ui.userPresets, await f.text());
      await save('presets', ui.userPresets);
      ui.msg = `${ui.userPresets.length - before} presets importerade.`;
    } catch (err) { ui.msg = err.message; }
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
  bindSliders(root, (kind, key, v) => {
    if (kind === 'path') setPath(ui.base, key, v);
    if (kind === 'macro') ui.macros[key] = v;
    if (kind === 'amount') ui.amounts = { ...ui.amounts, [key]: v };
    changed();
  }, (key, on) => {
    if (key === 'grp_comp') { [0, 1, 2, 3].forEach((i) => { ui.enabled[`mbc${i}`] = on; }); changed(); return; }
    if (key.startsWith('grp_')) { // gruppknappen slår av/på alla reglage i gruppen
      MACROS.filter((m) => m.group === key.slice(4)).forEach((m) => { ui.enabled[`m_${m.key}`] = on; });
      changed();
      app.render();
      return;
    }
    ui.enabled[key] = on;
    changed();
  });
  root.querySelectorAll('[data-mode]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.mode === ui.mode) return;
      if (ui.mode === 'mixer') bakeMixer(); // enkla reglage och mängder bakas in i grunden
      ui.mode = b.dataset.mode;
      changed();
      app.render();
      setSpectrum(wantsSpectrum());
    };
  });
  bindPicker(root, 'preset', () => ({ title: 'Välj preset', value: ui.presetId, groups: presetGroups() }), selectPreset);
  for (const mod of Object.keys(MODULES)) {
    bindPicker(root, `mod-${mod}`, () => ({ title: `${MODULES[mod].name}-preset – bara ${MODULES[mod].name.toLowerCase()} byts`, value: '', groups: moduleGroups(mod) }), (id) => selectModule(mod, id));
  }
  root.querySelectorAll('[data-solo]').forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation(); // i en <summary>: fäll inte ut
      ui.solo = ui.solo === b.dataset.solo ? null : b.dataset.solo;
      changed({ now: true, keepUndo: true });
      app.render();
    };
  });
  const so = root.querySelector('#solo-off');
  if (so) so.onclick = () => { ui.solo = null; changed({ now: true, keepUndo: true }); app.render(); };
  root.querySelectorAll('[data-mixpage]').forEach((b) => { b.onclick = () => { ui.mixPage = b.dataset.mixpage; changed({ keepUndo: true, user: false }); app.render(); }; });
  const mixer = root.querySelector('#mixer');
  if (mixer) { // svep i sidled = byt sida
    let sw = null;
    mixer.addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY }; });
    mixer.addEventListener('pointerup', (e) => {
      if (!sw) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) { ui.mixPage = dx < 0 ? 'chain' : 'macros'; app.render(); }
    });
  }
  root.querySelectorAll('[data-band]').forEach((b) => { b.onclick = () => { ui.curveSel = Number(b.dataset.band); app.render(); }; });
  const pf = root.querySelector('#peq-flat');
  if (pf) pf.onclick = () => { ui.base.peq.forEach((b) => { b.gain = 0; }); changed({ now: true }); app.render(); };
  bindCurve(root);
  root.querySelector('#p-menu').onclick = presetMenu;
  root.querySelector('#reset-all').onclick = () => {
    ui.base = presetBase(); ui.macros = noMacros(); ui.amounts = noAmounts();
    ui.enabled = allEnabled();
    ui.mods = {}; ui.solo = null;
    ui.msg = currentPreset() ? `Återställd till "${currentPreset().name}".` : 'Återställd.';
    changed({ now: true });
    app.render();
  };
  const flat = root.querySelector('#flat');
  if (flat) flat.onclick = () => {
    ui.base = neutral(); ui.macros = noMacros(); ui.amounts = noAmounts(); ui.presetId = ''; ui.mods = {};
    ui.msg = 'Platt: all bearbetning neutral (limitern skyddar fortfarande vid −1 dB).';
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

export function bindStatus(root) {
  const m = root.querySelector('#masterlab');
  if (m) m.onchange = async () => { ui.status = await LiveDsp.setBypass({ on: !m.checked }); app.render(); };
  const c = root.querySelector('#corr');
  if (c) c.onchange = async () => { await sendCorrection(c.checked); app.render(); };
  const o = root.querySelector('#onoff');
  if (o) o.onclick = toggleOn;
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
