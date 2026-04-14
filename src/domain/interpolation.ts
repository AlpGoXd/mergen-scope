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

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

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
  const left = points[leftIndex]!;
  const right = points[leftIndex + 1]!;
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
  const left = points[leftIndex]!;
  const right = points[leftIndex + 1]!;
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
  const dx = points[1]!.freq - points[0]!.freq;
  if (!Number.isFinite(dx) || dx === 0) {
    return resolveLinearScalar(points, targetX);
  }

  const baseIndex = (targetX - points[0]!.freq) / dx;
  const center = Math.round(baseIndex);
  let sum = 0;
  let weightSum = 0;

  for (let offset = -LANCZOS_A; offset <= LANCZOS_A; offset += 1) {
    const sampleIndex = clampIndex(center + offset, points.length);
    const sample = points[sampleIndex]!;
    const samplePosition = (sample.freq - points[0]!.freq) / dx;
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
  const dx = points[1]!.x - points[0]!.x;
  if (!Number.isFinite(dx) || dx === 0) {
    return resolveLinearComplex(points, targetX);
  }

  const baseIndex = (targetX - points[0]!.x) / dx;
  const center = Math.round(baseIndex);
  let reSum = 0;
  let imSum = 0;
  let weightSum = 0;

  for (let offset = -LANCZOS_A; offset <= LANCZOS_A; offset += 1) {
    const sampleIndex = clampIndex(center + offset, points.length);
    const sample = points[sampleIndex]!;
    const samplePosition = (sample.x - points[0]!.x) / dx;
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

export function isUniformSpacing(
  xs: readonly number[],
  toleranceRatio = DEFAULT_UNIFORMITY_TOLERANCE,
): boolean {
  if (xs.length < 3) {
    return true;
  }

  const deltas: number[] = [];
  for (let index = 1; index < xs.length; index += 1) {
    const delta = xs[index]! - xs[index - 1]!;
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
  if (points.length === 1) {
    return { x: points[0]!.freq, y: points[0]!.amp };
  }
  if (targetX <= points[0]!.freq) {
    return { x: points[0]!.freq, y: points[0]!.amp };
  }
  if (targetX >= points[points.length - 1]!.freq) {
    const last = points[points.length - 1]!;
    return { x: last.freq, y: last.amp };
  }

  const exactIndex = findExactIndex(points, targetX);
  if (exactIndex >= 0) {
    const exact = points[exactIndex]!;
    return { x: exact.freq, y: exact.amp };
  }

  const resolvedStrategy = strategy === 'sinc' && !isUniform ? 'linear' : strategy;
  if (resolvedStrategy === 'snap') {
    const insertionIndex = findLowerBound(points, targetX);
    const right = points[Math.min(points.length - 1, insertionIndex)]!;
    const left = points[Math.max(0, insertionIndex - 1)]!;
    const nearest =
      Math.abs(targetX - left.freq) <= Math.abs(right.freq - targetX)
        ? left
        : right;
    return { x: nearest.freq, y: nearest.amp };
  }

  if (resolvedStrategy === 'linear') {
    return resolveLinearScalar(points, targetX);
  }

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
  if (points.length === 1) {
    const point = points[0]!;
    return { x: point.x, re: point.re, im: point.im };
  }
  if (targetX <= points[0]!.x) {
    const first = points[0]!;
    return { x: first.x, re: first.re, im: first.im };
  }
  if (targetX >= points[points.length - 1]!.x) {
    const last = points[points.length - 1]!;
    return { x: last.x, re: last.re, im: last.im };
  }

  const exactIndex = findExactIndex(points.map((point) => ({ freq: point.x })), targetX);
  if (exactIndex >= 0) {
    const exact = points[exactIndex]!;
    return { x: exact.x, re: exact.re, im: exact.im };
  }

  const resolvedStrategy = strategy === 'sinc' && !isUniform ? 'linear' : strategy;
  if (resolvedStrategy === 'snap') {
    const insertionIndex = findLowerBound(points.map((point) => ({ freq: point.x })), targetX);
    const right = points[Math.min(points.length - 1, insertionIndex)]!;
    const left = points[Math.max(0, insertionIndex - 1)]!;
    const nearest =
      Math.abs(targetX - left.x) <= Math.abs(right.x - targetX)
        ? left
        : right;
    return { x: nearest.x, re: nearest.re, im: nearest.im };
  }

  if (resolvedStrategy === 'linear') {
    return resolveLinearComplex(points, targetX);
  }

  return resolveSincComplex(points, targetX);
}
