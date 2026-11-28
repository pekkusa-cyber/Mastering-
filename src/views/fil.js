// Fil-vyn – samma upplägg och flöde som Live: graf överst (Våg / Spektrum / Mätare), block i ljudets ordning
// (Snabb | In → EQ 1 → Kompr. → EQ 2 → Färg → Limiter → Ut) och en panel för valt block. Allt hörs direkt i
// realtidsspelaren; mätare och export räknas om när man trycker Rendera. Lägen: Assistent (5 steg), Jämför
// (loop + versioner + blindtest) och Album. Låten och inställningarna sparas automatiskt på telefonen.
import { isNative, LiveDsp } from '../livedsp.js';
import { ui, app } from '../state.js';
import { save, load } from '../store.js';
import { BUILTIN_PRESETS, EQ_CUTOFFS, MBC_CUTOFFS, MBC_NAMES, RANGES, PEQ_BANDS, MODULES, bandLabel, areaRange, moduleActive, presetEffects } from '../chain.js';
import { FILE_RANGES, FILE_STAGES, MATCH_FREQS, TARGETS, applyFileEnables, fileCharacter, masterChecks, fileNeutral, liveToFile, sanitizeFile, exportFileSettings, parseFileSettings } from '../master.js';
import { compareProfiles, matchEqCurve, profileFromChannels, toFileMatchEq } from '../analysis.js';
import { currentRef, selectRef } from '../refs.js';
import { ask, bindPicker, bindSliders, esc, fmtDb, getPath, infoBtn, picker, saveFile, setPath, sheet, slider, soloBtn, split, toggle, vfader } from '../ui.js';
import { spectrumSvg, bindSpectrum } from '../spectrum.js';
import { decodeFile, mmss, resample } from '../audio.js';
import { AbPlayer, RealtimePlayer, renderInWorker } from '../filemaster.js';
import { encodeWav } from '../dsp/wav.js';
import { truePeak } from '../dsp/truepeak.js';
import { measure } from '../dsp/loudness.js';
import { AUTO_STRENGTHS, AUTO_STYLES, autoMaster, diagnose, edgeLevels } from '../automaster.js';
import { PRESET_ICONS, allPresets, presetGroups, removeUserPreset } from './live.js';
import { refGroups } from './analys.js';
import { saveSong, loadSong, forgetSong, saveFileState, loadFileState } from '../filestore.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const realtime = RealtimePlayer.supported();
const player = realtime ? new RealtimePlayer() : new AbPlayer();
const F = (ui.file = {
  name: '', input: null, profile: null, presetId: '', params: sanitizeFile(fileNeutral()),
  enabled: {}, matchAmount: 70, result: null, rendering: false, progress: 0, msg: '', ab: 'master', matched: true, autoMatch: true,
  bits: 24, rate: 44100, exportMsg: '', versions: [], versionId: '', album: [], albumMsg: '', albumBusy: false,
  mode: 'blocks', graph: 'wave', eqView1: 'graphic', eqView2: 'graphic', eqSel: 2, compSel: 'all', fargSel: 'deEss',
  solo: null, listen: null, delta: false, mono: false, sim: 'normal', loop: null, undo: [], meter: null,
  assistStep: 1, assistPick: 'B', compare: null, saved: false,
});
load('fileVersions', []).then((v) => { F.versions = v; });
/** Versionerna hör till låten de sparades för (äldre sparningar utan låtnamn visas för alla). */
const songVersions = () => F.versions.filter((v) => !v.song || v.song === F.name);

const presetOf = (id) => allPresets().find((p) => p.id === id);
const fileDeps = () => ({ isNative, Filesystem, Directory, Encoding, Share });
const en = (k) => F.enabled[k] !== false;
/** Inställningen som exporteras: avslagna delar neutrala. */
/** Till direktlyssningen: alltid med låtens nivå in (nivåanpassningen), även för versioner och förslag. */
const playParams = (p, drive) => {
  const q = { ...p, inLufs: F.inLufs ?? null };
  if (typeof window !== 'undefined') window.__filParams = q; // det som spelas just nu (testerna läser det)
  player.setParams(q, drive);
};
const effective = () => ({ ...applyFileEnables(F.params, F.enabled), inLufs: F.inLufs ?? null });

/** Solo på en hel del: bara den delen är på (ingen annan bearbetning), resten av kedjan neutral. Bara i spelaren. */
const SOLO_STAGES = { trim: ['trim'], preEq: ['preEq'], match: ['match'], mbc: ['mbc0', 'mbc1', 'mbc2', 'mbc3', 'kick'], kick: ['kick', 'mbc0'],
  postEq: ['postEq'], deEss: ['deEss'], glitter: ['glitter'], width: ['width'], glue: ['glue'], clip: ['clip'] };
const SOLO_NAME = { trim: 'In', preEq: 'EQ 1', match: 'Match-EQ', mbc: 'Kompressor', kick: 'Kick-anslag', postEq: 'EQ 2', deEss: 'S-ljud', glitter: 'Mjuk topp', width: 'Bredd', glue: 'Lim', clip: 'Soft clip' };
function heard() {
  if (!F.solo) return effective();
  const on = new Set(SOLO_STAGES[F.solo] || [F.solo]);
  const e = Object.fromEntries(FILE_STAGES.map((k) => [k, on.has(k) && en(k)]));
  e.output = en('output');
  return { ...applyFileEnables(F.params, e), inLufs: F.inLufs ?? null };
}

/** ↺ och "Återställ alla" går tillbaka till: vald preset med valt mål. */
function presetFileParams() {
  const p = presetOf(F.presetId);
  // Orörd: ingen bearbetning – bara målnivån och true-peak-taket (som alltid måste hållas för en exportfil)
  if (!p || p.id === 'flat') return sanitizeFile({ ...fileNeutral(), target: F.params.target });
  return liveToFile(p.params, { target: F.params.target }, p.id);
}
/** Lika nivå från senaste renderingen (används när den automatiska är av, eller utan realtidsspelare). */
const matchGain = () => {
  const r = F.result;
  const g = r && F.matched ? 10 ** ((r.metrics.integrated - r.original.integrated) / 20) : 1;
  return Number.isFinite(g) ? g : 1;
};
const applyAb = () => player.setAb(F.ab, matchGain(), F.matched && F.autoMatch);

// ---- Lyssna på ett område (M/S på ett band) ----
function matchArea(i) {
  const f = MATCH_FREQS, lo = i === 0 ? 20 : Math.sqrt(f[i - 1] * f[i]), hi = i === f.length - 1 ? 20000 : Math.sqrt(f[i] * f[i + 1]);
  return [lo, hi];
}
const areaOf = (area) => (area.startsWith('match:') ? matchArea(Number(area.split(':')[1])) : areaRange(area, F.params));
const AREA_NAME = (area) => {
  const [k, i] = area.split(':'), n = Number(i);
  if (k === 'mbc') return ['Kick', 'Mellan', 'Närvaro', 'Luft'][n];
  if (k === 'peq') return ['Bas', 'Lågmitt', 'Mitt', 'Närvaro', 'Diskant'][n];
  if (k === 'match') return `Match ${MATCH_FREQS[n] >= 1000 ? `${MATCH_FREQS[n] / 1000}k` : MATCH_FREQS[n]}`;
  return `${k === 'preEq' ? 'EQ 1' : 'EQ 2'} ${bandLabel(EQ_CUTOFFS, n)}`;
};
function sendMonitor() {
  if (!realtime) return;
  const listen = F.listen ? { ...F.listen, ...(([lo, hi]) => ({ lo, hi }))(areaOf(F.listen.area)) } : null;
  player.setMonitor({ listen, mono: F.mono, sim: F.sim, delta: F.delta ? 'deEss' : null });
}

// ---- Ångra ----
let lastSnap = 0;
function pushUndo() {
  const now = Date.now();
  if (now - lastSnap > 1200) F.undo = [...F.undo, JSON.stringify({ params: F.params, enabled: F.enabled, presetId: F.presetId })].slice(-20);
  lastSnap = now;
}
function undo() {
  const s = F.undo.pop();
  if (!s) return;
  Object.assign(F, JSON.parse(s));
  lastSnap = 0;
  app.render();
  paramsChanged();
}

// ---- Autosparning ----
const persist = () => saveFileState({ name: F.name, params: F.params, enabled: F.enabled, presetId: F.presetId, matchAmount: F.matchAmount });
let restoring = null;
/** Öppnar senast sparade låt (första gången Fil visas). */
function restore() {
  if (restoring || F.input) return;
  restoring = (async () => {
    const song = await loadSong();
    if (!song?.bytes || F.input) { restoring = 'klar'; return; }
    F.restoringName = song.name; app.render();
    try {
      // De sparade inställningarna läggs på före renderingen, så att mätare och export stämmer direkt
      const st = await loadFileState();
      await openSong(new File([song.bytes], song.name), { fromStore: true, state: st && st.name === song.name ? st : null });
    } catch { /* trasig sparning – börja om */ }
    F.restoringName = ''; restoring = 'klar';
    app.render();
    if (F.input && isTouched()) continueOrFresh();
  })();
}

/** Har låten redan ändringar (annat än orört)? */
function isTouched() {
  const fresh = sanitizeFile({ ...fileNeutral(), target: F.params.target });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return !same({ ...F.params, inLufs: null }, { ...fresh, inLufs: null }) || !!F.presetId || Object.keys(F.enabled || {}).some((k) => F.enabled[k] === false);
}

/** Börja om med samma låt, helt orörd (ingen preset, ingen bearbetning). Målnivån behålls. Går att ångra. Sparade versioner ligger kvar. */
async function freshStart() {
  stopFilePlayback();
  pushUndo(); lastSnap = 0;
  Object.assign(F, { params: sanitizeFile({ ...fileNeutral(), target: F.params.target }), presetId: '', enabled: {}, versionId: '', compare: null, mode: 'blocks',
    mono: false, sim: 'normal', solo: null, listen: null, delta: false, loop: null, autoActions: null, autoTouched: false, fromLiveMsg: '' });
  if (realtime) playParams(heard(), F.result?.drive ?? 0);
  persist(); F.stale = !!F.result; app.render();
  await doRender();
}

/** Vid start, när låten öppnats med sparade ändringar: fortsätta eller börja om från orörd. Stänger man rutan fortsätter man. */
function continueOrFresh() {
  const d = sheet(`<h2>Fortsätta eller börja om?</h2>
    <p class="hint">Låten <b>${esc(F.name.replace(/\.[^.]+$/, ''))}</b> öppnades med dina senaste ändringar${presetOf(F.presetId) ? ` (preset ${esc(presetOf(F.presetId).name)})` : ''}.</p>
    <button class="btn primary wide" id="f-continue">Fortsätt där jag var</button>
    <button class="btn wide" id="f-fresh">↺ Börja om – orörd låt (ångra går)</button>
    <p class="hint small">Du behöver inte läsa in låten igen. Sparade versioner i Jämför ligger kvar.</p>`, { cls: 'songsheet', closeText: 'Fortsätt' });
  d.querySelector('#f-continue').onclick = () => d.close();
  d.querySelector('#f-fresh').onclick = () => { d.close(); freshStart(); };
}

let renderTimer = 0;
/**
 * En ändring hörs direkt (realtidsspelaren). Mätare, spektrum och export räknas om först när du trycker Rendera
 * (F.stale visar att de är från före ändringen). Utan realtidsspelare (äldre telefoner) räknas det om automatiskt.
 */
