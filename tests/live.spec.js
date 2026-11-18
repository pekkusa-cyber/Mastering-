import { test, expect } from '@playwright/test';

test('utan Android och utan simulator förklaras att live bara finns i appen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Live-bearbetningen finns bara i Android-appen')).toBeVisible();
});

test('starta motorn, se sessioner och slå testläget på och av', async ({ page }) => {
  await page.goto('/?sim=1');
  const test = page.locator('#test');
  await expect(test).toBeDisabled();
  await page.getByRole('button', { name: 'Starta live-motorn' }).click();
  await expect(page.getByTestId('motor')).toContainText('igång');
  await expect(page.locator('[data-session="2345"]')).toContainText('Suno');
  await expect(page.locator('[data-session="2401"]')).toContainText('Chrome');
  await expect(page.locator('[data-session="2345"]')).toContainText('kopplad, av');

  await test.click();
  await expect(test).toHaveAttribute('aria-pressed', 'true');
  await expect(test).toContainText('PÅ');
  await expect(page.locator('[data-session="2345"]')).toContainText('kopplad, PÅ');

  await test.click();
  await expect(test).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Stoppa live-motorn' }).click();
  await expect(page.getByTestId('motor')).toContainText('stoppad');
  await expect(page.getByTestId('sessions')).toContainText('Inga ännu');
});

test('saknad DUMP-behörighet visar guiden med adb-kommandot', async ({ page }) => {
  await page.goto('/?sim=1&dump=0');
  await expect(page.locator('#dump')).toContainText('Behörigheten saknas');
  await expect(page.locator('#cmd')).toHaveText('adb shell pm grant se.foric.masterlab android.permission.DUMP');
  await page.getByRole('button', { name: 'Starta live-motorn' }).click();
  await expect(page.getByTestId('sessions')).toContainText('Inga ännu');
});

test('global session visar sitt fel i listan', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByRole('button', { name: 'Starta live-motorn' }).click();
  await page.getByLabel('Prova global session (0)').check();
  await expect(page.locator('[data-session="0"]')).toContainText('ej kopplad');
  await expect(page.locator('[data-session="0"]')).toContainText('UnsupportedOperationException');
});

test('felsökningsrapport kopieras och hjälptexten öppnas', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByRole('button', { name: 'Kopiera felsökningsrapport' }).click();
  await expect(page.getByText('Kopierad – klistra in')).toBeVisible();
  expect(await page.evaluate(() => window.__copied)).toContain('felsökningsrapport');
  await page.getByRole('button', { name: 'Hjälp' }).click();
  await expect(page.locator('dialog')).toContainText('Live – testläge');
  await page.getByRole('button', { name: 'Stäng' }).click();
  await expect(page.locator('dialog')).not.toBeVisible();
});
