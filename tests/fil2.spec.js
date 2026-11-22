import { test, expect } from '@playwright/test';
import { block, go } from './helpers.js';
import { wav, loadSong, setRange } from './filhelp.js';

test('på/av, solo på en del och M/S på ett band (bara i lyssningen)', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'brett.wav', wav(3, { wide: true }));
  await block(page, 'quick');
  await page.getByLabel('S-ljud (de-esser) på/av').uncheck();
  await expect(page.locator('[data-sl="f-deEss"]')).toHaveClass(/off/);
  await block(page, 'out');
  await page.getByRole('button', { name: 'Slå på allt' }).click();
  await block(page, 'quick');
  await expect(page.getByLabel('S-ljud (de-esser) på/av')).toBeChecked();
  // Solo på en hel del
  await page.locator('[data-sl="f-clip"] .solo').click();
  await expect(page.getByTestId('listenbar')).toContainText('Solo: Soft clip');
  // M/S på ett band i EQ 1
  await block(page, 'eq1');
  await page.locator('[data-fasolo="preEq:3"]').click();
  await expect(page.getByTestId('listenbar')).toContainText('Bara EQ 1 250–500 Hz');
  await page.locator('[data-famute="preEq:3"]').click();
  await expect(page.getByTestId('listenbar')).toContainText('Utan EQ 1 250–500 Hz');
  await page.getByRole('button', { name: 'Avsluta lyssningsläge' }).click();
  await expect(page.getByTestId('listenbar')).toHaveCount(0);
  // Δ på de-essern
  await block(page, 'farg');
  await page.locator('#f-delta').click();
  await expect(page.getByTestId('listenbar')).toContainText('Δ S-ljud');
});

test('Lyssna: mobil, mono och loop; mono-kontrollen finns i Export', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'brett.wav', wav(3, { wide: true }));
  await page.locator('#f-listen').click();
  await page.locator('[data-lseg="sim"] [data-lv="mobil"]').click();
  await page.locator('[data-lseg="mono"] [data-lv="on"]').click();
  await page.locator('dialog.listensheet').getByRole('button', { name: 'Stäng' }).click();
  await expect(page.getByTestId('listenbar')).toContainText('Mono');
  await expect(page.getByTestId('listenbar')).toContainText('Som mobil');
  await page.locator('#f-loop').click();
  await expect(page.locator('#f-wave .loop')).toHaveCount(1);
  await page.locator('#f-exportbtn').click();
  await expect(page.getByTestId('mono').locator('tr', { hasText: 'Mellan' })).toContainText(/-\d+\.\d dB/); // brett ljud tappar i mono
});

test('Jämför: versioner, blindtest och Behåll', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page);
  await page.locator('#f-song').click();
  await page.getByRole('button', { name: /Jämför versioner/ }).click();
  await page.getByRole('button', { name: '+ Ny version' }).click();
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await page.getByRole('button', { name: 'Stäng' }).first().click(); // tillbaka till blocken
  await block(page, 'quick');
  await setRange(page.locator('#f-clip'), 5);
  await page.locator('#f-song').click();
  await page.getByRole('button', { name: /Jämför versioner/ }).click();
  await page.getByRole('button', { name: '+ Ny version' }).click();
  await page.locator('dialog.ask input').fill('Hårdare');
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await expect(page.locator('[data-cslot]')).toHaveCount(3); // Original + 2
  await page.getByRole('button', { name: 'Blindtest 🎲' }).click();
  await expect(page.locator('[data-cslot]').first()).toContainText('? 1');
  await page.getByRole('button', { name: 'Visa vilken det var' }).click();
  await page.locator('[data-cslot]', { hasText: 'Version A' }).click();
  await page.getByRole('button', { name: /Behåll/ }).click();
  await block(page, 'quick');
  await expect(page.locator('#f-clip')).toHaveValue('1.5');
});

