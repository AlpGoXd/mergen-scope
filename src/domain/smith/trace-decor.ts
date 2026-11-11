import type { SmithPoint, SmithSample, SmithViewport } from '../../types/smith-plot.ts';
import { gammaToPoint } from './viewport.ts';

export type SmithDirectionMode = 'chevrons' | 'ends' | 'off';
export interface SmithChevron {
  readonly x: number;
  readonly y: number;
  /** Screen angle in degrees (0 = right, 90 = down) of the direction of rising frequency. */
  readonly angleDeg: number;
  readonly frequencyHz: number;
}
export interface SmithTraceEnds {
  /** Lowest frequency: drawn as a hollow dot. */
  readonly start: SmithSample;
  /** Highest frequency: drawn as a filled dot. */
  readonly end: SmithSample;
}

const finiteSample = (s: SmithSample): boolean =>
  Number.isFinite(s.frequencyHz) && Number.isFinite(s.gamma.re) && Number.isFinite(s.gamma.im);

/** The lowest- and highest-frequency samples of a trace, whatever the sweep order. */
export function traceEnds(samples: readonly SmithSample[]): SmithTraceEnds | null {
  let start: SmithSample | null = null, end: SmithSample | null = null;
  for (const sample of samples) {
    if (!finiteSample(sample)) continue;
    if (!start || sample.frequencyHz < start.frequencyHz) start = sample;
    if (!end || sample.frequencyHz > end.frequencyHz) end = sample;
  }
  return start && end ? { start, end } : null;
}

/** The part of a segment inside the view (Liang–Barsky), as parameters along a → b; null when none is. */
function clipToView(a: SmithPoint, b: SmithPoint, view: SmithViewport): { t0: number; t1: number } | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const edges: readonly (readonly [number, number])[] = [[-dx, a.x], [dx, view.width - a.x], [-dy, a.y], [dy, view.height - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return { t0, t1 };
}

/** Shortest on-screen length (px) that still gets one chevron. */
const MIN_PX_PER_CHEVRON = 36;

/**
 * Direction chevrons at every 1/(count+1) of the trace's on-screen length (count 4 = every fifth),
 * each rotated to the local tangent and pointing toward higher frequency. Short traces get fewer.
 */
export function directionChevrons(samples: readonly SmithSample[], viewport: SmithViewport, count = 4): SmithChevron[] {
  if (!Number.isInteger(count) || count <= 0) return [];
  interface Segment { readonly a: SmithPoint; readonly b: SmithPoint; readonly fa: number; readonly fb: number; readonly length: number }
  const segments: Segment[] = [];
  let previous: { point: SmithPoint; frequencyHz: number } | null = null;
  let visibleLength = 0;
  for (const sample of samples) {
    const point = finiteSample(sample) ? gammaToPoint(sample.gamma, viewport) : null;
    if (!point) { previous = null; continue; }
    if (previous) {
      const a: { point: SmithPoint; frequencyHz: number } = previous;
      const clip = clipToView(a.point, point, viewport);
      if (clip && sample.frequencyHz !== a.frequencyHz) {
        const dx = point.x - a.point.x, dy = point.y - a.point.y, df = sample.frequencyHz - a.frequencyHz;
        const from = { x: a.point.x + dx * clip.t0, y: a.point.y + dy * clip.t0 };
        const to = { x: a.point.x + dx * clip.t1, y: a.point.y + dy * clip.t1 };
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length > 0) {
          segments.push({ a: from, b: to, fa: a.frequencyHz + df * clip.t0, fb: a.frequencyHz + df * clip.t1, length });
          visibleLength += length;
        }
      }
    }
    previous = { point, frequencyHz: sample.frequencyHz };
  }
  const n = Math.min(count, Math.floor(visibleLength / MIN_PX_PER_CHEVRON));
  if (n <= 0) return [];

  const chevrons: SmithChevron[] = [];
  let walked = 0, next = 1;
  for (const segment of segments) {
    while (next <= n) {
      const target = (visibleLength * next) / (n + 1);
      if (target > walked + segment.length) break;
      const t = (target - walked) / segment.length;
      const rising = segment.fb > segment.fa ? 1 : -1;
      chevrons.push({
        x: segment.a.x + (segment.b.x - segment.a.x) * t,
        y: segment.a.y + (segment.b.y - segment.a.y) * t,
        angleDeg: (Math.atan2((segment.b.y - segment.a.y) * rising, (segment.b.x - segment.a.x) * rising) * 180) / Math.PI,
        frequencyHz: segment.fa + (segment.fb - segment.fa) * t,
      });
      next++;
    }
    walked += segment.length;
  }
  return chevrons;
}
