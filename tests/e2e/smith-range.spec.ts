import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { resolve } from 'node:path';

const fullSpan = 'of 10 kHz–8.5 GHz';
const manualLabel = '2.400 → 2.500 GHz of 10 kHz–8.5 GHz';

async function openSmith(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(page.getByTestId('touchstone-cell-S11')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane' }).click();
  const pane = page.getByTestId('chart-pane-pane-2');
  const tile = pane.locator('.ptp-tile').filter({ hasText: 'Smith' });
  await expect(tile).not.toHaveAttribute('aria-disabled', 'true');
  await tile.click();
  await expect(pane.getByText('Empty Smith chart')).toBeVisible();
  await expect(page.getByTestId('touchstone-cell-S21')).toBeDisabled();
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(pane.getByTestId('smith-range-bar')).toBeVisible();
  await expect(pane.locator('[data-testid^="smith-trace-"]')).toHaveCount(1);
  return pane;
}

async function setValue(pane: Locator, which: 'start' | 'stop', value: string) {
  const control = pane.getByTestId(`smith-range-${which}`);
  await control.click();
  await expect(control).toHaveJSProperty('tagName', 'INPUT');
  await control.fill(value);
  await control.press('Enter');
  await expect(control).toHaveJSProperty('tagName', 'BUTTON');
}

async function setManualRange(pane: Locator) {
  await setValue(pane, 'start', '2.4 GHz');
  await setValue(pane, 'stop', '2.5 GHz');
  await expect(pane.getByTestId('smith-range-label')).toHaveText(manualLabel);
}

async function pointCount(pane: Locator): Promise<number> {
  return pane.locator('[data-testid^="smith-trace-"] path').evaluateAll(paths => paths.reduce((sum, path) => sum + ((path.getAttribute('d') ?? '').match(/[ML]/g) ?? []).length, 0));
}

async function endPositions(pane: Locator): Promise<string[]> {
  return pane.locator('.smith-ends circle').evaluateAll(circles => circles.map(circle => `${circle.getAttribute('cx')},${circle.getAttribute('cy')}`));
}

async function settingsForSmith(page: Page): Promise<Locator> {
  await page.getByTestId('chart-pane-header-pane-2').getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 2 settings"]');
  await expect(settings).toBeVisible();
  return settings;
}

test('Smith type change removes S21 from the pane', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(page.getByTestId('touchstone-cell-S21')).toBeVisible();
  await page.getByTestId('touchstone-cell-S21').click();
  const header = page.getByTestId('chart-pane-header-pane-1');
  await header.getByRole('button', { name: 'Chart type: Chart. Change chart type' }).click();
  await page.locator('.ui-popover[aria-label="Chart type"]').getByRole('radio', { name: 'Smith' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Show Pane 1 as Smith?' });
  await expect(confirm).toContainText('S21');
  await expect(confirm).toContainText('Not in a pane');
  await confirm.getByRole('button', { name: 'Show as Smith' }).click();
  await expect(page.getByTestId('chart-pane-pane-1').getByTestId('smith-plot')).not.toHaveAttribute('aria-label', /S21/);
  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'S21' }).first()).not.toContainText('P1');
});

