import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

async function openApp(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  for (const name of ['Markers', 'Search', 'Lines', 'Pane']) {
    const chip = page.getByRole('button', { name, exact: true });
    if (await chip.getAttribute('aria-expanded') !== 'true') await chip.click();
  }
}

const rows = (page: Page) => page.locator('.tool-zone').evaluateAll(zones => new Set(zones.map(zone => Math.round(zone.getBoundingClientRect().y))).size);

test('each open group is one zone around its chip and all its tools, 8 px apart, with 4 px inside', async ({ page }) => {
  await openApp(page, 2048);
  expect(await rows(page)).toBe(1);
  const report = await page.locator('.tool-zone.is-open').evaluateAll(zones => zones.map((zone, index) => {
    const box = (el: Element) => el.getBoundingClientRect();
    const zoneBox = box(zone), chip = box(zone.querySelector('.tool-zone__chip')!), tools = Array.from(zone.querySelectorAll('.tool-zone__tools > *')).map(box);
    const style = getComputedStyle(zone), next = zones[index + 1];
    return {
      height: zoneBox.height, border: style.borderTopWidth, shadow: style.boxShadow, padding: style.padding,
      inside: chip.left >= zoneBox.left && tools.every(tool => tool.right <= zoneBox.right + 0.01),
      chipToFirst: Math.round((tools[0]?.left ?? 0) - chip.right), toolGaps: tools.slice(1).map((tool, i) => Math.round(tool.left - tools[i]!.right)),
      toNext: next ? Math.round(box(next).left - zoneBox.right) : 8,
    };
  }));
  expect(report).toHaveLength(4);
  for (const zone of report) {
    expect(zone).toMatchObject({ height: 26, border: '0px', shadow: 'none', padding: '0px 3px 0px 0px', inside: true, chipToFirst: 4, toNext: 8 });
    expect(zone.toolGaps.every(gap => gap === 4)).toBe(true);
  }
});

test('Clear All is outside the wrapping groups, so only the groups wrap', async ({ page }) => {
  await openApp(page, 1024);
  expect(await rows(page)).toBeGreaterThan(1);
  const clear = page.getByRole('button', { name: 'Clear All' });
  await expect(page.locator('.tool-groups').getByRole('button', { name: 'Clear All' })).toHaveCount(0);
  const [clearBox, analysisBox, firstZone] = await Promise.all([clear.boundingBox(), page.getByRole('button', { name: 'Analysis', exact: true }).boundingBox(), page.locator('.tool-zone').first().boundingBox()]);
  // Same centre line (Analysis is a group-chip height, Clear All a control height), on the first line.
  expect((clearBox?.y ?? 0) + (clearBox?.height ?? 0) / 2).toBe((analysisBox?.y ?? 0) + (analysisBox?.height ?? 0) / 2);
  expect(clearBox?.y).toBeLessThanOrEqual((firstZone?.y ?? 0) + 4);
  expect((clearBox?.x ?? 0) + (clearBox?.width ?? 0)).toBeLessThanOrEqual(analysisBox?.x ?? 0);
});

test('Trace is one control with its label inside it, and a chip is the same size closed and open', async ({ page }) => {
  await openApp(page, 2048);
  const trace = page.getByRole('combobox', { name: 'Trace', exact: true });
  await expect(trace).toHaveCount(1);
  const field = page.locator('.tool-zone__field');
  await expect(field).toContainText('Trace:');
  expect(await field.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await trace.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');

  const chip = page.getByRole('button', { name: 'Lines', exact: true });
  const measure = () => chip.evaluate(el => { const box = el.getBoundingClientRect(), text = document.createRange(); text.selectNodeContents(el.firstChild!); return { height: box.height, textOffset: Math.round(text.getBoundingClientRect().y - box.y) }; });
  const open = await measure();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  expect(await measure()).toEqual(open);
});

test('Left and Analysis are panel toggles with their icon, a divider sets Analysis apart, and the wordmark is semibold', async ({ page }) => {
  await openApp(page, 1024);
  const left = page.getByRole('button', { name: 'Left', exact: true });
  const analysis = page.getByRole('button', { name: 'Analysis', exact: true });
  const group = page.getByRole('button', { name: 'Lines', exact: true });
  for (const [button, path] of [[left, 'M3 4h18v16H3zM9 4v16'], [analysis, 'M3 4h18v16H3zM15 4v16']] as const) {
    const icon = button.locator('svg');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon.locator('path')).toHaveAttribute('d', path);
    expect(await icon.evaluate(el => { const style = getComputedStyle(el); return [el.getBoundingClientRect().width, style.strokeWidth, style.strokeLinecap, style.strokeLinejoin]; })).toEqual([13, '1.75px', 'round', 'round']);
    // The text stays visible at 1024 px, 5 px after the icon, and the chip is as tall as a group chip.
    const [iconBox, textGap, height] = await button.evaluate(el => { const svg = el.querySelector('svg')!.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(el.lastChild!); return [svg.right, Math.round(range.getBoundingClientRect().left - svg.right), el.getBoundingClientRect().height]; });
    expect(iconBox).toBeGreaterThan(0);
    expect(textGap).toBe(5);
    expect(height).toBe((await group.boundingBox())?.height);
  }
  // Off = neutral, on = the panel's chip colours; never the open-group zone look.
  const paint = (button: typeof left) => button.evaluate(el => { const style = getComputedStyle(el); return { bg: style.backgroundColor, border: style.borderTopColor, inZone: !!el.closest('.tool-zone') }; });
  await expect(analysis).toHaveAttribute('aria-pressed', 'false');
  const off = await paint(analysis);
  await analysis.click();
  await expect(analysis).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await paint(analysis)).bg).not.toBe(off.bg);
  expect((await paint(analysis)).inZone || off.inZone).toBe(false);
  const probe = (variable: string) => page.evaluate(name => { const span = document.createElement('span'); span.style.color = `var(${name})`; document.body.appendChild(span); const colour = getComputedStyle(span).color; span.remove(); return colour; }, variable);
  // Colours transition over 120 ms, so poll for the settled value.
  await expect.poll(() => analysis.evaluate(el => getComputedStyle(el).color)).toBe(await probe('--analysis-ink'));
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => left.evaluate(el => getComputedStyle(el).color)).toBe(await probe('--left-ink'));

  // A 1 px divider sits between Clear All and Analysis.
  const divider = await page.getByRole('button', { name: 'Clear All' }).evaluate(el => { const next = el.nextElementSibling as HTMLElement; const style = getComputedStyle(next); return { hidden: next.getAttribute('aria-hidden'), border: style.borderLeftWidth, between: next.getBoundingClientRect().left >= el.getBoundingClientRect().right && next.getBoundingClientRect().right <= document.querySelector<HTMLElement>('button[aria-pressed][class*="topbar-panel-toggle"]:last-of-type')!.getBoundingClientRect().left + 1 }; });
  expect(divider).toMatchObject({ hidden: 'true', border: '1px', between: true });

  // Wordmark: semibold, accent "Scope", logo centred on the text.
  const brand = page.getByText('Mergen', { exact: false }).first();
  expect(await brand.evaluate(el => { const wrap = el.closest('span[style*="font-weight"]')!; const style = getComputedStyle(wrap); const logo = wrap.querySelector('svg')!.getBoundingClientRect(), text = wrap.lastElementChild!.getBoundingClientRect(); return { weight: style.fontWeight, centred: Math.abs((logo.top + logo.height / 2) - (text.top + text.height / 2)) <= 1 }; })).toEqual({ weight: '600', centred: true });
});
