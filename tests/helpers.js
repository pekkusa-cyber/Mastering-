import { expect } from '@playwright/test';

/** Väljer `name` i appens egen väljare med etiketten `label`. */
export async function pick(page, label, name) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.locator('dialog.sheet').getByRole('option', { name: new RegExp(`^\\S*\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click();
  await expect(page.locator('dialog.sheet')).toHaveCount(0);
}

/** Det valda värdet som visas i väljaren. */
export const picked = (page, label) => page.getByRole('button', { name: label, exact: true }).locator('.pv');
