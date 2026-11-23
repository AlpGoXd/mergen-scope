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

test('settings uses full-width segments with equal buttons and the tint selection fill', async ({ page }) => {
  await page.goto('/app.html');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  for (const name of ['Theme', 'Size', 'Neutral tint', 'Trace symbols', 'Contrast']) {
    const group = sheet.getByRole('group', { name, exact: true });
    const state = await group.evaluate(row => {
      const buttons = Array.from(row.querySelectorAll('button'));
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--on-fill)';
      document.body.append(probe);
      const expectedFill = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const selected = row.querySelector('[aria-pressed="true"]');
      if (!selected || !row.parentElement) throw new Error('Incomplete settings segment');
      const wrappedButtons = buttons.filter(button => {
        const range = document.createRange();
        range.selectNodeContents(button);
        const lines = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => Math.round(rect.top)));
        return lines.size > 1;
      }).map(button => button.textContent);
      return {
        overflow: buttons.some(button => button.scrollWidth > button.clientWidth || getComputedStyle(button).textOverflow === 'ellipsis'),
        wrappedButtons,
        expectedFill,
        selectedFill: getComputedStyle(selected).backgroundColor,
        widths: buttons.map(button => button.getBoundingClientRect().width),
        rows: Array.from(new Set(buttons.map(button => button.offsetTop))).map(y => buttons.filter(button => button.offsetTop === y).length),
        groupWidth: row.getBoundingClientRect().width,
        controlWidth: row.parentElement.getBoundingClientRect().width,
        buttonSpan: Math.max(...buttons.map(button => button.getBoundingClientRect().right)) - Math.min(...buttons.map(button => button.getBoundingClientRect().left)),
      };
    });
    expect(Math.max(...state.widths) - Math.min(...state.widths)).toBeLessThanOrEqual(1);
    expect(state.overflow).toBe(false);
    expect(state.wrappedButtons, name).toEqual([]);
    expect(state.groupWidth).toBeCloseTo(state.controlWidth, 0);
    expect(state.buttonSpan).toBeCloseTo(state.controlWidth, 0);
    expect(state.selectedFill).toBe(state.expectedFill);
    if (name === 'Neutral tint') expect(state.rows).toEqual([4, 4]);
  }

  // Size and Neutral tint buttons stay on a single line across Compact, Comfortable and Large (normal & high contrast).
  const sizeGroup = sheet.getByRole('group', { name: 'Size', exact: true });
  const neutralGroup = sheet.getByRole('group', { name: 'Neutral tint', exact: true });
  const contrastGroup = sheet.getByRole('group', { name: 'Contrast', exact: true });
  for (const contrast of ['Normal', 'High'] as const) {
    await contrastGroup.getByRole('button', { name: contrast, exact: true }).click();
    for (const size of ['Compact', 'Comfortable', 'Large'] as const) {
      await sizeGroup.getByRole('button', { name: size, exact: true }).click();
      for (const [label, group] of [['Size', sizeGroup], ['Neutral tint', neutralGroup]] as const) {
        const wrappedButtons = await group.evaluate(row => Array.from(row.querySelectorAll('button')).filter(button => {
          const range = document.createRange();
          range.selectNodeContents(button);
          const lines = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => Math.round(rect.top)));
          return lines.size > 1 || button.scrollWidth > button.clientWidth;
        }).map(button => button.textContent));
        expect(wrappedButtons, `${label} at Size=${size}, Contrast=${contrast}`).toEqual([]);
      }
    }
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
    return ['--neutral-h', '--neutral-chroma-scale', '--bg', '--tr0', '--marker-fill'].map(token => css.getPropertyValue(token).trim());
  });

  await settings.click();
  const slate = await tokens();
  await segment('Neutral tint', 'Sand').click();
  const stone = await tokens();
  expect(stone.slice(0, 2)).toEqual(['70', '1']);
  expect(stone[2]).not.toBe(slate[2]);
  expect(stone.slice(3)).toEqual(slate.slice(3));
  await page.reload();
  expect(await tokens()).toEqual(stone);

  await settings.click();
  await expect(segment('Neutral tint', 'Sand')).toHaveAttribute('aria-pressed', 'true');
  await segment('Neutral tint', 'Mist').click();
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
  await segment('Contrast', 'High').click();
  const limitSwitch = sheet.getByRole('switch', { name: 'Allow more than 4 panes' });
  await limitSwitch.click();
  await expect(limitSwitch).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Reset all to defaults' }).click();
  for (const [group, option] of [['Neutral tint', 'Storm'], ['Size', 'Comfortable'], ['Theme', 'System'], ['Trace symbols', 'Repeat'], ['Contrast', 'Normal']] as const) {
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
  await expect(sheet.getByRole('heading', { name: 'Export', exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('group', { name: 'Export theme', exact: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close settings' }).click();
  await expect(sheet).toHaveCount(0);
});

test('Sakura and High persist while Palette A changes the trace colours', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/app.html');
  const loadChart = async () => {
    await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
    await page.getByTestId('touchstone-cell-S21').click();
  };
  await loadChart();
  const plot = page.getByTestId('chart-plot-pane-1');
  const curve = plot.locator('.recharts-line-curve').first();
  const standard = await curve.evaluate(el => getComputedStyle(el).stroke);
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  const app = page.getByTestId('app-root');

  await settings.click();
  await sheet.getByRole('button', { name: 'Sakura', exact: true }).click();
  await expect(app).toHaveCSS('background-color', 'oklch(0.985 0.006 355)');
  await expect(curve).toHaveCSS('stroke', standard);
  await expect(plot).toHaveCSS('background-color', 'oklch(0.996 0.003 355)');
  await sheet.getByRole('button', { name: 'High', exact: true }).click();
  await expect(app).toHaveCSS('background-color', 'oklch(0.99 0.006 355)');
  await expect(curve).toHaveCSS('stroke', 'oklch(0.48 0.22 270)');
  await expect(curve).toHaveCSS('stroke-width', '2px');
  await expect(plot.locator('.recharts-cartesian-grid line').first()).toHaveCSS('stroke-opacity', '1');
  await sheet.getByRole('radio', { name: 'Colour-blind safe' }).click();
  await expect(curve).toHaveCSS('stroke', /^oklch\(0\.52 [\d.]+ 244\)$/);
  await page.reload();
  await loadChart();
  await expect(app).toHaveCSS('background-color', 'oklch(0.99 0.006 355)');
  await expect(curve).toHaveCSS('stroke', /^oklch\(0\.52 [\d.]+ 244\)$/);
  await settings.click();
  await expect(sheet.getByRole('button', { name: 'Sakura', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: 'High', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('radio', { name: 'Colour-blind safe' })).toHaveAttribute('aria-checked', 'true');
  const ember = sheet.getByRole('button', { name: 'Ember', exact: true });
  await ember.click();
  await expect(app).toHaveCSS('background-color', 'oklch(0.99 0.006 25)');
  await expect(ember).toHaveCSS('background-color', 'oklch(0.35 0.13 25)');
  await expect(ember).toHaveCSS('color', 'oklch(0.99 0.006 25)');
  await expect(ember).toHaveCSS('font-weight', '700');
  await expect(page.locator('html')).toHaveCSS('accent-color', 'oklch(0.35 0.13 25)');
  await expect(page.locator('.topbar-brand-scope')).toHaveCSS('color', 'oklch(0.35 0.13 25)');
  await expect(page.locator('.topbar-brand-scope')).toHaveCSS('font-weight', '800');
  await expect(page.locator('.topbar-brand-wave')).toHaveCSS('stroke-width', '2.2px');
  await sheet.getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(page.locator('.topbar-brand-scope')).toHaveCSS('color', 'oklch(0.5 0.13 25)');
  await expect(ember).toHaveCSS('background-color', 'oklch(0.92 0.035 25)');
  await expect(page.locator('.topbar-brand-wave')).toHaveCSS('stroke', 'oklch(0.58 0.16 45)');
  await expect(page.locator('.topbar-brand-mark path').last()).toHaveCSS('fill', 'oklch(0.58 0.108 225)');
});

for (const theme of ['light', 'dark'] as const) {
  test(`High contrast keeps selected palette cards and tool labels readable in ${theme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.goto('/app.html');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'App settings' });
    await sheet.getByRole('button', { name: 'High', exact: true }).click();
    const surface = theme === 'light' ? 'oklch(1 0.001 255)' : 'oklch(0.18 0.008 255)';
    const ink = theme === 'light' ? 'oklch(0.12 0.007 255)' : 'oklch(0.98 0.008 255)';
    const accent = theme === 'light' ? 'oklch(0.35 0.115 255)' : 'oklch(0.84 0.08 255)';
    const card = sheet.getByRole('radio', { name: 'Standard', exact: true });
    await expect(card).toHaveCSS('background-color', surface);
    await expect(card).toHaveCSS('border-top-color', accent);
    await expect(card.getByText('Standard', { exact: true })).toHaveCSS('color', ink);
    await expect(page.locator('.topbar-brand-wave')).toHaveCSS('stroke', accent);
    await sheet.getByRole('button', { name: 'Large', exact: true }).click();
    const size = sheet.getByRole('group', { name: 'Size', exact: true });
    await expect(size.getByRole('button', { name: 'Comfortable', exact: true })).toHaveCSS('text-overflow', 'clip');
    await sheet.getByRole('button', { name: 'Close settings' }).click();

    const markers = page.getByRole('button', { name: 'Markers', exact: true });
    if (await markers.getAttribute('aria-pressed') !== 'true') await markers.click();
    await expect(markers).toHaveCSS('background-color', /^oklch\((?:0\.87|0\.32) [\d.]+ 20\)$/);

    // Target pane scale readout (X/div · Y/div) uses inverted on-ink over the high-contrast accent header.
    await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
    await expect(page.getByTestId('touchstone-cell-S11')).toBeVisible();
    const bg = theme === 'light' ? 'oklch(0.99 0.003 255)' : 'oklch(0.1 0.008 255)';
    await expect(page.getByTestId('chart-pane-header-pane-1').locator('.ph-scale')).toHaveCSS('color', bg);

    // Disabled "Plot as" buttons on a Smith pane stay readable (panel fill, not solid accent fill).
    await page.getByRole('button', { name: '+ Pane' }).click();
    const smithTile = page.getByTestId('chart-pane-pane-2').locator('.ptp-tile').filter({ hasText: 'Smith' });
    await smithTile.click();
    await expect(page.getByTestId('chart-pane-pane-2').getByText('Empty Smith chart')).toBeVisible();
    const plotAsDb = page.getByRole('group', { name: 'Plot as', exact: true }).getByRole('button', { name: 'dB', exact: true });
    await expect(plotAsDb).toBeDisabled();
    const panel = theme === 'light' ? 'oklch(0.97 0.005 255)' : 'oklch(0.14 0.008 255)';
    const muted = theme === 'light' ? 'oklch(0.3 0.005 255)' : 'oklch(0.86 0.008 255)';
    await expect(plotAsDb).toHaveCSS('background-color', panel);
    await expect(plotAsDb).toHaveCSS('color', muted);
    await expect(plotAsDb).toHaveCSS('border-top-style', 'dashed');
  });
}
