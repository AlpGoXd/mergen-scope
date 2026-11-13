import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { footerHints, MOUSE_HINTS } from '../../src/domain/shortcuts';
import { APP_VERSION } from '../../src/components/help/shortcuts';

const DAT = 'test files/cascade_ip3_-12dBm.DAT';
const S2P = 'test files/cascaded chain.s2p';
const footer = (page: Page) => page.locator('footer.footer-bar');
const row = (page: Page) => footer(page).locator('.footer-row');
const hints = (page: Page) => page.getByTestId('footer-hints');
const readout = (page: Page) => page.getByTestId('footer-readout');
/** The readout text with its two-space gaps (toHaveText would collapse them). */
const readoutText = async (page: Page) => (await readout(page).textContent()) ?? '';
const hintText = (context: Parameters<typeof footerHints>[0]) => footerHints(context).map(hint => `${hint.action} ${hint.effect}`);

async function openChart(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve(DAT));
  await expect(page.getByTestId('chart-plot-pane-1').locator('.recharts-line').first()).toBeVisible();
}

/** A network file with S21 on a chart (Pane 1) and S11 on a Smith chart (Pane 2). */
async function openChartAndSmith(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve(S2P));
  await page.getByTestId('touchstone-cell-S21').click();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.recharts-line').first()).toBeVisible();
  await page.getByRole('button', { name: '+ Pane' }).click();
  const pane = page.getByTestId('chart-pane-pane-2');
  await pane.locator('.ptp-tile').filter({ hasText: 'Smith' }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(pane.getByTestId('smith-plot')).toBeVisible();
  return pane;
}

async function toolGroups(page: Page) {
  for (const name of ['Markers', 'Lines']) {
    const chip = page.getByRole('button', { name, exact: true });
    if (await chip.getAttribute('aria-pressed') !== 'true') await chip.click();
  }
}

/** One line, nothing clipped, no overlap, and what must always stay is there. */
async function expectOneCleanLine(page: Page) {
  const report = await row(page).evaluate(el => {
    const box = el.getBoundingClientRect();
    const visible = Array.from(el.children).filter(child => child.getClientRects().length > 0).map(child => ({ name: child.className, rect: child.getBoundingClientRect() }));
    visible.sort((a, b) => a.rect.left - b.rect.left);
    const overlaps = visible.flatMap((item, i) => { const next = visible[i + 1]; return next && item.rect.right > next.rect.left + 0.5 ? [`${item.name} / ${next.name}`] : []; });
    const sentence = el.querySelector<HTMLElement>('.footer-sentence');
    const inside = visible.every(item => item.rect.left >= box.left - 0.5 && item.rect.right <= box.right + 0.5);
    return {
      oneLine: el.scrollHeight <= el.clientHeight, noClip: el.scrollWidth <= el.clientWidth, overlaps, inside,
      sentenceCut: !!sentence && sentence.scrollWidth > sentence.clientWidth, fit: Number(el.getAttribute('data-fit')),
      rowHeight: box.height, footerHeight: el.parentElement?.getBoundingClientRect().height ?? 0,
      token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--footer-height')),
    };
  });
  expect(report.oneLine, 'one line').toBe(true);
  expect(report.noClip, 'nothing clipped').toBe(true);
  expect(report.overlaps, 'overlaps').toEqual([]);
  expect(report.inside, 'inside the row').toBe(true);
  expect(report.sentenceCut, 'state sentence cut off').toBe(false);
  expect(report.footerHeight).toBe(report.token);
  return report.fit;
}

test('the footer is there with no file open', async ({ page }) => {
  await page.goto('/app.html');
  await expect(footer(page)).toBeVisible();
  await expect(page.getByTestId('footer-sentence')).toHaveText('No file open');
  await expect(hints(page)).toHaveText(hintText('empty').join(''));
  await expect(hints(page)).toContainText('Drop files anywhere');
  await expect(hints(page)).toContainText('Ctrl+O open');
  for (const name of ['Local only', 'Feedback', 'Settings', 'Help']) await expect(footer(page).getByRole('button', { name, exact: true })).toBeVisible();
  await expectOneCleanLine(page);
});

test('the buttons use line icons, not text characters', async ({ page }) => {
  await page.goto('/app.html');
  const buttons = footer(page).locator('button.footer-btn');
  await expect(buttons).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const button = buttons.nth(i);
    const icon = button.locator('svg.footer-icon');
    await expect(icon).toHaveCount(1);
    expect(await icon.evaluate(el => [el.getAttribute('width'), el.getAttribute('height'), el.getAttribute('stroke-width'), el.getAttribute('stroke')])).toEqual(['16', '16', '1.75', 'currentColor']);
    expect(await button.evaluate(el => /[◊▣⚙♢]/.test(el.textContent ?? ''))).toBe(false);
  }
  await expect(buttons.nth(3)).toHaveText('');
});

