import { describe, expect, it } from 'vitest';
import {
  arcPath, buildGrid, circlePath, gridLevelForScale, gridThroughGamma, gridValues, pointOnArc, pointOnCircle,
  reactanceArc, reactanceCircle, reactanceRimPoint, resistanceCircle, rotateArc180, SMITH_GRID_MAX_LEVEL,
} from '../../src/domain/smith/grid.ts';
import { gammaToImpedance, impedanceToGamma } from '../../src/domain/smith/numerics.ts';

const dist = (a: { re: number; im: number }, b: { re: number; im: number }) => Math.hypot(a.re - b.re, a.im - b.im);
const ts = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

describe('Smith grid geometry', () => {
  it('puts every point of the r = 1 circle at |Γ − 0.5| = 0.5 and at resistance 1', () => {
    const circle = resistanceCircle(1);
    expect(circle).toEqual({ center: { re: 0.5, im: 0 }, radius: 0.5 });
    if (!circle) return;
    for (const angle of [0.3, 1.2, 2.5, 4, 5.5]) {
      const p = pointOnCircle(circle, angle);
      expect(dist(p, { re: 0.5, im: 0 })).toBeCloseTo(0.5, 12);
      const z = gammaToImpedance(p, 1);
      expect(z.kind).toBe('value');
      if (z.kind === 'value') expect(z.value.re).toBeCloseTo(1, 9);
    }
  });

  it('gives resistance circles centre r/(1+r) and radius 1/(1+r), all inside the unit circle', () => {
    for (const r of [0, 0.2, 0.5, 2, 5, 50]) {
      const circle = resistanceCircle(r);
      expect(circle?.center.re).toBeCloseTo(r / (1 + r), 12);
      expect(circle?.radius).toBeCloseTo(1 / (1 + r), 12);
      expect((circle?.center.re ?? 0) + (circle?.radius ?? 0)).toBeCloseTo(1, 12);
    }
    expect(resistanceCircle(-0.1)).toBeNull();
    expect(resistanceCircle(Number.NaN)).toBeNull();
  });

  it('puts every point of the x = 1 arc at |Γ − (1 + j)| = 1, inside the unit circle, at reactance 1', () => {
    const arc = reactanceArc(1);
    expect(arc).not.toBeNull();
    if (!arc) return;
    expect(arc.from.re).toBeCloseTo(0, 12);
    expect(arc.from.im).toBeCloseTo(1, 12);
    expect(arc.to).toEqual({ re: 1, im: 0 });
    for (const t of ts) {
      const p = pointOnArc(arc, t);
      expect(dist(p, { re: 1, im: 1 })).toBeCloseTo(1, 12);
      expect(Math.hypot(p.re, p.im)).toBeLessThanOrEqual(1 + 1e-12);
      if (t > 0 && t < 1) {
        const z = gammaToImpedance(p, 1);
        expect(z.kind).toBe('value');
        if (z.kind === 'value') { expect(z.value.im).toBeCloseTo(1, 9); expect(z.value.re).toBeGreaterThan(0); }
      }
    }
  });

  it('clips reactance arcs of either sign and any size to the unit circle', () => {
    for (const x of [-20, -5, -1.5, -0.2, -0.02, 0.02, 0.2, 1.5, 5, 20]) {
      const arc = reactanceArc(x);
      const circle = reactanceCircle(x);
      expect(arc).not.toBeNull();
      if (!arc || !circle) continue;
      expect(circle.center).toEqual({ re: 1, im: 1 / x });
      expect(circle.radius).toBeCloseTo(1 / Math.abs(x), 12);
      // The rim point is Γ of the pure reactance jx.
      const rim = impedanceToGamma({ re: 0, im: x }, 1);
      if (rim.kind === 'value') expect(dist(rim.value, reactanceRimPoint(x))).toBeLessThan(1e-12);
      expect(Math.hypot(arc.from.re, arc.from.im)).toBeCloseTo(1, 12);
      for (const t of ts) {
        const p = pointOnArc(arc, t);
        expect(dist(p, circle.center)).toBeCloseTo(circle.radius, 9);
        expect(Math.hypot(p.re, p.im)).toBeLessThanOrEqual(1 + 1e-9);
        // +x stays in the top half, −x in the bottom half.
        if (t > 0 && t < 1) expect(Math.sign(p.im)).toBe(Math.sign(x));
      }
      expect(dist(pointOnArc(arc, 1), { re: 1, im: 0 })).toBeLessThan(1e-9);
    }
    expect(reactanceArc(0)).toBeNull();
  });

  it('makes the admittance grid the impedance grid rotated 180°', () => {
    const z = buildGrid('z', [0.5, 1, 2]);
    const y = buildGrid('y', [0.5, 1, 2]);
    expect(y.circles).toHaveLength(z.circles.length);
    z.circles.forEach((item, index) => {
      const rotated = y.circles[index];
      expect(rotated?.circle.center.re).toBeCloseTo(-item.circle.center.re, 12);
      expect(rotated?.circle.radius).toBe(item.circle.radius);
    });
    z.arcs.forEach((item, index) => {
      const rotated = y.arcs[index];
      if (!rotated) throw new Error('missing arc');
      for (const t of ts) {
        const a = pointOnArc(item.arc, t), b = pointOnArc(rotated.arc, t);
        expect(b.re).toBeCloseTo(-a.re, 12);
        expect(b.im).toBeCloseTo(-a.im, 12);
      }
    });
    // A point on the g = 2 circle has conductance 2 (normalised): y = (1 − Γ)/(1 + Γ).
    const g2 = y.circles.find(item => item.value === 2);
    if (!g2) throw new Error('missing g = 2');
    const p = pointOnCircle(g2.circle, 1.1);
    const zAtP = gammaToImpedance(p, 1);
    if (zAtP.kind !== 'value') throw new Error('singular');
    const den = zAtP.value.re ** 2 + zAtP.value.im ** 2;
    expect(zAtP.value.re / den).toBeCloseTo(2, 9);
    // Rotating twice is the identity.
    const arc = reactanceArc(0.7);
    if (arc) expect(pointOnArc(rotateArc180(rotateArc180(arc)), 0.4)).toEqual(pointOnArc(arc, 0.4));
  });

  it('writes paths in chart space (re, −im) with on-screen arc flags', () => {
    const r1 = resistanceCircle(1);
    expect(r1 && circlePath(r1)).toBe('M0,0A0.5,0.5 0 1 0 1,0A0.5,0.5 0 1 0 0,0Z');
    const up = reactanceArc(1), down = reactanceArc(-1);
    // +j1 starts at the top of the rim: Γ = j is y = −1 on screen.
    expect(up && arcPath(up)).toBe('M0,-1A1,1 0 0 0 1,0');
    expect(down && arcPath(down)).toBe('M0,1A1,1 0 0 1 1,0');
  });

  it('adds grid values as the chart is magnified and never removes one', () => {
    expect(gridValues(gridLevelForScale(250))).toEqual([0.2, 0.5, 1, 2, 5]);
    expect(gridValues(gridLevelForScale(60))).toEqual([0.5, 1, 2]);
    for (const value of [0.1, 0.3, 0.7, 1.5, 3]) expect(gridValues(gridLevelForScale(400))).toContain(value);
    let previous: number[] = [];
    let previousLevel = -1;
    for (const scale of [20, 99, 100, 250, 299, 300, 700, 1600, 1e5]) {
      const level = gridLevelForScale(scale);
      expect(level).toBeGreaterThanOrEqual(previousLevel);
      const values = gridValues(level);
      for (const value of previous) expect(values).toContain(value);
      expect([...values].sort((a, b) => a - b)).toEqual(values);
      expect(new Set(values).size).toBe(values.length);
      previous = values; previousLevel = level;
    }
    expect(gridLevelForScale(1e9)).toBe(SMITH_GRID_MAX_LEVEL);
    expect(gridLevelForScale(Number.NaN)).toBe(0);
  });

  it('finds the r circle and x arc through a point for the hover highlight', () => {
    // 50 + j50 Ω on 50 Ω: Γ = 0.2 + 0.4j, r = 1, x = 1.
    const through = gridThroughGamma({ re: 0.2, im: 0.4 });
    expect(through?.real).toBeCloseTo(1, 12);
    expect(through?.imag).toBeCloseTo(1, 12);
    expect(through?.circle.circle.center.re).toBeCloseTo(0.5, 12);
    expect(through?.arc?.arc.center.im).toBeCloseTo(1, 12);
    // The same point read as admittance: y = 1/(1 + j) = 0.5 − 0.5j.
    const y = gridThroughGamma({ re: 0.2, im: 0.4 }, 'y');
    expect(y?.real).toBeCloseTo(0.5, 12);
    expect(y?.imag).toBeCloseTo(-0.5, 12);
    if (y?.arc) expect(Math.hypot(0.2 - y.arc.arc.center.re, 0.4 - y.arc.arc.center.im)).toBeCloseTo(y.arc.arc.radius, 12);
    if (y) expect(Math.hypot(0.2 - y.circle.circle.center.re, 0.4 - y.circle.circle.center.im)).toBeCloseTo(y.circle.circle.radius, 12);
    // On the real axis there is no arc; outside the unit circle and at the open there is nothing.
    expect(gridThroughGamma({ re: -1 / 3, im: 0 })?.arc).toBeNull();
    expect(gridThroughGamma({ re: 1.3, im: 0 })).toBeNull();
    expect(gridThroughGamma({ re: 1, im: 0 })).toBeNull();
  });
});
