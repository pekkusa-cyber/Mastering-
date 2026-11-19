import { test, expect } from '@playwright/test';
import { pick, picked, openGroup, openSettings } from './helpers.js';

const sent = (page) => page.evaluate(() => window.__simParams);
const setRange = (loc, v) => loc.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));

test('bekräftelse: ändringen hörs nu / motorn av / sparat', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-kick'), 30);
  await expect(page.locator('#confirm')).toContainText('motorn är av');
  await page.locator('#onoff').click();
  await setRange(page.locator('#m-kick'), 40);
  await expect(page.locator('#confirm')).toContainText('hörs nu');
  await page.locator('#onoff').click();
  await setRange(page.locator('#m-kick'), 50);
  await expect(page.locator('#confirm')).toContainText('hörs när du slår PÅ');
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
  // Masterlab av: växeln Original/Mastrad försvinner, inget bearbetas
  await page.getByLabel('Masterlab (bearbetning)').uncheck();
  await expect(page.getByTestId('mode')).toHaveText('HELT ORIGINAL');
  await expect(page.locator('#onoff')).toHaveCount(0);
  // Bara hörlurskorrigering
  await page.getByLabel('Hörlurskorrigering').check();
  await expect(page.getByTestId('mode')).toHaveText('BARA HÖRLURSKORRIGERING');
  await expect.poll(() => page.evaluate(() => window.__simCorrection?.gains?.length)).toBe(31);
  // Masterlab på igen
  await page.getByLabel('Masterlab (bearbetning)').check();
  await expect(page.getByTestId('mode')).toHaveText('MASTRAT');
  await page.locator('[data-info="mains"]').click();
  await expect(page.locator('dialog.sheet')).toContainText('Hörlurar på + Masterlab av');
});

test('på/av per del: bara kicken mjukas upp, EQ och resten av', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Suno-fix');
  await page.getByRole('button', { name: 'Avancerat' }).click();
  await page.getByLabel('Pre-EQ på/av').uncheck();
  await page.getByLabel('Post-EQ på/av').uncheck();
  await page.locator('[data-sec=mbc] > summary').click({ position: { x: 20, y: 14 } });
  for (const n of ['Mellan 120 Hz–2 kHz', 'Närvaro 2–8 kHz', 'Luft 8 kHz+']) await page.getByLabel(`${n} på/av`).uncheck();
  await expect.poll(async () => (await sent(page)).mbc[3].ratio).toBe(1);
  const p = await sent(page);
  expect(p.postEq[6].gain).toBe(0);
  expect(p.preEq.every((b) => b.gain === 0)).toBe(true);
  expect(p.mbc[0].ratio).toBe(3); // kickbandet kvar
  expect(p.mbc[2].ratio).toBe(1);
  await page.getByRole('button', { name: 'Slå på allt' }).click();
  await expect.poll(async () => (await sent(page)).postEq[6].gain).toBe(-2);
});

