import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

// LL-2 on the chart: kit ChartLine copies, one lit id, drag, right-click menu, edge tags (board 37-P4c).
async function twoPanesWithLine(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await trace.getByTitle('Show in panes').click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'V-Line' }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 60 } });
  const placed = page.getByTestId('ref-line-row-V1');
  await expect(placed).toContainText('Shown in P1');
  await expect(placed).not.toContainText('P2');
  await placed.getByRole('button', { name: 'V1: Show in…' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.keyboard.press('Escape');
  await expect(placed).toContainText('Shown in P1, P2');
}

test('every pane draws a labelled copy; hovering one copy lights all copies and the row', async ({ page }) => {
  await twoPanesWithLine(page);
  const copy1 = page.getByTestId('chart-plot-pane-1').locator('.ln-g');
  const copy2 = page.getByTestId('chart-plot-pane-2').locator('.ln-g');
  await expect(copy1).toHaveAccessibleName('V1 · 2 line');
  await expect(copy2).toHaveAccessibleName('V1 · 2 line');
  // A freshly placed line is selected, and the selected line lights every copy and its row.
  await expect(copy1).toHaveClass(/is-lit/);
  await expect(copy2).toHaveClass(/is-lit/);
  await expect(page.getByTestId('ref-line-row-V1').locator('.ln-row')).toHaveClass(/is-lit/);
  await page.getByTestId('chart-plot-pane-1').locator('.ln-label').hover();
  await expect(copy2).toHaveClass(/is-lit/);
});

test('hovering the row lights every chart copy', async ({ page }) => {
  await twoPanesWithLine(page);
  await page.getByTestId('ref-line-row-V1').locator('.ln-row').hover();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.ln-g')).toHaveClass(/is-lit/);
  await expect(page.getByTestId('chart-plot-pane-2').locator('.ln-g')).toHaveClass(/is-lit/);
});

test('dragging a copy moves the one line in every pane', async ({ page }) => {
  await twoPanesWithLine(page);
  const input = page.getByTestId('ref-line-row-V1').getByRole('textbox');
  const before = await input.inputValue();
  const label = page.getByTestId('chart-plot-pane-2').locator('.ln-label');
  const box = await label.boundingBox();
  if (!box) throw new Error('no label box');
  const plot = await page.getByTestId('chart-plot-pane-2').boundingBox();
  if (!plot) throw new Error('no plot box');
  const x = box.x + box.width / 2, y = plot.y + plot.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => input.inputValue()).not.toBe(before);
  const after = await label.boundingBox();
  const other = await page.getByTestId('chart-plot-pane-1').locator('.ln-label').boundingBox();
  expect(Math.abs((after?.x ?? 0) - (box.x + 40))).toBeLessThan(6);
  expect(Math.abs(((other?.x ?? 0) + (other?.width ?? 0) / 2) - ((after?.x ?? 0) + (after?.width ?? 0) / 2))).toBeLessThan(3);
});

test('right-click menu: Show in, Remove from pane with Undo, List crossings and Delete', async ({ page }) => {
  await twoPanesWithLine(page);
  const label = page.getByTestId('chart-plot-pane-1').locator('.ln-label');
  await label.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'V1 line' });
  await expect(menu.getByRole('menuitem', { name: /^Show in/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Edit value/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Remove from Pane 1' })).toBeVisible();
  await menu.getByRole('menuitem', { name: /^Show in/ }).click();
  await expect(page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 1/ })).toBeChecked();
  await page.keyboard.press('Escape');

  await label.click({ button: 'right' });
  await page.getByRole('menu', { name: 'V1 line' }).getByRole('menuitem', { name: 'Remove from Pane 1' }).click();
  const row = page.getByTestId('ref-line-row-V1');
  await expect(row).toContainText('Shown in P2');
  await page.keyboard.press('Control+z');
  await expect(row).toContainText('Shown in P1, P2');

  await page.getByTestId('chart-plot-pane-1').locator('.ln-label').click({ button: 'right' });
  await page.getByRole('menu', { name: 'V1 line' }).getByRole('menuitem', { name: 'List crossings' }).click();
  await expect(page.locator('.an-card').filter({ hasText: 'V1 crossings' })).toBeVisible();

  await page.getByTestId('chart-plot-pane-1').locator('.ln-label').click({ button: 'right' });
  await page.getByRole('menu', { name: 'V1 line' }).getByRole('menuitem', { name: 'Delete V1' }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect(page.getByTestId('ref-line-row-V1')).toBeVisible();
});

test('a line outside the visible range shows an edge tag that pans to it', async ({ page }) => {
  await twoPanesWithLine(page);
  // Right-drag zooms X into the right part of the pane, so the line (placed near the left) leaves the view.
  const plot = await page.getByTestId('chart-plot-pane-1').boundingBox();
  if (!plot) throw new Error('no plot box');
  const y = plot.y + plot.height / 2;
  await page.mouse.move(plot.x + plot.width * 0.7, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(plot.x + plot.width * 0.9, y, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  const tag = page.getByTestId('chart-plot-pane-1').locator('.ln-edge');
  await expect(tag).toContainText('V1');
  await expect(page.getByTestId('chart-plot-pane-1').locator('.ln-g')).toHaveCount(0);
  await expect(page.getByTestId('ref-line-row-V1')).toContainText('off view in P1, P2');
  await tag.click();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.ln-edge')).toHaveCount(0);
  await expect(page.getByTestId('chart-plot-pane-1').locator('.ln-g')).toHaveCount(1);
});

test('a line outside the data range keeps its edge tag when revealed (the pane never goes blank)', async ({ page }) => {
  await twoPanesWithLine(page);
  const input = page.getByTestId('ref-line-row-V1').getByRole('textbox');
  await input.fill('1.43GHz');
  await input.press('Enter');
  const tag = page.getByTestId('chart-plot-pane-1').locator('.ln-edge');
  await expect(tag).toContainText('V1');
  await tag.click();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.recharts-wrapper')).toBeVisible();
});
