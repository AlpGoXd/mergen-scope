// Trace symbols (design decisions 2026-11-10): hollow shapes drawn every ~90 px along a trace
// when its colour repeats (or always, per the setting), in its row swatch and in exports.
// Pure geometry: SVG path data and positions. Draw with fill = the pane background, stroke =
// the trace colour, stroke-width 1.4.
import type { TraceSymbol } from './trace-palette';

export interface Pt { readonly x: number; readonly y: number }

/** SVG path data for a symbol centred at (x, y) with radius r (default 3.6 px). */
export function symbolPath(kind: TraceSymbol, x: number, y: number, r = 3.6): string {
  const f = (n: number): string => (Math.round(n * 100) / 100).toString();
  switch (kind) {
    case 'circle':
      return `M${f(x - r)},${f(y)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
    case 'square':
      return `M${f(x - r)},${f(y - r)}H${f(x + r)}V${f(y + r)}H${f(x - r)}Z`;
    case 'triangle':
      return `M${f(x)},${f(y - r - 0.6)}L${f(x + r + 0.6)},${f(y + r)}L${f(x - r - 0.6)},${f(y + r)}Z`;
    case 'triangle-down':
      return `M${f(x)},${f(y + r + 0.6)}L${f(x + r + 0.6)},${f(y - r)}L${f(x - r - 0.6)},${f(y - r)}Z`;
    case 'diamond':
      return `M${f(x)},${f(y - r - 1)}L${f(x + r + 1)},${f(y)}L${f(x)},${f(y + r + 1)}L${f(x - r - 1)},${f(y)}Z`;
    case 'plus':
      return `M${f(x - r)},${f(y)}H${f(x + r)}M${f(x)},${f(y - r)}V${f(y + r)}`;
    case 'cross':
      return `M${f(x - r)},${f(y - r)}L${f(x + r)},${f(y + r)}M${f(x + r)},${f(y - r)}L${f(x - r)},${f(y + r)}`;
    case 'star': {
      const pts: string[] = [];
      for (let k = 0; k < 10; k++) {
        const ang = Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 === 0 ? r + 1 : (r + 1) * 0.45;
        pts.push(`${f(x + rr * Math.cos(ang))},${f(y - rr * Math.sin(ang))}`);
      }
      return `M${pts.join('L')}Z`;
    }
  }
}

/** Whether a symbol is drawn as an outline that should be filled with the background. */
export const isClosedSymbol = (kind: TraceSymbol): boolean => kind !== 'plus' && kind !== 'cross';

/**
 * Points every `spacing` px of arc length along a polyline in screen pixels, starting half a
 * spacing in so symbols don't sit on the plot edge. Skips non-finite points (gaps).
 */
export function symbolPositions(points: readonly Pt[], spacing = 90): Pt[] {
  const out: Pt[] = [];
  if (spacing <= 0) return out;
  let next = spacing / 2, travelled = 0;
  let prev: Pt | undefined;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { prev = undefined; continue; }
    if (prev) {
      const seg = Math.hypot(p.x - prev.x, p.y - prev.y);
      while (seg > 0 && travelled + seg >= next) {
        const t = (next - travelled) / seg;
        out.push({ x: prev.x + t * (p.x - prev.x), y: prev.y + t * (p.y - prev.y) });
        next += spacing;
      }
      travelled += seg;
    }
    prev = p;
  }
  return out;
}
