import type { ReactElement } from 'react';
import type { ChartScaleProps } from './LinesLayer';
import type { AnalysisOverlay } from '../../hooks/use-analysis-overlays';
import { overlayGeometry, shapeGeometry } from '../../domain/analysis/overlay-geometry';

/** Presentation only: Recharts supplies the plot scales and rectangle. */
export function OverlaysLayer({ overlays, xAxisMap, yAxisMap, offset }: ChartScaleProps & { overlays: readonly AnalysisOverlay[] }): ReactElement | null {
  const x = xAxisMap ? Object.values(xAxisMap)[0]?.scale : undefined;
  const y = yAxisMap ? Object.values(yAxisMap)[0]?.scale : undefined;
  if (!x || !y || !offset) return null;
  return <g pointerEvents="none">{overlays.map((overlay, overlayIndex) => {
    const colour = overlay.colour || 'var(--accent)';
    if (overlay.kind === 'shapes') return <g key={`${overlay.id}-${overlayIndex}`} pointerEvents="none">{overlay.shapes?.map((shape, index) => {
      const geometry = shapeGeometry(shape, x, y, offset);
      if (!geometry) return null;
      const common = { 'data-analysis-id': overlay.id, pointerEvents: 'none' as const };
      if (geometry.kind === 'band') return <rect key={index} {...common} data-testid="analysis-shape-band" x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} fill={colour} fillOpacity={0.12} stroke="none" />;
      if (geometry.kind === 'dot') return <circle key={index} {...common} data-testid="analysis-shape-dot" cx={geometry.x} cy={geometry.y} r={4} fill="none" stroke={colour} strokeWidth={1.5} />;
      if (geometry.kind === 'tick') return <line key={index} {...common} data-testid="analysis-shape-tick" x1={geometry.x} x2={geometry.x} y1={geometry.y - 4} y2={geometry.y + 4} stroke={colour} strokeWidth={1.5} />;
      const highlighted = overlay.highlightedPeak === geometry.n;
      const size = highlighted ? 7 : 5;
      return <g key={index} pointerEvents="none"><path {...common} data-testid="analysis-shape-triangle" data-highlighted={highlighted ? 'true' : undefined} data-rank={geometry.n} d={`M ${geometry.x} ${geometry.y - size * 2} L ${geometry.x - size} ${geometry.y} L ${geometry.x + size} ${geometry.y} Z`} fill="none" stroke={colour} strokeWidth={highlighted ? 2.5 : 1.5} /><text x={geometry.x} y={geometry.y - size * 2 - 3} fill={colour} fontSize={10} textAnchor="middle">{geometry.n}</text></g>;
    })}</g>;
    const d = overlayGeometry('polyline', overlay.points ?? [], x, y, offset);
    return d ? <path key={`${overlay.id}-${overlayIndex}`} data-testid="analysis-overlay" data-analysis-id={overlay.id} d={d} fill="none" stroke={colour} strokeWidth={1.25} strokeDasharray="5 3" /> : null;
  })}</g>;
}