function paramsChanged({ now = false } = {}) {
  F.params = sanitizeFile(F.params);
  F.rev = (F.rev || 0) + 1;
  if (realtime) playParams(heard(), F.result?.drive ?? 0);
  persist();
  const u = typeof document !== 'undefined' && document.querySelector('#f-undo');
  if (u) u.disabled = !F.undo.length;
  if (!F.input) return;
  if (now) { clearTimeout(renderTimer); renderTimer = setTimeout(doRender, 0); return; }
  if (realtime) {
    if (F.result && !F.stale) { F.stale = true; app.renderPart('fileStatus'); }
    return;
  }
  if (!F.result) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, 900);
}

/**
 * Popup med snurra och förloppsmätare medan en låt läses in eller renderas. Ligger utanför vyn (document.body),
 * så att den står kvar när vyn ritas om. busy(null) stänger den. frac = null: okänd längd (bara snurran).
 */
function busy(text, frac = null) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('fbusy');
  if (text == null) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'fbusy'; el.className = 'busyov'; el.dataset.testid = 'fbusy';
    el.innerHTML = '<div class="busybox" role="status" aria-live="polite"><div class="spin"><i></i><b></b></div><p></p><div class="bbar"><i></i></div></div>';
    document.body.appendChild(el);
  }
  const pc = frac == null ? null : Math.max(0, Math.min(100, Math.round(frac * 100)));
  el.querySelector('p').textContent = text;
  el.querySelector('.spin b').textContent = pc == null ? '' : `${pc}%`;
  el.classList.toggle('ind', pc == null);
  el.querySelector('.bbar i').style.width = `${pc ?? 0}%`;
}

async function doRender() {
  if (!F.input) return;
  const mine = F.rev || 0;
  F.rendering = true; F.progress = 0; F.msg = '';
  app.renderPart('fileStatus');
  busy('Renderar – räknar mätare och export…', 0);
  try {
    const r = await renderInWorker(F.input, effective(), (x) => { F.progress = x; busy('Renderar – räknar mätare och export…', x); app.renderPart('fileProgress'); });
    F.result = r;
    if (realtime) playParams(heard(), r.drive);
    else {
      const pos = player.position();
      player.setBuffer('master', r.channels, r.fs);
      if (player.playing) player.seek(pos);
    }
    applyAb();
  } catch (e) {
    F.msg = `Mastringen misslyckades: ${e.message}`;
  }
  busy(null);
  F.rendering = false;
  F.stale = (F.rev || 0) !== mine; // ändrades något under renderingen är resultatet redan föråldrat
  app.render();
}

/** Läser in en låt (vald fil eller från autosparningen) och renderar den första gången. */
async function openSong(file, { fromStore = false, state = null } = {}) {
  stopFilePlayback();
  F.msg = ''; F.result = null; F.exportMsg = ''; F.stale = false; F.loop = null; F.listen = null; F.solo = null; F.delta = false;
  F.name = file.name;
  if (!fromStore) {
    // Ny låt = helt orörd: ingen preset, ingen bearbetning, allt på, inget att ångra. Bara målnivån (vald plattform) behålls.
    Object.assign(F, { params: sanitizeFile({ ...fileNeutral(), target: F.params.target }), presetId: '', enabled: {}, undo: [], versionId: '',
      compare: null, assistStep: 1, assistPick: 'B', mono: false, sim: 'normal', fromLiveMsg: '', autoTouched: false });
    if (realtime) playParams(heard(), 0);
  }
  F.rendering = true; F.progress = 0; F.saved = false;
  busy(`${fromStore ? 'Öppnar senaste låten' : 'Läser in'} ${file.name}…`);
  app.render();
  try {
    const bytes = await file.arrayBuffer();
    const a = await decodeFile(file);
    F.input = { channels: a.channels, fs: a.fs };
    F.profile = profileFromChannels(a.channels, a.fs);
    F.inLufs = measure(a.channels, a.fs, { withTruePeak: false }).integrated;
    F.edges = edgeLevels(a.channels, a.fs);
    if (!Number.isFinite(F.inLufs)) F.inLufs = null;
    F._clip = null;
    if (realtime) player.setBuffer(a.channels, a.fs);
    else { player.bufs = {}; player.setBuffer('orig', a.channels, a.fs); }
    F.saved = fromStore || await saveSong(file.name, bytes);
    if (state) {
      F.params = sanitizeFile(state.params); F.enabled = state.enabled || {}; F.presetId = state.presetId ?? ''; F.matchAmount = state.matchAmount ?? 70;
      if (realtime) playParams(heard(), 0);
    }
    persist();
    F.rendering = false;
    await doRender();
    if (F.autoPending) { F.autoPending = false; await runAuto(); }
  } catch (err) {
    F.rendering = false; F.input = null; F.msg = err.message;
    busy(null);
    app.render();
  }
}

// ---- Delar ----

const fpath = (key, label, range, info = key, enableKey = null, extra = '') =>
  slider({ id: `f-${key.replace(/\./g, '-')}`, label, value: getPath(F.params, key), range, info, resetTo: getPath(presetFileParams(), key), kind: 'fpath', key,
    enable: enableKey ? { key: enableKey, on: en(enableKey) } : null, extra });
/** Lodrät fader för ett EQ-band, med M/S för bandets område. */
const fvpath = (key, label, short, range, info, area, opts = {}) => vfader({ id: `f-${key.replace(/\./g, '-')}`, label, short, value: getPath(F.params, key), range, info,
  resetTo: getPath(presetFileParams(), key), kind: 'fpath', key, buttons: false, btns: area ? areaBtns(area, label) : null, ...opts });
const frow = (items) => `<div class="faders${items.length > 8 ? ' dense' : ''}" style="--n:${items.length}">${items.join('')}</div>`;
const srows = (items) => `<div class="srows">${items.join('')}</div>`;
const EQ_SHORT = ['60', '120', '250', '500', '1k', '3k', '8k', '20k'];
const COMP_NAMES = ['Kick', 'Mellan', 'Närvaro', 'Luft'];
const PEQ_NAMES = ['Bas', 'Lågmitt', 'Mitt', 'Närvaro', 'Diskant'];
const fsolo = (key, label) => soloBtn(key, F.solo === key, label);
function areaBtns(area, label) {
  const on = (mode) => F.listen?.area === area && F.listen?.mode === mode;
  return `<button type="button" class="mbtn${on('mute') ? ' on' : ''}" data-famute="${area}" aria-pressed="${on('mute')}" aria-label="Ta bort ${esc(label)}">M</button>`
    + `<button type="button" class="solo${on('solo') ? ' on' : ''}" data-fasolo="${area}" aria-pressed="${on('solo')}" aria-label="Bara ${esc(label)}">S</button>`;
}
/** Panelens rubrik: på/av, namn, solo och delpreset – som i Live. */
/** Delpresets i Fil: EQ och kompressor som i Live, plus Färg och Limiter (de delar som bara finns i Fil). */
const FMODS = { eq: { name: 'EQ', keys: ['preEq', 'postEq', 'peq'] }, comp: { name: 'Kompressor', keys: ['mbc'] },
  farg: { name: 'Färg', keys: ['deEss', 'glitter', 'width', 'monoBass', 'glue'] }, lim: { name: 'Limiter', keys: ['clip', 'limRelease'] } };
function fhead({ title, sub = '', enableKey = null, soloKey = null, mod = null, right = '' }) {
  const on = enableKey ? (enableKey === 'grp_comp' ? [0, 1, 2, 3].some((i) => en(`mbc${i}`)) : en(enableKey)) : false;
  return `<div class="phead">${enableKey ? toggle(enableKey, on, title) : ''}<b>${esc(title)}</b>${soloKey ? fsolo(soloKey, title) : ''}${sub ? `<small>${esc(sub)}</small>` : ''}
    <span class="grow"></span>${mod ? `<button class="pick2" id="fmod-${mod}" aria-label="${FMODS[mod].name}-preset för filen">Preset ▾</button>` : ''}${right}</div>`;
}

// ---- Blocken (samma ordning som ljudet går) ----
const F_BLOCKS = [
  { id: 'quick', label: 'Snabb', sub: 'genväg' }, { id: 'in', label: 'In', sub: 'först' }, { id: 'eq1', label: 'EQ 1', sub: 'före' },
  { id: 'comp', label: 'Kompr.', sub: 'tryck' }, { id: 'eq2', label: 'EQ 2', sub: 'efter' }, { id: 'farg', label: 'Färg', sub: 'polering' },
  { id: 'lim', label: 'Limiter', sub: 'volym' }, { id: 'out', label: 'Ut', sub: 'sist' },
];
const fBlock = () => (F_BLOCKS.some((b) => b.id === ui.blocks?.fil) ? ui.blocks.fil : 'quick');
const blockOn = (id) => ({
  quick: ['kick', 'deEss', 'glitter', 'clip', 'glue', 'width'].some(en), in: en('trim'), eq1: en('preEq') || en('match'),
  comp: [0, 1, 2, 3].some((i) => en(`mbc${i}`)), eq2: en('postEq'), farg: ['deEss', 'glitter', 'width', 'glue'].some(en), lim: en('clip'), out: en('output'),
}[id]);

