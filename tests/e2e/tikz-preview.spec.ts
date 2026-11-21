import { expect, test } from '@playwright/test';

// One-column TikZ preview of the 2 × 2 demo: titles and legend names must be whole, not cut at a pane edge.
test('the one-column TikZ preview keeps axis titles and legend names whole', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Load demo' }).click();
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await page.keyboard.press('Control+Shift+E');
  const dialog = page.locator('dialog[open]').last();
  await dialog.getByRole('button', { name: 'All panes', exact: true }).click();
  await dialog.getByRole('button', { name: 'TikZ', exact: true }).click();
  await dialog.getByRole('button', { name: 'Paper 1-col', exact: true }).click();
  const image = dialog.locator('#exd-preview-content img');
  await expect(image).toBeVisible({ timeout: 20_000 });
  const svg = await image.evaluate(async (img: HTMLImageElement) => (await fetch(img.src)).text());
  // The sheet grows past the 60 mm paper height instead of squeezing the plots.
  expect(Number(/height="([\d.]+)mm"/.exec(svg)?.[1])).toBeGreaterThan(60);
  expect(svg).toContain('Magnitude (dB)');
  // A long legend name wraps onto two lines (tspans) inside its pane.
  expect(svg).toMatch(/<tspan[^>]*>waveform_sinc_test\.csv<\/tspan><tspan[^>]*>signal_1khz<\/tspan>/);
});
