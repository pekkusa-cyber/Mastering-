import { test, expect } from '@playwright/test';
import { pick, picked } from './helpers.js';

const analyze = async (page) => {
  await page.getByRole('button', { name: '● Starta analys' }).click();
  await expect(page.getByTestId('antime')).toBeVisible();
  await page.getByRole('button', { name: '■ Stoppa analysen' }).click();
  await expect(page.locator('#result')).toBeVisible();
};

test('utan mikrofon förklaras varför och man hänvisas till behörigheter', async ({ page }) => {
  await page.goto('/?sim=1&view=analys');
  await expect(page.locator('#monmsg')).toContainText('Mikrofonbehörighet');
  await expect(page.locator('#specArea')).toContainText('internt');
  await page.getByRole('button', { name: 'Tillåt ljudanalys' }).click();
  await expect(page.locator('[data-spec="live"] svg rect[rx]')).toHaveCount(24); // spektrumet startar direkt
});

test('livespektrum, analys, spara referens och omdöme', async ({ page }) => {
  await page.goto('/?sim=1&mic=1&view=analys');
  await expect(page.locator('[data-spec="live"] svg rect[rx]')).toHaveCount(24);
  await page.locator('[data-spec="live"] .hit').nth(11).click();
  await expect(page.locator('[data-spec="live"] .spec-read')).toContainText('1 k–1.3 k Hz');

  await analyze(page);
  await expect(page.locator('#result')).toContainText('2:00');
  await page.getByRole('button', { name: 'Spara som referens' }).click();
  await page.locator('dialog.ask input').fill('Favoritlåt');
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await expect(page.locator('#refs')).toContainText('Favoritlåt');
  await expect(picked(page, 'Referens')).toHaveText('Favoritlåt');
  // Samma låt mot sig själv: redo
  await expect(page.getByTestId('verdict')).toContainText('Redo för mastring');

  // En ljusare och toppigare låt mot referensen
  await page.evaluate(() => { window.__simBright = 6; window.__simCrest = 18; });
  await analyze(page);
  await expect(page.getByTestId('verdict')).not.toContainText('Redo');
  await expect(page.locator('[data-region="diskant"]')).toContainText('dB');
  await expect(page.locator('#result .tips')).toContainText('Kick mjukare');

  // Åtgärda: tre förslag, växla och behåll
  await page.getByRole('button', { name: 'Åtgärda – 3 förslag' }).click();
  await expect(page.locator('#fix [data-fix]')).toHaveCount(4);
  await page.locator('[data-fix="A"]').click();
  await expect(page.getByTestId('fixchanges')).toContainText('EQ 8k+ Hz');
  const a8k = (await page.evaluate(() => window.__simParams)).postEq[7].gain;
  expect(a8k).toBeLessThan(-0.4);
  await page.locator('[data-fix="C"]').click();
  await expect.poll(async () => (await page.evaluate(() => window.__simParams)).postEq[7].gain).toBeLessThan(a8k);
  await expect(page.getByTestId('fixchanges')).toContainText('Kick mjukare'); // toppigare än referensen
  await page.locator('[data-fix="before"]').click();
  await expect.poll(async () => (await page.evaluate(() => window.__simParams)).postEq[7].gain).toBe(0);
  await page.locator('[data-fix="B"]').click();
  await page.getByRole('button', { name: /Behåll B/ }).click();
  await expect(page.locator('#anmsg')).toContainText('Åtgärd B: Favoritlåt');
  await page.locator('nav [data-view="live"]').click();
  await expect(picked(page, 'Preset')).toHaveText('Åtgärd B: Favoritlåt');
});

test('referenser: döp om, ta bort, exportera och importera', async ({ page }) => {
  await page.goto('/?sim=1&mic=1&view=analys');
  await analyze(page);
  await page.getByRole('button', { name: 'Spara som referens' }).click();
  await page.locator('dialog.ask input').fill('Ref A');
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await page.getByRole('button', { name: 'Döp om Ref A' }).click();
  await page.locator('dialog.ask input').fill('Ref B');
  await page.locator('dialog.ask').getByRole('button', { name: 'Döp om' }).click();
  await expect(page.locator('#refs')).toContainText('Ref B');
  const download = page.waitForEvent('download');
  await page.locator('#ref-export').click();
  const file = await (await download).path();
  await page.getByRole('button', { name: 'Ta bort Ref B' }).click();
  await page.locator('dialog.ask').getByRole('button', { name: 'Ta bort' }).click();
  await expect(page.locator('#refs')).toContainText('Inga referenser');
  await page.locator('#ref-import').setInputFiles(file);
  await expect(page.locator('#refmsg')).toHaveText('1 referenser importerade.');
  await expect(page.locator('#refs')).toContainText('Ref B');
});
