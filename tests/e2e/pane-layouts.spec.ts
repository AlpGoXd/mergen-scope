import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { resolve } from 'path';

const fixture = resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT');
const pane = (page: Page, id: number) => page.getByTestId(`chart-pane-pane-${id}`);
const layoutButton = (page: Page) => page.getByRole('button', { name: /^Layout:/ });
const menu = (page: Page) => page.locator('.ui-popover[aria-label="Layout"]');
const tile = (page: Page, name: string) => menu(page).locator('[data-layout-tile]').filter({ has: page.getByText(name, { exact: true }) });
async function addPanes(page: Page, count: number) {
  const initial = await page.locator('[data-testid^="chart-pane-pane-"]').count();
  for (let n = initial + 1; n <= count; n++) { await page.getByRole('button', { name: '+ Pane', exact: true }).click(); await expect(pane(page, n)).toBeVisible(); }
}
async function selectLayout(page: Page, name: string) {
  await layoutButton(page).click();
  await expect(menu(page)).toBeVisible();
  await tile(page, name).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(layoutButton(page)).toContainText(name);
}
async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error('Expected a visible box');
  return value;
}
async function moveDivider(page: Page, divider: Locator, dx: number, dy: number) {
  const rect = await box(divider);
  // Avoid the crossing of the grid's horizontal and vertical separators.
  const x = rect.x + (rect.width > rect.height ? rect.width / 4 : rect.width / 2);
  const y = rect.y + (rect.height > rect.width ? rect.height / 4 : rect.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
}
async function loadTrace(page: Page) {
  await page.getByTestId('app-open-input').setInputFiles(fixture);
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
}

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/app.html'); });

test('preset availability, reasons, keyboard selection and focus return', async ({ page }) => {
  await expect(layoutButton(page)).toBeEnabled();
  await expect(layoutButton(page)).toContainText('Rows');
  await addPanes(page, 2);
  await layoutButton(page).click();
  await expect(tile(page, 'Rows')).toHaveAttribute('aria-pressed', 'true');
  await expect(tile(page, 'Columns')).toHaveAttribute('aria-disabled', 'false');
  for (const [name, reason] of [['2 × 2', '2 × 2 needs exactly 4 panes'], ['1 + side', '1 + side needs 3 or 4 panes']] as const) {
    const item = tile(page, name); await expect(item).toBeVisible(); await expect(item).toHaveAttribute('aria-disabled', 'true');
    await expect(item).toHaveCSS('border-top-style', 'dashed'); await expect(item).toContainText(reason);
  }
  await expect(tile(page, 'Rows')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(tile(page, 'Columns')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(layoutButton(page)).toContainText('Columns'); await expect(layoutButton(page)).toBeFocused();
  await layoutButton(page).click(); await page.keyboard.press('Escape'); await expect(menu(page)).toHaveCount(0); await expect(layoutButton(page)).toBeFocused();
  await addPanes(page, 3); await layoutButton(page).click();
  await expect(tile(page, '1 + side')).toHaveAttribute('aria-disabled', 'false');
  await expect(tile(page, '2 × 2')).toHaveAttribute('aria-disabled', 'true');
  await expect(tile(page, '2 × 2')).toContainText('2 × 2 needs exactly 4 panes');
});

test('four panes form the requested grid, columns and one plus side', async ({ page }) => {
  await addPanes(page, 4);
  const ordered = [pane(page, 1), pane(page, 4), pane(page, 3), pane(page, 2)];
  await selectLayout(page, '2 × 2');
  const [a, b, c, d] = await Promise.all(ordered.map(box));
  if (!a || !b || !c || !d) throw new Error('Missing pane');
  expect(b.x).toBeGreaterThan(a.x); expect(c.y).toBeGreaterThan(a.y);
  expect(Math.abs(a.y - b.y)).toBeLessThan(2); expect(Math.abs(c.y - d.y)).toBeLessThan(2);
  expect(Math.abs(a.x - c.x)).toBeLessThan(2); expect(Math.abs(b.x - d.x)).toBeLessThan(2);
  expect(Math.abs(a.width - b.width)).toBeLessThan(3); expect(Math.abs(a.height - c.height)).toBeLessThan(3);
  await selectLayout(page, 'Columns');
  const columns = await Promise.all(ordered.map(box));
  for (let i = 1; i < columns.length; i++) { expect(columns[i]?.x).toBeGreaterThan(columns[i - 1]?.x ?? Infinity); expect(Math.abs((columns[i]?.y ?? 0) - (columns[0]?.y ?? 0))).toBeLessThan(2); }
  await selectLayout(page, '1 + side');
  const [main, first, second, third] = await Promise.all(ordered.map(box));
  if (!main || !first || !second || !third) throw new Error('Missing pane');
  expect(first.x).toBeGreaterThan(main.x); expect(second.y).toBeGreaterThan(first.y); expect(third.y).toBeGreaterThan(second.y);
  expect(Math.abs(main.y - first.y)).toBeLessThan(2); expect(Math.abs(main.y + main.height - third.y - third.height)).toBeLessThan(2);
});

test('dragging, minimums, reset and keyboard resize are undoable', async ({ page }) => {
  await addPanes(page, 2);
  const divider = page.getByRole('separator', { name: 'Resize panes' });
  await expect(divider).toHaveAttribute('aria-orientation', 'horizontal');
  const before = await box(pane(page, 1));
  await moveDivider(page, divider, 0, 80);
  await expect(divider.locator('.layout-divider__tag')).toHaveText(/\d+% · \d+%/);
  const colours = await divider.evaluate(el => ({ actual: getComputedStyle(el, '::after').backgroundColor, opacity: getComputedStyle(el, '::after').opacity, thickness: getComputedStyle(el, '::after').height, accent: getComputedStyle(el).getPropertyValue('--accent').trim() }));
  expect(colours.opacity).toBe('1'); expect(colours.thickness).toBe('2px');
  const resolvedAccent = await divider.evaluate((el, accent) => { const probe = document.createElement('span'); probe.style.color = accent; el.appendChild(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; }, colours.accent);
  expect(colours.actual).toBe(resolvedAccent);
  await page.mouse.up(); await expect.poll(async () => (await box(pane(page, 1))).height).toBeGreaterThan(before.height + 30);
  await page.keyboard.press('Control+z'); await expect.poll(async () => Math.abs((await box(pane(page, 1))).height - before.height)).toBeLessThan(3);
  await divider.focus(); await page.keyboard.press('ArrowDown'); await expect.poll(async () => (await box(pane(page, 1))).height).toBeGreaterThan(before.height);
  await page.keyboard.press('Shift+ArrowDown'); const larger = await box(pane(page, 1)); expect(larger.height).toBeGreaterThan(before.height + 20);
  await page.keyboard.press('Home'); await expect.poll(async () => (await box(pane(page, 1))).height).toBeGreaterThanOrEqual(119);
  await moveDivider(page, divider, 0, 2000); await page.mouse.up(); expect((await box(pane(page, 2))).height).toBeGreaterThanOrEqual(119);
  await divider.dblclick(); const a = await box(pane(page, 1)); const b = await box(pane(page, 2)); expect(Math.abs(a.height - b.height)).toBeLessThan(3);
});

test('Escape cancels a pointer drag without adding an undo step', async ({ page }) => {
  await addPanes(page, 2); await selectLayout(page, 'Columns');
  const divider = page.getByRole('separator', { name: 'Resize panes' });
  const before = (await box(pane(page, 1))).width;
  await moveDivider(page, divider, 90, 0);
  await expect(divider).toHaveClass(/is-dragging/);
  await expect.poll(async () => (await box(pane(page, 1))).width).toBeGreaterThan(before + 30);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(divider).not.toHaveClass(/is-dragging/);
  await expect.poll(async () => Math.abs((await box(pane(page, 1))).width - before)).toBeLessThan(3);
  await page.keyboard.press('Control+z'); await expect(layoutButton(page)).toContainText('Rows');
});

test('sizes persist by layout and through workspace save and reopen', async ({ page }) => {
  await loadTrace(page); await addPanes(page, 2);
  const horizontal = page.getByRole('separator', { name: 'Resize panes' });
  await moveDivider(page, horizontal, 0, 65); await page.mouse.up();
  const rowHeight = (await box(pane(page, 1))).height;
  await selectLayout(page, 'Columns');
  const vertical = page.getByRole('separator', { name: 'Resize panes' });
  await moveDivider(page, vertical, 90, 0); await page.mouse.up();
  const columnWidth = (await box(pane(page, 1))).width;
  await selectLayout(page, 'Rows'); expect(Math.abs((await box(pane(page, 1))).height - rowHeight)).toBeLessThan(3);
  await selectLayout(page, 'Columns'); expect(Math.abs((await box(pane(page, 1))).width - columnWidth)).toBeLessThan(3);
  await page.keyboard.press('Control+z'); await expect(layoutButton(page)).toContainText('Rows');
  await selectLayout(page, 'Columns');
  const download = page.waitForEvent('download'); await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path(); if (!path) throw new Error('Workspace download missing');
  await page.getByRole('button', { name: 'Clear All' }).click();
  page.once('dialog', dialog => dialog.accept()); await page.getByTestId('topbar-workspace-input').setInputFiles(path);
  await expect(layoutButton(page)).toContainText('Columns'); await expect(pane(page, 2)).toBeVisible();
  await expect.poll(async () => Math.abs((await box(pane(page, 1))).width - columnWidth)).toBeLessThan(3);
  await selectLayout(page, 'Rows'); await expect.poll(async () => Math.abs((await box(pane(page, 1))).height - rowHeight)).toBeLessThan(3);
});

test('a resized four-pane grid survives saving and reopening', async ({ page }) => {
  await loadTrace(page); await addPanes(page, 4); await selectLayout(page, '2 × 2');
  // The grid's vertical divider spans both rows.
  const vertical = page.getByRole('separator', { name: 'Resize panes' }).and(page.locator('[aria-orientation="vertical"]'));
  await expect(vertical).toHaveCount(1);
  await vertical.focus(); await expect(vertical).toBeFocused();
  const before = (await box(pane(page, 1))).width;
  const beforeLower = (await box(pane(page, 3))).width;
  await moveDivider(page, vertical, 80, 0); await expect(vertical).toHaveClass(/is-dragging/); await page.mouse.up();
  await expect.poll(async () => (await box(pane(page, 1))).width).toBeGreaterThan(before + 30);
  await expect.poll(async () => (await box(pane(page, 3))).width).toBeGreaterThan(beforeLower + 30);
  const resized = (await box(pane(page, 1))).width;
  const download = page.waitForEvent('download'); await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path(); if (!path) throw new Error('Workspace download missing');
  await page.getByRole('button', { name: 'Clear All' }).click();
  page.once('dialog', dialog => dialog.accept()); await page.getByTestId('topbar-workspace-input').setInputFiles(path);
  await expect(layoutButton(page)).toContainText('2 × 2'); await expect(pane(page, 4)).toBeVisible();
  await expect.poll(async () => Math.abs((await box(pane(page, 1))).width - resized)).toBeLessThan(3);
});

test('inserting after the target renumbers badges and grid falls back on removal', async ({ page }) => {
  await loadTrace(page); await addPanes(page, 2);
  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await trace.getByTitle('Show in panes').click(); await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await expect(page.getByTestId('chart-pane-header-pane-3').locator('.ph-title')).toHaveText('Pane 2');
  await expect(page.getByTestId('chart-pane-header-pane-2').locator('.ph-title')).toHaveText('Pane 3');
  await expect(trace).toContainText('P3');
  await page.getByRole('button', { name: '+ Pane', exact: true }).click(); await selectLayout(page, '2 × 2');
  await page.getByRole('button', { name: '- Pane', exact: true }).click();
  await expect(layoutButton(page)).toContainText('Rows'); await expect(pane(page, 2)).toHaveCount(0);
});

test('adding a fifth pane falls back from grid to Rows', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'App settings' });
  await settings.getByRole('checkbox', { name: /Allow more than 4 panes/ }).check();
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await addPanes(page, 4); await selectLayout(page, '2 × 2');
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await expect(pane(page, 5)).toBeVisible(); await expect(layoutButton(page)).toContainText('Rows');
});

test('closing the last pane moves a trace to the nearest compatible pane', async ({ page }) => {
  await loadTrace(page); await addPanes(page, 2);
  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await trace.getByTitle('Show in panes').click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 1/ }).click();
  await page.keyboard.press('Escape');
  await expect(trace).toContainText('P2'); await expect(trace).not.toContainText('P1');
  await page.getByRole('button', { name: '- Pane', exact: true }).click();
  await expect(pane(page, 2)).toHaveCount(0); await expect(trace).toContainText('P1');
});

