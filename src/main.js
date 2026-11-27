// Masterlab – start, navigering (Live / Analys / Fil / Mer) och händelser från live-motorn.
import { LiveDsp, isSim } from './livedsp.js';
import { HELP } from './help.js';
import { ui, app } from './state.js';
import { esc, showInfo, sheet } from './ui.js';
import * as updater from './updater.js';
import { loadRefs } from './refs.js';
import { liveView, bindLive, initLive, changed, bindStatus, renderViz, renderSettings, openSettings, syncProfileFromStatus, renderScreen, wantsSpectrum, onSpectrumWanted, headerToggles, refreshStatus } from './views/live.js';
import { analysView, bindAnalys, renderSpectrum, setMonitor } from './views/analys.js';
import { filView, bindFil, renderFilePart, stopFilePlayback } from './views/fil.js';
import { merView, bindMer, refreshPerms, debugCard, bindDebug } from './views/mer.js';

const root = document.getElementById('app');
const VIEWS = [
  { id: 'live', label: 'Live', icon: '◉' },
  { id: 'analys', label: 'Analys', icon: '▤' },
  { id: 'fil', label: 'Fil', icon: '♫' },
  { id: 'mer', label: 'Mer', icon: '⋯' },
];

function header() {
  const v = VIEWS.find((x) => x.id === ui.view);
  return `<header class="top">
    <h1>${ui.view === 'live' ? 'Masterlab' : esc(v.label)}</h1>
    <span class="hbtns">${headerToggles()}${LiveDsp ? '<button class="info" id="settings" aria-label="Inställningar">⚙</button>' : ''}<button class="info" id="menu" aria-label="Meny" aria-haspopup="menu" aria-expanded="false">☰</button><button class="info" data-help="${ui.view}" aria-label="Hjälp">ⓘ</button></span>${nav()}
  </header>`;
}

/** Vymenyn: en rullgardin vid kugghjulet i stället för en rad längst ner (mer plats åt reglagen). */
function nav() {
  return `<nav class="vmenu" id="vmenu" aria-label="Vyer" role="menu" hidden>${VIEWS.map((v) => `<button type="button" role="menuitem" data-view="${v.id}" class="${ui.view === v.id ? 'sel' : ''}" aria-current="${ui.view === v.id ? 'page' : 'false'}"><span class="ic">${v.icon}</span>${v.label}</button>`).join('')}<button type="button" role="menuitem" data-help="guide" class="vguide"><span class="ic">📘</span>Mastringsguide</button></nav>`;
}

function apkBanner() {
  if (ui.update?.kind !== 'apk') return '';
  return `<section class="card banner" id="apkBanner"><b>Ny app-version finns</b>
    <p class="hint">Den här uppdateringen ändrar appens inbyggda del och måste installeras (ett tryck).</p>
    <button class="btn small primary" id="installApk">Installera</button>
    ${ui.updateMsg ? `<p class="hint" id="apkMsg">${esc(ui.updateMsg)}</p>` : ''}</section>`;
}

function body() {
  if (!LiveDsp && (ui.view === 'live' || ui.view === 'analys')) {
    return `<section class="card"><h2>Live-läget</h2><p>Live-bearbetningen och live-analysen finns bara i Android-appen. Filmastringen (Fil) fungerar även här.</p></section>`;
  }
  if (!LiveDsp && ui.view === 'mer') return '<section class="card"><p>Behörigheter och felsökning finns i Android-appen.</p></section>';
  return { live: liveView, analys: analysView, fil: filView, mer: merView }[ui.view]();
}

function render() {
  const scroll = window.scrollY;
  const open = [...root.querySelectorAll('details[data-sec], details.band, details#debug')].map((d) => [d.dataset.sec || d.id || d.querySelector('summary')?.textContent, d.open]);
  root.innerHTML = `${header()}<main>${isSim ? '<p class="sim">Simulator – inget riktigt ljud</p>' : ''}${apkBanner()}${body()}</main>`;
  const map = new Map(open);
  root.querySelectorAll('details[data-sec], details.band, details#debug').forEach((d) => {
    const k = d.dataset.sec || d.id || d.querySelector('summary')?.textContent;
    if (map.has(k)) d.open = map.get(k);
  });
  window.scrollTo(0, scroll);
  bind();
}

