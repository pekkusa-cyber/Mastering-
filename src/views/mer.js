// Mer: behörigheter, felsökning (ljud-sessioner, rapport), version och uppdatering.
import { LiveDsp, isSim } from '../livedsp.js';
import { ui, app } from '../state.js';
import { esc, infoBtn, split } from '../ui.js';
import * as updater from '../updater.js';

const GRANT_CMD = 'adb shell pm grant se.foric.masterlab android.permission.DUMP';

function permRow({ id, title, ok, text, actions = '' }) {
  return `<section class="card perm" data-perm="${id}">
    <div class="row"><h2>${esc(title)}</h2><span class="grow"></span><span class="${ok ? 'ok' : 'bad'}">${ok ? '✓ klart' : '✕ saknas'}</span></div>
    ${ok ? '' : `<p class="hint">${text}</p>`}${actions ? `<div class="btnrow">${actions}</div>` : ''}
  </section>`;
}

function sessionRow(s) {
  const ok = s.attached && !s.error;
  const badge = s.note ? '<span class="dim">○ via global</span>'
    : ok ? (s.enabled ? '<span class="ok">● kopplad, på</span>' : '<span class="ok dim">● kopplad, av</span>') : '<span class="bad">✕ ej kopplad</span>';
  return `<li class="sess" data-session="${s.sessionId}">
    <div class="row"><b>${esc(s.label || s.pkg)}</b><span class="grow"></span>${badge}</div>
    <div class="meta">${esc(s.pkg)} · session ${s.sessionId} · ${esc(s.source)}${s.state ? ' · ' + esc(s.state) : ''}${s.attached && !s.hasControl ? ' · <span class="bad">annan app har kontrollen</span>' : ''}</div>
    ${s.note ? `<div class="meta">${esc(s.note)}</div>` : ''}
    ${s.error ? `<div class="err">${esc(s.error)}</div>` : ''}
  </li>`;
}

export function debugCard() {
  const s = ui.status;
  const a = s?.agc;
  return `<details class="card" id="debug" open><summary>Felsökning</summary>
    <ul class="sessions" data-testid="sessions">${(s?.sessions || []).map(sessionRow).join('') || '<li class="empty">Inga sessioner. Slå PÅ och spela något.</li>'}</ul>
    <dl class="facts">
      <dt>Telefon</dt><dd>${esc(s?.device)} · Android ${esc(s?.android)} (API ${esc(s?.sdk)})</dd>
      <dt>Senaste sökning</dt><dd>${esc(s?.lastScanInfo)} (${s?.scans ?? 0} st)</dd>
      ${a ? `<dt>Jämn volym</dt><dd>${a.on ? 'på' : 'av'} · mätning efter effekten: ${esc(a.closedLoop)} · följer volymen: ${a.postVolume ? 'ja' : 'nej'}</dd>` : ''}
      ${s?.analyzer ? `<dt>Analys</dt><dd>${s.analyzer.running ? 'igång' : 'av'}${s.analyzer.error ? ` · ${esc(s.analyzer.error)}` : ''}</dd>` : ''}
      ${s?.playbackApiInfo ? `<dt>AudioManager</dt><dd>${esc(s.playbackApiInfo)}</dd>` : ''}
    </dl>
    <div class="btnrow">
      <button class="btn small" id="report">Kopiera felsökningsrapport</button>
      <button class="btn small ghost" id="motor">${s?.running ? 'Stoppa motorn helt' : 'Starta motorn'}</button>
    </div>
    <p class="hint" id="copied" hidden>Kopierad – klistra in den i chatten.</p>
  </details>`;
}

const M_BLOCKS = () => {
  const p = ui.perms || {};
  const missing = ['microphone', 'notifications', 'battery'].filter((k) => !p[k]).length + (ui.canInstall ? 0 : 1);
  return [
    { id: 'perm', label: 'Behörigheter', sub: missing ? `${missing} saknas` : 'klart', dot: !missing },
    { id: 'debug', label: 'Felsökning', sub: ui.status?.running ? 'motor igång' : 'motor av' },
    { id: 'app', label: 'Appen', sub: ui.update?.kind === 'apk' ? 'ny version' : 'version' },
  ];
};
const mBlock = () => (M_BLOCKS().some((b) => b.id === ui.blocks?.mer) ? ui.blocks.mer : 'perm');

