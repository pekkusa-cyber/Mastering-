import { test, expect } from '@playwright/test';
import { wav, loadSong } from './filhelp.js';
// .pv = valt namn i en väljare (kan vara ett eget, hur långt som helst) – kortas medvetet med … och räknas inte som fel.
// Djupgranskning: varje block, varje flik i panelen, grafens lägen, Fil-lägena och arken – på 320, 360 och 412 px
// med ett brett typsnitt. Letar efter: knappar som täcks av något annat (träfftest mitt på knappen), text som
// klipps, saker utanför skärmen, överlapp och att sidan scrollar (layout B ska aldrig scrolla).
const AUDIT = () => {
  const out = [];
  const dlg = [...document.querySelectorAll('dialog[open]')].pop();
  const root = dlg || document.getElementById('app');
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const txt = (e) => (e.innerText || e.getAttribute('aria-label') || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
  // Synlig del av ett element med hänsyn till förfäder som scrollar/klipper
  const clipRect = (e) => {
    let r = e.getBoundingClientRect(), x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { const q = p.getBoundingClientRect(); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom); }
    }
    return { x0, y0, x1: Math.min(x1, innerWidth), y1: Math.min(y1, innerHeight) };
  };
  root.querySelectorAll('*').forEach((e) => {
    if (!vis(e) || e.closest('svg') || e.matches('.trunc, .pv') || (!dlg && e.closest('dialog'))) return;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && ['ellipsis', 'clip'].includes(cs.textOverflow) || (cs.overflow === 'hidden' && e.scrollWidth > e.clientWidth + 1 && e.textContent.trim() && !e.matches('.stop,.scrbox,.spwrap,.grt,.lvt,.tr,.vtrack,.vrow,.bbar,.fmt,.plist'))) out.push(`KLIPPT: ${e.tagName}.${e.className} "${txt(e)}" (${e.scrollWidth}>${e.clientWidth})`);
    if (r.right > innerWidth + 1 || r.left < -1) out.push(`UTANFÖR: ${e.tagName}.${e.className} "${txt(e)}"`);
  });
  // Täckt: mitten av varje synlig knapp/kontroll ska träffa just den
  root.querySelectorAll('button, [role=option], label.tog, label.mbtn, select, input[type=file] + *').forEach((b) => {
    if (!vis(b) || (!dlg && b.closest('dialog')) || b.disabled) return;
    const c = clipRect(b);
    if (c.x1 - c.x0 < 6 || c.y1 - c.y0 < 6) return; // utscrollad i en lista – inte synlig just nu
    const x = (c.x0 + c.x1) / 2, y = (c.y0 + c.y1) / 2;
    const hit = document.elementFromPoint(x, y);
    if (hit && hit !== b && !b.contains(hit) && !hit.contains(b) && !(hit.closest('label') && hit.closest('label').contains(b))) out.push(`TÄCKT: "${txt(b)}" täcks av ${hit.tagName}.${hit.className} "${txt(hit)}"`);
  });
  const items = [...root.querySelectorAll('button, .blk b, .blk small, output, .vname, .phead > *')].filter((e) => vis(e) && (dlg || !e.closest('dialog')));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.contains(b) || b.contains(a)) continue;
    // bara den synliga delen räknas (en rad som scrollats ut under listans kant överlappar inget)
    const ra = clipRect(a), rb = clipRect(b);
    const ox = Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0), oy = Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0);
    if (ox > 2 && oy > 2) out.push(`ÖVERLAPP: "${txt(a)}" × "${txt(b)}"`);
  }
  if (!dlg && document.documentElement.scrollHeight > innerHeight + 2) out.push(`SIDAN SCROLLAR: ${document.documentElement.scrollHeight} > ${innerHeight}`);
  return out;
};
const TABS = '#spanel [data-eqband], #spanel [data-compband], #spanel [data-feq1], #spanel [data-feq2], #spanel [data-fcomp], #spanel [data-ffarg]';

