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
  await expect(page.locator('#f-clip')).toHaveValue('0'); // Version A sparades orörd
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
  await expect(page.locator('#f-clip')).toHaveValue('0');
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

test('Fil spelar: Masterlab-knappen i rubriken är spärrad så att låten inte mastras två gånger', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1');
  await page.locator('#onoff').click(); // Live-mastringen på
  await go(page, 'fil');
  await loadSong(page, 'a.wav', wav(3));
  await page.getByRole('button', { name: 'Spela' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.__sim.getStatus()).bypass)).toBe(true);
  const masterlab = page.locator('label.rb:has(#masterlab)');
  await expect(masterlab).toHaveClass(/locked/);
  await expect(page.locator('#masterlab')).toBeDisabled();
  await masterlab.click({ force: true }); // försöker slå på ändå
  await expect.poll(() => page.evaluate(async () => (await window.__sim.getStatus()).bypass)).toBe(true);
  // paus släpper spärren och Live-mastringen kommer tillbaka
  await page.getByRole('button', { name: 'Paus' }).click();
  await expect(page.locator('#masterlab')).toBeEnabled();
  await expect.poll(() => page.evaluate(async () => (await window.__sim.getStatus()).bypass)).toBe(false);
});

test('en ny låt öppnas helt orörd: ingen preset, ingen bearbetning, inget att ångra', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'a.wav');
  await expect(page.locator('#f-preset')).toHaveText(/Ingen preset/);
  await expect(page.locator('#f-kickPunch')).toHaveValue('0');
  await page.locator('#f-preset').click();
  await page.locator('dialog.sheet').getByRole('option', { name: /Suno-fix/ }).click();
  await expect(page.locator('#f-preset')).toHaveText(/Suno-fix/);
  await expect(page.locator('#f-undo')).toBeEnabled();
  await loadSong(page, 'b.wav', wav(3, { seed: 3 }));
  await expect(page.locator('#f-preset')).toHaveText(/Ingen preset/);
  await expect(page.locator('#f-kickPunch')).toHaveValue('0');
  await expect(page.locator('#f-deEss')).toHaveValue('0');
  await expect(page.locator('#f-undo')).toBeDisabled();
});

test('versionerna hör till låten: en annan låt visar inte den förras versioner', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page, 'a.wav');
  await page.locator('#f-song').click();
  await page.getByRole('button', { name: /Jämför versioner/ }).click();
  await page.getByRole('button', { name: '+ Ny version' }).click();
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await expect(page.locator('[data-cslot]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Stäng' }).first().click();
  await loadSong(page, 'b.wav', wav(3, { seed: 3 }));
  await page.locator('#f-song').click();
  await page.getByRole('button', { name: /Jämför versioner/ }).click();
  await expect(page.locator('[data-cslot]')).toHaveCount(1); // bara Original
});

test('huvudpreset i raden överst: syns i alla block och sätter hela kedjan på en gång', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page);
  await block(page, 'lim');
  await expect(page.locator('#f-preset')).toBeVisible();
  await page.locator('#f-preset').click();
  await page.locator('dialog.sheet').getByRole('option', { name: /Suno-fix/ }).click();
  await expect(page.locator('#f-preset')).toContainText('Suno-fix');
  await expect(page.locator('#f-clip')).toHaveValue('1.5'); // limiterblocket
  await block(page, 'quick');
  await expect(page.locator('#f-deEss')).not.toHaveValue('0'); // och Snabb
  await expect(page.locator('#spanel')).toContainText('Preset: Suno-fix');
});

