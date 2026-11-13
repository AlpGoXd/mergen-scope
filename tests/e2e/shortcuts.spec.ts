import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { SHORTCUTS } from '../../src/domain/shortcuts';
import type { KeyStroke, ShortcutId } from '../../src/domain/shortcuts';

const plot = (page: Page) => page.getByTestId('chart-plot-pane-1');
const footer = (page: Page) => page.locator('footer.footer-bar');
const scale = (page: Page) => page.getByTestId('chart-pane-header-pane-1').locator('.ph-scale');
const log = (page: Page) => page.evaluate(() => window.__mergenShortcutLog ?? []);
const clearLog = (page: Page) => page.evaluate(() => { window.__mergenShortcutLog = []; });

/** The Playwright key for a registry stroke (codes, so Shift+N and Shift+/ come out as the browser sends them). */
function keyFor(stroke: KeyStroke): string {
  return [stroke.ctrl ? 'Control' : '', stroke.shift ? 'Shift' : '', stroke.alt ? 'Alt' : '', stroke.code].filter(Boolean).join('+');
}

async function openS21(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  await expect(plot(page).locator('.recharts-line').first()).toBeVisible();
  await focusPlot(page);
}

/** Click an empty corner of the plot: the pane becomes the target and focus leaves any control. */
async function focusPlot(page: Page) {
  await plot(page).click({ position: { x: 4, y: 4 } });
}

async function placeMarker(page: Page) {
  await focusPlot(page);
  await page.keyboard.press('n');
  await plot(page).click({ position: { x: 300, y: 150 } });
  const row = page.getByTestId('marker-row-1');
  await expect(row).toBeVisible();
  if (await plot(page).locator('circle[r="9"]').count() === 0) await row.click({ position: { x: 4, y: 4 } });
  await expect(plot(page).locator('circle[r="9"]')).toHaveCount(1);
  await blur(page);
}

/** Leave any focused control without clicking the plot (a plot click would clear the selection). */
async function blur(page: Page) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
}

/** Right-drag an X range in the plot (the n-th call zooms further in). */
async function zoomX(page: Page, from = 0.3, to = 0.6) {
  const box = await plot(page).boundingBox();
  if (!box) throw new Error('plot has no box');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * from, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * ((from + to) / 2), y, { steps: 4 });
  await page.mouse.move(box.x + box.width * to, y, { steps: 4 });
  await page.mouse.up({ button: 'right' });
}

const armed = (page: Page) => footer(page).getByText('Esc cancels');

