import { test, expect } from '@playwright/test';
import { encodeWav, decodeWav } from '../src/dsp/wav.js';
import { measure } from '../src/dsp/loudness.js';
import { block, go } from './helpers.js';

/** En syntetisk "låt" som WAV (44,1 kHz, 16 bit): rosa brus, kick och en ton. */
function songWav(seconds = 6, fs = 44100, gain = 1) {
  const n = seconds * fs, L = new Float32Array(n), R = new Float32Array(n);
  let s = 99, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0; const w = s / 2 ** 31 - 1;
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
    const t = (i % (fs / 2)) / fs;
    const kick = Math.exp(-t * 25) * Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-t * 40)) * t) * 0.7;
    const v = ((b0 + b1 + b2 + w * 0.1848) * 0.04 + kick + 0.05 * Math.sin((2 * Math.PI * 330 * i) / fs)) * gain;
    L[i] = v; R[i] = v * 0.95;
  }
  return Buffer.from(encodeWav([L, R], fs, 16));
}

test('mastra en fil: mål, mätare, A/B och export som håller taket', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await page.locator('#f-file').setInputFiles({ name: 'min-lat.wav', mimeType: 'audio/wav', buffer: songWav(6) });
  await expect(page.getByTestId('fname')).toContainText('min-lat.wav · 0:06');
  await block(page, 'mat');
  await expect(page.getByTestId('meters')).toBeVisible({ timeout: 60000 });
  const lufs = Number((await page.getByTestId('meters').locator('tbody tr').first().locator('td').nth(1).textContent()).replace('+', ''));
  expect(Math.abs(lufs - -14)).toBeLessThan(0.6);
  const tp = Number((await page.getByTestId('meters').locator('tbody tr').nth(2).locator('td').nth(1).textContent()).replace('+', ''));
  expect(tp).toBeLessThanOrEqual(-1);

  // Hög: −10 LUFS (mastras om automatiskt)
  await block(page, 'klang');
  await page.getByRole('button', { name: 'Hög -10' }).click();
  await block(page, 'mat');
  await expect.poll(async () => Number((await page.getByTestId('meters').locator('tbody tr').first().locator('td').nth(1).textContent()).replace('+', '')), { timeout: 60000 }).toBeGreaterThan(-10.7);

  // A/B och uppspelning
  await page.getByRole('button', { name: 'A · Original' }).click();
  await expect(page.getByRole('button', { name: 'A · Original' })).toHaveClass(/sel/);
  await page.getByRole('button', { name: 'Spela' }).click();
  await expect(page.getByRole('button', { name: 'Paus' })).toBeVisible();
  await page.getByRole('button', { name: 'Paus' }).click();

  // Export: 24 bit 44,1 kHz – läs filen och kontrollera taket
  await block(page, 'export');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportera WAV' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toContain('master 24bit 44k');
  const fs = await import('node:fs');
  const wav = decodeWav(fs.readFileSync(await d.path()).buffer);
  expect(wav.fs).toBe(44100);
  expect(wav.bits).toBe(24);
  const m = measure(wav.channels, wav.fs);
  expect(m.truePeak).toBeLessThanOrEqual(-0.95); // dither kan lägga till högst 1 LSB
});

test('↺ per parameter, Återställ alla och info i filmastringen', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await page.locator('#f-file').setInputFiles({ name: 'a.wav', mimeType: 'audio/wav', buffer: songWav(3) });
  await block(page, 'mat');
  await expect(page.getByTestId('meters')).toBeVisible({ timeout: 60000 });
  await block(page, 'klang');
  await page.getByRole('button', { name: 'Avancerat' }).click();
  const n = await page.locator('#fcontrols .sl').count();
  expect(n).toBeGreaterThan(50);
  await expect(page.locator('#fcontrols .sl .rst')).toHaveCount(n);
  await expect(page.locator('#fcontrols .sl .i')).toHaveCount(n);
  await page.getByRole('button', { name: 'Enkelt' }).click();
  await page.locator('#f-clip').evaluate((el) => { el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-reset="f-clip"]').click();
  await expect(page.locator('#f-clip')).toHaveValue('1.5');
  await page.locator('[data-sl="f-kickPunch"] .i').click();
  await expect(page.locator('dialog.sheet')).toContainText('Transient shaper');
});

test('matcha klang mot en referensfil', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&mic=1&view=analys');
  await block(page, 'referenser');
  await page.locator('#ref-audio').setInputFiles({ name: 'referens.wav', mimeType: 'audio/wav', buffer: songWav(4) });
  await expect(page.locator('#refmsg')).toContainText('"referens" sparad som referens');
  await go(page, 'fil');
  await page.locator('#f-file').setInputFiles({ name: 'egen.wav', mimeType: 'audio/wav', buffer: songWav(4, 44100, 0.5) });
  await block(page, 'klang');
  await expect(page.getByTestId('fverdict')).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Matcha klang mot referensen' }).click();
  await expect(page.locator('[data-sec="f-match"]')).toBeVisible();
  await block(page, 'mat');
  await expect(page.getByTestId('meters')).toBeVisible({ timeout: 60000 });
});

test('i en vanlig webbläsare öppnas Fil direkt (live kräver Android)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Fil');
  await go(page, 'live');
  await expect(page.getByText('finns bara i Android-appen')).toBeVisible();
});
