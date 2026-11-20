// Analys-vyn: livespektrum med referenskurva, analys av en hel låt (i bakgrunden), omdöme mot referens,
// matcha EQ live, och referenslistan (spara, döp om, ta bort, export/import, importera ljudfil).
import { LiveDsp, isNative } from '../livedsp.js';
import { ui, app } from '../state.js';
import { save } from '../store.js';
import { compareProfiles, finishProfile, fixVariants, profileFromChannels } from '../analysis.js';
import { allEnabled, noMacros, savePreset, sanitize } from '../chain.js';
import { addRef, currentRef, deleteRef, exportRefs, importRefs, renameRef, selectRef } from '../refs.js';
import { ask, bindPicker, esc, fmtDb, infoBtn, picker, saveFile, split } from '../ui.js';
import { spectrumSvg, bindSpectrum } from '../spectrum.js';
import { decodeFile, mmss } from '../audio.js';
import { effective, changed } from './live.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const fileDeps = () => ({ isNative, Filesystem, Directory, Encoding, Share });
let monitoring = false;

/** Spektrumvisningen körs bara medan Analys-vyn är öppen och appen syns. */
export async function setMonitor(on) {
  if (!LiveDsp || on === monitoring) return;
  monitoring = on;
  try {
    if (on) await LiveDsp.startMonitor(); else await LiveDsp.stopMonitor();
    ui.monitorMsg = '';
  } catch (e) {
    monitoring = false;
    ui.monitorMsg = e.message;
    app.renderPart('spectrum');
  }
}

/** Referensväljaren (appens egen, inte telefonens rullgardin). */
export const refGroups = () => [{ label: '', options: [{ value: '', label: 'Ingen referens', icon: '○' }, ...ui.refs.map((r) => ({ value: r.id, label: r.name, desc: r.profile.source === 'fil' ? 'från fil' : 'live-analys', icon: '🎯' }))] }];
function refSelect(id = 'refsel') {
  return picker({ id, label: 'Referens', value: ui.refId, groups: refGroups(), placeholder: 'Referens' });
}

export function spectrumPart() {
  const ref = currentRef();
  const sp = ui.spectrum;
  if (ui.monitorMsg) return `<p class="hint" id="monmsg">${esc(ui.monitorMsg)}</p>
    <p class="hint small">Masterlab läser ljudet internt – det som spelas i Spotify, YouTube eller Suno. Mikrofonen används aldrig,
    men Android kallar behörigheten för att läsa uppspelat ljud för "mikrofon".</p>
    <div class="btnrow"><button class="btn small primary" id="allowAnalysis">Tillåt ljudanalys</button><button class="btn small ghost" data-goto="mer">Behörigheter</button></div>`;
  const series = {};
  if (sp?.bands) series.main = { label: ui.status?.on ? 'Nu (mastrat)' : 'Nu', bands: sp.bands };
  if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
  return `${spectrumSvg(series, { id: 'live', title: 'Livespektrum' })}
    <p class="hint small" data-testid="levels">${sp ? `Nivå ${fmtDb(sp.rms)} dB · topp ${fmtDb(sp.peak)} dB${ui.status?.agc?.on ? ` · jämn volym ${fmtDb(sp.agcGain)} dB` : ''}` : 'Väntar på ljud… spela något.'}</p>`;
}

function analysisPart() {
  const a = ui.status?.analysis || {};
  const secs = ui.spectrum?.analysisSeconds ?? a.seconds ?? 0;
  return a.running
    ? `<button class="btn primary wide" id="an-stop">■ Stoppa analysen</button>
       <p class="hint" data-testid="antime">Analyserar… ${mmss(secs)} hittills. Du kan byta app – den fortsätter.</p>`
    : `<button class="btn primary wide" id="an-start">● Starta analys</button>
       <p class="hint small">Starta, spela hela låten (i Suno, YouTube eller annan app), kom tillbaka och tryck Stoppa.</p>`;
}

