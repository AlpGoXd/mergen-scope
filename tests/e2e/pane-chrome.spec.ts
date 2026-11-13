import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

const pane = (page: Page, n: number) => page.getByTestId(`chart-pane-pane-${n}`);
const header = (page: Page, n: number) => page.getByTestId(`chart-pane-header-pane-${n}`);

async function chartAndSmith(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 2).locator('.ptp-tile').filter({ hasText: 'Smith' }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(pane(page, 2).locator('[data-testid^="smith-trace-"]').first()).toBeVisible();
}

test('the header reads Pane N, chart type, trace count, scale, X link, Samples, settings and has no Move Here, Set Target, Fit or ⋯', async ({ page }) => {
  await chartAndSmith(page);
  const first = header(page, 1);
  expect(await first.evaluate(el => [...el.children].map(child => child.className.toString().split(' ').find(name => /^(ph-|ptc$|ui-btn$)/.test(name)) ?? child.tagName))).toEqual(['ph-title', 'ptc', 'ph-count', 'ph-spacer', 'ph-scale', 'ui-btn', 'ui-btn', 'ui-btn']);
  await expect(first.getByTestId('x-link-chip-pane-1')).toHaveText('Hz');
  await expect(first.locator('.ph-count')).toHaveText('2 traces');
  await expect(first.locator('.ph-scale')).toHaveText(/^X .+\/div · Y .+\/div$/);
  await expect(first.getByRole('button')).toHaveCount(4);
  for (const name of ['Move Here', 'Set Target', 'Fit', 'Pane actions']) await expect(first.getByRole('button', { name, exact: true })).toHaveCount(0);
  // Smith has Samples too, and no X/Y scale text.
  await expect(header(page, 2).getByTestId('samples-toggle')).toBeVisible();
  await expect(header(page, 2).locator('.ph-scale')).toHaveCount(0);
});

test('clicking anywhere in a pane makes it the target', async ({ page }) => {
  await chartAndSmith(page);
  await expect(header(page, 2)).toHaveClass(/is-target/);
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 200, y: 120 } });
  await expect(header(page, 1)).toHaveClass(/is-target/);
  await expect(header(page, 2)).not.toHaveClass(/is-target/);
  await pane(page, 2).getByTestId('smith-plot').click({ position: { x: 30, y: 30 } });
  await expect(header(page, 2)).toHaveClass(/is-target/);
  await expect(header(page, 1)).not.toHaveClass(/is-target/);
});