/** Överst: överblick – är allt klart? */
function merTop() {
  const p = ui.perms || {}, s = ui.status || {};
  const row = (ok, t) => `<div class="orow"><i class="${ok ? 'okdot' : 'baddot'}"></i><span>${t}</span></div>`;
  return `<div class="lbl"><b>Överblick</b><span class="grow"></span>Version ${esc(ui.version)}</div><div class="ovw">
    ${row(!!(p.globalActive ?? s.globalActive), 'Effekten på allt ljud (global session)')}
    ${row(!!p.microphone, 'Ljudanalys (spektrum, jämn volym)')}
    ${row(!!p.notifications, 'Notis med PÅ/AV')}
    ${row(!!p.battery, 'Får köra i bakgrunden')}
    ${row(!!ui.canInstall, 'Kan installera uppdateringar')}
    ${row(!!s.running, s.running ? 'Motorn är igång' : 'Motorn står still')}</div>`;
}

export function merView() {
  const p = ui.perms || {};
  const s = ui.status || {};
  const globalOk = !!(p.globalActive ?? s.globalActive);
  const b = mBlock();
  const panel = b === 'perm' ? `
    ${permRow({ id: 'global', title: 'Global session (allt ljud)', ok: globalOk,
      text: s.globalWanted ? (globalOk ? 'Effekten ligger på allt ljud som spelas.' : (s.running ? 'Påslagen men fungerar inte – se Felsökning nedan.' : 'Påslagen. Aktiveras när motorn startar.')) : 'Avslagen – bara enskilda appar som hittas bearbetas.',
      actions: `<label class="switch"><input type="checkbox" id="global" ${s.globalWanted ? 'checked' : ''}> Använd global session</label>` })}
    ${permRow({ id: 'microphone', title: 'Ljudanalys ("mikrofon")', ok: p.microphone,
      text: 'Låter Masterlab läsa ljudet som spelas internt (Spotify, YouTube, Suno) för spektrum, analys, Jämn volym och Auto-nivåmatcha. Mikrofonen används aldrig – Android kallar bara behörigheten så. Inget spelas in eller sparas.',
      actions: p.microphone ? '' : '<button class="btn small primary" data-req="microphone">Tillåt</button>' })}
    ${permRow({ id: 'notifications', title: 'Notiser', ok: p.notifications, text: 'För notisen med PÅ/AV-knappen.',
      actions: p.notifications ? '' : '<button class="btn small primary" data-req="notifications">Tillåt</button>' })}
    ${permRow({ id: 'battery', title: 'Batterioptimering', ok: p.battery,
      text: 'Undantag så att Android inte stänger motorn (och analysen i bakgrunden). På Samsung även: Batteri → Gränser för bakgrundsanvändning → Appar som aldrig försätts i viloläge.',
      actions: p.battery ? '' : '<button class="btn small primary" data-req="battery">Undanta</button>' })}
    ${permRow({ id: 'install', title: 'Installera uppdateringar', ok: ui.canInstall,
      text: 'Låter Masterlab installera en ny app-version med ett tryck. Vanliga ändringar kommer ändå av sig själva.',
      actions: ui.canInstall ? '' : '<button class="btn small primary" id="allowInstall">Tillåt</button>' })}
    ${permRow({ id: 'dump', title: 'Sessionsdetektering (DUMP)', ok: p.dump,
      text: p.dump ? 'Beviljad. Används om global session inte fungerar.'
        : `Reserv om global session slutar fungera. Ges med Shizuku direkt på telefonen (se ⓘ uppe till höger) eller med en dator.
           <br>Shizuku: ${p.shizukuInstalled ? (p.shizukuRunning ? '<span class="ok">igång</span>' : '<span class="bad">installerad men inte igång</span>') : '<span class="bad">inte installerad</span>'}`,
      actions: p.dump ? '' : `
        <button class="btn small" data-req="developer">Utvecklaralternativ</button>
        <button class="btn small" data-req="shizukuApp">${p.shizukuInstalled ? 'Öppna Shizuku' : 'Installera Shizuku'}</button>
        <button class="btn small primary" id="shizuku-grant">Bevilja med Shizuku</button>` })}
    ${p.dump ? '' : `<details class="card"><summary>Med dator i stället</summary>
      <p class="hint">Slå på USB-felsökning, anslut telefonen och kör:</p><pre id="cmd">${GRANT_CMD}</pre>
      <button class="btn small" id="copycmd">Kopiera kommandot</button></details>`}
    ${ui.msg ? `<p class="hint" id="msg">${esc(ui.msg)}</p>` : ''}
    ` : b === 'debug' ? debugCard() : `
    <section class="card">
      <p class="hint" data-testid="version">Version ${esc(ui.version)}</p>
      <button class="btn small" id="checkUpdate">Sök uppdatering</button>
      ${ui.update?.kind !== 'apk' && ui.updateMsg ? `<p class="hint" id="updateMsg">${esc(ui.updateMsg)}</p>` : ''}
    </section>
`;
  return split({ view: 'mer', top: merTop(), blocks: M_BLOCKS(), active: b, panel, topCls: 'short' });
}

