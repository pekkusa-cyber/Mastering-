import { test, expect } from '@playwright/test';
import { pick, picked, openGroup, openSettings, block } from './helpers.js';

const sent = (page) => page.evaluate(() => window.__simParams);
const setRange = (loc, v) => loc.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));

test('stora knappen växlar mellan mastrat och original och startar motorn', async ({ page }) => {
  await page.goto('/?sim=1');
  const btn = page.locator('#onoff');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mode')).toHaveText('MASTRAT');
  await expect(page.getByTestId('motor')).toContainText('allt ljud');
  await btn.click();
  await expect(page.getByTestId('mode')).toHaveText('ORIGINAL');
});

test('vald preset skickas till motorn med alla band, och det finns minst 16 presets', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect.poll(async () => (await sent(page))?.mbc?.length).toBe(4);
  expect((await sent(page)).mbc[0]).toMatchObject({ cutoff: 120, threshold: -24, ratio: 4 });
  await page.getByRole('button', { name: 'Preset', exact: true }).click();
  expect(await page.locator('dialog.sheet [role=option]').count()).toBeGreaterThanOrEqual(30);
  await expect(page.locator('dialog.sheet [role=option][aria-selected=true]')).toContainText('Mjuk kick');
  await page.locator('dialog.sheet').getByRole('button', { name: 'Avbryt' }).click();
  await pick(page, 'Preset', 'Suno-fix');
  await page.getByRole('button', { name: 'Hantera presets' }).click();
  await expect(page.locator('#pdesc')).toContainText('Suno');
  await page.locator('dialog.sheet').getByRole('button', { name: 'Stäng' }).click();
  await expect.poll(async () => (await sent(page)).postEq[6].gain).toBe(-2);
});

test('Snabb: varje fader har ⓘ, M och S, dubbeltryck nollställer, och Återställ alla nollställer', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect(page.locator('[data-block="quick"]')).toHaveClass(/\bon\b/); // Snabb är förvalt
  for (const id of ['m-kick', 'm-bright', 'm-punch', 'm-vocal', 'm-sibilance', 'm-glitter']) {
    const sl = page.locator(`[data-sl="${id}"]`);
    await expect(sl.locator('.i')).toHaveCount(1);
    await expect(sl.locator('.mbtn input')).toHaveCount(1);
    await expect(sl.locator('.solo')).toHaveCount(1);
  }
  await setRange(page.locator('#m-bright'), 100);
  await expect(page.locator('#dirty')).toBeVisible();
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(4);
  // dubbeltryck på namnet nollställer just den fadern
  await page.locator('[data-dblreset="m-bright"]').dblclick();
  await expect(page.locator('#m-bright')).toHaveValue('0');
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(0);
  // Återställ alla
  await setRange(page.locator('#m-kick'), 50);
  await setRange(page.locator('#m-vocal'), -40);
  await page.getByRole('button', { name: 'Återställ alla' }).click();
  await expect(page.locator('#m-kick')).toHaveValue('0');
  await expect(page.locator('#m-vocal')).toHaveValue('0');
  await expect(page.locator('#dirty')).toBeHidden();
});

test('ⓘ förklarar ett reglage tydligt', async ({ page }) => {
  await page.goto('/?sim=1');
  await openGroup(page, 'vokal');
  await page.locator('[data-sl="m-vocal"] .i').click();
  await expect(page.locator('dialog.sheet')).toContainText('Röst silkeslen');
  await expect(page.locator('dialog.sheet')).toContainText('3–8 kHz');
  await page.locator('dialog.sheet').getByRole('button', { name: 'Stäng' }).click();
  await expect(page.locator('dialog.sheet')).toHaveCount(0);
});

test('alla block i flödet: fadrar med ⓘ och nollställning, rätt graf överst, Platt och Återställ alla', async ({ page }) => {
  await page.goto('/?sim=1');
  // Flödet i ljudets ordning
  await expect(page.locator('.blk b')).toHaveText(['Snabb', 'EQ', 'Kompr.', 'Limiter', 'Ut']);
  for (const [b, n] of [['eq', 3], ['comp', 6], ['limiter', 5], ['out', 2]]) {
    await block(page, b);
    await expect(page.locator('#spanel .sl.vf')).toHaveCount(n);
    await expect(page.locator('#spanel .sl [data-dblreset]')).toHaveCount(n);
    await expect(page.locator('#spanel .sl .i')).toHaveCount(n);
  }
  // Kompressorn: grafen visar nedtryckningen per band
  await block(page, 'comp');
  await expect(page.locator('#stop .grb')).toHaveCount(4);
  await setRange(page.locator('#p-mbc-0-ratio'), 8);
  await expect.poll(async () => (await sent(page)).mbc[0].ratio).toBe(8);
  await page.locator('[data-dblreset="p-mbc-0-ratio"]').dblclick();
  await expect.poll(async () => (await sent(page)).mbc[0].ratio).toBe(4); // Mjuk kick
  // Bandväljare: Mellan
  await page.locator('[data-compband="1"]').click();
  await expect(page.locator('#p-mbc-1-ratio')).toHaveCount(1);
  // man kan scrolla med fingret på en fader – bara handtaget griper
  expect(await page.locator('#spanel .vrow').first().evaluate((e) => getComputedStyle(e).touchAction)).toBe('pan-y');
  expect(await page.locator('#spanel .vthumb').first().evaluate((e) => getComputedStyle(e).touchAction)).toBe('none');
  // EQ: 8 band
  await block(page, 'eq');
  await page.locator('[data-eqband="graphic"]').click();
  await expect(page.locator('#spanel .sl.vf')).toHaveCount(8);
  // Ut: Platt och Återställ alla
  await block(page, 'out');
  await page.getByRole('button', { name: 'Platt' }).click();
  await expect.poll(async () => (await sent(page)).mbc[0].ratio).toBe(1);
  await expect(page.locator('#msg')).toContainText('Platt');
  await pick(page, 'Preset', 'Radio ljus');
  await setRange(page.locator('#p-inputGain'), -6);
  await page.getByRole('button', { name: 'Återställ alla' }).click();
  await expect.poll(async () => (await sent(page)).inputGain).toBe(5);
});

