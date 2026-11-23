import type { DatasetFamily } from '../types/dataset';
import type { ComplexDisplayPoint } from '../types/display';
import type { InterpolationStrategy } from '../types/interpolation';
import type { DataPoint } from '../types/trace';

export { type InterpolationStrategy } from '../types/interpolation';

export const FAMILY_DEFAULTS: Record<DatasetFamily, InterpolationStrategy> = {
  spectrum: 'snap',
  waveform: 'sinc',
  network: 'linear',
  iq: 'linear',
  symbol: 'snap',
};

const DEFAULT_UNIFORMITY_TOLERANCE = 0.001;
const LANCZOS_A = 6;


function findLowerBound<T extends { freq: number }>(
  points: readonly T[],
  targetX: number,
): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((points[mid]?.freq ?? Infinity) < targetX) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function findExactIndex<T extends { freq: number }>(
  points: readonly T[],
  targetX: number,
): number {
  const idx = findLowerBound(points, targetX);
  if (idx < points.length && points[idx]?.freq === targetX) {
    return idx;
  }
  return -1;
}

function findBracketIndex<T extends { freq: number }>(
  points: readonly T[],
  targetX: number,
): number {
  const idx = findLowerBound(points, targetX);
  return Math.max(0, Math.min(points.length - 2, idx - 1));
}

function sinc(value: number): number {
  if (value === 0) return 1;
  const scaled = Math.PI * value;
  return Math.sin(scaled) / scaled;
}

function lanczosKernel(distance: number, a = LANCZOS_A): number {
  const absDistance = Math.abs(distance);
  if (absDistance >= a) return 0;
  return sinc(distance) * sinc(distance / a);
}

function resolveLinearScalar(points: readonly DataPoint[], targetX: number): { x: number; y: number } {
  const leftIndex = findBracketIndex(points, targetX);
  const left = points[leftIndex];
  const right = points[leftIndex + 1];
  if (!left || !right || right.freq === left.freq) {
    return { x: left?.freq ?? targetX, y: left?.amp ?? 0 };
  }
  const t = (targetX - left.freq) / (right.freq - left.freq);
  return {
    x: targetX,
    y: left.amp + (right.amp - left.amp) * t,
  };
}

function resolveLinearComplex(points: readonly ComplexDisplayPoint[], targetX: number): { x: number; re: number; im: number } {
  const leftIndex = findBracketIndex(points.map((point) => ({ freq: point.x })), targetX);
  const left = points[leftIndex];
  const right = points[leftIndex + 1];
  if (!left || !right || right.x === left.x) {
    return { x: left?.x ?? targetX, re: left?.re ?? 0, im: left?.im ?? 0 };
  }
  const t = (targetX - left.x) / (right.x - left.x);
  return {
    x: targetX,
    re: left.re + (right.re - left.re) * t,
    im: left.im + (right.im - left.im) * t,
  };
}

function resolveSincScalar(points: readonly DataPoint[], targetX: number): { x: number; y: number } {
  const first = points[0];
  const second = points[1];
  if (first === undefined || second === undefined) return resolveLinearScalar(points, targetX);
  const dx = second.freq - first.freq;
  if (!Number.isFinite(dx) || dx === 0) {
    return resolveLinearScalar(points, targetX);
  }

  const baseIndex = (targetX - first.freq) / dx;
  const center = Math.round(baseIndex);
  let sum = 0;
  let weightSum = 0;

  for (let offset = -LANCZOS_A; offset <= LANCZOS_A; offset += 1) {
    const sampleIndex = center + offset;
    if (sampleIndex < 0 || sampleIndex >= points.length) continue;
    const sample = points[sampleIndex];
    if (sample === undefined) continue;
    const samplePosition = (sample.freq - first.freq) / dx;
    const weight = lanczosKernel(baseIndex - samplePosition);
    if (weight === 0) continue;
    sum += sample.amp * weight;
    weightSum += weight;
  }

  if (!Number.isFinite(weightSum) || Math.abs(weightSum) < 1e-12) {
    return resolveLinearScalar(points, targetX);
  }

  return { x: targetX, y: sum / weightSum };
}

function resolveSincComplex(points: readonly ComplexDisplayPoint[], targetX: number): { x: number; re: number; im: number } {
  const first = points[0];
  const second = points[1];
  if (first === undefined || second === undefined) return resolveLinearComplex(points, targetX);
  const dx = second.x - first.x;
  if (!Number.isFinite(dx) || dx === 0) {
    return resolveLinearComplex(points, targetX);
  }

  const baseIndex = (targetX - first.x) / dx;
  const center = Math.round(baseIndex);
  let reSum = 0;
  let imSum = 0;
  let weightSum = 0;

  for (let offset = -LANCZOS_A; offset <= LANCZOS_A; offset += 1) {
    const sampleIndex = center + offset;
    if (sampleIndex < 0 || sampleIndex >= points.length) continue;
    const sample = points[sampleIndex];
    if (sample === undefined) continue;
    const samplePosition = (sample.x - first.x) / dx;
    const weight = lanczosKernel(baseIndex - samplePosition);
    if (weight === 0) continue;
    reSum += sample.re * weight;
    imSum += sample.im * weight;
    weightSum += weight;
  }

  if (!Number.isFinite(weightSum) || Math.abs(weightSum) < 1e-12) {
    return resolveLinearComplex(points, targetX);
  }

  return { x: targetX, re: reSum / weightSum, im: imSum / weightSum };
}

