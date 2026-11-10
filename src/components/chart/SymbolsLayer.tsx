import type { ChartScaleProps } from './LinesLayer';
import type { Trace } from '../../types/trace';
import { planDotsAndSymbols } from '../../domain/dots-and-symbols';
import { TraceSymbol } from '../shared/TraceSymbol';
import { useTraceSymbols } from '../../hooks/use-trace-symbols';
import { useTraceColors } from '../../hooks/use-trace-colors';

export function SymbolsLayer({ traces, showDots, xAxisMap, yAxisMap, offset }: ChartScaleProps & { traces: readonly Trace[]; showDots: boolean }) {
  const symbol = useTraceSymbols();
  const resolveTraceColor = useTraceColors();
  const x = xAxisMap ? Object.values(xAxisMap)[0]?.scale : undefined;
  const y = yAxisMap ? Object.values(yAxisMap)[0]?.scale : undefined;
  if (!x || !y || !offset) return null;
  return <g pointerEvents="none">{traces.flatMap(trace => {
    const kind = symbol(trace.id);
    if (kind === null) return [];
    const points = trace.data.map(point => ({ x: x(point.freq), y: y(point.amp) })).map(point => point.x < offset.left || point.x > offset.left + offset.width ? { x: NaN, y: NaN } : point);
    const plan = planDotsAndSymbols({ points, showDots, showSymbols: true });
    const color = resolveTraceColor(trace);
    return [<g key={trace.id}>{plan.dots.map(index => { const point = points[index]; return point ? <circle key={index} data-testid="sample-dot" data-trace={trace.name} data-sample-index={index} cx={point.x} cy={point.y} r={2} fill={color} stroke={color} /> : null; })}{plan.symbols.map((point, i) => <g key={i} data-testid="trace-symbol" data-trace={trace.name} data-sample-index={point.sampleIndex} transform={`translate(${point.x} ${point.y})`}><TraceSymbol kind={kind} color={color} /></g>)}</g>];
  })}</g>;
}
