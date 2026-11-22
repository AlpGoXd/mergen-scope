import { useEffect, useMemo } from 'react';
import { XAxis, YAxis } from 'recharts';
import { autoExportAxes, exportAxisTitle, exportTick, fitAxisTitle } from '../../domain/export-plot';
import { formatAdaptiveXAxisTickLabels, formatAdaptiveXAxisValue } from '../../domain/format';
import { makeNiceTicks, NICE_TICK_COUNT } from '../../domain/trace-math';
import type { Trace } from '../../types/trace';
import type { AxisInfo } from '../../types/units';
import type { ExportView } from './export/export-context';
import type { PlotView } from './LinesLayer';
import type { AxisScale } from '../../types/pane';
import { logTickLabel, logTicks } from '../../domain/chart/axis-scale';
import { angleAxisUnit, isDecibelGain, isLinearGain } from '../../domain/units';

interface ChartPaneAxesOptions {
  paneId: string;
  paneTraces: readonly Trace[];
  activePaneTrace: Trace | null;
  axisInfo: AxisInfo;
  xDomain: { min: number; max: number } | null;
  yDomain: [number, number] | ['auto', 'auto'];
  visibleXSpan: number;
  plotView: PlotView | null;
  labelRoom: number;
  yAxisWidth: number;
  formatYTick: (value: number) => string;
  hideXTicks: boolean;
  exportView: ExportView | undefined;
  xScale: AxisScale;
  yScale: AxisScale;
}

