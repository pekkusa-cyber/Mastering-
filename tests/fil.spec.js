import { test, expect } from '@playwright/test';
import { decodeWav } from '../src/dsp/wav.js';
import { measure } from '../src/dsp/loudness.js';
import { block, go } from './helpers.js';
import { wav, loadSong, setRange, meterValue } from './filhelp.js';

test('Fil i samma flöde som Live: block i ljudets ordning, mål, mätare, A/B och export som håller taket', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await expect(page.locator('.blk b')).toHaveText(['Snabb', 'In', 'EQ 1', 'Kompr.', 'EQ 2', 'Färg', 'Limiter', 'Ut']);
  await loadSong(page, 'min-lat.wav', wav(6));
  await expect(page.locator('#f-song')).toContainText('min-lat');
  await block(page, 'out');
  expect(Math.abs(await meterValue(page, 0) - -14)).toBeLessThan(0.6);
  expect(await meterValue(page, 2)).toBeLessThanOrEqual(-1);
  // Hög: −10 LUFS – hörs direkt, mätarna uppdateras när man trycker Rendera
  await page.getByRole('button', { name: 'Hög -10' }).click();
  await expect(page.locator('.stale').first()).toBeVisible();
  await page.locator('#f-render-top').click();
  await expect.poll(() => meterValue(page, 0), { timeout: 60000 }).toBeGreaterThan(-10.7);
  // A/B och uppspelning
  await page.locator('#f-ab').click();
  await expect(page.locator('#f-ab')).toHaveAttribute('aria-pressed', 'false'); // A · Original
  await page.locator('#f-ab').click();
  await page.getByRole('button', { name: 'Spela' }).click();
  await expect(page.getByRole('button', { name: 'Paus' })).toBeVisible();
  await page.getByRole('button', { name: 'Paus' }).click();
  // Export (24 bit 44,1 kHz) – läs filen och kontrollera taket
  await page.locator('#f-exportbtn').click();
  await expect(page.getByTestId('exportchecks')).toContainText('under taket');
  const download = page.waitForEvent('download');
  await page.locator('#f-export').click();
  const d = await download;
  expect(d.suggestedFilename()).toContain('master 24bit 44k');
  const fs = await import('node:fs');
  const w = decodeWav(fs.readFileSync(await d.path()).buffer);
  expect(w.fs).toBe(44100);
  expect(w.bits).toBe(24);
  expect(measure(w.channels, w.fs).truePeak).toBeLessThanOrEqual(-0.95);
});

test('reglagen: vågräta med ↺ och ⓘ, EQ lodrät med M/S per band, Hela låten i kompressorn', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'a.wav', wav(3));
  await block(page, 'quick');
  await expect(page.locator('#spanel .sl:not(.vf)')).toHaveCount(6);
  await expect(page.locator('#spanel .sl .rst')).toHaveCount(6);
  await expect(page.locator('#spanel .solo')).toHaveCount(6);
  await setRange(page.locator('#f-clip'), 5);
  await page.locator('[data-reset="f-clip"]').click();
  await expect(page.locator('#f-clip')).toHaveValue('1.5');
  await page.locator('[data-sl="f-kickPunch"] .i').click();
  await expect(page.locator('dialog.sheet')).toContainText('Transient shaper');
  await page.locator('dialog.sheet').getByRole('button', { name: 'Stäng' }).click();
  // EQ 1: åtta lodräta band med M/S, Match-EQ tio
  await block(page, 'eq1');
  await expect(page.locator('#spanel .sl.vf')).toHaveCount(8);
  await expect(page.locator('#spanel [data-fasolo]')).toHaveCount(8);
  await page.locator('[data-feq1="match"]').click();
  await expect(page.locator('#spanel .sl.vf')).toHaveCount(10);
  // Match-EQ:s tio fadrar står i en rad (inte en kolumn)
  const boxes = await page.locator('#spanel .sl.vf').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(5);
  // EQ 2 har de fem EQ-punkterna
  await block(page, 'eq2');
  await page.locator('[data-feq2="2"]').click();
  await expect(page.locator('#f-peq-2-freq')).toHaveCount(1);
  // Kompressorn: Hela låten sätter alla fyra band
  await block(page, 'comp');
  await setRange(page.locator('#f-mbcall-ratio'), 3);
  await page.locator('[data-fcomp="2"]').click();
  await expect(page.locator('#f-mbc-2-ratio')).toHaveValue('3');
});

test('matcha klang mot en referensfil', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&mic=1&view=analys');
  await block(page, 'referenser');
  await page.locator('#ref-audio').setInputFiles({ name: 'referens.wav', mimeType: 'audio/wav', buffer: wav(4) });
  await expect(page.locator('#refmsg')).toContainText('"referens" sparad som referens');
  await go(page, 'fil');
  await loadSong(page, 'egen.wav', wav(4, { gain: 0.5, seed: 3 }));
  await block(page, 'eq1');
  await page.locator('[data-feq1="ref"]').click();
  await expect(page.getByTestId('fverdict')).toBeVisible();
  await page.getByRole('button', { name: 'Matcha klang mot referensen' }).click();
  await expect(page.locator('[data-feq1="match"]')).toHaveClass(/sel/);
  await expect(page.locator('#spanel .sl.vf')).toHaveCount(10);
});

test('i en vanlig webbläsare öppnas Fil direkt (live kräver Android)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Fil');
  await go(page, 'live');
  await expect(page.getByText('finns bara i Android-appen')).toBeVisible();
});
