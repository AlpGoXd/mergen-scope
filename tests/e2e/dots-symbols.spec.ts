import { expect, test } from '@playwright/test';

import { acceptImport } from './import-helpers';

test('normal zoom places symbols about 90 pixels apart', async ({ page }) => {
  await page.goto('/app.html');
  const rows = Array.from({ length: 300 }, (_, i) => `${i},${i}`).join('\n');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'ramp.csv', mimeType: 'text/csv', buffer: Buffer.from(`Time (s),CH1 (V)\n${rows}\n`) });
  await acceptImport(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Always', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  const symbols = page.getByTestId('trace-symbol');
  await expect(symbols.first()).toBeVisible();
  const checkSpacing = async () => {
  const distances = await page.getByTestId('chart-plot-pane-1').evaluate(root => {
    const groups = new Map<string, { x: number; y: number }[]>();
    for (const element of root.querySelectorAll('[data-testid="trace-symbol"]')) {
      const matrix = (element as SVGGraphicsElement).getCTM();
      if (!matrix) throw new Error('missing SVG transform');
      const trace = element.getAttribute('data-trace') ?? '';
      const positions = groups.get(trace) ?? [];
      positions.push({ x: matrix.e, y: matrix.f });
      groups.set(trace, positions);
    }
    return [...groups.values()].flatMap(positions => positions.slice(1).map((point, index) => {
      const previous = positions[index];
      if (!previous) throw new Error('missing previous symbol');
      return Math.hypot(point.x - previous.x, point.y - previous.y);
    }));
  });
  expect(distances.length).toBeGreaterThan(0);
  for (const distance of distances) { expect(distance).toBeGreaterThanOrEqual(60); expect(distance).toBeLessThanOrEqual(130); }
  };
  await checkSpacing();
  await page.getByTestId('chart-pane-pane-1').getByTestId('samples-toggle').click();
  await expect(page.getByTestId('samples-toggle').first()).toHaveAttribute('aria-pressed', 'true');
  await checkSpacing();
});

test('tiny trace keeps all dots centred in hollow symbols', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'tiny.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
  await acceptImport(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Always', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  const pane = page.getByTestId('chart-pane-pane-1');
  const symbols = pane.getByTestId('trace-symbol');
  const dots = pane.getByTestId('sample-dot');
  await expect(symbols.first()).toBeVisible();
  await expect(dots).toHaveCount(0);
  for (const symbol of await symbols.all()) await expect(symbol.locator('path')).toHaveAttribute('fill', 'var(--bg)');
  await pane.getByTestId('samples-toggle').click();
  await expect(dots).toHaveCount(3);
  for (const symbol of await symbols.all()) await expect(symbol.locator('path')).toHaveAttribute('fill', 'none');
  const matches = await pane.evaluate(root => {
    const center = (element: Element) => {
      const matrix = (element as SVGGraphicsElement).getCTM();
      if (!matrix) throw new Error('missing SVG transform');
      const x = Number(element.getAttribute('cx') ?? 0), y = Number(element.getAttribute('cy') ?? 0);
      return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
    };
    const dots = [...root.querySelectorAll('[data-testid="sample-dot"]')];
    return [...root.querySelectorAll('[data-testid="trace-symbol"]')].map(symbol => {
      const a = center(symbol);
      return dots.filter(dot => {
        const b = center(dot);
        return dot.getAttribute('data-trace') === symbol.getAttribute('data-trace') && Math.hypot(a.x - b.x, a.y - b.y) < 0.5;
      }).length;
    });
  });
  expect(matches.length).toBeGreaterThan(0);
  for (const count of matches) expect(count).toBe(1);
  await pane.getByTestId('samples-toggle').click();
  await expect(dots).toHaveCount(0);
  for (const symbol of await symbols.all()) await expect(symbol.locator('path')).toHaveAttribute('fill', 'var(--bg)');
});