function panelQuick() {
  const p = presetOf(F.presetId);
  const rows = [['kickPunch', 'Kick-anslag', FILE_RANGES.kickPunch, 'kickPunch', 'kick'], ['deEss', 'S-ljud (de-esser)', FILE_RANGES.deEss, 'fileDeEss', 'deEss'],
    ['glitter', 'Mjuk topp', FILE_RANGES.glitter, 'fileGlitter', 'glitter'], ['clip', 'Soft clip', FILE_RANGES.clip, 'clip', 'clip'],
    ['glue.ratio', 'Lim', FILE_RANGES.glueRatio, 'glueRatio', 'glue'], ['width', 'Stereobredd', FILE_RANGES.width, 'width', 'width']]
    .map(([k, l, r, i, e]) => fpath(k, l, r, i, e, fsolo(e, l)));
  return `<div class="phead"><b>Snabb</b>${infoBtn('fileQuick')}<span class="grow"></span>
      <small class="dim trunc">${esc(p ? `Preset: ${p.name}` : 'Ingen preset')}</small></div>${srows(rows)}`;
}
function panelIn() {
  return `${fhead({ title: 'In', sub: 'först i kedjan', enableKey: 'trim', soloKey: 'trim' })}${srows([fpath('trim', 'In (lyft före kedjan)', FILE_RANGES.trim, 'trim')])}`;
}
function panelEq1() {
  const v = F.eqView1;
  const chips = `<div class="bandrow"><button class="chip${v === 'graphic' ? ' sel' : ''}" data-feq1="graphic">8 band</button>
    <button class="chip${v === 'match' ? ' sel' : ''}" data-feq1="match">Match-EQ</button><button class="chip${v === 'ref' ? ' sel' : ''}" data-feq1="ref">Mot referens</button></div>`;
  if (v === 'ref') return `${fhead({ title: 'EQ 1', sub: 'före komp.', enableKey: 'match', soloKey: 'match' })}${chips}${refPart()}`;
  if (v === 'match') {
    return `${fhead({ title: 'Match-EQ', sub: '10 band', enableKey: 'match', soloKey: 'match' })}${chips}
      ${frow(MATCH_FREQS.map((f, i) => fvpath(`matchEq.${i}.gain`, f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`, f >= 1000 ? `${f / 1000}k` : `${f}`, FILE_RANGES.matchGain, 'matchEq', `match:${i}`)))}`;
  }
  return `${fhead({ title: 'EQ 1', sub: 'före komp.', enableKey: 'preEq', soloKey: 'preEq', mod: 'eq' })}${chips}
    ${frow(EQ_CUTOFFS.map((_, i) => fvpath(`preEq.${i}.gain`, bandLabel(EQ_CUTOFFS, i), EQ_SHORT[i], RANGES.eqGain, `preEq.${i}.gain`, `preEq:${i}`)))}`;
}
function panelComp() {
  const all = F.compSel === 'all', i = all ? 0 : F.compSel;
  const chips = `<div class="bandrow"><button class="chip${all ? ' sel' : ''}" data-fcomp="all">Hela låten</button>
    ${COMP_NAMES.map((n, k) => `<button class="chip${!all && k === i ? ' sel' : ''}${en(`mbc${k}`) ? '' : ' off'}" data-fcomp="${k}">${n}</button>`).join('')}</div>`;
  const R = [['ratio', 'Styrka (ratio)'], ['threshold', 'Startar vid (tröskel)'], ['attack', 'Reaktion (attack)'], ['release', 'Släpper (release)'], ['knee', 'Mjukhet (knä)'], ['postGain', 'Lyft efter']];
  const mean = (k, src = F.params) => src.mbc.reduce((s, b) => s + b[k], 0) / 4;
  const differ = R.some(([k]) => Math.max(...F.params.mbc.map((b) => b[k])) - Math.min(...F.params.mbc.map((b) => b[k])) > 1e-6);
  const rows = R.map(([k, l]) => (all
    ? slider({ id: `f-mbcall-${k}`, label: l, value: +mean(k).toFixed(4), range: RANGES[k], info: `mbc.0.${k}`, resetTo: +mean(k, presetFileParams()).toFixed(4), kind: 'fmbcall', key: k })
    : fpath(`mbc.${i}.${k}`, l, RANGES[k], `mbc.${i}.${k}`)));
  if (!all && i === 0) rows.push(fpath('kickPunch', 'Kick-anslag', FILE_RANGES.kickPunch, 'kickPunch', 'kick'));
  const head = all ? (differ
    ? `<div class="bandrow"><small class="dim grow">Banden har olika värden. Reglagen visar medelvärdet och flyttar alla fyra band lika mycket – skillnaderna mellan dem behålls.</small>${infoBtn('compAll')}</div><div class="bandrow"><button class="btn small" id="f-mbc-equal">Gör alla band lika</button></div>`
    : `<div class="bandrow"><small class="dim grow">Alla fyra band har samma inställning – hela låten trycks ihop jämnt.</small>${infoBtn('compAll')}</div>`)
    : `<div class="bandrow"><small class="dim grow">${COMP_NAMES[i]}: ${bandLabel(MBC_CUTOFFS, i)}</small><span class="bms">${toggle(`mbc${i}`, en(`mbc${i}`), COMP_NAMES[i])}${areaBtns(`mbc:${i}`, COMP_NAMES[i])}${infoBtn('areaSolo')}</span></div>`;
  return `${fhead({ title: 'Kompressor', enableKey: 'grp_comp', soloKey: 'mbc', mod: 'comp' })}${chips}${head}${srows(rows)}`;
}
function panelEq2() {
  const graphic = F.eqView2 === 'graphic', sel = F.eqSel, b = PEQ_BANDS[sel];
  const chips = `<div class="bandrow"><button class="chip${graphic ? ' sel' : ''}" data-feq2="graphic">8 band</button>
    ${PEQ_NAMES.map((n, k) => `<button class="chip${!graphic && k === sel ? ' sel' : ''}" data-feq2="${k}">${n}</button>`).join('')}</div>`;
  const body = graphic
    ? frow(EQ_CUTOFFS.map((_, k) => fvpath(`postEq.${k}.gain`, bandLabel(EQ_CUTOFFS, k), EQ_SHORT[k], RANGES.eqGain, `postEq.${k}.gain`, `postEq:${k}`)))
    : `<div class="bandrow"><small class="dim grow">${PEQ_NAMES[sel]} – ${b.type === 'peaking' ? 'runt frekvensen' : sel === 0 ? 'allt under frekvensen' : 'allt över frekvensen'}</small>
        <span class="bms">${areaBtns(`peq:${sel}`, PEQ_NAMES[sel])}${infoBtn('areaSolo')}</span></div>
      ${frow([fvpath(`peq.${sel}.freq`, 'Frekvens', 'Frekvens', b.range, 'peqFreq', null, { log: true }), fvpath(`peq.${sel}.gain`, 'Höj / sänk', 'Höj / sänk', RANGES.peqGain, 'peqGain', null),
        fvpath(`peq.${sel}.q`, 'Bredd (Q)', 'Bredd (Q)', RANGES.peqQ, 'peqQ', null)])}`;
  return `${fhead({ title: 'EQ 2', sub: 'efter komp.', enableKey: 'postEq', soloKey: 'postEq', mod: 'eq' })}${chips}${body}`;
}
function panelFarg() {
  const s = F.fargSel;
  const chips = `<div class="bandrow">${[['deEss', 'S-ljud'], ['glitter', 'Mjuk topp'], ['width', 'Bredd'], ['glue', 'Lim']]
    .map(([k, l]) => `<button class="chip${s === k ? ' sel' : ''}${en(k) ? '' : ' off'}" data-ffarg="${k}">${l}</button>`).join('')}</div>`;
  const body = {
    deEss: `${srows([fpath('deEss', 'Mängd', FILE_RANGES.deEss, 'fileDeEss', 'deEss')])}
      <div class="bandrow"><button class="btn small${F.delta ? ' on-solo' : ''}" id="f-delta" aria-pressed="${F.delta}">Δ Hör bara det som tas bort</button>${infoBtn('delta')}</div>`,
    glitter: srows([fpath('glitter', 'Mängd', FILE_RANGES.glitter, 'fileGlitter', 'glitter')]),
    width: srows([fpath('width', 'Stereobredd', FILE_RANGES.width, 'width', 'width'), fpath('monoBass', 'Bas i mono under (0 = av)', FILE_RANGES.monoBass, 'monoBass')]),
    glue: srows([fpath('glue.threshold', 'Startar vid (tröskel)', FILE_RANGES.glueThreshold, 'glue.threshold', 'glue'), fpath('glue.ratio', 'Styrka (ratio)', FILE_RANGES.glueRatio, 'glueRatio'),
      fpath('glue.attack', 'Reaktion (attack)', FILE_RANGES.glueAttack, 'glue.attack'), fpath('glue.release', 'Släpper (release)', FILE_RANGES.glueRelease, 'glue.release'),
      fpath('glue.makeup', 'Lyft efter', FILE_RANGES.glueMakeup, 'glue.makeup')]),
  }[s];
  const name = { deEss: 'S-ljud', glitter: 'Mjuk topp', width: 'Bredd', glue: 'Lim' }[s];
  return `${fhead({ title: 'Färg', sub: 'polering efter EQ 2', soloKey: s, mod: 'farg', right: infoBtn('farg') })}${chips}<div class="bandrow"><small class="dim grow">${name}</small></div>${body}`;
}
function panelLim() {
  return `${fhead({ title: 'Limiter', sub: 'alltid på (true peak)', mod: 'lim', right: infoBtn('sec_limiter') })}
    ${srows([fpath('clip', 'Soft clip', FILE_RANGES.clip, 'clip', 'clip', fsolo('clip', 'Soft clip')), fpath('ceiling', 'Tak (true peak)', FILE_RANGES.ceiling, 'ceiling'),
      fpath('limRelease', 'Släpper (release)', FILE_RANGES.limRelease, 'limRelease'), ...(F.params.target === 'egen' ? [fpath('drive', 'Drive', FILE_RANGES.drive, 'drive')] : [])])}`;
}
function panelOut() {
  return `${fhead({ title: 'Ut', sub: 'mål och slutnivå', enableKey: 'output' })}
    <div class="seg">${TARGETS.map((t) => `<button data-target="${t.id}" class="${F.params.target === t.id ? 'sel' : ''}">${t.name}${t.lufs ? ` ${t.lufs}` : ''}</button>`).join('')}</div>
    ${srows([fpath('output', 'Utgång', FILE_RANGES.output, 'output'), fpath('fadeIn', 'Fade in', FILE_RANGES.fadeIn, 'fadeIn'), fpath('fadeOut', 'Fade ut', FILE_RANGES.fadeOut, 'fadeOut')])}
    ${meters()}
    <div class="pfoot"><button class="btn small" id="f-flat">Platt</button><button class="btn small" id="f-all-on">Slå på allt</button><button class="btn small" id="f-reset-all">Återställ alla</button></div>
    <div id="fileStatus">${statusPart()}</div>`;
}

/** Klang mot referens (EQ 1 → Mot referens): välj referens, omdöme och Matcha. */
function refPart() {
  if (!F.profile) return '<p class="hint">Välj en låt först.</p>';
  const ref = currentRef();
  let verdict = '';
  if (ref) {
    const c = compareProfiles(F.result?.profile || F.profile, ref.profile);
    const icon = { ok: '✓', lite: '!', mycket: '✕' };
    verdict = `<div class="verdict ${c.verdict}" data-testid="fverdict"><b>${esc(c.summary)}</b>${infoBtn('verdict')}</div>
      <ul class="regions">${c.regions.map((r) => `<li class="${r.status}"><span class="ic">${icon[r.status]}</span><b>${esc(r.name)}</b> ${esc(r.text)}</li>`).join('')}</ul>`;
  }
  return `<div id="fanalys">${picker({ id: 'f-ref', label: 'Referens för filen', value: ui.refId, groups: refGroups(), placeholder: 'Ingen referens' })}${verdict}
    ${ref ? `${slider({ id: 'f-matchamount', label: 'Hur mycket att matcha', value: F.matchAmount, range: [0, 100, 5, '%'], info: 'matchAmount', resetTo: 70, kind: 'amount', key: 'amount' })}
      <div class="btnrow"><button class="btn small primary" id="f-match">Matcha klang mot referensen</button><button class="btn small" id="f-match-reset">Nollställ match-EQ</button></div>`
      : '<p class="hint small">Välj eller spara en referens (Analys) för att jämföra och matcha klangen.</p>'}</div>`;
}

function statusPart() {
  if (F.rendering) return `<div class="progress" role="progressbar" aria-valuenow="${Math.round(F.progress * 100)}"><i style="width:${Math.round(F.progress * 100)}%"></i></div><p class="hint" data-testid="fprog">Räknar mätare och export… ${Math.round(F.progress * 100)} %</p>`;
  if (F.msg) return `<p class="bad" id="fmsg">${esc(F.msg)}</p>`;
  if (!F.result) return `<button class="btn primary wide" data-render ${F.input ? '' : 'disabled'}>Rendera</button>`;
  if (F.stale) return '<p class="hint small stale">Ändrat sedan senaste renderingen – mätare och export visar det gamla. Du hör ändringen direkt.</p><button class="btn primary wide" data-render>Rendera</button>';
  return `<p class="hint small">${realtime ? 'Ändringar hörs direkt. Tryck Rendera när du är nöjd – då uppdateras mätare och export.' : 'Ändringar mastras om automatiskt.'}</p>`;
}

// ---- Grafen överst: Våg / Spektrum / Mätare ----
function waveSvg() {
  const peaks = waveform(), top = Math.max(...peaks, 1e-6);
  return peaks.map((v, i) => { const h = Math.max(1, (v / top) * 46); return `<rect x="${i}" y="${(50 - h / 2).toFixed(1)}" width="0.7" height="${h.toFixed(1)}"/>`; }).join('');
}
function meterPart() {
  const m = F.meter, r = F.result;
  const live = m && player.playing;
  const bars = live
    ? [['Nivå', m.level, m.level, 'lvl'], ['Topp', m.peak, m.peak, 'lvl'], ['Kompr.', Math.max(...m.gr.mbc), null, 'gr'], ['S-ljud', m.gr.deEss, null, 'gr'],
      ['Mjuk topp', m.gr.glitter, null, 'gr'], ['Lim', m.gr.glue, null, 'gr'], ['Limiter', m.gr.limiter, null, 'gr']]
    : r ? (() => { const g = r.gr.avg || r.gr; return [['LUFS', r.metrics.integrated, r.metrics.integrated, 'lvl'], ['Topp', r.metrics.truePeak, r.metrics.truePeak, 'lvl'], ['Kompr.', Math.max(...g.mbc), null, 'gr'],
      ['S-ljud', g.deEss || 0, null, 'gr'], ['Mjuk topp', g.glitter || 0, null, 'gr'], ['Lim', g.glue || 0, null, 'gr'], ['Limiter', g.limiter || 0, null, 'gr']]; })() : [];
  if (!bars.length) return '<p class="hint" style="padding:30px 10px">Mätarna visas när låten spelas eller är renderad.</p>';
  // Röd = mer nedtryckning än en mastring brukar ha. Medan låten spelar visas nedtryckningen just nu (toppar: ≈ 6 dB för
  // kompressor/de-esser, 3 dB för lim och limiter); efter en rendering visas snittet under låten (riktvärden: kompressor
  // 1–4 dB, lim 1–2,5 dB, limiter högst ca 2 dB i snitt).
  const LIMIT = live ? { 'Kompr.': 5, 'S-ljud': 5, 'Mjuk topp': 5, Lim: 3, Limiter: 3 } : { 'Kompr.': 4, 'S-ljud': 4, 'Mjuk topp': 4, Lim: 2.5, Limiter: 2 };
  return `<div class="fmeters" data-testid="livemeters">${bars.map(([n, v, , kind]) => {
    const h = kind === 'lvl' ? Math.max(2, Math.min(100, ((v + 40) / 40) * 100)) : Math.max(0, Math.min(100, (v || 0) * 10));
    const hot = kind === 'gr' && v > (LIMIT[n] ?? 99);
    return `<div class="fmb ${kind}${hot ? ' hot' : ''}" title="${hot ? `Mer än ca ${LIMIT[n]} dB – mer än en mastring brukar` : ''}"><b>${kind === 'gr' ? (v > 0.05 ? `−${v.toFixed(1)}` : '0.0') : Number.isFinite(v) ? v.toFixed(1) : '–'}</b><div class="fmt"><em style="height:${h.toFixed(0)}%"></em></div><span>${n}</span></div>`;
  }).join('')}</div><small class="fmnote">${live ? 'just nu (utjämnat ~1 s)' : 'snitt under låten (senaste renderingen)'} · röd = mer än proffsens riktvärde</small>`;
}
function filTop() {
  if (!F.input) {
    if (F.restoringName) return `<div class="lbl"><b>Fil</b></div><div class="ovw"><p class="hint" data-testid="restoring">Öppnar senaste låten: ${esc(F.restoringName)}…</p></div>`;
    if (F.mode !== 'blocks') return '<div class="lbl"><b>Fil</b> · mastring för släpp</div><div class="ovw"><p class="hint">Välj låten nedan.</p></div>';
    return `<div class="lbl"><b>Fil</b> · mastring för släpp</div><div class="ovw">
      <label class="btn wide file primary">✨ Automastra en låt<input type="file" id="f-file-auto" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" hidden></label>
      <div class="btnrow startrow"><label class="btn file">Mastra själv<input type="file" id="f-file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" hidden></label><button class="btn" id="f-assist0">🪄 Assistent</button></div>
      <p class="hint small">Låten stannar på telefonen – inget laddas upp och den finns kvar nästa gång.</p></div>`;
  }
  const pos = player.position(), dur = player.duration || 1, r = F.result;
  const g = F.graph;
  const loop = F.loop ? `<i class="loop" style="left:${(F.loop[0] / dur) * 100}%;width:${((F.loop[1] - F.loop[0]) / dur) * 100}%"></i>` : '';
  let graph;
  if (g === 'spec') {
    const ref = currentRef();
    const series = { orig: { label: 'Original', bands: F.profile.bands } };
    if (r) series.main = { label: 'Mastrad', bands: r.profile.bands };
    if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
    graph = `<div class="fgbox fspec" id="fspec">${spectrumSvg(series, { id: 'file', title: 'Spektrum för filen' })}</div>`;
  } else if (g === 'meter') graph = `<div class="fgbox" id="fmeter">${meterPart()}</div>`;
  else {
    graph = `<div class="wave" id="f-wave" role="slider" aria-label="Position" aria-valuemin="0" aria-valuemax="${dur.toFixed(1)}" aria-valuenow="${pos.toFixed(1)}" style="--pos:${((pos / dur) * 100).toFixed(2)}%">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">${waveSvg()}</svg>${loop}<i class="head"></i></div>`;
  }
  const sw = `<div class="gsw" role="tablist">${[['wave', 'Våg'], ['spec', 'Spektrum'], ['meter', 'Mätare']].map(([k, l]) => `<button class="${g === k ? 'on' : ''}" data-fgraph="${k}">${l}</button>`).join('')}</div>`;
  const tags = [F.solo ? `Solo: ${SOLO_NAME[F.solo] || F.solo}` : '', F.listen ? `${F.listen.mode === 'solo' ? 'Bara' : 'Utan'} ${AREA_NAME(F.listen.area)}` : '', F.delta ? 'Δ S-ljud' : '',
    F.mono ? 'Mono' : '', F.sim !== 'normal' ? `Som ${F.sim}` : ''].filter(Boolean);
  return `<div class="lbl">${sw}<span class="grow"></span>${r ? `<span class="nowrap">${r.metrics.integrated.toFixed(1)} LUFS · ${fmtDb(r.metrics.truePeak)} dBTP</span>` : ''}</div>
    <div class="ovw fplayer"><section class="card" id="player">${graph}
      ${tags.length ? `<div class="ftags" data-testid="listenbar"><span>${esc(tags.join(' · '))}</span><button id="f-listen-off" aria-label="Avsluta lyssningsläge">✕</button></div>` : ''}
      <div class="row transport">
        <button class="btn" id="f-play" aria-label="${player.playing ? 'Paus' : 'Spela'}">${player.playing ? '❚❚' : '▶'}</button>
        <button class="btn" id="f-stop" aria-label="Stopp">■</button>
        <span class="dim small" id="f-time">${mmss(pos)} / ${mmss(player.duration)}</span>
        <span class="grow"></span>
        <button class="btn small${F.loop ? ' on' : ''}" id="f-loop" aria-pressed="${!!F.loop}" aria-label="Loop">⟲</button>
        <button class="btn small" id="f-listen" aria-label="Lyssna">👂</button>
        <button class="btn${F.stale || !F.result ? ' primary' : ''}" id="f-render-top" data-render ${F.rendering ? 'disabled' : ''}>Rendera</button>
      </div></section></div>`;
}

