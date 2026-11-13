import { test, expect } from '@playwright/test';

import { acceptImport } from './import-helpers';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const labels = ['Chart', 'Table', 'Smith', 'Polar', 'Spectrogram', 'Open file…'];

test('empty picker has ordered actions and opens the chart empty state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  const pane = page.getByTestId('chart-pane-pane-1');
  const tiles = pane.locator('.ptp-tile');
  await expect(tiles).toHaveCount(6);
  await expect(pane.getByRole('button', { name: 'Eye', exact: true })).toHaveCount(0);
  const boxes = await Promise.all(labels.map((_, index) => tiles.nth(index).boundingBox()));
  const firstBox = boxes[0];
  if (!firstBox) throw new Error('Picker tile has no box');
  for (const box of boxes) { expect(box).not.toBeNull(); if (box) expect(Math.abs(box.width - firstBox.width)).toBeLessThanOrEqual(0.5); }
  await expect(pane.locator('.ptp-inner > :not(.ptp-head):not(.ptp-grid)')).toHaveCount(0);
  expect(new Set(boxes.map(box => box?.x)).size).toBe(3);
  expect(new Set(boxes.map(box => box?.y)).size).toBe(2);
  for (let i = 0; i < labels.length; i++) {
    await expect(tiles.nth(i)).toContainText(labels[i] ?? '');
    await expect(tiles.nth(i)).not.toHaveAttribute('aria-pressed', 'true');
  }
  for (const label of ['Polar', 'Spectrogram']) {
    const tile = pane.locator('.ptp-tile').filter({ hasText: label });
    await expect(tile).toHaveAttribute('aria-disabled', 'true');
    await expect(tile).toContainText(label === 'Spectrogram' ? 'needs data' : 'later');
  }
  for (const label of ['Table', 'Smith']) await expect(pane.locator('.ptp-tile').filter({ hasText: label })).not.toHaveAttribute('aria-disabled', 'true');
  const header = page.getByTestId('chart-pane-header-pane-1');
  await expect(header).toContainText('Pane 1');
  await expect(header).toContainText('Empty');
  await expect(header.getByRole('button', { name: 'Close Pane 1' })).toHaveCount(0);
  await expect(header.getByRole('button', { name: /Fit|Samples|Pane settings|Pane actions/ })).toHaveCount(0);
  await tiles.first().click();
  await expect(pane.getByText('Empty chart')).toBeVisible();
  // A typed empty pane has no Open button of its own: the top bar and the drop area open files.
  await expect(pane.getByText('Drop a file here.', { exact: true })).toBeVisible();
  await expect(pane.getByRole('button', { name: /Open file/ })).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Chart type: Chart. Change chart type' })).toBeVisible();
});

test('an empty chart retains its type after removing a trace and reopening a workspace', async ({ page }) => {
  await page.goto('/app.html');
  const pane = page.getByTestId('chart-pane-pane-1');
  const header = page.getByTestId('chart-pane-header-pane-1');
  await pane.locator('.ptp-tile').first().click();
  await page.getByTestId('app-open-input').setInputFiles({ name: 'one.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await acceptImport(page);
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  const row = page.locator('[data-testid^="trace-row-"]').first();
  await row.getByTitle('Show in panes').click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: 'Pane 1' }).click();
  await page.keyboard.press('Escape');
  await expect(pane.getByText('Empty chart')).toBeVisible();
  await expect(pane.getByText('Drop a file here, or show traces from the Traces list.', { exact: true })).toBeVisible();
  const chip = header.getByRole('button', { name: 'Chart type: Chart. Change chart type' });
  await expect(chip).toBeVisible();
  await expect(header.getByTestId('samples-toggle')).toBeVisible();
  await expect(header.getByTitle('Pane settings')).toBeVisible();
  await expect(header.getByRole('button', { name: 'Pane actions' })).toHaveCount(0);
  await chip.click();
  await expect(page.locator('.ui-popover[aria-label="Chart type"]').getByRole('radio')).toHaveCount(5);
  await page.keyboard.press('Escape');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error('Workspace download unavailable');
  const workspace = readFileSync(path);
  await page.reload();
  await page.getByTestId('topbar-workspace-input').setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: workspace });
  await expect(pane.getByText('Empty chart')).toBeVisible();
  await expect(chip).toBeVisible();
  await expect(pane.locator('.ptp-tile')).toHaveCount(0);
});

