import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('symbols replace nearby sample dots', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Always', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByTestId('chart-pane-pane-1').getByTitle('Pane settings').click();
  await page.getByRole('checkbox', { name: 'Sample dots' }).check();
  const symbols = page.getByTestId('trace-symbol');
  await expect(symbols.first()).toBeVisible();
  const trace = await symbols.first().getAttribute('data-trace');
  if (!trace) throw new Error('missing trace');
  const indices = await page.getByTestId('chart-plot-pane-1').evaluate((root, name) => {
    const sameTrace = (el: Element) => el.getAttribute('data-trace') === name;
    const sampleIndices = (selector: string) => Array.from(root.querySelectorAll(selector)).filter(sameTrace).map(el => el.getAttribute('data-sample-index'));
    return { dots: sampleIndices('[data-testid="sample-dot"]'), symbols: sampleIndices('[data-testid="trace-symbol"]') };
  }, trace);
  expect(indices.dots.length).toBeGreaterThan(0);
  expect(indices.symbols.length).toBeGreaterThan(0);
  expect(indices.dots).not.toContain(null);
  expect(indices.symbols).not.toContain(null);
  for (const index of indices.symbols) expect(indices.dots).not.toContain(index);
});
