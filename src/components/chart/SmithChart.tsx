import { useMemo } from 'react';
import { gammaToSvg } from '../../domain/smith-coords';
import { SmithGrid } from './SmithGrid';
import { useTheme } from '../../hooks/use-theme';
import type { Trace, RawTrace } from '../../types/trace';

export interface SmithChartProps {
  paneId: string;
  traces: Trace[];
  renderMode: 'smith' | 'smith-inverted';
}

/**
 * Smith Chart component for specialized Touchstone S-parameter visualization.
 * Ported from legacy renderSmithPaneModel in app-chart-components.js.
 */
export function SmithChart({ paneId, traces, renderMode }: SmithChartProps) {
  const { colors } = useTheme();
  const clipId = `smith-clip-${paneId}`;

  const smithSeriesList = useMemo(() => {
    return traces.map((tr, idx) => {
      const raw = tr as RawTrace;
      if (!raw.touchstoneNetwork || !raw.networkSource) return null;

      const { row, col } = raw.networkSource;
      if (row === undefined || col === undefined) return null;

      const stroke = colors?.tr?.[idx % (colors?.tr?.length || 1)] || 'var(--accent)';
      
      const points = raw.touchstoneNetwork.samples.map(sample => {
        const complex = sample.sMatrix[row]?.[col];
        if (!complex) return null;
        
        const svg = gammaToSvg(complex.re, complex.im);
        return {
          x: svg.x,
          y: svg.y,
          freq: sample.freq,
          re: complex.re,
          im: complex.im
        };
      }).filter((point): point is { x: number; y: number; freq: number; re: number; im: number } => point !== null);

      const path = points.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

      return {
        traceName: tr.name,
        stroke,
        points,
        path
      };
    }).filter((series): series is { traceName: string; stroke: string; points: Array<{ x: number; y: number; freq: number; re: number; im: number }>; path: string } => Boolean(series));
  }, [traces, colors]);

  if (smithSeriesList.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>
        No S-parameter traces in this pane.
      </div>
    );
  }

  const firstSeries = smithSeriesList[0];
  const firstPoint = firstSeries?.points?.[0];
  const lastPoint = firstSeries?.points?.[firstSeries.points.length - 1];

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', minHeight: 0 }}>
      <svg 
        viewBox="0 0 100 100" 
        style={{ width: '100%', height: '100%', maxWidth: '600px', maxHeight: '600px', overflow: 'visible' }}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="50" cy="50" r="42" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <SmithGrid mode={renderMode} clipId={clipId} />
          
          {smithSeriesList.map(series => (
            <polyline 
              key={series.traceName}
              points={series.path}
              fill="none"
              stroke={series.stroke}
              strokeWidth="0.3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Start/End indicators for the first series */}
          {firstSeries && firstPoint && lastPoint && (
            <>
              <circle 
                cx={firstPoint.x}
                cy={firstPoint.y}
                r="0.8" 
                fill="none" 
                stroke={firstSeries.stroke}
                strokeWidth="0.2" 
              />
              <circle 
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="1.2" 
                fill={firstSeries.stroke}
              />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
