import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('armed tools replace one another and cancel', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  for (const name of ['Markers', 'Lines']) {
    const chip = page.getByRole('button', { name, exact: true });
    if (await chip.getAttribute('aria-pressed') !== 'true') await chip.click();
  }
  const marker = page.getByRole('button', { name: 'New Marker', exact: true });
  const line = page.getByRole('button', { name: 'V-Line', exact: true });
  const plot = page.getByTestId('chart-plot-pane-1');
  await marker.click();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect(marker).toHaveClass(/ui-btn--armed/);
  await expect(page.getByText('Click to place a marker', { exact: true })).toBeVisible();
  await expect(page.locator('footer')).toContainText('Placing M1 · click a trace · Esc cancels');
  await line.click();
  await expect(marker).toHaveAttribute('aria-pressed', 'false');
  await expect(line).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(line).toHaveAttribute('aria-pressed', 'false');
  await marker.click();
  await plot.click({ button: 'right', position: { x: 100, y: 100 } });
  await expect(marker).toHaveAttribute('aria-pressed', 'false');
});