test('the mouse hints follow the pane type and the armed tool, and come from the registry Help uses', async ({ page }) => {
  const smith = await openChartAndSmith(page);
  // Pane 2 (Smith) is the target after it is made.
  await smith.getByTestId('smith-plot').click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId('footer-target')).toContainText('Pane 2');
  await expect(hints(page)).toHaveAttribute('data-context', 'smith');
  await expect(hints(page)).toHaveText(hintText('smith').join(''));
  await expect(hints(page)).toContainText('Scroll zoom');
  await expect(hints(page)).toContainText('Ctrl+drag pan');
  await expect(hints(page)).toContainText('Double-click fit');

  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId('footer-target')).toContainText('Pane 1');
  await expect(hints(page)).toHaveAttribute('data-context', 'chart');
  await expect(hints(page)).toHaveText(hintText('chart').join(''));
  for (const text of ['Right-drag X zoom', 'Scroll Y scale', 'Ctrl+drag pan', 'Double-click fit']) await expect(hints(page)).toContainText(text);
  await expect(hints(page)).not.toContainText('Middle');

  await toolGroups(page);
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await expect(hints(page)).toHaveAttribute('data-context', 'armed');
  await expect(hints(page)).toHaveText(hintText('armed').join(''));
  await expect(page.getByTestId('footer-sentence')).toHaveText('Placing M1 · click a trace · Esc cancels');
  await page.keyboard.press('Escape');
  await expect(hints(page)).toHaveAttribute('data-context', 'chart');
  await expect(page.getByTestId('footer-sentence')).toHaveText('Click: select · drag: move');

  // Help lists every hint the footer shows, with the same action words.
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const mouse = page.locator('dl[aria-label="Mouse"]');
  for (const hint of MOUSE_HINTS) await expect(mouse).toContainText(hint.label);
  for (const context of ['chart', 'smith', 'armed'] as const) {
    for (const hint of footerHints(context).filter(item => item.action !== 'Esc')) await expect(mouse).toContainText(hint.action.replace('Ctrl+drag', 'drag'));
  }
  await expect(mouse).not.toContainText('Middle-click');
});

test('the state sentence names the armed tool in its group colour', async ({ page }) => {
  await openChart(page);
  await toolGroups(page);
  const sentence = page.getByTestId('footer-sentence');
  const colourOf = (target: Locator) => target.evaluate(el => getComputedStyle(el).color);
  const probe = (name: string) => page.evaluate(variable => { const span = document.createElement('span'); span.style.color = `var(${variable})`; document.body.appendChild(span); const colour = getComputedStyle(span).color; span.remove(); return colour; }, name);
  const idle = await colourOf(sentence);
  expect(idle).toBe(await probe('--text'));

  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await expect(sentence).toHaveText('Placing M1 · click a trace · Esc cancels');
  expect(await colourOf(sentence)).toBe(await probe('--marker-ink'));

  await page.getByRole('button', { name: 'V-Line', exact: true }).click();
  await expect(sentence).toHaveText('Placing V1 · click the plot · Esc cancels');
  expect(await colourOf(sentence)).toBe(await probe('--lines-ink'));
  await page.keyboard.press('Escape');
});

test('a delta marker names its reference', async ({ page }) => {
  await openChart(page);
  await toolGroups(page);
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 300, y: 150 } });
  await expect(page.getByTestId('marker-row-1')).toBeVisible();
  await page.keyboard.press('Shift+N');
  await expect(page.getByTestId('footer-sentence')).toHaveText('Placing DM2 (Δ from M1) · click a trace · Esc cancels');
});

test('X and Y follow the mouse over a chart and clear when it leaves', async ({ page }) => {
  await openChart(page);
  const plot = page.getByTestId('chart-plot-pane-1');
  await expect(readout(page)).toHaveText('');
  await plot.hover({ position: { x: 200, y: 120 } });
  await expect(readout(page)).toHaveText(/\d/);
  const first = await readoutText(page);
  expect(first).toMatch(/\d+(\.\d+)? ?[A-Za-zµ]*Hz {2}[−\d]/);
  await plot.hover({ position: { x: 420, y: 200 } });
  await expect.poll(() => readoutText(page)).not.toBe(first);
  await page.getByTestId('footer-sentence').hover();
  await expect(readout(page)).toHaveText('');
});

