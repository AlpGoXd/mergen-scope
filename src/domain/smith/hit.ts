import type { Complex } from '../../types/touchstone.ts';
import type { SmithPoint, SmithSample, SmithViewport } from '../../types/smith-plot.ts';
import { gammaToPoint } from './viewport.ts';

export interface SmithHitTrace { readonly traceId: string; readonly samples: readonly SmithSample[] }
export interface SmithHit {
  readonly traceId: string;
  /** Frequency at the hit: a sample's own frequency, or interpolated along the segment. */
  readonly frequencyHz: number;
  readonly gamma: Complex;
  /** Screen position of the hit. */
  readonly point: SmithPoint;
  readonly distancePx: number;
  /** Index of the sample nearest to the hit, in the trace's own sample array. */
  readonly sampleIndex: number;
}

const finiteSample = (s: SmithSample): boolean =>
  Number.isFinite(s.frequencyHz) && Number.isFinite(s.gamma.re) && Number.isFinite(s.gamma.im);

/** The nearest measured sample to a screen point, in pixels. Markers store its frequency. */
export function nearestSample(traces: readonly SmithHitTrace[], pointer: SmithPoint, viewport: SmithViewport, maxDistancePx = Infinity): SmithHit | null {
  let best: SmithHit | null = null;
  for (const trace of traces) {
    trace.samples.forEach((sample, sampleIndex) => {
      if (sample.synthetic) return;
      if (!finiteSample(sample)) return;
      const point = gammaToPoint(sample.gamma, viewport);
      if (!point) return;
      const distancePx = Math.hypot(point.x - pointer.x, point.y - pointer.y);
      if (distancePx <= maxDistancePx && (!best || distancePx < best.distancePx)) {
        best = { traceId: trace.traceId, frequencyHz: sample.frequencyHz, gamma: sample.gamma, point, distancePx, sampleIndex };
      }
    });
  }
  return best;
}

/**
 * The nearest point on the drawn line (between samples too). Γ and frequency are interpolated
 * linearly along the segment, which is exactly what is drawn.
 */
export function nearestTracePoint(traces: readonly SmithHitTrace[], pointer: SmithPoint, viewport: SmithViewport, maxDistancePx = Infinity): SmithHit | null {
  let best: SmithHit | null = null;
  const consider = (hit: SmithHit): void => {
    if (hit.distancePx <= maxDistancePx && (!best || hit.distancePx < best.distancePx)) best = hit;
  };
  for (const trace of traces) {
    let previous: { sample: SmithSample; point: SmithPoint; index: number } | null = null;
    trace.samples.forEach((sample, index) => {
      const point = finiteSample(sample) ? gammaToPoint(sample.gamma, viewport) : null;
      if (!point) { previous = null; return; }
      if (!previous) {
        consider({ traceId: trace.traceId, frequencyHz: sample.frequencyHz, gamma: sample.gamma, point, distancePx: Math.hypot(point.x - pointer.x, point.y - pointer.y), sampleIndex: index });
      } else {
        const a: { sample: SmithSample; point: SmithPoint; index: number } = previous;
        const dx = point.x - a.point.x, dy = point.y - a.point.y;
        const lengthSq = dx * dx + dy * dy;
        const t = lengthSq === 0 ? 1 : Math.max(0, Math.min(1, ((pointer.x - a.point.x) * dx + (pointer.y - a.point.y) * dy) / lengthSq));
        const hitPoint = { x: a.point.x + dx * t, y: a.point.y + dy * t };
        consider({
          traceId: trace.traceId,
          frequencyHz: a.sample.frequencyHz + (sample.frequencyHz - a.sample.frequencyHz) * t,
          gamma: { re: a.sample.gamma.re + (sample.gamma.re - a.sample.gamma.re) * t, im: a.sample.gamma.im + (sample.gamma.im - a.sample.gamma.im) * t },
          point: hitPoint,
          distancePx: Math.hypot(hitPoint.x - pointer.x, hitPoint.y - pointer.y),
          sampleIndex: t < 0.5 ? a.index : index,
        });
      }
      previous = { sample, point, index };
    });
  }
  return best;
}

/** Frequency of the point on one trace nearest to a screen point; null when the trace has no drawable sample. */
export function frequencyAtPoint(samples: readonly SmithSample[], pointer: SmithPoint, viewport: SmithViewport): number | null {
  return nearestTracePoint([{ traceId: '', samples }], pointer, viewport)?.frequencyHz ?? null;
}

/**
 * Γ of a trace at a frequency, interpolated linearly between the two neighbouring samples.
 * Null outside the measured range (never extrapolated). Works for ascending or descending sweeps.
 */
export function gammaAtFrequency(samples: readonly SmithSample[], frequencyHz: number): Complex | null {
  if (!Number.isFinite(frequencyHz)) return null;
  let previous: SmithSample | null = null;
  for (const sample of samples) {
    if (!finiteSample(sample)) { previous = null; continue; }
    if (sample.frequencyHz === frequencyHz) return sample.gamma;
    if (previous) {
      const a: SmithSample = previous;
      const lo = Math.min(a.frequencyHz, sample.frequencyHz), hi = Math.max(a.frequencyHz, sample.frequencyHz);
      if (frequencyHz > lo && frequencyHz < hi) {
        const t = (frequencyHz - a.frequencyHz) / (sample.frequencyHz - a.frequencyHz);
        return { re: a.gamma.re + (sample.gamma.re - a.gamma.re) * t, im: a.gamma.im + (sample.gamma.im - a.gamma.im) * t };
      }
    }
    previous = sample;
  }
  return null;
}
