import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('header Samples stays in sync, supports undo and remains visible', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'samples.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
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
  await pane.getByRole('button', { name: 'Pane actions' }).click();
  await expect(page.getByRole('menu', { name: 'Pane actions' }).getByText('Sample dots')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('4');
  const header = page.getByTestId('chart-pane-header-pane-1');
  const typeChip = header.getByRole('button', { name: 'Pane type: Chart' });
  const initial = await header.boundingBox();
  await page.addStyleTag({ content: '[data-testid="chart-pane-header-pane-1"] { width: 480px; box-sizing: border-box; }' });
  await expect(header.locator('.ph-scale').first()).toBeHidden();
  await expect(header.locator('.ph-count')).toBeVisible();
  await expect(typeChip).not.toHaveAttribute('data-compact', 'true');
  await page.addStyleTag({ content: '[data-testid="chart-pane-header-pane-1"] { width: 380px; box-sizing: border-box; }' });
  await expect(header.locator('.ph-count')).toBeHidden();
  await expect(typeChip).not.toHaveAttribute('data-compact', 'true');
  await page.addStyleTag({ content: '[data-testid="chart-pane-header-pane-1"] { width: 330px; box-sizing: border-box; }' });
  await expect(typeChip).toHaveAttribute('data-compact', 'true');
  const h = await header.boundingBox();
  expect(h).not.toBeNull();
  expect(h?.width).toBeCloseTo(330, 0);
  expect(h?.height).toBe(initial?.height);
  expect(await header.evaluate(el => getComputedStyle(el).flexWrap)).toBe('nowrap');
  for (const control of [typeChip, button, pane.getByTitle('Pane settings'), pane.getByRole('button', { name: 'Pane actions' })]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box && h && box.x >= h.x && box.x + box.width <= h.x + h.width).toBeTruthy();
  }
  await expect(header.locator('.ph-scale')).toHaveCount(2);
  await expect(header.locator('.ph-scale').first()).toBeHidden();
  await expect(header.locator('.ph-count')).toBeHidden();
  await expect(page.locator('.ui-toast')).toHaveCount(0);
});

test('a long saved pane title leaves header controls visible at 330px', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'samples.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n1,2\n') });
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
  for (const control of [header.getByTestId('samples-toggle'), header.getByTitle('Pane settings'), header.getByRole('button', { name: 'Pane actions' })]) {
    await expect(control).toBeVisible();
    const rect = await control.boundingBox();
    expect(rect && box && rect.x >= box.x && rect.x + rect.width <= box.x + box.width).toBeTruthy();
  }
});