// Recharts reads direct XAxis and YAxis children before rendering them.
export function useChartPaneAxes({
  paneId, paneTraces, activePaneTrace, axisInfo, xDomain, yDomain, visibleXSpan, plotView,
  labelRoom, yAxisWidth, formatYTick, hideXTicks, exportView, xScale, yScale,
}: ChartPaneAxesOptions) {
  const isExport = exportView !== undefined;
  const appearance = exportView?.appearance;
  const xAxisLabelText = useMemo(() => {
    if (!activePaneTrace) return axisInfo.xLabel;
    const xUnit = activePaneTrace.units.x ? String(activePaneTrace.units.x) : (activePaneTrace.domain === 'time' ? 's' : 'Hz');
    const angle = angleAxisUnit(xUnit);
    if (angle) return `Angle (${angle})`;
    return activePaneTrace.domain === 'time' ? `Time (${xUnit})` : `Frequency (${xUnit})`;
  }, [activePaneTrace, axisInfo.xLabel]);

  const yAxisLabelText = useMemo(() => {
    if (!activePaneTrace) return axisInfo.yLabel;
    const yUnit = activePaneTrace.units.y ? String(activePaneTrace.units.y) : '';
    if (isDecibelGain(activePaneTrace.units.x, yUnit)) return `Gain (${yUnit})`;
    if (isLinearGain(activePaneTrace.units.x, yUnit)) return 'Gain (ratio)';
    const source = activePaneTrace.kind === 'raw' ? activePaneTrace.networkSource : undefined;
    if (source?.view === 'Phase') return `Phase (${yUnit || 'deg'})`;
    if (source?.family === 'S' && source?.view === 'dB') return `Magnitude (${yUnit || 'dB'})`;
    if (source?.view === 'Real') return `Real (${yUnit || 'linear'})`;
    if (source?.view === 'Imag') return `Imag (${yUnit || 'linear'})`;
    if (yUnit) return `Amplitude (${yUnit})`;
    if (activePaneTrace.kind === 'derived') return 'Amplitude (–)';
    return axisInfo.yLabel || 'Amplitude';
  }, [activePaneTrace, axisInfo.yLabel]);

  // Export render: report the drawn ranges and axis titles (Copy as LaTeX builds its axis from them).
  const exportOnPlot = exportView?.onPlot;
  const exportXUnit = activePaneTrace ? (activePaneTrace.units.x ? String(activePaneTrace.units.x) : activePaneTrace.domain === 'time' ? 's' : 'Hz') : null;

  const shortYLabel = yAxisLabelText.match(/\([^()]+\)\s*$/)?.[0] ?? yAxisLabelText.split(/\s+/)[0] ?? '';
  const fittedYLabel = yAxisLabelText.length * 7 <= labelRoom ? yAxisLabelText
    : shortYLabel.length * 7 <= labelRoom ? shortYLabel : '';

  const xTickValues = useMemo(() => xScale === 'log' && xDomain
    ? logTicks(xDomain).filter(tick => tick.label).map(tick => tick.value) : makeNiceTicks(xDomain, NICE_TICK_COUNT), [xDomain, xScale]);
  const yTickValues = useMemo(() => {
    if (Array.isArray(yDomain) && yDomain[0] !== 'auto') {
      const domain = { min: yDomain[0], max: Number(yDomain[1]) };
      return yScale === 'log' ? logTicks(domain).filter(tick => tick.label).map(tick => tick.value) : makeNiceTicks(domain, NICE_TICK_COUNT);
    }
    return undefined;
  }, [yDomain, yScale]);
  const xTickLabelMap = useMemo(() => {
    const ticks = xTickValues ?? [];
    const labels = formatAdaptiveXAxisTickLabels(ticks, visibleXSpan, {
      domain: activePaneTrace?.domain ?? 'frequency',
      unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz'),
    });
    return new Map(ticks.map((tick, index) => [tick, labels[index] ?? '--']));
  }, [activePaneTrace?.domain, activePaneTrace?.units.x, visibleXSpan, xTickValues]);
  const exportYTicks = useMemo(() => yScale === 'log' ? yTickValues : isExport && plotView?.y ? makeNiceTicks({ min: plotView.y[0], max: plotView.y[1] }, NICE_TICK_COUNT) : undefined, [isExport, plotView?.y, yScale, yTickValues]);
  const axes = useMemo(() => {
    if (!isExport || !plotView?.x || !plotView.y) return null;
    return autoExportAxes(paneTraces[0], plotView.x, plotView.y, xTickValues, exportYTicks, new Set(paneTraces.map(trace => trace.units.y)).size > 1);
  }, [isExport, plotView, paneTraces, xTickValues, exportYTicks]);
  const editedTitles = appearance?.axisTitles === 'edit' ? appearance.paneTitles[paneId] : undefined;
  const exportXTitle = axes ? exportAxisTitle(axes.x, appearance?.axisTitles ?? 'auto', editedTitles?.x) : xAxisLabelText;
  const exportYTitle = axes ? exportAxisTitle(axes.y, appearance?.axisTitles ?? 'auto', editedTitles?.y) : yAxisLabelText;
  useEffect(() => {
    if (!exportOnPlot || !plotView || !axes) return;
    const legacy = !appearance;
    exportOnPlot({
      x: plotView.x, y: plotView.y, xLabel: legacy ? xAxisLabelText : exportXTitle, xUnit: exportXUnit,
      yLabel: legacy ? yAxisLabelText : exportYTitle, autoX: axes.x, autoY: axes.y, xTicks: xTickValues, yTicks: exportYTicks, xScale, yScale,
    });
  }, [exportOnPlot, plotView, axes, appearance, exportXTitle, exportYTitle, exportXUnit, xAxisLabelText, yAxisLabelText, xTickValues, exportYTicks, xScale, yScale]);

  const xAxis = (
    <XAxis
      dataKey="fs"
      type="number"
      scale={xScale === 'log' ? 'log' : 'auto'}
      domain={xDomain ? [xDomain.min, xDomain.max] : ['dataMin', 'dataMax']}
      allowDataOverflow={!!xDomain}
      ticks={xTickValues}
      {...(hideXTicks ? { tick: false, height: 0 } : {})}
      stroke="var(--muted)"
      fontSize={'var(--font-label)'}
      tickSize={exportView?.tikzStyle ? -4 : undefined}
      tickMargin={exportView?.tikzStyle ? 12 : undefined}
      tickFormatter={(value) => xScale === 'log' ? logTickLabel(Number(value)) : appearance && axes ? exportTick(axes.x, Number(value)) : xTickLabelMap.get(Number(value)) ?? formatAdaptiveXAxisValue(Number(value), visibleXSpan, {
        domain: activePaneTrace?.domain ?? 'frequency',
        unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz'),
      })}
      label={hideXTicks || (appearance && !exportXTitle) ? undefined : { value: appearance ? exportXTitle : xAxisLabelText, position: 'insideBottom', offset: -5, style: { fontSize: 'var(--font-label)', fill: 'var(--muted)', textAnchor: 'middle' } }}
    />
  );
  const yAxis = (
    <YAxis
      scale={yScale === 'log' ? 'log' : 'auto'}
      domain={yDomain}
      allowDataOverflow={Array.isArray(yDomain) && yDomain[0] !== 'auto'}
      ticks={appearance ? exportYTicks ?? yTickValues : yTickValues}
      stroke="var(--muted)"
      tickSize={exportView?.tikzStyle ? -4 : undefined}
      tickMargin={exportView?.tikzStyle ? 12 : undefined}
      fontSize={'var(--font-label)'}
      width={yAxisWidth}
      tickFormatter={value => yScale === 'log' ? logTickLabel(Number(value)) : appearance && axes ? exportTick(axes.y, Number(value)) : formatYTick(value)}

      label={appearance && !exportYTitle ? undefined : { value: appearance ? fitAxisTitle(exportYTitle, labelRoom, (exportView?.labelPx ?? 12) * (exportView?.paper ? 0.5 : 0.58)) : fittedYLabel, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 'var(--font-label)', fill: 'var(--muted)', textAnchor: 'middle' } }}
    />
  );
  return { xAxis, yAxis };
}
