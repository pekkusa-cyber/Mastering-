// Live-vyn: PÅ/AV och Bypass, smarta funktioner (jämn volym, konstant utnivå, volymoberoende kompression,
// hörlurskorrigering, profil per enhet), presets, Enkelt/Avancerat med på/av, ⓘ, ↺ och −/+ på allt, och kurvor
// som visar vad inställningarna gör.
import { LiveDsp, isNative } from '../livedsp.js';
import { ui, app } from '../state.js';
import { load, save } from '../store.js';
import {
  BUILTIN_PRESETS, EQ_CUTOFFS, MACROS, MACRO_GROUPS, MBC_CUTOFFS, presetEffects, MBC_NAMES, RANGES, activeMacros, allEnabled, applyEnables,
  applyMacros, bandLabel, deletePreset, exportPresets, importPresets, neutral, noMacros, renamePreset, sanitize,
  savePreset, toNative,
} from '../chain.js';
import { ask, bindPicker, bindSliders, esc, fmtDb, getPath, infoBtn, picker, setPath, sheet, slider, saveFile, toggle } from '../ui.js';
import { compensation, estimate, withCompensation } from '../level.js';
import { eqCurveSvg, compCurvesSvg } from '../viz.js';
import { BUILTIN_HEADPHONES, correctionFor, parseParametric } from '../headphones.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const allPresets = () => [...BUILTIN_PRESETS, ...ui.userPresets];
export const currentPreset = () => allPresets().find((p) => p.id === ui.presetId);
/** Kedjan som den låter: preset + enkla reglage, med avslagna delar neutrala. */
export const effective = () => applyEnables(applyMacros(ui.base, activeMacros(ui.macros, ui.enabled)), ui.enabled);
/** Det som skickas till motorn: med nivåkompensation om Konstant utnivå är på. */
export const sendParams = () => (ui.constant ? withCompensation(effective()) : effective());
const presetBase = () => sanitize(currentPreset()?.params ?? neutral());
const isDirty = () => {
  const p = currentPreset();
  return !p || JSON.stringify(applyMacros(ui.base, ui.macros)) !== JSON.stringify(sanitize(p.params));
};
const en = (k) => ui.enabled[k] !== false;
const headphones = () => [...BUILTIN_HEADPHONES, ...ui.customHeadphones];
const fileDeps = () => ({ isNative, Filesystem, Directory, Encoding, Share });

let sendTimer = 0, saveTimer = 0;
/** Skickar kedjan till motorn (lite fördröjt medan ett reglage dras), sparar lokalt och ritar om kurvorna. */
export function changed({ now = false, user = true } = {}) {
  clearTimeout(sendTimer);
  const send = async () => {
    if (!LiveDsp) return;
    const r = await LiveDsp.setParams({ params: toNative(sendParams()) });
    if (r && typeof r === 'object') { ui.report = { ...r, at: Date.now(), user }; app.renderPart('confirm'); }
  };
  if (now) send(); else sendTimer = setTimeout(send, 60);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save('state', { presetId: ui.presetId, base: ui.base, macros: ui.macros, mode: ui.mode, enabled: ui.enabled, constant: ui.constant }), 300);
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
    ui.mode = st.mode === 'advanced' ? 'advanced' : 'simple';
    ui.enabled = { ...allEnabled(), ...st.enabled };
    ui.constant = st.constant !== false;
  }
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
  const hp = headphones().find((h) => h.id === ui.corr?.id);
  const mode = !appOn ? (hpOn ? 'BARA HÖRLURSKORRIGERING' : 'HELT ORIGINAL') : s.on ? 'MASTRAT' : agc ? 'ORIGINAL · NIVÅMATCHAT' : 'ORIGINAL';
  return `<div class="mains">
      <label class="main ${hpOn ? 'on' : ''}"><input type="checkbox" id="corr" ${hpOn ? 'checked' : ''} aria-label="Hörlurskorrigering">
        <span class="mi">🎧</span><span class="mt"><b>Hörlurar</b><small>${hpOn ? 'neutralt i lurarna' : 'av'}</small></span><i class="mtog"></i></label>
      <label class="main ${appOn ? 'on' : ''}"><input type="checkbox" id="masterlab" ${appOn ? 'checked' : ''} aria-label="Masterlab (bearbetning)">
        <span class="mi">🎚️</span><span class="mt"><b>Masterlab</b><small>${appOn ? 'mastring och smart' : 'av – gör inget'}</small></span><i class="mtog"></i></label>
    </div>
    <button class="btn small ghost pick" id="corr-pick">🎧 ${esc(hp?.name || 'Välj hörlurar')} ›</button>
    ${appOn ? `<button class="abswitch ${s.on ? 'on' : ''}" id="onoff" aria-pressed="${!!s.on}" aria-label="Mastrad på/av">
      <span class="o">Original</span><span class="m">Mastrad</span></button>` : ''}
    <p class="status"><b data-testid="mode">${mode}</b> · <span data-testid="motor">${s.running
      ? (s.globalActive ? 'Bearbetar allt ljud' : `Bearbetar ${s.sessions.filter((x) => x.attached).length} spelande appar`)
      : 'Motorn startar när du slår på något'}</span>${s.output?.name ? ` · ${esc(s.output.name)}` : ''}${infoBtn('mains', 'Om huvudbrytarna')}</p>`;
}

