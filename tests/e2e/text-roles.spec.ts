import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acceptImport } from './import-helpers';
import { addAnalysis } from './analysis-helpers';

/**
 * Text roles everywhere: at Compact, Comfortable and Large every piece of text is one of the role sizes, and nothing set
 * in JetBrains Mono is bold (the face ships only 400). Also writes screenshots (TEXT_ROLES_SHOTS=1) and per-class box sizes
 * (TEXT_ROLES_METRICS=<label>) so a before / after pass can be compared.
 */
const SIZES = ['compact', 'comfortable', 'large'] as const;
type Size = (typeof SIZES)[number];

async function prepare(page: Page, size: Size, theme: 'light' | 'dark') {
  await page.addInitScript(([s, t]) => {
    localStorage.setItem('mergen-app-preferences', JSON.stringify({ size: s }));
    localStorage.setItem('mergen-theme-preference', t as string);
  }, [size, theme] as const);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
}

/** Left panel, a chart (S21), a Smith pane (S11), a Table pane, tools armed once, markers, a line and an analysis card. */
async function populate(page: Page) {
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.recharts-line').first()).toBeVisible();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await page.getByTestId('chart-pane-pane-2').locator('.ptp-tile').filter({ hasText: 'Smith' }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(page.getByTestId('chart-pane-pane-2').getByTestId('smith-plot')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await page.getByTestId('chart-pane-pane-3').locator('.ptp-tile').filter({ hasText: 'Table' }).click();
  const rows = page.locator('[data-testid^="trace-row-"]');
  for (let i = 0; i < await rows.count(); i++) {
    await rows.nth(i).getByTitle('Show in panes').click();
    await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 3/ }).click();
    await page.keyboard.press('Escape');
  }
  for (const name of ['Markers', 'Lines']) {
    const chip = page.getByRole('button', { name, exact: true });
    if (await chip.getAttribute('aria-pressed') !== 'true') await chip.click();
  }
  const plot = page.getByTestId('chart-plot-pane-1');
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await plot.click({ position: { x: 250, y: 90 } });
  await page.getByRole('button', { name: 'V-Line', exact: true }).click();
  await plot.click({ position: { x: 400, y: 90 } });
  await addAnalysis(page, 'Range Statistics');
  await plot.hover({ position: { x: 300, y: 100 } });
}

/** Text elements whose computed font breaks the rules, grouped so a failure reads as a list of selectors. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const probe = (variable: string) => { const el = document.createElement('span'); el.style.fontSize = `var(${variable})`; document.body.appendChild(el); const px = parseFloat(getComputedStyle(el).fontSize); el.remove(); return px; };
    const allowed = new Set(['--font-caption', '--font-label', '--font-body', '--font-emphasis', '--font-title', '--font-display'].map(probe));
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
    const monoBold: Record<string, number> = {};
    const sizes: Record<string, { px: number; count: number; plot: boolean }> = {};
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const own = Array.from(el.childNodes).some(node => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
      if (!own && !(el instanceof HTMLInputElement && el.value !== '')) continue;
      if (el.closest('[aria-hidden="true"][style*="-10000"]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const px = parseFloat(style.fontSize);
      if (px === 0) continue; // the hide-the-label trick (font-size: 0 with a glyph in ::after)
      const weight = Number(style.fontWeight);
      if (/JetBrains Mono/i.test(style.fontFamily.split(',')[0] ?? '') && weight > 400) monoBold[describe(el)] = (monoBold[describe(el)] ?? 0) + 1;
      if (!allowed.has(px)) {
        const key = `${describe(el)} ${px}px`;
        const entry = sizes[key] ?? { px, count: 0, plot: !!el.closest('svg') };
        entry.count++; sizes[key] = entry;
      }
    }
    return { monoBold, sizes, allowed: [...allowed] };
  });
}

/** Box size per class name inside the panels that were restyled, to compare a build before and after. */
async function metrics(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, { h: number; w: number }> = {};
    const roots = ['.lp', '.an-panel', '.footer-bar', '[data-testid^="chart-pane-header-"]', '.tbp', '.smith-pane'];
    for (const root of roots) for (const host of Array.from(document.querySelectorAll(root))) for (const el of [host, ...Array.from(host.querySelectorAll('*'))]) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
      if (!cls) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const prev = out[cls];
      out[cls] = { h: Math.max(prev?.h ?? 0, Math.round(box.height * 10) / 10), w: Math.max(prev?.w ?? 0, Math.round(box.width * 10) / 10) };
    }
    return out;
  });
}