test('popup med snurra och förlopp när en låt läses in och när den renderas', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await page.evaluate(() => {
    window.__busy = [];
    new MutationObserver(() => { const p = document.querySelector('#fbusy p'); if (p && window.__busy.at(-1) !== p.textContent) window.__busy.push(p.textContent); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await loadSong(page, 'popup.wav');
  await expect(page.locator('#fbusy')).toHaveCount(0); // stängs när allt är klart
  let seen = await page.evaluate(() => window.__busy);
  expect(seen.some((t) => t.startsWith('Läser in popup.wav'))).toBe(true);
  expect(seen.some((t) => t.startsWith('Renderar'))).toBe(true);
  await page.evaluate(() => { window.__busy = []; });
  await page.locator('#f-render-top').click();
  await expect.poll(() => page.evaluate(() => window.__busy.some((t) => t.startsWith('Renderar'))), { timeout: 60000 }).toBe(true);
  await expect(page.locator('#fbusy')).toHaveCount(0, { timeout: 60000 });
});

test('presetsen skiljer sig i Färg och Limiter, och Färg/Limiter har egna delpresets', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page);
  const choose = async (sel, name) => { await page.locator(sel).click(); await page.locator('dialog.sheet').getByRole('option', { name: new RegExp(name) }).first().click(); };
  await choose('#f-preset', 'Silkeslen röst');
  await block(page, 'farg');
  await expect(page.locator('#f-deEss')).toHaveValue('50');
  await block(page, 'lim');
  await expect(page.locator('#f-clip')).toHaveValue('0.5');
  await choose('#f-preset', 'Gym');
  await expect(page.locator('#f-clip')).toHaveValue('4');
  await block(page, 'farg');
  await expect(page.locator('#f-deEss')).toHaveValue('25');
  // Delpreset: bara Färg byts, limitern ligger kvar
  await choose('#fmod-farg', 'Jazz');
  await expect(page.locator('#f-deEss')).toHaveValue('10');
  await block(page, 'lim');
  await expect(page.locator('#f-clip')).toHaveValue('4');
  await choose('#fmod-lim', 'Akustisk');
  await expect(page.locator('#f-clip')).toHaveValue('0');
});

test('varje reglage i Fil gör sitt jobb: ändrar det som spelas (alla block och flikar)', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/?sim=1&view=fil');
  await loadSong(page);
  const fp = () => page.evaluate(() => JSON.stringify(window.__filParams));
  const views = [['quick'], ['in'], ['eq1', '[data-feq1="graphic"]'], ['eq1', '[data-feq1="match"]'], ['comp', '[data-fcomp="all"]'],
    ...[0, 1, 2, 3].map((i) => ['comp', `[data-fcomp="${i}"]`]), ['eq2', '[data-feq2="graphic"]'], ...[0, 1, 2, 3, 4].map((i) => ['eq2', `[data-feq2="${i}"]`]),
    ...['deEss', 'glitter', 'width', 'glue'].map((k) => ['farg', `[data-ffarg="${k}"]`]), ['lim'], ['out']];
  const dead = [];
  let n = 0;
  for (const [b, sel] of views) {
    await block(page, b);
    if (sel) await page.locator(sel).click();
    const ids = await page.locator('#spanel input[type=range][data-kind]:not([data-kind="amount"])').evaluateAll((els) => els.map((e) => e.id));
    for (const id of ids) {
      const el = page.locator(`#${id}`);
      const before = await fp();
      const [min, max, val] = await el.evaluate((e) => [Number(e.min), Number(e.max), Number(e.value)]);
      await setRange(el, val - min > max - val ? min + (max - min) * 0.1 : max - (max - min) * 0.1);
      try { await expect.poll(fp, { timeout: 2000 }).not.toBe(before); } catch { dead.push(`${b}${sel || ''} ${id}`); }
      n++;
    }
  }
  expect(n).toBeGreaterThan(60);
  expect(dead, 'reglage som inte ändrar något').toEqual([]);
});

test('✨ Auto: från startsidan (välj låt → klart) och med knappen bredvid huvudpresetten', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/?sim=1&view=fil');
  await page.locator('#f-file-auto').setInputFiles({ name: 'auto.wav', mimeType: 'audio/wav', buffer: wav(4, { wide: true }) });
  const res = page.locator('dialog[open]').filter({ hasText: 'Automastring klar' });
  await expect(res).toBeVisible({ timeout: 90000 });
  await expect(res.getByTestId('autoactions')).toContainText('Grund: Suno-fix');
  await expect(res).toContainText('LUFS');
  await res.getByRole('button', { name: 'Lyssna' }).click();
  await expect(page.locator('#f-preset')).toContainText('Suno-fix');
  // Igen med stil Reggae och Kraftig
  await page.locator('#f-auto').click();
  const s = page.locator('dialog[open]').filter({ hasText: '✨ Automastra' });
  await s.locator('[data-astyle="reggae"]').click();
  await s.locator('[data-av="kraftig"]').click();
  await s.locator('#f-auto-go').click();
  await expect(page.locator('dialog[open]').filter({ hasText: 'Automastring klar' })).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#f-preset')).toContainText('Reggae');
  // Ångra tar tillbaka Suno-fix
  await page.locator('#f-auto-undo').click();
  await expect(page.locator('#f-preset')).toContainText('Suno-fix');
});

test('Auto → ⚖ Spara och jämför: versionen sparas och Jämför öppnas med Original + versionen', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/?sim=1&view=fil');
  await page.locator('#f-file-auto').setInputFiles({ name: 'jamfor.wav', mimeType: 'audio/wav', buffer: wav(4, { wide: true }) });
  const res = page.locator('dialog[open]').filter({ hasText: 'Automastring klar' });
  await expect(res).toBeVisible({ timeout: 90000 });
  await res.locator('#f-auto-cmp').click();
  await expect(page.locator('[data-cslot]')).toHaveCount(2); // Original + Auto
  await expect(page.locator('[data-cslot]').nth(1)).toContainText('Auto');
  // Kör Auto igen med Kraftig och spara – nu tre
  await page.locator('#f-mode-exit').click();
  await page.locator('#f-auto').click();
  const s = page.locator('dialog[open]').filter({ hasText: '✨ Automastra' });
  await s.locator('[data-av="kraftig"]').click(); await s.locator('#f-auto-go').click();
  const r2 = page.locator('dialog[open]').filter({ hasText: 'Automastring klar' });
  await expect(r2).toBeVisible({ timeout: 90000 });
  await r2.locator('#f-auto-cmp').click();
  await expect(page.locator('[data-cslot]')).toHaveCount(3);
});
