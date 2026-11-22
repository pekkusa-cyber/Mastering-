import { test, expect } from '@playwright/test';
import { pick, picked, openGroup, openSettings, block, go } from './helpers.js';

const sent = (page) => page.evaluate(() => window.__simParams);
const setRange = (loc, v) => loc.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));

test('bekräftelse: ändringen hörs nu / motorn av / sparat', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-kick'), 30);
  await expect(page.locator('#confirm')).toContainText('motorn är av');
  await page.locator('#onoff').click();
  await setRange(page.locator('#m-kick'), 40);
  await expect(page.locator('#confirm')).toContainText('hörs nu');
  // bekräftelsen ligger i grafen och försvinner av sig själv
  await expect(page.locator('#stop #confirm')).toHaveCount(1);
  await expect(page.locator('#confirm')).toBeHidden({ timeout: 6000 });
  await page.locator('#onoff').click();
  await setRange(page.locator('#m-kick'), 50);
  await expect(page.locator('#confirm')).toContainText('hörs på Efter');
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

test('huvudbrytare: Hörlurar och Masterlab var för sig', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.locator('#onoff').click();
  await expect(page.getByTestId('mode')).toHaveText('MASTRAT');
  // Masterlab av: Före/Efter går inte att använda, inget bearbetas; knappen blir grå
  await page.getByLabel('Masterlab (bearbetning)').uncheck();
  await expect(page.getByTestId('mode')).toHaveText('HELT ORIGINAL');
  await expect(page.locator('#onoff')).toBeDisabled();
  await expect(page.locator('label.rb:has(#masterlab)')).toHaveClass(/off/);
  // Bara hörlurskorrigering
  await page.getByLabel('Hörlurskorrigering').check();
  await expect(page.getByTestId('mode')).toHaveText('BARA HÖRLURSKORRIGERING');
  await expect.poll(() => page.evaluate(() => window.__simCorrection?.gains?.length)).toBe(31);
  // Masterlab på igen
  await page.getByLabel('Masterlab (bearbetning)').check();
  await expect(page.getByTestId('mode')).toHaveText('MASTRAT');
  await page.locator('[data-info="mains"]').click();
  await expect(page.locator('dialog.sheet')).toContainText('🎧 på och 🎚️ av');
});

test('på/av per del: bara kicken mjukas upp, EQ och resten av', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Suno-fix');
  await block(page, 'eq1');
  await page.getByLabel('EQ 1 på/av').uncheck();
  await block(page, 'eq2');
  await page.getByLabel('EQ 2 på/av').uncheck();
  await block(page, 'out');
  await expect.poll(async () => (await sent(page)).postEq[6].gain).toBe(0);
  const p = await sent(page);
  expect(p.preEq.every((b) => b.gain === 0)).toBe(true);
  expect(p.mbc[0].ratio).toBe(3); // kompressorn kvar
  await page.getByRole('button', { name: 'Slå på allt' }).click();
  await expect.poll(async () => (await sent(page)).postEq[6].gain).toBe(-2);
});

test('på/av på ett Snabb-reglage: delen stängs av men inställningen ligger kvar', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-bright'), 100);
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(4);
  await page.getByLabel('Ljusare på/av').uncheck();
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(0);
  await expect(page.locator('[data-sl="m-bright"]')).toHaveClass(/off/);
  await expect(page.locator('#m-bright')).toHaveValue('100'); // inställningen ligger kvar
  await page.getByLabel('Ljusare på/av').check();
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(4);
});

