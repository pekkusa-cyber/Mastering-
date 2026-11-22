import { test, expect } from '@playwright/test';
import { pick, block } from './helpers.js';

const setRange = (loc, v) => loc.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
const params = (page) => page.evaluate(() => window.__simParams);

test('solo/mute per område: S på ett kompressorband spelar bara bandets frekvenser, M tar bort dem', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Suno-fix');
  await block(page, 'comp');
  const before = await params(page);
  await page.getByRole('button', { name: 'Bara Kick' }).click();
  await expect(page.getByTestId('listenbar')).toContainText('Bara Kick (20–120 Hz)');
  // Hela kedjan är kvar (du hör exakt vad bandet gör) – men bara 20–120 Hz släpps fram
  await expect.poll(async () => (await params(page)).post31[20]).toBeLessThan(-20); // 2 kHz bort
  let p = await params(page);
  expect(p.post31[6]).toBeGreaterThan(-1); // 80 Hz kvar
  expect(p.mbc[1].ratio).toBe(before.mbc[1].ratio); // inget annat stängs av
  expect(JSON.stringify(p.postEq)).toBe(JSON.stringify(before.postEq));
  // M: ta bort området
  await page.getByRole('button', { name: 'Ta bort Kick' }).click();
  await expect(page.getByTestId('listenbar')).toContainText('Utan Kick');
  await expect.poll(async () => (await params(page)).post31[6]).toBeLessThan(-20);
  p = await params(page);
  expect(p.post31[20]).toBeGreaterThan(-1);
  await page.getByRole('button', { name: 'Avsluta solo' }).click();
  await expect(page.getByTestId('listenbar')).toHaveCount(0);
  await expect.poll(async () => (await params(page)).post31.every((g) => g === 0)).toBe(true);
});

test('solo/mute per EQ-band: S på 250–500 Hz i EQ 1 släpper bara fram det området', async ({ page }) => {
  await page.goto('/?sim=1');
  await block(page, 'eq1');
  await page.locator('[data-asolo="preEq:3"]').click();
  await expect(page.getByTestId('listenbar')).toContainText('250–500');
  await expect.poll(async () => (await params(page)).post31[14]).toBe(0); // 500 Hz
  expect((await params(page)).post31[3]).toBe(-24); // 40 Hz
});

test('solo på en fader i Mixern', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.getByRole('button', { name: 'Solo Ljusare' }).click();
  await expect(page.getByTestId('solobar')).toBeVisible();
  await expect.poll(async () => (await params(page)).mbc.every((b) => b.ratio === 1)).toBe(true);
});

test('parametrisk EQ med Q går till motorn som 31 tersband', async ({ page }) => {
  await page.goto('/?sim=1');
  await block(page, 'eq2');
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
  await block(page, 'eq2');
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
  await block(page, 'eq2');
  await expect(page.locator('#mod-eq b')).toHaveCount(0); // ingen del vald från annan preset
});

