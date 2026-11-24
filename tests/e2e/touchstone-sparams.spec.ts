import { expect, test } from '@playwright/test';

const S3P_ASYMMETRIC = [
  '! 3-port asymmetric Full Touchstone v1 (row-major: row1 = S11 S12 S13, row2 = S21 S22 S23, row3 = S31 S32 S33)',
  '# GHz S RI R 50',
  '1.0  0.10 0.00  0.20 0.00  0.30 0.00',
  '     0.40 0.00  0.50 0.00  0.60 0.00',
  '     0.70 0.00  0.80 0.00  0.90 0.00',
  '2.0  0.11 0.00  0.21 0.00  0.31 0.00',
  '     0.41 0.00  0.51 0.00  0.61 0.00',
  '     0.71 0.00  0.81 0.00  0.91 0.00',
].join('\n');

const Z2P_V2 = [
  '[Version] 2.0',
  '# GHz Z RI R 50',
  '[Number of Ports] 2',
  '[Two-Port Data Order] 21_12',
  '[Number of Frequencies] 2',
  '[Network Data]',
  '1.0  50.0 0.0  0.0 0.0  0.0 0.0  50.0 0.0',
  '2.0  75.0 0.0  0.0 0.0  0.0 0.0  75.0 0.0',
  '[End]',
].join('\n');

const NANOVNA_DECIMAL_COMMA_S1P = [
  '! NanoVNA localized decimal-comma export',
  '# Hz S RI R 50',
  '100000000 1,50e-01 -2,50e-01',
  '200000000 1,20e-01 -1,80e-01',
  '300000000 9,27e-02 -1,10e-01',
].join('\n');

const CSV_SPARAMS = [
  'Frequency (GHz),S11 Re,S11 Im,S21 Re,S21 Im',
  '1.0,0.20,-0.10,0.75,0.05',
  '1.5,0.15,-0.08,0.80,0.02',
  '2.0,0.10,-0.05,0.85,-0.01',
].join('\n');

test('imports 3-port .s3p, Z-parameter .s2p, and decimal-comma NanoVNA .s1p directly with S-matrix & Info metadata', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');

  await page.getByTestId('app-open-input').setInputFiles([
    { name: 'coupler.s3p', mimeType: 'text/plain', buffer: Buffer.from(S3P_ASYMMETRIC, 'utf-8') },
    { name: 'matched_z.s2p', mimeType: 'text/plain', buffer: Buffer.from(Z2P_V2, 'utf-8') },
    { name: 'nanovna_tr.s1p', mimeType: 'text/plain', buffer: Buffer.from(NANOVNA_DECIMAL_COMMA_S1P, 'utf-8') },
  ]);

  // All 3 Touchstone files open directly with zero wizard.
  await expect(page.getByTestId('import-wizard')).toHaveCount(0);
  await expect(page.locator('.lp-file--header')).toHaveCount(3);
  await expect(page.locator('.lp-file--header .lp-name').filter({ hasText: 'coupler.s3p' })).toBeVisible();
  await expect(page.locator('.lp-file--header .lp-name').filter({ hasText: 'matched_z.s2p' })).toBeVisible();
  await expect(page.locator('.lp-file--header .lp-name').filter({ hasText: 'nanovna_tr.s1p' })).toBeVisible();

  // Z-parameter file reports "Z (converted to S)" in Info metadata.
  await page.getByRole('button', { name: 'Actions for matched_z.s2p' }).click();
  await page.getByRole('menuitem', { name: 'Info', exact: true }).click();
  await expect(page.getByText('Z (converted to S)')).toBeVisible();
});

test('imports CSV S-parameters via wizard auto-detection into Smith chart and supports Import settings…', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');

  await page.getByTestId('app-open-input').setInputFiles({
    name: 'vna_export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV_SPARAMS, 'utf-8'),
  });

  const wizard = page.getByTestId('import-wizard');
  await expect(wizard).toBeVisible();
  // Auto-detects S-parameters mode inside Table / CSV and shows S-parameter summary.
  await expect(wizard.getByRole('radiogroup', { name: 'Table import mode' }).getByRole('radio', { name: 'S-parameters' })).toBeChecked();
  await expect(wizard.getByTestId('import-wizard-summary')).toContainText('2-port S-parameters');
  await wizard.getByTestId('import-wizard-confirm').click();
  await expect(wizard).toHaveCount(0);

  // Imported file behaves as a real Touchstone network: exposes Matrix button and Info shows "CSV (S-parameters)".
  const fileHeader = page.locator('.lp-file--header').filter({ hasText: 'vna_export.csv' });
  await expect(fileHeader).toBeVisible();
  await expect(fileHeader.getByRole('button', { name: 'Matrix' })).toBeVisible();

  // Actions menu retains Import settings… for CSV S-parameter files.
  await page.getByRole('button', { name: 'Actions for vna_export.csv' }).click();
  await expect(page.getByRole('menuitem', { name: 'Import settings…' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Info', exact: true }).click();
  await expect(page.getByText('CSV (S-parameters)')).toBeVisible();
  await expect(page.getByText('S12, S22')).toBeVisible();

  // Switch Pane 1 to Smith chart (accepting the confirm dialog that moves S21 out of the Smith pane) and verify Smith plot renders.
  const paneHeader = page.getByTestId('chart-pane-header-pane-1');
  await paneHeader.getByRole('button', { name: 'Chart type: Chart. Change chart type' }).click();
  await page.locator('.ui-popover[aria-label="Chart type"]').getByRole('radio', { name: 'Smith' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Show Pane 1 as Smith?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Show as Smith' }).click();
  await expect(paneHeader.getByRole('button', { name: 'Chart type: Smith. Change chart type' })).toBeVisible();
  await expect(page.getByTestId('smith-plot')).toBeVisible();
});
