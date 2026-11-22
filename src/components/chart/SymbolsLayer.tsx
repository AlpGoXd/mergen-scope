import type { ChartScaleProps } from './LinesLayer';
import type { Trace } from '../../types/trace';
import type { SymbolSetting, Theme } from '../../domain/trace-palette';
import { forcesHollowTraceSymbol } from '../../domain/trace-colors';
import { useUiState } from '../../stores/ui-store';
import { DOT_RADIUS, planDotsAndSymbols } from '../../domain/dots-and-symbols';
import { TraceSymbol } from '../shared/TraceSymbol';
import { useTraceSymbols } from '../../hooks/use-trace-symbols';
import { useTraceColors } from '../../hooks/use-trace-colors';

/** `markScale` sizes symbols and dots for paper exports (1 on screen). */
export function SymbolsLayer({ traces, showDots, symbolSetting, markScale = 1, colorTheme, paperTone, xAxisMap, yAxisMap, offset }: ChartScaleProps & { traces: readonly Trace[]; showDots: boolean; symbolSetting?: SymbolSetting; markScale?: number; colorTheme?: Theme; paperTone?: boolean }) {
  const symbol = useTraceSymbols(symbolSetting);
  const { huePalette } = useUiState();
  const resolveTraceColor = useTraceColors(colorTheme, paperTone);
  const x = xAxisMap ? Object.values(xAxisMap)[0]?.scale : undefined;
  const y = yAxisMap ? Object.values(yAxisMap)[0]?.scale : undefined;
  if (!x || !y || !offset) return null;
  return <g pointerEvents="none">{traces.flatMap(trace => {
    const kind = symbol(trace.id);
    if (kind === null) return [];
    const points = trace.data.map(point => ({ x: x(point.freq), y: y(point.amp) })).map(point => point.x < offset.left || point.x > offset.left + offset.width ? { x: NaN, y: NaN } : point);
    const plan = planDotsAndSymbols({ points, showDots, showSymbols: true, forceHollow: forcesHollowTraceSymbol(trace.kind, huePalette) });
    const color = resolveTraceColor(trace);
    return [<g key={trace.id}>{plan.symbols.map((point, i) => <g key={i} data-testid="trace-symbol" data-trace={trace.name} data-sample-index={point.sampleIndex} transform={markScale === 1 ? `translate(${point.x} ${point.y})` : `translate(${point.x} ${point.y}) scale(${markScale})`}><TraceSymbol kind={kind} color={color} hollow={plan.hollow} /></g>)}{plan.dots.map(index => { const point = points[index]; return point ? <circle key={index} data-testid="sample-dot" data-trace={trace.name} data-sample-index={index} cx={point.x} cy={point.y} r={DOT_RADIUS * markScale} fill={color} stroke={color} /> : null; })}</g>];
  })}</g>;
}
