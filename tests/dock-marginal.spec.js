import { test, expect } from '@playwright/test';
// Dockan ska ligga nära systemfältet: bottenglappet = --sab + liten marginal, inte dubbelt.
test('dockan har ingen dubbel bottenmarginal', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/?sim=1&mic=1');
  await page.addStyleTag({ content: ':root { --safe-area-inset-bottom: 48px !important; }' });
  await page.locator('#onoff').click().catch(() => {});
  const gap = await page.evaluate(() => innerHeight - document.querySelector('.blocks').getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(48);
  expect(gap).toBeLessThanOrEqual(48 + 20);
});
