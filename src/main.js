import { LiveDsp, isNative, isSim } from './livedsp.js';
import { HELP } from './help.js';
import { load, save } from './store.js';
import {
  BUILTIN_PRESETS, EQ_CUTOFFS, MACROS, MBC_CUTOFFS, MBC_NAMES, RANGES, applyMacros, bandLabel, deletePreset,
  exportPresets, importPresets, noMacros, renamePreset, sanitize, savePreset, toNative,
} from './chain.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const GRANT_CMD = 'adb shell pm grant se.foric.masterlab android.permission.DUMP';
const app = document.getElementById('app');

// ---- Tillstånd ----
const ui = {
  view: 'live',          // 'live' | 'perms'
  mode: 'simple',        // 'simple' | 'advanced'
  presetId: 'mjuk-kick',
  base: structuredClone(BUILTIN_PRESETS[0].params),
  macros: noMacros(),
  userPresets: [],
  status: null,
  perms: null,
  msg: '',
  levelMsg: '',
  busy: false,
};

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const allPresets = () => [...BUILTIN_PRESETS, ...ui.userPresets];
const currentPreset = () => allPresets().find((p) => p.id === ui.presetId);
const effective = () => applyMacros(ui.base, ui.macros);
const isDirty = () => {
  const p = currentPreset();
  return !p || JSON.stringify(effective()) !== JSON.stringify(sanitize(p.params));
};

let sendTimer = 0;
let saveTimer = 0;
/** Skickar kedjan till motorn (lite fördröjt medan ett reglage dras) och sparar läget lokalt. */
function changed({ now = false } = {}) {
  clearTimeout(sendTimer);
  const send = () => LiveDsp?.setParams({ params: toNative(effective()) });
  if (now) send(); else sendTimer = setTimeout(send, 60);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save('state', { presetId: ui.presetId, base: ui.base, macros: ui.macros, mode: ui.mode }), 300);
  const d = app.querySelector('#dirty');
  if (d) d.hidden = !isDirty();
}

// ---- Liten dialog för namn och bekräftelser (fungerar likadant i webbläsare och WebView) ----
function ask({ title, value = null, okText = 'OK' }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask';
    d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>
      ${value !== null ? `<input name="v" value="${esc(value)}" maxlength="60" autocomplete="off">` : ''}
      <div class="btns"><button class="btn" value="cancel" formnovalidate>Avbryt</button><button class="btn primary" value="ok">${esc(okText)}</button></div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => {
      const ok = d.returnValue === 'ok';
      const v = d.querySelector('input')?.value ?? '';
      d.remove();
      resolve(ok ? (value !== null ? v : true) : null);
    });
    d.showModal();
    d.querySelector('input')?.select();
  });
}

