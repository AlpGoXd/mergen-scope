import type { AxisScale, ChartAxesSettings, YDomain } from '../../types/pane';
import type { DataPoint, Trace } from '../../types/trace';
import { formatEngineeringValue } from '../format';
import { makeNiceTicks, NICE_TICK_COUNT } from '../trace-math';
import { isLogUnit } from '../units';
import { mergePaneData } from '../pane-data';
import type { MergedPaneRow } from '../pane-data';

export function toAxisSpace(value: number, scale: AxisScale): number {
  return scale === 'log' ? Math.log10(value) : value;
}

export function fromAxisSpace(value: number, scale: AxisScale): number {
  return scale === 'log' ? 10 ** value : value;
}

export function mapAxisDomain(domain: YDomain, scale: AxisScale, unmap = false): YDomain {
  const map = unmap ? fromAxisSpace : toAxisSpace;
  return { min: map(domain.min, scale), max: map(domain.max, scale) };
}

export function isPhase(trace: Trace): boolean {
  return (trace.kind === 'raw' && trace.networkSource?.view === 'Phase')
    || /^(?:°|deg(?:rees?)?|rad(?:ians?)?)$/i.test(trace.units.y?.trim() ?? '');
}

export function logXReason(traces: readonly Trace[]): string | undefined {
  return traces.some(trace => trace.data.some(point => point.freq <= 0)) ? 'X has values ≤ 0' : undefined;
}

export function logYReason(traces: readonly Trace[]): string | undefined {
  for (const trace of traces) {
    const unit = trace.units.y?.trim() ?? '';
    if (isLogUnit(unit) || /^db/i.test(unit)) return 'dB is already logarithmic';
    if (isPhase(trace)) return "Phase can't be shown on a log axis";
    if (trace.parameters?.['metric'] === 'group-delay' || (trace.kind === 'raw' && /group.?delay/i.test(trace.networkSource?.metric ?? trace.networkSource?.view ?? ''))) {
      return "Group delay can't be shown on a log axis";
    }
    if (!unit && !(trace.kind === 'raw' && trace.networkSource?.view === 'Mag')) return 'Y needs a linear unit';
  }
  return undefined;
}

export function suggestLog(domain: YDomain | null): boolean {
  return !!domain && domain.min > 0 && domain.max / domain.min >= 1000;
}

export function positiveDomain(min: number, max: number): YDomain | null {
  if (!(min > 0) || !Number.isFinite(max) || max < min) return null;
  return min === max ? { min: min / Math.sqrt(10), max: max * Math.sqrt(10) } : { min, max };
}

export function unwrapPhase(data: readonly DataPoint[], period = 360): DataPoint[] {
  let previous: number | undefined;
  let offset = 0;
  return data.map(point => {
    if (previous !== undefined) {
      const jump = point.amp - previous;
      if (Math.abs(jump) > period / 2) offset -= Math.sign(jump) * Math.ceil((Math.abs(jump) - period / 2) / period) * period;
    }
    previous = point.amp;
    return { ...point, amp: point.amp + offset };
  });
}

export function logSample(point: DataPoint, x: AxisScale, y: AxisScale): boolean {
  return (x !== 'log' || point.freq > 0) && (y !== 'log' || point.amp > 0);
}

export function chartAxisData(traces: Trace[], settings: ChartAxesSettings, range: { left: number; right: number } | null) {
  const displayTraces = settings.phase === 'wrapped' ? traces : traces.map(trace => isPhase(trace) ? {
    ...trace,
    data: unwrapPhase(trace.data, /^rad/i.test(trace.units.y ?? '') ? 2 * Math.PI : 360),
  } : trace);
  const byTrace = new Map<string, MergedPaneRow[]>();
  let min = Infinity;
  let max = -Infinity;
  let omitted = 0;
  if (settings.y === 'log') for (const trace of displayTraces) {
    const rows = mergePaneData([trace], range, false);
    for (const row of rows) {
      const value = row[trace.name];
      if (value !== undefined && value > 0) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      } else {
        delete row[trace.name];
      }
    }
    omitted += trace.data.filter(point => (!range || point.freq >= range.left && point.freq <= range.right) && !logSample(point, settings.x, settings.y)).length;
    byTrace.set(trace.name, rows);
  }
  return { displayTraces, byTrace, omitted, logYFit: positiveDomain(min, max) ?? { min: 1, max: 10 } };
}

export interface LogTick {
  readonly value: number;
  readonly major: boolean;
  readonly label: boolean;
}

export function logTicks(domain: YDomain): LogTick[] {
  const lo = Math.log10(domain.min);
  const hi = Math.log10(domain.max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];
  if (hi - lo < 1) {
    return (makeNiceTicks(domain, NICE_TICK_COUNT) ?? []).filter(value => value >= domain.min && value <= domain.max)
      .map(value => ({ value, major: true, label: true }));
  }
  const ticks: LogTick[] = [];
  for (let exponent = Math.floor(lo); exponent <= Math.floor(hi); exponent += 1) {
    for (let digit = 1; digit < 10; digit += 1) {
      const value = digit * 10 ** exponent;
      if (value < domain.min || value > domain.max || value <= 0) continue;
      ticks.push({ value, major: digit === 1, label: digit === 1 || (hi - lo < 2 && (digit === 2 || digit === 5)) });
    }
  }
  return ticks;
}

export function logTickLabel(value: number): string {
  return value < 1e-12 || value >= 1e15 ? value.toExponential(2) : formatEngineeringValue(value, '', 4).trim().replace(' ', '');
}
