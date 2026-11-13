import { expect, test } from '@playwright/test';

import { acceptImport } from './import-helpers';
import { readFileSync } from 'node:fs';

test('header Samples stays in sync, supports undo and remains visible', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'samples.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
  await acceptImport(page);
  const pane = page.getByTestId('chart-pane-pane-1');
  const button = pane.getByTestId('samples-toggle');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(pane.locator('.recharts-line-dot')).toHaveCount(3);
  await pane.getByTitle('Pane settings').click();
  const chip = page.getByTestId('sample-dots-toggle');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await chip.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await pane.getByTitle('Pane settings').click();
  await page.keyboard.press('Control+z');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(pane.getByRole('button', { name: 'Pane actions' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const header = page.getByTestId('chart-pane-header-pane-1');
  const typeChip = header.getByRole('button', { name: 'Chart type: Chart. Change chart type' });
  const initial = await header.boundingBox();
  // Narrow panes never wrap and never overlap. Drop order: scale text, trace count, the "Chart type"
  // prefix, the type name (icon stays), then Samples becomes an icon. The settings button never hides.
  const read = () => header.evaluate(el => ({
    level: Number(el.dataset['level']),
    scale: !!el.querySelector('.ph-scale'), count: !!el.querySelector('.ph-count'),
    prefix: !!el.querySelector('.ptc-prefix'), label: !!el.querySelector('.ptc-label'),
    samples: el.querySelector('[data-testid="samples-toggle"]')?.textContent ?? '',
    fits: el.scrollWidth <= el.clientWidth, wrap: getComputedStyle(el).flexWrap,
    first: el.firstElementChild?.textContent ?? '',
  }));
  let previousLevel = 0;
  for (const width of [900, 600, 420, 320, 240, 170]) {
    await pane.evaluate((el, w) => { el.style.flex = 'none'; el.style.width = `${w}px`; }, width);
    await expect.poll(async () => (await header.boundingBox())?.width).toBeCloseTo(width, 0);
    await expect.poll(async () => (await read()).fits).toBe(true);
    const state = await read();
    expect(state.wrap).toBe('nowrap');
    expect(state.first).toBe('Pane 1');
    expect(state.level).toBeGreaterThanOrEqual(previousLevel);
    previousLevel = state.level;
    expect(state.scale).toBe(state.level < 1);
    expect(state.count).toBe(state.level < 2);
    expect(state.prefix).toBe(state.level < 3);
    expect(state.label).toBe(state.level < 4);
    expect(state.samples).toBe(state.level < 5 ? 'Samples' : '');
    const h = await header.boundingBox();
    expect(h?.height).toBe(initial?.height);
    let right = h?.x ?? 0;
    for (const control of [header.locator('.ph-title'), typeChip, button, header.getByTitle('Pane settings')]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      // Inside the header and after the previous control: nothing overlaps.
      expect(box && h && box.x >= right - 0.5 && box.x + box.width <= h.x + h.width + 0.5, `${width}px`).toBeTruthy();
      right = (box?.x ?? 0) + (box?.width ?? 0);
    }
  }
  // 900 px shows everything; 170 px is the last step: an icon-only chip and an icon-only Samples that keeps its name.
  expect(previousLevel).toBe(5);
  await expect(typeChip).toHaveAttribute('data-compact', 'true');
  await expect(button).toHaveAttribute('aria-label', 'Samples');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await pane.evaluate(el => { el.style.width = '900px'; });
  await expect.poll(async () => (await read()).level).toBe(0);
  await expect(header.locator('.ph-scale')).toHaveText(/^X .+\/div · Y .+\/div$/);
  expect(await header.locator('.ph-scale').evaluate(el => getComputedStyle(el).fontWeight)).toBe('400');
  await expect(page.locator('.ui-toast')).toHaveCount(0);
});

test('a long saved pane title leaves header controls visible at 330px', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'samples.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
  await acceptImport(page);
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path();
  if (!path) throw new Error('Workspace download unavailable');
  const workspace: { snapshot: { panes: { title: string }[] } } = JSON.parse(readFileSync(path, 'utf8'));
  const pane = workspace.snapshot.panes[0];
  if (!pane) throw new Error('Workspace has no pane');
  pane.title = 'X'.repeat(60);
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('topbar-workspace-input').setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workspace)) });
  const header = page.getByTestId('chart-pane-header-pane-1');
  await expect(header.locator('.ph-title')).toHaveAttribute('title', pane.title);
  await page.addStyleTag({ content: '[data-testid="chart-pane-header-pane-1"] { width: 330px; box-sizing: border-box; }' });
  const box = await header.boundingBox();
  for (const control of [header.getByTestId('samples-toggle'), header.getByTitle('Pane settings')]) {
    await expect(control).toBeVisible();
    const rect = await control.boundingBox();
    expect(rect && box && rect.x >= box.x && rect.x + rect.width <= box.x + box.width).toBeTruthy();
  }
});
