import { symbolPositions } from './trace-symbols';
import type { Pt } from './trace-symbols';

export const SYMBOL_RADIUS = 3.6;
export const DOT_RADIUS = 2;
export const SYMBOL_STROKE = 1.5;

export function planDotsAndSymbols({ points, showDots, showSymbols, forceHollow = false, spacing = 90 }: { points: readonly Pt[]; showDots: boolean; showSymbols: boolean; forceHollow?: boolean; spacing?: number }): { dots: number[]; symbols: { x: number; y: number; sampleIndex: number }[]; hollow: boolean } {
  const finite = points.flatMap((point, index) => Number.isFinite(point.x) && Number.isFinite(point.y) ? [index] : []);
  const claimed = new Set<number>();
  const symbols = showSymbols ? symbolPositions(points, spacing).flatMap(position => {
    let nearest: number | undefined; let distance = Infinity;
    for (const index of finite) {
      const point = points[index]; if (!point || claimed.has(index)) continue;
      const d = Math.hypot(point.x - position.x, point.y - position.y);
      if (d < distance) { nearest = index; distance = d; }
    }
    if (nearest === undefined) return [];
    claimed.add(nearest);
    const point = points[nearest];
    if (!point) return [];
    return [{ ...(showDots ? point : position), sampleIndex: nearest }];
  }) : [];
  if (forceHollow && showSymbols && symbols.length === 0) {
    const sampleIndex = finite[Math.floor(finite.length / 2)];
    const point = sampleIndex === undefined ? undefined : points[sampleIndex];
    if (point && sampleIndex !== undefined) symbols.push({ ...point, sampleIndex });
  }
  return { dots: showDots ? finite : [], symbols, hollow: showDots || forceHollow };
}