// Natural cubic spline with zero curvature at the endpoints.
function cubicValue(points: readonly { x: number; y: number }[], target: number): number {
  const n = points.length;
  const lower = new Array<number>(n).fill(0);
  const diag = new Array<number>(n).fill(1);
  const upper = new Array<number>(n).fill(0);
  const rhs = new Array<number>(n).fill(0);

  for (let i = 1; i < n - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    if (a === undefined || b === undefined || c === undefined) return points[0]?.y ?? 0;

    const left = b.x - a.x;
    const right = c.x - b.x;
    if (left <= 0 || right <= 0) {
      const rightIndex = points.findIndex(point => point.x >= target);
      const lo = points[Math.max(0, rightIndex - 1)];
      const hi = points[Math.max(0, rightIndex)];
      if (lo === undefined || hi === undefined) return lo?.y ?? 0;
      return hi.x > lo.x ? lo.y + (hi.y - lo.y) * (target - lo.x) / (hi.x - lo.x) : lo.y;
    }
    lower[i] = left;
    diag[i] = 2 * (left + right);
    upper[i] = right;
    rhs[i] = 6 * ((c.y - b.y) / right - (b.y - a.y) / left);
  }
  for (let i = 1; i < n; i++) {
    const factor = (lower[i] ?? NaN) / (diag[i - 1] ?? NaN);
    diag[i] = (diag[i] ?? NaN) - factor * (upper[i - 1] ?? NaN);
    rhs[i] = (rhs[i] ?? NaN) - factor * (rhs[i - 1] ?? NaN);
  }
  const second = new Array<number>(n).fill(0);
  for (let i = n - 2; i >= 0; i--) {
    second[i] = ((rhs[i] ?? NaN) - (upper[i] ?? NaN) * (second[i + 1] ?? NaN)) / (diag[i] ?? NaN);
  }
  const rightIndex = points.findIndex(p => p.x >= target);
  const i = Math.max(0, rightIndex - 1);
  const a = points[i];
  const b = points[i + 1];
  if (a === undefined || b === undefined) return a?.y ?? 0;
  const h = b.x - a.x;
  const u = (b.x - target) / h;
  const v = (target - a.x) / h;
  return u * a.y + v * b.y + ((u ** 3 - u) * (second[i] ?? NaN) + (v ** 3 - v) * (second[i + 1] ?? NaN)) * h * h / 6;
}

export function isUniformSpacing(
  xs: readonly number[],
  toleranceRatio = DEFAULT_UNIFORMITY_TOLERANCE,
): boolean {
  if (xs.length < 3) {
    return true;
  }

  const deltas: number[] = [];
  for (let index = 1; index < xs.length; index += 1) {
    const delta = (xs[index] ?? NaN) - (xs[index - 1] ?? NaN);
    if (!Number.isFinite(delta) || delta <= 0) {
      return false;
    }
    deltas.push(delta);
  }

  const meanDelta = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
  if (!Number.isFinite(meanDelta) || meanDelta <= 0) {
    return false;
  }

  const maxDeviation = deltas.reduce((max, delta) => Math.max(max, Math.abs(delta - meanDelta)), 0);
  return maxDeviation <= Math.abs(meanDelta) * toleranceRatio;
}

export function isUniformDataPoints(points: readonly DataPoint[]): boolean {
  return isUniformSpacing(points.map((point) => point.freq));
}

export function isUniformScalarPoints(points: readonly { x: number }[]): boolean {
  return isUniformSpacing(points.map((point) => point.x));
}

export function getResolvedInterpolationStrategy(
  family: DatasetFamily,
  strategy: InterpolationStrategy | undefined,
  isUniform: boolean,
): InterpolationStrategy {
  const requested = strategy ?? FAMILY_DEFAULTS[family];
  if (requested === 'sinc' && !isUniform) {
    return 'linear';
  }
  return requested;
}

export function isInterpolationOptionDisabled(
  family: DatasetFamily,
  strategy: InterpolationStrategy,
  isUniform: boolean,
): boolean {
  if (strategy !== 'sinc') {
    return false;
  }
  return family === 'spectrum' || family === 'network' || !isUniform;
}