test('Z and Γ follow the mouse over a Smith pane', async ({ page }) => {
  const smith = await openChartAndSmith(page);
  const plot = smith.getByTestId('smith-plot');
  await plot.hover({ position: { x: 150, y: 120 } });
  await expect.poll(() => readoutText(page)).toMatch(/^Z [−\d.]+ [+−] j[\d.]+ Ω {2}Γ [\d.]+ ∠ −?\d+°$/);
  const first = await readoutText(page);
  await plot.hover({ position: { x: 220, y: 200 } });
  await expect.poll(() => readoutText(page)).not.toBe(first);
  await page.getByTestId('footer-sentence').hover();
  await expect(readout(page)).toHaveText('');
});

test('double-click fits a zoomed chart and Ctrl+drag pans it', async ({ page }) => {
  await openChart(page);
  const plot = page.getByTestId('chart-plot-pane-1');
  const scale = page.getByTestId('chart-pane-header-pane-1').locator('.ph-scale');
  const fitted = await scale.innerText();
  const box = await plot.boundingBox();
  if (!box) throw new Error('plot has no box');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 4 });
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await expect(scale).not.toHaveText(fitted);
  const zoomed = await scale.innerText();

  await plot.hover({ position: { x: 300, y: 150 } });
  await expect(readout(page)).toHaveText(/\d/);
  const before = await readoutText(page);
  await page.keyboard.down('Control');
  await page.mouse.move(box.x + 300, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await plot.hover({ position: { x: 300, y: 150 } });
  await expect.poll(() => readoutText(page)).not.toBe(before);
  await expect(scale).toHaveText(zoomed);

  await plot.dblclick({ position: { x: 300, y: 150 } });
  await expect(scale).toHaveText(fitted);
});

test('Local only opens its note and Feedback opens its menu', async ({ page }) => {
  await openChart(page);
  const local = footer(page).getByRole('button', { name: 'Local only', exact: true });
  await local.click();
  await expect(page.getByTestId('footer-local-only')).toHaveText('Your files are read in this browser and never uploaded. No cookies; settings are kept in this browser.');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('footer-local-only')).toHaveCount(0);

  await footer(page).getByRole('button', { name: 'Feedback', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Feedback' });
  await expect(menu).toBeVisible();
  const items = menu.getByRole('menuitem');
  await expect(items).toHaveText(['Report a problem ↗', 'Suggest an idea ↗']);
  await expect(menu).toContainText('Needs a GitHub account. Adds the app version, browser and OS; never your files.');
  // The menu opens above the button.
  const [menuBox, buttonBox] = [await menu.boundingBox(), await footer(page).getByRole('button', { name: 'Feedback', exact: true }).boundingBox()];
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(buttonBox?.y ?? 0);
  for (const kind of ['Problem', 'Idea']) {
    const link = items.nth(kind === 'Problem' ? 0 : 1);
    expect(await link.getAttribute('target')).toBe('_blank');
    const url = new URL((await link.getAttribute('href')) ?? '');
    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/AlpGoXd/mergen-scope/issues/new');
    expect(url.searchParams.get('title')).toContain(kind);
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain(`App version: ${APP_VERSION}`);
    expect(body).toContain('Browser / OS: ');
    expect(url.toString()).not.toMatch(/cascade|\.DAT|ip3/i);
  }
});

test('Settings and Help buttons open their sheets', async ({ page }) => {
  await page.goto('/app.html');
  await footer(page).getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'App settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await footer(page).getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByTestId('help-sheet')).toBeVisible();
});

for (const width of [1024, 1280, 1440]) {
  test(`one clean line at ${width} px: chart, Smith and armed`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const smith = await openChartAndSmith(page);
    await expectOneCleanLine(page);

    // The pointer over a Smith pane (the widest readout).
    await smith.getByTestId('smith-plot').click({ position: { x: 4, y: 4 } });
    await smith.getByTestId('smith-plot').hover({ position: { x: 150, y: 120 } });
    await expect(readout(page)).toHaveText(/^Z /);
    const smithFit = await expectOneCleanLine(page);
    await expect(page.getByTestId('footer-target')).toBeVisible();
    expect(await readout(page).evaluate(el => el.getClientRects().length > 0 && el.scrollWidth <= el.clientWidth)).toBe(true);

    await page.getByTestId('chart-plot-pane-1').click({ position: { x: 4, y: 4 } });
    await page.getByTestId('chart-plot-pane-1').hover({ position: { x: 200, y: 120 } });
    const chartFit = await expectOneCleanLine(page);
    await expect(page.getByTestId('footer-target')).toBeVisible();
    await expect(readout(page)).toBeVisible();

    await toolGroups(page);
    await page.getByRole('button', { name: 'New Marker', exact: true }).click();
    await page.getByRole('button', { name: 'Help', exact: true }).hover();
    const armedFit = await expectOneCleanLine(page);
    await page.keyboard.press('Escape');

    // The order things drop: a narrower window never shows more than a wider one.
    for (const fit of [smithFit, chartFit, armedFit]) {
      const level = await row(page).evaluate((el, expected) => {
        el.setAttribute('data-fit', String(expected));
        const visible = (selector: string) => Array.from(el.querySelectorAll(selector)).filter(node => node.getClientRects().length > 0).length;
        return { hints: visible('.footer-hint'), words: visible('.footer-word'), trace: visible('.footer-trace') };
      }, fit);
      if (fit >= 2) expect(level.hints).toBe(0);
      if (fit >= 3) expect(level.words).toBe(0);
      if (fit >= 4) expect(level.trace).toBe(0);
      if (fit < 3) expect(level.words).toBe(3);
    }
    if (width === 1440) expect(chartFit).toBeLessThanOrEqual(1);
  });
}

