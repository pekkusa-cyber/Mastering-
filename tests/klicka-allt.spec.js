import { test, expect } from '@playwright/test';
import { wav, loadSong } from './filhelp.js';
// "Apa-test": i varje block i Live och Fil trycks varje synlig knapp, ett ark i taget stängs igen. Inga JavaScript-fel får
// uppstå och appen ska fortfarande fungera efteråt (rubriken och blocken finns kvar).
const SKIP = /Ta bort|Glöm|Exportera|Importera|Dela|Stoppa motorn|Starta motorn|Kopiera|Installera|Sök uppdatering|Spara som|Döp om|Rendera|Välj låt|Byt låt/i;

async function clickAll(page, scope, tag, errors) {
  const n = await page.locator(`${scope} button`).count();
  for (let i = 0; i < n; i++) {
    const b = page.locator(`${scope} button`).nth(i);
    if (!(await b.count()) || !(await b.isVisible()) || !(await b.isEnabled())) continue;
    const label = ((await b.getAttribute('aria-label')) || (await b.textContent()) || '').trim();
    if (SKIP.test(label)) continue;
    try { await b.click({ timeout: 2000 }); } catch { continue; } // knappen försvann när panelen ritades om – inte ett fel
    await page.waitForTimeout(60);
    // stäng ark/dialoger som öppnades
    for (let k = 0; k < 3 && (await page.locator('dialog[open]').count()); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(60); }
    if (errors.length) { errors.push(`efter "${label}" i ${tag}`); return; }
  }
}

test('Live: varje knapp i varje block går att trycka på utan fel', async ({ page }) => {
  test.setTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?sim=1&mic=1');
  for (const b of ['quick', 'in', 'eq1', 'comp', 'eq2', 'limiter', 'out']) {
    await page.locator(`[data-block="${b}"]`).click();
    await clickAll(page, '#spanel', `live/${b}`, errors);
    if (errors.length) break;
  }
  expect(errors).toEqual([]);
  await expect(page.locator('[data-block="quick"]')).toBeVisible();
});

test('Fil: varje knapp i varje block (och grafen) går att trycka på utan fel', async ({ page }) => {
  test.setTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'apa.wav', wav(3, { wide: true }));
  for (const b of ['quick', 'in', 'eq1', 'comp', 'eq2', 'farg', 'lim', 'out']) {
    await page.locator(`[data-block="${b}"]`).click();
    await clickAll(page, '#spanel', `fil/${b}`, errors);
    if (errors.length) break;
    if (!(await page.locator('[data-block="quick"]').count())) await page.locator('#f-mode-exit').click().catch(() => {});
  }
  await clickAll(page, '#stop', 'fil/graf', errors);
  expect(errors).toEqual([]);
  await expect(page.locator('#f-song')).toBeVisible();
});
