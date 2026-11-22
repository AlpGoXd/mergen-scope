import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { acceptImport } from './import-helpers';

// X runs from 0 to 100. The interior is a ramp, with Y extremes at the two endpoints.
const csv = 'Time (s),CH1 (V)\n0,-40\n10,1\n20,2\n30,3\n40,4\n50,5\n60,6\n70,7\n80,8\n90,9\n100,80\n';
const plot = (page: Page) => page.getByTestId('chart-plot-pane-1');
const linesLayer = (page: Page) => plot(page).getByTestId('lines-layer');
const readout = (page: Page) => page.getByTestId('footer-readout');
const selectionRing = (page: Page) => plot(page).locator('circle[r="9"]');

type Domain = readonly [number, number];
type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };

// The lines layer publishes the actual scale domains and the plot rectangle inside the SVG.
async function plotView(page: Page) {
  return linesLayer(page).evaluate(layer => {
    const svg = layer.closest('svg')?.getBoundingClientRect();
    const [left, top, width, height] = (layer.getAttribute('data-plot') ?? '').split(',').map(Number);
    const [xMin, xMax] = (layer.getAttribute('data-x-domain') ?? '').split(',').map(Number);
    const [yMin, yMax] = (layer.getAttribute('data-y-domain') ?? '').split(',').map(Number);
    if (!svg || left === undefined || top === undefined || !width || !height
      || xMin === undefined || xMax === undefined || yMin === undefined || yMax === undefined) {
      throw new Error('Chart plot geometry is unavailable');
    }
    return { box: { x: svg.x + left, y: svg.y + top, width, height }, x: [xMin, xMax] as const, y: [yMin, yMax] as const };
  });
}

function pointAt(box: Box, xFraction: number, yFraction: number): Point {
  return { x: Math.round(box.x + box.width * xFraction), y: Math.round(box.y + box.height * yFraction) };
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Chart target has no bounding box');
  return pointAt(box, 0.5, 0.5);
}

const span = ([min, max]: Domain) => max - min;

async function expectDomain(page: Page, axis: 'x' | 'y', [min, max]: Domain) {
  await expect.poll(async () => (await plotView(page))[axis]).toEqual([
    expect.closeTo(min, 5), expect.closeTo(max, 5),
  ]);
}

async function zoomX(page: Page, leftFraction: number, rightFraction: number) {
  const { box, x } = await plotView(page);
  const from = pointAt(box, leftFraction, 0.5);
  const to = pointAt(box, rightFraction, 0.5);
  const valueAt = (point: Point) => x[0] + (point.x - box.x) / box.width * span(x);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expectDomain(page, 'x', [valueAt(from), valueAt(to)]);
}

async function armTool(page: Page, group: string, tool: string) {
  const chip = page.getByRole('button', { name: group, exact: true });
  if (await chip.getAttribute('aria-pressed') !== 'true') await chip.click();
  await page.getByRole('button', { name: tool, exact: true }).click();
}

async function beginMarkerDrag(page: Page) {
  await armTool(page, 'Markers', 'New Marker');
  const { box } = await plotView(page);
  const place = pointAt(box, 0.3, 0.5);
  await page.mouse.click(place.x, place.y);
  const row = page.getByTestId('marker-row-1');
  const position = row.getByRole('button', { name: 'M1 position' });
  await expect(position).toBeVisible();
  if (await selectionRing(page).count() === 0) await row.locator('.lp-tag').click();
  await expect(selectionRing(page)).toBeVisible();
  const before = await position.innerText();
  const start = await centerOf(selectionRing(page));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  return { row, position, before, box };
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'drag-lifecycle.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await acceptImport(page);
  await expect(plot(page).locator('.recharts-line')).toBeVisible();
  await expect(linesLayer(page)).toHaveAttribute('data-x-domain', '0,100');
  await expect(linesLayer(page)).toHaveAttribute('data-y-domain', /,/);
  await page.evaluate(async () => { await document.fonts.ready; });
});

test('one Ctrl+Z restores a marker after multiple live drag updates', async ({ page }) => {
  const { position, before, box } = await beginMarkerDrag(page);
  const middle = pointAt(box, 0.5, 0.5);
  const end = pointAt(box, 0.7, 0.5);
  await page.mouse.move(middle.x, middle.y, { steps: 4 });
  await expect(position).not.toHaveText(before);
  const during = await position.innerText();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await expect(position).not.toHaveText(during);
  await expect(position).not.toHaveText(before);
  await page.mouse.up();
  await page.keyboard.press('Control+z');
  await expect(position).toHaveText(before);
});

