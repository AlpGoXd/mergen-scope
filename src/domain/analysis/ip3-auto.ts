import type { DataPoint } from '../../types/trace';
import { buildPeakSpurTable } from './range-stats';

export interface AutoIp3Item { readonly label: 'F1' | 'F2' | 'IM3L' | 'IM3U'; readonly freq: number; readonly amp: number }
export type AutoIp3Result =
  | { readonly ok: true; readonly items: readonly [AutoIp3Item, AutoIp3Item, AutoIp3Item, AutoIp3Item] }
  | { readonly ok: false; readonly reason: string };

const finite = (point: DataPoint): boolean => Number.isFinite(point.freq) && Number.isFinite(point.amp);

/** The strongest sample of `data` inside [lo, hi]; null when the window holds no sample. */
function strongestIn(data: readonly DataPoint[], lo: number, hi: number): DataPoint | null {
  let best: DataPoint | null = null;
  for (const point of data) {
    if (point.freq < lo || point.freq > hi) continue;
    if (!best || point.amp > best.amp) best = point;
  }
  return best;
}

/**
 * Pick F1, F2 and the two third-order products of a two-tone test from a spectrum.
 * The two strongest separate peaks are the tones (F1 < F2); the products sit at
 * 2·F1 − F2 and 2·F2 − F1 (one tone spacing below F1 and above F2). Each product is the
 * strongest measured sample within a quarter spacing (at least two samples) of that frequency.
 * Only measured samples are returned, never interpolated values.
 */
export function autoPickIp3(input: readonly DataPoint[]): AutoIp3Result {
  const data = input.filter(finite).sort((a, b) => a.freq - b.freq);
  if (data.length < 8) return { ok: false, reason: 'The trace has too few points for an IP3 measurement.' };
  const steps = data.slice(1).map((point, index) => point.freq - (data[index]?.freq ?? point.freq)).filter(step => step > 0).sort((a, b) => a - b);
  const step = steps[Math.floor(steps.length / 2)] ?? 0;
  if (!(step > 0)) return { ok: false, reason: 'The trace has no usable frequency axis.' };

  const peaks = buildPeakSpurTable(data, { limit: 50 }).sort((a, b) => b.amp - a.amp);
  const first = peaks[0];
  const second = peaks.find(peak => first !== undefined && Math.abs(peak.freq - first.freq) >= 3 * step);
  if (!first || !second) return { ok: false, reason: 'Could not find two separate tones in this trace.' };
  const [low, high] = first.freq <= second.freq ? [first, second] : [second, first];
  const spacing = high.freq - low.freq;

  const lower = low.freq - spacing, upper = high.freq + spacing;
  const first_ = data[0]?.freq ?? 0, last = data[data.length - 1]?.freq ?? 0;
  if (lower < first_ || upper > last) return { ok: false, reason: 'The third-order products fall outside the sweep: widen the span.' };
  const window = Math.max(2 * step, spacing / 4);
  const im3l = strongestIn(data, lower - window, lower + window);
  const im3u = strongestIn(data, upper - window, upper + window);
  if (!im3l || !im3u) return { ok: false, reason: 'Could not find the third-order products in this trace.' };
  return {
    ok: true,
    items: [
      { label: 'F1', freq: low.freq, amp: low.amp },
      { label: 'F2', freq: high.freq, amp: high.amp },
      { label: 'IM3L', freq: im3l.freq, amp: im3l.amp },
      { label: 'IM3U', freq: im3u.freq, amp: im3u.amp },
    ],
  };
}