function subbar() {
  return `<div class="subbar" id="fsubbar">
    <button class="pp" id="f-song" aria-label="Låt">🎵<b class="pv trunc">${esc(F.input ? F.name.replace(/\.[a-z0-9]+$/i, '') : 'Välj låt')}</b>${F.input ? `<small id="f-saved" title="Sparad på telefonen">${F.saved ? '✓' : ''}</small>` : ''}▾</button>
    <button class="abmini ${F.ab === 'master' ? 'on' : ''}" id="f-ab" aria-pressed="${F.ab === 'master'}" aria-label="A Original / B Mastrad" ${F.input ? '' : 'disabled'}><span class="o">A</span><span class="m">B</span></button>
    <button class="rb sm" id="f-undo" aria-label="↶ Ångra i Fil" ${F.undo.length ? '' : 'disabled'}>↶</button>
    <button class="btn small primary" id="f-exportbtn" ${F.input ? '' : 'disabled'}>⤓ Export</button>
  </div>
  <div class="subbar fpreset">
    <button class="pp fpre" id="f-preset" aria-label="Huvudpreset" aria-haspopup="listbox" title="Huvudpreset – hela kedjan"><span class="ico">${PRESET_ICONS[F.presetId] || (presetOf(F.presetId) ? '⭐' : '🎛️')}</span><small class="dim">Huvudpreset</small><b class="pv trunc">${esc(presetOf(F.presetId)?.name || 'Ingen preset')}</b>▾</button>
    <button class="btn small primary" id="f-auto" ${F.input && F.result ? '' : 'disabled'} aria-label="Automastra">✨ Auto</button>
  </div>`;
}