for (const size of SIZES) {
  test(`every text is a role size and Mono is never bold: ${size}`, async ({ page }) => {
    await prepare(page, size, 'light');
    await populate(page);
    await expect(page.locator('html')).toHaveAttribute('data-size', size);
    const seen = await audit(page);
    // The marker and line labels drawn inside a plot have fixed geometry shared with the export renderer.
    const stray = Object.entries(seen.sizes).filter(([, v]) => !v.plot);
    if (process.env['TEXT_ROLES_METRICS']) {
      mkdirSync('.scratch', { recursive: true });
      writeFileSync(`.scratch/text-roles-metrics-${process.env['TEXT_ROLES_METRICS']}-${size}.json`, JSON.stringify({ metrics: await metrics(page), plotText: seen.sizes, stray: Object.fromEntries(stray), monoBold: seen.monoBold }, null, 1));
    }
    expect(Object.keys(seen.monoBold), 'bold Mono').toEqual([]);
    expect(stray.map(([key, v]) => `${key} ×${v.count}`), `sizes outside the roles (${seen.allowed.join(', ')})`).toEqual([]);
  });
}

test('the overlays keep to the role sizes too: wizard, settings, help, export menu, feedback', async ({ page }) => {
  await prepare(page, 'comfortable', 'light');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'wave.csv', mimeType: 'text/csv', buffer: Buffer.from('Time,CH1,CH2\n0.000,1.2,-0.4\n0.001,2.5,-0.8\n0.002,1.1,-0.2\n') });
  await expect(page.getByTestId('import-wizard')).toBeVisible();
  const wizard = await audit(page);
  expect(Object.keys(wizard.monoBold), 'wizard bold Mono').toEqual([]);
  expect(Object.keys(wizard.sizes), 'wizard sizes').toEqual([]);
  await acceptImport(page);
  for (const open of [
    async () => { await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'App settings' })).toBeVisible(); },
    async () => { await page.getByRole('button', { name: 'Help', exact: true }).click(); await expect(page.getByTestId('help-sheet')).toBeVisible(); },
    async () => { await page.getByRole('button', { name: /^Export/ }).click(); await expect(page.getByRole('menu', { name: 'Export' })).toBeVisible(); },
    async () => { await page.getByRole('button', { name: 'Feedback', exact: true }).click(); await expect(page.getByRole('menu', { name: 'Feedback' })).toBeVisible(); },
  ]) {
    await open();
    const seen = await audit(page);
    expect(Object.keys(seen.monoBold), 'bold Mono').toEqual([]);
    expect(Object.keys(seen.sizes), 'sizes').toEqual([]);
    await page.keyboard.press('Escape');
  }
});

// Screenshots for review: TEXT_ROLES_SHOTS=1 npx playwright test text-roles.spec.ts -g screenshots
test('screenshots', async ({ browser }) => {
  test.skip(!process.env['TEXT_ROLES_SHOTS'], 'set TEXT_ROLES_SHOTS=1 to write .scratch/text-roles-*.png');
  test.setTimeout(240_000);
  mkdirSync('.scratch', { recursive: true });
  const tag = process.env['TEXT_ROLES_SHOTS'];
  for (const theme of ['light', 'dark'] as const) {
    for (const size of SIZES) {
      const name = (state: string) => `.scratch/text-roles${tag === '1' ? '' : `-${tag}`}-${theme}-${size}-${state}.png`;
      const context = await browser.newContext();
      const page = await context.newPage();
      await prepare(page, size, theme);
      // A table opens the wizard first.
      await page.getByTestId('app-open-input').setInputFiles({ name: 'wave.csv', mimeType: 'text/csv', buffer: Buffer.from('Time,CH1,CH2\n0.000,1.2,-0.4\n0.001,2.5,-0.8\n0.002,1.1,-0.2\n') });
      await expect(page.getByTestId('import-wizard')).toBeVisible();
      await page.screenshot({ path: name('wizard') });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('import-wizard')).toHaveCount(0);
      await page.reload();
      await populate(page);
      await page.screenshot({ path: name('app') });
      await page.locator('.lp').screenshot({ path: name('left-panel') });
      await page.getByTestId('chart-pane-header-pane-1').screenshot({ path: name('pane-header') });
      await page.getByTestId('chart-pane-pane-2').screenshot({ path: name('smith') });
      await page.getByTestId('chart-pane-pane-3').screenshot({ path: name('table') });
      await page.locator('.an-panel').screenshot({ path: name('analysis') });
      await page.locator('footer.footer-bar').screenshot({ path: name('footer') });
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.waitForTimeout(300); // menus and sheets fade in over 120 ms
      await page.screenshot({ path: name('settings') });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Help', exact: true }).click();
      await page.waitForTimeout(300); // menus and sheets fade in over 120 ms
      await page.screenshot({ path: name('help') });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^Export/ }).click();
      await page.waitForTimeout(300); // menus and sheets fade in over 120 ms
      await page.screenshot({ path: name('export-menu') });
      await page.keyboard.press('Escape');
      await context.close();
    }
  }
});
