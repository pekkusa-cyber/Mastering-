import { test, expect } from '@playwright/test';
import { encodeWav } from '../src/dsp/wav.js';
// Granskning av layouten: ingen text klipps, inget hamnar utanför skärmen och inga knappar/etiketter överlappar –
// i alla vyer och block, på 360 och 412 px.
const AUDIT = () => {
  const out = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const txt = (e) => (e.innerText || e.getAttribute('aria-label') || e.tagName).replace(/\s+/g, ' ').slice(0, 40);
  document.querySelectorAll('#app *').forEach((e) => {
    if (!vis(e) || e.closest('svg') || e.closest('dialog') || e.matches('.trunc')) return; // .trunc = medvetet kortat användarnamn (filnamn), hela finns i title
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    // text som klipps (ellipsis eller dold överrullning)
    if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && ['ellipsis', 'clip'].includes(cs.textOverflow) || (cs.overflow === 'hidden' && e.scrollWidth > e.clientWidth + 1 && e.textContent.trim() && !e.matches('.stop,.scrbox,.spwrap,.grt,.lvt,.tr,.vtrack,.vrow'))) out.push(`KLIPPT: ${e.tagName}.${e.className} "${txt(e)}" (${e.scrollWidth}>${e.clientWidth})`);
    // utanför skärmen
    if (r.right > innerWidth + 1 || r.left < -1) out.push(`UTANFÖR: ${e.tagName}.${e.className} "${txt(e)}"`);
  });
  const clipRect = (e) => {
    const r = e.getBoundingClientRect(); let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { const q = p.getBoundingClientRect(); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom); }
    }
    return { x0, y0, x1, y1 };
  };
  // överlapp mellan knappar/etiketter på samma rad
  const items = [...document.querySelectorAll('#app button, #app .blk b, #app .blk small, #app output, #app .vname, #app .phead > *')].filter(vis);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.contains(b) || b.contains(a)) continue;
    // bara den synliga delen räknas: en rad som scrollats ut under panelens kant (under blockdockan) syns inte
    const ra = clipRect(a), rb = clipRect(b);
    const ox = Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0), oy = Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0);
    if (ox > 2 && oy > 2) out.push(`ÖVERLAPP: "${txt(a)}" × "${txt(b)}"`);
  }
  return out;
};
const NAMES = { live: ['quick', 'in', 'eq1', 'comp', 'eq2', 'limiter', 'out'], analys: ['analysera', 'resultat', 'referenser'], fil: ['quick', 'in', 'eq1', 'comp', 'eq2', 'farg', 'lim', 'out'], mer: ['perm', 'debug', 'app'] };
for (const [w, h] of [[360, 740], [412, 915]]) test(`granskning ${w}`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/?sim=1&mic=1');
  // Värsta fall: en bred reservtypsnitt (som CI:ns) i stället för telefonens smalare
  await page.addStyleTag({ content: "#app, #app * { font-family: 'DejaVu Sans', sans-serif !important; }" });
  await page.locator('#onoff').click();
  const all = [];
  for (const [view, blocks] of Object.entries(NAMES)) {
    await page.getByRole('button', { name: 'Meny' }).click();
    await page.locator(`#vmenu [data-view="${view}"]`).click();
    for (const b of blocks) {
      await page.locator(`[data-block="${b}"]`).click(); await page.waitForTimeout(150);
      (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px ${view}/${b}: ${m}`));
    }
  }
  // Specialfall: lyssna på ett band (gul ruta) samtidigt som en bekräftelse syns – ✕ ska gå att trycka på
  await page.getByRole('button', { name: 'Meny' }).click(); await page.locator('#vmenu [data-view="live"]').click();
  await page.locator('[data-block="comp"]').click(); await page.locator('[data-compband="0"]').click();
  await page.locator('[data-asolo="mbc:0"]').click();
  await expect(page.locator('#solo-off')).toBeVisible();
  // grafen ritas om flera gånger i sekunden – mät och träffa i ett enda steg
  const hit = await page.evaluate(() => { const e = document.querySelector('#solo-off'); if (!e) return 'saknas'; const r = e.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id; });
  if (hit !== 'solo-off') all.push(`${w}px live/listen: ✕ i lyssningsrutan är täckt (${hit})`);
  (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px live/listen: ${m}`));
  await page.locator('#solo-off').click();
  // Specialfall: klippvarningen över grafen
  await page.evaluate(() => { window.__simPeak = -0.1; });
  await expect(page.getByTestId('clipwarn')).toBeVisible();
  (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px live/clipwarn: ${m}`));
  await page.evaluate(() => { window.__simPeak = -6; });
  // Specialfall: kompressorn Hela låten, EQ 2 med 8 band, och Fil med en inläst låt (spelare + vågform)
  await page.getByRole('button', { name: 'Meny' }).click(); await page.locator('#vmenu [data-view="live"]').click();
  await page.locator('[data-block="comp"]').click(); await page.locator('[data-compband="all"]').click();
  (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px live/comp-all: ${m}`));
  await page.locator('[data-block="eq2"]').click(); await page.locator('[data-eqband="graphic"]').click();
  (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px live/eq2-8: ${m}`));
  await page.getByRole('button', { name: 'Meny' }).click(); await page.locator('#vmenu [data-view="fil"]').click();
  const L = new Float32Array(44100 * 2).map((_, i) => Math.sin(i / 9) * 0.3 * Math.sin(i / 20000));
  await page.locator('#f-file').setInputFiles({ name: 'en-ganska-lang-latttitel-for-test.wav', mimeType: 'audio/wav', buffer: Buffer.from(encodeWav([L, L], 44100, 16)) });
  await expect(page.locator('#f-wave')).toBeVisible({ timeout: 30000 });
  for (const b of NAMES.fil) {
    await page.locator(`[data-block="${b}"]`).click(); await page.waitForTimeout(150);
    (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px fil-med-låt/${b}: ${m}`));
  }
  expect([...new Set(all)].filter((m) => !m.includes('vthumb')), 'layoutfel').toEqual([]);
});
