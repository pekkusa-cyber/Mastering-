// Hjälp för Fil-testerna: syntetiska låtar och att läsa in en låt i det nya flödet.
import { expect } from '@playwright/test';
import { encodeWav } from '../src/dsp/wav.js';

/** En syntetisk "låt" som WAV: kick och brus (wide = olika brus i vänster/höger). */
export function wav(seconds = 3, { wide = false, gain = 1, seed = 7, fs = 44100 } = {}) {
  const n = seconds * fs, L = new Float32Array(n), R = new Float32Array(n);
  let s = seed, t = seed * 31 + 1;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; t = (Math.imul(t, 22695477) + 1) >>> 0;
    const kick = Math.exp(-((i % (fs / 2)) / fs) * 25) * Math.sin(2 * Math.PI * 60 * i / fs) * 0.6;
    const a = (s / 2 ** 31 - 1) * 0.1, b = wide ? (t / 2 ** 31 - 1) * 0.1 : a;
    L[i] = (kick + a + 0.04 * Math.sin(2 * Math.PI * 330 * i / fs)) * gain; R[i] = (kick + b + 0.04 * Math.sin(2 * Math.PI * 330 * i / fs)) * gain;
  }
  return Buffer.from(encodeWav([L, R], fs, 16));
}

/** Läser in en låt (överst om ingen låt finns, annars via Låt-menyn) och väntar tills första renderingen är klar. */
export async function loadSong(page, name = 'a.wav', buffer = wav()) {
  const file = { name, mimeType: 'audio/wav', buffer };
  if (await page.locator('#f-file').count()) await page.locator('#f-file').setInputFiles(file);
  else { await page.locator('#f-song').click(); await page.locator('#f-file2').setInputFiles(file); }
  await expect(page.locator('#f-render-top')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#f-render-top')).not.toHaveClass(/primary/, { timeout: 60000 });
  await expect(page.locator('#f-render-top')).toBeEnabled({ timeout: 60000 });
}

export const setRange = (loc, v) => loc.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
/** Värdet i mätartabellen (rad, kolumn 1 = original, 2 = mastrad). */
export const meterValue = async (page, row, col = 2) => Number((await page.getByTestId('meters').locator('tbody tr').nth(row).locator('td').nth(col - 1).textContent()).replace('+', ''));
