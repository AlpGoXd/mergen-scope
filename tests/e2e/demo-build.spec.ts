import { expect, test } from '@playwright/test';
import { acceptImport } from './import-helpers';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Builds demo-assets/demo.json with the app's own Save, from sample files already in the repo.
// Run: BUILD_DEMO=1 npx playwright test tests/e2e/demo-build.spec.ts
// Files used: test files/cascaded chain.s2p (S11, S21, S12, S22), test files/waveform_sinc_test.csv (scope capture) and test files/cascade_ip3_-12dBm.DAT (two-tone spectrum for IP3).
test('build the demo workspace', async ({ page }) => {
  test.skip(!process.env['BUILD_DEMO'], 'set BUILD_DEMO=1 to rebuild demo-assets/demo.json');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  const rows = page.locator('[data-testid^="trace-row-"]');
  await expect(rows.first()).toBeVisible();
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();

  // Pane 1: S21 and S11 with M1 at the S21 peak, a delta marker and a V line.
  await rows.filter({ hasText: 'S21' }).first().locator('.lp-name').click();
  await page.getByRole('button', { name: 'Peak', exact: true }).click();
  await expect(page.locator('[data-testid^="marker-row-"]').first()).toBeVisible();
  const plot = page.getByTestId('chart-plot-pane-1');
  const box = await plot.boundingBox();
  if (!box) throw new Error('plot box');
  await page.getByLabel('Choose a delta marker reference').click();
  await page.getByRole('menuitem', { name: /Δ from M1/ }).click();
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'V-Line' }).click();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await expect(page.locator('[data-testid^="ref-line-row-"]').first()).toBeVisible();

  // Pane 2: Smith with S11, range around the passband.
  await page.getByRole('button', { name: '+ Pane' }).click();
  const pane2 = page.getByTestId('chart-pane-pane-2');
  await expect(pane2).toBeVisible();
  await pane2.locator('.ptp-tile').first().waitFor();
  await pane2.getByRole('button', { name: /Smith/ }).first().click();
  await expect(pane2.getByText('Empty Smith chart')).toBeVisible();
  await page.getByTestId('chart-pane-header-pane-2').click({ position: { x: 20, y: 10 } });
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(pane2.getByTestId('smith-pane')).toBeVisible();
  await expect(pane2.locator('[data-testid^="smith-trace-"]').first()).toBeVisible();
  for (const [which, value] of [['start', '1.2 GHz'], ['stop', '1.6 GHz']] as const) {
    const control = pane2.getByTestId(`smith-range-${which}`);
    await control.click();
    await expect(control).toHaveJSProperty('tagName', 'INPUT');
    await control.fill(value);
    await control.press('Enter');
    await expect(control).toHaveJSProperty('tagName', 'BUTTON');
  }
  await expect(pane2.getByTestId('smith-range-label')).toContainText('1.200');

  // Pane 3: a scope CSV (time domain gets its own pane).
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/waveform_sinc_test.csv'));
  await acceptImport(page);
  const add = page.getByRole('button', { name: /^Add \d+ traces?$/ });
  if (await add.isVisible({ timeout: 3000 }).catch(() => false)) await add.click();
  await expect(page.getByTestId('chart-pane-pane-3')).toBeVisible();

  // Pane 4: the two-tone capture for IP3, in its own Chart pane.
  await page.getByTestId('chart-pane-header-pane-3').click({ position: { x: 20, y: 10 } });
  await page.getByRole('button', { name: '+ Pane' }).click();
  const pane4 = page.getByTestId('chart-pane-pane-4');
  await expect(pane4).toBeVisible();
  await pane4.locator('.ptp-tile').first().click();
  await page.getByTestId('chart-pane-header-pane-4').click({ position: { x: 20, y: 10 } });
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(pane4.locator('.recharts-line-curve').first()).toBeVisible();

  // Layout: 2 x 2.
  await page.getByRole('button', { name: /^Layout:/ }).click();
  await page.locator('.ui-popover[aria-label="Layout"]').getByRole('button', { name: /2 × 2/ }).click();
  await page.keyboard.press('Escape');

  // Analysis: Bandwidth on S21 and one Smooth trace.
  await rows.filter({ hasText: 'S21' }).first().locator('.lp-name').click();
  await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  await page.locator('.an-panel__head').getByRole('button', { name: '+ Add analysis' }).click();
  await page.getByRole('dialog', { name: 'Add analysis' }).getByRole('option', { name: /^Bandwidth/ }).click();
  await page.locator('.an-panel__head').getByRole('button', { name: '+ Add analysis' }).click();
  await page.getByRole('dialog', { name: 'Add analysis' }).getByRole('option', { name: /^Smooth/ }).click();
  const smooth = page.locator('.an-card').filter({ has: page.locator('.an-card__title').filter({ hasText: 'Smooth' }) }).first();
  await smooth.getByRole('button', { name: 'Create trace' }).click();
  await page.keyboard.press('Escape');

  // IP3 on the two-tone capture: Auto-place markers finds F1, F2, IM3L and IM3U.
  await rows.filter({ hasText: 'cascade_ip3' }).first().locator('.lp-name').click();
  await page.locator('.an-panel__head').getByRole('button', { name: '+ Add analysis' }).click();
  await page.getByRole('dialog', { name: 'Add analysis' }).getByRole('option', { name: /^IP3/ }).click();
  const ip3 = page.locator('.an-card').filter({ has: page.locator('.an-card__title').filter({ hasText: 'IP3' }) }).first();
  await ip3.getByRole('button', { name: 'Auto-place markers' }).click();
  await expect(ip3).toContainText('OIP3');
  await page.keyboard.press('Escape');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const path = await download.path();
  if (!path) throw new Error('Workspace download was unavailable');
  await copyFile(path, resolve('demo-assets/demo.json'));
});
