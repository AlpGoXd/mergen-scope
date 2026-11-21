import { expect, test } from '@playwright/test';

// ?embed=1 is the app framed on the landing page: top bar, panes and footer only.
test('embed=1 shows the demo without side panels, toasts or Help, and the crosshair still reads', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html?demo=1&embed=1');
  for (const n of [1, 3, 4]) await expect(page.getByTestId(`chart-pane-pane-${n}`).locator('.recharts-line').first()).toBeVisible();
  await expect(page.getByTestId('chart-pane-pane-2').getByTestId('smith-pane')).toBeVisible();

  // Kept: the top bar (brand linking out of the frame, the toolbar) and the footer.
  const brand = page.getByTestId('topbar-brand-link');
  await expect(brand).toBeVisible();
  await expect(brand).toHaveAttribute('href', '/');
  await expect(brand).toHaveAttribute('target', '_top');
  await expect(page.locator('.footer-bar')).toBeVisible();
  await expect(page.getByTestId('footer-target')).toContainText('Target');

  // Toolbar: only the four tool groups next to the brand; panel toggles and file actions are gone.
  for (const name of ['Open', 'Save', 'Export', 'Analysis']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(page.getByTitle('Toggle left panel')).toHaveCount(0);
  for (const name of ['Markers', 'Search', 'Lines', 'Pane']) await expect(page.locator('.tool-zone').getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();

  // Hidden: the left panel and the right panel.
  await expect(page.locator('aside.lp')).toHaveCount(0);
  await expect(page.locator('aside')).toHaveCount(0);

  // Hidden: the "Opened workspace" toast and the Help sheet.
  await expect(page.locator('.ui-toast-host')).toBeHidden();
  await expect(page.getByText('Opened workspace')).toBeHidden();
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByTestId('help-sheet')).toBeHidden();
  await page.keyboard.press('Escape');

  // Shortcuts of the hidden actions do nothing (no download, no file dialog, no menu, no error).
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  let choosers = 0;
  page.on('filechooser', () => { choosers += 1; });
  await page.getByTestId('chart-plot-pane-1').hover();
  for (const keys of ['Control+o', 'Control+s', 'Control+Shift+e', 'Control+Shift+c', 'Control+Shift+s']) await page.keyboard.press(keys);
  await page.waitForTimeout(500);
  expect({ downloads, choosers, errors }).toEqual({ downloads: 0, choosers: 0, errors: [] });
  await expect(page.getByRole('menu', { name: 'Export' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: /^Export/ })).toHaveCount(0);

  // The Markers group works: + Marker, then a click in pane 1 places M7 (the demo has six).
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  const markerPlot = page.getByTestId('chart-plot-pane-1');
  const markerBox = await markerPlot.boundingBox();
  await markerPlot.click({ position: { x: (markerBox?.width ?? 600) * 0.7, y: (markerBox?.height ?? 300) * 0.5 } });
  await expect(page.getByTestId('chart-pane-pane-1')).toContainText('M7');

  // The crosshair works: pointing at pane 1 fills the footer readout.
  const plot = page.getByTestId('chart-plot-pane-1');
  const box = await plot.boundingBox();
  if (!box) throw new Error('pane 1 has no box');
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await expect(page.getByTestId('footer-readout')).not.toHaveText('');
});

test('without embed=1 the app keeps its left panel and plain brand', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html?demo=1');
  await expect(page.getByTestId('chart-pane-pane-3').locator('.recharts-line').first()).toBeVisible();
  await expect(page.locator('aside.lp')).toBeVisible();
  await expect(page.getByTestId('topbar-brand-link')).toHaveCount(0);
  for (const name of ['Open', 'Save', 'Export', 'Analysis']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});
