import { test, expect } from '@playwright/test';
import { pick } from './helpers.js';

const params = (page) => page.evaluate(() => window.__simParams);

test('solo: S på ett multiband hör bara det bandet, Avsluta solo tar tillbaka allt', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Suno-fix');
  await page.getByRole('button', { name: 'Avancerat' }).click();
  const before = await params(page);
  await page.locator('details[data-sec="mbc"] > summary').click();
  await page.getByRole('button', { name: 'Solo Kick 0–120 Hz' }).click();
  await expect(page.getByTestId('solobar')).toContainText('Kick 0–120 Hz');
  await expect.poll(async () => (await params(page)).postEq.every((b) => b.gain === 0)).toBe(true);
  const p = await params(page);
  expect(p.mbc[0].ratio).toBe(before.mbc[0].ratio);
  expect(p.mbc.slice(1).every((b) => b.ratio === 1)).toBe(true);
  expect(p.limiter.threshold).toBe(-1); // skyddslimitern ligger kvar
  await page.getByRole('button', { name: 'Avsluta solo' }).click();
  await expect(page.getByTestId('solobar')).toHaveCount(0);
  await expect.poll(async () => JSON.stringify((await params(page)).postEq)).toBe(JSON.stringify(before.postEq));
});

test('solo på ett enkelt reglage i Enkelt läge', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.locator('details.grp[data-group="ton"] summary .gname').click();
  await page.getByRole('button', { name: 'Solo Ljusare' }).click();
  await expect(page.getByTestId('solobar')).toBeVisible();
  await expect.poll(async () => (await params(page)).mbc.every((b) => b.ratio === 1)).toBe(true);
});

test('parametrisk EQ med Q går till motorn som 31 tersband', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByRole('button', { name: 'Avancerat' }).click();
  await page.locator('details[data-sec="peq"] > summary').click();
  const mitt = page.locator('details[data-sec="peq"] details.band').nth(2);
  await mitt.locator('summary').click();
  for (let i = 0; i < 12; i++) await mitt.getByRole('button', { name: 'Öka Gain' }).click();
  await expect(mitt.locator('output').nth(1)).toHaveText('6.0 dB');
  await expect.poll(async () => (await params(page)).post31[17]).toBeGreaterThan(5.5); // 1 kHz
  const wide = (await params(page)).post31[20]; // 2 kHz
  for (let i = 0; i < 30; i++) await mitt.getByRole('button', { name: 'Öka Q (bredd)' }).click();
  await expect.poll(async () => (await params(page)).post31[20]).toBeLessThan(wide - 1); // smalare: grannen påverkas mindre
  await expect(page.getByTestId('affects')).toBeVisible();
});

test('separata presets: EQ från en preset, limitern från en annan', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Mjuk kick');
  const kick = await params(page);
  await pick(page, 'EQ-preset', 'Radio ljus');
  await expect(page.locator('#mod-eq b')).toHaveText('Radio ljus');
  const p = await params(page);
  expect(p.mbc[0].ratio).toBe(kick.mbc[0].ratio); // kompressorn kvar
  expect(JSON.stringify(p.postEq)).not.toBe(JSON.stringify(kick.postEq));
  await pick(page, 'Limiter-preset', 'Orörd');
  await expect.poll(async () => (await params(page)).limiter.ratio).toBe(1);
  await expect(page.locator('#mod-limiter b')).toHaveText('Orörd');
  // Ångra tar tillbaka limitern
  await page.locator('#undo').click();
  await expect.poll(async () => (await params(page)).limiter.ratio).toBe(kick.limiter.ratio);
  // Byter man hela presetten nollställs delvalen
  await pick(page, 'Preset', 'Suno-fix');
  await expect(page.locator('#mod-eq b')).toHaveText('Byt ▾');
});
