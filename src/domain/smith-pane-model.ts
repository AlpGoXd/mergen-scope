import type { Trace } from '../types/trace';
import type { SmithSample } from '../types/smith-plot';
import { portZ0 } from './smith/numerics';
import { renormalizeGamma } from './smith/readout';
import { getResolvedInterpolationStrategy } from './interpolation';

export function smithTraceSamples(trace: Trace, targetZ0?: number): { z0: number; shortName: string; samples: SmithSample[] } | null {
  if (trace.kind !== 'raw' || !trace.touchstoneNetwork || !trace.networkSource) return null;
  const { row, col, family } = trace.networkSource;
  if (family !== 'S' || row === undefined || col !== row) return null;
  const reference = portZ0(trace.touchstoneNetwork.referenceOhms, row);
  if (reference.kind !== 'value') return null;
  const z0 = targetZ0 ?? reference.value;
  const samples = trace.touchstoneNetwork.samples.map(sample => {
    const gamma = sample.sMatrix[row]?.[col];
    const converted = gamma ? renormalizeGamma(gamma, reference.value, z0) : null;
    return { frequencyHz: sample.freq, gamma: converted?.kind === 'value' ? converted.value : { re: Number.NaN, im: Number.NaN } };
  });
  return { z0, shortName: `S${row + 1}${col + 1}`, samples };
}

export function smithLinkedBand(zoomAll: boolean, zoom: { left: number; right: number } | null, traces: readonly { samples: readonly SmithSample[] }[]): { minHz: number; maxHz: number } | null {
  if (!zoomAll || !zoom || !Number.isFinite(zoom.left) || !Number.isFinite(zoom.right) || zoom.left >= zoom.right) return null;
  let min = Infinity, max = -Infinity;
  for (const trace of traces) for (const sample of trace.samples) {
    if (!Number.isFinite(sample.frequencyHz) || !Number.isFinite(sample.gamma.re) || !Number.isFinite(sample.gamma.im)) continue;
    min = Math.min(min, sample.frequencyHz); max = Math.max(max, sample.frequencyHz);
  }
  // Shared zoom has no unit: overlap is a heuristic until link groups carry units.
  if (min > max || zoom.right < min || zoom.left > max || (zoom.left <= min && zoom.right >= max)) return null;
  return { minHz: zoom.left, maxHz: zoom.right };
}

export function smithMarkerFrequency(trace: Trace, click: { frequencyHz: number; sampleFrequencyHz: number; sampleDistancePx?: number }): number {
  const strategy = getResolvedInterpolationStrategy(trace.family, trace.interpolation, trace.isUniform ?? false);
  return strategy === 'snap' || strategy === 'exact' || (click.sampleDistancePx !== undefined && click.sampleDistancePx <= 10)
    ? click.sampleFrequencyHz : click.frequencyHz;
}
