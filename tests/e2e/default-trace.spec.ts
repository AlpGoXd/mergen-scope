import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis } from './analysis-helpers';

test('analysis and marker default to the first visible trace', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  const first = page.locator('[data-testid^="trace-row-"]').first();
  const name = await first.locator('.lp-name').innerText();
  const card = await addAnalysis(page, 'Range Statistics');
  await expect(card.locator('.an-select').first()).toContainText(name);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('n');
  await page.getByTestId('chart-plot-pane-1').click();
  await expect(page.locator('.lp-marker').first()).toContainText(name);
  await page.keyboard.press('Shift+n');
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 180, y: 100 } });
  await expect(page.locator('.lp-marker').nth(1)).toContainText('from');
  const markerTools = page.getByRole('button', { name: 'Markers', exact: true });
  if (await markerTools.getAttribute('aria-pressed') !== 'true') await markerTools.click();
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 200, y: 100 } });
  await expect(page.locator('.lp-marker').nth(2)).toContainText(name);
});
