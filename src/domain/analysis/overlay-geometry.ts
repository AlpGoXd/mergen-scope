export interface OverlayPoint { readonly x: number; readonly y: number }
import type { OverlayShape } from '../../types/registry-contract';
export interface OverlayRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
type Scale = (value: number) => number;

export type ShapeGeometry =
  | { kind: 'band'; x: number; y: number; width: number; height: number }
  | { kind: 'triangle'; x: number; y: number; n: number }
  | { kind: 'dot'; x: number; y: number }
  | { kind: 'tick'; x: number; y: number }
  | { kind: 'level'; x1: number; x2: number; y: number };

/** Convert data coordinates to clipped plot coordinates. */
export function shapeGeometry(shape: OverlayShape, xScale: Scale, yScale: Scale, rect: OverlayRect): ShapeGeometry | null {
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  const right = rect.left + rect.width, bottom = rect.top + rect.height;
  if (shape.kind === 'band') {
    const xs = [xScale(shape.x1), xScale(shape.x2)];
    const ys = shape.y1 === undefined || shape.y2 === undefined ? [rect.top, bottom] : [yScale(shape.y1), yScale(shape.y2)];
    if (![...xs, ...ys].every(Number.isFinite)) return null;
    const x = Math.max(rect.left, Math.min(...xs)), endX = Math.min(right, Math.max(...xs));
    const y = Math.max(rect.top, Math.min(...ys)), endY = Math.min(bottom, Math.max(...ys));
    return endX > x && endY > y ? { kind: 'band', x, y, width: endX - x, height: endY - y } : null;
  }
  if (shape.kind === 'level') {
    const xs = [xScale(shape.x1), xScale(shape.x2)], y = yScale(shape.y);
    if (![...xs, y].every(Number.isFinite) || y < rect.top || y > bottom) return null;
    const x1 = Math.max(rect.left, Math.min(...xs)), x2 = Math.min(right, Math.max(...xs));
    return x2 > x1 ? { kind: 'level', x1, x2, y } : null;
  }
  const x = xScale(shape.x), y = yScale(shape.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < rect.left || x > right || y < rect.top || y > bottom) return null;
  if (shape.kind === 'triangle') return { kind: 'triangle', x, y, n: shape.n };
  return shape.kind === 'dot' ? { kind: 'dot', x, y } : { kind: 'tick', x, y };
}

/** Clip a pixel segment to the plot rectangle using its parametric interval. */
function clip(a: OverlayPoint, b: OverlayPoint, rect: OverlayRect): readonly [OverlayPoint, OverlayPoint] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, a.x - rect.left], [dx, rect.left + rect.width - a.x], [-dy, a.y - rect.top], [dy, rect.top + rect.height - a.y]] as const) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  return [{ x: a.x + lo * dx, y: a.y + lo * dy }, { x: a.x + hi * dx, y: a.y + hi * dy }];
}

/** Each subpath is independent, so invalid points never bridge gaps. */
export function overlayGeometry(kind: 'polyline' | 'segment', points: readonly OverlayPoint[], xScale: Scale, yScale: Scale, rect: OverlayRect): string {
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return '';
  const scaled = points.map(point => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const x = xScale(point.x), y = yScale(point.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  });
  if (kind === 'segment' && (!scaled[0] || !scaled[1])) return '';
  const parts: string[] = [];
  const append = (a: OverlayPoint, b: OverlayPoint) => {
    const segment = clip(a, b, rect);
    if (segment) parts.push(`M ${segment[0].x} ${segment[0].y} L ${segment[1].x} ${segment[1].y}`);
  };
  for (let index = 1; index < scaled.length; index++) {
    const a = scaled[index - 1], b = scaled[index];
    if (a && b) append(a, b);
    if (kind === 'segment') break;
  }
  if (kind === 'segment') for (const point of scaled.slice(0, 2)) {
    if (point) append({ x: point.x, y: point.y - 4 }, { x: point.x, y: point.y + 4 });
  }
  return parts.join(' ');
}