/** What each shortcut must do. Record<ShortcutId, …>: a shortcut added to the registry without a check fails to compile. */
const checks: Record<ShortcutId, (page: Page, press: () => Promise<void>) => Promise<void>> = {
  open: async (page, press) => {
    const chooser = page.waitForEvent('filechooser');
    await press();
    expect((await chooser).isMultiple()).toBe(true);
  },
  save: async (page, press) => {
    const download = page.waitForEvent('download');
    await press();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
  },
  export: async (page, press) => {
    await press();
    const menu = page.getByRole('menu', { name: 'Export' });
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId('export-menu-title')).toHaveText('Export · Pane 1');
  },
  'copy-image': async (page, press) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await press();
    await expect(page.locator('.ui-toast')).toContainText('Pane 1 copied as image');
  },
  'download-image': async (page, press) => {
    const download = page.waitForEvent('download');
    await press();
    expect((await download).suggestedFilename()).toMatch(/_Pane-1_\d{4}-\d{2}-\d{2}\.png$/);
  },
  settings: async (page, press) => {
    await press();
    await expect(page.getByRole('dialog', { name: 'App settings' })).toBeVisible();
  },
  help: async (page, press) => {
    await press();
    await expect(page.getByTestId('help-sheet')).toBeVisible();
  },
  'new-marker': async (page, press) => {
    await expect(armed(page)).toHaveCount(0);
    await press();
    await expect(armed(page)).toBeVisible();
  },
  'delta-marker': async (page, press) => {
    await placeMarker(page);
    await press();
    await expect(armed(page)).toBeVisible();
    await plot(page).click({ position: { x: 380, y: 150 } });
    await expect(page.locator('.lp-marker').nth(1)).toContainText('from');
  },
  'fit-pane': async (page, press) => {
    const fitted = await scale(page).innerText();
    await zoomX(page);
    await expect(scale(page)).not.toHaveText(fitted);
    await focusPlot(page);
    await press();
    await expect(scale(page)).toHaveText(fitted);
  },
  'previous-zoom': async (page, press) => {
    const fitted = await scale(page).innerText();
    await zoomX(page);
    await expect(scale(page)).not.toHaveText(fitted);
    const first = await scale(page).innerText();
    // A second gesture after a pause is a second step: scroll scales Y (right-drag would pan, now that X is zoomed).
    await page.waitForTimeout(700);
    for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, -120);
    await expect(scale(page)).not.toHaveText(first);
    await focusPlot(page);
    await press();
    await expect(scale(page)).toHaveText(first);
    await press();
    await expect(scale(page)).toHaveText(fitted);
  },
  escape: async (page, press) => {
    await page.keyboard.press('n');
    await expect(armed(page)).toBeVisible();
    await press();
    await expect(armed(page)).toHaveCount(0);
    // It also closes an open sheet.
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByTestId('help-sheet')).toBeVisible();
    await press();
    await expect(page.getByTestId('help-sheet')).toHaveCount(0);
  },
  delete: async (page, press) => {
    await placeMarker(page);
    await press();
    await expect(page.getByTestId('marker-row-1')).toHaveCount(0);
    // A selected line goes the same way.
    await page.getByRole('button', { name: 'V-Line', exact: true }).click();
    await plot(page).click({ position: { x: 260, y: 150 } });
    await expect(page.getByTestId('ref-line-row-V1')).toBeVisible();
    await page.getByTestId('ref-line-row-V1').click({ position: { x: 4, y: 4 } });
    await blur(page);
    await press();
    await expect(page.getByTestId('ref-line-row-V1')).toHaveCount(0);
  },
  'move-marker': async (page, press) => {
    await placeMarker(page);
    const value = page.getByTestId('marker-row-1').getByRole('button', { name: 'M1 position' });
    const before = await value.innerText();
    await press();
    await expect(value).not.toHaveText(before);
  },
  undo: async (page, press) => {
    await placeMarker(page);
    await press();
    await expect(page.getByTestId('marker-row-1')).toHaveCount(0);
  },
  redo: async (page, press) => {
    await placeMarker(page);
    await page.keyboard.press('Control+KeyZ');
    await expect(page.getByTestId('marker-row-1')).toHaveCount(0);
    await press();
    await expect(page.getByTestId('marker-row-1')).toBeVisible();
  },
};

for (const shortcut of SHORTCUTS) {
  shortcut.strokes.forEach((stroke, index) => {
    const keys = shortcut.keys[index]?.join('+') ?? keyFor(stroke);
    test(`${keys}: ${shortcut.label}`, async ({ page }) => {
      await openS21(page);
      let pressed = 0;
      await checks[shortcut.id](page, async () => { await clearLog(page); await page.keyboard.press(keyFor(stroke)); pressed += 1; });
      expect(pressed).toBeGreaterThan(0);
      // The registry's binder ran this shortcut's handler for the press.
      expect(await log(page)).toContain(shortcut.id);
    });
  });
}

test('shortcuts never fire while typing in a text field', async ({ page }) => {
  await openS21(page);
  await placeMarker(page);
  await page.getByTestId('marker-row-1').getByRole('button', { name: 'M1 position' }).click();
  const field = page.getByTestId('marker-row-1').locator('input');
  await expect(field).toBeFocused();
  await clearLog(page);
  for (const key of ['KeyN', 'Space', 'Backspace', 'Shift+Slash', 'Control+KeyZ', 'Control+Comma', 'Control+Shift+KeyS']) await page.keyboard.press(key);
  expect(await log(page)).toEqual([]);
  await expect(armed(page)).toHaveCount(0);
  await expect(page.getByTestId('help-sheet')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'App settings' })).toHaveCount(0);
});

