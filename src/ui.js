// Byggstenar för gränssnittet: reglage med ⓘ och ↺, dialoger, informationsruta och små hjälpare.
import { infoFor } from './info.js';

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (v, step) => (step < 1 ? Number(v).toFixed(1) : String(Math.round(v)));
const pct = (v, min, max) => Math.round(((Number(v) - min) / (max - min || 1)) * 1000) / 10;
export const fmtDb = (v, d = 1) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}` : '–');

export const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
export function setPath(obj, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = v;
}

/** ⓘ-knapp som öppnar förklaringen för `key` (se info.js). */
export const infoBtn = (key, label = 'Förklaring') => (key ? `<button type="button" class="i" data-info="${esc(key)}" aria-label="${esc(label)}">ⓘ</button>` : '');

/**
 * Ett reglage: (på/av), namn, ⓘ, värde, ↺ (nollställ till `resetTo`), − / + och själva skjutreglaget.
 * kind/key berättar för vyn vad som ändras (t.ex. kind="path" key="mbc.0.ratio").
 * enable: { key, on } ger en på/av-knapp – av = reglaget påverkar inte ljudet.
 */
export function slider({ id, label, value, range, info, resetTo = null, kind, key, enable = null, extra = '' }) {
  const [min, max, step, unit] = range;
  const atReset = resetTo !== null && Math.abs(Number(value) - Number(resetTo)) < 1e-9;
  const off = enable && !enable.on;
  return `<div class="sl${off ? ' off' : ''}" data-sl="${esc(id)}">
    <div class="slhead">
      ${enable ? toggle(enable.key, enable.on, label) : ''}
      <label for="${esc(id)}" class="name">${esc(label)}</label>${infoBtn(info, `Om ${label}`)}
      <output for="${esc(id)}">${fmt(value, step)}${unit ? ` ${unit}` : ''}</output>
      ${extra}${resetTo !== null ? `<button type="button" class="rst${atReset ? ' at' : ''}" data-reset="${esc(id)}" data-to="${resetTo}" aria-label="Nollställ ${esc(label)}">↺</button>` : ''}
    </div>
    <div class="slrow">
      <button type="button" class="step" data-step="${esc(id)}" data-dir="-1" aria-label="Minska ${esc(label)}">−</button>
      <input type="range" id="${esc(id)}" min="${min}" max="${max}" step="${step}" value="${value}" data-kind="${esc(kind)}" data-key="${esc(key)}" data-unit="${esc(unit)}" style="--p:${pct(value, min, max)}%">
      <button type="button" class="step" data-step="${esc(id)}" data-dir="1" aria-label="Öka ${esc(label)}">+</button>
    </div>
  </div>`;
}

/**
 * Lodrät fader för mixern: värde överst, fader (dra uppåt/nedåt – ett tryck flyttar den inte), M (mute = av) och
 * S (solo) under, namn längst ner. Bygger på samma <input type=range> som slider(), så ↺, Ångra och tester fungerar lika.
 */
export function vfader({ id, label, short = label, value, range, kind, key, resetTo = 0, enable = null, soloKey = null, soloOn = false, info = null, buttons = true }) {
  const [min, max, step, unit = ''] = range;
  const off = enable && !enable.on;
  const p = pct(value, min, max);
  const z = pct(Math.min(max, Math.max(min, resetTo)), min, max);
  return `<div class="sl vf${off ? ' off' : ''}" data-sl="${esc(id)}" style="--p:${p}%;--z:${z}%">
    <output for="${esc(id)}">${fmt(value, step)}</output>${unit && !buttons ? `<small class="vu">${esc(unit)}</small>` : ''}
    <div class="vrow" aria-hidden="false"><div class="vtrack"><i class="vfill"></i><i class="vthumb"></i></div>
      <input type="range" id="${esc(id)}" min="${min}" max="${max}" step="${step}" value="${value}" data-kind="${esc(kind)}" data-key="${esc(key)}" data-unit="" aria-label="${esc(label)}" style="--p:${p}%"></div>
    ${buttons ? `<div class="vbtns">${enable ? `<label class="mbtn" title="Mute"><input type="checkbox" data-enable="${esc(enable.key)}" ${enable.on ? 'checked' : ''} aria-label="Mute ${esc(label)}"><span>M</span></label>` : '<span class="mbtn ghost"></span>'}
      ${soloKey ? soloBtn(soloKey, soloOn, label) : '<span class="solo ghost"></span>'}</div>` : ''}
    <button type="button" class="vname" data-dblreset="${esc(id)}" data-to="${resetTo}" title="Dubbeltryck = nollställ">${esc(short)}</button>
    ${info ? infoBtn(info, `Om ${label}`) : ''}
  </div>`;
}

/** S-knappen: hör bara den här delen (allt annat neutralt). Kopplas i vyn via [data-solo]. */
export const soloBtn = (key, on, label) =>
  `<button type="button" class="solo${on ? ' on' : ''}" data-solo="${esc(key)}" aria-pressed="${!!on}" aria-label="Solo ${esc(label)}" title="Solo – hör bara detta">S</button>`;

/** Liten på/av-knapp (för en sektion, ett band eller ett reglage). */
export const toggle = (key, on, label) =>
  `<label class="tog" title="${on ? 'På' : 'Av'}"><input type="checkbox" data-enable="${esc(key)}" ${on ? 'checked' : ''} aria-label="${esc(label)} på/av"><i></i></label>`;

/** Kopplar alla reglage, ↺, −/+ och på/av i root. onChange(kind, key, value), onEnable(key, on). */
export function bindSliders(root, onChange, onEnable) {
  const update = (el, v) => {
    el.style.setProperty('--p', `${pct(v, Number(el.min), Number(el.max))}%`);
    el.closest('.vf')?.style.setProperty('--p', `${pct(v, Number(el.min), Number(el.max))}%`);
    const out = el.closest('.sl').querySelector('output');
    const unit = el.dataset.unit;
    out.textContent = el.closest('.vf') ? fmt(v, Number(el.step)) : `${fmt(v, Number(el.step))}${unit ? ` ${unit}` : ''}`;
    const r = el.closest('.sl').querySelector('.rst');
    if (r) r.classList.toggle('at', Math.abs(v - Number(r.dataset.to)) < 1e-9);
  };
  const set = (el, v) => { el.value = String(v); const n = Number(el.value); update(el, n); onChange(el.dataset.kind, el.dataset.key, n); };
  root.querySelectorAll('input[type=range][data-kind]').forEach((el) => {
    el.oninput = () => { const v = Number(el.value); update(el, v); onChange(el.dataset.kind, el.dataset.key, v); };
  });
  // Skydd mot misstag: reglaget ändras bara av ett tydligt vågrätt drag (inte av tryck eller scroll), och dragen
  // är relativa – värdet hoppar aldrig dit fingret landar.
  // Lodräta fadrar (.vrow) fungerar likadant fast i höjdled: ett vågrätt svep där är ett sidbyte, inte en ändring.
  root.querySelectorAll('.slrow, .vrow').forEach((row) => {
    const el = row.querySelector('input[type=range][data-kind]');
    if (!el || row.dataset.guard) return;
    const vert = row.classList.contains('vrow');
    row.dataset.guard = '1';
    let g = null;
    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.step')) return;
      g = { x: e.clientX, y: e.clientY, v: Number(el.value), id: e.pointerId, active: false };
    });
    row.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      let dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (vert) [dx, dy] = [g.y - e.clientY, e.clientX - g.x]; // uppåt = mer
      if (!g.active) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // scroll – rör inte reglaget
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        g.active = true;
        row.classList.add('dragging');
        try { row.setPointerCapture(e.pointerId); } catch { /* */ }
      }
      e.preventDefault();
      const min = Number(el.min), max = Number(el.max), st = Number(el.step);
      const w = (vert ? row.getBoundingClientRect().height : el.getBoundingClientRect().width) || 1;
      const v = Math.min(max, Math.max(min, Math.round((g.v + (dx / w) * (max - min)) / st) * st));
      if (v !== Number(el.value)) set(el, v);
    });
    const end = () => { if (g?.active) row.classList.remove('dragging'); g = null; };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
  });
  root.querySelectorAll('[data-reset]').forEach((b) => {
    b.onclick = () => set(root.querySelector(`#${CSS.escape(b.dataset.reset)}`), Number(b.dataset.to));
  });
  root.querySelectorAll('[data-dblreset]').forEach((b) => {
    b.ondblclick = () => set(root.querySelector(`#${CSS.escape(b.dataset.dblreset)}`), Number(b.dataset.to));
  });
  root.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      const el = root.querySelector(`#${CSS.escape(b.dataset.step)}`);
      const st = Number(el.step), range = Number(el.max) - Number(el.min);
      const inc = Math.max(st, Math.round(range / 40 / st) * st);
      const v = Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + Number(b.dataset.dir) * inc));
      set(el, Math.round(v / st) * st);
    };
  });
  if (onEnable) root.querySelectorAll('[data-enable]').forEach((c) => {
    c.onclick = (e) => e.stopPropagation(); // en knapp i en <summary> ska inte fälla ut sektionen
    c.onchange = () => {
      c.closest('.sl')?.classList.toggle('off', !c.checked);
      c.closest('details')?.classList.toggle('off', !c.checked && c.closest('summary') !== null);
      onEnable(c.dataset.enable, c.checked);
    };
  });
}

