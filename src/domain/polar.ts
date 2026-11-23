import type { PolarSettings } from '../types/pane';
import type { SmithSample, SmithViewport } from '../types/smith-plot';
import type { Complex } from '../types/touchstone';
import type { Trace } from '../types/trace';
import type { Capability } from '../types/registry-contract';
import { formatEngineeringValue } from './format';
import { gammaAtFrequency } from './smith/hit';
import { angleAxisUnit, isLogUnit } from './units';
import { splitByBand } from './smith/band';
import type { SmithRun } from './smith/band';
import { gammaToPoint } from './smith/viewport';
import { smithRangeModel } from './smith-pane-model';
import type { SmithRange } from './smith/range';

export const POLAR_REFUSAL = 'Polar needs a complex network trace or an angle on X';
export type PolarKind = 'network' | 'pattern';
export type PolarRadius = Exclude<PolarSettings['radius'], 'auto'>;
type ResolvedPolarSettings = PolarSettings & { radius: PolarRadius };

export function polarRadius(radius: PolarSettings['radius'], traces: readonly Trace[]): PolarRadius {
  if (radius !== 'auto') return radius;
  return traces.length > 0 && traces.every(trace => angleAxisUnit(trace.units.x) && isPolarDbUnit(trace.units.y)) ? 'db' : 'linear';
}

function isPolarDbUnit(unit: string | null | undefined): boolean {
  return isLogUnit(unit) || /^db[id]$/i.test(unit?.trim() ?? '');
}

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
  return angleAxisUnit(trace.units.x) ? 'pattern' : null;
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
  const unit = angleAxisUnit(trace.units.x);
  if (!unit) return null;
  const degrees = unit === 'rad' ? 180 / Math.PI : 1;
  const samples = trace.data.map(point => ({ frequencyHz: point.freq, gamma: { re: point.amp, im: point.freq * degrees } }));
  const first = samples[0]?.gamma.im;
  const last = samples.at(-1)?.gamma.im;
  return {
    trace, kind: 'pattern', name: trace.file || trace.dn || trace.name, samples, sParameter: false,
    alreadyDb: isPolarDbUnit(trace.units.y),
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
  // dBi and dBd are antenna power gain relative to a reference antenna.
  const gainFactor = /^db[id]$/i.test(trace.trace.units.y?.trim() ?? '') ? 10 : 20;
  return {
    angle: value.im,
    linear: trace.alreadyDb ? 10 ** (value.re / gainFactor) : Math.max(0, value.re),
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

export function polarRings(maximum: number, { radius, manual }: PolarSettings): PolarRings {
  if (radius === 'db') {
    const max = manual?.dbTop ?? (Number.isFinite(maximum) ? Math.ceil(maximum / 10) * 10 || 0 : 0);
    const min = max - (manual?.dbRange ?? 40);
    const ticks = [max];
    for (let value = max - 10; value > min && ticks.length < 100; value -= 10) ticks.push(value);
    return { min, max, ticks };
  }
  const max = manual?.linearMax ?? niceCeiling(maximum > 0 && Number.isFinite(maximum) ? maximum : 1);
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

export function polarSamples(samples: readonly SmithSample[], trace: PolarTrace, rings: PolarRings, settings: ResolvedPolarSettings): SmithSample[] {
  return samples.map(sample => {
    const value = polarValue(sample.gamma, trace);
    return { ...sample, gamma: polarVector(value.angle, polarFraction(value, rings, settings.radius === 'db'), settings) };
  });
}

export function polarPlotModel(traces: readonly PolarTrace[], settings: ResolvedPolarSettings, linked: boolean, linkedRange: SmithRange | null) {
  const network = traces[0]?.kind === 'network';
  const range = network
    ? smithRangeModel(traces, linked ? null : settings.range, linkedRange, linked ? 'faint' : 'hidden')
    : { traces, band: linkedRange && { minHz: linkedRange.startHz, maxHz: linkedRange.stopHz }, full: null, range: null };
  const raw = range.traces.map(trace => ({ ...trace, runs: splitByBand(trace.samples, range.band) }));
  let maximum = -Infinity;
  for (const trace of raw) for (const run of trace.runs) {
    for (const sample of run.samples) {
      const value = polarValue(sample.gamma, trace);
      maximum = Math.max(maximum, settings.radius === 'db' ? value.db : value.linear);
    }
  }
  const rings = polarRings(maximum, settings);
  const plots = raw.map(trace => {
    const runs = trace.runs.map(run => ({ ...run, samples: polarSamples(run.samples, trace, rings, settings) }));
    return { ...trace, runs };
  });
  return { plots, rings, full: range.full, range: range.range };
}

/** Keep one measured sample per small screen cell when a dense curve's dots overlap. */
export function polarSampleDots(runs: readonly SmithRun[], viewport: SmithViewport) {
  const dots = new Map<string, { x: number; y: number; inBand: boolean }>();
  for (const run of runs) for (const sample of run.samples) {
    if (sample.synthetic || Math.hypot(sample.gamma.re, sample.gamma.im) > 1 + 1e-9) continue;
    const point = gammaToPoint(sample.gamma, viewport);
    if (!point || point.x < 0 || point.x > viewport.width || point.y < 0 || point.y > viewport.height) continue;
    const cell = `${Math.floor(point.x / 5)}:${Math.floor(point.y / 5)}`;
    const existing = dots.get(cell);
    if (!existing || (run.inBand && !existing.inBand)) dots.set(cell, { ...point, inBand: run.inBand });
  }
  return dots;
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
