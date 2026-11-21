import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis } from './analysis-helpers';
import { answerAppDialog } from './workspace-helpers';

test('mismatched stimulus requires alignment choices', async ({ page }) => {
  await page.goto('/app.html');
  const input = page.getByTestId('app-open-input');
  const rows = page.locator('[data-testid^="trace-row-"]');
  const traceA = /cascade_ip3_-12dBm Tr1/i;
  const traceB = /S21 magnitude-db/i;
  const availableTraces = page.getByRole('combobox', { name: 'Trace', exact: true });
  await input.setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(availableTraces.getByRole('option', { name: traceA })).toBeAttached();
  await input.setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(availableTraces.getByRole('option', { name: traceB })).toBeAttached();

  const card = await addAnalysis(page, 'Trace math');
  await card.locator('.an-select').first().click();
  await page.getByRole('menu', { name: 'Trace', exact: true }).getByRole('menuitemcheckbox', { name: traceA }).click();
  await card.locator('.an-select').nth(1).click();
  await page.getByRole('menu', { name: 'Trace B' }).getByRole('menuitemcheckbox', { name: traceB }).click();
  await expect(card.getByText(/Stimulus mismatch/)).toContainText('1001 points');
  await expect(card.getByText(/Stimulus mismatch/)).toContainText('201 points');
  await expect(card.getByRole('button', { name: 'Create trace' })).toBeDisabled();
  await card.getByText('Choose…').first().click();
  await page.getByRole('menu', { name: 'Points' }).getByRole('menuitemcheckbox', { name: "A's" }).click();
  await card.getByText('Choose…').click();
  await page.getByRole('menu', { name: 'Fill gaps' }).getByRole('menuitemcheckbox', { name: 'Linear' }).click();
  const count = await rows.count();
  await card.getByRole('button', { name: 'Create trace' }).click();
  await expect(rows).toHaveCount(count + 1);
});

test('identical stimuli need no choices', async ({ page }) => {
  await page.goto('/app.html');
  const file = resolve('test files/cascade_ip3_-12dBm.DAT');
  await page.getByTestId('app-open-input').setInputFiles(file);
  await page.getByTestId('app-open-input').setInputFiles(file);
  await answerAppDialog(page, 'Add as a new file');
  const card = await addAnalysis(page, 'Trace math');
  await card.locator('.an-select').nth(1).click();
  await page.getByRole('menu', { name: 'Trace B' }).getByRole('menuitemcheckbox').last().click();
  await expect(card.getByText(/Stimulus mismatch/)).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Create trace' })).toBeEnabled();
});