test('Escape restores the marker, clears selection, and discards the drag undo step', async ({ page }) => {
  const { row, position, before, box } = await beginMarkerDrag(page);
  const moved = pointAt(box, 0.55, 0.5);
  await page.mouse.move(moved.x, moved.y, { steps: 6 });
  await expect(position).not.toHaveText(before);
  await expect(readout(page)).toHaveText(/\d/);
  const during = await readout(page).innerText();

  await page.keyboard.press('Escape');
  await expect(position).toHaveText(before);
  // characterizes current behavior: restoring the gesture also clears the marker selection.
  await expect(selectionRing(page)).toHaveCount(0);

  const next = pointAt(box, 0.8, 0.5);
  await page.mouse.move(next.x, next.y);
  await expect(readout(page)).not.toHaveText(during);
  await expect(readout(page)).toHaveText(/\d/);
  await expect(position).toHaveText(before);
  await expect(selectionRing(page)).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.press('Control+z');
  await expect(row).toHaveCount(0);
});

for (const kind of ['V', 'H'] as const) {
  test(`one Ctrl+Z restores a dragged ${kind}-line`, async ({ page }) => {
    await armTool(page, 'Lines', `${kind}-Line`);
    const fitted = await plotView(page);
    const place = pointAt(fitted.box, 0.4, 0.5);
    await page.mouse.click(place.x, place.y);
    const row = page.getByTestId(`ref-line-row-${kind}1`);
    const line = plot(page).getByRole('img', { name: `${kind}1 line`, exact: true }).locator('.ln-line');
    await expect(row).toBeVisible();
    await expect(line).toBeAttached();
    const before = await row.getAttribute('data-value');
    if (before === null) throw new Error('Reference line has no sidebar value');

    if (kind === 'H') {
      // characterizes current behavior: a fitted Y axis has zero H-line hit tolerance.
      const start = await centerOf(line);
      const end = pointAt(fitted.box, 0.5, 0.7);
      await page.mouse.move(start.x, start.y);
      await expect(readout(page)).toHaveText(/\d/);
      const atLine = await readout(page).innerText();
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 6 });
      await expect(readout(page)).not.toHaveText(atLine);
      await page.mouse.up();
      await expect(row).toHaveAttribute('data-value', before);
      await page.mouse.move(start.x, start.y);
      await page.mouse.wheel(0, 120);
      await expect(linesLayer(page)).not.toHaveAttribute('data-y-domain', fitted.y.join(','));
    }

    const view = await plotView(page);
    const start = await centerOf(line);
    const middle = kind === 'V' ? { ...start, x: pointAt(view.box, 0.55, 0.5).x } : { ...start, y: pointAt(view.box, 0.5, 0.6).y };
    const end = kind === 'V' ? { ...start, x: pointAt(view.box, 0.7, 0.5).x } : { ...start, y: pointAt(view.box, 0.5, 0.75).y };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y, { steps: 4 });
    await expect(row).not.toHaveAttribute('data-value', before);
    const during = await row.getAttribute('data-value');
    await page.mouse.move(end.x, end.y, { steps: 4 });
    const expected = kind === 'V'
      ? view.x[0] + (end.x - view.box.x) / view.box.width * span(view.x)
      : view.y[1] - (end.y - view.box.y) / view.box.height * span(view.y);
    await expect.poll(async () => Number(await row.getAttribute('data-value'))).toBeCloseTo(expected, 5);
    expect(await row.getAttribute('data-value')).not.toBe(during);
    await page.mouse.up();
    await page.keyboard.press('Control+z');
    await expect(row).toHaveAttribute('data-value', before);
  });
}

test('a marker drag commits on mouseup outside the pane and stops moving', async ({ page }) => {
  const { position, before, box } = await beginMarkerDrag(page);
  const moved = pointAt(box, 0.55, 0.5);
  await page.mouse.move(moved.x, moved.y, { steps: 6 });
  await expect(position).not.toHaveText(before);

  const outside = await centerOf(page.getByTestId('footer-sentence'));
  await page.mouse.move(outside.x, outside.y);
  await expect(readout(page)).toHaveText('');
  const released = await position.innerText();
  await page.mouse.up();

  const next = pointAt(box, 0.8, 0.5);
  await page.mouse.move(next.x, next.y);
  await expect(readout(page)).toHaveText(/\d/);
  await expect(position).toHaveText(released);
  await page.keyboard.press('Control+z');
  await expect(position).toHaveText(before);
});

