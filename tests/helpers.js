import { expect } from '@playwright/test';

/** Väljer `name` i appens egen väljare med etiketten `label`. */
export async function pick(page, label, name) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.locator('dialog.sheet').getByRole('option', { name: new RegExp(`^\\S*\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click();
  await expect(page.locator('dialog.sheet')).toHaveCount(0);
}

/** Det valda värdet som visas i väljaren. */
export const picked = (page, label) => page.getByRole('button', { name: label, exact: true }).locator('.pv');

/** Visar Mixerns sida: 'dynamik' → Kedjan (nivå, auto-nivåmatchning), annars Reglage (de sex enkla reglagen). */
export async function openGroup(page, id) {
  if (!(await page.locator('#mixer').count())) await page.getByRole('button', { name: 'Mixer', exact: true }).click();
  await page.locator(`[data-mixpage="${id === 'dynamik' ? 'chain' : 'macros'}"]`).click();
}

/** Öppnar inställningarna (⚙). */
export async function openSettings(page) {
  if (await page.locator('dialog.settingssheet').count()) return;
  await page.getByRole('button', { name: 'Inställningar' }).click();
  await expect(page.locator('dialog.settingssheet')).toBeVisible();
}
