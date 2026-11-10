import { symbolPositions } from './trace-symbols';
import type { Pt } from './trace-symbols';

export const SYMBOL_RADIUS = 3.6;
export const DOT_RADIUS = 2;
export const SYMBOL_STROKE = 1.5;

export function planDotsAndSymbols({ points, showDots, showSymbols, spacing = 90 }: { points: readonly Pt[]; showDots: boolean; showSymbols: boolean; spacing?: number }): { dots: number[]; symbols: { x: number; y: number; sampleIndex: number }[] } {
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
    return [{ ...position, sampleIndex: nearest }];
  }) : [];
  return { dots: showDots ? finite.filter(index => {
    const point = points[index];
    return point && !claimed.has(index) && symbols.every(symbol =>
      Math.hypot(point.x - symbol.x, point.y - symbol.y) > SYMBOL_RADIUS + SYMBOL_STROKE / 2 + DOT_RADIUS);
  }) : [], symbols };
}