// ---- Reglage ----
const fmt = (v, step) => (step < 1 ? Number(v).toFixed(1) : String(Math.round(v)));
function slider({ id, label, value, range, attrs = '' }) {
  const [min, max, step, unit] = range;
  return `<label class="sl"><span class="name">${esc(label)}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" ${attrs}>
    <output>${fmt(value, step)} ${unit}</output></label>`;
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
function setPath(obj, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = v;
}
const pathSlider = (path, label, range) =>
  slider({ id: `p-${path.replace(/\./g, '-')}`, label, value: getPath(ui.base, path), range, attrs: `data-path="${path}"` });

// ---- Vyer ----
function header() {
  return `<header class="top">
    <h1>Masterlab</h1>
    <nav class="tabs">
      <button data-view="live" class="${ui.view === 'live' ? 'sel' : ''}">Live</button>
      <button data-view="perms" class="${ui.view === 'perms' ? 'sel' : ''}">Behörigheter</button>
    </nav>
    <button class="info" data-help="${ui.view}" aria-label="Hjälp">ⓘ</button>
  </header>`;
}

function onButton() {
  const s = ui.status;
  return `<button class="big ${s?.on ? 'on' : ''}" id="onoff" aria-pressed="${!!s?.on}">
    <span>${s?.on ? 'MASTRAT' : 'ORIGINAL'}</span><strong>${s?.on ? 'PÅ' : 'AV'}</strong></button>
    <p class="status" data-testid="motor">${s?.running
      ? (s.globalActive ? 'Bearbetar allt ljud (global session)' : `Motorn går · ${s.sessions.filter((x) => x.attached).length} sessioner kopplade`)
      : 'Motorn är stoppad – startar när du slår PÅ'}</p>`;
}

function presetBar() {
  const opt = (p) => `<option value="${esc(p.id)}" ${p.id === ui.presetId ? 'selected' : ''}>${esc(p.name)}</option>`;
  const user = ui.userPresets.some((p) => p.id === ui.presetId);
  return `<section class="card">
    <div class="row"><h2>Preset <span id="dirty" class="dim" ${isDirty() ? '' : 'hidden'}>(ändrad)</span></h2></div>
    <select id="preset" aria-label="Preset">
      <optgroup label="Inbyggda">${BUILTIN_PRESETS.map(opt).join('')}</optgroup>
      ${ui.userPresets.length ? `<optgroup label="Mina">${ui.userPresets.map(opt).join('')}</optgroup>` : ''}
      ${!currentPreset() ? '<option value="" selected>(egen inställning)</option>' : ''}
    </select>
    <div class="btnrow">
      <button class="btn small" id="p-save">Spara som…</button>
      <button class="btn small" id="p-rename" ${user ? '' : 'disabled'}>Döp om</button>
      <button class="btn small" id="p-delete" ${user ? '' : 'disabled'}>Ta bort</button>
    </div>
    <div class="btnrow">
      <button class="btn small" id="p-export" ${ui.userPresets.length ? '' : 'disabled'}>Exportera</button>
      <label class="btn small file">Importera<input type="file" id="p-import" accept=".json,application/json" hidden></label>
    </div>
    ${ui.msg ? `<p class="hint" id="msg">${esc(ui.msg)}</p>` : ''}
  </section>`;
}

function levelCard() {
  return `<section class="card">
    ${pathSlider('outputGain', 'Utgångsnivå (nivåmatchning)', RANGES.outputGain)}
    <div class="btnrow"><button class="btn small" id="autolevel">Auto-nivåmatcha</button></div>
    ${ui.levelMsg ? `<p class="hint" id="levelmsg">${esc(ui.levelMsg)}</p>` : ''}
  </section>`;
}

function simpleCard() {
  return `<section class="card" id="simple">
    ${MACROS.map((m) => `${slider({ id: `m-${m.key}`, label: m.label, value: ui.macros[m.key], range: [-100, 100, 1, ''], attrs: `data-macro="${m.key}"` })}
      <p class="hint small">${esc(m.help)}</p>`).join('')}
    <button class="btn small" id="m-reset">Nollställ reglagen</button>
  </section>`;
}

function advancedCard() {
  const eq = (key) => EQ_CUTOFFS.map((_, i) => pathSlider(`${key}.${i}.gain`, bandLabel(EQ_CUTOFFS, i), RANGES.eqGain)).join('');
  const mbc = MBC_CUTOFFS.map((_, i) => `<details class="band"><summary>${esc(MBC_NAMES[i])}</summary>
      ${pathSlider(`mbc.${i}.threshold`, 'Tröskel', RANGES.threshold)}
      ${pathSlider(`mbc.${i}.ratio`, 'Ratio', RANGES.ratio)}
      ${pathSlider(`mbc.${i}.attack`, 'Attack', RANGES.attack)}
      ${pathSlider(`mbc.${i}.release`, 'Release', RANGES.release)}
      ${pathSlider(`mbc.${i}.knee`, 'Knä', RANGES.knee)}
      ${pathSlider(`mbc.${i}.preGain`, 'Förstärkning före', RANGES.preGain)}
      ${pathSlider(`mbc.${i}.postGain`, 'Förstärkning efter', RANGES.postGain)}
    </details>`).join('');
  return `<section class="card" id="advanced">
    <details open><summary>Ingång</summary>${pathSlider('inputGain', 'Ingångsförstärkning', RANGES.inputGain)}</details>
    <details><summary>Pre-EQ</summary>${eq('preEq')}</details>
    <details><summary>Multiband-kompressor</summary>${mbc}</details>
    <details><summary>Post-EQ</summary>${eq('postEq')}</details>
    <details><summary>Limiter</summary>
      ${pathSlider('limiter.threshold', 'Tak', RANGES.limThreshold)}
      ${pathSlider('limiter.ratio', 'Ratio', RANGES.limRatio)}
      ${pathSlider('limiter.attack', 'Attack', RANGES.limAttack)}
      ${pathSlider('limiter.release', 'Release', RANGES.limRelease)}
      ${pathSlider('limiter.postGain', 'Efterförstärkning', RANGES.limPostGain)}
    </details>
  </section>`;
}

function sessionRow(s) {
  const ok = s.attached && !s.error;
  const badge = s.note ? '<span class="dim">○ via global</span>'
    : ok ? (s.enabled ? '<span class="ok">● kopplad, PÅ</span>' : '<span class="ok dim">● kopplad, av</span>') : '<span class="bad">✕ ej kopplad</span>';
  return `<li class="sess" data-session="${s.sessionId}">
    <div class="row"><b>${esc(s.label || s.pkg)}</b>${badge}</div>
    <div class="meta">${esc(s.pkg)} · session ${s.sessionId} · ${esc(s.source)}${s.state ? ' · ' + esc(s.state) : ''}${s.attached && !s.hasControl ? ' · <span class="bad">annan app har kontrollen</span>' : ''}</div>
    ${s.note ? `<div class="meta">${esc(s.note)}</div>` : ''}
    ${s.error ? `<div class="err">${esc(s.error)}</div>` : ''}
  </li>`;
}

function debugCard() {
  const s = ui.status;
  return `<details class="card" id="debug"><summary>Felsökning</summary>
    <ul class="sessions" data-testid="sessions">${(s?.sessions || []).map(sessionRow).join('') || '<li class="empty">Inga sessioner. Slå PÅ och spela något.</li>'}</ul>
    <dl class="facts">
      <dt>Telefon</dt><dd>${esc(s?.device)} · Android ${esc(s?.android)} (API ${esc(s?.sdk)})</dd>
      <dt>Senaste sökning</dt><dd>${esc(s?.lastScanInfo)} (${s?.scans ?? 0} st)</dd>
      <dt>Broadcasts</dt><dd>${s?.broadcastsReceived ?? 0} mottagna</dd>
      ${s?.playbackApiInfo ? `<dt>AudioManager</dt><dd>${esc(s.playbackApiInfo)}</dd>` : ''}
    </dl>
    <div class="btnrow">
      <button class="btn small" id="report">Kopiera felsökningsrapport</button>
      <button class="btn small ghost" id="motor">${s?.running ? 'Stoppa motorn helt' : 'Starta motorn'}</button>
    </div>
    <p class="hint" id="copied" hidden>Kopierad – klistra in den i chatten.</p>
  </details>`;
}

function liveView() {
  return `
    <section class="card center" id="statusArea">${onButton()}</section>
    ${levelCard()}
    ${presetBar()}
    <div class="seg" role="tablist">
      <button data-mode="simple" class="${ui.mode === 'simple' ? 'sel' : ''}">Enkelt</button>
      <button data-mode="advanced" class="${ui.mode === 'advanced' ? 'sel' : ''}">Avancerat</button>
    </div>
    ${ui.mode === 'simple' ? simpleCard() : advancedCard()}
    ${debugCard()}`;
}

function permRow({ id, title, ok, text, actions = '' }) {
  return `<section class="card perm" data-perm="${id}">
    <div class="row"><h2>${esc(title)}</h2><span class="${ok ? 'ok' : 'bad'}">${ok ? '✓ klart' : '✕ saknas'}</span></div>
    <p class="hint">${text}</p>${actions ? `<div class="btnrow">${actions}</div>` : ''}
  </section>`;
}

function permsView() {
  const p = ui.perms || {};
  const s = ui.status || {};
  const globalOk = !!(p.globalActive ?? s.globalActive);
  return `
    ${permRow({ id: 'global', title: 'Global session (allt ljud)', ok: globalOk,
      text: s.globalWanted ? (globalOk ? 'Effekten ligger på allt ljud som spelas.' : (s.running ? 'Påslagen men fungerar inte – se felsökningen under Live.' : 'Påslagen. Aktiveras när motorn startar.')) : 'Avslagen – bara enskilda appar som hittas bearbetas.',
      actions: `<label class="switch"><input type="checkbox" id="global" ${s.globalWanted ? 'checked' : ''}> Använd global session</label>` })}
    ${permRow({ id: 'notifications', title: 'Notiser', ok: p.notifications, text: 'För notisen med PÅ/AV-knappen.',
      actions: p.notifications ? '' : '<button class="btn small primary" data-req="notifications">Tillåt</button>' })}
    ${permRow({ id: 'battery', title: 'Batterioptimering', ok: p.battery,
      text: 'Undantag så att Android inte stänger motorn. På Samsung även: Batteri → Gränser för bakgrundsanvändning → Appar som aldrig försätts i viloläge.',
      actions: p.battery ? '' : '<button class="btn small primary" data-req="battery">Undanta</button>' })}
    ${permRow({ id: 'microphone', title: 'Mikrofon (nivåmätning)', ok: p.microphone,
      text: 'Bara för Auto-nivåmatcha. Inget spelas in eller sparas.',
      actions: p.microphone ? '' : '<button class="btn small primary" data-req="microphone">Tillåt</button>' })}
    ${permRow({ id: 'dump', title: 'Sessionsdetektering (DUMP)', ok: p.dump,
      text: p.dump ? 'Beviljad. Används om global session inte fungerar.'
        : `Reserv om global session slutar fungera. Ges med Shizuku direkt på telefonen (se ⓘ för steg) eller med en dator.
           <br>Shizuku: ${p.shizukuInstalled ? (p.shizukuRunning ? '<span class="ok">igång</span>' : '<span class="bad">installerad men inte igång</span>') : '<span class="bad">inte installerad</span>'}`,
      actions: p.dump ? '' : `
        <button class="btn small" data-req="developer">Utvecklaralternativ</button>
        <button class="btn small" data-req="shizukuApp">${p.shizukuInstalled ? 'Öppna Shizuku' : 'Installera Shizuku'}</button>
        <button class="btn small primary" id="shizuku-grant">Bevilja med Shizuku</button>` })}
    ${p.dump ? '' : `<details class="card"><summary>Med dator i stället</summary>
      <p class="hint">Slå på USB-felsökning, anslut telefonen och kör:</p><pre id="cmd">${GRANT_CMD}</pre>
      <button class="btn small" id="copycmd">Kopiera kommandot</button></details>`}
    ${ui.msg ? `<p class="hint" id="msg">${esc(ui.msg)}</p>` : ''}`;
}

function render() {
  if (!LiveDsp) {
    app.innerHTML = `${header()}<main><section class="card"><h2>Live-läget</h2>
      <p>Live-bearbetningen finns bara i Android-appen. Installera APK:n från GitHub Releases.</p></section></main>`;
    bindCommon();
    return;
  }
  const scroll = window.scrollY;
  const openDetails = [...app.querySelectorAll('details')].map((d) => d.open);
  app.innerHTML = `${header()}<main>${isSim ? '<p class="sim">Simulator – inget riktigt ljud</p>' : ''}${ui.view === 'live' ? liveView() : permsView()}</main>
    <dialog id="help"><div class="help-body"></div><form method="dialog"><button class="btn">Stäng</button></form></dialog>`;
  const details = app.querySelectorAll('details');
  if (details.length === openDetails.length) details.forEach((d, i) => { d.open = openDetails[i]; });
  window.scrollTo(0, scroll);
  bindCommon();
  if (ui.view === 'live') bindLive(); else bindPerms();
}

/** Bara statusdelen ritas om när motorn rapporterar – annars skulle ett reglage som dras tappa greppet. */
function renderStatus() {
  if (ui.view !== 'live') { render(); return; }
  const area = app.querySelector('#statusArea');
  if (!area) return;
  area.innerHTML = onButton();
  area.querySelector('#onoff').onclick = toggleOn;
  const dbg = app.querySelector('#debug');
  if (dbg) {
    const open = dbg.open;
    dbg.outerHTML = debugCard();
    app.querySelector('#debug').open = open;
    bindDebug();
  }
}

// ---- Händelser ----
function bindCommon() {
  app.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { ui.view = b.dataset.view; ui.msg = ''; render(); if (ui.view === 'perms') refreshPerms(); }; });
  const info = app.querySelector('[data-help]');
  if (info) info.onclick = () => {
    const h = HELP[info.dataset.help] || HELP.live;
    let d = app.querySelector('#help');
    if (!d) { d = document.createElement('dialog'); d.id = 'help'; d.innerHTML = '<div class="help-body"></div><form method="dialog"><button class="btn">Stäng</button></form>'; app.append(d); }
    d.querySelector('.help-body').innerHTML = `<h2>${h.title}</h2>${h.html}`;
    d.showModal();
  };
}