function verdictBlock(own, ref) {
  const c = compareProfiles(own, ref);
  const icon = { ok: '✓', lite: '!', mycket: '✕', okand: '?' };
  return `<div class="verdict ${c.verdict}" data-testid="verdict"><b>${esc(c.summary)}</b>${infoBtn('verdict')}</div>
    <ul class="regions">${c.regions.map((r) => `<li class="${r.status}" data-region="${r.id}"><span class="ic">${icon[r.status]}</span><b>${esc(r.name)}</b> ${esc(r.text)}</li>`).join('')}</ul>
    <p class="hint small">Toppighet ${fmtDb(c.crestDiff)} dB mot referensen · dynamik ${fmtDb(c.dynDiff)} dB.</p>
    ${c.tips.length ? `<ul class="tips">${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
}

/** Resultatet: grafen (låten mot referens) överst, siffror, omdöme och åtgärder i panelen. */
function resultTop() {
  const res = ui.analysis, ref = currentRef();
  const series = { main: { label: 'Analyserad låt', bands: res.profile.bands } };
  if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
  return `<div class="lbl"><b>Analyserad låt</b>${ref ? ` mot ${esc(ref.name)}` : ''}</div><div class="spwrap" id="result">${spectrumSvg(series, { id: 'result', title: 'Analyserad låt mot referens' })}</div>`;
}
function resultPanel() {
  const res = ui.analysis;
  if (!res) return `<div class="phead"><b>Resultat</b></div><p class="hint">Inget resultat ännu – analysera en låt först (blocket Analysera).</p>`;
  const ref = currentRef();
  const p = res.profile;
  return `<section class="card" id="resultp">
    <div class="phead"><b>Resultat</b><span class="grow"></span>${refSelect('refsel2')}</div>
    <dl class="facts">
      <dt>Längd</dt><dd>${mmss(p.seconds)}</dd>
      <dt>Nivå ${infoBtn('level')}</dt><dd>${fmtDb(p.level)} dB</dd>
      <dt>Toppighet ${infoBtn('crest')}</dt><dd>${p.crest.toFixed(1)} dB</dd>
      <dt>Dynamik ${infoBtn('dynamics')}</dt><dd>${p.dynamics.toFixed(1)} dB</dd>
    </dl>
    ${ref ? verdictBlock(p, ref.profile) : '<p class="hint">Välj en referens för att se om låten håller.</p>'}
    <div class="btnrow">
      <button class="btn small" id="an-saveref">Spara som referens</button>
      ${ref && !ui.fix ? `<button class="btn small primary" id="an-fix">Åtgärda – 3 förslag</button>${infoBtn('fix')}` : ''}
    </div>
    ${ui.fix ? fixCard() : ''}
    ${ui.analysisMsg ? `<p class="hint" id="anmsg">${esc(ui.analysisMsg)}</p>` : ''}
  </section>`;
}

/** De tre förslagen: växla Före | A | B | C medan låten spelar, behåll den bästa. */
function fixCard() {
  const f = ui.fix;
  const cur = f.variants.find((v) => v.id === f.active);
  return `<div class="fixcard" id="fix">
    <div class="seg fixseg" role="tablist">
      <button data-fix="before" class="${f.active === 'before' ? 'sel' : ''}">Före</button>
      ${f.variants.map((v) => `<button data-fix="${v.id}" class="${f.active === v.id ? 'sel' : ''}"><b>${v.id}</b> ${esc(v.name)}</button>`).join('')}
    </div>
    ${cur ? `<p class="hint small">${esc(cur.desc)}</p><ul class="tips" data-testid="fixchanges">${cur.changes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
      : '<p class="hint small">Din inställning som den var. Växla mellan Före, A, B och C medan låten spelar och lyssna.</p>'}
    <div class="btnrow">
      ${cur ? `<button class="btn small primary" id="fix-keep">Behåll ${cur.id} ${esc(cur.name)}</button>` : ''}
      <button class="btn small ghost" id="fix-cancel">Avbryt</button>
    </div>
  </div>`;
}

function refsCard() {
  return `<section class="card" id="refs">
    <div class="phead"><b>Referenser</b>${infoBtn('references')}<span class="grow"></span></div>
    ${ui.refs.length ? `<ul class="reflist">${ui.refs.map((r) => `<li data-ref="${esc(r.id)}" class="${r.id === ui.refId ? 'sel' : ''}">
        <div><b>${esc(r.name)}</b><div class="meta">${r.profile.source === 'fil' ? 'från fil' : 'live'} · ${mmss(r.profile.seconds || 0)}</div></div>
        <span class="grow"></span>
        <button class="btn small" data-ref-use="${esc(r.id)}">${r.id === ui.refId ? 'Vald' : 'Välj'}</button>
        <button class="btn small ghost" data-ref-ren="${esc(r.id)}" aria-label="Döp om ${esc(r.name)}">✎</button>
        <button class="btn small ghost" data-ref-del="${esc(r.id)}" aria-label="Ta bort ${esc(r.name)}">🗑</button>
      </li>`).join('')}</ul>` : '<p class="hint">Inga referenser ännu. Analysera en låt du gillar och tryck "Spara som referens", eller importera en ljudfil.</p>'}
    <div class="btnrow">
      <label class="btn small file">Importera ljudfil som referens<input type="file" id="ref-audio" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" hidden></label>
      <button class="btn small" id="ref-export" ${ui.refs.length ? '' : 'disabled'}>Exportera</button>
      <label class="btn small file">Importera<input type="file" id="ref-import" accept=".json,application/json" hidden></label>
    </div>
    ${ui.refMsg ? `<p class="hint" id="refmsg">${esc(ui.refMsg)}</p>` : ''}
  </section>`;
}

const A_BLOCKS = () => [
  { id: 'analysera', label: 'Analysera', sub: ui.status?.analysis?.running ? 'pågår' : 'en låt' },
  { id: 'resultat', label: 'Resultat', sub: ui.analysis ? 'klart' : '–' },
  { id: 'referenser', label: 'Referenser', sub: `${ui.refs.length} st` },
];
const aBlock = () => (A_BLOCKS().some((b) => b.id === ui.blocks?.analys) ? ui.blocks.analys : 'analysera');

export function analysView() {
  const b = aBlock();
  const showResult = b === 'resultat' && ui.analysis;
  const top = showResult ? resultTop() : `<div class="lbl"><b>Spektrum nu</b>${infoBtn('spectrum')}<span class="grow"></span></div><div class="lblr">${refSelect()}</div><div class="spwrap" id="specArea">${spectrumPart()}</div>`;
  const panel = b === 'resultat' ? resultPanel() : b === 'referenser' ? refsCard()
    : `<div class="phead"><b>Analysera en låt</b>${infoBtn('analyze')}</div><div id="anArea">${analysisPart()}</div>
       ${ui.analysisMsg && !ui.analysis ? `<p class="hint" id="anmsg">${esc(ui.analysisMsg)}</p>` : ''}`;
  return split({ view: 'analys', top, blocks: A_BLOCKS(), active: b, panel, topCls: 'tall' });
}

export function renderSpectrum(root) {
  const el = root.querySelector('#specArea');
  if (!el) return;
  el.innerHTML = spectrumPart();
  const ref = currentRef();
  const series = {};
  if (ui.spectrum?.bands) series.main = { label: 'Nu', bands: ui.spectrum.bands };
  if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
  bindSpectrum(el, series);
  bindGoto(el);
  const an = root.querySelector('#anArea');
  if (an && ui.status?.analysis?.running) { const t = an.querySelector('[data-testid=antime]'); if (t) t.textContent = `Analyserar… ${mmss(ui.spectrum?.analysisSeconds ?? 0)} hittills. Du kan byta app – den fortsätter.`; }
}

const bindGoto = (el) => {
  el.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => { ui.view = b.dataset.goto; app.render(); }; });
  const allow = el.querySelector('#allowAnalysis');
  if (allow) allow.onclick = async () => {
    try { await LiveDsp.requestPermission({ name: 'microphone' }); } catch { /* */ }
    monitoring = false;
    ui.monitorMsg = '';
    await setMonitor(true);
    app.render();
  };
};

export function bindAnalys(root) {
  renderSpectrum(root);
  const res = ui.analysis;
  if (res) {
    const ref = currentRef();
    const series = { main: { label: 'Analyserad låt', bands: res.profile.bands } };
    if (ref) series.ref = { label: ref.name, bands: ref.profile.bands };
    const el = root.querySelector('#result');
    if (el) bindSpectrum(el, series);
  }
  for (const id of ['refsel', 'refsel2']) bindPicker(root, id, () => ({ title: 'Välj referens', value: ui.refId, groups: refGroups() }), async (v) => { await selectRef(v); app.render(); });
  const start = root.querySelector('#an-start');
  if (start) start.onclick = async () => {
    try { ui.status = await LiveDsp.startAnalysis(); ui.analysis = null; ui.analysisMsg = ''; } catch (e) { ui.analysisMsg = e.message; ui.analysis = null; }
    app.render();
  };
  const stop = root.querySelector('#an-stop');
  if (stop) stop.onclick = async () => {
    try {
      const { raw } = await LiveDsp.stopAnalysis();
      const profile = finishProfile(raw);
      ui.analysis = { profile };
      ui.blocks = { ...ui.blocks, analys: 'resultat' };
      ui.analysisMsg = profile.seconds < 20 ? 'Kort analys – minst en hel refräng (helst hela låten) ger säkrare resultat.' : '';
    } catch (e) { ui.analysisMsg = e.message; }
    ui.status = await LiveDsp.getStatus();
    app.render();
  };
  const sr = root.querySelector('#an-saveref');
  if (sr) sr.onclick = async () => {
    const name = await ask({ title: 'Spara som referens', value: 'Referens', okText: 'Spara' });
    if (name === null) return;
    await addRef(name, ui.analysis.profile);
    ui.analysisMsg = `Sparad som referens "${name.trim() || 'Referens'}".`;
    app.render();
  };
  const fx = root.querySelector('#an-fix');
  if (fx) fx.onclick = async () => {
    const ref = currentRef();
    ui.fix = {
      variants: fixVariants(ui.analysis.profile, ref.profile, effective()),
      active: 'before',
      backup: { presetId: ui.presetId, base: structuredClone(ui.base), macros: { ...ui.macros }, enabled: { ...ui.enabled } },
    };
    // Förslagen ska höras: Masterlab på och Mastrad
    if (ui.status?.bypass) ui.status = await LiveDsp.setBypass({ on: false });
    if (!ui.status?.on) ui.status = await LiveDsp.setOn({ on: true });
    app.render();
  };
  root.querySelectorAll('[data-fix]').forEach((b) => {
    b.onclick = () => {
      const f = ui.fix;
      f.active = b.dataset.fix;
      if (f.active === 'before') Object.assign(ui, structuredClone(f.backup));
      else {
        const v = f.variants.find((x) => x.id === f.active);
        Object.assign(ui, { base: structuredClone(v.params), macros: noMacros(), enabled: allEnabled(), presetId: '' });
      }
      changed({ now: true });
      app.render();
    };
  });
  const keep = root.querySelector('#fix-keep');
  if (keep) keep.onclick = async () => {
    const v = ui.fix.variants.find((x) => x.id === ui.fix.active);
    const r = savePreset(ui.userPresets, `Åtgärd ${v.id}: ${currentRef().name}`, v.params);
    ui.userPresets = r.presets;
    await save('presets', ui.userPresets);
    Object.assign(ui, { presetId: r.preset.id, base: structuredClone(r.preset.params), macros: noMacros(), enabled: allEnabled(), fix: null });
    changed({ now: true });
    ui.analysisMsg = `Sparad och vald i Live: "${r.preset.name}". Analysera låten igen för att se hur nära referensen den kom.`;
    app.render();
  };
  const cancel = root.querySelector('#fix-cancel');
  if (cancel) cancel.onclick = () => {
    Object.assign(ui, structuredClone(ui.fix.backup));
    ui.fix = null;
    changed({ now: true });
    app.render();
  };
  root.querySelectorAll('[data-ref-use]').forEach((b) => { b.onclick = async () => { await selectRef(b.dataset.refUse); app.render(); }; });
  root.querySelectorAll('[data-ref-ren]').forEach((b) => {
    b.onclick = async () => {
      const r = ui.refs.find((x) => x.id === b.dataset.refRen);
      const name = await ask({ title: 'Döp om referens', value: r.name, okText: 'Döp om' });
      if (name === null) return;
      await renameRef(r.id, name);
      app.render();
    };
  });
  root.querySelectorAll('[data-ref-del]').forEach((b) => {
    b.onclick = async () => {
      const r = ui.refs.find((x) => x.id === b.dataset.refDel);
      if (!(await ask({ title: `Ta bort referensen "${r.name}"?`, okText: 'Ta bort' }))) return;
      await deleteRef(r.id);
      app.render();
    };
  });
  (root.querySelector('#ref-export') || {}).onclick = async () => {
    try { await saveFile('masterlab-referenser.json', exportRefs(), 'application/json', fileDeps()); ui.refMsg = `${ui.refs.length} referenser exporterade.`; } catch (e) { ui.refMsg = e.message; }
    app.render();
  };
  (root.querySelector('#ref-import') || {}).onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { ui.refMsg = `${await importRefs(await f.text())} referenser importerade.`; } catch (err) { ui.refMsg = err.message; }
    app.render();
  };
  (root.querySelector('#ref-audio') || {}).onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    ui.refMsg = `Läser ${f.name}…`;
    app.render();
    try {
      const a = await decodeFile(f);
      const profile = profileFromChannels(a.channels, a.fs);
      const ref = await addRef(f.name.replace(/\.[^.]+$/, ''), profile);
      ui.refMsg = `"${ref.name}" sparad som referens (${mmss(profile.seconds)}).`;
    } catch (err) { ui.refMsg = err.message; }
    app.render();
  };
}
