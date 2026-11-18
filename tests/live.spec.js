import { test, expect } from '@playwright/test';

const sent = (page) => page.evaluate(() => window.__simParams);
const setRange = (loc, v) => loc.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));

test('utan Android och utan simulator förklaras att live bara finns i appen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Live-bearbetningen finns bara i Android-appen')).toBeVisible();
});

test('stora knappen växlar mellan mastrat och original och startar motorn', async ({ page }) => {
  await page.goto('/?sim=1');
  const btn = page.locator('#onoff');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('motor')).toContainText('stoppad');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn).toContainText('PÅ');
  await expect(page.getByTestId('motor')).toContainText('global session');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(btn).toContainText('ORIGINAL');
});

test('vald preset skickas till motorn med alla band', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect.poll(async () => (await sent(page))?.mbc?.length).toBe(4);
  let p = await sent(page);
  expect(p.preEq).toHaveLength(8);
  expect(p.mbc[0]).toMatchObject({ cutoff: 120, threshold: -24, ratio: 4 }); // Mjuk kick
  await page.getByLabel('Preset').selectOption({ label: 'Radio ljus' });
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(3);
  p = await sent(page);
  expect(p.limiter.ratio).toBe(20);
});

test('enkla reglage ändrar kedjan och visar (ändrad)', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect(page.locator('#dirty')).toBeHidden();
  await setRange(page.locator('#m-bright'), 100);
  await expect(page.locator('#dirty')).toBeVisible();
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(4);
  await page.getByRole('button', { name: 'Nollställ reglagen' }).click();
  await expect(page.locator('#dirty')).toBeHidden();
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(0);
});

test('avancerat läge visar hela kedjan och bakar in de enkla reglagen', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-punch'), 50); // +3 dB in
  await page.getByRole('button', { name: 'Avancerat' }).click();
  await expect(page.locator('#p-inputGain')).toHaveValue('6'); // Mjuk kick 3 dB + 3 dB
  await page.getByText('Multiband-kompressor').click();
  await page.getByText('Kick 0–120 Hz').click();
  await setRange(page.locator('#p-mbc-0-ratio'), 8);
  await expect.poll(async () => (await sent(page)).mbc[0].ratio).toBe(8);
  await page.getByText('Limiter', { exact: true }).click();
  await setRange(page.locator('#p-limiter-threshold'), -3);
  await expect.poll(async () => (await sent(page)).limiter.threshold).toBe(-3);
  for (const label of ['Tröskel', 'Ratio', 'Attack', 'Release', 'Knä', 'Förstärkning före', 'Förstärkning efter']) {
    await expect(page.locator('details.band[open]').getByText(label, { exact: true })).toBeVisible();
  }
  // Läget och värdena finns kvar efter omstart av appen
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('.seg .sel')).toHaveText('Avancerat');
  await expect.poll(async () => (await sent(page))?.mbc?.[0]?.ratio).toBe(8);
});

test('spara, döp om, ta bort, exportera och importera presets', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-kick'), 40);
  await page.getByRole('button', { name: 'Spara som…' }).click();
  await page.locator('dialog.ask input').fill('Kvällsmix');
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await expect(page.locator('#msg')).toHaveText('Sparad som "Kvällsmix".');
  await expect(page.getByLabel('Preset')).toHaveValue(/^u-/);
  await expect(page.locator('#dirty')).toBeHidden();

  await page.getByRole('button', { name: 'Döp om' }).click();
  await page.locator('dialog.ask input').fill('Nattmix');
  await page.locator('dialog.ask').getByRole('button', { name: 'Döp om' }).click();
  await expect(page.getByLabel('Preset').locator('option:checked')).toHaveText('Nattmix');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportera' }).click();
  const file = await (await download).path();

  await page.getByRole('button', { name: 'Ta bort' }).click();
  await page.locator('dialog.ask').getByRole('button', { name: 'Ta bort' }).click();
  await expect(page.locator('#msg')).toHaveText('"Nattmix" borttagen.');
  await expect(page.getByLabel('Preset').locator('optgroup[label="Mina"]')).toHaveCount(0);

  await page.locator('#p-import').setInputFiles(file);
  await expect(page.locator('#msg')).toHaveText('1 presets importerade.');
  await expect(page.getByLabel('Preset').locator('optgroup[label="Mina"] option')).toHaveText(['Nattmix']);

  await page.locator('#p-import').setInputFiles({ name: 'trasig.json', mimeType: 'application/json', buffer: Buffer.from('inte json') });
  await expect(page.locator('#msg')).toHaveText('Filen är inte giltig JSON.');
});