/** Visar förklaringen för `key` i en ruta längst ner. */
export function showInfo(key) {
  const inf = infoFor(key);
  if (!inf) return;
  sheet(`<h2>${esc(inf.title)}</h2><p>${esc(inf.text)}</p>`, { cls: 'infosheet' });
}

/** Bottenark (dialog). html = innehåll; actions = [{ id, label, primary }]. Svarar dialogen. */
export function sheet(html, { cls = '', closeText = 'Stäng' } = {}) {
  const d = document.createElement('dialog');
  d.className = `sheet ${cls}`;
  d.innerHTML = `<div class="sheet-body">${html}</div><form method="dialog"><button class="btn wide">${esc(closeText)}</button></form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.showModal();
  return d;
}

/** Dialog för namn (value ≠ null) eller bekräftelse. Svarar texten / true, eller null vid Avbryt. */
export function ask({ title, value = null, okText = 'OK' }) {
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

/** Sparar text som fil: i appen via Androids dela-meny (och i Dokument/Masterlab), i webbläsaren som nedladdning. */
export async function saveFile(name, data, mime, { isNative, Filesystem, Directory, Encoding, Share }) {
  if (!isNative) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.download = name;
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return 'download';
  }
  const binary = data instanceof ArrayBuffer;
  const write = async (directory, path) => {
    if (!binary) return Filesystem.writeFile({ path, data, directory, encoding: Encoding.UTF8, recursive: true });
    // Stora filer skrivs i bitar (base64) så att bryggan till Android inte svämmar över
    const bytes = new Uint8Array(data), CH = 3 * 1024 * 1024;
    for (let o = 0; o < bytes.length; o += CH) {
      const part = bytes.subarray(o, Math.min(bytes.length, o + CH));
      let s = '';
      for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode.apply(null, part.subarray(i, i + 0x8000));
      const b64 = btoa(s);
      if (o === 0) await Filesystem.writeFile({ path, data: b64, directory, recursive: true });
      else await Filesystem.appendFile({ path, data: b64, directory });
    }
    return Filesystem.getUri({ path, directory });
  };
  let res;
  try { res = await write(Directory.Documents, `Masterlab/${name}`); } catch { res = await write(Directory.Cache, name); }
  const uri = res?.uri || (await Filesystem.getUri({ path: name, directory: Directory.Cache })).uri;
  try { await Share.share({ title: name, files: [uri], dialogTitle: 'Spara eller skicka' }); } catch { /* användaren stängde */ }
  return 'shared';
}

// ---- Appens egen väljare (i stället för telefonens svarta rullgardin) ----

/**
 * En knapp som visar valt värde; tryck öppnar ett ark med alternativen.
 * groups: [{ label, options: [{ value, label, desc?, icon? }] }]
 */
export function picker({ id, label, value, groups, placeholder = 'Välj' }) {
  const cur = groups.flatMap((g) => g.options).find((o) => o.value === value);
  return `<button type="button" class="picker" id="${esc(id)}" aria-label="${esc(label)}" aria-haspopup="listbox">
    ${cur?.icon ? `<span class="pi">${cur.icon}</span>` : ''}<span class="pv">${esc(cur?.label || placeholder)}</span><span class="chev">▾</span></button>`;
}

/** Öppnar väljarens ark. Svarar valt värde, eller null om arket stängdes. */
export function openPicker({ title, value, groups }) {
  return new Promise((resolve) => {
    let chosen = null;
    const d = sheet(`<h2>${esc(title)}</h2><div class="plist" role="listbox" aria-label="${esc(title)}">${groups.map((g) => `
      ${g.label ? `<div class="pgroup">${esc(g.label)}</div>` : ''}
      ${g.options.map((o) => `<button type="button" role="option" class="popt ${o.value === value ? 'sel' : ''}" aria-selected="${o.value === value}" data-value="${esc(o.value)}">
        ${o.icon ? `<span class="pi">${o.icon}</span>` : ''}<span class="pt"><b>${esc(o.label)}</b>${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</span>${o.value === value ? '<span class="pcheck">✓</span>' : ''}
      </button>`).join('')}`).join('')}</div>`, { cls: 'pickersheet', closeText: 'Avbryt' });
    d.querySelectorAll('[data-value]').forEach((b) => { b.onclick = () => { chosen = b.dataset.value; d.close(); }; });
    d.addEventListener('close', () => resolve(chosen));
    d.querySelector('.popt.sel')?.scrollIntoView({ block: 'center' });
  });
}

/** Kopplar en väljare. opts = { title, value, groups }, onChange(value). */
export function bindPicker(root, id, opts, onChange) {
  const b = root.querySelector(`#${CSS.escape(id)}`);
  if (!b) return;
  b.onclick = async () => {
    const v = await openPicker(typeof opts === 'function' ? opts() : opts);
    if (v !== null) onChange(v);
  };
}

/**
 * Samma upplägg i alla vyer: en fast del överst (graf/överblick), en rad block i flödesordning och under dem en
 * panel för valt block. Inget scrollar – bara panelen kan, i nödfall, scrolla inuti sig själv.
 * blocks: [{ id, label, sub, dot }] – dot: true = på (grön), false = av (grå), undefined = ingen prick.
 */
export function split({ view, top, blocks, active, panel, topCls = '' }) {
  return `<div class="split" data-split="${esc(view)}">
    <div class="stop ${topCls}" id="stop">${top}</div>
    <div class="blocks" role="tablist">${blocks.map((b, i) => `${i ? '<span class="ar" aria-hidden="true">›</span>' : ''}<button type="button" role="tab" data-block="${esc(b.id)}" class="blk${b.id === active ? ' on' : ''}" aria-selected="${b.id === active}">
      ${b.dot === undefined ? '' : `<i class="dot${b.dot ? '' : ' no'}"></i>`}<b>${esc(b.label)}</b>${b.sub ? `<small>${esc(b.sub)}</small>` : ''}</button>`).join('')}</div>
    <div class="spanel" id="spanel">${panel}</div>
  </div>`;
}
