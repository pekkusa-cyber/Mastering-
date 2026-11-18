import { LiveDsp, isNative, isSim } from './livedsp.js';
import { HELP } from './help.js';

const GRANT_CMD = 'adb shell pm grant se.foric.masterlab android.permission.DUMP';
const app = document.getElementById('app');
let st = null;
let busy = false;

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shell(body) {
  app.innerHTML = `
    <header class="top">
      <h1>Masterlab</h1>
      <button class="info" data-help="live" aria-label="Hjälp">ⓘ</button>
    </header>
    <main>${body}</main>
    <dialog id="help"><div class="help-body"></div><form method="dialog"><button class="btn">Stäng</button></form></dialog>`;
  app.querySelector('[data-help]').onclick = () => {
    const h = HELP.live;
    const d = app.querySelector('#help');
    d.querySelector('.help-body').innerHTML = `<h2>${h.title}</h2>${h.html}`;
    d.showModal();
  };
}

function sessionRow(s) {
  const ok = s.attached && !s.error;
  const badge = ok ? (s.enabled ? '<span class="ok">● kopplad, PÅ</span>' : '<span class="ok dim">● kopplad, av</span>') : '<span class="bad">✕ ej kopplad</span>';
  return `<li class="sess" data-session="${s.sessionId}">
    <div class="row"><b>${esc(s.label || s.pkg)}</b>${badge}</div>
    <div class="meta">${esc(s.pkg)} · session ${s.sessionId} · ${esc(s.source)}${s.state ? ' · ' + esc(s.state) : ''}${s.attached && !s.hasControl ? ' · <span class="bad">annan app har kontrollen</span>' : ''}</div>
    ${s.error ? `<div class="err">${esc(s.error)}</div>` : ''}
  </li>`;
}

function render() {
  if (!LiveDsp) {
    shell(`<section class="card"><h2>Live-läget</h2>
      <p>Live-bearbetningen finns bara i Android-appen. Installera APK:n från GitHub Releases.</p></section>`);
    return;
  }
  const s = st;
  const running = s?.running;
  shell(`
    ${isSim ? '<p class="sim">Simulator – inget riktigt ljud</p>' : ''}
    <section class="card center">
      <p class="status" data-testid="motor">Live-motorn: <b>${running ? 'igång' : 'stoppad'}</b></p>
      <button class="big ${s?.testOn ? 'on' : ''}" id="test" aria-pressed="${!!s?.testOn}" ${running ? '' : 'disabled'}>
        <span>TESTLÄGE</span><strong>${s?.testOn ? 'PÅ' : 'AV'}</strong>
      </button>
      <p class="hint">+6 dB in · limiter med tak −20 dB. Ska höras tydligt.</p>
      <button class="btn ${running ? 'ghost' : 'primary'}" id="motor">${running ? 'Stoppa live-motorn' : 'Starta live-motorn'}</button>
    </section>

    <section class="card" id="dump">
      <h2>Sessionsdetektering</h2>
      ${s?.dumpGranted
        ? '<p class="ok">✓ Behörigheten (DUMP) är beviljad.</p>'
        : `<p class="bad">✕ Behörigheten saknas.</p>
           <p>Utan den hittas Suno och Chrome troligen inte. Bevilja den en gång från en dator:</p>
           <ol class="steps">
             <li>Telefonen: Inställningar → Om telefonen → tryck 7 gånger på <i>Build-nummer</i>. Sedan Inställningar → System → Utvecklaralternativ → slå på <i>USB-felsökning</i>.</li>
             <li>Datorn: installera <i>Android SDK Platform-Tools</i> (adb) och anslut telefonen med USB. Godkänn frågan på telefonen.</li>
             <li>Kör i terminalen:<pre id="cmd">${GRANT_CMD}</pre><button class="btn small" id="copycmd">Kopiera kommandot</button></li>
             <li>Starta om live-motorn här i appen.</li>
           </ol>`}
    </section>

    <section class="card">
      <label class="switch"><input type="checkbox" id="global" ${s?.globalWanted ? 'checked' : ''}> Prova global session (0)</label>
      <p class="hint">Äldre sätt att påverka allt ljud. Ofta spärrat på nya Android – resultatet syns i listan.</p>
    </section>

    <section class="card">
      <h2>Hittade ljud-sessioner</h2>
      <ul class="sessions" data-testid="sessions">${(s?.sessions || []).map(sessionRow).join('') || '<li class="empty">Inga ännu. Starta motorn och spela något.</li>'}</ul>
      <dl class="facts">
        <dt>Telefon</dt><dd>${esc(s?.device)} · Android ${esc(s?.android)} (API ${esc(s?.sdk)})</dd>
        <dt>Senaste sökning</dt><dd>${esc(s?.lastScanInfo)} (${s?.scans ?? 0} st)</dd>
        <dt>Broadcasts</dt><dd>${s?.broadcastsReceived ?? 0} mottagna</dd>
        ${s?.playbackApiInfo ? `<dt>AudioManager</dt><dd>${esc(s.playbackApiInfo)}</dd>` : ''}
      </dl>
      <button class="btn" id="report">Kopiera felsökningsrapport</button>
      <p class="hint" id="copied" hidden>Kopierad – klistra in den i chatten.</p>
    </section>`);

  const act = (fn) => async () => { if (busy) return; busy = true; try { st = await fn(); } finally { busy = false; render(); } };
  app.querySelector('#test').onclick = act(() => LiveDsp.setTestMode({ on: !st?.testOn }));
  app.querySelector('#motor').onclick = act(() => (st?.running ? LiveDsp.stop() : LiveDsp.start()));
  app.querySelector('#global').onchange = act(() => LiveDsp.setGlobal({ on: !st?.globalWanted }));
  app.querySelector('#report').onclick = async () => {
    await LiveDsp.copyReport();
    app.querySelector('#copied').hidden = false;
  };
  const cc = app.querySelector('#copycmd');
  if (cc) cc.onclick = async () => { try { await navigator.clipboard.writeText(GRANT_CMD); cc.textContent = 'Kopierat'; } catch { cc.textContent = 'Markera texten ovan'; } };
}

async function init() {
  render();
  if (!LiveDsp) return;
  st = await LiveDsp.getStatus();
  await LiveDsp.addListener('status', (x) => { st = x; if (!busy) render(); });
  render();
  // Behörigheten kan ha beviljats medan appen låg i bakgrunden
  document.addEventListener('visibilitychange', async () => { if (!document.hidden) { st = await LiveDsp.getStatus(); render(); } });
}

init();
if (isNative) document.documentElement.classList.add('native');