test('utgångsnivå och automatisk nivåmatchning', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.locator('#onoff').click();
  await page.getByRole('button', { name: 'Auto-nivåmatcha' }).click();
  await expect(page.locator('#levelmsg')).toContainText('Mikrofonbehörighet krävs');
  await page.getByRole('button', { name: 'Behörigheter' }).click();
  await page.locator('[data-perm="microphone"]').getByRole('button', { name: 'Tillåt' }).click();
  await expect(page.locator('[data-perm="microphone"]')).toContainText('klart');
  await page.getByRole('button', { name: 'Live' }).click();
  await page.getByRole('button', { name: 'Auto-nivåmatcha' }).click();
  await expect(page.locator('#levelmsg')).toContainText('justerad');
  await expect(page.locator('#p-outputGain')).toHaveValue('-2.5');
  await expect.poll(async () => (await sent(page)).outputGain).toBe(-2.5);
});

test('behörighetsvyn: tillåt allt och bevilja DUMP med Shizuku', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByRole('button', { name: 'Behörigheter' }).click();
  for (const [id, name] of [['notifications', 'Tillåt'], ['battery', 'Undanta'], ['microphone', 'Tillåt']]) {
    await page.locator(`[data-perm="${id}"]`).getByRole('button', { name }).click();
    await expect(page.locator(`[data-perm="${id}"]`)).toContainText('klart');
  }
  await expect(page.locator('[data-perm="dump"]')).toContainText('saknas');
  await expect(page.locator('#cmd')).toHaveText('adb shell pm grant se.foric.masterlab android.permission.DUMP');
  await page.getByRole('button', { name: 'Bevilja med Shizuku' }).click();
  await expect(page.locator('#msg')).toHaveText('Sessionsdetekteringen är beviljad.');
  await expect(page.locator('[data-perm="dump"]')).toContainText('klart');
  await page.getByRole('button', { name: 'Hjälp' }).click();
  await expect(page.locator('#help')).toContainText('Shizuku – så gör du');
});

test('Shizuku som inte är igång ger en tydlig förklaring', async ({ page }) => {
  await page.goto('/?sim=1&shizuku=0');
  await page.getByRole('button', { name: 'Behörigheter' }).click();
  await expect(page.locator('[data-perm="dump"]')).toContainText('inte installerad');
  await expect(page.getByRole('button', { name: 'Installera Shizuku' })).toBeVisible();
  await page.getByRole('button', { name: 'Bevilja med Shizuku' }).click();
  await expect(page.locator('#msg')).toContainText('Shizuku är inte igång');
});

test('global session förvald; enskilda appar får ingen dubbel effekt', async ({ page }) => {
  await page.goto('/?sim=1&dump=1');
  await page.locator('#onoff').click();
  await page.locator('#debug summary').click();
  await expect(page.locator('[data-session="0"]')).toContainText('kopplad, PÅ');
  await expect(page.locator('[data-session="2345"]')).toContainText('via global');
  await page.getByRole('button', { name: 'Behörigheter' }).click();
  await expect(page.locator('[data-perm="global"]')).toContainText('klart');
  await page.getByLabel('Använd global session').uncheck();
  await expect(page.locator('[data-perm="global"]')).toContainText('Avslagen');
  await page.getByRole('button', { name: 'Live' }).click();
  await page.locator('#debug summary').click();
  await expect(page.locator('[data-session="2345"]')).toContainText('kopplad, PÅ');
});

test('global session som inte fungerar visar felet', async ({ page }) => {
  await page.goto('/?sim=1&global=0');
  await page.locator('#onoff').click();
  await page.locator('#debug summary').click();
  await expect(page.locator('[data-session="0"]')).toContainText('UnsupportedOperationException');
  await page.getByRole('button', { name: 'Kopiera felsökningsrapport' }).click();
  await expect(page.getByText('Kopierad – klistra in')).toBeVisible();
});

test('hjälptexten för Live öppnas och stängs', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByRole('button', { name: 'Hjälp' }).click();
  await expect(page.locator('#help')).toContainText('Nivåmatcha');
  await page.getByRole('button', { name: 'Stäng' }).click();
  await expect(page.locator('#help')).not.toBeVisible();
});
