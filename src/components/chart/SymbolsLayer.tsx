import { useMemo } from 'react';
import { Dot } from 'recharts';
import type { ChartScaleProps } from './LinesLayer';
import type { DataPoint, Trace } from '../../types/trace';
import type { SymbolSetting, Theme, TraceSymbol as SymbolKind } from '../../domain/trace-palette';
import { forcesHollowTraceSymbol } from '../../domain/trace-colors';
import { useUiState } from '../../stores/ui-store';
import { DOT_RADIUS, planDotsAndSymbols, sampleDotsVisible, visibleSampleCount } from '../../domain/dots-and-symbols';
import { decimateMinMax, traceBound } from '../../domain/trace-math';
import { isEnvelopeTrace } from '../../domain/trace-model';
import { TraceSymbol } from '../shared/TraceSymbol';
import { useTraceSymbols } from '../../hooks/use-trace-symbols';
import { useTraceColors } from '../../hooks/use-trace-colors';

/** Recharts also supplies interpolated zoom-edge rows, which have no measured sample dot. */
export function MeasuredSampleDot({ data, cx, cy, payload, stroke, strokeWidth }: { data: readonly DataPoint[]; cx?: number; cy?: number; payload?: { fs: number }; stroke?: string; strokeWidth?: number }) {
  const freq = payload?.fs;
  if (freq === undefined || data[traceBound(data, freq)]?.freq !== freq) return null;
  return <Dot className="recharts-line-dot" cx={cx} cy={cy} r={DOT_RADIUS} fill={stroke} stroke={stroke} strokeWidth={strokeWidth} />;
}

function TraceMarks({ trace, kind, color, markScale, showDots, forceHollow, x, y, range, plot }: {
  trace: Trace;
  kind: SymbolKind;
  color: string;
  markScale: number;
  showDots: boolean;
  forceHollow: boolean;
  x: (value: number) => number;
  y: (value: number) => number;
  range: readonly [number, number];
  plot: NonNullable<ChartScaleProps['offset']>;
}) {
  const [left, right] = range;
  const { width } = plot;
  // One bucket per pixel. Below two samples per bucket this keeps every point in view and one on each side.
  const samples = useMemo(() => decimateMinMax(trace.data, left, right, width), [trace.data, left, right, width]);
  const dotsVisible = showDots && !isEnvelopeTrace(trace) && sampleDotsVisible(visibleSampleCount(trace.data, range), width);
  const points = samples.map(point => {
    const px = x(point.freq);
    return px < plot.left || px > plot.left + width ? { x: NaN, y: NaN } : { x: px, y: y(point.amp) };
  });
  const plan = planDotsAndSymbols({ points, showDots: dotsVisible, showSymbols: true, forceHollow });
  const sampleIndex = (index: number) => {
    const sample = samples[index];
    return sample && traceBound(trace.data, sample.freq);
  };
  return <g>
    {plan.symbols.map((point, i) => <g key={i} data-testid="trace-symbol" data-trace={trace.name} data-sample-index={sampleIndex(point.sampleIndex)} transform={markScale === 1 ? `translate(${point.x} ${point.y})` : `translate(${point.x} ${point.y}) scale(${markScale})`}><TraceSymbol kind={kind} color={color} hollow={plan.hollow} /></g>)}
    {plan.dots.map(index => {
      const point = points[index];
      return point ? <circle key={index} data-testid="sample-dot" data-trace={trace.name} data-sample-index={sampleIndex(index)} cx={point.x} cy={point.y} r={DOT_RADIUS * markScale} fill={color} stroke={color} /> : null;
    })}
  </g>;
}

/** `markScale` sizes symbols and dots for paper exports (1 on screen). */
export function SymbolsLayer({ traces, showDots, symbolSetting, markScale = 1, colorTheme, paperTone, xAxisMap, yAxisMap, offset }: ChartScaleProps & { traces: readonly Trace[]; showDots: boolean; symbolSetting?: SymbolSetting; markScale?: number; colorTheme?: Theme; paperTone?: boolean }) {
  const symbol = useTraceSymbols(symbolSetting);
  const { huePalette } = useUiState();
  const resolveTraceColor = useTraceColors(colorTheme, paperTone);
  const x = xAxisMap ? Object.values(xAxisMap)[0]?.scale : undefined;
  const y = yAxisMap ? Object.values(yAxisMap)[0]?.scale : undefined;
  const domain = x?.domain?.();
  const first = Number(domain?.[0]), last = Number(domain?.[1]);
  if (!x || !y || !offset || !Number.isFinite(first) || !Number.isFinite(last)) return null;
  const range = [Math.min(first, last), Math.max(first, last)] as const;
  return <g pointerEvents="none">{traces.flatMap(trace => {
    const kind = symbol(trace.id);
    return kind === null ? [] : [<TraceMarks key={trace.id} trace={trace} kind={kind} color={resolveTraceColor(trace)}
      markScale={markScale} showDots={showDots} forceHollow={forcesHollowTraceSymbol(trace.kind, huePalette)}
      x={x} y={y} range={range} plot={offset} />];
  })}</g>;
}
