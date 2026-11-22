import type { Capability } from '../../types/registry-contract';
import type { DataPoint, Trace } from '../../types/trace';
import { angleAxisUnit } from '../units';
import { interpolatePointAtX, traceBound } from '../trace-math';
import { computeBandwidth } from './bandwidth';
import type { BandwidthResult } from './bandwidth';

const TURN = 360;
const ANGLE_TOLERANCE = 1e-6;
const gainInDb = (unit: string | null) => /^db(?:i|d)?$/i.test(unit?.trim() ?? '');
const linearGain = (unit: string | null) => /^(?:unitless|linear|ratio|1)$/i.test(unit?.trim() ?? '');

export function antennaFarFieldCapability(trace: Trace): Capability {
  if (!angleAxisUnit(trace.units.x)) return { allowed: false, reason: 'Antenna far-field analysis needs an angle on X.' };
  if (!gainInDb(trace.units.y) && !linearGain(trace.units.y)) {
    return { allowed: false, reason: 'Use gain in dB, dBi, dBd or a linear power ratio.' };
  }
  return { allowed: true };
}

export function antennaBearing(angle: number): number {
  return ((angle % TURN) + TURN) % TURN;
}

function gainAt(points: readonly DataPoint[], angle: number): number | undefined {
  const i = traceBound(points, angle);
  const before = points[i - 1], after = points[i];
  if (after?.freq === angle) return after.amp;
  return before && after ? interpolatePointAtX(before, after, angle)?.amp : undefined;
}

/** One point per equal-gain plateau keeps a flat top or minimum from hiding a measured turning point. */
function turningPoints(points: readonly DataPoint[]) {
  const extrema: { point: DataPoint; kind: 'min' | 'max' }[] = [];
  for (let start = 0; start < points.length;) {
    const first = points[start];
    if (!first) break;
    let end = start;
    while (points[end + 1]?.amp === first.amp) end += 1;
    const previous = points[start - 1], next = points[end + 1], last = points[end];
    if (previous && next && last) {
      const point = { freq: (first.freq + last.freq) / 2, amp: first.amp };
      if (first.amp < previous.amp && first.amp < next.amp) extrema.push({ point, kind: 'min' });
      if (first.amp > previous.amp && first.amp > next.amp) extrema.push({ point, kind: 'max' });
    }
    start = end + 1;
  }
  return extrema;
}

function fullTurn(points: readonly DataPoint[], span: number): boolean {
  if (Math.abs(span - TURN) <= ANGLE_TOLERANCE) return true;
  // Uniform sweeps often omit the duplicate endpoint (for example, 0…359°).
  const step = span / (points.length - 1);
  const tolerance = Math.max(ANGLE_TOLERANCE, step * 0.01);
  return Math.abs(TURN - span - step) <= tolerance && points.every((point, i) => {
    const previous = points[i - 1];
    return !previous || Math.abs(point.freq - previous.freq - step) <= tolerance;
  });
}

export interface AntennaFarFieldResult {
  readonly peak: DataPoint;
  readonly beam3: BandwidthResult | null;
  readonly beam10: BandwidthResult | null;
  readonly oppositeGain: number | undefined;
  readonly firstMinimumWidth: number | undefined;
  readonly secondaryLobe: DataPoint | undefined;
}

/** Calculate one angular cut. Interpolate in the input gain scale and report gain in dB. */
export function computeAntennaFarField(trace: Trace): AntennaFarFieldResult | null {
  if (!antennaFarFieldCapability(trace).allowed) return null;
  const scale = angleAxisUnit(trace.units.x) === 'rad' ? 180 / Math.PI : 1;
  const isLinear = linearGain(trace.units.y);
  const samples = trace.data.flatMap(point => {
    const freq = point.freq * scale;
    return Number.isFinite(freq) && Number.isFinite(point.amp) && (!isLinear || point.amp >= 0)
      ? [{ freq, amp: point.amp }] : [];
  });
  const first = samples[0], last = samples.at(-1);
  if (!first || !last || samples.length < 3) return null;
  const span = last.freq - first.freq;
  if (!(span > 0) || span > TURN + ANGLE_TOLERANCE) return null;
  const wraps = fullTurn(samples, span);
  const base = wraps && Math.abs(span - TURN) <= ANGLE_TOLERANCE ? samples.slice(0, -1) : samples;
  let peak = first;
  for (const point of base) if (point.amp > peak.amp) peak = point;
  if (isLinear && peak.amp === 0) return null;
  const shifted = (offset: number) => base.map(point => ({ ...point, freq: point.freq + offset }));
  const points = wraps ? [...shifted(-TURN), ...base, ...shifted(TURN)] : base;
  const beam = (drop: number) => {
    const result = computeBandwidth(points, peak.freq, peak.amp, isLinear ? peak.amp * (1 - 10 ** (-drop / 10)) : drop);
    return result && result.bandwidth < TURN ? result : null;
  };
  const beam3 = beam(3);
  const beam10 = beam(10);
  const oppositeGain = gainAt(points, peak.freq + 180) ?? gainAt(points, peak.freq - 180);
  const extrema = beam3 ? turningPoints(points) : [];
  const left = beam3 && extrema.filter(({ kind, point }) => kind === 'min' && point.freq <= beam3.left).at(-1)?.point;
  const right = beam3 && extrema.find(({ kind, point }) => kind === 'min' && point.freq >= beam3.right)?.point;
  const firstMinimumWidth = left && right && right.freq - left.freq < TURN ? right.freq - left.freq : undefined;
  let secondaryLobe: DataPoint | undefined;
  if (firstMinimumWidth !== undefined && left && right) {
    const halfTurn = TURN / 2;
    for (const { kind, point } of extrema) {
      if (kind !== 'max' || point.freq >= left.freq && point.freq <= right.freq) continue;
      if (wraps && (point.freq < peak.freq - halfTurn || point.freq >= peak.freq + halfTurn)) continue;
      if (!secondaryLobe || point.amp > secondaryLobe.amp) secondaryLobe = point;
    }
  }
  const db = (amp: number) => isLinear ? 10 * Math.log10(amp) : amp;
  return {
    peak: { ...peak, amp: db(peak.amp) }, beam3, beam10,
    oppositeGain: oppositeGain === undefined ? undefined : db(oppositeGain), firstMinimumWidth,
    secondaryLobe: secondaryLobe ? { ...secondaryLobe, amp: db(secondaryLobe.amp) } : undefined,
  };
}
