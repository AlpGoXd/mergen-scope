import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('Load demo opens the bundled workspace from a directly opened build', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('dist/app.html')).href);
  await page.getByRole('button', { name: 'Load demo' }).click();

  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await expect(page.getByTestId('import-error')).toHaveCount(0);
});
