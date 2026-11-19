import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { shortcutText } from '../../src/domain/shortcuts';

// "+ Marker ▾" split button and its menu; Clear workspace… in the Files ⋯ menu.
const markerMenu = (page: Page) => page.getByRole('menu', { name: 'Marker type' });
const face = (page: Page) => page.getByRole('button', { name: 'New Marker', exact: true });
const more = (page: Page) => page.getByRole('button', { name: 'Choose marker type', exact: true });
const colourOf = (page: Page, property: 'color' | 'backgroundColor', value: string) => page.evaluate(([prop, css]) => {
  const span = document.createElement('span');
  span.style.setProperty(prop === 'color' ? 'color' : 'background-color', css);
  document.body.appendChild(span);
  const colour = getComputedStyle(span).getPropertyValue(prop === 'color' ? 'color' : 'background-color');
  span.remove();
  return colour;
}, [property, value] as const);

async function openApp(page: Page, width = 2048) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
}

async function placeAt(page: Page, x: number) {
  const plot = page.getByTestId('chart-plot-pane-1');
  const box = await plot.boundingBox();
  await plot.click({ position: { x: (box?.width ?? 600) * x, y: (box?.height ?? 300) * 0.5 } });
}

test('"+ Marker ▾" is one flat split button: main part, divider, ▾ part', async ({ page }) => {
  await openApp(page);
  const split = page.locator('.split-btn');
  await expect(split).toHaveCount(1);
  await expect(face(page)).toHaveText('+ Marker');
  await expect(face(page)).toHaveAttribute('title', `Place a marker (${shortcutText('new-marker')})`);
  await expect(more(page)).toHaveText('▾');
  await expect(more(page)).toHaveAttribute('aria-haspopup', 'menu');
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await split.evaluate(el => {
    const style = getComputedStyle(el), divider = el.querySelector('.split-btn__divider')!;
    return { height: el.getBoundingClientRect().height, radius: style.borderTopLeftRadius, border: style.borderTopColor, dividerWidth: divider.getBoundingClientRect().width };
  })).toEqual({ height: 22, radius: '4px', border: 'rgba(0, 0, 0, 0)', dividerWidth: 1 });
  // The old separate controls are gone.
  await expect(page.getByRole('button', { name: 'Choose a delta marker reference' })).toHaveCount(0);
  // Hover shows the border around the whole button; an open menu paints the ▾ part with the Slate fill.
  await split.hover();
  await expect.poll(() => split.evaluate(el => getComputedStyle(el).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
  await more(page).click();
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => more(page).evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await colourOf(page, 'backgroundColor', 'var(--slate-fill)'));
});

test('the ▾ menu with no markers: Marker, a "Delta from…" heading and a disabled Selected row that says why', async ({ page }) => {
  await openApp(page);
  await more(page).click();
  const menu = markerMenu(page);
  await expect(menu).toBeVisible();
  // Key hints come from the shortcut registry, so Help and the menu cannot disagree.
  await expect(menu.getByRole('menuitem', { name: /^Marker/ })).toContainText(shortcutText('new-marker'));
  await expect(menu.getByText('Delta from…')).toBeVisible();
  const selected = menu.getByRole('menuitem', { name: /^Selected/ });
  await expect(selected).toHaveAttribute('aria-disabled', 'true');
  await expect(selected).toContainText('Place a marker first');
  await expect(selected).toContainText(shortcutText('delta-marker'));
  await expect(menu.getByRole('menuitem')).toHaveCount(2);
  // A click on the disabled row does nothing.
  await selected.click({ force: true });
  await expect(menu).toBeVisible();
  await expect(face(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more(page)).toBeFocused();
});

test('the ▾ menu with markers: Selected (M2) and one row per marker; keys move, Enter arms a delta, the face says which', async ({ page }) => {
  await openApp(page);
  await face(page).click();
  await placeAt(page, 0.3);
  await face(page).click();
  await placeAt(page, 0.6);
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(2);
  await more(page).click();
  const menu = markerMenu(page);
  const rows = menu.getByRole('menuitem');
  await expect.poll(() => rows.evaluateAll(items => items.map(item => item.textContent))).toEqual([`Marker${shortcutText('new-marker')}`, `Selected (M2)${shortcutText('delta-marker')}`, 'M1', 'M2']);
  await expect(menu.getByRole('menuitem', { name: /^Marker/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: /^Selected/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'M1', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'M2', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: /^Marker/ })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'M2', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  // The armed face names the reference, the whole button is in the marker colour, and the footer says the same.
  await expect(face(page)).toHaveText('+ Δ from M1');
  await expect(face(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(face(page)).toHaveClass(/ui-btn--armed/);
  await expect(page.getByTestId('footer-sentence')).toHaveText('Placing DM3 (Δ from M1) · click a trace · Esc cancels');
  await expect.poll(() => page.locator('.split-btn').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await colourOf(page, 'backgroundColor', 'oklch(0.50 0.14 var(--marker-hue))'));
  // Placing the delta returns the face to "+ Marker".
  await placeAt(page, 0.8);
  await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(3);
  await expect(face(page)).toHaveText('+ Marker');
  // "Selected (Mx)" arms a delta from the selected normal marker (as Shift+N does).
  await page.getByTestId('marker-row-1').click();
  await more(page).click();
  await markerMenu(page).getByRole('menuitem', { name: /^Selected \(M1\)/ }).click();
  await expect(face(page)).toHaveText('+ Δ from M1');
  // Esc cancels and clears the selection, so Selected is disabled with its reason while the M rows stay.
  await page.keyboard.press('Escape');
  await expect(face(page)).toHaveText('+ Marker');
  await more(page).click();
  const selected = markerMenu(page).getByRole('menuitem', { name: /^Selected/ });
  await expect(selected).toHaveAttribute('aria-disabled', 'true');
  await expect(selected).toContainText('Select a normal marker first');
  await expect(markerMenu(page).getByRole('menuitem', { name: 'M1', exact: true })).toBeVisible();
  // "Marker" arms a normal marker.
  await markerMenu(page).getByRole('menuitem', { name: /^Marker/ }).click();
  await expect(face(page)).toHaveText('+ Marker');
  await expect(face(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('footer-sentence')).toContainText('Placing M4');
});

test('Clear workspace… is in the Files ⋯ menu after a separator, in the danger colour, and is undoable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  // Nothing to clear yet: the item is disabled and says so.
  await page.getByRole('button', { name: 'Files actions' }).click();
  const empty = page.getByRole('menuitem', { name: 'Clear workspace…' });
  await expect(empty).toHaveAttribute('aria-disabled', 'true');
  await expect(empty).toHaveAttribute('title', 'Nothing to clear');
  await page.keyboard.press('Escape');

  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Files actions' }).click();
  const entries = await page.locator('.lp-menu > *').evaluateAll(items => items.map(item => ({ role: item.getAttribute('role'), text: item.textContent, danger: item.classList.contains('lp-menu__item--danger'), colour: getComputedStyle(item).color })));
  expect(entries.map(entry => entry.role)).toEqual(['menuitem', 'separator', 'menuitem']);
  expect(entries[2]).toMatchObject({ text: 'Clear workspace…', danger: true });
  expect(entries[2]?.colour).toBe(await colourOf(page, 'color', 'var(--danger-ink)'));
  await page.getByRole('menuitem', { name: 'Clear workspace…' }).click();
  await expect(page.getByTestId('empty-chart-dropzone')).toBeVisible();
  await expect(page.getByText('Cleared workspace')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
});
