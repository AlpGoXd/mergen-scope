import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis } from './analysis-helpers';

test('bandwidth band follows the eye and undo; range statistics has no eye', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  const bandwidth = await addAnalysis(page, 'Bandwidth');
  const plot = page.getByTestId('chart-plot-pane-1');
  const overlay = plot.getByTestId('analysis-shape-band');
  await expect(overlay).toHaveCount(1);
  await bandwidth.locator('button.an-icon-btn[aria-label="Hide Bandwidth on the chart"]').click();
  await expect(overlay).toHaveCount(0);
  await bandwidth.locator('button.an-icon-btn[aria-label="Show Bandwidth on the chart"]').click();
  await expect(overlay).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(overlay).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(overlay).toHaveCount(1);
  const stats = await addAnalysis(page, 'Range Statistics');
  await expect(stats.locator('button.an-icon-btn[aria-pressed]')).toHaveCount(0);
  await bandwidth.locator('button.an-icon-btn[aria-label="Remove Bandwidth"]').click();
  await expect(overlay).toHaveCount(0);
});

test('collapsing a card keeps its overlay: only the eye hides it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  const bandwidth = await addAnalysis(page, 'Bandwidth');
  const overlay = page.getByTestId('chart-plot-pane-1').getByTestId('analysis-shape-band');
  const head = bandwidth.locator('.an-card__head');
  await expect(overlay).toHaveCount(1);
  await head.locator('.an-card__title').click();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(overlay).toHaveCount(1);
  // The eye still works while collapsed.
  await bandwidth.locator('button.an-icon-btn[aria-label="Hide Bandwidth on the chart"]').click();
  await expect(overlay).toHaveCount(0);
  await bandwidth.locator('button.an-icon-btn[aria-label="Show Bandwidth on the chart"]').click();
  await expect(overlay).toHaveCount(1);
  await head.locator('.an-card__title').click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(overlay).toHaveCount(1);
});
