import { test, expect } from '@playwright/test';
import { resolve } from 'path';

test('empty pane exposes planned pane types', async ({ page }) => {
  await page.goto('/app.html');
  const titles = ['Chart', 'Table', 'Smith', 'Polar', 'Eye', 'Spectrogram'];
  const tiles = page.locator('[data-testid^="pane-type-tile-"]');
  await expect(tiles).toHaveCount(6);
  for (let index = 0; index < titles.length; index++) {
    await expect(tiles.nth(index)).toContainText(titles[index] ?? '');
    if (index > 0) {
      await expect(tiles.nth(index)).toHaveAttribute('aria-disabled', 'true');
      await expect(tiles.nth(index)).toHaveAttribute('title', 'Planned, not built yet');
      await expect(tiles.nth(index)).toContainText('later');
    }
  }
  await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
  await tiles.nth(1).click({ force: true });
  await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
  await expect(tiles).toHaveCount(0);
  await expect(page.getByTestId('pane-type-menu')).toContainText('Chart');
  await page.getByTestId('pane-type-menu').click();
  const items = page.getByRole('menuitemradio');
  await expect(items).toHaveCount(6);
  for (let index = 0; index < titles.length; index++) {
    await expect(items.nth(index)).toContainText(titles[index] ?? '');
    if (index > 0) await expect(items.nth(index)).toBeDisabled();
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '+ Pane' }).click();
  const second = page.getByTestId('chart-pane-pane-2');
  await expect(second.locator('[data-testid^="pane-type-tile-"]')).toHaveCount(6);
  await second.getByTestId('empty-chart-file-input').setInputFiles({ name: 'second.csv', mimeType: 'text/csv', buffer: Buffer.from('Frequency (Hz),Magnitude (dBm)\n100,1\n200,2\n300,3\n') });
  await expect(page.getByTestId('chart-plot-pane-2')).toBeVisible();
  await expect(second.locator('[data-testid^="pane-type-tile-"]')).toHaveCount(0);
});
