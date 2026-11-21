import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('settings and local-only disclosure remain usable', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Local only' }).click();
  await expect(page.getByText('Your files are read in this browser and never uploaded. No cookies; settings are kept in this browser.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Local only' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  await expect(sheet.getByText('Neutral colour')).toHaveCount(0);
  await sheet.getByRole('radio', { name: 'Colour-blind safe' }).check();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(sheet.getByRole('radio', { name: 'Colour-blind safe' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Reset all to defaults' }).click();
  await expect(sheet.getByRole('radio', { name: 'Standard' })).toBeChecked();
});

test('App settings slides over the right panel and updates the visible chart live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  const plot = page.getByTestId('chart-plot-pane-1');
  const gridLine = plot.locator('.recharts-cartesian-grid line').first();
  const lightGrid = await gridLine.evaluate(line => getComputedStyle(line).stroke);
  await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  await settings.click();
  await expect(sheet).toHaveCSS('animation-duration', '0.12s');
  await expect(sheet).not.toHaveAttribute('aria-modal', 'true');
  await expect.poll(async () => (await sheet.boundingBox())!.x).toBeCloseTo(1080, 0);
  const box = (await sheet.boundingBox())!;
  const topBar = (await page.getByTestId('topbar-groups-divider').locator('..').boundingBox())!;
  const footer = (await page.locator('.footer-bar').boundingBox())!;
  expect(box.width).toBeCloseTo(360, 0);
  expect(box.y).toBeCloseTo(topBar.y + topBar.height, 0);
  expect(box.y + box.height).toBeCloseTo(footer.y, 0);

  await sheet.getByRole('group', { name: 'Theme', exact: true }).getByRole('button', { name: 'Dark', exact: true }).click();
  await expect.poll(() => gridLine.evaluate(line => getComputedStyle(line).stroke)).not.toBe(lightGrid);
  await expect(plot.locator('.recharts-line').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(settings).toBeFocused();

  await settings.click();
  await plot.click({ position: { x: 4, y: 4 } });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close settings' }).click();
  await expect(sheet).toHaveCount(0);
});
