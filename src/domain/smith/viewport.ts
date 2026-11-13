import type { Complex } from '../../types/touchstone.ts';
import type { SmithPoint, SmithViewport } from '../../types/smith-plot.ts';

function valid(v: SmithViewport): boolean {
  return Number.isFinite(v.width) && v.width > 0 && Number.isFinite(v.height) && v.height > 0 &&
    Number.isFinite(v.scale) && v.scale > 0 && Number.isFinite(v.center.re) && Number.isFinite(v.center.im);
}
/** The center is in G coordinates, independent of screen size. */
export function gammaToPoint(g: Complex, v: SmithViewport): SmithPoint | null {
  if (!valid(v) || !Number.isFinite(g.re) || !Number.isFinite(g.im)) return null;
  const x = v.width / 2 + (g.re - v.center.re) * v.scale;
  const y = v.height / 2 - (g.im - v.center.im) * v.scale;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
export function pointToGamma(p: SmithPoint, v: SmithViewport): Complex | null {
  if (!valid(v) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const re = v.center.re + (p.x - v.width / 2) / v.scale;
  const im = v.center.im - (p.y - v.height / 2) / v.scale;
  return Number.isFinite(re) && Number.isFinite(im) ? { re, im } : null;
}
export function zoomAt(v: SmithViewport, anchor: SmithPoint, factor: number): SmithViewport | null {
  const g = pointToGamma(anchor, v);
  const scale = v.scale * factor;
  if (!g || !Number.isFinite(factor) || factor <= 0 || !Number.isFinite(scale) || scale <= 0) return null;
  const next = { ...v, scale, center: { re: g.re - (anchor.x - v.width / 2) / scale, im: g.im + (anchor.y - v.height / 2) / scale } };
  return valid(next) ? next : null;
}
export function panBy(v: SmithViewport, delta: SmithPoint): SmithViewport | null {
  if (!valid(v) || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return null;
  const next = { ...v, center: { re: v.center.re - delta.x / v.scale, im: v.center.im + delta.y / v.scale } };
  return valid(next) ? next : null;
}
/** Fit the unit circle and every finite sample, retaining equal pixel scales. */
export function fitViewport(width: number, height: number, samples: readonly Complex[], paddingPx = 0): SmithViewport | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(paddingPx) || paddingPx < 0 || width <= 2 * paddingPx || height <= 2 * paddingPx) return null;
  let radius = 1;
  for (const g of samples) if (Number.isFinite(g.re) && Number.isFinite(g.im)) radius = Math.max(radius, Math.hypot(g.re, g.im));
  const scale = Math.min(width - 2 * paddingPx, height - 2 * paddingPx) / 2 / radius;
  const viewport = { width, height, center: { re: 0, im: 0 }, scale };
  return valid(viewport) ? viewport : null;
}
