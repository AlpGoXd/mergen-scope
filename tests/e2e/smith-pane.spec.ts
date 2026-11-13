import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { resolve } from 'node:path';

const reason = 'Smith shows reflections (S11, S22 …)';

async function openNetwork(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(page.getByTestId('touchstone-cell-S11')).toBeVisible();
}

async function chooseSecondSmith(page: Page) {
  await page.getByRole('button', { name: '+ Pane' }).click();
  const pane = page.getByTestId('chart-pane-pane-2');
  const tile = pane.locator('.ptp-tile').filter({ hasText: 'Smith' });
  await expect(tile).not.toHaveAttribute('aria-disabled', 'true');
  await tile.click();
  await expect(pane.getByText('Empty Smith chart')).toBeVisible();
  return pane;
}

async function tracePoint(path: Locator) {
  return path.evaluate(element => {
    const curve = element as SVGPathElement;
    const point = curve.getPointAtLength(curve.getTotalLength() * 0.5);
    const matrix = curve.getScreenCTM();
    if (!matrix) throw new Error('Smith trace has no screen transform');
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  });
}

test('picker, reflection matrix, hover, marker and fit', async ({ page }) => {
  await openNetwork(page);
  const pane = await chooseSecondSmith(page);
  const s21 = page.getByTestId('touchstone-cell-S21');
  await expect(s21).toBeDisabled();
  await expect(s21).toHaveAttribute('aria-disabled', 'true');
  await expect(s21).toHaveAttribute('title', reason);
  await page.getByTestId('touchstone-cell-S11').click();
  await page.getByTestId('touchstone-cell-S22').click();
  const plot = pane.getByTestId('smith-plot');
  await expect(plot).toBeVisible();
  await expect(plot).toHaveAttribute('aria-label', /S11/);
  await expect(plot).toHaveAttribute('aria-label', /S22/);
  await expect(pane.locator('[data-testid^="smith-trace-"]')).toHaveCount(2);
  await expect(pane.getByTestId('smith-grid-z')).toBeVisible();
  const path = pane.locator('[data-testid^="smith-trace-"] path').first();
  await expect(path).toBeAttached();
  const point = await tracePoint(path);
  await page.mouse.move(point.x, point.y);
  await expect(pane.getByTestId('smith-hover-card')).toBeVisible();
  await expect(pane.getByTestId('smith-hover-grid')).toBeAttached();
  // The matrix cell retains button focus; global shortcuts ignore native controls.
  await plot.focus();
  await page.keyboard.press('n');
  await expect(page.getByRole('button', { name: 'New Marker' })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(point.x, point.y);
  await expect(pane.locator('[data-testid^="smith-marker-"]')).toHaveCount(1);
  await expect(pane.locator('[data-testid^="smith-marker-"]')).toHaveClass(/is-selected/);
  await expect(pane.getByTestId('smith-readout').locator('[data-field="marker"]')).toContainText('M1');
  for (const field of ['z', 'gamma', 'vswr']) await expect(pane.getByTestId('smith-readout').locator(`[data-field="${field}"]`)).toBeVisible();
  await plot.focus();
  await page.keyboard.press('n');
  await expect(page.getByRole('button', { name: 'New Marker' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'New Marker' })).toHaveAttribute('aria-pressed', 'false');
  const transform = pane.getByTestId('smith-grid-z').locator('..');
  const original = await transform.getAttribute('transform');
  await plot.hover();
  await page.mouse.wheel(0, -400);
  await expect(transform).not.toHaveAttribute('transform', original ?? '');
  await plot.dblclick();
  await expect(transform).toHaveAttribute('transform', original ?? '');
});

test('Chart type and settings expose Smith; cancel and undo preserve S21', async ({ page }) => {
  await openNetwork(page);
  await page.getByTestId('touchstone-cell-S21').click();
  const header = page.getByTestId('chart-pane-header-pane-1');
  const chip = header.getByRole('button', { name: 'Chart type: Chart. Change chart type' });
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await header.getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  await expect(settings.getByRole('radio', { name: 'Smith' })).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  const startChange = async () => {
    await chip.click();
    const menu = page.locator('.ui-popover[aria-label="Chart type"]');
    const smith = menu.getByRole('radio', { name: 'Smith' });
    await expect(smith).not.toHaveAttribute('aria-disabled', 'true');
    await smith.click();
    const confirm = page.getByRole('alertdialog', { name: 'Show Pane 1 as Smith?' });
    await expect(confirm).toContainText('S21');
    await expect(confirm).toContainText('Not in a pane');
    return confirm;
  };
  let confirm = await startChange();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(chip).toBeVisible();
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.keyboard.press('Escape');
  confirm = await startChange();
  await confirm.getByRole('button', { name: 'Show as Smith' }).click();
  await expect(header.getByRole('button', { name: 'Chart type: Smith. Change chart type' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(chip).toBeVisible();
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  const s21 = page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'S21' }).first();
  await expect(s21).toBeVisible();
  await expect(s21).toContainText('P1');
});

test('linked chart zoom dims out-of-band Smith data and publishes the cursor', async ({ page }) => {
  await openNetwork(page);
  const pane = await chooseSecondSmith(page);
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(pane.getByTestId('smith-plot')).toBeVisible();
  await expect(pane.getByTestId('smith-active-area')).toBeAttached();
  const chart = page.getByTestId('chart-plot-pane-1');
  const box = await chart.boundingBox();
  if (!box) throw new Error('Chart has no bounds');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.35, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(pane.locator('[data-testid^="smith-trace-"] path.is-faint')).toHaveCount(0);
  await expect(pane.locator('[data-testid^="smith-trace-"] path:not(.is-faint)').first()).toBeAttached();
  await page.getByTestId('chart-pane-header-pane-2').getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 2 settings"]');
  await expect(settings.getByRole('button', { name: 'Hidden', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: 'Faint', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(pane.locator('[data-testid^="smith-trace-"] path.is-faint').first()).toBeAttached();
  await expect(pane.locator('[data-testid^="smith-trace-"] path:not(.is-faint)').first()).toBeAttached();
  await page.mouse.move(box.x + box.width * 0.4, y);
  const ghost = pane.getByTestId('smith-ghost').first();
  await expect(ghost).toBeVisible();
  const before = await ghost.getAttribute('cx');
  await page.mouse.move(box.x + box.width * 0.65, y);
  await expect(ghost).not.toHaveAttribute('cx', before ?? '');
});

test('a marker drags along its own Smith trace as one undo step', async ({ page }) => {
  await openNetwork(page);
  const pane = await chooseSecondSmith(page);
  await page.getByTestId('touchstone-cell-S11').click();
  const path = pane.locator('[data-testid^="smith-trace-"] path').first();
  await expect(path).toBeAttached();
  const at = async (fraction: number) => path.evaluate((element, f) => {
    const curve = element as SVGPathElement;
    const point = curve.getPointAtLength(curve.getTotalLength() * f);
    const matrix = curve.getScreenCTM();
    if (!matrix) throw new Error('no transform');
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, fraction);
  const from = await at(0.3), to = await at(0.36);
  await pane.getByTestId('smith-plot').focus();
  await page.keyboard.press('n');
  await page.mouse.click(from.x, from.y);
  const marker = pane.locator('[data-testid^="smith-marker-"]');
  await expect(marker).toHaveCount(1);
  const frequency = pane.getByTestId('smith-readout').locator('[data-field="frequency"]');
  const before = await frequency.innerText();
  const glyph = async () => (await marker.locator('.smith-marker-glyph').boundingBox())!;
  const start = await glyph();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(frequency).not.toHaveText(before);
  await page.mouse.up();
  // The marker followed the pointer and stayed on the trace; no second marker was placed.
  await expect(marker).toHaveCount(1);
  const end = await glyph();
  expect(Math.hypot(end.x + end.width / 2 - to.x, end.y + end.height / 2 - to.y)).toBeLessThan(12);
  const after = await frequency.innerText();
  expect(after).not.toBe(before);
  await page.keyboard.press('Control+z');
  await expect(frequency).toHaveText(before);
  await page.keyboard.press('Control+y');
  await expect(frequency).toHaveText(after);
});
