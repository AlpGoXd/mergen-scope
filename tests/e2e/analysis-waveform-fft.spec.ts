import { expect, test } from '@playwright/test';
import { acceptImport } from './import-helpers';
import { addAnalysis } from './analysis-helpers';

/** A scope export: 1 kHz, 1 V amplitude sine sampled at 100 kHz. */
function scopeCsv(): Buffer {
  const rows = ['Time (s),CH1 (V)'];
  for (let i = 0; i < 2048; i++) rows.push(`${i / 1e5},${Math.sin((2 * Math.PI * 1000 * i) / 1e5).toFixed(6)}`);
  return Buffer.from(`${rows.join('\n')}\n`);
}

test('Waveform measures a scope trace and FFT creates its spectrum in a frequency pane', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'scope.csv', mimeType: 'text/csv', buffer: scopeCsv() });
  await acceptImport(page);
  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'scope.csv' }).first()).toBeVisible();

  const waveform = await addAnalysis(page, 'Waveform');
  const value = (label: string) => waveform.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
  await expect(value('Frequency')).toHaveText('1 kHz');
  await expect(value('Vpp')).toHaveText('2 V');
  await expect(value('Duty cycle')).toHaveText('50 %');
  await expect(value('Rise time')).toHaveText(/µs$/);
  // Outlines on the chart while the card is open: the 10 % / 90 % levels and one period.
  await expect(page.getByTestId('analysis-shape-level')).toHaveCount(2);
  await expect(page.getByTestId('analysis-shape-band')).toHaveCount(1);
  await waveform.locator('.an-card__head').click();
  await expect(page.getByTestId('analysis-shape-level')).toHaveCount(0);

  const fft = await addAnalysis(page, 'FFT');
  await expect(fft.locator('.an-create')).toContainText('FFT · CH1');
  const level = Number((await fft.locator('.an-result__value').textContent() ?? '').replace('−', '-'));
  expect(Math.abs(level - 20 * Math.log10(Math.SQRT1_2))).toBeLessThan(0.1);
  await expect(page.getByTestId('chart-pane-pane-2')).toHaveCount(0);
  await fft.getByRole('button', { name: 'Create trace' }).click();

  const spectrumPane = page.getByTestId('chart-pane-pane-2');
  await expect(spectrumPane).toBeVisible();
  await expect(spectrumPane.locator('.recharts-line-curve').first()).toBeVisible();
  await expect(spectrumPane).toContainText('Hz');
  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'FFT · CH1' }).first()).toBeVisible();
  await expect(fft.locator('.an-output')).toContainText('FFT · CH1');
});