// ---- Lägen: Assistent, Jämför, Album ----
const STEPS = ['Låt', 'Mål', 'Förslag', 'Finjustera', 'Export'];
/** De tre förslagen (A Varsam, B Balanserad, C Kraftig) utifrån vald preset, mål och ev. referens. */
function assistVariants() {
  // Utgår från vald presets egen Färg/Limiter (eller standardvärdena utan preset) och skalar den: A mindre, B som den är, C mer
  const base = { ...presetFileParams(), ...(presetOf(F.presetId) && F.presetId !== 'flat' ? {} : fileCharacter(null)) }, ref = currentRef(), own = F.profile;
  const v = (amount, k) => {
    const p = structuredClone(base);
    if (ref && own) { const add = toFileMatchEq(matchEqCurve(own, ref.profile, { amount })); p.matchEq = p.matchEq.map((b, i) => ({ gain: add[i] })); }
    Object.assign(p, { deEss: base.deEss * k, glitter: base.glitter * k, clip: k > 1 ? base.clip + 1.5 : base.clip * k });
    p.glue = { ...p.glue, ratio: 1 + (base.glue.ratio - 1) * k };
    return sanitizeFile(p);
  };
  return {
    A: { name: 'Varsam', desc: ref ? 'Lite närmare referensen, mjuka s-ljud' : 'Lätt hand: mjuka s-ljud, lite lim', p: v(0.4, 0.6) },
    B: { name: 'Balanserad', desc: ref ? 'Tydligt närmare referensen, tätare' : 'Presetten som den är', p: v(0.7, 1) },
    C: { name: 'Kraftig', desc: ref ? 'Hela vägen mot referensen, tätast' : 'Tätt och högt: mer av allt', p: v(1, 1.4) },
  };
}
function assistView() {
  const st = F.assistStep;
  const stepper = `<div class="steps5">${STEPS.map((s, i) => `<div class="${i + 1 < st ? 'done' : i + 1 === st ? 'cur' : ''}"><i></i>${i + 1 < st ? '✓ ' : ''}${s}</div>`).join('')}</div>`;
  let body = '';
  if (st === 1) body = `<p class="hint">${F.input ? `Låt: <b>${esc(F.name)}</b>` : 'Välj låten du vill mastra.'}</p>
      <label class="btn wide file ${F.input ? '' : 'primary'}">${F.input ? 'Byt låt' : 'Välj låt (MP3/WAV)'}<input type="file" id="f-file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" hidden></label>
      <button class="btn wide primary" data-astep="2" ${F.input ? '' : 'disabled'}>Nästa: Mål</button>`;
  if (st === 2) body = `<div class="phead"><b>Var ska låten spelas?</b>${infoBtn('fileTarget')}</div>
      <div class="seg">${TARGETS.filter((t) => t.id !== 'egen').map((t) => `<button data-target="${t.id}" class="${F.params.target === t.id ? 'sel' : ''}">${t.name} ${t.lufs}</button>`).join('')}</div>
      <div class="phead" style="margin-top:10px"><b>Låter som (valfritt)</b></div>${picker({ id: 'f-ref', label: 'Referens för filen', value: ui.refId, groups: refGroups(), placeholder: 'Ingen referens' })}
      <button class="btn wide primary" data-astep="3">Nästa: Förslag</button>`;
  if (st === 3) {
    const vs = assistVariants();
    body = `<div class="acards">${[['before', 'Före', 'Din låt som den är'], ...Object.entries(vs).map(([k, x]) => [k, `${k} · ${x.name}`, x.desc])]
      .map(([k, t, d]) => `<button class="acard${F.assistPick === k ? ' on' : ''}" data-apick="${k}"><b>${esc(t)}</b><small>${esc(d)}</small></button>`).join('')}</div>
      <p class="hint small">Tryck mellan Före, A, B och C medan låten spelar – det byts direkt.</p>
      <div class="btnrow"><button class="btn" data-astep="4" ${F.assistPick === 'before' ? 'disabled' : ''}>Finjustera ${F.assistPick === 'before' ? '' : F.assistPick}</button>
      <button class="btn primary" data-astep="5" ${F.assistPick === 'before' ? 'disabled' : ''}>Välj ${F.assistPick === 'before' ? '' : F.assistPick} → Export</button></div>`;
  }
  return `<div class="spanel fmode" id="spanel">${stepper}<div class="phead"><b>Assistent · steg ${st}</b><span class="grow"></span><button class="btn small" id="f-mode-exit">Stäng</button></div>${body}</div>`;
}
function compareView() {
  const c = F.compare || {};
  const slots = [{ id: 'orig', name: 'Original', sub: 'orörd' }, ...songVersions().map((v) => ({ id: v.id, name: v.name, sub: v.lufs != null ? `${v.lufs.toFixed(1)} LUFS` : '' }))];
  const order = c.blind ? c.order : slots.map((s) => s.id);
  return `<div class="spanel fmode" id="spanel"><div class="phead"><b>Jämför</b>${infoBtn('compare')}<span class="grow"></span><button class="btn small" id="f-mode-exit">Stäng</button></div>
    <div class="cslots">${order.map((id, i) => {
      const s = slots.find((x) => x.id === id); if (!s) return '';
      const label = c.blind && !c.revealed ? `? ${i + 1}` : s.name;
      return `<button class="cslot${c.on === id ? ' on' : ''}" data-cslot="${esc(id)}"><b>${esc(label)}</b><small>${c.blind && !c.revealed ? 'blint' : esc(s.sub)}</small>${c.on === id ? '<small class="ok">▶ hörs nu</small>' : ''}</button>`;
    }).join('')}</div>
    ${songVersions().length ? '' : '<p class="hint small">Spara versioner (+ Ny version) och jämför dem här, i samma nivå, medan låten loopar.</p>'}
    <div class="btnrow"><button class="btn small" id="v-save">+ Ny version</button>
      <button class="btn small" id="f-blind">${c.blind ? (c.revealed ? 'Blindtest igen' : 'Visa vilken det var') : 'Blindtest 🎲'}</button>
      ${c.on && c.on !== 'orig' ? `<button class="btn small primary" id="f-keep">Behåll ${c.blind && !c.revealed ? 'den här' : esc(slots.find((x) => x.id === c.on)?.name || '')}</button>` : ''}</div>
    ${songVersions().length ? `<div class="btnrow">${songVersions().map((v) => `<button class="btn small ghost" data-vdel="${esc(v.id)}" aria-label="Ta bort ${esc(v.name)}">✕ ${esc(v.name)}</button>`).join('')}</div>` : ''}</div>`;
}
function albumView() {
  return `<div class="spanel fmode" id="spanel"><div class="phead"><b>Album</b>${infoBtn('album')}<span class="grow"></span><button class="btn small" id="f-mode-exit">Stäng</button></div>
    <p class="hint small">Mastra flera låtar med samma inställning och mål – så att de låter lika högt efter varandra. Varje låt exporteras som WAV (${F.bits} bit, ${F.rate === 44100 ? '44,1' : '48'} kHz).</p>
    <label class="btn wide file">Välj låtar till album<input type="file" id="a-files" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" multiple hidden></label>
    ${F.album.length ? `<table class="meters" data-testid="album"><thead><tr><th>Låt</th><th>LUFS</th><th>dBTP</th><th></th></tr></thead><tbody>
      ${F.album.map((t) => `<tr><th>${esc(t.name)}</th><td>${t.lufs != null ? t.lufs.toFixed(1) : '–'}</td><td>${t.tp != null ? t.tp.toFixed(1) : '–'}</td><td class="small">${esc(t.status)}</td></tr>`).join('')}
    </tbody></table>` : ''}
    ${F.album.length && !F.albumBusy ? '<button class="btn primary wide" id="a-run">Mastra och exportera alla</button>' : ''}
    ${F.albumMsg ? `<p class="hint" id="a-msg">${esc(F.albumMsg)}</p>` : ''}</div>`;
}

export function filView() {
  if (ui.fromLive) { // "Skicka till Fil" från Live
    pushUndo();
    F.params = liveToFile(ui.fromLive, { target: F.params.target }); F.presetId = ''; F.enabled = {}; ui.fromLive = null;
    F.fromLiveMsg = 'Inställningen från Live används nu i Fil.';
    paramsChanged();
  }
  if (!F.input && !restoring) restore();
  const b = fBlock();
  const top = filTop();
  if (F.mode !== 'blocks') {
    const view = { assist: assistView, compare: compareView, album: albumView }[F.mode]();
    return `${subbar()}<div class="split" data-split="fil"><div class="stop fil" id="stop">${top}</div>${view}</div>`;
  }
  const panels = { quick: panelQuick, in: panelIn, eq1: panelEq1, comp: panelComp, eq2: panelEq2, farg: panelFarg, lim: panelLim, out: panelOut };
  const panel = `${F.fromLiveMsg ? `<p class="hint small ok" id="f-fromlive">${esc(F.fromLiveMsg)}</p>` : ''}${panels[b]()}`;
  F.fromLiveMsg = '';
  return `${subbar()}${split({ view: 'fil', top, blocks: F_BLOCKS.map((x) => ({ ...x, dot: blockOn(x.id) })), active: b, panel, topCls: 'fil' })}`;
}

export function renderFilePart(root, part) {
  if (part === 'fileStatus' || part === 'fileProgress') {
    const el = root.querySelector('#fileStatus');
    if (el) { el.innerHTML = statusPart(); bindRender(el); }
    const top = root.querySelector('#f-render-top');
    if (top) { top.classList.toggle('primary', !!F.stale || !F.result); top.disabled = !!F.rendering; }
  }
  if (part === 'fileTime') {
    const t = root.querySelector('#f-time'), w = root.querySelector('#f-wave');
    if (t) t.textContent = `${mmss(player.position())} / ${mmss(player.duration)}`;
    if (w) { w.style.setProperty('--pos', `${((player.position() / (player.duration || 1)) * 100).toFixed(2)}%`); w.setAttribute('aria-valuenow', player.position().toFixed(1)); }
  }
  if (part === 'fileMeter') { const m = root.querySelector('#fmeter'); if (m) m.innerHTML = meterPart(); }
  if (part === 'fileSaved') { const s = root.querySelector('#f-saved'); if (s) s.textContent = F.saved ? '✓' : ''; }
}

const bindRender = (el) => el.querySelectorAll('[data-render]').forEach((b) => { b.onclick = () => paramsChanged({ now: true }); });

function meters() {
  const r = F.result;
  if (!r) return '';
  const row = (label, a, b, unit, plain = false) => {
    const f = (v) => (plain ? (Number.isFinite(v) ? v.toFixed(1) : '–') : fmtDb(v));
    return `<tr><th>${label}</th><td>${f(a)}</td><td><b>${f(b)}</b></td><td>${unit}</td></tr>`;
  };
  const o = r.original, m = r.metrics;
  return `<section class="card" id="meters">
    <h2>Mätare ${infoBtn('meters')}</h2>
    <table class="meters" data-testid="meters">
      <thead><tr><th></th><th>Original</th><th>Mastrad</th><th></th></tr></thead>
      <tbody>
        ${row('Loudness', o.integrated, m.integrated, 'LUFS')}
        ${row('Short-term max', o.shortTermMax, m.shortTermMax, 'LUFS')}
        ${row('True peak', o.truePeak, m.truePeak, 'dBTP')}
        ${row('Loudness range', o.lra, m.lra, 'LU', true)}
      </tbody>
    </table>
    <p class="hint small">Limitern sänkte som mest ${r.gr.limiter.toFixed(1)} dB · drive ${fmtDb(r.drive)} dB${r.gr.glue > 0.05 ? ` · lim ${r.gr.glue.toFixed(1)} dB` : ''}${r.gr.deEss > 0.05 ? ` · s-ljud −${r.gr.deEss.toFixed(1)} dB` : ''}.</p>
  </section>`;
}

