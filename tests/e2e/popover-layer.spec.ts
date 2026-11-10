import { expect, test } from '@playwright/test';

test('pane popovers appear above neighbouring panes and remain interactive', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles({ name: 'samples.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
  await page.keyboard.press('2');
  const first = page.getByTestId('chart-pane-pane-1');
  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  const topmost = async (selector: string) => page.locator(selector).evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && element.contains(hit);
  });
  await first.getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  await expect(settings).toBeVisible();
  expect(await settings.evaluate(element => element.parentElement === document.body)).toBe(true);
  expect(await topmost('.ui-popover[aria-label="Pane 1 settings"]')).toBe(true);
  await settings.getByRole('button', { name: 'Samples' }).click();
  await expect(first.locator('.recharts-line-dot')).toHaveCount(3);
  await first.getByTitle('Pane settings').click();
  await expect(settings).toHaveCount(0);
  await first.getByTitle('Pane settings').click();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await first.getByRole('button', { name: 'Pane actions' }).click();
  const menu = page.getByRole('menu', { name: 'Pane actions' });
  await expect(menu).toBeVisible();
  expect(await topmost('.ui-popover[aria-label="Pane actions popup"]')).toBe(true);
  await expect(menu.getByText('Sample dots')).toHaveCount(0);
  await first.getByRole('button', { name: 'Pane actions' }).click();
  await page.mouse.click(5, 5);
  await expect(menu).toHaveCount(0);
});
