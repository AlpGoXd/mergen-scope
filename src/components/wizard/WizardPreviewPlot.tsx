import type { PreviewPlot } from '../../domain/import-wizard';

const GRID_X = [0.2, 0.4, 0.6, 0.8];
const GRID_Y = [0.25, 0.5, 0.75];

/** Sparkline of the previewed rows: each Y column in its trace colour, dashed grid, no axis text. */
export function WizardPreviewPlot({ plot, colors }: { plot: PreviewPlot; colors: readonly string[] }) {
  return (
    <svg className="iw-plot" data-testid="import-wizard-plot" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Preview plot of the Y columns">
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
