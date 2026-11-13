import { expect, test } from '@playwright/test';
import { resolve } from 'path';

const csv = [
  'Model,DSOX1204G',
  'Serial,MY00000000',
  'Time (s),CH1 (V),CH2 (V)',
  ...Array.from({ length: 20 }, (_, i) => `${(i * 1e-3).toFixed(3)},${Math.sin(i / 3).toFixed(4)},${Math.cos(i / 3).toFixed(4)}`),
].join('\n');

test('imports a CSV through the one-screen wizard, and Import settings opens pre-filled', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'scope_capture_04.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  const wizard = page.getByRole('dialog', { name: 'Open scope_capture_04.csv' });
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId('import-wizard-detected')).toHaveText('Detected: time (high confidence)');
  await expect(page.getByTestId('import-wizard-caption')).toHaveText('first 8 of 20 rows · rows 1–3 skipped');
  await expect(wizard.getByRole('radio', { name: 'Comma' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('wizard-chip-0')).toHaveAttribute('data-role', 'x');
  await expect(page.getByTestId('wizard-chip-2')).toHaveAttribute('data-role', 'y');
  await expect(page.getByTestId('import-wizard-summary')).toContainText('Will create 2 traces:');
  await expect(wizard.getByRole('button', { name: 'Add 2 traces' })).toBeEnabled();
  await expect(page.getByTestId('wizard-col-1')).toContainText('CH1 (V)');
  await expect(wizard.getByLabel('Y in')).toHaveValue('V');
  await expect(page.getByTestId('import-wizard-plot').locator('polyline')).toHaveCount(2);
  await expect(page.getByTestId('import-wizard-plot-caption')).toHaveText('Plot: all 20 rows');
  await expect(page.getByTestId('import-wizard-plot-band')).toBeVisible();

  // CH2 → skip.
  await page.getByTestId('wizard-chip-2').click();
  await page.getByRole('menuitemradio', { name: /Skip/ }).click();
  await expect(page.getByTestId('wizard-chip-2')).toHaveAttribute('data-role', 'skip');
  await expect(page.getByTestId('import-wizard-summary')).not.toContainText('CH2');
  await expect(page.getByTestId('import-wizard-plot').locator('polyline')).toHaveCount(1);

  // No X: the button explains why it is unavailable.
  await page.getByTestId('wizard-chip-0').click();
  await page.getByRole('menuitemradio', { name: /Skip/ }).click();
  await expect(page.getByTestId('import-wizard-blocker')).toContainText('No X column');
  await expect(page.getByTestId('import-wizard-confirm')).toBeDisabled();
  await page.getByTestId('wizard-chip-0').click();
  await page.getByRole('menuitemradio', { name: /^X/ }).click();

  await wizard.getByRole('button', { name: 'Add 1 trace' }).click();
  await expect(wizard).toHaveCount(0);
  await expect(page.locator('.lp-file--header .lp-name').filter({ hasText: 'scope_capture_04.csv' })).toBeVisible();

  await page.getByRole('button', { name: 'Actions for scope_capture_04.csv' }).click();
  await page.getByRole('menuitem', { name: 'Import settings…' }).click();
  const edit = page.getByRole('dialog', { name: 'Import settings scope_capture_04.csv' });
  await expect(edit).toBeVisible();
  // Pre-filled with the last settings: CH2 still skipped.
  await expect(page.getByTestId('wizard-chip-2')).toHaveAttribute('data-role', 'skip');
  await expect(page.getByTestId('wizard-chip-1')).toHaveAttribute('data-role', 'y');
  await expect(edit.getByText('Traces whose column still exists keep their colour, markers and pane.')).toBeVisible();

  // Turning CH1 off warns that its trace goes away.
  await page.getByTestId('wizard-chip-1').click();
  await page.getByRole('menuitemradio', { name: /Skip/ }).click();
  await expect(edit.getByText('CH1 (V) is no longer a Y column: its trace will be removed.')).toBeVisible();
  await page.getByTestId('wizard-chip-1').click();
  await page.getByRole('menuitemradio', { name: /^Y/ }).click();

  // Add CH2 back and apply with Enter.
  await page.getByTestId('wizard-chip-2').click();
  await page.getByRole('menuitemradio', { name: /^Y/ }).click();
  await expect(edit.getByRole('button', { name: 'Apply' })).toBeEnabled();
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(edit).toHaveCount(0);
  await expect(page.locator('.lp-file--header .lp-name').filter({ hasText: 'scope_capture_04.csv' })).toHaveCount(1);
});

test('Esc cancels the import', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('1,2\n2,3\n') });
  await expect(page.getByTestId('import-wizard')).toBeVisible();
  await expect(page.getByTestId('import-wizard-detected')).toContainText('low confidence');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('import-wizard')).toHaveCount(0);
  await expect(page.locator('.lp-file--header')).toHaveCount(0);
});

test('Import settings follows how the file was read, not its extension', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'logger.txt', mimeType: 'text/plain', buffer: Buffer.from('Time (s)\tCH1 (V)\n0\t1\n1\t2\n2\t3\n') });
  await page.getByTestId('import-wizard-confirm').click();
  await page.getByRole('button', { name: 'Actions for logger.txt' }).click();
  await expect(page.getByRole('menuitem', { name: 'Import settings…' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByRole('button', { name: 'Actions for cascaded chain.s2p' }).click();
  await expect(page.getByRole('menuitem', { name: 'Info', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Import settings…' })).toHaveCount(0);
});
