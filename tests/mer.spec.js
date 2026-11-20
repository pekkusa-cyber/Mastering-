import { test, expect } from '@playwright/test';
import { block } from './helpers.js';

test('behörigheter: tillåt allt och bevilja DUMP med Shizuku', async ({ page }) => {
  await page.goto('/?sim=1&view=mer');
  for (const [id, name] of [['microphone', 'Tillåt'], ['notifications', 'Tillåt'], ['battery', 'Undanta'], ['install', 'Tillåt']]) {
    await page.locator(`[data-perm="${id}"]`).getByRole('button', { name }).click();
    await expect(page.locator(`[data-perm="${id}"]`)).toContainText('klart');
  }
  await expect(page.locator('#cmd')).toHaveText('adb shell pm grant se.foric.masterlab android.permission.DUMP');
  await page.getByRole('button', { name: 'Bevilja med Shizuku' }).click();
  await expect(page.locator('#msg')).toHaveText('Sessionsdetekteringen är beviljad.');
  await expect(page.locator('[data-perm="dump"]')).toContainText('klart');
});

test('Shizuku som inte är igång ger en tydlig förklaring', async ({ page }) => {
  await page.goto('/?sim=1&shizuku=0&view=mer');
  await expect(page.locator('[data-perm="dump"]')).toContainText('inte installerad');
  await page.getByRole('button', { name: 'Bevilja med Shizuku' }).click();
  await expect(page.locator('#msg')).toContainText('Shizuku är inte igång');
});

test('global session förvald; felsökningen visar sessioner och rapport', async ({ page }) => {
  await page.goto('/?sim=1&dump=1');
  await page.locator('#onoff').click();
  await page.locator('nav [data-view="mer"]').click();
  await block(page, 'debug');
  await expect(page.locator('[data-session="0"]')).toContainText('kopplad, på');
  await expect(page.locator('[data-session="2345"]')).toContainText('via global');
  await page.getByRole('button', { name: 'Kopiera felsökningsrapport' }).click();
  await expect(page.getByText('Kopierad – klistra in')).toBeVisible();
  await block(page, 'perm');
  await page.getByLabel('Använd global session').uncheck();
  await expect(page.locator('[data-perm="global"]')).toContainText('Avslagen');
});

test('version och sök uppdatering', async ({ page }) => {
  await page.goto('/?sim=1&view=mer');
  await block(page, 'app');
  await expect(page.getByTestId('version')).toContainText('webb');
  await page.getByRole('button', { name: 'Sök uppdatering' }).click();
  await expect(page.locator('#updateMsg')).toContainText('senaste');
});