test('manual clipping, full range, faint display, keyboard and invalid input', async ({ page }) => {
  const pane = await openSmith(page);
  const label = pane.getByTestId('smith-range-label');
  await expect(label).toContainText(fullSpan);
  const trace = pane.locator('[data-testid^="smith-trace-"]');
  await expect(trace.locator('path').first()).toBeAttached();
  await expect(pane.locator('.smith-ends circle')).toHaveCount(2);
  const initialCount = await pointCount(pane);
  const initialEnds = await endPositions(pane);
  const settings = await settingsForSmith(page);
  await expect(settings.getByRole('button', { name: 'Hidden', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await setManualRange(pane);
  await expect.poll(() => pointCount(pane)).toBeLessThan(initialCount);
  await expect.poll(() => endPositions(pane)).not.toEqual(initialEnds);
  const clippedCount = await pointCount(pane);
  await pane.getByTestId('smith-range-full').click();
  await expect.poll(() => pointCount(pane)).toBe(initialCount);
  await setManualRange(pane);
  const display = await settingsForSmith(page);
  await display.getByRole('button', { name: 'Faint', exact: true }).click();
  await expect(display.getByRole('button', { name: 'Faint', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(trace.locator('path.is-faint').first()).toBeAttached();
  await expect.poll(() => pointCount(pane)).toBeGreaterThan(clippedCount);
  await page.keyboard.press('Escape');
  const startHandle = pane.getByTestId('smith-range-handle-start');
  const before = Number(await startHandle.getAttribute('aria-valuenow'));
  await startHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await startHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  const currentStart = await startHandle.getAttribute('aria-valuenow');
  const currentStop = await pane.getByTestId('smith-range-handle-stop').getAttribute('aria-valuenow');
  const stop = pane.getByTestId('smith-range-stop');
  await stop.click();
  await stop.fill('1 GHz');
  await stop.press('Enter');
  await expect(stop).toHaveAttribute('aria-invalid', 'true');
  await expect(pane.getByTestId('smith-range-handle-start')).toHaveAttribute('aria-valuenow', currentStart ?? '');
  await expect(pane.getByTestId('smith-range-handle-stop')).toHaveAttribute('aria-valuenow', currentStop ?? '');
  await stop.press('Escape');
  await expect(stop).toHaveJSProperty('tagName', 'BUTTON');
});

test('a handle drag is one silent undo step', async ({ page }) => {
  const pane = await openSmith(page);
  await setManualRange(pane);
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
  if (await dismiss.isVisible()) await dismiss.click();
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  const handle = pane.getByTestId('smith-range-handle-start');
  const before = await handle.getAttribute('aria-valuenow');
  const box = await handle.boundingBox();
  if (!box) throw new Error('Range handle has no bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute('aria-valuenow', before ?? '');
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await handle.focus();
  await page.keyboard.press('Control+z');
  await expect(handle).toHaveAttribute('aria-valuenow', before ?? '');
  await expect(pane.getByTestId('smith-range-label')).toHaveText(manualLabel);
  await expect(page.locator('.ui-toast')).toHaveCount(0);
});

test('range and outside choice survive workspace save and reload', async ({ page }) => {
  const pane = await openSmith(page);
  await setManualRange(pane);
  const settings = await settingsForSmith(page);
  await settings.getByRole('button', { name: 'Faint', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Faint', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path();
  if (!path) throw new Error('Workspace download has no path');
  await page.reload();
  await page.getByTestId('topbar-workspace-input').setInputFiles(path);
  const restored = page.getByTestId('chart-pane-pane-2');
  await expect(restored.getByTestId('smith-range-bar')).toBeVisible();
  await expect(restored.getByTestId('smith-range-label')).toHaveText(manualLabel);
  const reopened = await settingsForSmith(page);
  await expect(reopened.getByRole('button', { name: 'Faint', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('shared chart zoom follows the chart and disables range controls', async ({ page }) => {
  const pane = await openSmith(page);
  await setManualRange(pane);
  const chart = page.getByTestId('chart-plot-pane-1');
  await expect(chart).toBeVisible();
  const box = await chart.boundingBox();
  if (!box) throw new Error('Chart has no bounds');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.35, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(pane.getByTestId('smith-range-linked')).toHaveText('Linked to Pane 1');
  await expect(pane.getByTestId('smith-range-label')).toContainText(fullSpan);
  for (const which of ['start', 'stop']) {
    await expect(pane.getByTestId(`smith-range-handle-${which}`)).toHaveAttribute('aria-disabled', 'true');
    await expect(pane.getByTestId(`smith-range-handle-${which}`)).toBeDisabled();
    await expect(pane.getByTestId(`smith-range-${which}`)).toBeDisabled();
  }
  await expect(pane.getByTestId('smith-range-full')).toBeDisabled();
  // Clearing the shared zoom returns to the saved manual range.
  await page.getByTestId('chart-pane-header-pane-1').getByTitle('Fit X and Y to traces').click();
  await expect(pane.getByTestId('smith-range-linked')).toHaveCount(0);
  await expect(pane.getByTestId('smith-range-label')).toHaveText(manualLabel);
});

test.fixme('unlinking the X link restores the manual Smith range', async () => {
  // No UI currently calls SET_ZOOM_ALL or useXControls.setZoomAll.
});
