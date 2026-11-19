import { expect, test } from '@playwright/test';
import { resolve } from 'path';

// The hover legend steps to the other top corner when the cursor comes near it, and returns once the cursor has stayed away.
test('the hover legend dodges the cursor near its corner and comes back when the cursor moves away', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));

  const plot = page.getByTestId('chart-plot-pane-1');
  const legend = page.getByTestId('hover-legend-pane-1');
  const box = await plot.boundingBox();
  if (!box) throw new Error('no pane box');

  // Hover mid-plot, far from both top corners: the legend sits in its home corner.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await page.mouse.move(box.x + box.width * 0.5 + 4, box.y + box.height * 0.7 + 4);
  await expect(legend).toBeVisible();
  const homeCorner = await legend.getAttribute('data-corner');
  expect(homeCorner === 'top-right' || homeCorner === 'top-left').toBe(true);
  const otherCorner = homeCorner === 'top-right' ? 'top-left' : 'top-right';
  const homeBox = await legend.boundingBox();
  if (!homeBox) throw new Error('no legend box');

  // Move onto the legend's own box (it ignores the pointer): it jumps to the other corner.
  await page.mouse.move(homeBox.x + homeBox.width / 2, homeBox.y + homeBox.height / 2, { steps: 6 });
  await expect(legend).toHaveAttribute('data-corner', otherCorner);
  const dodgedBox = await legend.boundingBox();
  if (!dodgedBox) throw new Error('no dodged legend box');
  expect(Math.abs(dodgedBox.x - homeBox.x)).toBeGreaterThan(homeBox.width);

  // Move well away from the home box and stay: the legend returns after the hysteresis.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7, { steps: 6 });
  await expect(legend).toHaveAttribute('data-corner', homeCorner ?? 'top-right');
});