test('konstant utnivå: mer ingång → lägre utgång, och kurvorna följer med', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Transparent');
  const before = (await sent(page)).outputGain;
  await setRange(page.locator('#m-punch'), 100);
  await expect.poll(async () => (await sent(page)).outputGain).toBeLessThan(before - 1);
  await openSettings(page);
  await expect(page.getByTestId('compread')).toContainText('dB');
  await page.locator('dialog.settingssheet').getByRole('button', { name: 'Stäng' }).click();
  // grafen (spektrum + klangkurva) följer med
  const curve = await page.locator('#stop polyline').first().getAttribute('points');
  await setRange(page.locator('#m-bright'), 100);
  await expect.poll(() => page.locator('#stop polyline').first().getAttribute('points')).not.toBe(curve);
  await openSettings(page);
  await page.getByLabel('Konstant utnivå').uncheck();
  await expect.poll(async () => (await sent(page)).outputGain).toBe(0);
});

test('hörlurskorrigering: Liberty 4 Pro inbyggd, samma volym, graf och import från AutoEq', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByLabel('Hörlurskorrigering').check();
  await expect.poll(() => page.evaluate(() => window.__simCorrection?.gains?.length)).toBe(31);
  const c = await page.evaluate(() => window.__simCorrection);
  expect(c.name).toBe('Soundcore Liberty 4 Pro');
  expect(c.preamp).toBeGreaterThan(-2); // nivåkompenserad: preamp −5,8 höjs så att det låter lika högt
  expect(c.levelComp).toBeGreaterThan(3);
  await openSettings(page);
  await expect(page.locator('[data-viz=corr] svg')).toBeVisible();
  await expect(page.getByTestId('corr-acc')).toContainText('i snitt');
  // Utan samma volym: originalets preamp
  await page.getByLabel('Samma volym som utan korrigering').uncheck();
  await expect.poll(() => page.evaluate(() => window.__simCorrection.preamp)).toBe(-5.8);
  await page.getByRole('button', { name: 'Välj hörlurar' }).click();
  await page.locator('#hp-name').fill('Testlurar');
  await page.locator('#hp-text').fill('Preamp: -3 dB\nFilter 1: ON PK Fc 1000 Hz Gain 3.0 dB Q 1.0');
  await page.getByRole('button', { name: 'Lägg till' }).click();
  await expect(page.locator('#corrmsg')).toContainText('Testlurar');
  expect(await page.evaluate(() => window.__simCorrection.preamp)).toBe(-3);
  await page.locator('dialog.settingssheet').getByRole('button', { name: 'Stäng' }).click();
  await expect(page.locator('label.rb:has(#corr)')).toHaveClass(/\bon\b/);
});

test('profil per enhet: sparas och används när enheten ansluts', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Bas varm');
  await openSettings(page);
  await page.getByRole('button', { name: 'Spara nuvarande' }).click();
  await expect(page.getByTestId('profile')).toContainText('Bas varm');
  await page.locator('dialog.settingssheet').getByRole('button', { name: 'Stäng' }).click();
  const key = await page.evaluate(() => Object.keys(window.__simProfiles)[0]);
  expect(key).toContain('Liberty 4 Pro');
  // Byt preset, koppla bort och anslut hörlurarna igen → profilen tas tillbaka
  await pick(page, 'Preset', 'Rock');
  await page.evaluate(() => window.__sim.simOutput('speaker', 'Telefonens högtalare'));
  await page.evaluate((k) => window.__sim.simOutput(k, 'Soundcore Liberty 4 Pro'), key);
  await expect(picked(page, 'Preset')).toHaveText('Bas varm');
  await openSettings(page);
  await expect(page.locator('#profmsg')).toContainText('Soundcore Liberty 4 Pro');
});

