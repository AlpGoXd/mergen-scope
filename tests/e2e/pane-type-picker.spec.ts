import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const labels = ['Chart', 'Table', 'Smith', 'Polar', 'Spectrogram', 'Open file…'];

test('empty picker has ordered actions and opens the chart empty state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  const pane = page.getByTestId('chart-pane-pane-1');
  const tiles = pane.locator('.ptp-tile');
  await expect(tiles).toHaveCount(6);
  await expect(pane.getByRole('button', { name: 'Eye', exact: true })).toHaveCount(0);
  const boxes = await Promise.all(labels.map((_, index) => tiles.nth(index).boundingBox()));
  expect(new Set(boxes.map(box => box?.x)).size).toBe(3);
  expect(new Set(boxes.map(box => box?.y)).size).toBe(2);
  for (let i = 0; i < labels.length; i++) {
    await expect(tiles.nth(i)).toContainText(labels[i] ?? '');
    await expect(tiles.nth(i)).not.toHaveAttribute('aria-pressed', 'true');
  }
  for (const label of ['Table', 'Smith', 'Polar', 'Spectrogram']) {
    const tile = pane.locator('.ptp-tile').filter({ hasText: label });
    await expect(tile).toHaveAttribute('aria-disabled', 'true');
    await expect(tile).toContainText(label === 'Spectrogram' ? 'needs data' : 'later');
  }
  const header = page.getByTestId('chart-pane-header-pane-1');
  await expect(header).toContainText('Pane 1');
  await expect(header).toContainText('Empty');
  await expect(header.getByRole('button', { name: 'Close Pane 1' })).toHaveCount(0);
  await expect(header.getByRole('button', { name: /Fit|Samples|Pane settings|Pane actions/ })).toHaveCount(0);
  await tiles.first().click();
  await expect(pane.getByText('Empty chart')).toBeVisible();
  await expect(pane.getByRole('button', { name: /Open file/ })).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 640 }]) {
  test(`four panes fit at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto('/app.html');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ Pane' }).click();
    for (let i = 1; i <= 4; i++) {
      const pane = page.getByTestId(`chart-pane-pane-${i}`);
      const box = await pane.boundingBox(); expect(box).not.toBeNull();
      const tiles = pane.locator('.ptp-tile');
      await expect(tiles).toHaveCount(6);
      for (let index = 0; index < labels.length; index++) {
        const tile = tiles.nth(index); await expect(tile).toBeVisible();
        const rect = await tile.boundingBox();
        expect(rect && box && rect.x >= box.x && rect.y >= box.y && rect.x + rect.width <= box.x + box.width && rect.y + rect.height <= box.y + box.height).toBeTruthy();
      }
      expect(await pane.locator('.ptp').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
    }
  });
}

test('header type popover is above neighbouring panes and closes on Escape', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane' }).click();
  const header = page.getByTestId('chart-pane-header-pane-1');
  const chip = header.getByRole('button', { name: 'Pane type: Chart' });
  await expect(header.locator('.ph-title')).toHaveText('Pane 1');
  expect(await header.locator('.ph-title').evaluate(el => getComputedStyle(el).textTransform)).toBe('none');
  await expect(header).not.toContainText('TARGET');
  expect(await chip.evaluate(el => el.previousElementSibling?.textContent?.trim())).toBe('Pane 1');
  await expect(header.getByTestId('samples-toggle')).toBeVisible();
  await expect(header.getByTitle('Pane settings')).toBeVisible();
  await expect(header.getByRole('button', { name: 'Pane actions' })).toBeVisible();
  await chip.click();
  const popup = page.locator('.ui-popover[aria-label="Pane type"]');
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('radio', { name: 'Chart' })).toBeFocused();
  await expect(popup.getByRole('radio')).toHaveCount(5);
  await expect(popup.getByRole('radio', { name: 'Smith' })).toHaveAttribute('aria-disabled', 'true');
  expect(await popup.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test('hovering an unavailable type explains which traces fit', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.getByTestId('chart-pane-header-pane-1').getByRole('button', { name: 'Pane type: Chart' }).click();
  const popup = page.locator('.ui-popover[aria-label="Pane type"]');
  await popup.getByRole('radio', { name: 'Smith' }).hover();
  await expect(popup.locator('.t-caption')).toHaveText(/^Pane 1 shows \d+ traces?\. Smith cannot show any of them\.$/);
});


test('opening a file in the second empty pane targets that pane', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: '+ Pane' }).click();
  await expect(page.getByTestId('chart-pane-header-pane-2').getByRole('button', { name: 'Close Pane 2' })).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('chart-pane-pane-2').getByRole('button', { name: 'Open file…' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'second.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await expect(page.getByTestId('chart-plot-pane-2')).toBeVisible();
});

test('closing an empty pane removes that pane and can be undone', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: '+ Pane' }).click();
  await page.getByTestId('chart-pane-header-pane-1').getByRole('button', { name: 'Close Pane 1' }).click();
  await expect(page.getByTestId('chart-pane-pane-1')).toHaveCount(0);
  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('chart-pane-pane-1')).toBeVisible();
});

test('cancelling an empty-pane close preserves an unplaceable reference line', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'time.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane' }).click();
  const download = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path();
  if (!path) throw new Error('Workspace download unavailable');
  const workspace: { snapshot: { refLines: { id: number; type: string; value: number; paneIds: string[]; axisUnit: string; label: string }[] } } = JSON.parse(readFileSync(path, 'utf8'));
  workspace.snapshot.refLines.push({ id: 99, type: 'v', value: 1, paneIds: ['pane-2'], axisUnit: JSON.stringify(['Hz', 'Hz']), label: 'V99' });
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('topbar-workspace-input').setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workspace)) });
  await expect(page.getByTestId('ref-line-row-V99')).toBeVisible();
  const confirmation = page.waitForEvent('dialog');
  const click = page.getByTestId('chart-pane-header-pane-2').getByRole('button', { name: 'Close Pane 2' }).click();
  const dialog = await confirmation;
  expect(dialog.message()).toContain('V99 -> not in a pane');
  await dialog.dismiss();
  await click;
  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  await expect(page.getByTestId('ref-line-row-V99')).toBeVisible();
});