export function getInterpolationOptionDisabledReason(
  family: DatasetFamily,
  strategy: InterpolationStrategy,
  isUniform: boolean,
): string {
  if (!isInterpolationOptionDisabled(family, strategy, isUniform)) {
    return '';
  }
  if (!isUniform) {
    return 'Sinc requires uniformly spaced data.';
  }
  if (family === 'spectrum') {
    return 'Sinc is not meaningful for FFT-bin spectrum traces.';
  }
  if (family === 'network') {
    return 'Sinc is not meaningful for swept network traces.';
  }
  return 'This interpolation mode is unavailable for the selected trace.';
}

export function resolveValue(
  points: readonly DataPoint[],
  targetX: number,
  strategy: InterpolationStrategy,
  isUniform: boolean,
): { x: number; y: number } {
  if (!points.length || !Number.isFinite(targetX)) {
    return { x: targetX, y: 0 };
  }
  const first = points[0];
  if (first === undefined) return { x: targetX, y: 0 };
  if (points.length === 1 || targetX <= first.freq) {
    return { x: first.freq, y: first.amp };
  }
  const last = points[points.length - 1];
  if (last !== undefined && targetX >= last.freq) {
    return { x: last.freq, y: last.amp };
  }

  const exactIndex = findExactIndex(points, targetX);
  if (exactIndex >= 0) {
    const exact = points[exactIndex];
    if (exact !== undefined) return { x: exact.freq, y: exact.amp };
  }

  const resolvedStrategy = strategy === 'auto' || (strategy === 'sinc' && !isUniform) ? 'linear' : strategy;
  if (resolvedStrategy === 'snap' || resolvedStrategy === 'exact' || resolvedStrategy === 'nearest' || resolvedStrategy === 'previous' || resolvedStrategy === 'next') {
    const insertionIndex = findLowerBound(points, targetX);
    const right = points[Math.min(points.length - 1, insertionIndex)];
    const left = points[Math.max(0, insertionIndex - 1)];
    if (left === undefined || right === undefined) return resolveLinearScalar(points, targetX);
    const nearest =
      Math.abs(targetX - left.freq) <= Math.abs(right.freq - targetX)
        ? left
        : right;
    const chosen = resolvedStrategy === 'previous' ? left : resolvedStrategy === 'next' ? right : nearest;
    return { x: resolvedStrategy === 'snap' || resolvedStrategy === 'exact' ? chosen.freq : targetX, y: chosen.amp };
  }

  if (resolvedStrategy === 'linear') {
    return resolveLinearScalar(points, targetX);
  }

  if (resolvedStrategy === 'cubic') return { x: targetX, y: cubicValue(points.map(p => ({ x: p.freq, y: p.amp })), targetX) };
  return resolveSincScalar(points, targetX);
}

export function resolveComplex(
  points: readonly ComplexDisplayPoint[],
  targetX: number,
  strategy: InterpolationStrategy,
  isUniform: boolean,
): { x: number; re: number; im: number } {
  if (!points.length || !Number.isFinite(targetX)) {
    return { x: targetX, re: 0, im: 0 };
  }
  const first = points[0];
  if (first === undefined) return { x: targetX, re: 0, im: 0 };
  if (points.length === 1 || targetX <= first.x) {
    return { x: first.x, re: first.re, im: first.im };
  }
  const last = points[points.length - 1];
  if (last !== undefined && targetX >= last.x) {
    return { x: last.x, re: last.re, im: last.im };
  }

  const exactIndex = findExactIndex(points.map((point) => ({ freq: point.x })), targetX);
  if (exactIndex >= 0) {
    const exact = points[exactIndex];
    if (exact !== undefined) return { x: exact.x, re: exact.re, im: exact.im };
  }

  const resolvedStrategy = strategy === 'auto' || (strategy === 'sinc' && !isUniform) ? 'linear' : strategy;
  if (resolvedStrategy === 'snap' || resolvedStrategy === 'exact' || resolvedStrategy === 'nearest' || resolvedStrategy === 'previous' || resolvedStrategy === 'next') {
    const insertionIndex = findLowerBound(points.map((point) => ({ freq: point.x })), targetX);
    const right = points[Math.min(points.length - 1, insertionIndex)];
    const left = points[Math.max(0, insertionIndex - 1)];
    if (left === undefined || right === undefined) return resolveLinearComplex(points, targetX);
    const nearest =
      Math.abs(targetX - left.x) <= Math.abs(right.x - targetX)
        ? left
        : right;
    const chosen = resolvedStrategy === 'previous' ? left : resolvedStrategy === 'next' ? right : nearest;
    return { x: resolvedStrategy === 'snap' || resolvedStrategy === 'exact' ? chosen.x : targetX, re: chosen.re, im: chosen.im };
  }

  if (resolvedStrategy === 'linear') {
    return resolveLinearComplex(points, targetX);
  }

  if (resolvedStrategy === 'cubic') return { x: targetX, re: cubicValue(points.map(p => ({ x: p.x, y: p.re })), targetX), im: cubicValue(points.map(p => ({ x: p.x, y: p.im })), targetX) };
  return resolveSincComplex(points, targetX);
}