test('items drop in order as the window narrows', async ({ page }) => {
  const smith = await openChartAndSmith(page);
  const plot = smith.getByTestId('smith-plot');
  await plot.click({ position: { x: 4, y: 4 } });
  const seen: number[] = [];
  for (const width of [1600, 1440, 1280, 1180, 1100, 1024, 900, 800]) {
    await page.setViewportSize({ width, height: 800 });
    await plot.hover({ position: { x: 120, y: 100 } });
    await expect(readout(page)).toHaveText(/^Z /);
    const fit = await expectOneCleanLine(page);
    seen.push(fit);
    // What is visible at this level, and what always stays.
    const shown = await row(page).evaluate(el => {
      const visible = (selector: string) => Array.from(el.querySelectorAll(selector)).filter(node => node.getClientRects().length > 0).length;
      return { hints: visible('.footer-hint'), words: visible('.footer-word'), trace: visible('.footer-trace'), target: visible('.footer-item:not(.footer-trace)'), readout: visible('.footer-readout'), icons: visible('svg.footer-icon') };
    });
    expect(shown.hints).toBe(fit === 0 ? 3 : fit === 1 ? 2 : 0);
    expect(shown.words).toBe(fit >= 3 ? 0 : 3);
    expect(shown.trace).toBe(fit >= 4 ? 0 : 1);
    expect([shown.target, shown.readout, shown.icons]).toEqual([1, 1, 4]);
  }
  // A narrower window never shows more than a wider one, and every step is used on the way down.
  expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  expect(seen[0]).toBe(0);
});

// Screenshots for review: FOOTER_SHOTS=1 npx playwright test footer.spec.ts -g screenshots
test('screenshots', async ({ browser }) => {
  test.skip(!process.env['FOOTER_SHOTS'], 'set FOOTER_SHOTS=1 to write .scratch/footer-*.png');
  mkdirSync('.scratch', { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 1024]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      await context.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
      const page = await context.newPage();
      const shot = async (state: string) => footer(page).screenshot({ path: `.scratch/footer-${theme}-${width}-${state}.png`, animations: 'disabled' });
      await page.goto('/app.html');
      await shot('empty');
      const smith = await openChartAndSmith(page);
      await page.getByTestId('chart-plot-pane-1').click({ position: { x: 4, y: 4 } });
      await page.getByTestId('chart-plot-pane-1').hover({ position: { x: 200, y: 120 } });
      await shot('chart');
      await smith.getByTestId('smith-plot').click({ position: { x: 4, y: 4 } });
      await smith.getByTestId('smith-plot').hover({ position: { x: 150, y: 120 } });
      await shot('smith');
      await page.getByTestId('chart-plot-pane-1').click({ position: { x: 4, y: 4 } });
      await toolGroups(page);
      await page.getByRole('button', { name: 'New Marker', exact: true }).click();
      await page.getByRole('button', { name: 'Help', exact: true }).hover();
      await shot('armed');
      await page.screenshot({ path: `.scratch/footer-${theme}-${width}-app-armed.png`, animations: 'disabled' });
      await page.keyboard.press('Escape');
      await footer(page).getByRole('button', { name: 'Feedback', exact: true }).click();
      await page.screenshot({ path: `.scratch/footer-${theme}-${width}-feedback.png`, animations: 'disabled' });
      await page.keyboard.press('Escape');
      await footer(page).getByRole('button', { name: 'Local only', exact: true }).click();
      await page.screenshot({ path: `.scratch/footer-${theme}-${width}-local-only.png`, animations: 'disabled' });
      await context.close();
    }
  }
});