test('layout B: runda brytare i rubriken, smal rad, fast graf och block utan scroll; svep byter block', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect(picked(page, 'Preset')).toHaveText('Mjuk kick');
  await expect(page.locator('.top label.rb')).toHaveCount(2); // 🎧 och 🎚️ i rubriken
  await page.getByRole('button', { name: 'Hantera presets' }).click();
  await expect(page.getByTestId('affects')).toContainText('Kick 4:1 (snabb)');
  await expect(page.getByTestId('affects')).not.toContainText('EQ');
  await page.locator('dialog.sheet').getByRole('button', { name: 'Stäng' }).click();
  // Inget i appen scrollar – skärmen är exakt fönstret
  for (const b of ['quick', 'in', 'eq1', 'comp', 'eq2', 'limiter', 'out']) {
    await block(page, b);
    expect(await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
    await expect(page.locator('#stop')).toBeInViewport();
    await expect(page.locator('#spanel')).toBeInViewport({ ratio: 1 }); // panelen når ända ner – ingen rad längst ner
  }
  // svep i sidled i panelen = nästa block (EQ 1 → Kompressor)
  await block(page, 'eq1');
  const box = await page.locator('#spanel .phead').boundingBox();
  await page.mouse.move(box.x + box.width * 0.9, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + 12, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('[data-block="comp"]')).toHaveClass(/\bon\b/);
  // M på kompressorn stänger av alla band
  await page.getByLabel('Kompressor på/av').uncheck();
  await expect.poll(async () => (await sent(page)).mbc.every((b) => b.ratio === 1)).toBe(true);
  await expect(page.locator('[data-block="comp"] .dot')).toHaveClass(/no/);
});

test('Orörd preset och inga telefonmenyer (allt är appens eget)', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Orörd');
  await page.getByRole('button', { name: 'Hantera presets' }).click();
  await expect(page.getByTestId('affects')).toContainText('Ingen bearbetning alls');
  await page.locator('dialog.sheet').getByRole('button', { name: 'Stäng' }).click();
  const p = await page.evaluate(() => window.__simParams);
  expect(p.limiter.ratio).toBe(1);
  expect(p.mbc.every((b) => b.ratio === 1)).toBe(true);
  for (const view of ['live', 'analys', 'fil', 'mer']) {
    await go(page, view);
    await expect(page.locator('select')).toHaveCount(0);
  }
});

for (const width of [360, 320]) test(`ingen vy är bredare än telefonen vid ${width} px (även med större systemtext)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 740 });
  await page.goto('/?sim=1&mic=1');
  for (const view of ['live', 'analys', 'fil', 'mer']) {
    await go(page, view);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${view} sticker ut ${over}px`).toBeLessThanOrEqual(0);
  }
  await go(page, 'live');
  for (const b of ['in', 'eq1', 'comp', 'eq2', 'limiter', 'out']) {
    await page.locator(`[data-block="${b}"]`).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  // Inställningsarkets Stäng-knapp syns helt
  await page.getByRole('button', { name: 'Inställningar' }).click();
  const btn = page.locator('dialog.settingssheet form button');
  await expect(btn).toBeInViewport({ ratio: 1 });
});

test('skydd mot misstag: tryck och lodrätt svep ändrar inte ett reglage, vågrätt drag gör det, Ångra tar tillbaka', async ({ page }) => {
  await page.goto('/?sim=1');
  const el = page.locator('#m-bright');
  const row = page.locator('[data-sl="m-bright"] .slrow');
  const box = await el.boundingBox();
  const cy = box.y + box.height / 2;
  await page.mouse.click(box.x + box.width * 0.9, cy); // tryck långt till höger: inget hopp
  await expect(el).toHaveValue('0');
  const cx = box.x + box.width / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 3, cy - 60, { steps: 6 }); await page.mouse.up(); // scroll
  await expect(el).toHaveValue('0');
  // vågrätt drag: en fjärdedel av bredden ≈ +50 (minus dödzonen)
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + box.width / 4, cy, { steps: 8 }); await page.mouse.up();
  const v = Number(await el.inputValue());
  expect(v).toBeGreaterThan(30);
  expect(v).toBeLessThan(60);
  await expect(row).toHaveCount(1);
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBeGreaterThan(1);
  await page.getByRole('button', { name: '↶ Ångra' }).click();
  await expect(page.locator('#m-bright')).toHaveValue('0');
  await expect(page.locator('#confirm')).toContainText('Ångrat');
});
