import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis, analysisCard, openAnalysisPanel } from './analysis-helpers';

async function prepare(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
}

async function defineMath(page: Page) {
  const card = await addAnalysis(page, 'Trace math');
  await expect(card.getByRole('button', { name: 'Create trace' })).toBeDisabled();
  await expect(card.locator('.an-create')).toContainText('Pick trace A and trace B.');
  await card.locator('.an-select').nth(1).click();
  await page.getByRole('menu', { name: 'Trace B' }).getByRole('menuitemcheckbox').first().click();
  await expect(card.getByRole('button', { name: 'Create trace' })).toBeEnabled();
  return card;
}

test('trace math defines before creation, follows settings, and undoes each step', async ({ page }) => {
  await prepare(page);
  const rows = page.locator('[data-testid^="trace-row-"]');
  const count = await rows.count();
  const card = await defineMath(page);
  await expect(rows).toHaveCount(count);
  const warning = 'dBm + dBm has no meaningful unit: convert to linear (W) first to add powers.';
  await expect(card.getByText(warning)).toBeVisible();
  await card.getByRole('button', { name: 'Create trace' }).click();
  await expect(rows).toHaveCount(count + 1);
  const output = rows.filter({ has: page.locator('.lp-trace__fx') }).first();
  await expect(output.locator('.lp-trace__child')).toBeVisible();
  await expect(output).toContainText('P1');
  const id = await output.getAttribute('data-testid');
  const name = await card.locator('.an-output__name').innerText();
  await card.getByRole('button', { name: '−', exact: true }).click();
  await expect(card.getByText(warning)).toHaveCount(0);
  await expect(card.locator('.an-output__name')).not.toHaveText(name);
  await expect(output).toHaveAttribute('data-testid', id ?? '');
  await expect(rows).toHaveCount(count + 1);
  await page.keyboard.press('Control+z');
  await expect(card.locator('.an-output__name')).toHaveText(name);
  await expect(card.getByText(warning)).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(rows).toHaveCount(count);
  await expect(card.getByRole('button', { name: 'Create trace' })).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(output).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(card.getByText(warning)).toHaveCount(0);
  await card.locator('.an-icon-btn').last().click();
  await expect(output).toBeVisible();
  await page.keyboard.press('Control+z');
  await openAnalysisPanel(page);
  await expect(analysisCard(page, 'Trace math').locator('.an-output')).toBeVisible();
});

test('deleting a Math output detaches the card and allows creating another', async ({ page }) => {
  await prepare(page);
  const card = await defineMath(page);
  await card.getByRole('button', { name: 'Create trace' }).click();
  const output = page.locator('[data-testid^="trace-row-"]').filter({ has: page.locator('.lp-trace__fx') }).first();
  const id = await output.getAttribute('data-testid');
  await output.getByRole('button', { name: /^Remove / }).click();
  await expect(output).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Create trace' })).toBeEnabled();
  await page.keyboard.press('Control+z');
  await expect(output).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await card.getByRole('button', { name: 'Create trace' }).click();
  const replacement = page.locator('[data-testid^="trace-row-"]').filter({ has: page.locator('.lp-trace__fx') }).first();
  await expect(replacement).toBeVisible();
  await expect(replacement).not.toHaveAttribute('data-testid', id ?? '');
});
