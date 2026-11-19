// Masterlab – start, navigering (Live / Analys / Fil / Mer) och händelser från live-motorn.
import { LiveDsp, isSim } from './livedsp.js';
import { HELP } from './help.js';
import { ui, app } from './state.js';
import { esc, showInfo, sheet } from './ui.js';
import * as updater from './updater.js';
import { loadRefs } from './refs.js';
import { liveView, bindLive, initLive, changed, onButton, toggleOn, agcRow, bindAgc } from './views/live.js';
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
    <button class="info" data-help="${ui.view}" aria-label="Hjälp">ⓘ</button>
  </header>`;
}

function nav() {
  return `<nav class="bottom" aria-label="Vyer">${VIEWS.map((v) => `<button data-view="${v.id}" class="${ui.view === v.id ? 'sel' : ''}" aria-current="${ui.view === v.id ? 'page' : 'false'}"><span class="ic">${v.icon}</span>${v.label}</button>`).join('')}</nav>`;
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
  root.innerHTML = `${header()}<main>${isSim ? '<p class="sim">Simulator – inget riktigt ljud</p>' : ''}${apkBanner()}${body()}</main>${nav()}`;
  const map = new Map(open);
  root.querySelectorAll('details[data-sec], details.band, details#debug').forEach((d) => {
    const k = d.dataset.sec || d.id || d.querySelector('summary')?.textContent;
    if (map.has(k)) d.open = map.get(k);
  });
  window.scrollTo(0, scroll);
  bind();
}

function bind() {
  root.querySelectorAll('[data-view]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.view === ui.view) return;
      ui.view = b.dataset.view; ui.msg = '';
      if (ui.view !== 'fil') stopFilePlayback();
      setMonitor(ui.view === 'analys' && !document.hidden);
      if (ui.view === 'mer') refreshPerms().then(render);
      window.scrollTo(0, 0);
      render();
    };
  });
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
    if (ui.view === 'live') {
      const area = root.querySelector('#statusArea');
      if (area) { area.innerHTML = onButton(); area.querySelector('#onoff').onclick = toggleOn; }
      const agc = root.querySelector('#agcArea');
      if (agc && !agc.contains(document.activeElement)) { agc.innerHTML = agcRow(); bindAgc(agc); }
    }
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
  if (part === 'spectrum' && ui.view === 'analys') renderSpectrum(root);
  if (ui.view === 'fil' && part.startsWith('file')) renderFilePart(root, part);
}

app.render = render;
app.renderPart = renderPart;

// Klick på ⓘ (förklaring av ett reglage/sektion) och på vyns hjälp
document.addEventListener('click', (e) => {
  const i = e.target.closest('[data-info]');
  if (i) { e.preventDefault(); e.stopPropagation(); showInfo(i.dataset.info); return; }
  const h = e.target.closest('[data-help]');
  if (h) { const t = HELP[h.dataset.help] || HELP.live; sheet(`<div class="help-body"><h2>${esc(t.title)}</h2>${t.html}</div>`, { cls: 'helpsheet' }); }
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
  await LiveDsp.addListener('status', (x) => { ui.status = x; if (!ui.busy) renderPart('status'); });
  await LiveDsp.addListener('spectrum', (x) => { ui.spectrum = x; renderPart('spectrum'); });
  changed({ now: true }); // motorn får alltid samma inställning som skärmen visar
  const q = new URLSearchParams(location.search);
  if (isSim && q.get('update') === 'apk') ui.update = { kind: 'apk' };
  if (isSim && q.get('view')) ui.view = q.get('view');
  await refreshPerms();
  render();
  updater.markBooted();
  checkForUpdate();
  document.addEventListener('visibilitychange', async () => {
    setMonitor(ui.view === 'analys' && !document.hidden);
    if (document.hidden) return;
    ui.status = await LiveDsp.getStatus();
    await refreshPerms();
    if (ui.view === 'mer') render(); else renderPart('status');
    checkForUpdate();
  });
  if (ui.view === 'analys') setMonitor(true);
}

init();
