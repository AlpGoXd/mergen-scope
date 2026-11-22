import { expect, test } from '@playwright/test';
import { clearWorkspace } from './workspace-helpers';
import { acceptImport } from './import-helpers';

test('Log X draws decade paper, zooms in data units, and survives workspace reopen', async ({ page }) => {
  await page.goto('/app.html');
  const network = ['# Hz S DB R 50', ...[1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 8.5e9]
    .map((hz, index) => `${hz} -10 0 ${-1 - index} 0 -30 0 -10 0`)].join('\n');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'decades.s2p', mimeType: 'text/plain', buffer: Buffer.from(network) });
  await page.getByTestId('touchstone-cell-S21').click();
  const plot = page.getByTestId('chart-plot-pane-1');
  await expect(plot).toBeVisible();
  const box = await plot.boundingBox();
  if (!box) throw new Error('Missing chart bounds');
  const from = { x: box.x + box.width * 0.35, y: box.y + box.height / 2 };
  const markers = page.getByRole('button', { name: 'Markers', exact: true });
  if (await markers.getAttribute('aria-pressed') !== 'true') await markers.click();
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await page.mouse.click(from.x, from.y);
  const marker = page.getByRole('button', { name: 'M1 position' });
  await expect(marker).toBeVisible();
  const markerValue = await marker.innerText();
  await page.getByRole('button', { name: 'Pane settings' }).click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  await expect(settings.getByText('Log suggested')).toBeVisible();
  const yLog = settings.getByRole('group', { name: 'Y scale' }).getByRole('button', { name: 'Log' });
  await expect(yLog).toBeDisabled();
  await yLog.locator('..').hover();
  await expect(page.getByText('dB is already logarithmic')).toBeVisible();
  await settings.getByRole('group', { name: 'X scale' }).getByRole('button', { name: 'Log' }).click();
  await page.keyboard.press('Escape');
  const ticks = plot.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value');
  await expect(ticks).toHaveText(['10k', '100k', '1M', '10M', '100M', '1G']);
  await expect(plot.locator('.chart-log-grid line[data-decade]')).toHaveCount(6);
  await expect(marker).toHaveText(markerValue);
  const view = plot.getByTestId('lines-layer');
  const fitted = await view.getAttribute('data-x-domain');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.75, from.y, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(view).not.toHaveAttribute('data-x-domain', fitted ?? '');
  const zoomedMarkerValue = await marker.innerText();
  const exportDownload = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const workspacePath = await (await exportDownload).path();
  if (!workspacePath) throw new Error('Missing workspace download');
  await clearWorkspace(page);
  await expect(plot).toHaveCount(0);
  await page.getByTestId('topbar-workspace-input').setInputFiles(workspacePath);
  await expect(plot.locator('.chart-log-grid')).toBeAttached();
  await expect(marker).toHaveText(zoomedMarkerValue);
  if (!fitted) throw new Error('Missing fitted axis range');
  await plot.click({ button: 'middle' });
  await expect(view).toHaveAttribute('data-x-domain', fitted);
});

test('Log Y leaves a break at nonpositive voltage samples', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'voltage.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,10\n2,-1\n3,100\n4,1000\n'),
  });
  await acceptImport(page);
  const plot = page.getByTestId('chart-plot-pane-1');
  await expect(plot).toBeVisible();
  await page.getByRole('button', { name: 'Pane settings' }).click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  await settings.getByRole('group', { name: 'Y scale' }).getByRole('button', { name: 'Log' }).click();
  await page.keyboard.press('Escape');
  await expect(plot.getByText('1 points ≤ 0 not shown')).toBeVisible();
  await expect(plot.locator('path.recharts-line-curve')).toHaveAttribute('d', /^M[^M]+M[^M]+$/);
});

test('Log X selects a marker only near its screen position at low frequencies', async ({ page }) => {
  await page.goto('/app.html');
  const network = ['# Hz S DB R 50', ...[1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 8.5e9]
    .map(hz => `${hz} -10 0 -2 0 -30 0 -10 0`)].join('\n');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'decades.s2p', mimeType: 'text/plain', buffer: Buffer.from(network) });
  const plot = page.getByTestId('chart-plot-pane-1');
  await expect(plot).toBeVisible();
  await page.getByRole('button', { name: 'Pane settings' }).click();
  await page.getByRole('group', { name: 'X scale' }).getByRole('button', { name: 'Log' }).click();
  await page.keyboard.press('Escape');
  const grid = plot.locator('.chart-log-grid line[data-decade]').nth(1);
  const at = await grid.evaluate(line => {
    const svg = line.closest('svg')?.getBoundingClientRect();
    if (!svg) throw new Error('Missing grid bounds');
    return { x: svg.x + Number(line.getAttribute('x1')), y: svg.y + svg.height / 2 };
  });
  const markers = page.getByRole('button', { name: 'Markers', exact: true });
  if (await markers.getAttribute('aria-pressed') !== 'true') await markers.click();
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await page.mouse.click(at.x, at.y);
  const selected = plot.locator('circle[r="9"]');
  await expect(selected).toBeVisible();
  await page.mouse.click(at.x + 30, at.y);
  await expect(selected).toHaveCount(0);
  await page.mouse.click(at.x + 2, at.y);
  await expect(selected).toBeVisible();
});
