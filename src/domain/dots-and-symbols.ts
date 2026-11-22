import { symbolPositions } from './trace-symbols';
import type { Pt } from './trace-symbols';
import { traceBound } from './trace-math';
import type { DataPoint } from '../types/trace';

export const SYMBOL_RADIUS = 3.6;
export const DOT_RADIUS = 2;
export const SYMBOL_STROKE = 1.5;

/** Average spacing across the plot uses the gaps between samples. */
export function sampleDotsVisible(pointsInView: number, plotWidthPx: number, minSpacingPx = 3): boolean {
  return pointsInView > 0 && Number.isFinite(plotWidthPx) && plotWidthPx > 0
    && (pointsInView - 1) * minSpacingPx <= plotWidthPx;
}

export function visibleSampleCount(data: readonly DataPoint[], range: readonly [number, number] | null): number {
  if (!range) return 0;
  const [left, right] = range;
  if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) return 0;
  return traceBound(data, right, true) - traceBound(data, left);
}

export function planDotsAndSymbols({ points, showDots, showSymbols, spacing = 90 }: { points: readonly Pt[]; showDots: boolean; showSymbols: boolean; spacing?: number }): { dots: number[]; symbols: { x: number; y: number; sampleIndex: number }[]; hollow: boolean } {
  const finite = points.flatMap((point, index) => Number.isFinite(point.x) && Number.isFinite(point.y) ? [index] : []);
  const claimed = new Set<number>();
  const symbols = showSymbols ? symbolPositions(points, spacing, finite.length).flatMap(position => {
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
  return { dots: showDots ? finite : [], symbols, hollow: showDots };
}
