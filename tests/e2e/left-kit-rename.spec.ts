import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis } from './analysis-helpers';

test('trace rename preserves placement and marker association and is undoable', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  const row = page.locator('[data-testid^="trace-row-"]').first();
  const original = await row.getAttribute('data-testid');
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 100, y: 100 } });
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(1);
  await row.locator('.lp-name').dblclick();
  await row.getByTestId('trace-name-input').fill('Renamed trace');
  await row.getByTestId('trace-name-input').press('Enter');
  await expect(row.locator('.lp-name')).toHaveText('Renamed trace');
  await expect(row.locator('.lp-sub')).toContainText('S11');
  await expect(row.locator('.lp-sub')).toContainText('dB');
  await expect(row).toHaveAttribute('data-testid', original!);
  await expect(row.getByTitle('Show in panes')).toContainText('P1');
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(row.locator('.lp-name')).not.toHaveText('Renamed trace');
  await expect(row).toHaveAttribute('data-testid', original!);
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(row.locator('.lp-name')).toHaveText('Renamed trace');
  await expect(row).toHaveAttribute('data-testid', original!);
  const download = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path();
  await page.getByRole('button', { name: 'Clear All' }).click();
  await page.getByTestId('topbar-workspace-input').setInputFiles(path!);
  await expect(page.locator('[data-testid^="trace-row-"]').first().locator('.lp-name')).toHaveText('Renamed trace');
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toHaveAttribute('data-testid', original!);
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(1);
});


test('derived trace rename is undoable and keeps its identity', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  const card = await addAnalysis(page, 'Offset / Scale');
  await card.getByRole('button', { name: 'Create trace' }).click();
  const initial = page.locator('[data-testid^="trace-row-"]').filter({ has: page.locator('.lp-trace__fx') }).first();
  const id = await initial.getAttribute('data-testid');
  const row = page.getByTestId(id!);
  await expect(row.getByRole('button', { name: /^Trace menu: / })).toHaveCount(0);
  await row.locator('.lp-name').click();
  if (!(await row.getByTestId('trace-name-input').isVisible())) await row.locator('.lp-name').click();
  await row.getByTestId('trace-name-input').fill('Custom derived');
  await row.getByTestId('trace-name-input').press('Enter');
  await expect(row.locator('.lp-name')).toHaveText('Custom derived');
  await expect(row).toHaveAttribute('data-testid', id!);
  await page.keyboard.press('Control+z');
  await expect(row.locator('.lp-name')).not.toHaveText('Custom derived');
  await page.keyboard.press('Control+Shift+z');
  await expect(row.locator('.lp-name')).toHaveText('Custom derived');
});
