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
  // överlapp mellan knappar/etiketter på samma rad
  const items = [...document.querySelectorAll('#app button, #app .blk b, #app .blk small, #app output, #app .vname, #app .phead > *')].filter(vis);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 2 && oy > 2) out.push(`ÖVERLAPP: "${txt(a)}" × "${txt(b)}"`);
  }
  return out;
};
const NAMES = { live: ['quick', 'in', 'eq1', 'comp', 'eq2', 'limiter', 'out'], analys: ['analysera', 'resultat', 'referenser'], fil: ['lat', 'klang', 'mat', 'export'], mer: ['perm', 'debug', 'app'] };
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
  // Specialfall: kompressorn Hela låten, EQ 2 med 8 band, och Fil med en inläst låt (spelare + vågform)
  await page.getByRole('button', { name: 'Meny' }).click(); await page.locator('#vmenu [data-view="live"]').click();
  await page.locator('[data-block="comp"]').click(); await page.locator('[data-compband="all"]').click();
  (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px live/comp-all: ${m}`));
  await page.locator('[data-block="eq2"]').click(); await page.locator('[data-eqband="graphic"]').click();
  (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px live/eq2-8: ${m}`));
  await page.getByRole('button', { name: 'Meny' }).click(); await page.locator('#vmenu [data-view="fil"]').click();
  await page.locator('[data-block="lat"]').click();
  const L = new Float32Array(44100 * 2).map((_, i) => Math.sin(i / 9) * 0.3 * Math.sin(i / 20000));
  await page.locator('#f-file').setInputFiles({ name: 'en-ganska-lang-latttitel-for-test.wav', mimeType: 'audio/wav', buffer: Buffer.from(encodeWav([L, L], 44100, 16)) });
  await expect(page.locator('#f-wave')).toBeVisible({ timeout: 30000 });
  for (const b of NAMES.fil) {
    await page.locator(`[data-block="${b}"]`).click(); await page.waitForTimeout(150);
    (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w}px fil-med-låt/${b}: ${m}`));
  }
  expect([...new Set(all)].filter((m) => !m.includes('vthumb')), 'layoutfel').toEqual([]);
});
