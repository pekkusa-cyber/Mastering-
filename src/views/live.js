// Live-vyn: PÅ/AV, Jämn volym, presets, Enkelt/Avancerat med ⓘ och ↺ på varje reglage.
import { LiveDsp, isNative } from '../livedsp.js';
import { ui, app } from '../state.js';
import { load, save } from '../store.js';
import {
  BUILTIN_PRESETS, EQ_CUTOFFS, MACROS, MBC_CUTOFFS, MBC_NAMES, RANGES, applyMacros, bandLabel, deletePreset,
  exportPresets, importPresets, neutral, noMacros, renamePreset, sanitize, savePreset, toNative,
} from '../chain.js';
import { ask, bindSliders, esc, fmtDb, getPath, infoBtn, setPath, sheet, slider, saveFile } from '../ui.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const allPresets = () => [...BUILTIN_PRESETS, ...ui.userPresets];
export const currentPreset = () => allPresets().find((p) => p.id === ui.presetId);
export const effective = () => applyMacros(ui.base, ui.macros);
const presetBase = () => sanitize(currentPreset()?.params ?? neutral());
const isDirty = () => {
  const p = currentPreset();
  return !p || JSON.stringify(effective()) !== JSON.stringify(sanitize(p.params));
};

let sendTimer = 0, saveTimer = 0;
/** Skickar kedjan till motorn (lite fördröjt medan ett reglage dras) och sparar läget lokalt. */
export function changed({ now = false } = {}) {
  clearTimeout(sendTimer);
  const send = () => LiveDsp?.setParams({ params: toNative(effective()) });
  if (now) send(); else sendTimer = setTimeout(send, 60);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save('state', { presetId: ui.presetId, base: ui.base, macros: ui.macros, mode: ui.mode }), 300);
  const d = document.querySelector('#dirty');
  if (d) d.hidden = !isDirty();
}

export async function initLive() {
  const st = await load('state', null);
  ui.userPresets = await load('presets', []);
  if (st) {
    ui.presetId = st.presetId ?? ui.presetId;
    ui.base = sanitize(st.base);
    ui.macros = { ...noMacros(), ...st.macros };
    ui.mode = st.mode === 'advanced' ? 'advanced' : 'simple';
  }
}

// ---- Delar ----

export function onButton() {
  const s = ui.status;
  const agc = s?.agc?.on;
  return `<button class="big ${s?.on ? 'on' : ''}" id="onoff" aria-pressed="${!!s?.on}">
      <span>${s?.on ? 'MASTRAT' : agc ? 'ORIGINAL · NIVÅMATCHAT' : 'ORIGINAL'}</span><strong>${s?.on ? 'PÅ' : 'AV'}</strong></button>
    <p class="status" data-testid="motor">${s?.running
      ? (s.globalActive ? 'Bearbetar allt ljud' : `Motorn går · ${s.sessions.filter((x) => x.attached).length} sessioner`)
      : 'Motorn startar när du slår PÅ'}${infoBtn('onoff')}</p>`;
}

export function agcRow() {
  const a = ui.status?.agc || {};
  const read = a.on ? `<span class="dim small" data-testid="agcread">nu ${fmtDb(a.gain)} dB${a.probing ? ' · mäter…' : ''}</span>` : '';
  return `<div class="row agc">
    <label class="switch"><input type="checkbox" id="agc" ${a.on ? 'checked' : ''}> Jämn volym</label>${infoBtn('agc')}
    <span class="grow"></span>${read}
  </div>${ui.agcMsg ? `<p class="hint small" id="agcmsg">${esc(ui.agcMsg)}</p>` : ''}`;
}

function presetCard() {
  const opt = (p) => `<option value="${esc(p.id)}" ${p.id === ui.presetId ? 'selected' : ''}>${esc(p.name)}</option>`;
  const p = currentPreset();
  return `<section class="card">
    <div class="row"><h2>Preset ${infoBtn('presets')}</h2><span id="dirty" class="dim small" ${isDirty() ? '' : 'hidden'}>ändrad</span><span class="grow"></span>
      <button class="btn small" id="p-menu" aria-label="Hantera presets">⋯ Hantera</button></div>
    <select id="preset" aria-label="Preset">
      <optgroup label="Inbyggda">${BUILTIN_PRESETS.map(opt).join('')}</optgroup>
      ${ui.userPresets.length ? `<optgroup label="Mina">${ui.userPresets.map(opt).join('')}</optgroup>` : ''}
      ${!p ? '<option value="" selected>(egen inställning)</option>' : ''}
    </select>
    <p class="hint small" id="pdesc">${esc(p?.desc || (p ? 'Din egen preset.' : 'Ändrad från en preset eller platt.'))}</p>
    ${ui.msg ? `<p class="hint" id="msg">${esc(ui.msg)}</p>` : ''}
  </section>`;
}

const path = (key, label, range, info = key) =>
  slider({ id: `p-${key.replace(/\./g, '-')}`, label, value: getPath(ui.base, key), range, info, resetTo: getPath(presetBase(), key), kind: 'path', key });

function levelBlock() {
  const agcOn = ui.status?.agc?.on;
  return `${path('outputGain', 'Utgångsnivå', RANGES.outputGain)}
    ${agcOn ? '<p class="hint small">Jämn volym är på – PÅ och AV matchas automatiskt.</p>'
      : `<div class="btnrow"><button class="btn small" id="autolevel">Auto-nivåmatcha</button>${infoBtn('autolevel')}</div>`}
    ${ui.levelMsg ? `<p class="hint" id="levelmsg">${esc(ui.levelMsg)}</p>` : ''}`;
}

