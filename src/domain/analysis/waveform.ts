// Time-domain waveform measurements (scope-style "Measure"): pure, no React.
// Levels follow IEEE 181 practice: the top and base state levels come from the histogram mode when the
// signal has flat states (square, pulse, settled edge), and fall back to max/min when it does not (sine).
// Edges are found with 10 % / 90 % hysteresis so noise near the middle cannot add edges.
import type { DataPoint } from '../../types/trace';

export interface WaveformEdge {
  /** Interpolated time of the 10 % crossing. */
  readonly t10: number;
  /** Interpolated time of the 50 % crossing. */
  readonly t50: number;
  /** Interpolated time of the 90 % crossing. */
  readonly t90: number;
}

export interface WaveformResult {
  readonly count: number;
  readonly max: number;
  readonly min: number;
  readonly vpp: number;
  readonly mean: number;
  readonly rms: number;
  /** Top and base state levels (histogram mode, else max and min). */
  readonly top: number;
  readonly base: number;
  /** The 10 % and 90 % reference levels between base and top. */
  readonly low: number;
  readonly high: number;
  readonly frequency: number | null;
  readonly period: number | null;
  /** Mean 10 → 90 % time over all rising edges. */
  readonly riseTime: number | null;
  /** Mean 90 → 10 % time over all falling edges. */
  readonly fallTime: number | null;
  /** (max − top) / (top − base), in percent. */
  readonly overshoot: number | null;
  /** High time over period, in percent, averaged over complete cycles. */
  readonly dutyCycle: number | null;
  /** The first rising edge, for the chart overlay. */
  readonly risingEdge: WaveformEdge | null;
  /** The first complete period (rising 50 % to the next rising 50 %), for the chart overlay. */
  readonly periodSpan: { readonly start: number; readonly end: number } | null;
}

const BINS = 100;
/** A state level must hold this share of the samples on its side of the middle. */
const STATE_SHARE = 0.4;

/** Mean of the samples in the mode bin (widened by one bin each side if needed) on one side of the middle. */
function stateLevel(values: readonly number[], min: number, max: number, upper: boolean): number | null {
  const span = max - min;
  const mid = (min + max) / 2;
  const side = values.filter(v => upper ? v >= mid : v < mid);
  if (!side.length) return null;
  const binOf = (v: number) => Math.min(BINS - 1, Math.max(0, Math.floor(((v - min) / span) * BINS)));
  const counts = new Array<number>(BINS).fill(0);
  for (const v of side) counts[binOf(v)] = (counts[binOf(v)] ?? 0) + 1;
  let mode = upper ? BINS - 1 : 0;
  for (let i = 0; i < BINS; i++) if ((counts[i] ?? 0) > (counts[mode] ?? 0)) mode = i;
  for (const widen of [0, 1]) {
    const inBand = side.filter(v => Math.abs(binOf(v) - mode) <= widen);
    if (inBand.length >= STATE_SHARE * side.length) return inBand.reduce((sum, v) => sum + v, 0) / inBand.length;
  }
  return null;
}

/** Time where the segment a → b crosses `level` (linear interpolation). */
function crossing(a: DataPoint, b: DataPoint, level: number): number {
  const dv = b.amp - a.amp;
  return dv === 0 ? a.freq : a.freq + ((level - a.amp) / dv) * (b.freq - a.freq);
}

/** The segment a → b reaches `level` moving in the given direction (a sample exactly on the level counts). */
function crosses(a: DataPoint, b: DataPoint, level: number, rising: boolean): boolean {
  return (rising ? b.amp > a.amp : b.amp < a.amp) && (a.amp - level) * (b.amp - level) <= 0;
}

/** First segment in [from, to) that crosses `level` in the given direction. */
function firstCrossing(data: readonly DataPoint[], from: number, to: number, level: number, rising: boolean): number | null {
  for (let i = from; i < to; i++) {
    const a = data[i], b = data[i + 1];
    if (!a || !b) continue;
    if (crosses(a, b, level, rising)) return crossing(a, b, level);
  }
  return null;
}

/** Last segment in [from, to) that crosses `level` in the given direction. */
function lastCrossing(data: readonly DataPoint[], from: number, to: number, level: number, rising: boolean): number | null {
  for (let i = to - 1; i >= from; i--) {
    const a = data[i], b = data[i + 1];
    if (!a || !b) continue;
    if (crosses(a, b, level, rising)) return crossing(a, b, level);
  }
  return null;
}