test('M (mute) på en fader: delen stängs av men inställningen ligger kvar', async ({ page }) => {
  await page.goto('/?sim=1');
  await setRange(page.locator('#m-bright'), 100);
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(4);
  await page.getByLabel('Mute Ljusare').uncheck();
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(0);
  await expect(page.locator('[data-sl="m-bright"]')).toHaveClass(/off/);
  await expect(page.locator('#m-bright')).toHaveValue('100'); // inställningen ligger kvar
  await page.getByLabel('Mute Ljusare').check();
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
  // skärmen (spektrum + klangkurva) följer med
  const curve = await page.locator('#screen polyline').first().getAttribute('points');
  await setRange(page.locator('#m-bright'), 100);
  await expect.poll(() => page.locator('#screen polyline').first().getAttribute('points')).not.toBe(curve);
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
  await page.getByText('Avancerat').click();
  await expect(page.locator('[data-viz=eq]')).toContainText('Hörlurskorrigering');
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

test('design A + mixer: bara vald preset syns, "Påverkar", två sidor med fadrar, Kompressor-M stänger av alla band', async ({ page }) => {
  await page.goto('/?sim=1');
  await expect(picked(page, 'Preset')).toHaveText('Mjuk kick');
  await expect(page.locator('.pc')).toHaveCount(0); // ingen karusell
  await expect(page.getByTestId('affects')).toContainText('Kick 4:1 (snabb)');
  await expect(page.getByTestId('affects')).not.toContainText('EQ');
  await pick(page, 'Preset', 'Radio ljus');
  await expect(picked(page, 'Preset')).toHaveText('Radio ljus');
  await expect(page.getByTestId('affects')).toContainText('Post-EQ');
  await expect(page.locator('#faders .vf')).toHaveCount(6);
  // svep i sidled byter till Kedjan
  await page.locator('#faders').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const box = await page.locator('#faders').boundingBox();
  const y = box.y + box.height - 20;
  await page.mouse.move(box.x + box.width * 0.8, y); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('#faders .vf')).toHaveCount(7);
  await expect(page.locator('[data-sl="a-comp"] .vname')).toHaveText('Kompr.');
  // mängd: 0 % Post-EQ = ingen post-EQ
  await setRange(page.locator('#a-postEq'), 0);
  await expect.poll(async () => (await sent(page)).postEq.every((b) => b.gain === 0)).toBe(true);
  await setRange(page.locator('#a-postEq'), 100);
  await page.getByLabel('Mute Kompressor mängd').uncheck();
  await expect.poll(async () => (await sent(page)).mbc.every((b) => b.ratio === 1)).toBe(true);
  // skärmen är fäst överst och syns även när man scrollat
  await page.mouse.wheel(0, 600);
  await expect(page.locator('#screen')).toBeInViewport();
});

test('Orörd preset och inga telefonmenyer (allt är appens eget)', async ({ page }) => {
  await page.goto('/?sim=1');
  await pick(page, 'Preset', 'Orörd');
  await expect(page.getByTestId('affects')).toContainText('Ingen bearbetning alls');
  const p = await page.evaluate(() => window.__simParams);
  expect(p.limiter.ratio).toBe(1);
  expect(p.mbc.every((b) => b.ratio === 1)).toBe(true);
  for (const view of ['live', 'analys', 'fil', 'mer']) {
    await page.locator(`nav [data-view="${view}"]`).click();
    await expect(page.locator('select')).toHaveCount(0);
  }
});

for (const width of [360, 320]) test(`ingen vy är bredare än telefonen vid ${width} px (även med större systemtext)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 740 });
  await page.goto('/?sim=1&mic=1');
  for (const view of ['live', 'analys', 'fil', 'mer']) {
    await page.locator(`nav [data-view="${view}"]`).click();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${view} sticker ut ${over}px`).toBeLessThanOrEqual(0);
  }
  await page.locator('nav [data-view="live"]').click();
  await page.getByRole('button', { name: 'Avancerat' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // Brytarkortens rubriker får inte krocka med på/av-knappen
  const clash = await page.evaluate(() => [...document.querySelectorAll('.main')].some((m) => {
    const t = m.querySelector('.mt b').getBoundingClientRect(), k = m.querySelector('.mtog').getBoundingClientRect();
    return t.right > k.left && t.bottom > k.top && t.top < k.bottom;
  }));
  expect(clash).toBe(false);
  // Inställningsarkets Stäng-knapp syns helt
  await page.getByRole('button', { name: 'Inställningar' }).click();
  const btn = page.locator('dialog.settingssheet form button');
  await expect(btn).toBeInViewport({ ratio: 1 });
});

test('skydd mot misstag: tryck och vågrätt svep ändrar inte en fader, drag uppåt gör det, Ångra tar tillbaka', async ({ page }) => {
  await page.goto('/?sim=1');
  const el = page.locator('#m-bright');
  const row = page.locator('[data-sl="m-bright"] .vrow');
  await row.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const box = await row.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.1;
  // Tryck högt upp på fadern: inget hopp
  await page.mouse.click(cx, cy);
  await expect(el).toHaveValue('0');
  // Kort vågrätt svep: ingen ändring
  const my = box.y + box.height / 2;
  await page.mouse.move(cx, my); await page.mouse.down(); await page.mouse.move(cx + 40, my + 3, { steps: 6 }); await page.mouse.up();
  await expect(el).toHaveValue('0');
  // Drag uppåt: relativt – en fjärdedel av höjden ≈ +50
  await page.mouse.move(cx, my); await page.mouse.down(); await page.mouse.move(cx, my - box.height / 4, { steps: 8 }); await page.mouse.up();
  const v = Number(await el.inputValue());
  expect(v).toBeGreaterThan(35);
  expect(v).toBeLessThan(65);
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBeGreaterThan(1);
  // Ångra
  await page.getByRole('button', { name: '↶ Ångra' }).click();
  await expect(page.locator('#m-bright')).toHaveValue('0');
  await expect.poll(async () => (await sent(page)).postEq[7].gain).toBe(0);
  await expect(page.locator('#confirm')).toContainText('Ångrat');
});
