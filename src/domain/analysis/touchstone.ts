import { abs } from '../complex';
import { computeTwoPortStability } from '../touchstone-math';
import type { TouchstoneContext } from '../../types/analysis';
import type { Complex, TouchstoneSample } from '../../types/touchstone';

export interface ScalarPoint {
  readonly freq: number;
  readonly value: number;
}

export interface VswrSummary {
  readonly min: ScalarPoint;
  readonly max: ScalarPoint;
  readonly average: number;
  readonly count: number;
}

export interface ReturnLossSummary {
  readonly min: ScalarPoint;
  readonly max: ScalarPoint;
  readonly average: number;
  readonly count: number;
}

export interface GroupDelaySummary {
  readonly min: ScalarPoint;
  readonly max: ScalarPoint;
  readonly average: number;
  readonly count: number;
}

export interface ReciprocityIsolationSummary {
  readonly reciprocityError: ScalarPoint;
  readonly worstIsolationDb: ScalarPoint;
  readonly averageReciprocityErrorDb: number;
  readonly count: number;
}

export interface StabilitySummary {
  readonly minK: ScalarPoint;
  readonly minMu1: ScalarPoint;
  readonly minMu2: ScalarPoint;
  readonly unstableCount: number;
  readonly count: number;
}

function getCell(sample: TouchstoneSample, row: number, col: number): Complex | null {
  const sampleRow = sample.sMatrix[row];
  if (!sampleRow) return null;
  return sampleRow[col] ?? null;
}

function getSelectedCell(context: TouchstoneContext, sample: TouchstoneSample): Complex | null {
  const row = context.row;
  const col = context.col;
  if (row === null || col === null) return null;
  return getCell(sample, row, col);
}

function minPoint(points: readonly ScalarPoint[]): ScalarPoint | null {
  if (points.length === 0) return null;
  let min = points[0]!;
  for (const p of points) {
    if (p.value < min.value) min = p;
  }
  return min;
}

function maxPoint(points: readonly ScalarPoint[]): ScalarPoint | null {
  if (points.length === 0) return null;
  let max = points[0]!;
  for (const p of points) {
    if (p.value > max.value) max = p;
  }
  return max;
}

function average(points: readonly ScalarPoint[]): number {
  if (points.length === 0) return 0;
  let total = 0;
  for (const p of points) total += p.value;
  return total / points.length;
}

function toMagnitudeDb(magnitude: number): number {
  if (!Number.isFinite(magnitude) || magnitude <= 0) return -300;
  return 20 * Math.log10(magnitude);
}

function unwrapPhaseRad(phases: readonly number[]): number[] {
  if (phases.length === 0) return [];
  const out: number[] = [phases[0]!];
  let offset = 0;
  for (let i = 1; i < phases.length; i++) {
    const prev = phases[i - 1]!;
    const curr = phases[i]!;
    const delta = curr - prev;
    if (delta > Math.PI) offset -= 2 * Math.PI;
    if (delta < -Math.PI) offset += 2 * Math.PI;
    out.push(curr + offset);
  }
  return out;
}

export function computeVSWR(context: TouchstoneContext | null): VswrSummary | null {
  if (!context?.network?.samples || context.row === null || context.col === null) return null;

  const points: ScalarPoint[] = [];
  for (const sample of context.network.samples) {
    const gamma = getSelectedCell(context, sample);
    if (!gamma) continue;
    const mag = Math.min(abs(gamma), 0.999999999999);
    const value = (1 + mag) / Math.max(1 - mag, 1e-12);
    points.push({ freq: sample.freq, value });
  }

  const min = minPoint(points);
  const max = maxPoint(points);
  if (!min || !max) return null;
  return { min, max, average: average(points), count: points.length };
}