test('retired keys do nothing: M / S / L / P, [ and ], F', async ({ page }) => {
  await openS21(page);
  const groups = await page.locator('button[aria-pressed]').evaluateAll(buttons => buttons.map(button => `${button.textContent}:${button.getAttribute('aria-pressed')}`));
  await zoomX(page);
  const zoomed = await scale(page).innerText();
  await focusPlot(page);
  await clearLog(page);
  for (const key of ['KeyM', 'KeyS', 'KeyL', 'KeyP', 'BracketLeft', 'BracketRight', 'KeyF']) await page.keyboard.press(key);
  expect(await log(page)).toEqual([]);
  await expect(scale(page)).toHaveText(zoomed);
  expect(await page.locator('button[aria-pressed]').evaluateAll(buttons => buttons.map(button => `${button.textContent}:${button.getAttribute('aria-pressed')}`))).toEqual(groups);
});

test('Help lists every registry shortcut and the mouse hints; App settings opens it at Keyboard and opens About', async ({ page }) => {
  await openS21(page);
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const sheet = page.getByTestId('help-sheet');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('no box');
  expect(box.width).toBeLessThanOrEqual(521);
  expect(box.width).toBeGreaterThan(400);
  expect(box.height).toBeLessThanOrEqual(viewport.height * 0.7 + 1);
  const helpButton = await page.getByRole('button', { name: 'Help', exact: true }).boundingBox();
  if (!helpButton) throw new Error('no help button');
  expect(box.y + box.height).toBeLessThanOrEqual(helpButton.y);
  expect(Math.abs(box.x + box.width - (helpButton.x + helpButton.width))).toBeLessThan(40);
  const keyboard = sheet.getByRole('list', { name: 'Keyboard' }).or(sheet.locator('dl[aria-label="Keyboard"]'));
  for (const shortcut of SHORTCUTS) await expect(keyboard.locator(`[data-shortcut="${shortcut.id}"]`)).toContainText(shortcut.label);
  await expect(sheet.locator('dl[aria-label="Keyboard"] .kbd').first()).toBeVisible();
  await expect(sheet.locator('dl[aria-label="Mouse"]')).toContainText('Right-drag');
  for (const text of ['About', 'Report a problem ↗', 'Suggest an idea ↗', 'Your files never leave this browser.']) await expect(sheet.locator('footer')).toContainText(text);
  await expect(sheet).not.toContainText('M / S / L / P');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'App settings' });
  await expect(settings).toContainText('Grid, markers, lines and Smith options are set per pane, with the sliders button in each pane header.');
  await expect(settings).toContainText('Used by Copy image, Download image and every export.');
  await settings.getByRole('button', { name: /Keyboard shortcuts/ }).click();
  await expect(settings).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.locator('.help-sheet__body').evaluate(body => body.scrollTop)).toBeGreaterThan(0);
  const keyboardTop = await sheet.getByTestId('help-keyboard').boundingBox();
  const bodyTop = await sheet.locator('.help-sheet__body').boundingBox();
  expect(Math.abs((keyboardTop?.y ?? 0) - (bodyTop?.y ?? 100))).toBeLessThan(4);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settings.getByRole('button', { name: /About/ }).click();
  const about = page.getByTestId('about-panel');
  await expect(about).toBeVisible();
  for (const text of ['Mergen Scope', 'Apache-2.0', 'GitHub', 'Your files never leave this browser.']) await expect(about).toContainText(text);
  await expect(about.getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/AlpGoXd/mergen-scope');
});

test('the pane settings button shows sliders; the gear is only on App settings', async ({ page }) => {
  await openS21(page);
  const paneSettings = page.getByTestId('chart-pane-header-pane-1').getByRole('button', { name: 'Pane settings' });
  await expect(paneSettings.locator('svg[data-icon="sliders"]')).toHaveCount(1);
  const gear = page.getByRole('button', { name: 'Settings', exact: true });
  await expect(gear.locator('svg.footer-icon')).toHaveCount(1);
  await expect(gear).not.toContainText('⚙');
});
