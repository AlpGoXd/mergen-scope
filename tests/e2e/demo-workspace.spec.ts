import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('demo opens a saved workspace and removes its query parameter', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const path = await download.path();
  if (!path) throw new Error('Workspace download was unavailable');
  const workspace = await readFile(path, 'utf8');
  await page.route('**/demo-assets/demo.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: workspace }));
  await page.goto('/app.html?demo=1&keep=yes');
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await expect(page).toHaveURL(/app\.html\?keep=yes$/);
});

test('demo fetch failure leaves the app usable and displays the error', async ({ page }) => {
  await page.route('**/demo-assets/demo.json', route => route.fulfill({ status: 404 }));
  await page.goto('/app.html?demo=1');
  await expect(page.getByTestId('import-error')).toContainText('The demo could not be loaded. Open the app from the website, or open demo.json from the demo-assets folder.');
  await expect(page.getByTestId('app-root')).toBeVisible();
});