test('EQ: dra en EQ-punkt i spektrumet ändrar frekvens och gain', async ({ page }) => {
  await page.goto('/?sim=1');
  await block(page, 'eq2');
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

test('± tar ett tydligt steg: 5 på Snabb, 0,5 dB på EQ och en tredjedels oktav på frekvens', async ({ page }) => {
  await page.goto('/?sim=1');
  const el = page.locator('#m-bright');
  await page.getByRole('button', { name: 'Öka Ljusare' }).click();
  await expect(el).toHaveValue('5');
  await page.getByRole('button', { name: 'Öka Ljusare' }).click();
  await expect(el).toHaveValue('10');
  await page.getByRole('button', { name: 'Minska Ljusare' }).click();
  await expect(el).toHaveValue('5');
  await block(page, 'eq1');
  await page.getByRole('button', { name: 'Öka 250–500 Hz' }).click();
  await expect(page.locator('#p-preEq-3-gain')).toHaveValue('0.5');
  await block(page, 'eq2');
  await page.locator('[data-eqband="2"]').click();
  await page.getByRole('button', { name: 'Öka Frekvens' }).click();
  await expect(page.locator('#p-peq-2-freq')).toHaveValue('1260'); // 1000 · 2^(1/3)
});

test('Snabb syns i de andra flikarna: Ljusare +100 flyttar EQ 2:s 8k-fader, och fadern går att ställa exakt', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-bright'), 100);
  await block(page, 'eq2');
  await page.locator('[data-eqband="graphic"]').click();
  await expect(page.locator('#p-postEq-7-gain')).toHaveValue('4'); // det Ljusare gör
  await setRange(page.locator('#p-postEq-7-gain'), 2);
  await expect.poll(async () => (await params(page)).postEq[7].gain).toBe(2); // det man ställer är det man får
  await block(page, 'quick');
  await expect(page.locator('#m-bright')).toHaveValue('100'); // Snabb ligger kvar
});

test('kompressorn Hela låten: samma inställning på alla fyra band', async ({ page }) => {
  await page.goto('/?sim=1');
  await block(page, 'comp');
  await page.locator('[data-compband="all"]').click();
  await setRange(page.locator('#p-mbcall-ratio'), 3);
  await setRange(page.locator('#p-mbcall-threshold'), -20);
  await expect.poll(async () => (await params(page)).mbc.map((b) => b.ratio)).toEqual([3, 3, 3, 3]);
  expect((await params(page)).mbc.map((b) => b.threshold)).toEqual([-20, -20, -20, -20]);
});

test('lodrätt EQ-drag hoppar inte: 30 px ger en liten ändring', async ({ page }) => {
  await page.goto('/?sim=1');
  await block(page, 'eq1');
  const row = page.locator('[data-sl="p-preEq-3-gain"] .vrow');
  const box = await row.boundingBox();
  const cx = box.x + box.width / 2, my = box.y + box.height / 2;
  await page.mouse.move(cx, my); await page.mouse.down(); await page.mouse.move(cx, my - 30, { steps: 10 }); await page.mouse.up();
  const v = Number(await page.locator('#p-preEq-3-gain').inputValue());
  expect(v).toBeGreaterThan(0);
  expect(v).toBeLessThanOrEqual(2.5); // 20 px av 220 px ≈ 2 dB – inget hopp
});

test('blocken står i kedjans ordning: In, EQ 1 (före), Kompr., EQ 2 (efter), Limiter, Ut', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect(page.locator('.blk b')).toHaveText(['Snabb', 'In', 'EQ 1', 'Kompr.', 'EQ 2', 'Limiter', 'Ut']);
  await expect(page.locator('.blk small')).toHaveText(['genväg', 'först', 'före', 'tryck', 'efter', 'volym', 'sist']);
  // EQ 1 ligger före kompressorn: dess fadrar är pre-EQ och påverkar bara preEq
  await block(page, 'eq1');
  await setRange(page.locator('#p-preEq-3-gain'), 6);
  await expect.poll(async () => (await params(page)).preEq[3].gain).toBe(6);
  expect((await params(page)).postEq.every((b) => b.gain === 0)).toBe(true);
  // EQ 2 ligger efter: 8 band = postEq
  await block(page, 'eq2');
  await page.locator('[data-eqband="graphic"]').click();
  await setRange(page.locator('#p-postEq-3-gain'), -4);
  await expect.poll(async () => (await params(page)).postEq[3].gain).toBe(-4);
  expect((await params(page)).preEq[3].gain).toBe(6);
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

test('varje reglage i Live gör sitt jobb: ändrar det som skickas till motorn', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?sim=1');
  await page.locator('#onoff').click();
  const views = [['quick'], ['in'], ['eq1'], ['comp', '[data-compband="all"]'], ['comp', '[data-compband="0"]'], ['comp', '[data-compband="3"]'],
    ['eq2', '[data-eqband="graphic"]'], ...[0, 1, 2, 3, 4].map((i) => ['eq2', `[data-eqband="${i}"]`]), ['limiter'], ['out']];
  const dead = [];
  let n = 0;
  for (const [b, sel] of views) {
    await block(page, b);
    if (sel) await page.locator(sel).click();
    const ids = await page.locator('#spanel input[type=range][data-kind]').evaluateAll((els) => els.map((e) => e.id));
    for (const id of ids) {
      const el = page.locator(`#${id}`);
      const before = JSON.stringify(await params(page));
      const [min, max, val] = await el.evaluate((e) => [Number(e.min), Number(e.max), Number(e.value)]);
      const target = val - min > max - val ? min + (max - min) * 0.1 : max - (max - min) * 0.1;
      await setRange(el, target);
      try { await expect.poll(async () => JSON.stringify(await params(page)), { timeout: 2000 }).not.toBe(before); } catch { dead.push(`${b}${sel || ''} ${id}`); }
      n++;
    }
    // Snabb-reglagen ändrar flera delar samtidigt (t.ex. snabbare attack) – nollställ dem så att varje block testas för sig
    if (b === 'quick') await page.getByRole('button', { name: 'Återställ alla' }).click();
  }
  expect(n).toBeGreaterThan(50);
  expect(dead, 'reglage som inte ändrar något').toEqual([]);
});

test('klippvarning: toppar vid 0 dB visar en varning med det som höjer nivån, och den försvinner när toppen sjunker', async ({ page }) => {
  await page.goto('/?sim=1&mic=1');
  await page.locator('#onoff').click();
  await expect(page.getByTestId('clipwarn')).toHaveCount(0);
  await block(page, 'in');
  await setRange(page.locator('#p-inputGain'), 6);
  await page.evaluate(() => { window.__simPeak = -0.1; });
  await expect(page.getByTestId('clipwarn')).toBeVisible();
  await expect(page.getByTestId('clipwarn')).toContainText('In +6.0');
  await block(page, 'comp'); // syns i alla block
  await expect(page.getByTestId('clipwarn')).toBeVisible();
  await page.evaluate(() => { window.__simPeak = -6; });
  await expect(page.getByTestId('clipwarn')).toHaveCount(0, { timeout: 7000 });
});

test('tak-skydd i Live: positiv Ut sänker limiterns tröskel i det som skickas till motorn', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.locator('#onoff').click();
  await block(page, 'out');
  await setRange(page.locator('#p-outputGain'), 12);
  await expect.poll(async () => (await params(page)).limiter.threshold).toBeLessThan(-5); // tröskeln sänkt
  const p = await params(page);
  expect(p.limiter.threshold + p.limiter.postGain + p.outputGain).toBeLessThanOrEqual(-0.99); // taket hålls
});

test('båda huvudbrytarna av: motorn stängs (ingen notis), på igen startar den', async ({ page }) => {
  await page.goto('/?sim=1');
  await page.locator('#masterlab').uncheck({ force: true });
  await expect(page.getByTestId('mode')).toHaveText('HELT ORIGINAL');
  await expect(page.getByTestId('motor')).toHaveText('Av – inget ljud ändras, ingen notis');
  await page.locator('#masterlab').check({ force: true });
  await expect(page.getByTestId('motor')).toContainText('Bearbetar');
});
