import type { Trace, DataPoint } from '../../types/trace';
import type { BinaryOp } from '../trace-ops';
import { isUniformDataPoints, isUniformScalarPoints, resolveComplex, resolveValue } from '../interpolation';

export type MathPoints = 'a' | 'b' | 'both';
export type MathFill = 'linear' | 'cubic' | 'nearest' | 'previous' | 'next' | 'sinc';

export function describeStimulus(a: Trace, b: Trace) {
  const range = (trace: Trace): [number, number] => [trace.data[0]?.freq ?? NaN, trace.data[trace.data.length - 1]?.freq ?? NaN];
  const aRange = range(a), bRange = range(b);
  const lo = Math.max(aRange[0], bRange[0]), hi = Math.min(aRange[1], bRange[1]);
  return {
    identical: a.data.length === b.data.length && a.data.every((point, i) => {
      const x = b.data[i]?.freq;
      return x !== undefined && Math.abs(point.freq - x) <= 1e-9 * Math.max(Math.abs(point.freq), Math.abs(x));
    }),
    aCount: a.data.length, bCount: b.data.length, aRange, bRange,
    overlap: Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? [lo, hi] as [number, number] : null,
    domainMismatch: a.domain !== b.domain,
  };
}

function sampler(trace: Trace, fill: MathFill): (x: number) => number {
  if (trace.kind === 'raw' && trace.touchstoneNetwork && trace.networkSource && !trace.networkSource.metric) {
    const source = trace.networkSource;
    const views = ['complex', 'magnitude-db', 'magnitude-linear', 'phase', 'real', 'imag', 'vswr', 'return-loss'];
    const samples = trace.touchstoneNetwork.samples.flatMap(sample => {
      const value = sample.sMatrix[source.row ?? 0]?.[source.col ?? 0];
      return value ? [{ x: sample.freq, re: value.re, im: value.im }] : [];
    });
    if (samples.length === trace.data.length && samples.every((sample, i) => sample.x === trace.data[i]?.freq) && views.includes(source.view ?? '')) {
      const uniform = isUniformScalarPoints(samples);
      return x => {
        const value = resolveComplex(samples, x, fill, uniform);
        const mag = Math.hypot(value.re, value.im);
        switch (source.view) {
          case 'magnitude-db': return mag > 0 ? 20 * Math.log10(mag) : -300;
          case 'return-loss': return mag > 0 ? -20 * Math.log10(mag) : 300;
          case 'phase': return Math.atan2(value.im, value.re) * 180 / Math.PI;
          case 'real': return value.re;
          case 'imag': return value.im;
          case 'vswr': return mag < 1 ? (1 + mag) / (1 - mag) : NaN;
          default: return mag;
        }
      };
    }
  }
  // Unsupported network projections and missing complex samples use their scalar data.
  const uniform = isUniformDataPoints(trace.data);
  return x => resolveValue(trace.data, x, fill, uniform).y;
}

export function alignAndCompute(a: Trace, b: Trace, operation: BinaryOp, points: MathPoints | undefined, fill: MathFill | undefined): { data: DataPoint[] } | { reason: string } {
  try {
  const description = describeStimulus(a, b);
  if (description.domainMismatch) return { reason: 'Cannot combine a time trace (s) with a frequency trace (Hz).' };
  if (!description.overlap && !description.identical) return { reason: 'The traces do not overlap in X, nothing to combine.' };
  if (!a.data.length || !b.data.length) return { reason: 'The traces do not overlap in X, nothing to combine.' };
  if (!description.identical && (!points || !fill)) return { reason: 'Choose Points and Fill gaps.' };
  const [lo, hi] = description.overlap ?? description.aRange;
  const xs = description.identical || points === 'a' ? a.data.map(p => p.freq) : points === 'b' ? b.data.map(p => p.freq) : [...new Set([...a.data, ...b.data].map(p => p.freq))].sort((x, y) => x - y);
  const getA = sampler(a, fill ?? 'linear'), getB = sampler(b, fill ?? 'linear');
  const data: DataPoint[] = [];
  for (const [index, x] of xs.entries()) {
    if (!description.identical && (x < lo || x > hi)) continue;
    const av = description.identical ? a.data[index]?.amp : getA(x);
    const bv = description.identical ? b.data[index]?.amp : getB(x);
    if (av === undefined || bv === undefined || (operation === 'divide' && bv === 0)) continue;
    const amp = operation === 'add' ? av + bv : operation === 'subtract' ? av - bv : operation === 'multiply' ? av * bv : av / bv;
    if (Number.isFinite(amp)) data.push({ freq: x, amp });
  }
  return data.length ? { data } : { reason: 'No valid points to combine.' };
  } catch {
    return { reason: 'No valid points to combine.' };
  }
}
