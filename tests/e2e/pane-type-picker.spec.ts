import { test, expect } from '@playwright/test';

const ids = ['chart', 'table', 'smith', 'polar', 'spectrogram', 'open'];

test('empty picker has ordered actions and opens the chart empty state', async ({ page }) => {
  await page.goto('/app.html');
  const pane = page.getByTestId('chart-pane-pane-1');
  const tiles = pane.locator('[data-testid^="pane-type-tile-"]');
  await expect(tiles).toHaveCount(6);
  await expect(pane.getByTestId('pane-type-tile-eye')).toHaveCount(0);
  const boxes = await Promise.all(ids.map(id => pane.getByTestId(`pane-type-tile-${id}`).boundingBox()));
  expect(new Set(boxes.map(box => box?.x)).size).toBe(3);
  expect(new Set(boxes.map(box => box?.y)).size).toBe(2);
  for (let i = 0; i < ids.length; i++) {
    await expect(tiles.nth(i)).toHaveAttribute('data-testid', `pane-type-tile-${ids[i]}`);
    await expect(tiles.nth(i)).not.toHaveAttribute('aria-pressed', 'true');
  }
  for (const id of ['table', 'smith', 'polar', 'spectrogram']) {
    const tile = pane.getByTestId(`pane-type-tile-${id}`);
    await expect(tile).toHaveAttribute('aria-disabled', 'true');
    await expect(tile).toHaveAttribute('title', /.+/);
    await expect(tile).toContainText(id === 'spectrogram' ? 'needs data' : 'later');
  }
  await pane.getByTestId('pane-type-tile-chart').click();
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
      for (const id of ids) {
        const tile = pane.getByTestId(`pane-type-tile-${id}`); await expect(tile).toBeVisible();
        const rect = await tile.boundingBox();
        expect(rect && box && rect.x >= box.x && rect.y >= box.y && rect.x + rect.width <= box.x + box.width && rect.y + rect.height <= box.y + box.height).toBeTruthy();
      }
      expect(await pane.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
    }
  });
}

test('header type popover is above neighbouring panes and closes on Escape', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane' }).click();
  await page.getByTestId('chart-pane-pane-1').getByTestId('pane-type-icon').click();
  const popup = page.locator('.ui-popover').filter({ hasText: 'Show Pane 1 as' });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('button', { name: /Chart/ })).toBeFocused();
  await expect(popup.getByRole('group', { name: 'Pane types' }).getByRole('button')).toHaveCount(5);
  await expect(popup.getByRole('button', { name: /Smith/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(popup.getByRole('button', { name: /Smith/ })).toHaveAttribute('title', /.+/);
  expect(await popup.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0);
  await expect(page.getByTestId('chart-pane-pane-1').getByTestId('pane-type-icon')).toBeFocused();
});


test('opening a file in the second empty pane targets that pane', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: '+ Pane' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('chart-pane-pane-2').getByTestId('pane-type-tile-open').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'second.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await expect(page.getByTestId('chart-plot-pane-2')).toBeVisible();
});
