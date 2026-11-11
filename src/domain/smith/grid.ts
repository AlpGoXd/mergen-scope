import type { Complex } from '../../types/touchstone.ts';

/**
 * Smith grid geometry in Γ space (+imaginary up).
 *
 * Path strings are in "chart space" (re, −im), so one `translate + scale` on a `<g>` maps them to
 * the screen and SVG arc flags keep their usual on-screen meaning.
 */
export type SmithGridKind = 'z' | 'y';
export interface SmithCircle { readonly center: Complex; readonly radius: number }
export interface SmithArc extends SmithCircle {
  readonly from: Complex;
  readonly to: Complex;
  /** Direction from `from` to `to` in Γ space (+imaginary up). The arc is always the minor one. */
  readonly counterClockwise: boolean;
}
export interface SmithGridCircle { readonly value: number; readonly circle: SmithCircle; readonly path: string }
export interface SmithGridArc { readonly value: number; readonly arc: SmithArc; readonly path: string }
export interface SmithGrid {
  readonly kind: SmithGridKind;
  /** Constant r (Z grid) or constant g (Y grid). */
  readonly circles: readonly SmithGridCircle[];
  /** Constant x (Z grid) or constant b (Y grid), both signs. */
  readonly arcs: readonly SmithGridArc[];
}

const num = (v: number): string => String(Number(v.toFixed(7)));
const negate = (g: Complex): Complex => ({ re: -g.re, im: -g.im });

/** Constant-resistance circle: centre (r/(1+r), 0), radius 1/(1+r). It lies inside the unit circle for r ≥ 0. */
export function resistanceCircle(r: number): SmithCircle | null {
  if (!Number.isFinite(r) || r < 0) return null;
  return { center: { re: r / (1 + r), im: 0 }, radius: 1 / (1 + r) };
}

/** Full constant-reactance circle: centre (1, 1/x), radius 1/|x|. */
export function reactanceCircle(x: number): SmithCircle | null {
  if (!Number.isFinite(x) || x === 0) return null;
  return { center: { re: 1, im: 1 / x }, radius: 1 / Math.abs(x) };
}

/** Where the constant-x arc meets the rim: Γ of the pure reactance jx. */
export function reactanceRimPoint(x: number): Complex {
  const d = x * x + 1;
  return { re: (x * x - 1) / d, im: (2 * x) / d };
}

/**
 * Constant-reactance arc clipped to the unit circle: from the rim point to Γ = 1.
 * The two circles are orthogonal, so the part inside the unit circle is always the minor arc
 * (it spans 2·atan|x| < 180°).
 */
export function reactanceArc(x: number): SmithArc | null {
  const circle = reactanceCircle(x);
  if (!circle) return null;
  return { ...circle, from: reactanceRimPoint(x), to: { re: 1, im: 0 }, counterClockwise: x > 0 };
}

/** The admittance grid is the impedance grid rotated 180° about the centre (Γ → −Γ). */
export function rotateCircle180(c: SmithCircle): SmithCircle {
  return { center: negate(c.center), radius: c.radius };
}
export function rotateArc180(a: SmithArc): SmithArc {
  return { center: negate(a.center), radius: a.radius, from: negate(a.from), to: negate(a.to), counterClockwise: a.counterClockwise };
}

/** Signed sweep angle (radians) from `from` to `to` around the centre. */
function arcAngles(a: SmithArc): { start: number; sweep: number } {
  const start = Math.atan2(a.from.im - a.center.im, a.from.re - a.center.re);
  const end = Math.atan2(a.to.im - a.center.im, a.to.re - a.center.re);
  const tau = 2 * Math.PI;
  let sweep = end - start;
  if (a.counterClockwise) { while (sweep < 0) sweep += tau; while (sweep >= tau) sweep -= tau; }
  else { while (sweep > 0) sweep -= tau; while (sweep <= -tau) sweep += tau; }
  return { start, sweep };
}

/** Point on an arc, t = 0 at `from` and t = 1 at `to`. */
export function pointOnArc(a: SmithArc, t: number): Complex {
  const { start, sweep } = arcAngles(a);
  const angle = start + sweep * t;
  return { re: a.center.re + a.radius * Math.cos(angle), im: a.center.im + a.radius * Math.sin(angle) };
}

/** Point on a circle at an angle in radians (0 = +real, counter-clockwise). */
export function pointOnCircle(c: SmithCircle, angle: number): Complex {
  return { re: c.center.re + c.radius * Math.cos(angle), im: c.center.im + c.radius * Math.sin(angle) };
}

/** A full circle as two half arcs, in chart space. */
export function circlePath(c: SmithCircle): string {
  const r = num(c.radius), y = num(-c.center.im);
  const left = num(c.center.re - c.radius), right = num(c.center.re + c.radius);
  return `M${left},${y}A${r},${r} 0 1 0 ${right},${y}A${r},${r} 0 1 0 ${left},${y}Z`;
}