test('Smith Samples draws a dot on every measured sample in view', async ({ page }) => {
  await chartAndSmith(page);
  const smith = pane(page, 2);
  await expect(smith.getByTestId('sample-dot')).toHaveCount(0);
  const toggle = header(page, 2).getByTestId('samples-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(smith.getByTestId('sample-dot')).toHaveCount(201);
  expect(await smith.getByTestId('sample-dot').first().getAttribute('r')).toBe('2');
  // With symbols always on, each symbol sits on a real sample and is hollow, so the dot shows inside.
  await header(page, 2).getByTitle('Pane settings').click();
  await page.locator('.ui-popover[aria-label="Pane 2 settings"]').getByRole('button', { name: 'Always' }).click();
  await page.keyboard.press('Escape');
  const symbols = smith.getByTestId('trace-symbol');
  await expect(symbols.first()).toBeVisible();
  const checked = await symbols.evaluateAll(nodes => nodes.map(node => {
    const index = node.getAttribute('data-sample-index');
    const dot = node.parentElement?.querySelector(`[data-testid="sample-dot"][data-sample-index="${index}"]`);
    const at = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(node.getAttribute('transform') ?? '');
    return { fill: node.querySelector('path')?.getAttribute('fill'), same: !!dot && !!at && Math.abs(Number(dot.getAttribute('cx')) - Number(at[1])) < 0.01 && Math.abs(Number(dot.getAttribute('cy')) - Number(at[2])) < 0.01 };
  }));
  expect(checked.length).toBeGreaterThan(1);
  for (const item of checked) { expect(item.fill).toBe('none'); expect(item.same).toBe(true); }
  // In the clipped range no dot sits on an interpolated range edge.
  const start = smith.getByTestId('smith-range-start');
  await start.click(); await start.fill('2.41 GHz'); await start.press('Enter');
  await expect.poll(() => smith.getByTestId('sample-dot').count()).toBeLessThan(201);
  expect(await smith.locator('[data-testid^="smith-trace-"] path').first().getAttribute('d')).toBeTruthy();
});

test('the Smith range is one line with a thin track, and its values use the editable-value pattern', async ({ page }) => {
  await chartAndSmith(page);
  const smith = pane(page, 2);
  const bar = smith.getByTestId('smith-range-bar');
  await expect(bar).toHaveText(/^Range\s*0\.000 GHz → 8\.500 GHz of 10 kHz–8\.5 GHz\s*Full range$/);
  expect(await bar.locator('.smith-range-fill').evaluate(el => el.getBoundingClientRect().height)).toBe(2);
  const handle = await smith.getByTestId('smith-range-handle-start').boundingBox();
  expect(handle?.width).toBe(10); expect(handle?.height).toBe(10);
  const stop = smith.getByTestId('smith-range-stop');
  expect(await stop.evaluate(el => ({ line: getComputedStyle(el).textDecorationLine, style: getComputedStyle(el).textDecorationStyle, weight: getComputedStyle(el).fontWeight, border: getComputedStyle(el).borderTopColor }))).toMatchObject({ line: 'underline', style: 'dotted', weight: '400' });
  await stop.click();
  await expect(stop).toHaveJSProperty('tagName', 'INPUT');
  await expect(stop).toHaveValue('8.500 GHz');
  await stop.press('ArrowDown');
  await expect(stop).toHaveValue('8.499 GHz');
  await stop.press('Shift+ArrowDown');
  await expect(stop).toHaveValue('8.489 GHz');
  await stop.press('Enter');
  await expect(stop).toHaveJSProperty('tagName', 'BUTTON');
  await expect(stop).toHaveText('8.489 GHz');
  await stop.click(); await stop.fill('90 GHz'); await stop.press('Enter');
  await expect(smith.getByTestId('smith-range-stop-message')).toHaveText('Outside 10 kHz–8.5 GHz');
  await stop.press('Escape');
  await expect(stop).toHaveText('8.489 GHz');
  await smith.getByTestId('smith-range-full').click();
  await expect(stop).toHaveText('8.500 GHz');
  await expect(smith.getByTestId('smith-range-full')).toBeDisabled();
});

test('a marker value is plain text until clicked, then a field; a bad value keeps the old one', async ({ page }) => {
  await chartAndSmith(page);
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 200, y: 120 } });
  await page.keyboard.press('n');
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 300, y: 150 } });
  const row = page.getByTestId('marker-row-1');
  await expect(row).toBeVisible();
  await expect(row.locator('input')).toHaveCount(0);
  const value = row.getByRole('button', { name: 'M1 position' });
  const before = await value.innerText();
  expect(await value.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
  await value.hover();
  expect(await value.evaluate(el => getComputedStyle(el).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
  const height = (await row.boundingBox())?.height;
  await value.click();
  const field = row.getByRole('textbox', { name: 'M1 position' });
  await expect(field).toHaveValue(before);
  await field.fill('nonsense'); await field.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(row.getByRole('alert')).toContainText('Not a value');
  expect((await row.boundingBox())?.height).toBe(height);
  await field.press('Escape');
  await expect(value).toHaveText(before);
  await value.click();
  await field.fill('4 GHz'); await field.press('Enter');
  await expect(value).toHaveText(/^4(\.0+)? ?G/);
});

test('dividers are invisible at rest, dim the other panes while dragged and move 2% per arrow key', async ({ page }) => {
  await page.goto('/app.html');
  for (let n = 2; n <= 3; n++) await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await page.getByRole('button', { name: /^Layout:/ }).click();
  await page.locator('.ui-popover[aria-label="Layout"] [data-layout-tile]').filter({ has: page.getByText('1 + side', { exact: true }) }).click();
  const horizontal = page.getByRole('separator', { name: 'Resize panes' }).and(page.locator('[aria-orientation="horizontal"]'));
  const look = () => horizontal.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, line: getComputedStyle(el, '::after').opacity, cursor: getComputedStyle(el).cursor, thickness: el.getBoundingClientRect().height }));
  await page.mouse.move(5, 5);
  expect(await look()).toMatchObject({ background: 'rgba(0, 0, 0, 0)', line: '0', cursor: 'ns-resize', thickness: 8 });
  const box = await horizontal.boundingBox();
  if (!box) throw new Error('no divider');
  await page.mouse.move(box.x + box.width / 2, box.y + 4);
  expect((await look()).line).toBe('1');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 4 });
  await expect(horizontal.locator('.layout-divider__tag')).toHaveText(/^\d+% · \d+%$/);
  // Pane 1 does not touch the divider between panes 2 and 3: it alone is dimmed.
  await expect(page.locator('.pane-layout-cell.is-dimmed')).toHaveCount(1);
  await expect(page.locator('.pane-layout-cell').first()).toHaveClass(/is-dimmed/);
  await page.mouse.up();
  await expect(page.locator('.pane-layout-cell.is-dimmed')).toHaveCount(0);
  // Pane ids are not positions: take the two stacked cells in layout order.
  const top = page.locator('.pane-layout-cell').nth(1), bottom = page.locator('.pane-layout-cell').nth(2);
  await horizontal.dblclick();
  await expect.poll(async () => Math.abs((await top.boundingBox())!.height - (await bottom.boundingBox())!.height)).toBeLessThan(2);
  const total = (await top.boundingBox())!.height + (await bottom.boundingBox())!.height;
  const before = (await top.boundingBox())!.height;
  await horizontal.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => ((await top.boundingBox())!.height - before) / total).toBeCloseTo(0.02, 2);
});

test('Close pane in Pane settings closes any pane and moves its traces', async ({ page }) => {
  await chartAndSmith(page);
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await expect(pane(page, 3)).toBeVisible();
  // Pane 1 holds two traces and is neither empty nor last.
  await header(page, 1).getByTitle('Pane settings').click();
  await page.locator('.ui-popover[aria-label="Pane 1 settings"]').getByRole('button', { name: 'Close pane' }).click();
  await expect(page.locator('[data-testid^="chart-pane-pane-"]')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-testid^="chart-pane-pane-"]')).toHaveCount(3);
  await expect(header(page, 1).locator('.ph-count')).toHaveText('2 traces');
});

test('Export data (CSV)… downloads the pane as CSV', async ({ page }) => {
  await chartAndSmith(page);
  await header(page, 1).getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  const download = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Export data (CSV)…' }).click();
  expect((await download).suggestedFilename()).toBe('Pane 1.csv');
  await expect(settings).toHaveCount(0);
});
