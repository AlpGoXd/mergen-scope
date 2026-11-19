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
  expect(clearBox?.y).toBe(analysisBox?.y);
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