export function computeReturnLoss(context: TouchstoneContext | null): ReturnLossSummary | null {
  if (!context?.network?.samples || context.row === null || context.col === null) return null;

  const points: ScalarPoint[] = [];
  for (const sample of context.network.samples) {
    const gamma = getSelectedCell(context, sample);
    if (!gamma) continue;
    const rlDb = -toMagnitudeDb(abs(gamma));
    points.push({ freq: sample.freq, value: rlDb });
  }

  const min = minPoint(points);
  const max = maxPoint(points);
  if (!min || !max) return null;
  return { min, max, average: average(points), count: points.length };
}

export function computeGroupDelay(context: TouchstoneContext | null): GroupDelaySummary | null {
  if (!context?.network?.samples || context.row === null || context.col === null) return null;

  const freq: number[] = [];
  const phase: number[] = [];
  for (const sample of context.network.samples) {
    const sij = getSelectedCell(context, sample);
    if (!sij) continue;
    freq.push(sample.freq);
    phase.push(Math.atan2(sij.im, sij.re));
  }
  if (freq.length < 3) return null;

  const unwrapped = unwrapPhaseRad(phase);
  const points: ScalarPoint[] = [];
  for (let i = 1; i < freq.length - 1; i++) {
    const fPrev = freq[i - 1]!;
    const fNext = freq[i + 1]!;
    const pPrev = unwrapped[i - 1]!;
    const pNext = unwrapped[i + 1]!;
    const df = fNext - fPrev;
    if (!Number.isFinite(df) || df === 0) continue;
    const dphiDf = (pNext - pPrev) / df;
    const tau = -dphiDf / (2 * Math.PI);
    points.push({ freq: freq[i]!, value: tau });
  }

  const min = minPoint(points);
  const max = maxPoint(points);
  if (!min || !max) return null;
  return { min, max, average: average(points), count: points.length };
}

export function computeReciprocityIsolation(
  context: TouchstoneContext | null,
): ReciprocityIsolationSummary | null {
  if (!context?.network?.samples || context.network.portCount < 2) return null;

  const reciprocityError: ScalarPoint[] = [];
  const isolation: ScalarPoint[] = [];

  for (const sample of context.network.samples) {
    const s21 = getCell(sample, 1, 0);
    const s12 = getCell(sample, 0, 1);
    if (!s21 || !s12) continue;

    const s21Db = toMagnitudeDb(abs(s21));
    const s12Db = toMagnitudeDb(abs(s12));
    reciprocityError.push({ freq: sample.freq, value: Math.abs(s21Db - s12Db) });

    const worstCoupling = Math.max(s21Db, s12Db);
    isolation.push({ freq: sample.freq, value: -worstCoupling });
  }

  const worstReciprocity = maxPoint(reciprocityError);
  const worstIsolation = minPoint(isolation);
  if (!worstReciprocity || !worstIsolation) return null;

  return {
    reciprocityError: worstReciprocity,
    worstIsolationDb: worstIsolation,
    averageReciprocityErrorDb: average(reciprocityError),
    count: reciprocityError.length,
  };
}

export function computeStabilityFactors(context: TouchstoneContext | null): StabilitySummary | null {
  if (!context?.network?.samples || context.network.portCount !== 2) return null;

  const kPoints: ScalarPoint[] = [];
  const mu1Points: ScalarPoint[] = [];
  const mu2Points: ScalarPoint[] = [];
  let unstableCount = 0;

  for (const sample of context.network.samples) {
    const stability = computeTwoPortStability(sample.sMatrix);
    if (!stability) continue;
    if (!stability.unconditional) unstableCount += 1;
    kPoints.push({ freq: sample.freq, value: stability.kFactor });
    mu1Points.push({ freq: sample.freq, value: stability.mu1 });
    mu2Points.push({ freq: sample.freq, value: stability.mu2 });
  }

  const minK = minPoint(kPoints);
  const minMu1 = minPoint(mu1Points);
  const minMu2 = minPoint(mu2Points);
  if (!minK || !minMu1 || !minMu2) return null;

  return {
    minK,
    minMu1,
    minMu2,
    unstableCount,
    count: kPoints.length,
  };
}