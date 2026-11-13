import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';
import { acceptImport } from './import-helpers';
import { linkX } from './x-link-helpers';

// Opt-in X linking (decided 11 Nov): panes start unlinked; the header's link chip links them.
const fixture = resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT');
const pane = (page: Page, id: number) => page.getByTestId(`chart-pane-pane-${id}`);
const plot = (page: Page, id: number) => page.getByTestId(`chart-plot-pane-${id}`);
const chip = (page: Page, id: number) => page.getByTestId(`x-link-chip-pane-${id}`);
const ticks = async (page: Page, id: number) => (await plot(page, id).locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents()).join(' | ');

/** Two panes showing the same Hz trace, in Rows. */
async function twoHzPanes(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(fixture);
  await expect(plot(page, 1)).toBeVisible();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await trace.getByTitle('Show in panes').click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.keyboard.press('Escape');
  await expect(plot(page, 2)).toBeVisible();
}

/** Right-drag across the middle of a pane's plot: an X range zoom. */
async function zoom(page: Page, id: number, from = 0.3, to = 0.6) {
  const box = await plot(page, id).boundingBox();
  if (!box) throw new Error('no plot box');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * from, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * to, y, { steps: 8 });
  await page.mouse.up({ button: 'right' });
}

test('two Hz panes start independent; linked, a zoom in one moves both', async ({ page }) => {
  await twoHzPanes(page);
  for (const id of [1, 2]) {
    await expect(chip(page, id)).toContainText('Hz');
    await expect(chip(page, id)).toHaveAttribute('aria-pressed', 'false');
  }
  const fitted = await ticks(page, 2);
  await zoom(page, 1);
  await expect.poll(() => ticks(page, 1)).not.toBe(fitted);
  expect(await ticks(page, 2)).toBe(fitted);

  // Linking takes the group's range: Pane 2 joins Pane 1's zoom.
  await linkX(page, 1, 2);
  await expect(chip(page, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 1)).toHaveAttribute('aria-label', 'X link (Hz): linked with Pane 2');
  // Rows: only the bottom pane of linked stacked panes keeps tick labels.
  await expect(plot(page, 1).locator('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveCount(0);
  const linked = await ticks(page, 2);
  expect(linked).not.toBe(fitted);

  // Zoom the other pane: both follow (same X per division in both headers).
  const xScale = async (id: number) => ((await page.getByTestId(`chart-pane-header-pane-${id}`).locator('.ph-scale').textContent()) ?? '').split(' · ')[0];
  await zoom(page, 2, 0.4, 0.5);
  await expect.poll(() => ticks(page, 2)).not.toBe(linked);
  await expect.poll(() => xScale(1)).toBe(await xScale(2));

  // Unlink: the panes zoom on their own again and both show tick labels.
  await chip(page, 1).click();
  await page.getByRole('menu', { name: 'Link X with' }).getByRole('menuitem', { name: 'Unlink' }).click();
  await expect(chip(page, 1)).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page, 2)).toHaveAttribute('aria-pressed', 'false');
  await expect(plot(page, 1).locator('.recharts-xAxis .recharts-cartesian-axis-tick').first()).toBeVisible();
  const before = await ticks(page, 2);
  await zoom(page, 1, 0.2, 0.8);
  await expect.poll(() => ticks(page, 1)).not.toBe(before);
  expect(await ticks(page, 2)).toBe(before);
});

test('a time pane is greyed in the link menu with the reason', async ({ page }) => {
  await twoHzPanes(page);
  // "+ Pane" adds after the target pane: target Pane 2 so the new pane is Pane 3.
  await page.getByTestId('chart-pane-header-pane-2').click();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await expect(pane(page, 3)).toBeVisible();
  await expect(page.getByTestId('chart-pane-header-pane-3').locator('.ph-title')).toHaveText('Pane 3');
  await pane(page, 3).evaluate(target => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['Time (s),CH1 (V)\n0,1\n1,2\n2,1\n'], 'time.csv', { type: 'text/csv' }));
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await acceptImport(page);
  await expect(chip(page, 3)).toContainText('s');
  await chip(page, 1).click();
  const menu = page.getByRole('menu', { name: 'Link X with' });
  await expect(menu).toBeVisible();
  const time = menu.getByRole('menuitemcheckbox', { name: /Pane 3\b/ });
  await expect(time).toHaveAttribute('aria-disabled', 'true');
  await expect(time).toContainText('Pane 3 shows time (s)');
  await time.click({ force: true });
  await expect(time).toHaveAttribute('aria-checked', 'false');
  const hz = menu.getByRole('menuitemcheckbox', { name: /Pane 2\b/ });
  await expect(hz).not.toHaveAttribute('aria-disabled', 'true');
  await hz.click();
  await expect(hz).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(chip(page, 3)).toHaveAttribute('aria-pressed', 'false');
});

test('the crosshair shows in an unlinked Hz pane', async ({ page }) => {
  await twoHzPanes(page);
  await expect(chip(page, 2)).toHaveAttribute('aria-pressed', 'false');
  const ghost = plot(page, 2).locator('.x-ghost-crosshair');
  await expect(ghost).toHaveCount(0);
  const box = await plot(page, 1).boundingBox();
  if (!box) throw new Error('no plot box');
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(ghost).toHaveCount(1);
  const first = await ghost.locator('line').getAttribute('x1');
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await expect(ghost.locator('line')).not.toHaveAttribute('x1', first ?? '');
  await page.mouse.move(box.x + box.width * 0.5, box.y - 60);
  await expect(ghost).toHaveCount(0);
});

test('fitted linked panes show the X range of the whole group', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(fixture);
  await expect(plot(page, 1)).toBeVisible();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 2).evaluate(target => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['Frequency (Hz),A (dBm)\n1000000000,0\n1500000000,1\n2000000000,0\n'], 'wide.csv', { type: 'text/csv' }));
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await acceptImport(page);
  await expect(chip(page, 2)).toContainText('Hz');
  const xScale = async (id: number) => ((await page.getByTestId(`chart-pane-header-pane-${id}`).locator('.ph-scale').textContent()) ?? '').split(' · ')[0];
  expect(await xScale(1)).not.toBe(await xScale(2));
  await linkX(page, 2, 1);
  await expect.poll(() => xScale(1)).toBe(await xScale(2));
});