/** Smarta funktioner som chips (design A) + val av hörlurar och profil för enheten. */
export function agcRow() {
  const s = ui.status || {};
  const a = s.agc || {};
  const comp = ui.constant ? compensation(effective()) : 0;
  const hp = headphones().find((h) => h.id === ui.corr?.id);
  const out = s.output || {};
  const prof = out.key && ui.profiles[out.key];
  const pill = (id, on, text, aria, extra = '') => `<label class="pill ${on ? 'on' : ''}"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} aria-label="${esc(aria)}">${on ? '✓ ' : ''}${esc(text)}${extra}</label>`;
  return `<div class="pills">
      ${pill('agc', a.on, 'Jämn volym', 'Jämn volym', a.on ? `<small data-testid="agcread"> ${fmtDb(a.gain)} dB${a.probing ? ' · mäter' : ''}</small>` : '')}
      ${pill('constant', ui.constant, 'Konstant nivå', 'Konstant utnivå', ui.constant ? `<small data-testid="compread"> ${fmtDb(comp)} dB</small>` : '')}
      ${pill('volcomp', s.volComp !== false, 'Volymoberoende', 'Volymoberoende kompression')}
    </div>
    <div class="row smallrow"><span class="grow"></span>${infoBtn('smart', 'Om smarta funktioner')}</div>
    ${ui.agcMsg ? `<p class="hint small" id="agcmsg">${esc(ui.agcMsg)}</p>` : ''}
    ${ui.corrMsg ? `<p class="hint small" id="corrmsg">${esc(ui.corrMsg)}</p>` : ''}
    <div class="row profile"><span class="small">Profil för <b>${esc(out.name || 'utgången')}</b>${infoBtn('deviceProfile')}</span><span class="grow"></span>
      ${prof ? `<span class="ok small" data-testid="profile">✓ ${esc(prof.label)}</span><button class="btn small ghost" id="prof-del" aria-label="Ta bort profilen">✕</button>`
        : '<button class="btn small" id="prof-save">Spara nuvarande</button>'}</div>
    ${s.profileApplied ? `<p class="hint small" id="profmsg">Profilen för ${esc(s.profileApplied)} används.</p>` : ''}`;
}

