import { expect } from '@playwright/test';

/** Väljer `name` i appens egen väljare med etiketten `label`. */
export async function pick(page, label, name) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.locator('dialog.sheet').getByRole('option', { name: new RegExp(`^\\S*\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click();
  await expect(page.locator('dialog.sheet')).toHaveCount(0);
}

/** Det valda värdet som visas i väljaren. */
export const picked = (page, label) => page.getByRole('button', { name: label, exact: true }).locator('.pv');

/** Öppnar ett block i nuvarande vy (samma upplägg i alla vyer). */
export async function block(page, id) {
  await page.locator(`[data-block="${id}"]`).click();
  await expect(page.locator(`[data-block="${id}"]`)).toHaveClass(/\bon\b/);
}

/** Live: de enkla reglagen ligger i blocket Snabb, nivå och auto-nivåmatchning i blocket Ut. */
export async function openGroup(page, id) {
  await block(page, id === 'dynamik' ? 'out' : 'quick');
}

/** Öppnar inställningarna (⚙). */
export async function openSettings(page) {
  if (await page.locator('dialog.settingssheet').count()) return;
  await page.getByRole('button', { name: 'Inställningar' }).click();
  await expect(page.locator('dialog.settingssheet')).toBeVisible();
}

/** Byter vy via menyn (☰ vid kugghjulet). */
export async function go(page, view) {
  if (await page.locator('#vmenu').isHidden()) await page.getByRole('button', { name: 'Meny' }).click();
  await page.locator(`#vmenu [data-view="${view}"]`).click();
}