async function toggleOn() {
  if (ui.busy) return;
  ui.busy = true;
  try { ui.status = await LiveDsp.setOn({ on: !ui.status?.on }); } finally { ui.busy = false; renderStatus(); }
}

function bindSliders() {
  app.querySelectorAll('input[type=range]').forEach((el) => {
    el.oninput = () => {
      const v = Number(el.value);
      const step = Number(el.step);
      const unit = el.nextElementSibling.textContent.split(' ').slice(1).join(' ');
      el.nextElementSibling.textContent = `${fmt(v, step)} ${unit}`.trim();
      if (el.dataset.path) setPath(ui.base, el.dataset.path, v);
      if (el.dataset.macro) ui.macros[el.dataset.macro] = v;
      changed();
    };
  });
}

function selectPreset(id) {
  const p = allPresets().find((x) => x.id === id);
  if (!p) return;
  ui.presetId = id;
  ui.base = structuredClone(sanitize(p.params));
  ui.macros = noMacros();
  ui.msg = '';
  changed({ now: true });
  render();
}

async function exportFile() {
  const text = exportPresets(ui.userPresets);
  const name = 'masterlab-presets.json';
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Masterlab presets', files: [uri], dialogTitle: 'Spara eller skicka presets' });
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

function bindLive() {
  app.querySelector('#onoff').onclick = toggleOn;
  bindSliders();
  app.querySelectorAll('[data-mode]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.mode === ui.mode) return;
      if (b.dataset.mode === 'advanced') { ui.base = effective(); ui.macros = noMacros(); } // bakas in
      ui.mode = b.dataset.mode;
      changed();
      render();
    };
  });
  app.querySelector('#preset').onchange = (e) => selectPreset(e.target.value);
  app.querySelector('#m-reset')?.addEventListener('click', () => { ui.macros = noMacros(); changed({ now: true }); render(); });
  app.querySelector('#p-save').onclick = async () => {
    const name = await ask({ title: 'Spara som preset', value: currentPreset()?.builtin ? `${currentPreset().name} – min` : (currentPreset()?.name || 'Min preset'), okText: 'Spara' });
    if (name === null) return;
    const r = savePreset(ui.userPresets, name, effective());
    ui.userPresets = r.presets;
    await save('presets', ui.userPresets);
    ui.presetId = r.preset.id;
    ui.base = structuredClone(r.preset.params);
    ui.macros = noMacros();
    ui.msg = `Sparad som "${r.preset.name}".`;
    changed();
    render();
  };
  app.querySelector('#p-rename').onclick = async () => {
    const p = currentPreset();
    const name = await ask({ title: 'Döp om preset', value: p.name, okText: 'Döp om' });
    if (name === null) return;
    ui.userPresets = renamePreset(ui.userPresets, p.id, name);
    await save('presets', ui.userPresets);
    render();
  };
  app.querySelector('#p-delete').onclick = async () => {
    const p = currentPreset();
    if (!(await ask({ title: `Ta bort "${p.name}"?`, okText: 'Ta bort' }))) return;
    ui.userPresets = deletePreset(ui.userPresets, p.id);
    await save('presets', ui.userPresets);
    ui.presetId = ''; // inställningen ligger kvar som "egen" tills en annan preset väljs
    ui.msg = `"${p.name}" borttagen.`;
    changed();
    render();
  };
  app.querySelector('#p-export').onclick = async () => {
    try { await exportFile(); ui.msg = `${ui.userPresets.length} presets exporterade.`; } catch (e) { ui.msg = `Exporten misslyckades: ${e.message}`; }
    render();
  };
  app.querySelector('#p-import').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const before = ui.userPresets.length;
      ui.userPresets = importPresets(ui.userPresets, await f.text());
      await save('presets', ui.userPresets);
      ui.msg = `${ui.userPresets.length - before} presets importerade.`;
    } catch (err) {
      ui.msg = err.message;
    }
    render();
  };
  app.querySelector('#autolevel').onclick = async () => {
    ui.levelMsg = 'Mäter… (ca 8 sekunder, ljudet växlar mellan av och på)';
    render();
    try {
      const r = await LiveDsp.autoLevel();
      if (r.ok) {
        ui.base.outputGain = sanitize({ ...ui.base, outputGain: ui.base.outputGain + r.deltaDb }).outputGain;
        changed({ now: true });
      }
      ui.levelMsg = r.message;
    } catch (e) {
      ui.levelMsg = e.message;
    }
    render();
  };
  bindDebug();
}