function monoCard() {
  const r = F.result;
  if (!r?.stereo) return '';
  const s = r.stereo, o = r.originalStereo;
  const meter = (corr) => `<span class="corr"><i style="left:${((corr + 1) / 2) * 100}%"></i></span>`;
  return `<section class="card" id="mono">
    <h2>Mono och fas ${infoBtn('mono')}</h2>
    <table class="meters" data-testid="mono">
      <thead><tr><th></th><th>Korrelation</th><th>Förlust i mono</th></tr></thead>
      <tbody>
        <tr><th>Hela låten</th><td>${meter(s.corr)} ${s.corr.toFixed(2)}</td><td>${s.monoLoss.toFixed(1)} dB</td></tr>
        ${s.bands.map((b) => `<tr><th>${esc(b.name)}</th><td>${meter(b.corr)} ${b.corr.toFixed(2)}</td><td>${b.monoLoss.toFixed(1)} dB</td></tr>`).join('')}
      </tbody>
    </table>
    ${s.warnings.length ? `<ul class="tips">${s.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="ok small">✓ Låten håller i mono.</p>'}
    <p class="hint small">Originalet: korrelation ${o.corr.toFixed(2)}, ${o.monoLoss.toFixed(1)} dB i mono.</p>
  </section>`;
}


/** Vågformen (toppar i 200 bitar), räknas en gång per låt. */
function waveform() {
  if (!F.input) return null;
  if (F._wave?.src === F.input) return F._wave.peaks;
  const ch = F.input.channels, n = ch[0].length, bins = 200, per = Math.max(1, Math.floor(n / bins));
  const peaks = Array.from({ length: bins }, (_, b) => {
    let m = 0;
    for (let i = b * per, e = Math.min(n, (b + 1) * per); i < e; i += 4) for (const c of ch) { const v = Math.abs(c[i]); if (v > m) m = v; }
    return m;
  });
  F._wave = { src: F.input, peaks };
  return peaks;
}


let ticker = 0;
/**
 * Fil-uppspelningen går ut genom telefonen – då skulle live-motorn mastra den en gång till. Medan Fil spelar
 * pausas därför live-mastringen (Masterlab av); hörlurskorrigeringen ligger kvar. Återställs vid paus/byte av vy.
 */
let livePaused = false;
async function pauseLive() {
  if (!LiveDsp || livePaused || !ui.status?.running || ui.status?.bypass) return;
  livePaused = true;
  ui.status = await LiveDsp.setBypass({ on: true });
}
async function resumeLive() {
  if (!LiveDsp || !livePaused) return;
  livePaused = false;
  ui.status = await LiveDsp.setBypass({ on: false });
}
/** Fil spelar → Live-mastringen är pausad och 🎚️ i rubriken spärrad (annars mastras låten två gånger: "kaka på kaka"). */
function setFilePlaying(on) {
  if (!!ui.filePlaying === on) return;
  ui.filePlaying = on;
  app.renderPart('status');
}
export function stopFilePlayback() { player.pause(); clearInterval(ticker); resumeLive(); setFilePlaying(false); }

async function exportWav(channels, fs, baseName) {
  let ch = await resample(channels, fs, F.rate);
  // Omsamplingen kan flytta toppar mellan samplen en aning – håll taket även efter den
  const ceil = 10 ** (F.params.ceiling / 20), tp = truePeak(ch);
  if (tp > ceil) { const k = ceil / tp; ch = ch.map((c) => c.map((v) => v * k)); }
  const wav = encodeWav(ch, F.rate, F.bits);
  const name = `${baseName.replace(/\.[^.]+$/, '') || 'master'} - master ${F.bits}bit ${F.rate === 44100 ? '44k' : '48k'}.wav`;
  return { name, how: await saveFile(name, wav, 'audio/wav', fileDeps()) };
}


async function runAlbum() {
  F.albumBusy = true;
  const p = { ...effective(), inLufs: null }; // varje låt mäts för sig
  for (const t of F.album) {
    try {
      t.status = 'läser…'; app.render();
      const a = await decodeFile(t.file);
      t.status = 'mastrar…'; app.render();
      const r = await renderInWorker({ channels: a.channels, fs: a.fs }, p, () => {});
      t.lufs = r.metrics.integrated; t.tp = r.metrics.truePeak;
      t.status = 'exporterar…'; app.render();
      await exportWav(r.channels, r.fs, t.name);
      t.status = '✓ klar';
    } catch (e) { t.status = `fel: ${e.message}`; }
    app.render();
  }
  const ok = F.album.filter((t) => t.status === '✓ klar');
  const spread = ok.length > 1 ? Math.max(...ok.map((t) => t.lufs)) - Math.min(...ok.map((t) => t.lufs)) : 0;
  F.albumMsg = `${ok.length} av ${F.album.length} låtar klara. Nivåskillnad mellan låtarna: ${spread.toFixed(1)} LU.`;
  F.albumBusy = false;
  app.render();
}


// ---- Ark: Låt, Export, Lyssna ----
async function saveSettingsFile(name) {
  const fname = `${name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'installning'} - masterlab.json`;
  await saveFile(fname, exportFileSettings({ name, params: F.params, enabled: F.enabled, presetId: F.presetId }), 'application/json', fileDeps());
  return { name: fname };
}

/** Sparar nuvarande inställning som en version (för Jämför). Högst 6 per låt. */
async function saveVersion(name) {
  const v = { id: `v-${Date.now().toString(36)}`, name: name.trim() || 'Version', params: structuredClone(F.params), enabled: { ...F.enabled }, presetId: F.presetId, song: F.name, lufs: F.result?.metrics.integrated ?? null };
  F.versions = [...F.versions.filter((x) => x.song !== F.name || songVersions().indexOf(x) >= songVersions().length - 5), v].slice(-60);
  F.versionId = v.id;
  await save('fileVersions', F.versions);
  return v;
}

// ---- Automastring (ett tryck) ----
load('autoPrefs', null).then((v) => { if (v) F.auto = { ...F.auto, ...v }; });
F.auto = { style: 'auto', strength: 'balans' };
const refProfile = () => currentRef()?.profile || null;

/** Behöver låten mastras? Diagnos av originalet (samma mätningar som renderingen gör). */
function songDiagnosis() {
  if (!F.input || !F.profile) return null;
  if (F._clip == null) { let c = 0; for (const ch of F.input.channels) for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) >= 0.999) c++; F._clip = c; }
  return diagnose({ profile: F.profile, original: F.result?.original || {}, stereo: F.result?.originalStereo || null, clipped: F._clip, edges: F.edges });
}
const diagHtml = (dg) => `<div class="diag ${dg.verdict}" data-testid="diagnos"><b>${esc(dg.title)}</b>
  <ul class="checks">${dg.points.map(([k, t]) => `<li class="${k === 'info' ? 'ok' : k}">${k === 'warn' ? '!' : k === 'info' ? 'ℹ' : '✓'} ${esc(t)}</li>`).join('')}</ul></div>`;

/** Väljaren: diagnos, stil, styrka, mål och (om du har en) referens. */
function autoSheet() {
  const dg = songDiagnosis();
  if (dg && !F.autoTouched) F.auto.strength = dg.strength; // förval efter diagnosen tills du själv väljer styrka
  const seg = (name, cur, opts) => `<div class="seg" data-aseg="${name}">${opts.map(([v, l]) => `<button data-av="${esc(v)}" class="${cur === v ? 'sel' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const refs = ui.refs || [];
  const d = sheet(`<h2>✨ Automastra</h2>
    ${dg ? `<div class="phead"><b>Behöver låten mastras?</b>${infoBtn('diagnos')}</div>${diagHtml(dg)}` : ''}
    <p class="hint small">✨ ställer in hela kedjan efter analysen: preset efter stil, tämjer det som sticker ut i klangen,
    rättar hårda s-ljud, skimmer och bred bas, sätter nivå och fade. Du kan ändra allt efteråt – och ↶ ångrar.</p>
    <div class="phead"><b>Stil</b></div><div class="chips autostyles">${AUTO_STYLES.map(([v, l]) => `<button class="chip${F.auto.style === v ? ' sel' : ''}" data-astyle="${esc(v)}">${esc(l)}</button>`).join('')}</div>
    <div class="phead" style="margin-top:10px"><b>Hur mycket</b></div>${seg('strength', F.auto.strength, AUTO_STRENGTHS)}
    <div class="phead" style="margin-top:10px"><b>Var ska den spelas</b></div>${seg('target', F.params.target === 'hog' ? 'hog' : 'streaming', [['streaming', 'Streaming −14'], ['hog', 'Hög −10']])}
    ${refs.length ? `<div class="phead" style="margin-top:10px"><b>Låter som (valfritt)</b></div><div class="chips">${[['', 'Ingen'], ...refs.map((r) => [r.id, r.name])].map(([v, l]) => `<button class="chip${(ui.refId || '') === v ? ' sel' : ''}" data-aref="${esc(v)}">${esc(l)}</button>`).join('')}</div>` : ''}
    <button class="btn primary wide" id="f-auto-go" style="margin-top:14px">✨ Mastra</button>`, { cls: 'autosheet', closeText: 'Avbryt' });
  let target = F.params.target === 'hog' ? 'hog' : 'streaming';
  d.querySelectorAll('[data-astyle]').forEach((b) => { b.onclick = () => { F.auto.style = b.dataset.astyle; d.querySelectorAll('[data-astyle]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
  d.querySelectorAll('[data-aseg]').forEach((g) => g.querySelectorAll('[data-av]').forEach((b) => {
    b.onclick = () => { g.querySelectorAll('[data-av]').forEach((x) => x.classList.toggle('sel', x === b)); if (g.dataset.aseg === 'strength') { F.auto.strength = b.dataset.av; F.autoTouched = true; } else target = b.dataset.av; };
  }));
  d.querySelectorAll('[data-aref]').forEach((b) => { b.onclick = () => { selectRef(b.dataset.aref); d.querySelectorAll('[data-aref]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
  d.querySelector('#f-auto-go').onclick = async () => { save('autoPrefs', F.auto); d.close(); await runAuto({ target }); };
}

/** Ställer in kedjan efter analysen, renderar och visar vad som gjordes. */
async function runAuto({ target = F.params.target === 'hog' ? 'hog' : 'streaming' } = {}) {
  if (!F.input || !F.profile) return;
  pushUndo(); lastSnap = 0;
  const r = autoMaster({ profile: F.profile, stereo: F.result?.originalStereo || null, ref: refProfile(), style: F.auto.style, strength: F.auto.strength, target, edges: F.edges });
  F.params = r.params; F.presetId = r.presetId; F.enabled = {}; F.versionId = ''; F.autoActions = r.actions;
  if (realtime) playParams(heard(), F.result?.drive ?? 0);
  persist();
  app.render();
  await doRender();
  autoResult();
}

function autoResult() {
  const r = F.result; if (!r || !F.autoActions) return;
  const m = r.metrics, plr = m.truePeak - m.integrated;
  const warn = masterChecks(m, r.gr).filter(([k]) => k !== 'ok');
  const d = sheet(`<h2>✨ Automastring klar</h2>
    <ul class="autoacts" data-testid="autoactions">${F.autoActions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    <p class="hint small">Resultat: ${m.integrated.toFixed(1).replace('.', ',')} LUFS · true peak ${m.truePeak.toFixed(1).replace('.', ',')} dBTP · PLR ${plr.toFixed(1).replace('.', ',')} dB${r.gr.avg ? ` · i snitt: kompressor ${Math.max(...r.gr.avg.mbc).toFixed(1).replace('.', ',')} dB, lim ${r.gr.avg.glue.toFixed(1).replace('.', ',')} dB, limiter ${r.gr.avg.limiter.toFixed(1).replace('.', ',')} dB` : ''}</p>
    ${warn.length ? `<ul class="checks">${warn.map(([, t]) => `<li class="warn">! ${esc(t)}</li>`).join('')}</ul>` : '<p class="hint small ok">✓ Klarar exportkontrollen.</p>'}
    <p class="hint small">Lyssna med <b>A | B</b> (lika nivå). Vill du ändra något: justera blocken, eller kör igen med en annan stil eller styrka.</p>
    <div class="btnrow"><button class="btn" id="f-auto-undo">↶ Ångra</button><button class="btn" id="f-auto-again">Igen…</button><button class="btn primary" id="f-auto-export">⤓ Exportera</button></div>
    <button class="btn wide" id="f-auto-cmp" style="margin-top:8px">⚖ Spara och jämför mot originalet</button>`, { cls: 'autosheet', closeText: 'Lyssna' });
  d.querySelector('#f-auto-cmp').onclick = async () => {
    const st = AUTO_STRENGTHS.find((s) => s[0] === F.auto.strength)?.[1] || '';
    await saveVersion(`Auto ${presetOf(F.presetId)?.name || ''} ${st}`.replace(/\s+/g, ' ').trim().slice(0, 28));
    d.close(); F.mode = 'compare'; F.compare = null; app.render();
  };
  d.querySelector('#f-auto-undo').onclick = () => { d.close(); undo(); doRender(); };
  d.querySelector('#f-auto-again').onclick = () => { d.close(); autoSheet(); };
  d.querySelector('#f-auto-export').onclick = () => { d.close(); exportSheet(); };
}

function songSheet() {
  const d = sheet(`<h2>${esc(F.input ? F.name : 'Ingen låt')}</h2>
    ${F.input ? `<p class="hint small" data-testid="fname">${esc(F.name)} · ${mmss(F.input.channels[0].length / F.input.fs)} · ${F.saved ? 'sparad på telefonen ✓' : 'inte sparad'}</p>` : ''}
    <div class="menu">
      <label class="btn wide file">${F.input ? 'Byt låt' : 'Välj låt (MP3/WAV)'}<input type="file" id="f-file2" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" hidden></label>
      <button class="btn wide" data-fmode="assist">🪄 Assistent – mastra i 5 steg</button>
      <button class="btn wide" data-fmode="compare" ${F.input ? '' : 'disabled'}>⚖ Jämför versioner (loop, blindtest)</button>
      <button class="btn wide" data-fmode="album">💿 Album – flera låtar</button>
      <button class="btn wide" id="f-fresh2" ${F.input ? '' : 'disabled'}>↺ Börja om med orörd låt</button>
      <label class="btn wide file ${F.input ? '' : 'disabled'}" id="f-import-lbl">⤒ Importera inställning<input type="file" id="f-import" accept=".json,application/json" hidden ${F.input ? '' : 'disabled'}></label>
      <button class="btn wide" id="f-export-set" ${F.input ? '' : 'disabled'}>⤓ Spara inställning</button>
      ${F.input ? '<button class="btn wide ghost" id="f-forget">Glöm låten</button>' : ''}
    </div><p class="hint small" data-testid="impmsg"></p>`, { cls: 'songsheet' });
  d.querySelector('#f-file2').onchange = (e) => { const f = e.target.files?.[0]; d.close(); if (f) openSong(f); };
  d.querySelectorAll('[data-fmode]').forEach((b) => { b.onclick = () => { d.close(); F.mode = b.dataset.fmode; F.assistStep = F.input ? 2 : 1; if (F.mode === 'compare') F.compare = { on: null }; app.render(); }; });
  d.querySelector('#f-fresh2').onclick = () => { d.close(); freshStart(); };
  d.querySelector('#f-import').onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const s = parseFileSettings(await f.text());
      pushUndo();
      Object.assign(F, { params: { ...s.params, target: s.params.target }, enabled: s.enabled, presetId: s.presetId });
      await saveVersion(s.name);
      d.close(); F.mode = 'compare'; F.compare = { on: null }; F.msg = '';
      if (realtime) playParams(heard(), F.result?.drive ?? 0);
      persist(); F.stale = !!F.result; app.render(); paramsChanged();
    } catch (err) { d.querySelector('[data-testid=impmsg]').textContent = err.message; }
  };
  d.querySelector('#f-export-set').onclick = async () => {
    const name = await ask({ title: 'Spara inställning', value: F.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Inställning', okText: 'Spara' });
    if (name === null) return;
    try { const { name: fn } = await saveSettingsFile(name); d.querySelector('[data-testid=impmsg]').textContent = `Sparad: ${fn}`; } catch (err) { d.querySelector('[data-testid=impmsg]').textContent = `Misslyckades: ${err.message}`; }
  };
  const fg = d.querySelector('#f-forget');
  if (fg) fg.onclick = async () => { d.close(); stopFilePlayback(); await forgetSong(); Object.assign(F, { input: null, result: null, name: '', profile: null, saved: false }); app.render(); };
}

/** Kontroll före export: rendering färsk, true peak, klippt original, mono. */
function exportChecks() {
  const r = F.result, out = [];
  if (!r) return out;
  if (F.stale) out.push(['warn', 'Ändrat sedan senaste renderingen – rendera först så att filen får dina ändringar.']);
  if (r.metrics.truePeak > F.params.ceiling + 0.1) out.push(['bad', `True peak ${fmtDb(r.metrics.truePeak)} dBTP är över taket ${fmtDb(F.params.ceiling)} dBTP.`]);
  else out.push(['ok', `True peak ${fmtDb(r.metrics.truePeak)} dBTP – under taket.`]);
  if (F._clip == null && F.input) { let c = 0; for (const ch of F.input.channels) for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) >= 0.999) c++; F._clip = c; }
  if (F._clip > 20) out.push(['warn', `Originalet är redan klippt på ${F._clip} ställen – distorsionen går inte att ta bort i mastringen. Exportera om låten från Suno med lägre nivå om det går.`]);
  if (r.stereo?.warnings?.length) r.stereo.warnings.forEach((w) => out.push(['warn', w])); else if (r.stereo) out.push(['ok', 'Låten håller i mono.']);
  out.push(...masterChecks(r.metrics, r.gr));
  return out;
}

function exportSheet() {
  const checks = exportChecks();
  const d = sheet(`<h2>Exportera</h2>
    <div class="seg"><button data-bits="24" class="${F.bits === 24 ? 'sel' : ''}">24 bit</button><button data-bits="16" class="${F.bits === 16 ? 'sel' : ''}">16 bit</button></div>
    <div class="seg"><button data-rate="44100" class="${F.rate === 44100 ? 'sel' : ''}">44,1 kHz</button><button data-rate="48000" class="${F.rate === 48000 ? 'sel' : ''}">48 kHz</button></div>
    <ul class="checks" data-testid="exportchecks">${checks.map(([k, t]) => `<li class="${k}">${k === 'ok' ? '✓' : k === 'bad' ? '✕' : '!'} ${esc(t)}</li>`).join('')}</ul>
    ${F.stale || !F.result ? '<button class="btn primary wide" id="f-render-exp">Rendera</button>' : '<button class="btn primary wide" id="f-export">Exportera WAV</button>'}
    <p class="hint" id="f-exportmsg">${esc(F.exportMsg || '')}</p>
    ${monoCard()}`, { cls: 'exportsheet' });
  d.querySelectorAll('[data-bits]').forEach((b) => { b.onclick = () => { F.bits = Number(b.dataset.bits); d.close(); exportSheet(); }; });
  d.querySelectorAll('[data-rate]').forEach((b) => { b.onclick = () => { F.rate = Number(b.dataset.rate); d.close(); exportSheet(); }; });
  const rr = d.querySelector('#f-render-exp');
  if (rr) rr.onclick = async () => { rr.disabled = true; rr.textContent = 'Renderar…'; clearTimeout(renderTimer); await doRender(); d.close(); exportSheet(); };
  const ex = d.querySelector('#f-export');
  if (ex) ex.onclick = async () => {
    const msg = d.querySelector('#f-exportmsg');
    msg.textContent = 'Förbereder filen…';
    try {
      const { name, how } = await exportWav(F.result.channels, F.result.fs, F.name);
      F.exportMsg = how === 'shared' ? `Sparad som "${name}" (Dokument/Masterlab) – välj var den ska delas.` : `Nedladdad: ${name}`;
    } catch (e) { F.exportMsg = `Exporten misslyckades: ${e.message}`; }
    msg.textContent = F.exportMsg;
  };
}
function listenSheet() {
  const seg = (name, cur, opts) => `<div class="seg" data-lseg="${name}">${opts.map(([v, l]) => `<button data-lv="${v}" class="${cur === v ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
  const d = sheet(`<h2>Lyssna</h2>
    <p class="hint small">Bara för lyssningen – påverkar aldrig exporten.</p>
    <div class="phead"><b>Lika nivå A/B</b>${infoBtn('ab')}</div>${seg('match', !F.matched ? 'off' : F.autoMatch ? 'auto' : 'render', [['auto', 'Automatisk'], ['render', 'Från rendering'], ['off', 'Av']])}
    <div class="phead" style="margin-top:10px"><b>Lyssna som</b>${infoBtn('simulate')}</div>${seg('sim', F.sim, [['normal', 'Normal'], ['mobil', 'Mobil'], ['bil', 'Bil']])}
    <div class="phead" style="margin-top:10px"><b>Mono</b>${infoBtn('monoListen')}</div>${seg('mono', F.mono ? 'on' : 'off', [['off', 'Stereo'], ['on', 'Mono']])}`, { cls: 'listensheet' });
  d.querySelectorAll('[data-lseg]').forEach((g) => g.querySelectorAll('[data-lv]').forEach((b) => {
    b.onclick = () => {
      const v = b.dataset.lv, k = g.dataset.lseg;
      if (k === 'match') { F.matched = v !== 'off'; F.autoMatch = v === 'auto'; applyAb(); }
      if (k === 'sim') F.sim = v;
      if (k === 'mono') F.mono = v === 'on';
      sendMonitor();
      g.querySelectorAll('[data-lv]').forEach((x) => x.classList.toggle('sel', x === b));
    };
  }));
  d.addEventListener('close', () => app.render());
}

// ---- Uppspelning ----
async function playToggle(root) {
  const play = root.querySelector('#f-play');
  if (player.playing) { player.pause(); clearInterval(ticker); resumeLive(); setFilePlaying(false); }
  else {
    await pauseLive();
    setFilePlaying(true);
    if (realtime) playParams(heard(), F.result?.drive ?? 0);
    applyAb(); sendMonitor();
    await player.play();
    clearInterval(ticker);
    ticker = setInterval(() => app.renderPart('fileTime'), 250);
    player.onEnd = () => { clearInterval(ticker); resumeLive(); setFilePlaying(false); app.render(); };
  }
  if (play) { play.textContent = player.playing ? '❚❚' : '▶'; play.setAttribute('aria-label', player.playing ? 'Paus' : 'Spela'); }
}
let meterAt = 0;
player.onMeter = (m) => {
  // Nedtryckningen jämnas ut över ungefär en sekund – en enskild trumträff ska inte se ut som för hård kompression
  const p = F.meter, k = 0.85, sm = (a, b) => (p ? k * a + (1 - k) * b : b);
  F.meter = { ...m, gr: p ? { mbc: m.gr.mbc.map((v, i) => sm(p.gr.mbc[i], v)), deEss: sm(p.gr.deEss, m.gr.deEss), glitter: sm(p.gr.glitter, m.gr.glitter), glue: sm(p.gr.glue, m.gr.glue), limiter: sm(p.gr.limiter, m.gr.limiter) } : m.gr };
  const now = Date.now();
  if (ui.view === 'fil' && F.graph === 'meter' && now - meterAt > 150) { meterAt = now; app.renderPart('fileMeter'); }
};

function moduleGroups(mod) {
  const ok = (p) => p.id !== 'test' && (p.id === 'flat' || !MODULES[mod] || moduleActive(p.params, mod));
  const o = (p) => ({ value: p.id, label: p.name, desc: presetEffects(p.params).join(' · '), icon: '🎚️' });
  return [{ label: '', options: allPresets().filter(ok).map(o) }];
}

export function bindFil(root) {
  bindRender(root);
  (root.querySelector('#f-file') || {}).onchange = (e) => { const f = e.target.files?.[0]; if (f) openSong(f); };
  (root.querySelector('#f-file-auto') || {}).onchange = (e) => { const f = e.target.files?.[0]; if (f) { F.autoPending = true; openSong(f); } };
  (root.querySelector('#f-auto') || {}).onclick = () => autoSheet();
  const a0 = root.querySelector('#f-assist0');
  if (a0) a0.onclick = () => { F.mode = 'assist'; F.assistStep = 1; app.render(); };
  root.querySelectorAll('[data-target]').forEach((b) => {
    b.onclick = () => { pushUndo(); F.params.target = b.dataset.target; F.params = sanitizeFile(F.params); app.render(); paramsChanged(); };
  });
  bindPicker(root, 'f-preset', () => ({ title: 'Huvudpreset – hela kedjan', value: F.presetId, groups: presetGroups({ withTest: false }), onDelete: async (id) => { const ok = await removeUserPreset(id); if (ok) persist(); return ok; } }), (v) => {
    pushUndo();
    F.presetId = v;
    const matchEq = F.params.matchEq;
    F.params = { ...presetFileParams(), matchEq };
    F.versionId = '';
    app.render();
    paramsChanged();
  });
  const feq = root.querySelector('#f-mbc-equal');
  if (feq) feq.onclick = () => { pushUndo(); for (const k of ['ratio', 'threshold', 'attack', 'release', 'knee', 'postGain']) { const m = F.params.mbc.reduce((s, b) => s + b[k], 0) / 4; F.params.mbc.forEach((b) => { b[k] = +m.toFixed(4); }); } app.render(); paramsChanged(); };
  for (const mod of Object.keys(FMODS)) {
    bindPicker(root, `fmod-${mod}`, () => ({ title: `${FMODS[mod].name}-preset – bara ${FMODS[mod].name.toLowerCase()} byts`, value: '', groups: moduleGroups(mod) }), (id) => {
      const p = presetOf(id); if (!p) return;
      pushUndo();
      const lp = p.id === 'flat' ? sanitizeFile(fileNeutral()) : liveToFile(p.params, {}, p.id);
      for (const k of FMODS[mod].keys) F.params[k] = structuredClone(lp[k]);
      app.render(); paramsChanged();
    });
  }
  bindSliders(root, (kind, key, v) => {
    if (kind === 'fpath') { pushUndo(); setPath(F.params, key, v); F.versionId = ''; paramsChanged(); }
    if (kind === 'fmbcall') {
      // Hela låten: flytta alla band lika mycket från där de är (skillnaderna behålls)
      pushUndo();
      const d = v - F.params.mbc.reduce((s, b) => s + b[key], 0) / 4, rng = RANGES[key];
      F.params.mbc.forEach((b) => { b[key] = Math.max(rng[0], Math.min(rng[1], +(b[key] + d).toFixed(4))); });
      paramsChanged();
    }
    if (kind === 'amount') F.matchAmount = v;
  }, (key, on) => {
    pushUndo();
    if (key === 'grp_comp') [0, 1, 2, 3].forEach((i) => { F.enabled[`mbc${i}`] = on; }); else F.enabled[key] = on;
    paramsChanged(); app.render();
  });
  // Solo på en hel del (S) och M/S på ett band (område)
  root.querySelectorAll('#spanel [data-solo]').forEach((b) => {
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); F.solo = F.solo === b.dataset.solo ? null : b.dataset.solo; if (F.solo) F.listen = null; paramsChanged(); app.render(); };
  });
  const area = (a, mode) => { F.listen = F.listen?.area === a && F.listen?.mode === mode ? null : { area: a, mode }; if (F.listen) F.solo = null; paramsChanged(); sendMonitor(); app.render(); };
  root.querySelectorAll('[data-fasolo]').forEach((b) => { b.onclick = () => area(b.dataset.fasolo, 'solo'); });
  root.querySelectorAll('[data-famute]').forEach((b) => { b.onclick = () => area(b.dataset.famute, 'mute'); });
  const lo = root.querySelector('#f-listen-off');
  if (lo) lo.onclick = () => { F.solo = null; F.listen = null; F.delta = false; F.mono = false; F.sim = 'normal'; paramsChanged(); sendMonitor(); app.render(); };
  const dl = root.querySelector('#f-delta');
  if (dl) dl.onclick = () => { F.delta = !F.delta; sendMonitor(); app.render(); };
  // Val i blocken
  root.querySelectorAll('[data-feq1]').forEach((b) => { b.onclick = () => { F.eqView1 = b.dataset.feq1; app.render(); }; });
  root.querySelectorAll('[data-feq2]').forEach((b) => { b.onclick = () => { if (b.dataset.feq2 === 'graphic') F.eqView2 = 'graphic'; else { F.eqView2 = 'peq'; F.eqSel = Number(b.dataset.feq2); } app.render(); }; });
  root.querySelectorAll('[data-fcomp]').forEach((b) => { b.onclick = () => { F.compSel = b.dataset.fcomp === 'all' ? 'all' : Number(b.dataset.fcomp); app.render(); }; });
  root.querySelectorAll('[data-ffarg]').forEach((b) => { b.onclick = () => { F.fargSel = b.dataset.ffarg; app.render(); }; });
  root.querySelectorAll('[data-fgraph]').forEach((b) => { b.onclick = () => { F.graph = b.dataset.fgraph; app.render(); }; });
  (root.querySelector('#f-reset-all') || {}).onclick = () => { pushUndo(); F.params = presetFileParams(); F.enabled = {}; app.render(); paramsChanged(); };
  (root.querySelector('#f-flat') || {}).onclick = () => { pushUndo(); F.params = sanitizeFile({ ...fileNeutral(), target: F.params.target }); F.presetId = ''; app.render(); paramsChanged(); };
  (root.querySelector('#f-all-on') || {}).onclick = () => { pushUndo(); F.enabled = {}; app.render(); paramsChanged(); };
  // Raden: låt, A/B, ångra, export
  (root.querySelector('#f-song') || {}).onclick = songSheet;
  const ab = root.querySelector('#f-ab');
  if (ab) ab.onclick = () => { F.ab = F.ab === 'master' ? 'orig' : 'master'; applyAb(); ab.classList.toggle('on', F.ab === 'master'); ab.setAttribute('aria-pressed', String(F.ab === 'master')); };
  (root.querySelector('#f-undo') || {}).onclick = undo;
  (root.querySelector('#f-exportbtn') || {}).onclick = exportSheet;
  (root.querySelector('#f-listen') || {}).onclick = listenSheet;

  // Spelare
  (root.querySelector('#f-play') || {}).onclick = () => playToggle(root);
  const wave = root.querySelector('#f-wave');
  if (wave) {
    const to = (e) => { const r = wave.getBoundingClientRect(); player.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * player.duration); app.renderPart('fileTime'); };
    let down = false;
    wave.addEventListener('pointerdown', (e) => { down = true; try { wave.setPointerCapture(e.pointerId); } catch { /* */ } to(e); });
    wave.addEventListener('pointermove', (e) => { if (down) to(e); });
    wave.addEventListener('pointerup', () => { down = false; });
    wave.addEventListener('pointercancel', () => { down = false; });
  }
  const stop = root.querySelector('#f-stop');
  if (stop) stop.onclick = () => {
    player.pause(); player.seek(F.loop ? F.loop[0] : 0); clearInterval(ticker); resumeLive(); setFilePlaying(false);
    const play = root.querySelector('#f-play');
    if (play) { play.textContent = '▶'; play.setAttribute('aria-label', 'Spela'); }
    app.renderPart('fileTime');
  };
  const lp = root.querySelector('#f-loop');
  if (lp) lp.onclick = () => {
    // Loop: 20 sekunder från där du är (t.ex. en refräng) – tryck igen för att stänga av
    if (F.loop) F.loop = null;
    else { const t = player.position(), d = player.duration; const a = Math.max(0, Math.min(t, d - 20)); F.loop = [a, Math.min(d, a + 20)]; }
    if (player.setLoop) player.setLoop(F.loop);
    app.render();
  };

  // Lägen
  (root.querySelector('#f-mode-exit') || {}).onclick = () => { F.mode = 'blocks'; F.compare = null; if (realtime) playParams(heard(), F.result?.drive ?? 0); applyAb(); app.render(); };
  root.querySelectorAll('[data-astep]').forEach((b) => {
    b.onclick = async () => {
      const step = Number(b.dataset.astep);
      if (step === 3 && realtime) { F.assistPick = 'B'; playParams(assistVariants().B.p, F.result?.drive ?? 0); }
      if (step === 4 || step === 5) { // välj förslaget
        pushUndo();
        F.params = assistVariants()[F.assistPick].p; F.enabled = {}; F.presetId = F.presetId || '';
        paramsChanged();
        F.mode = 'blocks'; ui.blocks = { ...ui.blocks, fil: 'quick' };
        if (step === 5) { app.render(); clearTimeout(renderTimer); await doRender(); exportSheet(); return; }
      } else F.assistStep = step;
      app.render();
    };
  });
  root.querySelectorAll('[data-apick]').forEach((b) => {
    b.onclick = () => {
      F.assistPick = b.dataset.apick;
      if (F.assistPick === 'before') { F.ab = 'orig'; } else { F.ab = 'master'; if (realtime) playParams(assistVariants()[F.assistPick].p, F.result?.drive ?? 0); }
      applyAb();
      app.render();
    };
  });
  root.querySelectorAll('[data-cslot]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.cslot;
      F.compare = { ...F.compare, on: id };
      if (id === 'orig') F.ab = 'orig';
      else { F.ab = 'master'; const v = F.versions.find((x) => x.id === id); if (v && realtime) playParams(applyFileEnables(sanitizeFile(v.params), v.enabled || {}), F.result?.drive ?? 0); }
      applyAb();
      app.render();
    };
  });
  const bl = root.querySelector('#f-blind');
  if (bl) bl.onclick = () => {
    const c = F.compare || {};
    if (c.blind && !c.revealed) F.compare = { ...c, revealed: true };
    else { const ids = ['orig', ...songVersions().map((v) => v.id)]; for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } F.compare = { on: null, blind: true, revealed: false, order: ids }; }
    app.render();
  };
  const kp = root.querySelector('#f-keep');
  if (kp) kp.onclick = () => {
    const v = F.versions.find((x) => x.id === F.compare?.on); if (!v) return;
    pushUndo();
    F.params = sanitizeFile(v.params); F.enabled = { ...(v.enabled || {}) }; F.presetId = v.presetId; F.versionId = v.id;
    F.mode = 'blocks'; F.compare = null;
    app.render(); paramsChanged();
  };
  const vs = root.querySelector('#v-save');
  if (vs) vs.onclick = async () => {
    const name = await ask({ title: 'Spara version', value: `Version ${'ABCDEF'[songVersions().length] || songVersions().length + 1}`, okText: 'Spara' });
    if (name === null) return;
    await saveVersion(name);
    app.render();
  };
  root.querySelectorAll('[data-vdel]').forEach((b) => {
    b.onclick = async () => { F.versions = F.versions.filter((v) => v.id !== b.dataset.vdel); await save('fileVersions', F.versions); app.render(); };
  });

  // Referens och match-EQ
  bindPicker(root, 'f-ref', () => ({ title: 'Välj referens', value: ui.refId, groups: refGroups() }), async (v) => { await selectRef(v); app.render(); });
  const fm = root.querySelector('#f-match');
  if (fm) fm.onclick = () => {
    // Utgår från det mastrade resultatet om det finns – då räknas presetens EQ med och upprepade tryck förfinar
    pushUndo();
    const own = F.result?.profile || F.profile;
    const add = toFileMatchEq(matchEqCurve(own, currentRef().profile, { amount: F.matchAmount / 100 }));
    F.params.matchEq = F.params.matchEq.map((b, i) => ({ gain: b.gain + add[i] }));
    F.params = sanitizeFile(F.params);
    F.enabled.match = true;
    F.eqView1 = 'match';
    app.render();
    paramsChanged({ now: true });
  };
  const fmr = root.querySelector('#f-match-reset');
  if (fmr) fmr.onclick = () => { pushUndo(); F.params.matchEq = MATCH_FREQS.map(() => ({ gain: 0 })); app.render(); paramsChanged(); };
  if (F.graph === 'spec' && F.profile) {
    const ref = currentRef(), series = { orig: { label: 'Original', bands: F.profile.bands } };
    if (F.result) series.main = { label: 'Mastrad', bands: F.result.profile.bands };
    if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
    bindSpectrum(root.querySelector('#fspec'), series);
  }

  // Album
  (root.querySelector('#a-files') || {}).onchange = (e) => {
    const files = [...(e.target.files || [])];
    F.album = files.map((file) => ({ name: file.name, file, status: 'väntar', lufs: null, tp: null }));
    F.albumMsg = '';
    app.render();
  };
  const ar = root.querySelector('#a-run');
  if (ar) ar.onclick = runAlbum;
}