/** A clipped arc in chart space. Counter-clockwise in Γ space is sweep-flag 0 on screen. */
export function arcPath(a: SmithArc): string {
  const r = num(a.radius);
  return `M${num(a.from.re)},${num(-a.from.im)}A${r},${r} 0 0 ${a.counterClockwise ? 0 : 1} ${num(a.to.re)},${num(-a.to.im)}`;
}

/** The real axis between the two ends of the unit circle, in chart space. */
export const REAL_AXIS_PATH = 'M-1,0L1,0';
export const UNIT_CIRCLE: SmithCircle = { center: { re: 0, im: 0 }, radius: 1 };

/**
 * Grid values by detail level. Each level keeps every value of the level below it, so lines never
 * disappear while zooming in.
 */
const LEVEL_VALUES: readonly (readonly number[])[] = [
  [0.5, 1, 2],
  [0.2, 5],
  [0.1, 0.3, 0.7, 1.5, 3, 10],
  [0.05, 0.15, 0.4, 0.6, 0.8, 1.2, 1.8, 2.5, 4, 7, 20],
  [0.02, 0.25, 0.35, 0.45, 0.9, 1.1, 1.3, 1.4, 1.6, 2.2, 3.5, 4.5, 6, 8, 15, 50],
];
export const SMITH_GRID_MAX_LEVEL = LEVEL_VALUES.length - 1;
/** Unit-circle radius in pixels at which each level starts (level 1 is the full-view set). */
const LEVEL_MIN_SCALE_PX: readonly number[] = [0, 100, 300, 680, 1500];

/** Detail level for a unit-circle radius in pixels, so neighbouring lines stay roughly 40–80 px apart. */
export function gridLevelForScale(scalePx: number): number {
  if (!Number.isFinite(scalePx) || scalePx <= 0) return 0;
  let level = 0;
  LEVEL_MIN_SCALE_PX.forEach((min, index) => { if (scalePx >= min) level = index; });
  return level;
}

/** Positive grid values for a level, ascending. The same set is used for r and for |x|. */
export function gridValues(level: number): number[] {
  const top = Math.max(0, Math.min(SMITH_GRID_MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 0)));
  return LEVEL_VALUES.slice(0, top + 1).flat().sort((a, b) => a - b);
}

/** Circles and arcs for one grid. `values` are positive; reactance arcs are made for both signs. */
export function buildGrid(kind: SmithGridKind, values: readonly number[]): SmithGrid {
  const circles: SmithGridCircle[] = [];
  const arcs: SmithGridArc[] = [];
  for (const value of values) {
    const base = resistanceCircle(value);
    if (base && value > 0) {
      const circle = kind === 'y' ? rotateCircle180(base) : base;
      circles.push({ value, circle, path: circlePath(circle) });
    }
    for (const signed of [value, -value]) {
      const baseArc = signed === 0 ? null : reactanceArc(signed);
      if (!baseArc) continue;
      const arc = kind === 'y' ? rotateArc180(baseArc) : baseArc;
      arcs.push({ value: signed, arc, path: arcPath(arc) });
    }
  }
  return { kind, circles, arcs };
}

export interface SmithGridThroughPoint {
  /** Normalised r (Z grid) or g (Y grid) at the point. */
  readonly real: number;
  /** Normalised x (Z grid) or b (Y grid) at the point. */
  readonly imag: number;
  readonly circle: SmithGridCircle;
  /** Null on the real axis, where the "arc" is the axis itself. */
  readonly arc: SmithGridArc | null;
}

/**
 * The constant-r circle and constant-x arc through a point, for the hover highlight.
 * Null outside the unit circle (negative r has no circle inside the chart) and at the singular end.
 */
export function gridThroughGamma(gamma: Complex, kind: SmithGridKind = 'z'): SmithGridThroughPoint | null {
  if (!Number.isFinite(gamma.re) || !Number.isFinite(gamma.im)) return null;
  const g = kind === 'y' ? negate(gamma) : gamma;
  const dr = 1 - g.re, di = -g.im;
  const den = dr * dr + di * di;
  if (den === 0) return null;
  const real = ((1 + g.re) * dr + g.im * di) / den;
  const imag = (g.im * dr - (1 + g.re) * di) / den;
  if (!Number.isFinite(real) || !Number.isFinite(imag) || real < 0) return null;
  const circleBase = resistanceCircle(real);
  if (!circleBase) return null;
  const circleGeometry = kind === 'y' ? rotateCircle180(circleBase) : circleBase;
  const circle: SmithGridCircle = { value: real, circle: circleGeometry, path: circlePath(circleGeometry) };
  const baseArc = Math.abs(imag) < 1e-9 ? null : reactanceArc(imag);
  const arcGeometry = baseArc ? (kind === 'y' ? rotateArc180(baseArc) : baseArc) : null;
  return { real, imag, circle, arc: arcGeometry ? { value: imag, arc: arcGeometry, path: arcPath(arcGeometry) } : null };
}
