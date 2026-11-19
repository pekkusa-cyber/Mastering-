// Masterlab – start, navigering (Live / Analys / Fil / Mer) och händelser från live-motorn.
import { LiveDsp, isSim } from './livedsp.js';
import { HELP } from './help.js';
import { ui, app } from './state.js';
import { esc, showInfo, sheet } from './ui.js';
import * as updater from './updater.js';
import { loadRefs } from './refs.js';
import { liveView, bindLive, initLive, changed, onButton, bindStatus, renderViz, renderSettings, openSettings, syncProfileFromStatus, undo, renderScreen, wantsSpectrum, onSpectrumWanted } from './views/live.js';
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
    <span class="hbtns">${ui.view === 'live' && LiveDsp ? '<button class="info" id="settings" aria-label="Inställningar">⚙</button>' : ''}<button class="info" data-help="${ui.view}" aria-label="Hjälp">ⓘ</button></span>
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

/**
 * Bekräftelsen ovanför flikarna: visar efter varje ändring om den ligger på ljudet, och varnar så länge en annan
 * app (t.ex. Wavelet) har kontrollen över effekten.
 */
function confirmBar() {
  if (!LiveDsp || ui.view !== 'live') return '';
  const s = ui.status || {}, r = ui.report;
  const recent = r && Date.now() - r.at < 6000 && r.user;
  const undoBtn = ui.undo?.length ? '<button class="btn small undo" id="undo">↶ Ångra</button>' : '';
  if (s.running && s.control === false || r?.noControl > 0 && Date.now() - r.at < 60000 && s.control !== true) {
    return `<div class="confirm warn" id="confirm" role="status"><span>⚠ En annan app (t.ex. Wavelet) styr ljudet – dina ändringar hörs inte.</span><button class="btn small" id="takeControl">Ta tillbaka</button></div>`;
  }
  if (!recent) return '<div id="confirm" hidden></div>';
  if (r.undone) return `<div class="confirm ok" id="confirm" role="status"><span>↶ Ångrat.</span>${undoBtn}</div>`;
  if (r.errors > 0) return `<div class="confirm bad" id="confirm" role="status"><span>✕ Ändringen kunde inte läggas på (${r.errors} fel) – se Mer → Felsökning.</span>${undoBtn}</div>`;
  if (!r.running || !r.total) return `<div class="confirm warn" id="confirm" role="status"><span>Sparat – motorn är av. Slå PÅ för att höra ändringen.</span>${undoBtn}</div>`;
  if (!s.on && !s.agc?.on && !s.correction?.on) return `<div class="confirm" id="confirm" role="status"><span>✓ Sparat – hörs när du slår PÅ.</span>${undoBtn}</div>`;
  return `<div class="confirm ok" id="confirm" role="status"><span>✓ Ändringen hörs nu.</span>${undoBtn}</div>`;
}

let confirmTimer = 0;
function renderConfirm() {
  const el = root.querySelector('#confirm');
  if (!el) return;
  el.outerHTML = confirmBar();
  const t = root.querySelector('#takeControl');
  if (t) t.onclick = async () => {
    t.textContent = 'Tar tillbaka…';
    const r = await LiveDsp.takeControl();
    ui.report = { ...r, at: Date.now(), user: true };
    ui.status = await LiveDsp.getStatus();
    renderConfirm();
  };
  const u = root.querySelector('#undo');
  if (u) u.onclick = () => undo();
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(renderConfirm, 6100);
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
  root.innerHTML = `${header()}<main>${isSim ? '<p class="sim">Simulator – inget riktigt ljud</p>' : ''}${apkBanner()}${body()}</main>${confirmBar()}${nav()}`;
  const map = new Map(open);
  root.querySelectorAll('details[data-sec], details.band, details#debug').forEach((d) => {
    const k = d.dataset.sec || d.id || d.querySelector('summary')?.textContent;
    if (map.has(k)) d.open = map.get(k);
  });
  window.scrollTo(0, scroll);
  bind();
}

function bind() {
  renderConfirm();
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
    if (ui.view === 'live') {
      const area = root.querySelector('#statusArea');
      if (area) { area.innerHTML = onButton(); bindStatus(area); }
      renderSettings();
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
  if (part === 'confirm' || part === 'status') renderConfirm();
  if (part === 'viz' && ui.view === 'live') renderViz(root);
  if (part === 'spectrum' && ui.view === 'analys') renderSpectrum(root);
  if (part === 'spectrum' && ui.view === 'live') renderScreen(root);
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
  await LiveDsp.addListener('status', (x) => {
    const prev = ui.status?.output?.key;
    ui.status = x;
    // Ny ljudutgång med sparad profil: motorn har redan bytt – visa samma inställning i appen
    if (syncProfileFromStatus(prev)) { render(); return; }
    if (!ui.busy) renderPart('status');
  });
  await LiveDsp.addListener('spectrum', (x) => { ui.spectrum = x; renderPart('spectrum'); });
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
