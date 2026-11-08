import { test, expect } from '@playwright/test';
import { resolve } from 'path';

test('sidebar sections remember collapse and trace membership can be changed', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  const traces = page.getByRole('button', { name: /Traces 2/ });
  await expect(traces).toHaveAttribute('aria-expanded', 'true');
  await traces.click();
  await expect(traces).toHaveAttribute('aria-expanded', 'false');
  await page.reload();
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  await expect(page.getByRole('button', { name: /Traces 2/ })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: /Traces 2/ }).click();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const row = page.locator('[data-testid^="trace-row-"]').first();
  await row.getByTitle('Show in panes').click();
  const pane2 = row.getByRole('checkbox', { name: 'Pane 2' });
  await expect(pane2).not.toBeChecked();
  await pane2.check();
  await expect(pane2).toBeChecked();
  await pane2.uncheck();
  await expect(pane2).not.toBeChecked();
});

test('section menu removes all markers with undo', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 100, y: 100 } });
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(1);
  await page.getByLabel('Markers actions').click();
  await page.getByRole('button', { name: 'Remove all', exact: true }).click();
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(1);
});


test('matrix creates a new view in the target pane and marks other views', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await page.getByTestId('chart-pane-pane-2').getByRole('button', { name: 'Set Target' }).click();
  await page.getByTestId('touchstone-cell-S12').click();
  const row = page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'S12' });
  await expect(row).toContainText('P2');
  await expect(page.getByTestId('touchstone-cell-S12')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Phase', exact: true }).click();
  await expect(page.getByTestId('touchstone-cell-S12').getByLabel('Also plotted elsewhere or in another view')).toBeVisible();
});

test('matrix offers ABCD and reflection-only network views', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  await page.getByRole('button', { name: 'ABCD', exact: true }).click();
  await page.getByTestId('touchstone-cell-ABCD11').click();
  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'ABCD11' })).toBeVisible();
  await page.getByRole('button', { name: 'S', exact: true }).click();
  await page.getByLabel('More network views').selectOption('VSWR');
  await expect(page.getByTestId('touchstone-cell-S12')).toBeDisabled();
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'VSWR' })).toBeVisible();
});

test('matrix quick picks add several views as one undoable action', async ({ page }) => {
  const sample = '1 0 0 1 0 1 0 1 0 0 0 1 0 1 0 1 0 0 0';
  const data = `# Hz S RI R 50\n${sample}\n${sample.replace(/^1 /, '2 ')}\n`;
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles({ name: 'three.s3p', mimeType: 'text/plain', buffer: Buffer.from(data) });
  await page.getByRole('button', { name: 'All Sii' }).click();
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(0);
});