test('spara, döp om, ta bort, exportera och importera presets via Hantera', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-kick'), 40);
  await page.getByRole('button', { name: 'Hantera presets' }).click();
  await page.getByRole('button', { name: 'Spara som…' }).click();
  await page.locator('dialog.ask input').fill('Kvällsmix');
  await page.locator('dialog.ask').getByRole('button', { name: 'Spara' }).click();
  await expect(page.locator('#msg')).toHaveText('Sparad som "Kvällsmix".');

  await page.getByRole('button', { name: 'Hantera presets' }).click();
  await page.getByRole('button', { name: 'Döp om' }).click();
  await page.locator('dialog.ask input').fill('Nattmix');
  await page.locator('dialog.ask').getByRole('button', { name: 'Döp om' }).click();
  await expect(picked(page, 'Preset')).toHaveText('Nattmix');

  await page.getByRole('button', { name: 'Hantera presets' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportera mina/ }).click();
  const file = await (await download).path();

  await page.getByRole('button', { name: 'Hantera presets' }).click();
  await page.getByRole('button', { name: 'Ta bort' }).click();
  await page.locator('dialog.ask').getByRole('button', { name: 'Ta bort' }).click();
  await expect(page.locator('#msg')).toHaveText('"Nattmix" borttagen.');

  await page.getByRole('button', { name: 'Hantera presets' }).click();
  await page.locator('#p-import').setInputFiles(file);
  await expect(page.locator('#msg')).toHaveText('1 presets importerade.');
  await page.getByRole('button', { name: 'Preset', exact: true }).click();
  await expect(page.locator('dialog.sheet .pgroup').first()).toHaveText('Mina');
  await expect(page.locator('dialog.sheet [role=option]').first()).toContainText('Nattmix');
  await page.locator('dialog.sheet').getByRole('button', { name: 'Avbryt' }).click();
});

test('jämn volym kräver mikrofon, och då nivåmatchas PÅ/AV automatiskt', async ({ page }) => {
  await page.goto('/?sim=1');
  await openSettings(page);
  await page.getByLabel('Jämn volym').click();
  await expect(page.locator('#agcmsg')).toContainText('Mikrofonbehörighet');
  await expect(page.getByLabel('Jämn volym')).not.toBeChecked();
  await page.goto('/?sim=1&mic=1');
  await openSettings(page);
  await page.getByLabel('Jämn volym').check();
  await expect(page.getByTestId('agcread')).toContainText('-3.5 dB');
  await expect(page.getByTestId('mode')).toContainText('NIVÅMATCHAT');
  await page.locator('dialog.settingssheet').getByRole('button', { name: 'Stäng' }).click();
  await openGroup(page, 'dynamik');
  await expect(page.getByText('Nivån hålls automatiskt')).toBeVisible();
});

test('utgångsnivå och automatisk nivåmatchning (när Konstant utnivå är av)', async ({ page }) => {
  await page.goto('/?sim=1&mic=1');
  await page.locator('#onoff').click();
  await openSettings(page);
  await page.getByLabel('Konstant utnivå').uncheck();
  await page.locator('dialog.settingssheet').getByRole('button', { name: 'Stäng' }).click();
  await openGroup(page, 'dynamik');
  await page.getByRole('button', { name: 'Auto-nivåmatcha' }).click();
  await expect(page.locator('#levelmsg')).toContainText('justerad');
  await expect(page.locator('#p-outputGain')).toHaveValue('-2.5');
  await expect.poll(async () => (await sent(page)).outputGain).toBe(-2.5);
});

test('ny app-version visas som banner', async ({ page }) => {
  await page.goto('/?sim=1&update=apk');
  await expect(page.locator('#apkBanner')).toContainText('Ny app-version finns');
  await page.goto('/?sim=1');
  await expect(page.locator('#apkBanner')).toHaveCount(0);
});

test('hjälptexten för varje vy', async ({ page }) => {
  await page.goto('/?sim=1');
  for (const [view, text] of [['live', 'Jämn volym'], ['analys', 'referens'], ['fil', 'Exportera'], ['mer', 'Shizuku']]) {
    await page.locator(`nav [data-view="${view}"]`).click();
    await page.getByRole('button', { name: 'Hjälp' }).click();
    await expect(page.locator('dialog.sheet')).toContainText(text);
    await page.locator('dialog.sheet').getByRole('button', { name: 'Stäng' }).click();
  }
});