/** Alternativen i presetväljaren: mina först, sedan inbyggda – med ikon och beskrivning. */
export function presetGroups({ withTest = true } = {}) {
  const o = (p) => ({ value: p.id, label: p.name, desc: p.desc || 'Din egen preset', icon: PRESET_ICONS[p.id] || '⭐' });
  return [
    ...(ui.userPresets.length ? [{ label: 'Mina', options: ui.userPresets.map(o) }] : []),
    { label: 'Inbyggda', options: BUILTIN_PRESETS.filter((p) => withTest || p.id !== 'test').map(o) },
  ];
}

function presetCard() {
  const p = currentPreset();
  const card = (x) => `<button class="pc ${x.id === ui.presetId ? 'sel' : ''}" data-preset="${esc(x.id)}">
      <span class="ico">${PRESET_ICONS[x.id] || '⭐'}</span><b>${esc(x.name)}</b><small>${esc(x.desc || 'Din egen preset')}</small></button>`;
  return `<section class="presets-wrap">
    <div class="row"><h2 class="sec-h">Preset ${infoBtn('presets')}</h2><span id="dirty" class="dim small" ${isDirty() ? '' : 'hidden'}>ändrad</span><span class="grow"></span>
      <button class="btn small" id="p-menu" aria-label="Hantera presets">⋯ Hantera</button></div>
    <div class="pcards" id="pcards">${[...ui.userPresets, ...BUILTIN_PRESETS].map(card).join('')}</div>
    ${picker({ id: 'preset', label: 'Preset', value: ui.presetId, groups: presetGroups(), placeholder: '(egen inställning)' })}
    <p class="hint small" id="pdesc">${esc(p?.desc || (p ? 'Din egen preset.' : 'Ändrad från en preset eller platt.'))}</p>
    <p class="affects" data-testid="affects"><b>Påverkar:</b> ${esc(presetEffects(p?.params ?? ui.base).join(' · '))}</p>
    ${ui.msg ? `<p class="hint" id="msg">${esc(ui.msg)}</p>` : ''}
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
  const p = effective();
  const e = estimate(p);
  const hp = headphones().find((h) => h.id === ui.corr?.id);
  const corr = ui.status?.correction?.on && hp ? correctionFor(hp) : null;
  const eq = kind !== 'comp' ? eqCurveSvg({ pre: p.preEq.map((b) => b.gain), post: p.postEq.map((b) => b.gain), corr }) : '';
  const comp = kind !== 'eq' ? compCurvesSvg({ mbc: p.mbc, limiter: p.limiter, gr: e.mbcGr, limGr: e.limGr, enabled: ui.enabled }) : '';
  return eq + comp;
}

function simpleCard() {
  const macro = (m) => `${slider({ id: `m-${m.key}`, label: m.label, value: ui.macros[m.key] ?? 0, range: [-100, 100, 1, ''], info: m.key, resetTo: 0, kind: 'macro', key: m.key, enable: { key: `m_${m.key}`, on: en(`m_${m.key}`) } })}
    <p class="affects small">Påverkar: ${esc(m.affects)}</p>`;
  const group = (g) => {
    const ms = MACROS.filter((m) => m.group === g.id);
    const allOn = ms.every((m) => en(`m_${m.key}`));
    return `<section class="card grp" data-group="${g.id}">
      <h3>${esc(g.name.toUpperCase())}<span class="grow"></span>${toggle(`grp_${g.id}`, allOn, g.name)}</h3>
      ${ms.map(macro).join('')}
      ${g.id === 'dynamik' ? levelBlock() : ''}
    </section>`;
  };
  return `<div id="simple">
    ${MACRO_GROUPS.map(group).join('')}
    <section class="card"><details class="sec" data-sec="viz-simple"><summary>Visa kurvor${infoBtn('eqCurve')}</summary><div class="vizbox" data-vizbox="all">${vizPart('all')}</div></details>
    <div class="btnrow"><button class="btn small" id="reset-all">Återställ alla</button></div></section>
  </div>`;
}

const section = (id, title, info, body, { open = false, enableKey = null } = {}) =>
  `<details class="sec${enableKey && !en(enableKey) ? ' off' : ''}" data-sec="${id}" ${open ? 'open' : ''}><summary>${enableKey ? toggle(enableKey, en(enableKey), title) : ''}${esc(title)}${infoBtn(info, `Om ${title}`)}</summary><div class="secbody">${body}</div></details>`;

function advancedCard() {
  const eq = (k) => EQ_CUTOFFS.map((_, i) => path(`${k}.${i}.gain`, bandLabel(EQ_CUTOFFS, i), RANGES.eqGain)).join('');
  const mbc = MBC_CUTOFFS.map((_, i) => `<details class="band${en(`mbc${i}`) ? '' : ' off'}"><summary>${toggle(`mbc${i}`, en(`mbc${i}`), MBC_NAMES[i])}${esc(MBC_NAMES[i])}${infoBtn(`mbcBand${i}`)}</summary>
      ${path(`mbc.${i}.threshold`, 'Tröskel', RANGES.threshold)}
      ${path(`mbc.${i}.ratio`, 'Ratio', RANGES.ratio)}
      ${path(`mbc.${i}.attack`, 'Attack', RANGES.attack)}
      ${path(`mbc.${i}.release`, 'Release', RANGES.release)}
      ${path(`mbc.${i}.knee`, 'Knä', RANGES.knee)}
      ${path(`mbc.${i}.preGain`, 'Förstärkning före', RANGES.preGain)}
      ${path(`mbc.${i}.postGain`, 'Förstärkning efter', RANGES.postGain)}
    </details>`).join('');
  return `<section class="card" id="advanced">
    <div class="vizbox" data-vizbox="eq">${vizPart('eq')}</div>
    ${section('input', 'Ingång', 'sec_input', path('inputGain', 'Ingångsförstärkning', RANGES.inputGain), { open: true, enableKey: 'input' })}
    ${section('preEq', 'Pre-EQ', 'sec_preEq', eq('preEq'), { enableKey: 'preEq' })}
    ${section('mbc', 'Multiband-kompressor', 'sec_mbc', `<div class="vizbox" data-vizbox="comp">${vizPart('comp')}</div>${mbc}`)}
    ${section('postEq', 'Post-EQ', 'sec_postEq', eq('postEq'), { enableKey: 'postEq' })}
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

export function liveView() {
  return `
    <section class="hero" id="statusArea">${onButton()}</section>
    <section class="card smart ${ui.status?.bypass ? 'dimmed' : ''}" id="agcArea">${agcRow()}</section>
    ${presetCard()}
    <div class="seg" role="tablist">
      <button data-mode="simple" class="${ui.mode === 'simple' ? 'sel' : ''}">Enkelt</button>
      <button data-mode="advanced" class="${ui.mode === 'advanced' ? 'sel' : ''}">Avancerat</button>
      ${infoBtn(ui.mode === 'simple' ? 'simple' : 'advanced')}
    </div>
    ${ui.mode === 'simple' ? simpleCard() : advancedCard()}`;
}

/** Ritar om kurvorna (och nivåkompensationen) utan att röra reglagen. */
export function renderViz(root) {
  root.querySelectorAll('[data-vizbox]').forEach((el) => { el.innerHTML = vizPart(el.dataset.vizbox); });
  const c = root.querySelector('[data-testid=compread]');
  if (c) c.textContent = `${fmtDb(compensation(effective()))} dB`;
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
  ui.msg = '';
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
  ui.corr = { on: !!on, id: hp.id };
  await save('corr', ui.corr);
  const r = await LiveDsp.setCorrection({ on: !!on, correction: correctionFor(hp) });
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
    b.onclick = async () => { ui.corr.id = b.dataset.hp; d.close(); await sendCorrection(true); ui.corrMsg = ''; app.render(); };
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
      app.render();
    } catch (e) { d.querySelector('#hp-msg').textContent = e.message; }
  };
}