async function auditTabs(page, tag, all) {
  const n = await page.locator(TABS).count();
  (await page.evaluate(AUDIT)).forEach((m) => all.push(`${tag}: ${m}`));
  for (let i = 0; i < n; i++) {
    const t = page.locator(TABS).nth(i);
    if (!(await t.isVisible())) continue;
    const label = (await t.textContent()).trim();
    await t.click(); await page.waitForTimeout(80);
    (await page.evaluate(AUDIT)).forEach((m) => all.push(`${tag}[${label}]: ${m}`));
  }
}
async function auditSheet(page, open, tag, all) {
  await open();
  await expect(page.locator('dialog[open]').last()).toBeVisible();
  await page.waitForTimeout(120);
  (await page.evaluate(AUDIT)).forEach((m) => all.push(`${tag}: ${m}`));
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

for (const [w, h] of [[320, 640], [360, 740], [412, 915]]) test(`djupgranskning ${w} px`, async ({ page }) => {
  test.setTimeout(480000);
  await page.setViewportSize({ width: w, height: h });
  // JavaScript-fel under hela genomgången räknas också som fel
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(`JS-FEL: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) jsErrors.push(`KONSOL: ${m.text().slice(0, 160)}`); });
  await page.goto('/?sim=1&mic=1');
  await page.addStyleTag({ content: "#app, #app *, dialog, dialog * { font-family: 'DejaVu Sans', sans-serif !important; }" });
  const all = [];
  // Live
  for (const b of ['quick', 'in', 'eq1', 'comp', 'eq2', 'limiter', 'out']) {
    await page.locator(`[data-block="${b}"]`).click(); await page.waitForTimeout(100);
    await auditTabs(page, `${w} live/${b}`, all);
  }
  await auditSheet(page, () => page.getByRole('button', { name: 'Preset', exact: true }).click(), `${w} live/presetlista`, all);
  await auditSheet(page, () => page.getByRole('button', { name: 'Hantera presets' }).click(), `${w} live/hantera`, all);
  await auditSheet(page, () => page.getByRole('button', { name: 'Inställningar' }).click(), `${w} live/inställningar`, all);
  await auditSheet(page, async () => { await page.locator('#menu').click(); await page.getByRole('menuitem', { name: /Mastringsguide/ }).click(); }, `${w} guide`, all);
  // Fil med en låt
  await page.goto('/?sim=1&mic=1&view=fil');
  await page.addStyleTag({ content: "#app, #app *, dialog, dialog * { font-family: 'DejaVu Sans', sans-serif !important; }" });
  await loadSong(page, 'Same Old Thread (klar version med lång titel).wav', wav(3, { wide: true }));
  for (const g of ['wave', 'spec', 'meter']) {
    const gb = page.locator(`[data-fgraph="${g}"]`);
    if (await gb.count()) { await gb.click(); await page.waitForTimeout(100); (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w} fil/graf-${g}: ${m}`)); }
  }
  for (const b of ['quick', 'in', 'eq1', 'comp', 'eq2', 'farg', 'lim', 'out']) {
    await page.locator(`[data-block="${b}"]`).click(); await page.waitForTimeout(100);
    await auditTabs(page, `${w} fil/${b}`, all);
  }
  await auditSheet(page, () => page.locator('#f-preset').click(), `${w} fil/huvudpreset`, all);
  await auditSheet(page, () => page.locator('#f-song').click(), `${w} fil/låtmeny`, all);
  await auditSheet(page, () => page.locator('#f-exportbtn').click(), `${w} fil/export`, all);
  await auditSheet(page, () => page.locator('#f-listen').click(), `${w} fil/lyssna`, all);
  await page.locator('[data-block="farg"]').click();
  await auditSheet(page, () => page.locator('#fmod-farg').click(), `${w} fil/färg-preset`, all);
  // Lägena
  for (const mode of ['assist', 'compare', 'album']) {
    await page.locator('#f-song').click();
    await page.locator(`[data-fmode="${mode}"]`).click(); await page.waitForTimeout(150);
    (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w} fil/läge-${mode}: ${m}`));
    if (mode === 'assist') for (const s of ['2', '3', '4']) {
      const st = page.locator(`[data-astep="${s}"]`);
      if (await st.count() && await st.isEnabled()) { await st.click(); await page.waitForTimeout(120); (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w} fil/assist-${s}: ${m}`)); }
    }
    const exit = page.locator('#f-mode-exit');
    if (await exit.count()) await exit.click(); else await page.locator('[data-block="quick"]').click();
  }
  // Analys och Mer
  for (const [view, blocks] of [['analys', ['analysera', 'resultat', 'referenser']], ['mer', ['perm', 'debug', 'app']]]) {
    await page.locator('#menu').click(); await page.locator(`#vmenu [data-view="${view}"]`).click();
    for (const b of blocks) { await page.locator(`[data-block="${b}"]`).click(); await page.waitForTimeout(100); (await page.evaluate(AUDIT)).forEach((m) => all.push(`${w} ${view}/${b}: ${m}`)); }
  }
  expect([...new Set(all)].filter((m) => !m.includes('vthumb')), 'layoutfel').toEqual([]);
  expect([...new Set(jsErrors)], 'JavaScript-fel').toEqual([]);
});