function bind() {
  bindStatus(root);
  const menu = root.querySelector('#menu'), vm = root.querySelector('#vmenu');
  if (menu && vm) menu.onclick = (e) => { e.stopPropagation(); vm.hidden = !vm.hidden; menu.setAttribute('aria-expanded', String(!vm.hidden)); };
  // Blocken (samma i alla vyer): välj vilken del som visas i panelen
  root.querySelectorAll('[data-block]').forEach((b) => {
    b.onclick = () => {
      ui.blocks = { ...ui.blocks, [ui.view]: b.dataset.block };
      if (ui.view === 'live') ui.liveBlock = b.dataset.block;
      render();
      setMonitor((ui.view === 'analys' || wantsSpectrum()) && !document.hidden);
    };
  });
  root.querySelectorAll('[data-view]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.view === ui.view) return;
      ui.view = b.dataset.view; ui.msg = '';
      if (ui.view !== 'fil') stopFilePlayback();
      setMonitor((ui.view === 'analys' || wantsSpectrum()) && !document.hidden);
      if (ui.view === 'mer') refreshPerms().then(render);
      window.scrollTo(0, 0);
      render();
    };
  });
  const gear = root.querySelector('#settings');
  if (gear) gear.onclick = openSettings;
  const ia = root.querySelector('#installApk');
  if (ia) ia.onclick = async () => {
    try {
      const r = await updater.installApk((pct) => { ia.textContent = `Laddar ner… ${pct} %`; });
      ui.updateMsg = r === 'settings' ? 'Tillåt "Installera okända appar" för Masterlab och tryck Installera igen.' : '';
    } catch (e) { ui.updateMsg = e.message; }
    render();
  };
  if (!LiveDsp && ui.view !== 'fil') return;
  ({ live: bindLive, analys: bindAnalys, fil: bindFil, mer: bindMer })[ui.view](root);
}

/** Ritar om en del utan att röra resten (reglage som dras, spelaren). */
function renderPart(part) {
  if (part === 'status') {
    refreshStatus(root);
    renderSettings();
    if (ui.view === 'mer') {
      const dbg = root.querySelector('#debug');
      if (dbg) { const o = dbg.open; dbg.outerHTML = debugCard(); root.querySelector('#debug').open = o; bindDebug(root); }
    }
    if (ui.view === 'analys') {
      const an = root.querySelector('#anArea');
      const running = !!ui.status?.analysis?.running;
      if (an && !!an.querySelector('#an-stop') !== running) render();
    }
  }
  if (part === 'confirm' && ui.view === 'live') renderViz(root);
  if (part === 'viz' && ui.view === 'live') renderViz(root);
  if (part === 'spectrum' && ui.view === 'analys') renderSpectrum(root);
  if (part === 'spectrum' && ui.view === 'live') renderScreen(root);
  if (ui.view === 'fil' && part.startsWith('file')) renderFilePart(root, part);
}

app.render = render;
app.renderPart = renderPart;

// Tryck utanför menyn stänger den
document.addEventListener('click', (e) => {
  const vm = document.getElementById('vmenu');
  if (vm && !vm.hidden && !e.target.closest('#vmenu')) { vm.hidden = true; document.getElementById('menu')?.setAttribute('aria-expanded', 'false'); }
}, true);

// Klick på ⓘ (förklaring av ett reglage/sektion) och på vyns hjälp
document.addEventListener('click', (e) => {
  const i = e.target.closest('[data-info]');
  if (i) { e.preventDefault(); e.stopPropagation(); showInfo(i.dataset.info); return; }
  const h = e.target.closest('[data-help]');
  if (h) { const vm = document.getElementById('vmenu'); if (vm) vm.hidden = true; const t = HELP[h.dataset.help] || HELP.live; sheet(`<div class="help-body"><h2>${esc(t.title)}</h2>${t.html}</div>`, { cls: 'helpsheet' }); }
}, true);

async function checkForUpdate() {
  const r = await updater.check();
  if (r.kind === 'apk' && ui.update?.kind !== 'apk') { ui.update = r; render(); }
}

async function init() {
  await loadRefs();
  ui.version = await updater.versionText();
  if (!LiveDsp) { ui.view = 'fil'; render(); return; }
  await initLive();
  ui.status = await LiveDsp.getStatus();
  await LiveDsp.addListener('status', (x) => {
    const prev = ui.status?.output?.key;
    ui.status = x;
    // Ny ljudutgång med sparad profil: motorn har redan bytt – visa samma inställning i appen
    if (syncProfileFromStatus(prev)) { render(); return; }
    if (!ui.busy) renderPart('status');
  });
  await LiveDsp.addListener('spectrum', (x) => { ui.spectrum = x; if (x.peak != null && x.peak > -0.5) ui.clipAt = Date.now(); renderPart('spectrum'); });
  changed({ now: true, user: false }); // motorn får alltid samma inställning som skärmen visar
  const q = new URLSearchParams(location.search);
  if (isSim && q.get('update') === 'apk') ui.update = { kind: 'apk' };
  if (isSim && q.get('view')) ui.view = q.get('view');
  await refreshPerms();
  render();
  updater.markBooted();
  checkForUpdate();
  document.addEventListener('visibilitychange', async () => {
    setMonitor((ui.view === 'analys' || wantsSpectrum()) && !document.hidden);
    if (document.hidden) return;
    ui.status = await LiveDsp.getStatus();
    await refreshPerms();
    if (ui.view === 'mer') render(); else renderPart('status');
    checkForUpdate();
  });
  onSpectrumWanted((on) => setMonitor(on && !document.hidden));
  if (ui.view === 'analys' || wantsSpectrum()) setMonitor(true);
}

init();
