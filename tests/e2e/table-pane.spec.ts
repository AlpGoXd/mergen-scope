import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { acceptImport } from './import-helpers';

const DAT = resolve('test files/cascade_ip3_-12dBm.DAT');

/** Add Pane 2, make it a Table and show every trace in it. */
async function tableInPane2(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await page.getByTestId('chart-pane-pane-2').locator('.ptp-tile').filter({ hasText: 'Table' }).click();
  await expect(page.getByTestId('table-empty-pane-2')).toBeVisible();
  const rows = page.locator('[data-testid^="trace-row-"]');
  for (let i = 0; i < await rows.count(); i++) {
    await rows.nth(i).getByTitle('Show in panes').click();
    await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
    await page.keyboard.press('Escape');
  }
}

async function openCsv(page: Page, name: string, body: string): Promise<void> {
  await page.getByTestId('app-open-input').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await acceptImport(page);
}

test('the Table tile is available and an empty table says what to do', async ({ page }) => {
  await page.goto('/app.html');
  const pane = page.getByTestId('chart-pane-pane-1');
  const tile = pane.locator('.ptp-tile').filter({ hasText: 'Table' });
  await expect(tile).not.toHaveAttribute('aria-disabled', 'true');
  await tile.click();
  const empty = page.getByTestId('table-empty-pane-1');
  await expect(empty).toContainText('Empty table');
  await expect(empty).toContainText('Follow another pane’s traces and cursor, or add traces of your own.');
  await expect(empty.getByRole('button', { name: 'Add traces…' })).toBeVisible();
  const header = page.getByTestId('chart-pane-header-pane-1');
  await header.getByRole('button', { name: 'Chart type: Table. Change chart type' }).click();
  await expect(page.getByRole('radio', { name: /Table/ })).toHaveAttribute('aria-checked', 'true');
});

test('two traces on the same points line up; different points show "–" and nothing invented', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await openCsv(page, 'a.csv', 'Frequency (Hz),A (dB)\n1000000000,-1\n2000000000,-2\n3000000000,-3\n');
  await openCsv(page, 'b.csv', 'Frequency (Hz),B (dB)\n1000000000,-10\n2000000000,-20\n3000000000,-30\n');
  await tableInPane2(page);
  const table = page.getByTestId('table-pane-pane-2');
  await expect(table.getByRole('columnheader')).toHaveCount(3);
  await expect(table.getByRole('columnheader').first()).toHaveText('Frequency (GHz)');
  const body = table.locator('[role="row"]:not(.tbp-head)');
  await expect(body).toHaveCount(3);
  await expect(body.nth(1).getByRole('rowheader')).toHaveText('2');
  await expect(body.nth(1).getByRole('cell')).toHaveText(['−2.00', '−20.00']);
  await expect(table.locator('.tbp-c.is-empty')).toHaveCount(0);
  await expect(table.locator('.tbp-foot')).toContainText('3 rows · 1 → 3 GHz');
  await expect(table.locator('.tbp-foot')).toContainText('Own traces');

  // Open C into Pane 1 (the target pane), then show it in the table too.
  await page.getByTestId('chart-pane-header-pane-1').click();
  await openCsv(page, 'c.csv', 'Frequency (Hz),C (dB)\n1500000000,-5\n3000000000,-6\n');
  const rowC = page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'C' }).last();
  await rowC.getByTitle('Show in panes').click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.keyboard.press('Escape');
  await expect(table.getByRole('columnheader')).toHaveCount(4);
  await expect(body).toHaveCount(4);
  await expect(body.getByRole('rowheader')).toHaveText(['1.0', '1.5', '2.0', '3.0']);
  // 1.5 GHz exists only in C: A and B show "–", never an interpolated −1.5 / −15.
  await expect(body.nth(1).getByRole('cell')).toHaveText(['–', '–', '−5.00']);
  await expect(body.nth(2).getByRole('cell')).toHaveText(['−2.00', '−20.00', '–']);
  await expect(table.locator('.tbp-c.is-empty')).toHaveCount(4);
  await expect(table).not.toContainText('−1.50');
});

test('the crosshair of a same-unit chart moves the highlighted row, and the row stays when the pointer leaves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(DAT);
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await tableInPane2(page);
  const table = page.getByTestId('table-pane-pane-2');
  await expect(table.locator('.tbp-foot')).toContainText('1001 rows');
  await expect(table.locator('.tbp-row.is-cursor')).toHaveCount(0);

  const plot = page.getByTestId('chart-plot-pane-1');
  const box = await plot.boundingBox();
  if (!box) throw new Error('no plot box');
  const y = box.y + box.height * 0.4;
  await page.mouse.move(box.x + box.width * 0.3, y);
  const cursor = table.locator('.tbp-row.is-cursor');
  await expect(cursor).toHaveCount(1);
  await expect(cursor).toHaveAttribute('aria-selected', 'true');
  const first = await cursor.getByRole('rowheader').textContent();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 });
  await expect(cursor.getByRole('rowheader')).not.toHaveText(first ?? '');
  const second = await cursor.getByRole('rowheader').textContent();
  // Leave the chart: the row stays.
  await page.mouse.move(box.x + box.width * 0.6, box.y - 60);
  await page.mouse.move(10, 10);
  await expect(cursor.getByRole('rowheader')).toHaveText(second ?? '');
  // Near cursor: the cursor row sits in the middle of the rows that fit; no vertical scroll.
  const rows = table.locator('[role="row"]:not(.tbp-head)');
  const count = await rows.count();
  const index = await rows.evaluateAll(list => list.findIndex(row => row.classList.contains('is-cursor')));
  expect(Math.abs(index - Math.floor((count - 1) / 2))).toBeLessThanOrEqual(1);
});

test('Every point keeps a small DOM with a 1001-row file and scrolls the cursor row into view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(DAT);
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await tableInPane2(page);
  await page.getByTestId('chart-pane-header-pane-2').getByRole('button', { name: 'Pane settings' }).click();
  const settings = page.locator('.pset');
  await expect(settings.getByRole('heading', { name: 'Table' })).toBeVisible();
  const headings = await settings.getByRole('heading').allTextContents();
  expect(headings.slice(0, 2)).toEqual(['Chart type', 'Table']);
  await expect(settings.getByRole('button', { name: 'Near cursor' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('button', { name: 'Own traces' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: 'Every point' }).click();
  await page.keyboard.press('Escape');

  const table = page.getByTestId('table-pane-pane-2');
  await expect(table.locator('.tbp')).toHaveAttribute('data-mode', 'all');
  const domRows = await table.locator('[role="row"]').count();
  expect(domRows).toBeGreaterThan(5);
  expect(domRows).toBeLessThan(80);

  const plot = page.getByTestId('chart-plot-pane-1');
  const box = await plot.boundingBox();
  if (!box) throw new Error('no plot box');
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.4);
  const cursor = table.locator('.tbp-row.is-cursor');
  await expect(cursor).toHaveCount(1);
  await expect(table.locator('.tbp-foot')).toContainText(/Row \d+ of 1001/);
  const scroll = await table.locator('.tbp-scroll').boundingBox();
  const row = await cursor.boundingBox();
  if (!scroll || !row) throw new Error('no boxes');
  expect(row.y).toBeGreaterThanOrEqual(scroll.y);
  expect(row.y + row.height).toBeLessThanOrEqual(scroll.y + scroll.height + 1);
  expect(await table.locator('[role="row"]').count()).toBeLessThan(80);
});