function bindDebug() {
  const rep = app.querySelector('#report');
  if (!rep) return;
  rep.onclick = async () => { await LiveDsp.copyReport(); app.querySelector('#copied').hidden = false; };
  app.querySelector('#motor').onclick = async () => {
    ui.status = await (ui.status?.running ? LiveDsp.stop() : LiveDsp.start());
    renderStatus();
  };
}

async function refreshPerms() {
  if (!LiveDsp) return;
  ui.perms = await LiveDsp.getPermissions();
  if (ui.view === 'perms') render();
}

function bindPerms() {
  app.querySelectorAll('[data-req]').forEach((b) => {
    b.onclick = async () => {
      try { await LiveDsp.requestPermission({ name: b.dataset.req }); } catch (e) { ui.msg = e.message; }
      await refreshPerms();
    };
  });
  app.querySelector('#global').onchange = async (e) => {
    ui.status = await LiveDsp.setGlobal({ on: e.target.checked });
    await refreshPerms();
  };
  const g = app.querySelector('#shizuku-grant');
  if (g) g.onclick = async () => {
    try { await LiveDsp.grantDumpWithShizuku(); ui.msg = 'Sessionsdetekteringen är beviljad.'; } catch (e) { ui.msg = e.message; }
    await refreshPerms();
    render();
  };
  const cc = app.querySelector('#copycmd');
  if (cc) cc.onclick = async () => { try { await navigator.clipboard.writeText(GRANT_CMD); cc.textContent = 'Kopierat'; } catch { cc.textContent = 'Markera texten ovan'; } };
}

async function init() {
  if (!LiveDsp) { render(); return; }
  const st = await load('state', null);
  ui.userPresets = await load('presets', []);
  if (st) {
    ui.presetId = st.presetId ?? ui.presetId;
    ui.base = sanitize(st.base);
    ui.macros = { ...noMacros(), ...st.macros };
    ui.mode = st.mode === 'advanced' ? 'advanced' : 'simple';
  }
  ui.status = await LiveDsp.getStatus();
  await LiveDsp.addListener('status', (x) => { ui.status = x; if (!ui.busy) renderStatus(); });
  changed({ now: true }); // motorn får alltid samma inställning som skärmen visar
  render();
  // Behörigheter kan ha ändrats i systeminställningarna medan appen låg i bakgrunden
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    ui.status = await LiveDsp.getStatus();
    await refreshPerms();
    renderStatus();
  });
}

init();
