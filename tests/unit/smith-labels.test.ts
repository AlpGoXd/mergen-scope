import { describe, expect, it } from 'vitest';
import { buildLabels, formatGridLabel } from '../../src/domain/smith/labels.ts';
import type { SmithLabel } from '../../src/domain/smith/labels.ts';
import type { SmithViewport } from '../../src/types/smith-plot.ts';

const full: SmithViewport = { width: 600, height: 600, center: { re: 0, im: 0 }, scale: 250 };
const values = [0.2, 0.5, 1, 2, 5];
const byKey = (labels: readonly SmithLabel[], key: string) => labels.find(label => label.key === key);
const overlap = (a: SmithLabel, b: SmithLabel) =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;

describe('Smith grid label text', () => {
  it('is normalised by default, with j before the number', () => {
    expect(formatGridLabel('r', 0.5, 'z', 'normalised', 50)).toBe('0.5');
    expect(formatGridLabel('r', 1, 'z', 'normalised', 50)).toBe('1');
    expect(formatGridLabel('x', 0.5, 'z', 'normalised', 50)).toBe('+j0.5');
    expect(formatGridLabel('x', -2, 'z', 'normalised', 50)).toBe('−j2');
    expect(formatGridLabel('x', 0.5, 'y', 'normalised', 50)).toBe('+j0.5');
  });
  it('multiplies by Z0 in the ohms mode and uses mS on the Y grid', () => {
    expect(formatGridLabel('r', 0.5, 'z', 'ohms', 50)).toBe('25 Ω');
    expect(formatGridLabel('x', 0.5, 'z', 'ohms', 50)).toBe('+j25 Ω');
    expect(formatGridLabel('x', -0.15, 'z', 'ohms', 50)).toBe('−j7.5 Ω');
    expect(formatGridLabel('r', 2, 'z', 'ohms', 75)).toBe('150 Ω');
    // g = 0.5 on 50 Ω is 0.5 / 50 S = 10 mS.
    expect(formatGridLabel('r', 0.5, 'y', 'ohms', 50)).toBe('10 mS');
    expect(formatGridLabel('x', 0.5, 'y', 'ohms', 50)).toBe('+j10 mS');
    // A bad Z0 falls back to normalised text rather than NaN.
    expect(formatGridLabel('r', 0.5, 'z', 'ohms', 0)).toBe('0.5');
  });
});

