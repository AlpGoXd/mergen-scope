import type { WizardConfig } from '../types/file';
import type { DataPoint, Trace } from '../types/trace';

type Bands = readonly (readonly DataPoint[])[];
const cache = new WeakMap<readonly DataPoint[], Bands>();

/** Sorted, unique frequencies. A jump must dwarf the sample spacing on both sides.
 * This leaves gradual log sweeps and changes of sweep resolution connected. */
export function sweepBands(data: readonly DataPoint[]): Bands {
  const cached = cache.get(data);
  if (cached) return cached;
  const bands: (readonly DataPoint[])[] = [];
  let start = 0;
  for (let i = 2; i + 1 < data.length; i++) {
    const before = data[i - 2], left = data[i - 1], right = data[i], after = data[i + 1];
    if (!before || !left || !right || !after) continue;
    const leftStep = left.freq - before.freq;
    const rightStep = after.freq - right.freq;
    if (leftStep > 0 && rightStep > 0 && right.freq - left.freq >= 8 * Math.max(leftStep, rightStep)) {
      bands.push(data.slice(start, i));
      start = i;
    }
  }
  bands.push(start ? data.slice(start) : data);
  cache.set(data, bands);
  return bands;
}

export function isPackedFrequencySweep(config: Pick<WizardConfig, 'delimiter' | 'xCol' | 'domain' | 'xUnit'> | undefined): boolean {
  return config?.delimiter === 'tinySA' && config.xCol === 0 && config.domain === 'frequency'
    && /^[kmg]?hz$/i.test(config.xUnit ?? 'Hz');
}

type BandTrace = Pick<Trace, 'data'> & Partial<Pick<Trace, 'parameters'>>;
export function traceBands(trace: BandTrace): Bands {
  if (trace.parameters?.sweepFormat === 'tinySA') return sweepBands(trace.data);
  return [trace.data];
}

/** At a gap, choose the nearest measured band. Marker placement then snaps to its endpoint. */
export function nearestBand(bands: Bands, x: number): readonly DataPoint[] {
  let best = bands[0] ?? [];
  let distance = Infinity;
  for (const band of bands) {
    const first = band[0], last = band.at(-1);
    if (!first || !last) continue;
    const delta = Math.max(first.freq - x, x - last.freq, 0);
    if (delta >= distance) break;
    best = band;
    distance = delta;
  }
  return best;
}

/** Integration starts over at the first measured sample of each subsequent band. */
export function sweepBreaks(trace: BandTrace): ReadonlySet<number> | undefined {
  const bands = traceBands(trace);
  return bands.length > 1 ? new Set(bands.slice(1).flatMap(band => band[0] ? [band[0].freq] : [])) : undefined;
}