test('a right-click keeps both domains and a horizontal right-drag zooms X and fits Y', async ({ page }) => {
  const fitted = await plotView(page);
  const click = pointAt(fitted.box, 0.5, 0.5);
  await page.mouse.click(click.x, click.y, { button: 'right' });
  await expectDomain(page, 'x', fitted.x);
  await expectDomain(page, 'y', fitted.y);

  await zoomX(page, 0.25, 0.75);
  // Samples at X=30 through X=70 have Y=3 through Y=7. The fit adds 0.32 on each end.
  await expectDomain(page, 'y', [2.68, 7.32]);
});

test('Ctrl+drag clamps at both data edges and stops after an outside release', async ({ page }) => {
  const fitted = await plotView(page);
  await zoomX(page, 0.15, 0.85);
  const width = span((await plotView(page)).x);
  const footer = await centerOf(page.getByTestId('footer-sentence'));

  await page.keyboard.down('Control');
  for (const edge of ['left', 'right'] as const) {
    const { box } = await plotView(page);
    const from = pointAt(box, edge === 'left' ? 0.1 : 0.9, 0.5);
    const to = pointAt(box, edge === 'left' ? 0.9 : 0.1, 0.5);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    if (edge === 'right') {
      await page.mouse.move(to.x, footer.y);
      await expect(readout(page)).toHaveText('');
    }
    await page.mouse.up();
    const [min, max] = fitted.x;
    await expectDomain(page, 'x', edge === 'left' ? [min, min + width] : [max - width, max]);
  }
  const next = pointAt((await plotView(page)).box, 0.95, 0.5);
  await page.mouse.move(next.x, next.y);
  await expect(readout(page)).toHaveText(/\d/);
  await expectDomain(page, 'x', [fitted.x[1] - width, fitted.x[1]]);
  await page.keyboard.up('Control');
});

test('wheel zoom anchors Y at the cursor and Shift+wheel pans Y without changing X', async ({ page }) => {
  const fitted = await plotView(page);
  const firstCursor = pointAt(fitted.box, 0.5, 0.65);
  const fittedAnchor = fitted.y[1] - (firstCursor.y - fitted.box.y) / fitted.box.height * span(fitted.y);
  // characterizes current behavior: the first wheel anchors on the drawn scale but zooms the 5%-padded data range.
  const paddedMin = -46;
  const paddedMax = 86;
  await page.mouse.move(firstCursor.x, firstCursor.y);
  await page.mouse.wheel(0, -120);
  await expectDomain(page, 'y', [fittedAnchor + (paddedMin - fittedAnchor) / 1.08, fittedAnchor + (paddedMax - fittedAnchor) / 1.08]);
  await expectDomain(page, 'x', fitted.x);

  await zoomX(page, 0.25, 0.75);
  await expectDomain(page, 'y', [2.68, 7.32]);
  const before = await plotView(page);
  const cursor = pointAt(before.box, 0.5, 0.25);
  const fromTop = (cursor.y - before.box.y) / before.box.height;
  const ySpan = span(before.y);
  const anchor = before.y[1] - fromTop * ySpan;
  const zoomedSpan = ySpan / 1.08;

  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.wheel(0, -120);
  await expectDomain(page, 'y', [anchor - (1 - fromTop) * zoomedSpan, anchor + fromTop * zoomedSpan]);
  await expectDomain(page, 'x', before.x);
  await page.mouse.wheel(0, 120);
  await expectDomain(page, 'y', before.y);
  await expectDomain(page, 'x', before.x);

  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 120);
  await expectDomain(page, 'y', [before.y[0] + 0.15 * ySpan, before.y[1] + 0.15 * ySpan]);
  await expectDomain(page, 'x', before.x);
  await page.mouse.wheel(0, -120);
  await expectDomain(page, 'y', before.y);
  await expectDomain(page, 'x', before.x);
  await page.keyboard.up('Shift');
});
