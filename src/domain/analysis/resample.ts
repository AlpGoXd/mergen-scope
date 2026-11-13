// Evenly spaced copy of a trace (same span, same point count): pure, no React.
// Linear and natural cubic spline, each in one O(N) sweep (the trace interpolation helpers are per point).
import type { DataPoint } from '../../types/trace';

export type ResampleMethod = 'linear' | 'cubic';

/** Second derivatives of the natural cubic spline through the points (tridiagonal solve). */
function splineSecondDerivatives(x: readonly number[], y: readonly number[]): Float64Array {
  const n = x.length;
  const m = new Float64Array(n), c = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const h0 = (x[i] ?? 0) - (x[i - 1] ?? 0), h1 = (x[i + 1] ?? 0) - (x[i] ?? 0);
    const rhs = 6 * (((y[i + 1] ?? 0) - (y[i] ?? 0)) / h1 - ((y[i] ?? 0) - (y[i - 1] ?? 0)) / h0);
    const diag = 2 * (h0 + h1) - h0 * (c[i - 1] ?? 0);
    c[i] = h1 / diag;
    m[i] = (rhs - h0 * (m[i - 1] ?? 0)) / diag;
  }
  for (let i = n - 2; i > 0; i--) m[i] = (m[i] ?? 0) - (c[i] ?? 0) * (m[i + 1] ?? 0);
  m[0] = 0; m[n - 1] = 0;
  return m;
}

export function resampleEven(input: readonly DataPoint[], method: ResampleMethod): DataPoint[] {
  const data = input.filter(point => Number.isFinite(point.freq) && Number.isFinite(point.amp));
  const n = data.length;
  const first = data[0], last = data[n - 1];
  if (n < 2 || !first || !last || !(last.freq > first.freq)) return data.map(point => ({ ...point }));
  const x = data.map(point => point.freq), y = data.map(point => point.amp);
  const m = method === 'cubic' ? splineSecondDerivatives(x, y) : null;
  const step = (last.freq - first.freq) / (n - 1);
  const out: DataPoint[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = i === n - 1 ? last.freq : first.freq + i * step;
    while (j < n - 2 && (x[j + 1] ?? 0) < t) j++;
    const x0 = x[j] ?? 0, x1 = x[j + 1] ?? 0, y0 = y[j] ?? 0, y1 = y[j + 1] ?? 0, h = x1 - x0;
    const a = (x1 - t) / h, b = (t - x0) / h;
    let value = a * y0 + b * y1;
    if (m) value += ((a ** 3 - a) * (m[j] ?? 0) + (b ** 3 - b) * (m[j + 1] ?? 0)) * (h * h) / 6;
    out.push({ freq: t, amp: value });
  }
  return out;
}