/** Profiler per ljudutgång: sparas lokalt och i motorn (så att bytet sker även när appen ligger i bakgrunden). */
async function sendProfiles() {
  const native = {};
  for (const [key, p] of Object.entries(ui.profiles)) {
    const hp = headphones().find((h) => h.id === p.corr?.id);
    const eff = applyEnables(applyMacros(p.base, activeMacros(p.macros, p.enabled)), p.enabled);
    native[key] = { params: toNative(p.constant ? withCompensation(eff) : eff), correction: hp ? { on: !!p.corr.on, ...correctionFor(hp) } : { on: false } };
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
  Object.assign(ui, { presetId: p.presetId, base: structuredClone(p.base), macros: { ...noMacros(), ...p.macros }, enabled: { ...allEnabled(), ...p.enabled }, constant: p.constant !== false });
  if (p.corr) ui.corr = { ...p.corr };
  return true;
}

export function bindLive(root) {
  bindStatus(root);
  bindAgc(root);
  bindSliders(root, (kind, key, v) => {
    if (kind === 'path') setPath(ui.base, key, v);
    if (kind === 'macro') ui.macros[key] = v;
    changed();
  }, (key, on) => {
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
      if (b.dataset.mode === 'advanced') { ui.base = applyMacros(ui.base, activeMacros(ui.macros, ui.enabled)); ui.macros = noMacros(); } // enkla reglagen bakas in
      ui.mode = b.dataset.mode;
      changed();
      app.render();
    };
  });
  bindPicker(root, 'preset', () => ({ title: 'Välj preset', value: ui.presetId, groups: presetGroups() }), selectPreset);
  root.querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => selectPreset(b.dataset.preset); });
  root.querySelector('.pc.sel')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  root.querySelector('#p-menu').onclick = presetMenu;
  root.querySelector('#reset-all').onclick = () => {
    if (ui.mode === 'simple') { ui.macros = noMacros(); ui.base.outputGain = presetBase().outputGain; }
    else { ui.base = presetBase(); ui.macros = noMacros(); }
    ui.enabled = allEnabled();
    ui.msg = currentPreset() ? `Återställd till "${currentPreset().name}".` : 'Återställd.';
    changed({ now: true });
    app.render();
  };
  const flat = root.querySelector('#flat');
  if (flat) flat.onclick = () => {
    ui.base = neutral(); ui.macros = noMacros(); ui.presetId = '';
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
  const pickBtn = root.querySelector('#corr-pick');
  if (pickBtn) pickBtn.onclick = pickHeadphones;
  const o = root.querySelector('#onoff');
  if (o) o.onclick = toggleOn;
}

