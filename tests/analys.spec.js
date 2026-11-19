import { test, expect } from '@playwright/test';

const analyze = async (page) => {
  await page.getByRole('button', { name: '● Starta analys' }).click();
  await expect(page.getByTestId('antime')).toBeVisible();
  await page.getByRole('button', { name: '■ Stoppa analysen' }).click();
  await expect(page.locator('#result')).toBeVisible();
};

test('utan mikrofon förklaras varför och man hänvisas till behörigheter', async ({ page }) => {
  await page.goto('/?sim=1&view=analys');
  await expect(page.locator('#monmsg')).toContainText('Mikrofonbehörighet');
  await page.getByRole('button', { name: 'Till Behörigheter' }).click();
  await expect(page.locator('[data-perm="microphone"]')).toBeVisible();
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
  await expect(page.locator('#refsel')).toHaveValue(/^r-/);
  // Samma låt mot sig själv: redo
  await expect(page.getByTestId('verdict')).toContainText('Redo för mastring');

  // En ljusare och toppigare låt mot referensen
  await page.evaluate(() => { window.__simBright = 6; window.__simCrest = 18; });
  await analyze(page);
  await expect(page.getByTestId('verdict')).not.toContainText('Redo');
  await expect(page.locator('[data-region="luft"]')).toContainText('dB');
  await expect(page.locator('#result .tips')).toContainText('Kick mjukare');

  // Matcha EQ live gör en ny preset med sänkt topp
  await page.getByRole('button', { name: 'Matcha EQ live' }).click();
  await expect(page.locator('#anmsg')).toContainText('Match: Favoritlåt');
  const p = await page.evaluate(() => window.__simParams);
  expect(p.postEq[7].gain).toBeLessThan(-1);
  await page.locator('nav [data-view="live"]').click();
  await expect(page.getByLabel('Preset', { exact: true }).locator('option:checked')).toHaveText('Match: Favoritlåt');
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
