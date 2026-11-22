// Draws one pane's copies of the reference lines with the Lines kit's ChartLine, inside the Recharts plot (Customized layer).
// Wiring only: pixel positions come from the chart's own scales; look and feel are the kit's.
import { useEffect, useRef } from 'react';
import type { MouseEvent, ReactElement } from 'react';
import '../left-panel/left-panel.css';
import '../lines/lines.css';
import { ChartLine, CrossingDot } from '../lines/Lines';
import { oklchHue } from '../../domain/color-hue';
import type { RefLine } from '../../types/ref-line';
import { logTicks } from '../../domain/chart/axis-scale';

type AxisScale = ((value: number) => number) & { domain?: () => unknown[] };
interface AxisEntry { scale?: AxisScale }
export interface ChartScaleProps {
  xAxisMap?: Record<string, AxisEntry>;
  yAxisMap?: Record<string, AxisEntry>;
  offset?: { left: number; top: number; width: number; height: number };
}

export interface PlotView {
  plot: { left: number; top: number; width: number; height: number };
  /** The scales' real domains in axis units (null when unknown). */
  x: readonly [number, number] | null;
  y: readonly [number, number] | null;
}

export interface LinesLayerProps extends ChartScaleProps {
  /** Reports the plot rectangle and the real domains whenever they change. */
  onView?: (view: PlotView) => void;
  lines: readonly RefLine[];
  /** The one hovered-or-selected line id: every copy of it is lit. */
  litId: number | null;
  selectedId: number | null;
  onHover: (id: number | null) => void;
  onContextMenu: (line: RefLine, event: MouseEvent<SVGGElement>) => void;
  onLabelClick: (line: RefLine) => void;
}

function firstScale(map: Record<string, AxisEntry> | undefined): AxisScale | null {
  const entry = map ? Object.values(map)[0] : undefined;
  return entry?.scale ?? null;
}

function domainOf(scale: AxisScale | null): readonly [number, number] | null {
  const d = scale?.domain?.();
  const lo = Number(d?.[0]), hi = Number(d?.[1]);
  return d && d.length >= 2 && Number.isFinite(lo) && Number.isFinite(hi) ? [Math.min(lo, hi), Math.max(lo, hi)] : null;
}

export function LogGrid({ x, y, xAxisMap, yAxisMap, offset }: ChartScaleProps & { x: boolean; y: boolean }) {
  if (!offset) return null;
  const { left, top, width, height } = offset;
  return <g className="chart-log-grid" stroke="var(--border)" pointerEvents="none">
    {([['x', x, xAxisMap], ['y', y, yAxisMap]] as const).flatMap(([axis, enabled, axisMap]) => {
      const scale = firstScale(axisMap);
      const domain = domainOf(scale);
      if (!enabled || !scale || !domain) return [];
      return logTicks({ min: domain[0], max: domain[1] }).map(tick => {
        const at = scale(tick.value);
        return <line key={`${axis}-${tick.value}`} data-decade={tick.major || undefined}
          x1={axis === 'x' ? at : left} x2={axis === 'x' ? at : left + width}
          y1={axis === 'y' ? at : top} y2={axis === 'y' ? at : top + height}
          strokeDasharray={tick.major ? '3 3' : undefined} opacity={tick.major ? 1 : 0.45} />;
      });
    })}
  </g>;
}

export function LinesLayer(p: LinesLayerProps): ReactElement | null {
  const xScale = firstScale(p.xAxisMap), yScale = firstScale(p.yAxisMap);
  const plot = p.offset;
  const xd = domainOf(xScale), yd = domainOf(yScale);
  const onView = useRef(p.onView);
  onView.current = p.onView;
  const plotLeft = plot?.left, plotTop = plot?.top, plotWidth = plot?.width, plotHeight = plot?.height;
  const [x0, x1, y0, y1] = [xd?.[0], xd?.[1], yd?.[0], yd?.[1]];
  useEffect(() => {
    if (plotLeft === undefined || plotTop === undefined || plotWidth === undefined || plotHeight === undefined) return;
    onView.current?.({
      plot: { left: plotLeft, top: plotTop, width: plotWidth, height: plotHeight },
      x: x0 !== undefined && x1 !== undefined ? [x0, x1] : null,
      y: y0 !== undefined && y1 !== undefined ? [y0, y1] : null,
    });
  }, [plotLeft, plotTop, plotWidth, plotHeight, x0, x1, y0, y1]);
  if (!plot || !xScale || !yScale) return null;
  const inside = (value: number, lo: number, size: number): boolean => Number.isFinite(value) && value >= lo - 0.5 && value <= lo + size + 0.5;
  return (
    <g className="ln-layer" data-testid="lines-layer" data-plot={`${plot.left},${plot.top},${plot.width},${plot.height}`} data-x-domain={xd ? `${xd[0]},${xd[1]}` : undefined} data-y-domain={yd ? `${yd[0]},${yd[1]}` : undefined}>
      {p.lines.map((line) => {
        const at = line.type === 'v' ? xScale(line.value) : yScale(line.value);
        // Outside the visible range the pane shows an edge tag instead of a line.
        if (line.type === 'v' ? !inside(at, plot.left, plot.width) : !inside(at, plot.top, plot.height)) return null;
        return (
          <ChartLine key={line.id} kind={line.type} at={at} plot={plot} label={line.label ?? (line.type === 'v' ? 'V' : 'H')}
            paneCount={line.paneIds.length} lit={p.litId === line.id} selected={p.selectedId === line.id}
            onHover={(hovering) => p.onHover(hovering ? line.id : null)}
            onContextMenu={(event) => p.onContextMenu(line, event)}
            onLabelClick={() => p.onLabelClick(line)} />
        );
      })}
    </g>
  );
}

export interface CrossingPoint { key: string; x: number; y: number; color: string }

/** Hollow crossing dots (kit CrossingDot) where a line meets a trace, in the trace's hue. */
export function CrossingsLayer(p: ChartScaleProps & { points: readonly CrossingPoint[] }): ReactElement | null {
  const xScale = firstScale(p.xAxisMap), yScale = firstScale(p.yAxisMap);
  const plot = p.offset;
  if (!plot || !xScale || !yScale) return null;
  return (
    <g className="ln-crossings" data-testid="crossings-layer">
      {p.points.map((point) => {
        const x = xScale(point.x), y = yScale(point.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < plot.left - 1 || x > plot.left + plot.width + 1 || y < plot.top - 1 || y > plot.top + plot.height + 1) return null;
        return <CrossingDot key={point.key} x={x} y={y} hue={oklchHue(point.color) ?? 270} />;
      })}
    </g>
  );
}
