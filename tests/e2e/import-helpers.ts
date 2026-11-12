import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Tables always open the import wizard; accept the detected settings for `count` files. */
export async function acceptImport(page: Page, count = 1): Promise<void> {
  const wizard = page.getByTestId('import-wizard');
  for (let i = 0; i < count; i++) {
    await expect(wizard).toBeVisible();
    const title = wizard.locator('#import-wizard-title');
    const before = await title.textContent();
    await wizard.getByTestId('import-wizard-confirm').click();
    if (i < count - 1) await expect(title).not.toHaveText(before ?? '');
  }
  await expect(wizard).toHaveCount(0);
}
