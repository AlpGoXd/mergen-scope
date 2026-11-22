import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { acceptImport } from './import-helpers';
import { addAnalysis, analysisCard, openAnalysisPanel } from './analysis-helpers';
import { answerAppDialog } from './workspace-helpers';

test('analyze the far-field CSV in Polar and reopen the measurement with the workspace', async ({ page }) => {
  await page.goto('/app.html');
  await page.locator('.ptp-tile').filter({ hasText: 'Polar' }).click();
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/antenna-far-field-azimuth.csv'));
  await acceptImport(page);
  await expect(page.getByTestId('polar-plot')).toBeVisible();
  const card = await addAnalysis(page, 'Antenna far field');
  await expect(card).toContainText('39.93°');
  await expect(card).toContainText('3 dB beamwidth');
  await expect(card).toContainText('8.5 dBi at 0°');
  await expect(card).toContainText('10 dB beamwidth');
  await expect(card).toContainText('23.45 dB');
  await expect(card).toContainText('Highest secondary lobe');
  const download = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path();
  if (!path) throw new Error('Missing workspace download');
  await page.getByTestId('topbar-workspace-input').setInputFiles(path);
  await answerAppDialog(page, 'Replace');
  await openAnalysisPanel(page);
  await expect(analysisCard(page, 'Antenna far field')).toContainText('8.5 dBi at 0°');
});
