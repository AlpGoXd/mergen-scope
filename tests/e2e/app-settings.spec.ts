import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('settings and local-only disclosure remain usable', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Local only' }).click();
  await expect(page.getByText('Your files are read in this browser and never uploaded. No cookies; settings are kept in this browser.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Local only' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'App settings' })).toBeVisible();
});

test('settings uses full-width segments with equal buttons and the Slate selection fill', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  for (const name of ['Theme', 'Size', 'Neutral colour', 'Trace symbols', 'Export theme']) {
    const group = sheet.getByRole('group', { name, exact: true });
    const state = await group.evaluate(row => {
      const buttons = Array.from(row.querySelectorAll('button'));
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--slate-fill)';
      document.body.append(probe);
      const expectedFill = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const selected = row.querySelector('[aria-pressed="true"]');
      if (!selected || !row.parentElement) throw new Error('Incomplete settings segment');
      return {
        expectedFill,
        selectedFill: getComputedStyle(selected).backgroundColor,
        widths: buttons.map(button => button.getBoundingClientRect().width),
        groupWidth: row.getBoundingClientRect().width,
        controlWidth: row.parentElement.getBoundingClientRect().width,
        buttonSpan: (buttons.at(-1)?.getBoundingClientRect().right ?? 0) - (buttons[0]?.getBoundingClientRect().left ?? 0),
      };
    });
    expect(Math.max(...state.widths) - Math.min(...state.widths)).toBeLessThanOrEqual(1);
    expect(state.groupWidth).toBeCloseTo(state.controlWidth, 0);
    expect(state.buttonSpan).toBeCloseTo(state.controlWidth, 0);
    expect(state.selectedFill).toBe(state.expectedFill);
  }
});

test('neutral colour and palette persist, and Reset restores all defaults', async ({ page }) => {
  await page.goto('/app.html');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  const segment = (label: string, option: string) => sheet.getByRole('group', { name: label, exact: true }).getByRole('button', { name: option, exact: true });
  const root = page.locator('html');
  const tokens = () => root.evaluate(el => {
    const css = getComputedStyle(el);
    return ['--neutral-h', '--neutral-scale', '--bg', '--tr0', '--marker-fill'].map(token => css.getPropertyValue(token).trim());
  });

  await settings.click();
  const slate = await tokens();
  await segment('Neutral colour', 'Stone').click();
  const stone = await tokens();
  expect(stone.slice(0, 2)).toEqual(['60', '0.7']);
  expect(stone[2]).not.toBe(slate[2]);
  expect(stone.slice(3)).toEqual(slate.slice(3));
  await page.reload();
  expect(await tokens()).toEqual(stone);

  await settings.click();
  await expect(segment('Neutral colour', 'Stone')).toHaveAttribute('aria-pressed', 'true');
  await segment('Neutral colour', 'Zinc').click();
  const zinc = await tokens();
  expect(zinc[1]).toBe('0');
  expect(zinc[2]).not.toBe(stone[2]);
  await page.reload();
  expect(await tokens()).toEqual(zinc);
  await settings.click();

  const standard = sheet.getByRole('radio', { name: 'Standard', exact: true });
  const colourBlind = sheet.getByRole('radio', { name: 'Colour-blind safe', exact: true });
  await colourBlind.click();
  await expect(colourBlind).toHaveAttribute('aria-checked', 'true');
  await colourBlind.press('ArrowUp');
  await expect(standard).toBeFocused();
  await expect(standard).toHaveAttribute('aria-checked', 'true');
  await standard.press('ArrowDown');
  await expect(colourBlind).toBeFocused();
  await expect(colourBlind).toHaveAttribute('aria-checked', 'true');
  await standard.press('Space');
  await expect(standard).toHaveAttribute('aria-checked', 'true');
  await colourBlind.press('Enter');
  await expect(colourBlind).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await settings.click();
  await expect(colourBlind).toHaveAttribute('aria-checked', 'true');

  await segment('Size', 'Large').click();
  await segment('Theme', 'Dark').click();
  await segment('Trace symbols', 'Always').click();
  await segment('Export theme', 'As app').click();
  const limitSwitch = sheet.getByRole('switch', { name: 'Allow more than 4 panes' });
  await limitSwitch.click();
  await expect(limitSwitch).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Reset all to defaults' }).click();
  for (const [group, option] of [['Neutral colour', 'Slate'], ['Size', 'Comfortable'], ['Theme', 'System'], ['Trace symbols', 'Repeat'], ['Export theme', 'Print']] as const) {
    await expect(segment(group, option)).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(standard).toHaveAttribute('aria-checked', 'true');
  await expect(limitSwitch).toHaveAttribute('aria-checked', 'false');
  expect((await tokens()).slice(0, 2)).toEqual(['255', '1']);
});

test('App settings slides over the right panel and updates the visible chart live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  const plot = page.getByTestId('chart-plot-pane-1');
  const gridLine = plot.locator('.recharts-cartesian-grid line').first();
  const lightGrid = await gridLine.evaluate(line => getComputedStyle(line).stroke);
  await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  await settings.click();
  await expect(sheet).toHaveCSS('animation-duration', '0.12s');
  await expect(sheet).not.toHaveAttribute('aria-modal', 'true');
  await expect.poll(async () => (await sheet.boundingBox())!.x).toBeCloseTo(1080, 0);
  const box = (await sheet.boundingBox())!;
  const topBar = (await page.getByTestId('topbar-groups-divider').locator('..').boundingBox())!;
  const footer = (await page.locator('.footer-bar').boundingBox())!;
  expect(box.width).toBeCloseTo(360, 0);
  expect(box.y).toBeCloseTo(topBar.y + topBar.height, 0);
  expect(box.y + box.height).toBeCloseTo(footer.y, 0);

  await sheet.getByRole('group', { name: 'Theme', exact: true }).getByRole('button', { name: 'Dark', exact: true }).click();
  await expect.poll(() => gridLine.evaluate(line => getComputedStyle(line).stroke)).not.toBe(lightGrid);
  await expect(plot.locator('.recharts-line').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(settings).toBeFocused();

  await settings.click();
  await plot.click({ position: { x: 4, y: 4 } });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close settings' }).click();
  await expect(sheet).toHaveCount(0);
});
