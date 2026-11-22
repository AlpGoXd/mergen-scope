import type { PolarSettings } from '../types/pane';
import type { SmithSample, SmithViewport } from '../types/smith-plot';
import type { Complex } from '../types/touchstone';
import type { Trace } from '../types/trace';
import type { Capability } from '../types/registry-contract';
import { formatEngineeringValue } from './format';
import { gammaAtFrequency } from './smith/hit';
import { isLogUnit } from './units';
import { splitByBand } from './smith/band';
import { smithRangeModel } from './smith-pane-model';
import type { SmithRange } from './smith/range';

export const POLAR_REFUSAL = 'Polar needs a complex network trace or an angle on X';
export type PolarKind = 'network' | 'pattern';
export const angleUnit = (unit: string | null | undefined) => /^(?:°|deg(?:rees?)?|rad(?:ians?)?)$/i.test(unit?.trim() ?? '');

function networkSource(trace: Trace) {
  if (trace.kind !== 'raw') return null;
  const source = trace.networkSource;
  const network = trace.touchstoneNetwork;
  if (!source || !network || source.family !== network.parameterType || source.metric
    || source.row === undefined || source.col === undefined) return null;
  return { network, row: source.row, col: source.col, family: source.family };
}

export function polarKind(trace: Trace): PolarKind | null {
  const source = networkSource(trace);
  if (source?.network.samples.some(sample => {
    const value = sample.sMatrix[source.row]?.[source.col];
    return value && Number.isFinite(value.re) && Number.isFinite(value.im);
  })) return 'network';
  return angleUnit(trace.units.x) ? 'pattern' : null;
}

export function polarCapability(trace: Trace): Capability {
  return polarKind(trace) ? { allowed: true } : { allowed: false, reason: POLAR_REFUSAL };
}

export interface PolarTrace {
  readonly trace: Trace;
  readonly kind: PolarKind;
  readonly name: string;
  readonly samples: readonly SmithSample[];
  readonly sParameter: boolean;
  readonly alreadyDb: boolean;
  readonly closed: boolean;
}

/** Frequency range and hit testing use the same sample contract as Smith. */
export function polarTrace(trace: Trace): PolarTrace | null {
  const source = networkSource(trace);
  if (source && polarKind(trace) === 'network') return {
    trace, kind: 'network', name: `${source.family}${source.row + 1}${source.col + 1}`,
    samples: source.network.samples.map(sample => ({
      frequencyHz: sample.freq,
      gamma: sample.sMatrix[source.row]?.[source.col] ?? { re: NaN, im: NaN },
    })),
    sParameter: source.family === 'S', alreadyDb: false, closed: false,
  };
  if (!angleUnit(trace.units.x)) return null;
  const radians = /^rad/i.test(trace.units.x ?? '');
  const degrees = radians ? 180 / Math.PI : 1;
  const samples = trace.data.map(point => ({ frequencyHz: point.freq, gamma: { re: point.amp, im: point.freq * degrees } }));
  const first = samples[0]?.gamma.im;
  const last = samples.at(-1)?.gamma.im;
  return {
    trace, kind: 'pattern', name: trace.file || trace.dn || trace.name, samples, sParameter: false,
    alreadyDb: isLogUnit(trace.units.y) || /^db/i.test(trace.units.y ?? ''),
    closed: first !== undefined && last !== undefined && last - first >= 360 - 1e-6,
  };
}

export interface PolarValue { readonly angle: number; readonly linear: number; readonly db: number }

export function complexPolar(value: Complex): PolarValue {
  const linear = Math.hypot(value.re, value.im);
  return { angle: Math.atan2(value.im, value.re) * 180 / Math.PI, linear, db: 20 * Math.log10(linear) };
}

export function polarValue(value: Complex, trace: PolarTrace): PolarValue {
  if (trace.kind === 'network') return complexPolar(value);
  return {
    angle: value.im,
    linear: trace.alreadyDb ? 10 ** (value.re / 20) : Math.max(0, value.re),
    db: trace.alreadyDb ? value.re : 20 * Math.log10(Math.max(0, value.re)),
  };
}

export function polarAngle(angle: number, settings: Pick<PolarSettings, 'zero' | 'direction'>): number {
  return (settings.zero === 'top' ? Math.PI / 2 : 0) + angle * Math.PI / 180 * (settings.direction === 'cw' ? -1 : 1);
}

export function polarVector(angle: number, fraction: number, settings: Pick<PolarSettings, 'zero' | 'direction'>): Complex {
  const theta = polarAngle(angle, settings);
  return { re: fraction * Math.cos(theta), im: fraction * Math.sin(theta) };
}

