import type { Page } from '@playwright/test';

/** Clear workspace… from the Files ⋯ menu in the left panel (it moved there from the top bar's Clear All). */
export async function clearWorkspace(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Files actions' }).click();
  await page.getByRole('menuitem', { name: 'Clear workspace…' }).click();
}