test('Assistent: låt → mål → förslag → finjustera', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await page.getByRole('button', { name: /Assistent/ }).click();
  await expect(page.locator('.steps5 .cur')).toContainText('Låt');
  await page.locator('#f-file').setInputFiles({ name: 'a.wav', mimeType: 'audio/wav', buffer: wav(3) });
  await expect(page.locator('[data-astep="2"]')).toBeEnabled({ timeout: 60000 });
  await page.locator('[data-astep="2"]').click();
  await page.getByRole('button', { name: 'Hög -10' }).click();
  await page.locator('[data-astep="3"]').click();
  await expect(page.locator('[data-apick]')).toHaveCount(4);
  await page.locator('[data-apick="C"]').click();
  await page.locator('[data-astep="4"]').click();
  await block(page, 'quick');
  await expect(page.locator('#f-clip')).toHaveValue('3'); // C · Kraftig
});

test('autosparning: låten och inställningarna finns kvar efter omstart', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'sparad.wav', wav(3));
  await expect(page.locator('#f-saved')).toHaveText('✓'); // sparad på telefonen
  await block(page, 'quick');
  await setRange(page.locator('#f-clip'), 4);
  await page.waitForTimeout(800); // sparas lite fördröjt
  await page.goto('/?sim=1&view=fil');
  await expect(page.locator('#f-song')).toContainText('sparad', { timeout: 60000 });
  await expect(page.locator('#f-render-top')).toBeVisible({ timeout: 60000 });
  await block(page, 'quick');
  await expect(page.locator('#f-clip')).toHaveValue('4');
});

test('Ångra i Fil och Skicka till Fil från Live', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page);
  await block(page, 'quick');
  await setRange(page.locator('#f-clip'), 5);
  await page.getByRole('button', { name: '↶ Ångra i Fil' }).click();
  await expect(page.locator('#f-clip')).toHaveValue('1.5');
  await go(page, 'live');
  await page.getByRole('button', { name: 'Hantera presets' }).click();
  await page.getByRole('button', { name: /Skicka till Fil/ }).click();
  await expect(page.locator('h1')).toHaveText('Fil');
  await expect(page.locator('#f-fromlive')).toContainText('från Live');
});

test('Mätare i grafen och Rendera: ändringar hörs direkt, export kräver färsk rendering', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'a.wav', wav(3));
  await page.locator('[data-fgraph="meter"]').click();
  await expect(page.getByTestId('livemeters')).toBeVisible();
  await block(page, 'quick');
  await setRange(page.locator('#f-clip'), 5);
  await page.waitForTimeout(1500); // inget renderas av sig självt
  await expect(page.locator('#f-render-top')).toHaveClass(/primary/);
  await page.locator('#f-exportbtn').click();
  await expect(page.locator('#f-export')).toHaveCount(0);
  await page.locator('#f-render-exp').click();
  await expect(page.locator('#f-export')).toBeVisible({ timeout: 60000 });
});

test('spelaren: vågform, spela/paus, stopp och spola genom att trycka på vågen', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'a.wav', wav(4));
  await expect(page.locator('#f-wave svg rect')).toHaveCount(200);
  const box = await page.locator('#f-wave').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#f-time')).toHaveText('0:02 / 0:04');
  await page.getByRole('button', { name: 'Spela' }).click();
  await expect(page.getByRole('button', { name: 'Paus' })).toBeVisible();
  await page.getByRole('button', { name: 'Stopp' }).click();
  await expect(page.getByRole('button', { name: 'Spela' })).toBeVisible();
  await expect(page.locator('#f-time')).toHaveText('0:00 / 0:04');
});

test('live-mastringen pausas medan Fil spelar (ingen dubbelmastring)', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1');
  await page.locator('#onoff').click();
  await go(page, 'fil');
  await loadSong(page, 'a.wav', wav(3));
  await page.getByRole('button', { name: 'Spela' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.__sim.getStatus()).bypass)).toBe(true);
  await page.getByRole('button', { name: 'Paus' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.__sim.getStatus()).bypass)).toBe(false);
});

test('album: två låtar mastras till samma nivå och exporteras', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/?sim=1&view=fil');
  await page.locator('#f-song').click();
  await page.getByRole('button', { name: /Album/ }).click();
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