test('settings starts with Chart type, then Display and Axes, and ends with the pane actions', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('chart-pane-pane-1').locator('.ptp-tile').first().click();
  const header = page.getByTestId('chart-pane-header-pane-1');
  const chip = header.getByRole('button', { name: 'Chart type: Chart. Change chart type' });
  await header.getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  await expect(settings.getByRole('heading').first()).toHaveText('Chart type');
  await expect(settings.getByRole('radio', { name: 'Chart' })).toHaveAttribute('aria-checked', 'true');
  await expect(settings.getByRole('radio', { name: 'Smith' })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(settings.getByRole('radio')).toHaveCount(5);
  await expect(settings.getByRole('heading')).toHaveText(['Chart type', 'Display', 'Axes']);
  await expect(settings.getByRole('group', { name: 'Pane 1 actions' }).getByRole('button')).toHaveText(['Copy chart', 'Export…', 'Close pane']);
  await page.keyboard.press('Escape');
  // The separate ⋯ menu is gone; the chip still opens the chart type popover.
  await expect(header.getByRole('button', { name: 'Pane actions' })).toHaveCount(0);
  await chip.click();
  const popup = page.locator('.ui-popover[aria-label="Chart type"]');
  await expect(popup).toBeVisible();
  const anchorBox = await chip.boundingBox(); const popupBox = await popup.boundingBox();
  expect(anchorBox).not.toBeNull(); expect(popupBox).not.toBeNull();
  if (anchorBox && popupBox) {
    expect(Math.abs(popupBox.x - anchorBox.x)).toBeLessThanOrEqual(4);
    expect(Math.min(Math.abs(popupBox.y - (anchorBox.y + anchorBox.height)), Math.abs(popupBox.y + popupBox.height - anchorBox.y))).toBeLessThanOrEqual(5);
  }
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test('settings changes a saved empty Smith pane to Chart', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('chart-pane-pane-1').locator('.ptp-tile').first().click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error('Workspace download unavailable');
  const workspace: { snapshot: { panes: { renderMode: string; typed: boolean }[] } } = JSON.parse(readFileSync(path, 'utf8'));
  const savedPane = workspace.snapshot.panes[0];
  if (!savedPane) throw new Error('Workspace has no pane');
  savedPane.renderMode = 'smith';
  savedPane.typed = true;
  await page.reload();
  await page.getByTestId('topbar-workspace-input').setInputFiles({ name: 'smith-workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workspace)) });
  const header = page.getByTestId('chart-pane-header-pane-1');
  await expect(header.getByRole('button', { name: 'Chart type: Smith. Change chart type' })).toBeVisible();
  await header.getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  await expect(settings.getByRole('heading').first()).toHaveText('Chart type');
  await settings.getByRole('radio', { name: 'Chart' }).click();
  await expect(header.getByRole('button', { name: 'Chart type: Chart. Change chart type' })).toBeVisible();
  await expect(header.getByTitle('Pane settings')).toBeFocused();
  await expect(page.getByTestId('chart-pane-pane-1').getByText('Empty chart')).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 640 }]) {
  test(`four panes fit at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto('/app.html');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ Pane' }).click();
    for (let i = 1; i <= 4; i++) {
      const pane = page.getByTestId(`chart-pane-pane-${i}`);
      const box = await pane.boundingBox(); expect(box).not.toBeNull();
      const tiles = pane.locator('.ptp-tile');
      await expect(tiles).toHaveCount(6);
      for (let index = 0; index < labels.length; index++) {
        const tile = tiles.nth(index); await expect(tile).toBeVisible();
        const rect = await tile.boundingBox();
        expect(rect && box && rect.x >= box.x && rect.y >= box.y && rect.x + rect.width <= box.x + box.width && rect.y + rect.height <= box.y + box.height).toBeTruthy();
      }
      expect(await pane.locator('.ptp').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
    }
  });
}

test('header type popover is above neighbouring panes and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await acceptImport(page);
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane' }).click();
  const traceRow = page.locator('[data-testid^="trace-row-"]').first();
  await traceRow.getByTitle('Show in panes').click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.keyboard.press('Escape');
  const divider = page.getByRole('separator', { name: 'Resize panes' });
  await divider.focus(); await page.keyboard.press('End');
  const header = page.getByTestId('chart-pane-header-pane-2');
  const chip = header.getByRole('button', { name: 'Chart type: Chart. Change chart type' });
  await expect(header.locator('.ph-title')).toHaveText('Pane 2');
  expect(await header.locator('.ph-title').evaluate(el => getComputedStyle(el).textTransform)).toBe('none');
  await expect(header).not.toContainText('TARGET');
  expect(await chip.evaluate(el => el.previousElementSibling?.textContent?.trim())).toBe('Pane 2');
  await expect(header.getByTestId('samples-toggle')).toBeVisible();
  await expect(header.getByTitle('Pane settings')).toBeVisible();
  await expect(header.getByRole('button', { name: 'Pane actions' })).toHaveCount(0);
  await chip.click();
  const popup = page.locator('.ui-popover[aria-label="Chart type"]');
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('radio', { name: 'Chart' })).toBeFocused();
  await expect(popup.getByRole('radio')).toHaveCount(5);
  await expect(popup.getByRole('radio', { name: 'Smith' })).not.toHaveAttribute('aria-disabled', 'true');
  const neighbour = await page.getByTestId('chart-pane-pane-1').boundingBox();
  const popupBox = await popup.boundingBox();
  if (!neighbour || !popupBox) throw new Error('Pane or popover has no box');
  const centre = { x: popupBox.x + popupBox.width / 2, y: popupBox.y + popupBox.height / 2 };
  expect(centre.x).toBeGreaterThan(neighbour.x); expect(centre.x).toBeLessThan(neighbour.x + neighbour.width);
  expect(centre.y).toBeGreaterThan(neighbour.y); expect(centre.y).toBeLessThan(neighbour.y + neighbour.height);
  expect(await popup.evaluate((el, point) => el.contains(document.elementFromPoint(point.x, point.y)), centre)).toBe(true);
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test('hovering Smith explains which traces fit', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.getByTestId('chart-pane-header-pane-1').getByRole('button', { name: 'Chart type: Chart. Change chart type' }).click();
  const popup = page.locator('.ui-popover[aria-label="Chart type"]');
  await popup.getByRole('radio', { name: 'Smith' }).hover();
  await expect(popup.locator('.t-caption')).toHaveText('Smith shows reflections (S11, S22 …)');
});


test('opening a file in the second empty pane targets that pane', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: '+ Pane' }).click();
  await expect(page.getByTestId('chart-pane-header-pane-2').getByRole('button', { name: 'Close Pane 2' })).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('chart-pane-pane-2').getByRole('button', { name: 'Open file…' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'second.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await acceptImport(page);
  await expect(page.getByTestId('chart-plot-pane-2')).toBeVisible();
});

test('empty pane close control fits the compact header', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: '+ Pane' }).click();
  const first = await page.getByTestId('chart-pane-header-pane-1').boundingBox();
  const second = await page.getByTestId('chart-pane-header-pane-2').boundingBox();
  const close = await page.getByRole('button', { name: 'Close Pane 2' }).boundingBox();
  if (!first || !second || !close) throw new Error('Header or close control has no box');
  expect(second.height).toBeLessThanOrEqual(first.height + 1);
  expect(second.height).toBeLessThanOrEqual(32);
  expect(close.height).toBeLessThanOrEqual(24);
});

test('closing an empty pane removes that pane and can be undone', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: '+ Pane' }).click();
  await page.getByTestId('chart-pane-header-pane-1').getByRole('button', { name: 'Close Pane 1' }).click();
  await expect(page.getByTestId('chart-pane-pane-1')).toHaveCount(0);
  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('chart-pane-pane-1')).toBeVisible();
});

test('cancelling an empty-pane close preserves an unplaceable reference line', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'time.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await acceptImport(page);
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane' }).click();
  const download = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path();
  if (!path) throw new Error('Workspace download unavailable');
  const workspace: { snapshot: { refLines: { id: number; type: string; value: number; paneIds: string[]; axisUnit: string; label: string }[] } } = JSON.parse(readFileSync(path, 'utf8'));
  workspace.snapshot.refLines.push({ id: 99, type: 'v', value: 1, paneIds: ['pane-2'], axisUnit: JSON.stringify(['Hz', 'Hz']), label: 'V99' });
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('topbar-workspace-input').setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workspace)) });
  await expect(page.getByTestId('ref-line-row-V99')).toBeVisible();
  const confirmation = page.waitForEvent('dialog');
  const click = page.getByTestId('chart-pane-header-pane-2').getByRole('button', { name: 'Close Pane 2' }).click();
  const dialog = await confirmation;
  expect(dialog.message()).toContain('V99 -> not in a pane');
  await dialog.dismiss();
  await click;
  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  await expect(page.getByTestId('ref-line-row-V99')).toBeVisible();
});