function findEdges(data: readonly DataPoint[], low: number, mid: number, high: number): { rising: WaveformEdge[]; falling: WaveformEdge[] } {
  const rising: WaveformEdge[] = [];
  const falling: WaveformEdge[] = [];
  let state: 'low' | 'high' | null = null;
  let lastLow = -1, lastHigh = -1;
  data.forEach((point, i) => {
    if (point.amp <= low) {
      if (state === 'high') {
        // From the last sample at or above 90 % to this first sample at or below 10 %.
        const t90 = firstCrossing(data, lastHigh, i, high, false), t50 = firstCrossing(data, lastHigh, i, mid, false), t10 = lastCrossing(data, lastHigh, i, low, false);
        if (t90 !== null && t50 !== null && t10 !== null) falling.push({ t10, t50, t90 });
      }
      state = 'low'; lastLow = i;
    } else if (point.amp >= high) {
      if (state === 'low') {
        const t10 = firstCrossing(data, lastLow, i, low, true), t50 = firstCrossing(data, lastLow, i, mid, true), t90 = lastCrossing(data, lastLow, i, high, true);
        if (t10 !== null && t50 !== null && t90 !== null) rising.push({ t10, t50, t90 });
      }
      state = 'high'; lastHigh = i;
    }
  });
  return { rising, falling };
}

const average = (values: readonly number[]): number | null => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

/** Measure a time trace (x in seconds, y in the trace unit). Null when fewer than two finite samples. */
export function measureWaveform(input: readonly DataPoint[]): WaveformResult | null {
  const data = input.filter(point => Number.isFinite(point.freq) && Number.isFinite(point.amp));
  if (data.length < 2) return null;
  const values = data.map(point => point.amp);
  let max = -Infinity, min = Infinity, sum = 0, sumSq = 0;
  for (const v of values) { if (v > max) max = v; if (v < min) min = v; sum += v; sumSq += v * v; }
  const mean = sum / values.length;
  const rms = Math.sqrt(sumSq / values.length);
  const vpp = max - min;
  const flat = { count: data.length, max, min, vpp, mean, rms, top: max, base: min, low: min, high: max, frequency: null, period: null, riseTime: null, fallTime: null, overshoot: null, dutyCycle: null, risingEdge: null, periodSpan: null };
  if (!(vpp > 0)) return flat;

  const top = stateLevel(values, min, max, true) ?? max;
  const base = stateLevel(values, min, max, false) ?? min;
  const amplitude = top - base;
  if (!(amplitude > 0)) return flat;
  const low = base + 0.1 * amplitude, mid = base + 0.5 * amplitude, high = base + 0.9 * amplitude;
  const { rising, falling } = findEdges(data, low, mid, high);

  // Period from the 50 % crossings of the rising edges (falling edges when there is only one rising edge).
  const periodic = rising.length >= 2 ? rising : falling.length >= 2 ? falling : null;
  const firstEdge = periodic?.[0], lastEdge = periodic?.[periodic.length - 1];
  const period = periodic && firstEdge && lastEdge && lastEdge.t50 > firstEdge.t50 ? (lastEdge.t50 - firstEdge.t50) / (periodic.length - 1) : null;

  let highTime = 0, cycleTime = 0;
  for (let i = 0; i + 1 < rising.length; i++) {
    const start = rising[i], end = rising[i + 1];
    if (!start || !end) continue;
    const fall = falling.find(edge => edge.t50 > start.t50 && edge.t50 < end.t50);
    if (!fall) continue;
    highTime += fall.t50 - start.t50;
    cycleTime += end.t50 - start.t50;
  }

  const first = rising[0], second = rising[1];
  return {
    ...flat,
    top, base, low, high,
    frequency: period ? 1 / period : null,
    period,
    riseTime: average(rising.map(edge => edge.t90 - edge.t10)),
    fallTime: average(falling.map(edge => edge.t10 - edge.t90)),
    overshoot: ((max - top) / amplitude) * 100,
    dutyCycle: cycleTime > 0 ? (highTime / cycleTime) * 100 : null,
    risingEdge: first ?? null,
    periodSpan: first && second ? { start: first.t50, end: second.t50 } : null,
  };
}