describe('Smith grid label positions', () => {
  const labels = buildLabels({ grid: 'z', values, viewport: full, mode: 'normalised', z0: 50, fontPx: 10 });

  it('puts resistance values on the real axis, just above it, at each circle\'s left edge', () => {
    for (const r of values) {
      const label = byKey(labels, `r:${r}`);
      expect(label, `r = ${r}`).toBeDefined();
      if (!label) continue;
      const edgeX = 300 + ((r - 1) / (r + 1)) * 250;
      expect(label.x - label.width / 2).toBeCloseTo(edgeX + 3, 9);
      expect(label.y + label.height / 2).toBeCloseTo(300 - 2, 9);
    }
    expect(byKey(labels, 'r:1')?.text).toBe('1');
  });

  it('puts reactance values outside the rim: +j in the top half, −j in the bottom half', () => {
    for (const x of values) {
      const up = byKey(labels, `x:${x}`), down = byKey(labels, `x:${-x}`);
      expect(up?.text.startsWith('+j')).toBe(true);
      expect(down?.text.startsWith('−j')).toBe(true);
      if (!up || !down) continue;
      expect(up.y).toBeLessThan(300);
      expect(down.y).toBeGreaterThan(300);
      expect(down.x).toBeCloseTo(up.x, 9);
      expect(down.y - 300).toBeCloseTo(300 - up.y, 9);
      // The whole box is outside the unit circle.
      const nearX = Math.max(up.x - up.width / 2, Math.min(300, up.x + up.width / 2));
      const nearY = Math.max(up.y - up.height / 2, Math.min(300, up.y + up.height / 2));
      expect(Math.hypot(nearX - 300, nearY - 300)).toBeGreaterThan(250);
    }
    // +j1 sits straight above the centre.
    expect(byKey(labels, 'x:1')?.x).toBeCloseTo(300, 9);
  });

  it('marks the two ends of the axis with 0 and ∞', () => {
    const zero = byKey(labels, 'end:0'), open = byKey(labels, 'end:∞');
    expect(zero && zero.x + zero.width / 2).toBeLessThan(50);
    expect(open && open.x - open.width / 2).toBeGreaterThan(550);
    expect(zero?.y).toBeCloseTo(300, 9);
  });

  it('mirrors everything for the Y grid', () => {
    const y = buildLabels({ grid: 'y', values, viewport: full, mode: 'ohms', z0: 50, fontPx: 10 });
    // g = 0 (open) is at the right end; +jb is in the bottom half.
    expect((byKey(y, 'end:0')?.x ?? 0)).toBeGreaterThan(550);
    expect((byKey(y, 'x:1')?.y ?? 0)).toBeGreaterThan(300);
    expect(byKey(y, 'x:1')?.text).toBe('+j20 mS');
    const g2 = byKey(y, 'r:2');
    expect(g2 && g2.x + g2.width / 2).toBeCloseTo(300 - (1 / 3) * 250 - 3, 9);
  });

  it('drops the label of the smaller value first when two would overlap', () => {
    const crowded = buildLabels({ grid: 'z', values: [1, 1.02, 0.2], viewport: full, mode: 'normalised', z0: 50, fontPx: 10 });
    expect(byKey(crowded, 'r:1.02')).toBeDefined();
    expect(byKey(crowded, 'r:1')).toBeUndefined();
    expect(byKey(crowded, 'x:1.02')).toBeDefined();
    expect(byKey(crowded, 'x:1')).toBeUndefined();
    expect(byKey(crowded, 'r:0.2')).toBeDefined();
    // Nothing that is kept overlaps anything else that is kept.
    const dense = buildLabels({ grid: 'z', values: [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.5, 1.8, 2, 2.5, 3, 4, 5, 7, 10, 20], viewport: { ...full, width: 300, height: 300, scale: 110 }, mode: 'ohms', z0: 50, fontPx: 12 });
    dense.forEach((a, i) => dense.slice(i + 1).forEach(b => expect(overlap(a, b), `${a.key} / ${b.key}`).toBe(false)));
    expect(dense.length).toBeGreaterThan(4);
  });

  it('moves a reactance label to where its arc enters the view when the rim is off screen', () => {
    // Zoomed on the middle of the x = 1 arc: the rim point Γ = j is far off screen.
    const zoomed: SmithViewport = { width: 400, height: 400, center: { re: 1 - Math.SQRT1_2, im: 1 - Math.SQRT1_2 }, scale: 1500 };
    const moved = byKey(buildLabels({ grid: 'z', values: [1], viewport: zoomed, mode: 'normalised', z0: 50, fontPx: 10 }), 'x:1');
    expect(moved).toBeDefined();
    if (!moved) return;
    expect(moved.x - moved.width / 2).toBeGreaterThanOrEqual(0);
    expect(moved.x + moved.width / 2).toBeLessThanOrEqual(400);
    expect(moved.y - moved.height / 2).toBeGreaterThanOrEqual(0);
    expect(moved.y + moved.height / 2).toBeLessThanOrEqual(400);
    // It sits on the arc: |Γ − (1 + j)| = 1.
    const re = zoomed.center.re + (moved.x - 200) / 1500, im = zoomed.center.im - (moved.y - 200) / 1500;
    expect(Math.hypot(re - 1, im - 1)).toBeCloseTo(1, 9);
    // An arc that never crosses the view gets no label.
    expect(byKey(buildLabels({ grid: 'z', values: [5], viewport: zoomed, mode: 'normalised', z0: 50, fontPx: 10 }), 'x:5')).toBeUndefined();
  });
});
