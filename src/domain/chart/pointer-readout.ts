import type { Trace } from '../../types/trace';
import { formatPointerXY } from '../footer-state';
import { formatAdaptiveXAxisValue, formatScalarWithUnit } from '../format';

export function formatChartPointerReadout(
  x: number, y: number | null, visibleXSpan: number, trace: Pick<Trace, 'domain' | 'units'> | null,
): string | null {
  if (y == null || !Number.isFinite(y)) return null;
  const domain = trace?.domain ?? 'frequency';
  const xLabel = formatAdaptiveXAxisValue(x, visibleXSpan, {
    domain,
    unit: trace?.units.x ?? (domain === 'time' ? 's' : 'Hz'),
  });
  return formatPointerXY(xLabel, formatScalarWithUnit(y, trace?.units.y ?? null, { digits: 2 }));
}
