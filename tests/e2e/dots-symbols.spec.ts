import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('symbols replace nearby sample dots', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Always', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByTestId('chart-pane-pane-1').getByTitle('Pane settings').click();
  await page.getByRole('button', { name: 'Sample dots' }).click();
  const symbols = page.getByTestId('trace-symbol');
  await expect(symbols.first()).toBeVisible();
  const pairs = await page.getByTestId('chart-plot-pane-1').evaluate(root => {
    const center = (el: Element) => {
      const svg = el as SVGGraphicsElement;
      const matrix = svg.getCTM();
      if (!matrix) throw new Error('missing SVG transform');
      const x = Number(el.getAttribute('cx') ?? 0);
      const y = Number(el.getAttribute('cy') ?? 0);
      return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
    };
    const dots = Array.from(root.querySelectorAll('[data-testid="sample-dot"]'));
    const symbols = Array.from(root.querySelectorAll('[data-testid="trace-symbol"]'));
    return { dotCount: dots.length, distances: symbols.flatMap(symbol => dots
      .filter(dot => dot.getAttribute('data-trace') === symbol.getAttribute('data-trace'))
      .map(dot => { const a = center(symbol); const b = center(dot); return Math.hypot(a.x - b.x, a.y - b.y); })) };
  });
  expect(pairs.dotCount).toBeGreaterThan(0);
  expect(pairs.distances.length).toBeGreaterThan(0);
  for (const distance of pairs.distances) expect(distance).toBeGreaterThan(6.3);
});
