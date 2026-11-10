import { expect, test } from '@playwright/test';

test('pane settings and menu keep sample dots in sync and undo', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles({ name: 'samples.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
  const pane = page.getByTestId('chart-pane-pane-1');
  const dots = pane.locator('.recharts-line-dot');
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await pane.getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  await expect(settings.getByText('Display', { exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Samples' }).click();
  await expect(dots).toHaveCount(3);
  await pane.getByTitle('Pane settings').click();
  await pane.getByRole('button', { name: 'Pane actions' }).click();
  await expect(page.getByRole('menu', { name: 'Pane actions' }).getByText('Sample dots')).toHaveCount(0);
  await pane.getByRole('button', { name: 'Pane actions' }).click();
  await pane.getByTestId('samples-toggle').click();
  await expect(dots).toHaveCount(0);
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(dots).toHaveCount(3);
  await pane.getByTitle('Pane settings').click();
  await expect(settings.getByRole('button', { name: 'Samples' })).toHaveAttribute('aria-pressed', 'true');
});
