import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis } from './analysis-helpers';

function makeWavebinBuffer(cookie: 'AG' | 'RG', channels: { label: string; samples: number[] }[]): Buffer {
  const fileHeaderBytes = cookie === 'RG' ? 16 : 12;
  const dhSize = cookie === 'RG' ? 16 : 12;
  const wfmHeaderSize = 140;
  let total = fileHeaderBytes;
  for (const ch of channels) total += wfmHeaderSize + dhSize + ch.samples.length * 4;

  const buf = Buffer.alloc(total);
  buf.write(cookie, 0, 'ascii');
  buf.write(cookie === 'AG' ? '10' : '01', 2, 'ascii');
  if (fileHeaderBytes === 16) {
    buf.writeUInt32LE(total, 4);
    buf.writeUInt32LE(0, 8);
    buf.writeUInt32LE(channels.length, 12);
  } else {
    buf.writeUInt32LE(total, 4);
    buf.writeUInt32LE(channels.length, 8);
  }

  let cursor = fileHeaderBytes;
  for (const ch of channels) {
    buf.writeInt32LE(wfmHeaderSize, cursor);
    buf.writeInt32LE(1, cursor + 4); // Normal
    buf.writeInt32LE(1, cursor + 8); // 1 buffer
    buf.writeInt32LE(ch.samples.length, cursor + 12);
    buf.writeInt32LE(1, cursor + 16);
    buf.writeFloatLE(ch.samples.length * 1e-6, cursor + 20);
    buf.writeDoubleLE(0, cursor + 24);
    buf.writeDoubleLE(1e-6, cursor + 32); // 1 MHz sample rate
    buf.writeDoubleLE(0, cursor + 40);
    buf.writeInt32LE(2, cursor + 48); // s
    buf.writeInt32LE(1, cursor + 52); // V
    buf.write('24 NOV 2026', cursor + 56, 'ascii');
    buf.write('04:20:00', cursor + 72, 'ascii');
    buf.write(cookie === 'AG' ? 'DSO-X 1102G:MY1234' : 'DHO804:RIGOL99', cursor + 88, 'ascii');
    buf.write(ch.label, cursor + 112, 'ascii');
    cursor += wfmHeaderSize;

    const payloadBytes = ch.samples.length * 4;
    buf.writeInt32LE(dhSize, cursor);
    buf.writeInt16LE(1, cursor + 4); // Float32 normal
    buf.writeInt16LE(4, cursor + 6); // 4 bytes/pt
    buf.writeUInt32LE(payloadBytes, cursor + 8);
    if (dhSize === 16) buf.writeUInt32LE(0, cursor + 12);
    cursor += dhSize;

    for (const sample of ch.samples) {
      buf.writeFloatLE(sample, cursor);
      cursor += 4;
    }
  }
  return buf;
}

test('opens Keysight AG and Rigol RG .bin files directly without the wizard and shows scope Info metadata', async ({ page }) => {
  const samples1 = Array.from({ length: 40 }, (_, i) => Math.sin(i / 4));
  const samples2 = Array.from({ length: 40 }, (_, i) => Math.cos(i / 4) * 0.5);
  const agBin = makeWavebinBuffer('AG', [
    { label: 'CH1', samples: samples1 },
    { label: 'CH2', samples: samples2 },
  ]);
  const rgBin = makeWavebinBuffer('RG', [
    { label: 'CH1', samples: samples1.map(v => v * 2) },
  ]);

  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'keysight_capture.bin',
    mimeType: 'application/octet-stream',
    buffer: agBin,
  });

  // Imports directly — no wizard dialog.
  await expect(page.getByTestId('import-wizard')).toHaveCount(0);
  await expect(page.locator('.lp-file--header .lp-name').filter({ hasText: 'keysight_capture.bin' })).toBeVisible();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.trace-source .recharts-line-curve')).toHaveCount(2);
  await expect(page.getByTestId('chart-plot-pane-1')).toContainText('Time (s)');

  // Actions menu has both Info (with instrument metadata) and Import settings… (to re-run through the Binary Wizard).
  await page.getByRole('button', { name: 'Actions for keysight_capture.bin' }).click();
  await expect(page.getByRole('menuitem', { name: 'Import settings…' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Info', exact: true }).click();
  await expect(page.getByText('DSO-X 1102G:MY1234')).toBeVisible();
  await expect(page.getByText('Keysight / Agilent Binary (AG v10)')).toBeVisible();

  // Re-run keysight_capture.bin through Binary Import Wizard: verify header summary, apply 10x probe on CH1 only and drop CH2.
  await page.getByRole('button', { name: 'Actions for keysight_capture.bin' }).click();
  await page.getByRole('menuitem', { name: 'Import settings…' }).click();
  const binWizard = page.getByTestId('binary-wizard');
  await expect(binWizard).toBeVisible();
  await expect(binWizard.getByTestId('binary-wizard-hex')).toContainText('41 47');
  await expect(binWizard.getByTestId('binary-wizard-header-summary')).toContainText('Keysight / Agilent');
  await binWizard.getByRole('checkbox', { name: 'Enable CH2' }).uncheck();
  await binWizard.getByLabel('CH1 scale multiplier').fill('10');
  await expect(binWizard.getByTestId('binary-wizard-range')).toContainText('9.975 V');
  await binWizard.getByTestId('import-wizard-confirm').click();
  await expect(binWizard).toHaveCount(0);
  await expect(page.getByTestId('chart-plot-pane-1').locator('.trace-source .recharts-line-curve')).toHaveCount(1);

  // Also open a Rigol RG .bin capture into the same time-domain pane.
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'rigol_dho804.bin',
    mimeType: 'application/octet-stream',
    buffer: rgBin,
  });
  await expect(page.getByTestId('import-wizard')).toHaveCount(0);
  await expect(page.locator('.lp-file--header .lp-name').filter({ hasText: 'rigol_dho804.bin' })).toBeVisible();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.trace-source .recharts-line-curve')).toHaveCount(2);
});

