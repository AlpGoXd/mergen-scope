import { expect, test } from '@playwright/test';
import { addAnalysis, openAnalysisPanel } from './analysis-helpers';

const SAMPLE_COUNT = 3_000_000;

function makeFloat32SineBuffer(sampleCount = SAMPLE_COUNT): Buffer {
  const buf = Buffer.allocUnsafe(sampleCount * 4);
  const periodLen = 100;
  const period = new Float32Array(periodLen);
  for (let i = 0; i < periodLen; i++) {
    period[i] = Math.sin((2 * Math.PI * i) / periodLen);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < sampleCount; i++) {
    view.setFloat32(i * 4, period[i % periodLen] ?? 0, true);
  }
  return buf;
}

test('binary point-budget notice, envelope gating, and Keep all 3M sample flow', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');

  // 1. Upload 3M float32 capture (12 MB < 50 MB threshold -> no large-file warning dialog).
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'capture_3m.f32',
    mimeType: 'application/octet-stream',
    buffer: makeFloat32SineBuffer(),
  });
  await expect(page.getByTestId('app-dialog-body')).toHaveCount(0);

  // 2. Verify Binary Wizard opens with Medium confidence · 65% and reasons.
  const binWizard = page.getByTestId('binary-wizard');
  await expect(binWizard).toBeVisible();

  const confidence = binWizard.getByTestId('binary-wizard-confidence');
  await expect(confidence).toHaveAttribute('data-confidence-level', 'medium');
  await expect(confidence).toContainText('Medium confidence · 65%');
  await expect(binWizard.getByTestId('binary-wizard-reasons')).toContainText(
    'Sample type and channel layout inferred from file extension',
  );

  // 3. Verify point-budget notice (large) and all three choices + hints.
  const budget = binWizard.getByTestId('binary-wizard-budget');
  await expect(budget).toHaveAttribute('data-budget-level', 'large');
  await expect(binWizard.getByTestId('binary-wizard-budget-summary')).toHaveText(
    '1 channel × 3 M = 3 M points. Keep all needs about 206 MB of memory.',
  );

  const keepAll = budget.getByRole('radio', { name: /Keep all samples/i });
  const decimate = budget.getByRole('radio', { name: /Decimate by/i });
  const envelope = budget.getByRole('radio', { name: /Display envelope/i });

  await expect(keepAll).toBeEnabled();
  await expect(keepAll).toBeChecked();
  await expect(decimate).toBeEnabled();
  await expect(decimate).not.toBeChecked();
  await expect(envelope).toBeEnabled();
  await expect(envelope).not.toBeChecked();

  await expect(binWizard.getByTestId('binary-wizard-keep-all-note')).toHaveText(
    'The app may be slower to zoom and analyse.',
  );
  await expect(binWizard.getByTestId('binary-wizard-decimate-factor')).toHaveValue('2');
  await expect(binWizard.getByTestId('binary-wizard-decimate-info')).toHaveText(
    'New sample rate: 500 kHz · Nyquist: 250 kHz · 1.5 M points',
  );
  await expect(
    budget.getByText('Fast. Analysis tools and sample dots are off for this trace.'),
  ).toBeVisible();
  await expect(binWizard.getByTestId('binary-wizard-budget-hint')).toHaveText(
    'Or narrow Start / Samples on the left to cut import size.',
  );

  // 4. Choose Display envelope -> confirm -> verify trace, disabled Samples button, and denied FFT.
  await envelope.check();
  await expect(envelope).toBeChecked();
  await binWizard.getByTestId('import-wizard-confirm').click();
  await expect(binWizard).toHaveCount(0);

  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(1);
  await expect(
    page.getByTestId('chart-plot-pane-1').locator('.trace-source .recharts-line-curve'),
  ).toHaveCount(1);

  const samplesToggle = page.getByTestId('chart-pane-pane-1').getByTestId('samples-toggle');
  await expect(samplesToggle).toBeDisabled();
  await expect(samplesToggle).toHaveAttribute(
    'title',
    'This trace is a display envelope, not measured samples. Re-import with Keep all to see samples.',
  );
  await expect(samplesToggle).toHaveAttribute('aria-pressed', 'false');

  await openAnalysisPanel(page);
  await page.locator('.an-panel__head').getByRole('button', { name: '+ Add analysis' }).click();
  const addMenu = page.getByRole('dialog', { name: 'Add analysis' });
  const fftOption = addMenu.getByRole('option', { name: /^FFT/ });
  const expectedDenial =
    'This trace is a display envelope of 3000000 samples. Re-import with Keep all or Decimate to analyse it.';
  await expect(fftOption).toHaveAttribute('aria-disabled', 'true');
  await expect(fftOption).toHaveAttribute('title', expectedDenial);
  await expect(fftOption.locator('.an-menu__note')).toHaveText(expectedDenial);
  await page.keyboard.press('Escape');
  await expect(addMenu).toHaveCount(0);

  // 5. Re-open via Import settings… -> Keep all samples -> Apply -> verify Samples & FFT work.
  await page.getByRole('button', { name: 'Actions for capture_3m.f32' }).click();
  await page.getByRole('menuitem', { name: 'Import settings…' }).click();
  await expect(binWizard).toBeVisible();
  await expect(binWizard.getByRole('radio', { name: /Display envelope/i })).toBeChecked();

  await binWizard.getByRole('radio', { name: /Keep all samples/i }).check();
  await binWizard.getByTestId('import-wizard-confirm').click();
  await expect(binWizard).toHaveCount(0);

  await expect(samplesToggle).toBeEnabled();
  await expect(samplesToggle).toHaveAttribute('title', 'Show the measured sample points');
  await samplesToggle.click();
  await expect(samplesToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(samplesToggle).toHaveAttribute('data-state', 'dense');
  await expect(samplesToggle).toHaveAttribute('title', /^Samples are on, but the points are too dense to draw at this zoom\. Zoom in about [\d\s]+× to see them\.$/);
  await expect(page.getByTestId('samples-callout')).toContainText(/Zoom in about [\d\s]+× to see them/);
  await samplesToggle.click();
  await expect(samplesToggle).toHaveAttribute('aria-pressed', 'false');

  const fftCard = await addAnalysis(page, 'FFT');
  const createBtn = fftCard.getByRole('button', { name: 'Create trace' });
  await expect(createBtn).toBeEnabled();
  await createBtn.click();

  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  await expect(
    page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'FFT · CH1' }),
  ).toBeVisible();
});