export interface PolarRings { readonly min: number; readonly max: number; readonly ticks: readonly number[] }

function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const ratio = value / magnitude;
  return magnitude * (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10);
}

export function polarRings(maximum: number, { radius, manual }: PolarSettings, zoom = 1): PolarRings {
  if (radius === 'db') {
    const max = manual?.dbTop ?? (Number.isFinite(maximum) ? Math.ceil(maximum / 10) * 10 || 0 : 0);
    const min = max - (manual?.dbRange ?? 40) * zoom;
    const ticks = [max];
    for (let value = max - 10; value > min && ticks.length < 100; value -= 10) ticks.push(value);
    return { min, max, ticks };
  }
  const max = (manual?.linearMax ?? niceCeiling(maximum > 0 && Number.isFinite(maximum) ? maximum : 1)) * zoom;
  const ceiling = niceCeiling(max);
  const leading = ceiling / 10 ** Math.floor(Math.log10(ceiling));
  const step = ceiling / (leading > 4 ? 5 : 4);
  const count = Math.min(5, Math.floor(max / step + 1e-9));
  const ticks = count >= 4 ? Array.from({ length: count }, (_, index) => (index + 1) * step) : [max / 4, max / 2, max * 0.75];
  return { min: 0, max, ticks: [...ticks.filter(value => value < max - max * 1e-10), max] };
}

export function polarFraction(value: PolarValue, rings: PolarRings, db: boolean): number {
  return Math.max(0, ((db ? value.db : value.linear) - rings.min) / (rings.max - rings.min));
}

export function polarViewport(width: number, height: number): SmithViewport {
  return { width, height, center: { re: 0, im: 0 }, scale: Math.max(1, Math.min(width, height) / 2 - 34) };
}

export function polarSamples(samples: readonly SmithSample[], trace: PolarTrace, rings: PolarRings, settings: PolarSettings): SmithSample[] {
  return samples.map(sample => {
    const value = polarValue(sample.gamma, trace);
    return { ...sample, gamma: polarVector(value.angle, polarFraction(value, rings, settings.radius === 'db'), settings) };
  });
}

export function polarPlotModel(traces: readonly PolarTrace[], settings: PolarSettings, linked: boolean, linkedRange: SmithRange | null, zoom: number) {
  const range = smithRangeModel(traces.filter(trace => trace.kind === 'network'), linked ? null : settings.range, linkedRange, linked ? 'faint' : 'hidden');
  const ranged = traces[0]?.kind === 'pattern' ? traces : range.traces;
  const raw = ranged.map(trace => ({ ...trace, runs: splitByBand(trace.samples, range.band) }));
  let maximum = -Infinity;
  for (const trace of raw) for (const run of trace.runs) {
    for (const sample of run.samples) {
      const value = polarValue(sample.gamma, trace);
      maximum = Math.max(maximum, settings.radius === 'db' ? value.db : value.linear);
    }
  }
  const rings = polarRings(maximum, settings, zoom);
  const plots = raw.map(trace => {
    const runs = trace.runs.map(run => ({ ...run, samples: polarSamples(run.samples, trace, rings, settings) }));
    return { ...trace, runs };
  });
  return { plots, rings, full: range.full, range: range.range };
}

export function polarZoom(current: number, delta: number, db: boolean): number {
  return Math.min(25, Math.max(db ? 0.15 : 0.04, current * (delta > 0 ? 1.15 : 1 / 1.15)));
}

export function polarCrosshair(point: Complex): { radius: number; end: Complex } {
  const radius = Math.hypot(point.re, point.im);
  return { radius, end: radius > 0 ? { re: point.re / radius, im: point.im / radius } : { re: 1, im: 0 } };
}

const fixed = (value: number, digits: number) => (Number.isFinite(value) ? value.toFixed(digits).replace(/^-/, '−') : '−∞');

export function polarReadout(trace: PolarTrace, x: number, marker?: string, interpolated = false): string {
  const sample = gammaAtFrequency(trace.samples, x);
  if (!sample) return '';
  const value = polarValue(sample, trace);
  const prefix = marker ? `${marker} ${interpolated ? '≈' : '●'} ` : '';
  if (trace.kind === 'pattern') {
    return `${prefix}${trace.name} ${fixed(value.angle, 1)}° ${fixed(sample.re, 1)}${trace.trace.units.y ? ` ${trace.trace.units.y}` : ''}`;
  }
  return `${prefix}${trace.name} ${formatEngineeringValue(x, 'Hz', 3)} |${trace.name}| ${fixed(value.linear, 2)} (${fixed(value.db, 2)} dB) ∠ ${fixed(value.angle, 1)}°`;
}