test('opens headerless GNU Radio .cf32 IQ file in the Binary Import Wizard and plots I and Q', async ({ page }) => {
  const iq = Buffer.alloc(64 * 8);
  for (let i = 0; i < 64; i++) {
    iq.writeFloatLE(Math.cos((i * Math.PI) / 8), i * 8);
    iq.writeFloatLE(Math.sin((i * Math.PI) / 8), i * 8 + 4);
  }
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'sdr_burst.cf32',
    mimeType: 'application/octet-stream',
    buffer: iq,
  });

  const binWizard = page.getByTestId('binary-wizard');
  await expect(binWizard).toBeVisible();
  await expect(binWizard.getByRole('radiogroup', { name: 'Channel layout' }).getByRole('radio', { name: 'Complex IQ (I and Q)' })).toBeChecked();
  await expect(binWizard.getByTestId('import-wizard-summary')).toContainText('Will create 2 traces:');
  await binWizard.getByRole('button', { name: 'Add 2 traces' }).click();
  await expect(binWizard).toHaveCount(0);
  await expect(page.getByTestId('chart-plot-pane-1').locator('.trace-source .recharts-line-curve')).toHaveCount(2);
});

test('opens shipped binary oscilloscope fixtures (Keysight, Rigol, LeCroy, Tektronix, OWON) directly', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles([
    resolve('test files/keysight_dsox_sample.bin'),
    resolve('test files/rigol_dho804_sample.bin'),
    resolve('test files/lecroy_sample.trc'),
    resolve('test files/tektronix_sample.isf'),
    resolve('test files/owon_sample.bin'),
  ]);

  await expect(page.getByTestId('import-wizard')).toHaveCount(0);
  await expect(page.locator('.lp-file--header')).toHaveCount(5);
  // 2 (Keysight) + 2 (Rigol) + 1 (LeCroy) + 1 (Tektronix) + 1 (OWON) = 7 traces in Pane 1.
  await expect(page.getByTestId('chart-plot-pane-1').locator('.trace-source .recharts-line-curve')).toHaveCount(7);
});

test('Close all files… removes linked derived child traces (e.g. FFT) alongside their parent files and is undoable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/keysight_dsox_sample.bin'));
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(2);

  // Create an FFT derived child trace on CH1.
  const fft = await addAnalysis(page, 'FFT');
  await fft.getByRole('button', { name: 'Create trace' }).click();
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(3);

  // Close all files… removes both the parent files and the linked FFT child trace.
  await page.getByRole('button', { name: 'Files actions' }).click();
  await page.getByRole('menuitem', { name: 'Close all files…' }).click();
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(0);
  await expect(page.getByTestId('empty-chart-dropzone').first()).toBeVisible();

  // Undo brings both files and the FFT child trace back.
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(3);
});

test('headerless binary .dat opens Binary Import Wizard with expandable hex inspector, and re-importing after hiding all traces repopulates them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');

  // 1. Headerless binary .dat file (512 bytes = 128 Float32 samples) opens in Binary Import Wizard.
  const rawDat = Buffer.alloc(512);
  for (let i = 0; i < 128; i++) rawDat.writeFloatLE(Math.sin(i / 6), i * 4);
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'daq_stream.dat',
    mimeType: 'application/octet-stream',
    buffer: rawDat,
  });

  const binWizard = page.getByTestId('binary-wizard');
  await expect(binWizard).toBeVisible();
  // Expand hex inspector beyond 64 B to 256 B and page forward.
  await binWizard.getByRole('button', { name: '256 B' }).click();
  await expect(binWizard.getByTestId('binary-wizard-hex-heading')).toContainText('256 B');
  await binWizard.getByRole('button', { name: 'Next hex page' }).click();
  await expect(binWizard.getByTestId('binary-wizard-hex')).toContainText('0100');
  await binWizard.getByRole('button', { name: 'Previous hex page' }).click();
  await binWizard.getByTestId('import-wizard-confirm').click();
  await expect(binWizard).toHaveCount(0);
  await expect(page.getByTestId('chart-plot-pane-1').locator('.trace-source .recharts-line-curve')).toHaveCount(1);

  // 2. Remove all traces of the binary file via sidebar × (file remains open with 0 traces).
  await page.locator('[data-testid^="trace-row-"]').first().getByRole('button', { name: /^Remove / }).click();
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(0);

  // Re-run Import settings… -> Apply: trace repopulates visibly on the chart.
  await page.getByRole('button', { name: 'Actions for daq_stream.dat' }).click();
  await page.getByRole('menuitem', { name: 'Import settings…' }).click();
  await expect(binWizard).toBeVisible();
  await binWizard.getByTestId('import-wizard-confirm').click();
  await expect(binWizard).toHaveCount(0);
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(1);
  await expect(page.getByTestId('chart-plot-pane-1').locator('.trace-source .recharts-line-curve')).toHaveCount(1);
});