function simpleCard() {
  return `<section class="card" id="simple">
    ${MACROS.map((m) => slider({ id: `m-${m.key}`, label: m.label, value: ui.macros[m.key], range: [-100, 100, 1, ''], info: m.key, resetTo: 0, kind: 'macro', key: m.key })).join('')}
    <div class="sep"></div>
    ${levelBlock()}
    <div class="btnrow"><button class="btn small" id="reset-all">Återställ alla</button></div>
  </section>`;
}

const section = (id, title, info, body, open = false) =>
  `<details class="sec" data-sec="${id}" ${open ? 'open' : ''}><summary>${esc(title)}${infoBtn(info, `Om ${title}`)}</summary><div class="secbody">${body}</div></details>`;

function advancedCard() {
  const eq = (k) => EQ_CUTOFFS.map((_, i) => path(`${k}.${i}.gain`, bandLabel(EQ_CUTOFFS, i), RANGES.eqGain)).join('');
  const mbc = MBC_CUTOFFS.map((_, i) => `<details class="band"><summary>${esc(MBC_NAMES[i])}${infoBtn(`mbcBand${i}`)}</summary>
      ${path(`mbc.${i}.threshold`, 'Tröskel', RANGES.threshold)}
      ${path(`mbc.${i}.ratio`, 'Ratio', RANGES.ratio)}
      ${path(`mbc.${i}.attack`, 'Attack', RANGES.attack)}
      ${path(`mbc.${i}.release`, 'Release', RANGES.release)}
      ${path(`mbc.${i}.knee`, 'Knä', RANGES.knee)}
      ${path(`mbc.${i}.preGain`, 'Förstärkning före', RANGES.preGain)}
      ${path(`mbc.${i}.postGain`, 'Förstärkning efter', RANGES.postGain)}
    </details>`).join('');
  return `<section class="card" id="advanced">
    ${section('input', 'Ingång', 'sec_input', path('inputGain', 'Ingångsförstärkning', RANGES.inputGain), true)}
    ${section('preEq', 'Pre-EQ', 'sec_preEq', eq('preEq'))}
    ${section('mbc', 'Multiband-kompressor', 'sec_mbc', mbc)}
    ${section('postEq', 'Post-EQ', 'sec_postEq', eq('postEq'))}
    ${section('limiter', 'Limiter', 'sec_limiter', `
      ${path('limiter.threshold', 'Tak', RANGES.limThreshold)}
      ${path('limiter.ratio', 'Ratio', RANGES.limRatio)}
      ${path('limiter.attack', 'Attack', RANGES.limAttack)}
      ${path('limiter.release', 'Release', RANGES.limRelease)}
      ${path('limiter.postGain', 'Efterförstärkning', RANGES.limPostGain)}`)}
    ${section('output', 'Utgång', 'sec_output', levelBlock())}
    <div class="btnrow"><button class="btn small" id="reset-all">Återställ alla</button><button class="btn small" id="flat">Platt</button></div>
  </section>`;
}

export function liveView() {
  return `
    <section class="card center" id="statusArea">${onButton()}</section>
    <section class="card" id="agcArea">${agcRow()}</section>
    ${presetCard()}
    <div class="seg" role="tablist">
      <button data-mode="simple" class="${ui.mode === 'simple' ? 'sel' : ''}">Enkelt</button>
      <button data-mode="advanced" class="${ui.mode === 'advanced' ? 'sel' : ''}">Avancerat</button>
      ${infoBtn(ui.mode === 'simple' ? 'simple' : 'advanced')}
    </div>
    ${ui.mode === 'simple' ? simpleCard() : advancedCard()}`;
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

const fileDeps = () => ({ isNative, Filesystem, Directory, Encoding, Share });

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
    <p class="hint small">Inbyggda presets kan inte döpas om eller tas bort – spara en kopia med "Spara som".</p>`);
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

export function bindLive(root) {
  root.querySelector('#onoff').onclick = toggleOn;
  bindAgc(root);
  bindSliders(root, (kind, key, v) => {
    if (kind === 'path') setPath(ui.base, key, v);
    if (kind === 'macro') ui.macros[key] = v;
    changed();
  });
  root.querySelectorAll('[data-mode]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.mode === ui.mode) return;
      if (b.dataset.mode === 'advanced') { ui.base = effective(); ui.macros = noMacros(); } // de enkla reglagen bakas in
      ui.mode = b.dataset.mode;
      changed();
      app.render();
    };
  });
  root.querySelector('#preset').onchange = (e) => selectPreset(e.target.value);
  root.querySelector('#p-menu').onclick = presetMenu;
  root.querySelector('#reset-all').onclick = () => {
    if (ui.mode === 'simple') { ui.macros = noMacros(); ui.base.outputGain = presetBase().outputGain; }
    else { ui.base = presetBase(); ui.macros = noMacros(); }
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

export function bindAgc(root) {
  const a = root.querySelector('#agc');
  if (!a) return;
  a.onchange = async () => {
    ui.agcMsg = '';
    try { ui.status = await LiveDsp.setAgc({ on: a.checked }); } catch (e) { a.checked = false; ui.agcMsg = e.message; }
    app.render();
  };
}
