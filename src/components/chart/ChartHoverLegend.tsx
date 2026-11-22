import type { CSSProperties, RefObject } from 'react';
import { formatAdaptiveXAxisValue, formatScalarWithUnit } from '../../domain/format';
import type { useChartHover } from '../../hooks/use-chart-hover';
import type { LegendCorner } from '../../domain/chart/legend-placement';
import type { Trace } from '../../types/trace';

interface ChartHoverLegendProps {
  paneId: string;
  hoverFreq: number | null;
  hoverRows: ReturnType<typeof useChartHover>['hoverRows'];
  visibleXSpan: number;
  activePaneTrace: Trace | null;
  legendRef: RefObject<HTMLDivElement | null>;
  corner: LegendCorner;
  style: CSSProperties;
}

export function ChartHoverLegend({
  paneId, hoverFreq, hoverRows, visibleXSpan, activePaneTrace, legendRef, corner, style,
}: ChartHoverLegendProps) {
  if (hoverFreq == null || hoverRows.length === 0) return null;
  return (
    <div ref={legendRef} data-testid={`hover-legend-${paneId}`} data-corner={corner} style={{ position: 'absolute', top: '12px', ...(corner === 'top-left' ? { left: '12px' } : { right: '12px' }), ...style, minWidth: '220px', maxWidth: '320px', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--border-strong)', background: 'var(--raised)', boxShadow: '0 10px 28px rgba(0,0,0,0.18)', display: 'grid', gap: '6px', pointerEvents: 'none' }}>
      <div style={{ fontSize: 'var(--font-label)', fontWeight: 'var(--fw-semibold)', color: 'var(--text)' }}>
        {formatAdaptiveXAxisValue(hoverFreq, visibleXSpan, { domain: activePaneTrace?.domain ?? 'frequency', unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz') })}
      </div>
      {hoverRows.map(({ trace, placement, color, resolutionLabel }) => (
        <div key={trace.name} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', gap: '8px', alignItems: 'center' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: color, boxShadow: '0 0 0 1px #333333' }} />
          <span title={trace.dn || trace.name} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--font-label)', color: 'var(--text)' }}>{trace.dn || trace.name}</span>
          <span style={{ fontSize: 'var(--font-label)', color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatScalarWithUnit(placement.amp, trace.units.y ?? null, { digits: 2 })}</span>
          <span style={{ fontSize: 'var(--font-caption)', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{resolutionLabel}</span>
        </div>
      ))}
    </div>
  );
}
