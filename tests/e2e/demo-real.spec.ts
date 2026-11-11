import { expect, test } from '@playwright/test';

// The shipped demo-assets/demo.json, opened through the normal open-workspace path (no mocking).
test('app.html?demo=1 opens the real demo workspace and removes the query parameter', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html?demo=1');
  await expect(page.getByTestId('chart-pane-pane-3')).toBeVisible();
  await expect(page).toHaveURL(/\/app\.html$/);
  // Layout 1 + side with three panes: S21 and S11, Smith, scope capture.
  await expect(page.getByRole('button', { name: /^Layout:/ })).toContainText('1 + side');
  await expect(page.getByTestId('chart-pane-pane-2').getByTestId('smith-pane')).toBeVisible();
  await expect(page.getByTestId('chart-pane-pane-2').getByTestId('smith-range-label')).toContainText('1.200');
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="ref-line-row-"]')).toHaveCount(1);
  await expect(page.locator('.lp-trace.is-created')).toHaveCount(1);
  // The analysis cards come with it.
  await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.an-panel__count')).toHaveText('2');
  await expect(page.locator('.an-card').filter({ hasText: 'Bandwidth' }).locator('.an-result')).toBeVisible();
  expect(errors).toEqual([]);
});
