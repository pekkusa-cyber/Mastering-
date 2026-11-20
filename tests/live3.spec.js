import { test, expect } from '@playwright/test';
import { pick, block } from './helpers.js';

const setRange = (loc, v) => loc.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
const params = (page) => page.evaluate(() => window.__simParams);

test('solo: S på ett multiband hör bara det bandet, Avsluta solo tar tillbaka allt', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Suno-fix');
  await block(page, 'comp');
  const before = await params(page);
  await page.getByRole('button', { name: 'Solo Kick 0–120 Hz' }).click();
  await expect(page.getByTestId('solobar')).toContainText('Kick 0–120 Hz');
  await expect.poll(async () => (await params(page)).postEq.every((b) => b.gain === 0)).toBe(true);
  const p = await params(page);
  expect(p.mbc[0].ratio).toBe(before.mbc[0].ratio);
  expect(p.mbc.slice(1).every((b) => b.ratio === 1)).toBe(true);
  expect(p.limiter.threshold).toBe(-1); // skyddslimitern ligger kvar
  await page.getByRole('button', { name: 'Avsluta solo' }).click();
  await expect(page.getByTestId('solobar')).toHaveCount(0);
  await expect.poll(async () => JSON.stringify((await params(page)).postEq)).toBe(JSON.stringify(before.postEq));
});

test('solo på en fader i Mixern', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByRole('button', { name: 'Solo Ljusare' }).click();
  await expect(page.getByTestId('solobar')).toBeVisible();
  await expect.poll(async () => (await params(page)).mbc.every((b) => b.ratio === 1)).toBe(true);
});

test('parametrisk EQ med Q går till motorn som 31 tersband', async ({ page }) => {
  await page.goto('/?sim=1');
  await block(page, 'eq');
  await page.locator('[data-eqband="2"]').click();
  const mitt = page.locator('#spanel');
  await expect(mitt.locator('.sl.vf')).toHaveCount(3); // Frekvens, Höj/sänk, Bredd (Q) som fadrar
  await setRange(page.locator('#p-peq-2-gain'), 6);
  await expect(mitt.locator('output').nth(1)).toHaveText('6.0');
  await expect.poll(async () => (await params(page)).post31[17]).toBeGreaterThan(5.5); // 1 kHz
  const wide = (await params(page)).post31[20]; // 2 kHz
  await setRange(page.locator('#p-peq-2-q'), 4);
  await expect.poll(async () => (await params(page)).post31[20]).toBeLessThan(wide - 1); // smalare: grannen påverkas mindre
});

test('separata presets: EQ från en preset, limitern från en annan', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Mjuk kick');
  const kick = await params(page);
  await block(page, 'eq');
  await pick(page, 'EQ-preset', 'Radio ljus');
  await expect(page.locator('#mod-eq b')).toHaveText('Radio ljus');
  const p = await params(page);
  expect(p.mbc[0].ratio).toBe(kick.mbc[0].ratio); // kompressorn kvar
  expect(JSON.stringify(p.postEq)).not.toBe(JSON.stringify(kick.postEq));
  await block(page, 'limiter');
  await pick(page, 'Limiter-preset', 'Orörd');
  await expect.poll(async () => (await params(page)).limiter.ratio).toBe(1);
  await expect(page.locator('#mod-limiter b')).toHaveText('Orörd');
  // Ångra tar tillbaka limitern
  await page.locator('#undo').click();
  await expect.poll(async () => (await params(page)).limiter.ratio).toBe(kick.limiter.ratio);
  // Byter man hela presetten nollställs delvalen
  await pick(page, 'Preset', 'Suno-fix');
  await block(page, 'eq');
  await expect(page.locator('#mod-eq b')).toHaveText('presettens');
});

test('EQ: dra en EQ-punkt i spektrumet ändrar frekvens och gain', async ({ page }) => {
  await page.goto('/?sim=1');
  await block(page, 'eq');
  const box = await page.locator('.scrbox.edit svg').boundingBox();
  // punkt 3 (Mitt, 1 kHz, 0 dB) ligger vid x = log(1000/20)/log(1000) av bredden, mitt i höjd
  const x = box.x + box.width * (Math.log(50) / Math.log(1000)), y = box.y + box.height * ((6 + 0.5 * 222) / 240);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + box.width * 0.1, y - box.height * 0.2, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await params(page)).post31[20]).toBeGreaterThan(2); // ≈2 kHz höjd
  await expect(page.locator('#p-peq-2-freq')).not.toHaveValue('1000');
  await expect(page.locator('#spanel .chip.sel')).toContainText('Mitt');
  // ett tryck flyttar inget
  const before = await page.locator('#p-peq-2-gain').inputValue();
  await page.mouse.click(box.x + box.width * 0.5, box.y + 20);
  await expect(page.locator('#p-peq-2-gain')).toHaveValue(before);
  await page.getByRole('button', { name: 'Platta ut' }).click();
  await expect.poll(async () => (await params(page)).post31.every((g) => g === 0)).toBe(true);
});

test('± på en fader ändrar exakt ett steg åt gången', async ({ page }) => {
  await page.goto('/?sim=1');
  const el = page.locator('#m-bright');
  await page.getByRole('button', { name: 'Öka Ljusare' }).click();
  await expect(el).toHaveValue('1');
  await page.getByRole('button', { name: 'Öka Ljusare' }).click();
  await expect(el).toHaveValue('2');
  await page.getByRole('button', { name: 'Minska Ljusare' }).click();
  await expect(el).toHaveValue('1');
});

test('sakta drag uppåt hoppar inte: 30 px ger en liten ändring', async ({ page }) => {
  await page.goto('/?sim=1');
  const row = page.locator('[data-sl="m-bright"] .vrow');
  const box = await row.boundingBox();
  const cx = box.x + box.width / 2, my = box.y + box.height / 2;
  await page.mouse.move(cx, my); await page.mouse.down(); await page.mouse.move(cx, my - 30, { steps: 10 }); await page.mouse.up();
  const v = Number(await page.locator('#m-bright').inputValue());
  expect(v).toBeGreaterThan(0);
  expect(v).toBeLessThan(20); // 30 px minus dödzonen (10 px) ≈ 20 px ⇒ några få steg, inte ett hopp på 20+
});

test('EQ-stegen står i ljudets ordning: Före kompressorn, sedan Efter kompressorn; blocken i flödesordning', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect(page.locator('.blk b')).toHaveText(['Snabb', 'EQ', 'Kompr.', 'Limiter', 'Nivå']);
  await block(page, 'eq');
  await page.locator('[data-eqband="graphic"]').click();
  await expect(page.locator('[data-eqstage]')).toHaveText(['Före kompressorn', 'Efter kompressorn']);
});

test('vymenyn: rullgardin vid kugghjulet, ingen rad längst ner', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect(page.locator('#vmenu')).toBeHidden();
  await page.getByRole('button', { name: 'Meny' }).click();
  await expect(page.locator('#vmenu button')).toHaveText(['◉Live', '▤Analys', '♫Fil', '⋯Mer']);
  await page.mouse.click(10, 400); // tryck utanför stänger
  await expect(page.locator('#vmenu')).toBeHidden();
  await page.getByRole('button', { name: 'Meny' }).click();
  await page.locator('#vmenu [data-view="analys"]').click();
  await expect(page.locator('h1')).toHaveText('Analys');
  await expect(page.locator('nav.bottom')).toHaveCount(0);
});
