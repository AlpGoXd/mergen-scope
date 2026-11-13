import type { OverviewPlot } from '../../domain/import-wizard';

const GRID_X = [0.2, 0.4, 0.6, 0.8];
const GRID_Y = [0.25, 0.5, 0.75];

/**
 * The whole file, reduced to min/max per pixel column: each Y column in its trace colour, dashed grid,
 * no axis text. The shaded band marks the rows the table shows.
 */
export function WizardPreviewPlot({ plot, colors }: { plot: OverviewPlot; colors: readonly string[] }) {
  const band = plot.band;
  // Keep the band visible (about 3 px) even when the table rows are a sliver of a long file.
  const bandFrom = band ? Math.min(band.from, 0.995) : 0;
  const bandWidth = band ? Math.max(band.to - band.from, 0.005) : 0;
  return (
    <svg className="iw-plot" data-testid="import-wizard-plot" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Plot of the Y columns over the whole file">
      {band && <rect className="iw-plot-band" data-testid="import-wizard-plot-band" x={bandFrom * 100} y={0} width={bandWidth * 100} height={100} />}
      <g className="iw-plot-grid">
        {GRID_X.map(x => <line key={`x${x}`} x1={x * 100} x2={x * 100} y1={0} y2={100} />)}
        {GRID_Y.map(y => <line key={`y${y}`} x1={0} x2={100} y1={y * 100} y2={y * 100} />)}
      </g>
      {plot.series.map((line, index) => line.length > 1 && (
        <polyline
          key={index}
          className="iw-plot-line"
          style={{ stroke: colors[index] ?? 'var(--accent)' }}
          points={line.map(point => `${(point.x * 100).toFixed(3)},${(4 + point.y * 92).toFixed(3)}`).join(' ')}
        />
      ))}
    </svg>
  );
}