test('closing an incompatible pane leaves its trace unplaced', async ({ page }) => {
  await loadTrace(page); await addPanes(page, 2);
  await pane(page, 2).evaluate(target => { const transfer = new DataTransfer(); transfer.items.add(new File(['Time (s),CH1 (V)\n0,1\n1,2\n'], 'time.csv', { type: 'text/csv' })); for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer })); });
  const trace = page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'time.csv' }).first(); await expect(trace).toContainText('P2');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '- Pane', exact: true }).click();
  await expect(pane(page, 2)).toHaveCount(0); await expect(trace.getByTitle('Show in panes')).toContainText('—');
});

test('linked Rows show X ticks only on the bottom pane', async ({ page }) => {
  await loadTrace(page); await addPanes(page, 2);
  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await trace.getByTitle('Show in panes').click(); await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click(); await page.keyboard.press('Escape');
  await expect(page.getByTestId('chart-plot-pane-1').locator('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveCount(0);
  await expect(page.getByTestId('chart-plot-pane-2').locator('.recharts-xAxis .recharts-cartesian-axis-tick').first()).toBeVisible();
});

test.fixme('unlinked Rows show X ticks on each pane (no UI currently controls zoomAll)', async ({ page }) => {
  await loadTrace(page); await addPanes(page, 2);
  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await trace.getByTitle('Show in panes').click(); await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click(); await page.keyboard.press('Escape');
  // Toggle zoomAll off here when a link control is available.
  for (const id of [1, 2]) await expect(page.getByTestId(`chart-plot-pane-${id}`).locator('.recharts-xAxis .recharts-cartesian-axis-tick').first()).toBeVisible();
});