export function bindAgc(root) {
  const a = root.querySelector('#agc');
  if (!a) return;
  a.onchange = async () => {
    ui.agcMsg = '';
    try { ui.status = await LiveDsp.setAgc({ on: a.checked }); } catch (e) { a.checked = false; ui.agcMsg = e.message; }
    app.render();
  };
  root.querySelector('#constant').onchange = (e) => { ui.constant = e.target.checked; changed({ now: true }); app.render(); };
  root.querySelector('#volcomp').onchange = async (e) => { ui.status = await LiveDsp.setVolComp({ on: e.target.checked }); app.render(); };
  const ps = root.querySelector('#prof-save');
  if (ps) ps.onclick = async () => {
    const out = ui.status.output;
    const label = currentPreset()?.name || 'egen inställning';
    ui.profiles = { ...ui.profiles, [out.key]: { label, presetId: ui.presetId, base: ui.base, macros: ui.macros, enabled: ui.enabled, constant: ui.constant, corr: { ...ui.corr, on: !!ui.status.correction?.on } } };
    await sendProfiles();
    app.render();
  };
  const pd = root.querySelector('#prof-del');
  if (pd) pd.onclick = async () => {
    const { [ui.status.output.key]: _, ...rest } = ui.profiles;
    ui.profiles = rest;
    await sendProfiles();
    app.render();
  };
}
