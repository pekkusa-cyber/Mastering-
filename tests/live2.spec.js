import { test, expect } from '@playwright/test';

const sent = (page) => page.evaluate(() => window.__simParams);
const setRange = (loc, v) => loc.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));

test('bekräftelse: ändringen hörs nu / motorn av / sparat', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-kick'), 30);
  await expect(page.locator('#confirm')).toContainText('motorn är av');
  await page.locator('#onoff').click();
  await setRange(page.locator('#m-kick'), 40);
  await expect(page.locator('#confirm')).toContainText('hörs nu');
  await page.locator('#onoff').click();
  await setRange(page.locator('#m-kick'), 50);
  await expect(page.locator('#confirm')).toContainText('hörs när du slår PÅ');
});

test('en annan app (Wavelet) har kontrollen: varning och Ta tillbaka', async ({ page }) => {
  await page.goto('/?sim=1&wavelet=1');
  await page.locator('#onoff').click();
  await setRange(page.locator('#m-bright'), 30);
  await expect(page.locator('#confirm')).toContainText('En annan app');
  await page.getByRole('button', { name: 'Ta tillbaka' }).click();
  await setRange(page.locator('#m-bright'), 40);
  await expect(page.locator('#confirm')).toContainText('hörs nu');
});

test('bypass = helt original', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.locator('#onoff').click();
  await page.getByLabel('Bypass – helt original').check();
  await expect(page.locator('#onoff')).toContainText('BYPASS');
  await page.getByLabel('Bypass – helt original').uncheck();
  await expect(page.locator('#onoff')).toContainText('MASTRAT');
});

test('på/av per del: bara kicken mjukas upp, EQ och resten av', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByLabel('Preset', { exact: true }).selectOption({ label: 'Suno-fix' });
  await page.getByRole('button', { name: 'Avancerat' }).click();
  await page.getByLabel('Pre-EQ på/av').uncheck();
  await page.getByLabel('Post-EQ på/av').uncheck();
  await page.locator('[data-sec=mbc] > summary').click({ position: { x: 20, y: 14 } });
  for (const n of ['Mellan 120 Hz–2 kHz', 'Närvaro 2–8 kHz', 'Luft 8 kHz+']) await page.getByLabel(`${n} på/av`).uncheck();
  await expect.poll(async () => (await sent(page)).mbc[3].ratio).toBe(1);
  const p = await sent(page);
  expect(p.postEq[6].gain).toBe(0);
  expect(p.preEq.every((b) => b.gain === 0)).toBe(true);
  expect(p.mbc[0].ratio).toBe(3); // kickbandet kvar
  expect(p.mbc[2].ratio).toBe(1);
  await page.getByRole('button', { name: 'Slå på allt' }).click();
  await expect.poll(async () => (await sent(page)).postEq[6].gain).toBe(-2);
});

test('på/av och −/+ på enkla reglage', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByRole('button', { name: 'Öka Ljusare' }).click();
  await expect(page.locator('#m-bright')).toHaveValue('5');
  await page.getByRole('button', { name: 'Minska Ljusare' }).click();
  await page.getByRole('button', { name: 'Minska Ljusare' }).click();
  await expect(page.locator('#m-bright')).toHaveValue('-5');
  await setRange(page.locator('#m-bright'), 100);
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(4);
  await page.getByLabel('Ljusare på/av').uncheck();
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(0);
  await expect(page.locator('[data-sl="m-bright"]')).toHaveClass(/off/);
  await expect(page.locator('#m-bright')).toHaveValue('100'); // inställningen ligger kvar
});

test('konstant utnivå: mer ingång → lägre utgång, och kurvorna följer med', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByLabel('Preset', { exact: true }).selectOption({ label: 'Transparent' });
  const before = (await sent(page)).outputGain;
  await setRange(page.locator('#m-punch'), 100);
  await expect.poll(async () => (await sent(page)).outputGain).toBeLessThan(before - 1);
  await expect(page.getByTestId('compread')).toContainText('dB');
  await page.getByText('Visa kurvor').click();
  await expect(page.locator('[data-viz=eq] svg')).toBeVisible();
  await expect(page.locator('[data-viz=comp] .mini')).toHaveCount(5);
  const curve = await page.locator('[data-viz=eq] polyline').first().getAttribute('points');
  await setRange(page.locator('#m-bright'), 100);
  await expect.poll(() => page.locator('[data-viz=eq] polyline').first().getAttribute('points')).not.toBe(curve);
  await page.getByLabel('Konstant utnivå').uncheck();
  await expect.poll(async () => (await sent(page)).outputGain).toBe(0);
});

test('hörlurskorrigering: Liberty 4 Pro inbyggd, import från AutoEq', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByLabel('Hörlurskorrigering').check();
  await expect.poll(() => page.evaluate(() => window.__simCorrection?.gains?.length)).toBe(31);
  expect(await page.evaluate(() => window.__simCorrection.name)).toBe('Soundcore Liberty 4 Pro');
  await page.getByRole('button', { name: /Soundcore Liberty 4 Pro/ }).first().click();
  await page.locator('#hp-name').fill('Testlurar');
  await page.locator('#hp-text').fill('Preamp: -3 dB\nFilter 1: ON PK Fc 1000 Hz Gain 3.0 dB Q 1.0');
  await page.getByRole('button', { name: 'Lägg till' }).click();
  await expect(page.locator('#corrmsg')).toContainText('Testlurar');
  expect(await page.evaluate(() => window.__simCorrection.preamp)).toBe(-3);
  await page.getByText('Avancerat').click();
  await expect(page.locator('[data-viz=eq]')).toContainText('Hörlurskorrigering');
});

test('profil per enhet: sparas och används när enheten ansluts', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByLabel('Preset', { exact: true }).selectOption({ label: 'Bas varm' });
  await page.getByRole('button', { name: 'Spara nuvarande' }).click();
  await expect(page.getByTestId('profile')).toContainText('Bas varm');
  const key = await page.evaluate(() => Object.keys(window.__simProfiles)[0]);
  expect(key).toContain('Liberty 4 Pro');
  // Byt preset, koppla bort och anslut hörlurarna igen → profilen tas tillbaka
  await page.getByLabel('Preset', { exact: true }).selectOption({ label: 'Rock' });
  await page.evaluate(() => window.__sim.simOutput('speaker', 'Telefonens högtalare'));
  await page.evaluate((k) => window.__sim.simOutput(k, 'Soundcore Liberty 4 Pro'), key);
  await expect(page.getByLabel('Preset', { exact: true }).locator('option:checked')).toHaveText('Bas varm');
  await expect(page.locator('#profmsg')).toContainText('Soundcore Liberty 4 Pro');
});
