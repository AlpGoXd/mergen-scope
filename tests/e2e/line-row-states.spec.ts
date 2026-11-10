import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

// Row behaviour from the kit: Enter sets the value, an invalid value gets the danger tint,
// H lines have one badge with a tooltip, a line in no pane says so.
async function oneLine(page: Page, kind: 'v' | 'h') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await page.getByRole('button', { name: kind === 'v' ? 'V-Line' : 'H-Line' }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 90 } });
  return page.getByTestId(`ref-line-row-${kind.toUpperCase()}1`);
}

test('Enter in the row sets the value and the line moves; an invalid value gets the danger tint', async ({ page }) => {
  const row = await oneLine(page, 'v');
  const input = row.getByRole('textbox');
  const before = Number(await row.getAttribute('data-value'));
  const label = page.getByTestId('chart-plot-pane-1').locator('.ln-label');
  const labelBefore = await label.boundingBox();
  await input.fill('1.4204GHz');
  await input.press('Enter');
  await expect.poll(async () => Number(await row.getAttribute('data-value'))).toBeCloseTo(1.4204e9, -3);
  expect(Number(await row.getAttribute('data-value'))).not.toBe(before);
  await expect(row.locator('.lp-input')).not.toHaveClass(/is-invalid/);
  const labelAfter = await label.boundingBox();
  expect(Math.abs((labelAfter?.x ?? 0) - (labelBefore?.x ?? 0))).toBeGreaterThan(10);

  const current = await row.getAttribute('data-value');
  await row.getByRole('textbox').fill('not a number');
  await row.getByRole('textbox').press('Enter');
  await expect(row.locator('.lp-input')).toHaveClass(/is-invalid/);
  await expect(row.locator('.lp-input')).toHaveAttribute('aria-invalid', 'true');
  expect(await row.getAttribute('data-value')).toBe(current);
});

test('an H line has one badge with the tooltip "H lines belong to one pane" and no menu', async ({ page }) => {
  const row = await oneLine(page, 'h');
  const badge = row.getByRole('button', { name: /H1: H lines belong to one pane/ });
  await expect(badge).toHaveAttribute('title', 'H lines belong to one pane');
  await expect(badge.locator('.lp-pane')).toHaveCount(1);
  await badge.click({ force: true }); // aria-disabled: a click does nothing
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('Show in greys panes that cannot take the line, with the reason', async ({ page }) => {
  const row = await oneLine(page, 'v');
  // Pane 2 is added but empty: it has no X axis.
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await row.getByRole('button', { name: 'V1: Show in…' }).click();
  const pane2 = page.getByRole('menuitemcheckbox', { name: /Pane 2/ });
  await expect(pane2).toHaveAttribute('aria-disabled', 'true');
  await expect(pane2).toContainText('no X axis');
  await expect(pane2).toHaveAttribute('title', /.+/);
  await expect(page.getByRole('menuitemcheckbox', { name: /Pane 1/ })).toBeChecked();
});

test('unticking the last pane keeps the line, marked "Not in a pane"; Show in puts it back', async ({ page }) => {
  const row = await oneLine(page, 'v');
  await row.getByRole('button', { name: 'V1: Show in…' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Pane 1/ }).click();
  await page.keyboard.press('Escape');
  await expect(row).toContainText('Not in a pane');
  await expect(row.locator('.lp-pane--none')).toBeVisible();
  await expect(page.locator('.ui-toast')).toHaveCount(1); // only the "Opened 1 file" toast, none for the toggle
  await expect(page.locator('.ui-toast')).toContainText('Opened 1 file');
  await row.getByRole('button', { name: /V1: Not in a pane/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /Pane 1/ }).click();
  await page.keyboard.press('Escape');
  await expect(row).toContainText('Shown in P1');
});