export async function refreshPerms() {
  if (!LiveDsp) return;
  ui.perms = await LiveDsp.getPermissions();
  ui.canInstall = isSim ? !!ui.perms.install : await updater.canInstall();
}

export function bindDebug(root) {
  const rep = root.querySelector('#report');
  if (!rep) return;
  rep.onclick = async () => { await LiveDsp.copyReport(); root.querySelector('#copied').hidden = false; };
  (root.querySelector('#motor') || {}).onclick = async () => {
    ui.status = await (ui.status?.running ? LiveDsp.stop() : LiveDsp.start());
    app.render();
  };
}

export function bindMer(root) {
  root.querySelectorAll('[data-req]').forEach((b) => {
    b.onclick = async () => {
      try { await LiveDsp.requestPermission({ name: b.dataset.req }); } catch (e) { ui.msg = e.message; }
      await refreshPerms();
      app.render();
    };
  });
  const gl = root.querySelector('#global');
  if (gl) gl.onchange = async (e) => {
    ui.status = await LiveDsp.setGlobal({ on: e.target.checked });
    await refreshPerms();
    app.render();
  };
  const ai = root.querySelector('#allowInstall');
  if (ai) ai.onclick = async () => {
    try { await (isSim ? LiveDsp.requestPermission({ name: 'install' }) : updater.openInstallSettings()); } catch (e) { ui.msg = e.message; }
    await refreshPerms();
    app.render();
  };
  const g = root.querySelector('#shizuku-grant');
  if (g) g.onclick = async () => {
    try { await LiveDsp.grantDumpWithShizuku(); ui.msg = 'Sessionsdetekteringen är beviljad.'; } catch (e) { ui.msg = e.message; }
    await refreshPerms();
    app.render();
  };
  const cc = root.querySelector('#copycmd');
  if (cc) cc.onclick = async () => { try { await navigator.clipboard.writeText(GRANT_CMD); cc.textContent = 'Kopierat'; } catch { cc.textContent = 'Markera texten ovan'; } };
  const cu = root.querySelector('#checkUpdate');
  if (cu) cu.onclick = async () => {
    ui.updateMsg = 'Söker…';
    app.render();
    const r = await updater.check(); // en ny webbdel laddar om skärmen direkt
    ui.update = r.kind === 'apk' ? r : null;
    ui.updateMsg = r.error ? `Kunde inte söka: ${r.error}` : r.kind ? '' : 'Du har senaste versionen.';
    app.render();
  };
  bindDebug(root);
}
