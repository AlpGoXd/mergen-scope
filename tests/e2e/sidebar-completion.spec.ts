import { test, expect } from '@playwright/test';
import { resolve } from 'path';

test('file summary and matrix controls stay aligned and remain interactive', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  const matrix = page.getByRole('button', { name: 'Matrix', exact: true });
  await expect(matrix).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/2 ports.*201 pts/)).toBeVisible();
  const controls = ['dB', 'Mag', 'Phase', 'Re', 'Im'].map(name => page.getByRole('button', { name, exact: true }));
  const boxes = await Promise.all([...controls, page.getByLabel('More network views')].map(control => control.boundingBox()));
  expect(boxes.every(box => box && Math.abs(box.y - boxes[0]!.y) < 5)).toBe(true);
  await page.getByLabel('More network views').selectOption('VSWR');
  await expect(page.getByTestId('touchstone-cell-S12')).toBeDisabled();
  await page.getByLabel('Actions for cascaded chain.s2p').click();
  await page.getByRole('button', { name: 'Info', exact: true }).click();
  await expect(page.getByTestId('touchstone-cell-S11')).toBeVisible();
  await matrix.click();
  await expect(page.getByTestId('touchstone-cell-S11')).toHaveCount(0);
});

