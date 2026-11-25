import { useMemo } from 'react';
import type { ComponentRef, ReactElement, RefObject } from 'react';
import {
  CartesianGrid, Customized, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from 'recharts';
import { sampleDotsVisible, visibleSampleCount } from '../../domain/dots-and-symbols';
import { PAPER_LINE_PT, ptToCssPx } from '../../domain/export-image';
import { formatAdaptiveXAxisValue, formatScalarWithUnit } from '../../domain/format';
import type { MergedPaneRow } from '../../domain/pane-data';
import { computeHorizontalIntersections, computeVerticalIntersections } from '../../domain/ref-lines';
import { traceWidth } from '../../domain/trace-palette';
import { placeMarker } from '../../domain/markers';
import { isEnvelopeTrace } from '../../domain/trace-model';
import type { TraceColorAssignment } from '../../domain/trace-palette';
import type { AnalysisOverlay } from '../../hooks/use-analysis-overlays';
import type { useTraceSymbols } from '../../hooks/use-trace-symbols';
import type { Marker } from '../../types/marker';
import type { ChartAxesSettings, PaneSettings } from '../../types/pane';
import type { RefLine } from '../../types/ref-line';
import type { ThemeColors } from '../../types/theme';
import type { Trace } from '../../types/trace';
import type { AxisInfo } from '../../types/units';
import { ExportFrame } from './export/ExportFrame';
import type { ExportView } from './export/export-context';
import { CrossingsLayer, LinesLayer, LogGrid } from './LinesLayer';
import type { LinesLayerProps, PlotView } from './LinesLayer';
import { OverlaysLayer } from './OverlaysLayer';
import { MeasuredSampleDot, SymbolsLayer } from './SymbolsLayer';

export interface ChartMouseEvent {
  readonly activeLabel?: number | string;
  readonly activePayload?: ReadonlyArray<{ readonly value?: number }>;
  readonly xValue?: number;
  readonly chartX?: number;
  readonly chartY?: number;
  readonly nativeEvent?: { readonly clientX?: number; readonly clientY?: number };
  readonly offset?: { readonly left?: number; readonly width?: number };
  readonly xAxisMap?: Record<string, unknown>;
  readonly yAxisMap?: Record<string, unknown>;
}

interface ChartPanePlotProps {
  paneId: string;
  plotData: MergedPaneRow[];
  plotView: PlotView | null;
  lineChartRef: RefObject<ComponentRef<typeof LineChart> | null>;
  mouseEvents: {
    onMouseDown: (event: ChartMouseEvent | undefined) => void;
    onMouseMove: (event: ChartMouseEvent | undefined) => void;
    onMouseLeave: () => void;
    onMouseUp: () => void;
  };
  settings: PaneSettings;
  axisSettings: ChartAxesSettings;
  displayTraces: Trace[];
  logRows: ReadonlyMap<string, MergedPaneRow[]>;
  exportView: ExportView | undefined;
  axisInfo: AxisInfo;
  xAxis: ReactElement;
  yAxis: ReactElement;
  paneTraces: Trace[];
  activePaneTrace: Trace | null;
  visibleXSpan: number;
  resolveTraceColor: (name: string) => string;
  traceSymbol: ReturnType<typeof useTraceSymbols>;
  colorAssignments: ReadonlyMap<string, TraceColorAssignment>;
  crosshairX: number | null;
  ghostCrosshairX: number | null;
  paneMarkers: readonly { marker: Marker; index: number }[];
  selectedMkrIdx: number;
  linesLayer: LinesLayerProps;
  overlays: readonly AnalysisOverlay[];
  paneRefLines: readonly RefLine[];
  vDeltaPairs: readonly [RefLine, RefLine][];
  hDeltaPairs: readonly [RefLine, RefLine][];
  colors: ThemeColors | null;
  dragStart: number | null;
  dragCurrent: number | null;
  dragBoxY: readonly [number, number] | null;
}

/** Non-color glyph shape per marker type (normal = circle, delta = diamond, peak = triangle). */
function markerGlyphPolygonPoints(type: 'normal' | 'delta' | 'peak', cx: number, cy: number, r: number): string | null {
  if (type === 'delta') {
    return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  }
  if (type === 'peak') {
    const h = r * 1.15;
    return `${cx},${cy - h} ${cx + r},${cy + h * 0.6} ${cx - r},${cy + h * 0.6}`;
  }
  return null;
}

export function ChartPanePlot({
  paneId, plotData, plotView, lineChartRef, mouseEvents, settings, exportView, axisInfo, xAxis, yAxis,
  paneTraces, activePaneTrace, visibleXSpan, resolveTraceColor, traceSymbol, colorAssignments,
  crosshairX, ghostCrosshairX, paneMarkers, selectedMkrIdx, linesLayer, overlays, paneRefLines,
  vDeltaPairs, hDeltaPairs, colors, dragStart, dragCurrent, dragBoxY, axisSettings, displayTraces, logRows,
}: ChartPanePlotProps) {
  const isExport = exportView !== undefined;
  const appearance = exportView?.appearance;
  const logX = axisSettings.x === 'log', logY = axisSettings.y === 'log';
  // Each crossing scans the whole trace. A hover redraws this chart on every mouse move, so only recompute when the lines or traces change.
  const crossingPoints = useMemo(() => !settings.showReferenceLines ? [] : paneRefLines.flatMap((line) => {
    const intersections = line.type === 'v'
      ? computeVerticalIntersections(line.value, paneTraces, paneId)
      : computeHorizontalIntersections(line.value, paneTraces, paneId);
    return intersections.map((ix, i) => ({ key: `rl-${line.id}-ix-${i}`, x: ix.freq, y: ix.amp, color: resolveTraceColor(ix.traceName) }));
  }), [settings.showReferenceLines, paneRefLines, paneTraces, paneId, resolveTraceColor]);
  const lineChart = (
    <LineChart
      ref={lineChartRef}
      data={plotData}
      margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
      {...(exportView ? { width: exportView.width, height: exportView.height } : mouseEvents)}
    >
      {settings.gridMajor && (
        <CartesianGrid
          stroke="var(--grid)"
          strokeOpacity={settings.gridMajorOpacity}
          strokeWidth={settings.gridMajorThickness}
          strokeDasharray={settings.gridDashStyle === 'solid' ? undefined : settings.gridDashStyle}
          horizontal={!logY}
          vertical={!logX}
        />
      )}
      {settings.gridMajor && (logX || logY) && <Customized component={<LogGrid x={logX} y={logY} />} />}
      {xAxis}
      {yAxis}
      <Tooltip isAnimationActive={false} cursor={false} content={() => null} />
      {displayTraces.map((trace) => (
        <Line key={trace.name} className={trace.kind === 'derived' ? 'trace-created' : 'trace-source'} type="linear" dataKey={trace.name} name={trace.dn || trace.name} stroke={resolveTraceColor(trace.name)}
          data={logRows.get(trace.name)}
          dot={settings.showSampleDots && !isEnvelopeTrace(trace) && traceSymbol(trace.id) === null && plotView
            && sampleDotsVisible(visibleSampleCount(trace.data, plotView.x), plotView.plot.width)
            ? <MeasuredSampleDot data={trace.data} /> : false} activeDot={false} isAnimationActive={false} connectNulls={!logRows.has(trace.name)} strokeWidth={exportView?.paper ? ptToCssPx(appearance?.paperLine ?? PAPER_LINE_PT) : colorAssignments.get(trace.id) ? traceWidth(colorAssignments.get(trace.id) as NonNullable<ReturnType<typeof colorAssignments.get>>) : 1.5} />
      ))}
      {crosshairX != null && <ReferenceLine x={crosshairX} stroke="color-mix(in oklch, var(--accent) 60%, var(--plot))" strokeDasharray="4 4" strokeWidth={1} />}
      {ghostCrosshairX != null && <ReferenceLine className="x-ghost-crosshair" x={ghostCrosshairX} stroke="color-mix(in oklch, var(--accent) 60%, var(--plot))" strokeDasharray="4 4" strokeWidth={1} />}
      {settings.showMarkers && paneMarkers.map(({ marker, index }) => {
        const trace = axisSettings.phase === 'unwrapped' ? displayTraces.find(trace => trace.name === marker.trace) : undefined;
        const amplitude = trace ? placeMarker(trace, marker.freq).amp : marker.amp;
        if (!Number.isFinite(amplitude) || (logY && !(amplitude > 0)) || (logX && !(marker.freq > 0))) return null;
        const color = resolveTraceColor(marker.trace || '');
        const isSelected = !isExport && index === selectedMkrIdx;
        const labelPrefix = marker.type === 'delta' ? `DM${index + 1}` : `M${index + 1}`;
        const labelText = `${labelPrefix} ${formatAdaptiveXAxisValue(marker.freq, visibleXSpan, {
          domain: activePaneTrace?.domain ?? 'frequency',
          unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz'),
        })}${marker.interpolated ? ' (interp)' : ''}`;
        return (
          <ReferenceDot
            key={`m-${index}`}
            x={marker.freq}
            y={amplitude}
            r={7}
            isFront
            shape={(dotProps: { readonly cx?: number; readonly cy?: number }) => {
              const cx = Number(dotProps.cx);
              const cy = Number(dotProps.cy);
              if (!Number.isFinite(cx) || !Number.isFinite(cy)) return <g />;
              const roundedCx = Math.round(cx);
              const roundedCy = Math.round(cy);
              // Compute label y-offset: above by default, nudge down if near top
              // Screen: 11 px mono tags and today's glyph. Paper exports scale both with the 8 pt text.
              const tagPx = exportView?.tagPx ?? 11;
              const tagScale = tagPx / 11;
              const glyphScale = exportView?.markScale ?? 1;
              const paperTag = !!appearance && !!exportView?.paper;
              const stagger = paperTag && index % 2 === 1 ? tagPx : 0;
              const tagBelow = roundedCy < (30 + stagger) * tagScale;
              const labelYOffset = tagBelow ? 18 * tagScale + stagger : -14 * tagScale - stagger;
              // Paper tags are serif: narrower glyphs and a box that hugs the 7.5 pt text.
              const charWidth = exportView?.paper ? tagPx * 0.46 : 6.5 * tagScale;
              const pillPadX = exportView?.paper ? tagPx * 0.35 : 5 * tagScale;
              const pillPadY = exportView?.paper ? tagPx * 0.15 : 3 * tagScale;
              const textWidth = labelText.length * charWidth;
              const pillW = textWidth + pillPadX * 2;
              const pillH = (exportView?.paper ? tagPx * 1.2 : 13 * tagScale) + pillPadY * 2;
              const pillX = roundedCx - pillW / 2;
              const pillY = roundedCy + labelYOffset - pillH + pillPadY;
              return (
                <g>
                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      cx={roundedCx} cy={roundedCy} r={9}
                      fill="none"
                      stroke={color} strokeWidth={2}
                      strokeDasharray="3 2"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.85}
                    />
                  )}
                  {/* Bullseye glyph: colored fill → white ring → black outline.
                      Shape encodes marker type (circle/diamond/triangle) as a non-color cue. */}
                  {(() => {
                    const fillPts = markerGlyphPolygonPoints(marker.type, roundedCx, roundedCy, 5 * glyphScale);
                    const outlinePts = markerGlyphPolygonPoints(marker.type, roundedCx, roundedCy, 6.5 * glyphScale);
                    const Fill = fillPts
                      ? <polygon points={fillPts} fill={color} stroke="white" strokeWidth={1.5 * glyphScale} strokeLinejoin="round" paintOrder="stroke" shapeRendering="geometricPrecision" />
                      : <circle cx={roundedCx} cy={roundedCy} r={5 * glyphScale} fill={color} stroke="white" strokeWidth={1.5 * glyphScale} vectorEffect="non-scaling-stroke" paintOrder="stroke" shapeRendering="geometricPrecision" />;
                    const Outline = outlinePts
                      ? <polygon points={outlinePts} fill="none" stroke="#222" strokeWidth={glyphScale} strokeLinejoin="round" shapeRendering="geometricPrecision" />
                      : <circle cx={roundedCx} cy={roundedCy} r={6.5 * glyphScale} fill="none" stroke="#222" strokeWidth={glyphScale} vectorEffect="non-scaling-stroke" shapeRendering="geometricPrecision" />;
                    return <>{Fill}{Outline}</>;
                  })()}
                  {/* Label pill (gated by showMarkerLabels) */}
                  {settings.showMarkerLabels && (
                    <>
                      {!paperTag && <rect
                        x={pillX} y={pillY}
                        width={pillW} height={pillH}
                        rx={4} ry={4}
                        fill="var(--tipBg)"
                        fillOpacity={0.9}
                        stroke="var(--tipBd)"
                        strokeWidth={1}
                      />}
                      <line
                        data-paper-marker-leader={paperTag ? '' : undefined}
                        x1={roundedCx} y1={pillY + pillH}
                        x2={roundedCx} y2={roundedCy + (paperTag && tagBelow ? 7 : -7) * glyphScale}
                        stroke="var(--muted)" strokeOpacity={0.6} strokeWidth={1}
                      />
                      <text
                        data-paper-marker-label={paperTag ? '' : undefined}
                        data-anchor-x={paperTag ? roundedCx : undefined}
                        data-anchor-y={paperTag ? roundedCy : undefined}
                        x={roundedCx} y={pillY + pillH - pillPadY - 1}
                        textAnchor="middle"
                        fontSize={tagPx}
                        fontFamily="var(--font-mono, monospace)"
                        fill="var(--text)"
                        style={{ userSelect: 'none' }}
                      >
                        {labelText}
                      </text>
                    </>
                  )}
                </g>
              );
            }}
          />
        );
      })}
      <Customized component={<LinesLayer {...linesLayer} />} />
      <Customized component={<OverlaysLayer overlays={overlays} />} />
      <Customized component={<SymbolsLayer traces={displayTraces} showDots={settings.showSampleDots} symbolSetting={isExport ? 'always' : undefined} markScale={exportView?.markScale} colorTheme={exportView?.colorTheme} paperTone={exportView?.paperTone} />} />
      {/* ΔX between V-line delta pairs */}
      {settings.showReferenceLines && vDeltaPairs.map(([a, b]) => {
        const lo = Math.min(a.value, b.value);
        const hi = Math.max(a.value, b.value);
        const delta = hi - lo;
        const deltaText = `ΔX = ${formatAdaptiveXAxisValue(delta, delta, { domain: axisInfo.axisDomain, unit: axisInfo.axisDomain === 'time' ? 's' : 'Hz' })}`;
        const dColor = colors?.refV ?? '#d48a2b';
        return (
          <ReferenceArea key={`vd-${a.id}-${b.id}`} x1={lo} x2={hi} fill={dColor} fillOpacity={0.06} strokeOpacity={0}
            label={(props: { viewBox?: { x: number; y: number; width: number; height: number } }) => {
              const vb = props.viewBox;
              if (!vb || vb.width < 20) return <></>;
              const cx = vb.x + vb.width / 2;
              const ty = vb.y + 13;
              const tw = deltaText.length * 6.3;
              return (
                <g>
                  <rect x={cx - tw / 2 - 4} y={ty - 11} width={tw + 8} height={14} rx={3}
                    fill="var(--card)" fillOpacity={0.88} />
                  <text x={cx} y={ty} textAnchor="middle" fill={dColor}
                    fontSize={10} fontFamily="var(--font-mono, monospace)">
                    {deltaText}
                  </text>
                </g>
              );
            }} />
        );
      })}
      {/* ΔY between H-line delta pairs */}
      {settings.showReferenceLines && hDeltaPairs.map(([a, b]) => {
        const lo = Math.min(a.value, b.value);
        const hi = Math.max(a.value, b.value);
        const delta = hi - lo;
        const deltaText = `ΔY = ${formatScalarWithUnit(delta, axisInfo.yUnit, { digits: 3 })}`;
        const dColor = colors?.refH ?? '#2b9ab7';
        return (
          <ReferenceArea key={`hd-${a.id}-${b.id}`} y1={lo} y2={hi} fill={dColor} fillOpacity={0.06} strokeOpacity={0}
            label={(props: { viewBox?: { x: number; y: number; width: number; height: number } }) => {
              const vb = props.viewBox;
              if (!vb || vb.height < 14) return <></>;
              const rx = vb.x + vb.width - 4;
              const cy = vb.y + vb.height / 2;
              const tw = deltaText.length * 6.3;
              return (
                <g>
                  <rect x={rx - tw - 4} y={cy - 10} width={tw + 8} height={14} rx={3}
                    fill="var(--card)" fillOpacity={0.88} />
                  <text x={rx - 2} y={cy} textAnchor="end" fill={dColor}
                    fontSize={10} fontFamily="var(--font-mono, monospace)">
                    {deltaText}
                  </text>
                </g>
              );
            }} />
        );
      })}
      {settings.showReferenceLines && (
        <Customized component={<CrossingsLayer points={crossingPoints} />} />
      )}
      {/* Zoom indicators ignore the pointer: on Linux and macOS contextmenu fires while the right button is down, and it must reach the line label underneath. */}
      {dragStart !== null && dragCurrent !== null && dragBoxY !== null && dragStart !== dragCurrent && (
        <ReferenceArea
          x1={Math.min(dragStart, dragCurrent)}
          x2={Math.max(dragStart, dragCurrent)}
          y1={Math.min(dragBoxY[0], dragBoxY[1])}
          y2={Math.max(dragBoxY[0], dragBoxY[1])}
          ifOverflow="hidden"
          shape={(props: { x?: number; y?: number; width?: number; height?: number }) => {
            const x = Number(props.x), y = Number(props.y), w = Number(props.width), h = Number(props.height);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return <g />;
            return (
              <rect
                data-testid="chart-zoom-box"
                x={w < 0 ? x + w : x}
                y={h < 0 ? y + h : y}
                width={Math.abs(w)}
                height={Math.abs(h)}
                fill="var(--accent)"
                fillOpacity={0.14}
                stroke="var(--accent)"
                strokeWidth={1.25}
                strokeDasharray="4 2"
                pointerEvents="none"
              />
            );
          }}
        />
      )}
      {dragStart !== null && dragCurrent !== null && dragBoxY === null && <ReferenceLine x={dragStart} stroke="var(--accent)" strokeWidth={1} pointerEvents="none" />}
      {dragStart !== null && dragCurrent !== null && dragBoxY === null && <ReferenceLine x={dragCurrent} stroke="var(--accent)" strokeWidth={1} pointerEvents="none" />}
      {!logY && <ReferenceLine y={0} stroke="var(--dim)" strokeWidth={0.5} />}
      {exportView?.print && <Customized component={<ExportFrame />} />}
    </LineChart>
  );
  return exportView ? lineChart : <ResponsiveContainer width="100%" height="100%">{lineChart}</ResponsiveContainer>;
}
