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
  await expect(page.getByTestId('import-wizard-detected')).toHaveAttribute('data-confidence-level', 'high');
  await expect(page.getByTestId('import-wizard-detected')).toContainText('High confidence · 100%');
  await expect(page.getByTestId('import-wizard-detected')).toContainText('Time (s)');
  await expect(page.getByTestId('import-wizard-caption')).toHaveText('first 20 of 20 rows · rows 1–3 skipped');
  // Preview table renders all 20 rows in a scrollable container.
  await expect(page.getByTestId('import-wizard-preview').locator('tbody tr')).toHaveCount(20);
  const scrollable = await page.getByTestId('import-wizard-table-wrap').evaluate(el => el.scrollHeight > el.clientHeight);
  expect(scrollable).toBe(true);
  // Dimmed skipped rows are visible right above the table.
  await expect(page.getByTestId('import-wizard-skipped')).toContainText('Model,DSOX1204G');
  await expect(page.getByTestId('import-wizard-skipped')).toContainText('Time (s),CH1 (V),CH2 (V)');
  // Single separator row by default; second separator is hidden until opted in.
  await expect(wizard.getByRole('radiogroup', { name: 'Separator' }).getByRole('radio', { name: 'Comma' })).toHaveAttribute('aria-checked', 'true');
  await expect(wizard.getByRole('radiogroup', { name: 'Between remaining values' })).toHaveCount(0);
  await expect(page.getByTestId('wizard-chip-0')).toHaveAttribute('data-role', 'x');
  await expect(page.getByTestId('wizard-chip-2')).toHaveAttribute('data-role', 'y');
  await expect(page.getByTestId('import-wizard-summary')).toContainText('Will create 2 traces:');
  await expect(wizard.getByRole('button', { name: 'Add 2 traces' })).toBeEnabled();
  await expect(page.getByTestId('wizard-col-1')).toContainText('CH1 (V)');
  await expect(wizard.getByRole('radiogroup', { name: 'X axis quantity' }).getByRole('radio', { name: 'Time' })).toBeChecked();
  await expect(wizard.getByRole('radiogroup', { name: 'X unit' }).getByRole('radio', { name: 'seconds (s)' })).toBeChecked();
  await expect(wizard.getByRole('radiogroup', { name: 'Y unit' }).getByRole('radio', { name: 'volts (V)' })).toBeChecked();
  await expect(page.getByTestId('import-wizard-plot').locator('polyline')).toHaveCount(2);
  await expect(page.getByTestId('import-wizard-range')).toContainText('19 ms');
  await expect(page.getByTestId('import-wizard-plot-caption')).toHaveText('Plot: all 20 rows');

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

test('Esc cancels the import and shows low confidence with reasons on headerless data', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('1,2\n2,3\n') });
  const wizard = page.getByTestId('import-wizard');
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId('import-wizard-detected')).toHaveAttribute('data-confidence-level', 'low');
  await expect(page.getByTestId('import-wizard-detected')).toContainText(/Low confidence · \d+%/);
  await expect(wizard.getByText(/No column headers/)).toBeVisible();
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

test('tinySA shows all four traces in two bands before and after import', async ({ page }) => {
  const multibandCsv = Array.from({ length: 450 }, (_, i) => {
    const hz = (i < 225 ? 880000000 : 925000000) + (i % 225) * 156250;
    return [hz, [-110, -105, -100, -95].map(level => level + i % 5).join('  ')].join(',');
  }).join('\n');
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'multiband.csv', mimeType: 'text/csv', buffer: Buffer.from(multibandCsv) });
  const wizard = page.getByTestId('import-wizard');
  await expect(wizard.getByRole('radiogroup', { name: 'First separator' }).getByRole('radio', { name: 'Comma' })).toHaveAttribute('aria-checked', 'true');
  await expect(wizard.getByRole('radiogroup', { name: 'Between remaining values' }).getByRole('radio', { name: 'Whitespace' })).toBeChecked();
  await expect(wizard.getByTestId('import-wizard-preview').locator('th')).toHaveCount(5);
  await expect(wizard.getByTestId('import-wizard-plot').locator('polyline')).toHaveCount(8);
  const gaps = wizard.getByLabel('Break lines at sweep gaps');
  await expect(gaps).toBeChecked();
  await gaps.uncheck();
  await expect(wizard.getByTestId('import-wizard-plot').locator('polyline')).toHaveCount(4);
  await gaps.check();
  await wizard.getByRole('button', { name: 'Add 4 traces' }).click();
  const curves = page.locator('.trace-source .recharts-line-curve');
  await expect(curves).toHaveCount(4);
  await expect.poll(() => curves.evaluateAll(paths => paths.map(path => path.getAttribute('d')?.match(/M/g)?.length))).toEqual([2, 2, 2, 2]);
  await page.getByRole('button', { name: 'Actions for multiband.csv' }).click();
  await page.getByRole('menuitem', { name: 'Import settings…' }).click();
  await expect(wizard.getByTestId('import-wizard-plot').locator('polyline')).toHaveCount(8);
});

