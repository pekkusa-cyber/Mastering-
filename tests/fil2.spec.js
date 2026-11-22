import { test, expect } from '@playwright/test';
import { encodeWav } from '../src/dsp/wav.js';
import { block, go } from './helpers.js';

function wav(seconds = 3, { wide = false, gain = 1, seed = 7 } = {}) {
  const fs = 44100, n = seconds * fs, L = new Float32Array(n), R = new Float32Array(n);
  let s = seed, t = seed * 31 + 1;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; t = (Math.imul(t, 22695477) + 1) >>> 0;
    const kick = Math.exp(-((i % (fs / 2)) / fs) * 25) * Math.sin(2 * Math.PI * 60 * i / fs) * 0.6;
    const a = (s / 2 ** 31 - 1) * 0.1, b = wide ? (t / 2 ** 31 - 1) * 0.1 : a;
    L[i] = (kick + a) * gain; R[i] = (kick + b) * gain;
  }
  return Buffer.from(encodeWav([L, R], fs, 16));
}

const load = async (page, name = 'a.wav', buf = wav()) => {
  await block(page, 'lat');
  await page.locator('#f-file').setInputFiles({ name, mimeType: 'audio/wav', buffer: buf });
  await block(page, 'mat');
  await expect(page.getByTestId('meters')).toBeVisible({ timeout: 60000 });
  await block(page, 'lat');
};

test('direktlyssning, monokontroll och på/av för delar', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await load(page, 'brett.wav', wav(3, { wide: true }));
  await expect(page.locator('#player')).toContainText('direkt');
  await block(page, 'mat');
  await expect(page.getByTestId('mono')).toBeVisible();
  await expect(page.getByTestId('mono').locator('tr', { hasText: 'Mellan' })).toContainText('-3.0 dB');
  // S-ljud av → reglaget dämpas, inställningen ligger kvar
  await block(page, 'klang');
  await page.getByLabel('S-ljud (de-esser) på/av').uncheck();
  await expect(page.locator('[data-sl="f-deEss"]')).toHaveClass(/off/);
  await page.getByRole('button', { name: 'Slå på allt' }).click();
  await expect(page.getByLabel('S-ljud (de-esser) på/av')).toBeChecked();
  // Avancerat: sektionerna har på/av, och kurvorna finns
  await page.getByRole('button', { name: 'Avancerat' }).click();
  await expect(page.locator('[data-fviz=eq] svg')).toBeVisible();
  for (const s of ['Pre-EQ', 'Match-EQ', 'Post-EQ', 'Soft clipper', 'Lim (buss-kompressor)']) await expect(page.getByLabel(`${s} på/av`)).toBeVisible();
});

test('versioner: spara A och B och växla', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await load(page);
  await page.getByRole('button', { name: 'Spara version' }).click();
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await block(page, 'klang');
  await page.locator('#f-clip').evaluate((el) => { el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await block(page, 'lat');
  await page.getByRole('button', { name: 'Spara version' }).click();
  await page.locator('dialog.ask input').fill('Hårdare');
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await expect(page.locator('[data-version]')).toHaveCount(2);
  await page.locator('[data-version]').first().click();
  await block(page, 'klang');
  await expect(page.locator('#f-clip')).toHaveValue('1.5');
  await block(page, 'lat');
  await page.getByRole('button', { name: /Hårdare/ }).first().click();
  await block(page, 'klang');
  await expect(page.locator('#f-clip')).toHaveValue('5');
});

test('album: två låtar mastras till samma nivå och exporteras', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/?sim=1&view=fil');
  await page.locator('#a-files').setInputFiles([
    { name: 'spår1.wav', mimeType: 'audio/wav', buffer: wav(3, { gain: 1, seed: 3 }) },
    { name: 'spår2.wav', mimeType: 'audio/wav', buffer: wav(3, { gain: 0.3, seed: 9 }) },
  ]);
  await expect(page.getByTestId('album')).toContainText('spår2.wav');
  const downloads = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.getByRole('button', { name: 'Mastra och exportera alla' }).click();
  await expect(page.locator('#a-msg')).toContainText('2 av 2 låtar klara', { timeout: 120000 });
  const spread = Number((await page.locator('#a-msg').textContent()).match(/([\d.]+) LU/)[1]);
  expect(spread).toBeLessThan(1);
  await expect.poll(() => downloads.length).toBe(2);
});

test('live-mastringen pausas medan Fil spelar (ingen dubbelmastring)', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1');
  await page.locator('#onoff').click(); // live-motorn igång, mastrat
  await go(page, 'fil');
  await page.locator('#f-file').setInputFiles({ name: 'a.wav', mimeType: 'audio/wav', buffer: wav(3) });
  await block(page, 'mat');
  await expect(page.getByTestId('meters')).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Spela' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.__sim.getStatus()).bypass)).toBe(true);
  await page.getByRole('button', { name: 'Paus' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.__sim.getStatus()).bypass)).toBe(false);
});

test('spelaren överst: vågform, spela/paus, stopp och spola genom att trycka på vågen', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await load(page, 'a.wav', wav(4));
  await expect(page.locator('#f-wave svg rect')).toHaveCount(200);
  await expect(page.locator('#f-wave')).toBeInViewport({ ratio: 1 });
  // tryck i mitten av vågen: hoppar till halva låten
  const box = await page.locator('#f-wave').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#f-time')).toHaveText('0:02 / 0:04');
  await page.getByRole('button', { name: 'Spela' }).click();
  await expect(page.getByRole('button', { name: 'Paus' })).toBeVisible();
  await page.getByRole('button', { name: 'Stopp' }).click();
  await expect(page.getByRole('button', { name: 'Spela' })).toBeVisible();
  await expect(page.locator('#f-time')).toHaveText('0:00 / 0:04');
});

test('Rendera: ändringar hörs direkt men renderas först på knapptryck; export kräver färsk rendering', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await load(page, 'a.wav', wav(3));
  await expect(page.locator('#f-render-top')).not.toHaveClass(/primary/); // färsk rendering efter inladdning
  const lufs = async () => { await block(page, 'mat'); return page.getByTestId('meters').locator('tbody tr').first().locator('td').nth(2).textContent(); };
  const before = await lufs();
  await block(page, 'klang');
  await page.locator('#f-clip').evaluate((el) => { el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(2500); // inget renderas av sig självt
  await expect(page.locator('#f-render-top')).toHaveClass(/primary/);
  await expect(page.locator('.stale')).toBeVisible();
  expect(await lufs()).toBe(before);
  // Export kräver färsk rendering
  await block(page, 'export');
  await expect(page.locator('#f-export')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rendera' }).first().click();
  await expect(page.locator('#f-export')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#f-render-top')).not.toHaveClass(/primary/);
});
