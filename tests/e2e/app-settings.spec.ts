import { expect, test } from '@playwright/test';

test('settings and local-only disclosure remain usable', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Local only' }).click();
  await expect(page.getByText('Your files are read in this browser and never uploaded. No cookies; settings are kept in this browser.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Local only' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  await expect(sheet.getByText('Neutral colour')).toHaveCount(0);
  await sheet.getByRole('radio', { name: 'Colour-blind safe' }).check();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(sheet.getByRole('radio', { name: 'Colour-blind safe' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Reset all to defaults' }).click();
  await expect(sheet.getByRole('radio', { name: 'Standard' })).toBeChecked();
});