test('edits both separators and remembers the chosen column layout', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'channels.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Time (ms);Left (V),Right (V)\n0;1,2\n1;3,4\n2;5,6'),
  });
  const wizard = page.getByTestId('import-wizard');
  const first = wizard.getByRole('radiogroup', { name: 'First separator' });
  const values = wizard.getByRole('radiogroup', { name: 'Between remaining values' });
  await expect(values.getByRole('radio')).toHaveCount(4);
  await expect(first.getByRole('radio', { name: 'Semicolon' })).toHaveAttribute('aria-checked', 'true');
  await expect(values.getByRole('radio', { name: 'Comma' })).toBeChecked();
  await values.getByRole('radio', { name: 'Semicolon' }).click();
  await expect(wizard.getByTestId('import-wizard-confirm')).toBeDisabled();
  await first.getByRole('radio', { name: 'Tab' }).click();
  await expect(values.getByRole('radio', { name: 'Tab' })).toBeChecked();
  await first.getByRole('radio', { name: 'Semicolon' }).click();
  await values.getByRole('radio', { name: 'Semicolon' }).press('Home');
  await expect(wizard.getByTestId('import-wizard-preview').locator('tbody tr').first().locator('td')).toHaveText(['0', '1', '2']);
  await wizard.getByRole('button', { name: 'Add 2 traces' }).click();
  await page.getByRole('button', { name: 'Actions for channels.txt' }).click();
  await page.getByRole('menuitem', { name: 'Import settings…' }).click();
  await expect(values.getByRole('radio', { name: 'Comma' })).toBeChecked();
  await expect(wizard.getByTestId('import-wizard-plot').locator('polyline')).toHaveCount(2);
});

test('selects electrical/angle/unitless X units, types custom multiplier cleanly, and reverts Y to column names', async ({ page }) => {
  const ivCsv = [
    'Vgs (V),Id (mA),Gm (dB)',
    '0,1,5',
    '1,4,8',
    '2,9,10',
    '3,16,11',
  ].join('\n');
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'fet_sweep.csv', mimeType: 'text/csv', buffer: Buffer.from(ivCsv) });

  const wizard = page.getByTestId('import-wizard');
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId('import-wizard-detected')).toHaveAttribute('data-confidence-level', 'high');
  await expect(page.getByTestId('import-wizard-detected')).toContainText('Voltage (V)');
  // Electrical Voltage shows on the More X units face and exposes the [V | mV] quick scale row.
  await expect(wizard.getByRole('button', { name: 'More X units' })).toContainText('Volt');
  await expect(wizard.getByRole('radiogroup', { name: 'X unit' }).getByRole('radio', { name: 'volts (V)' })).toBeChecked();
  // Mixed Y units (mA + dB) automatically start on Auto (from column names).
  await expect(wizard.getByRole('radiogroup', { name: 'Y unit' }).getByRole('radio', { name: 'From column names' })).toBeChecked();
  await expect(page.getByTestId('import-wizard-range')).toContainText('0 V → 3 V');

  // Override X to mV in 1 click and check column header & live scaled range update.
  await wizard.getByRole('radiogroup', { name: 'X unit' }).getByRole('radio', { name: 'millivolts (mV)' }).click();
  await expect(page.getByTestId('wizard-col-0')).toContainText('Vgs (V) → mV');
  await expect(page.getByTestId('import-wizard-range')).toContainText('3 mV');

  // Open More X units popover → Custom (×N)… and verify clearing + typing 0.01 works smoothly.
  await wizard.getByRole('button', { name: 'More X units' }).click();
  await page.getByRole('menuitemradio', { name: 'Custom (×N)…' }).click();
  const multInput = wizard.getByLabel('X in multiplier');
  await expect(multInput).toBeVisible();
  await multInput.fill('');
  await multInput.type('0.01');
  await expect(multInput).toHaveValue('0.01');
  await expect(page.getByTestId('import-wizard-range')).toContainText('30 mV');

  // Pick Voltage back via More X units popover (defaults to V), pick Y = V, then revert Y back to Auto.
  await wizard.getByRole('button', { name: 'More X units' }).click();
  await page.getByRole('menuitemradio', { name: 'Voltage' }).click();
  await wizard.getByRole('radiogroup', { name: 'Y unit' }).getByRole('radio', { name: 'volts (V)' }).click();
  await expect(page.getByTestId('wizard-col-1')).toContainText('Id (mA) → V');
  await wizard.getByRole('radiogroup', { name: 'Y unit' }).getByRole('radio', { name: 'From column names' }).click();
  await expect(page.getByTestId('wizard-col-1')).toContainText('Id (mA)');

  // Import and check chart X axis title says Voltage (V), not Frequency (Hz)!
  await wizard.getByTestId('import-wizard-confirm').click();
  await expect(wizard).toHaveCount(0);
  await expect(page.getByTestId('chart-plot-pane-1')).toContainText('Voltage (V)');
});

test('shows medium confidence with concrete reasons and breaks sweep gaps on time-domain captures', async ({ page }) => {
  const burstCsv = [
    'Time,Signal',
    '0,1', '1,2', '2,1',
    '100,4', '101,5', '102,4',
  ].join('\n');
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'burst.csv', mimeType: 'text/csv', buffer: Buffer.from(burstCsv) });

  const wizard = page.getByTestId('import-wizard');
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId('import-wizard-detected')).toHaveAttribute('data-confidence-level', 'medium');
  await expect(page.getByTestId('import-wizard-detected')).toContainText(/Medium confidence · \d+%/);
  await expect(page.getByTestId('import-wizard-reasons')).toContainText(/no unit/i);
  await expect(wizard.getByLabel('Break lines at sweep gaps')).toBeChecked();
  await expect(wizard.getByTestId('import-wizard-plot').locator('polyline')).toHaveCount(2);
});
