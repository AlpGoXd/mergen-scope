import type { SmithSample } from '../../types/smith-plot';
import { splitByBand } from './band';
import { engineeringScale, formatEng, parseEngInput } from '../units';

export interface SmithRange { readonly startHz: number; readonly stopHz: number }

export function fullRangeOf(traces: readonly { samples: readonly SmithSample[] }[]): SmithRange | null {
  let startHz = Infinity, stopHz = -Infinity;
  for (const trace of traces) for (const sample of trace.samples) {
    if (!Number.isFinite(sample.frequencyHz) || !Number.isFinite(sample.gamma.re) || !Number.isFinite(sample.gamma.im)) continue;
    startHz = Math.min(startHz, sample.frequencyHz);
    stopHz = Math.max(stopHz, sample.frequencyHz);
  }
  return startHz <= stopHz ? { startHz, stopHz } : null;
}

export function clipTraceToRange(samples: readonly SmithSample[], range: SmithRange): readonly (readonly SmithSample[])[] {
  if (!Number.isFinite(range.startHz) || !Number.isFinite(range.stopHz) || range.startHz > range.stopHz) return [];
  const chunks: SmithSample[][] = [];
  let chunk: SmithSample[] = [];
  for (const sample of samples) {
    if (Number.isFinite(sample.frequencyHz) && Number.isFinite(sample.gamma.re) && Number.isFinite(sample.gamma.im)) chunk.push(sample);
    else if (chunk.length) { chunks.push(chunk); chunk = []; }
  }
  if (chunk.length) chunks.push(chunk);
  const visible = chunks.flatMap(part => {
    const runs = splitByBand(part, { minHz: range.startHz, maxHz: range.stopHz });
    const intersections = runs.flatMap((run, index) => {
      if (run.inBand) return [[...run.samples]];
      return run.samples.flatMap((point, pointIndex) => {
        if (point.frequencyHz < range.startHz || point.frequencyHz > range.stopHz) return [];
        if ((pointIndex === 0 && runs[index - 1]?.inBand) || (pointIndex === run.samples.length - 1 && runs[index + 1]?.inBand)) return [];
        if (pointIndex > 0 && run.samples[pointIndex - 1]?.frequencyHz === point.frequencyHz) return [];
        return [[point]];
      });
    });
    if (range.startHz !== range.stopHz) return intersections;
    const unique: SmithSample[] = [];
    for (const run of intersections) for (const point of run) {
      if (!unique.some(other => other.frequencyHz === point.frequencyHz && other.gamma.re === point.gamma.re && other.gamma.im === point.gamma.im)) unique.push(point);
    }
    return unique.map(point => [point]);
  });
  if (range.startHz === range.stopHz) {
    return visible.flatMap(run => run.length ? [run.slice(0, 1)] : []);
  }
  return visible;
}

export function effectiveRange({ manual, linked, full }: { manual: SmithRange | null; linked: SmithRange | null; full: SmithRange | null }): SmithRange | null {
  return linked ?? manual ?? full;
}

export const parseRangeInput = (text: string, unit = 'Hz') => parseEngInput(text, { baseUnit: unit });

export function handleToHz(px: number, track: { left: number; width: number }, full: SmithRange): number {
  const fraction = track.width > 0 ? Math.max(0, Math.min(1, (px - track.left) / track.width)) : 0;
  return full.startHz + fraction * (full.stopHz - full.startHz);
}

export function hzToHandle(hz: number, track: { left: number; width: number }, full: SmithRange): number {
  const span = full.stopHz - full.startHz;
  return track.left + (span > 0 ? Math.max(0, Math.min(1, (hz - full.startHz) / span)) : 0) * Math.max(0, track.width);
}

export function rangeLabel(range: SmithRange, full: SmithRange): string {
  const end = formatEng(range.stopHz, 'Hz', 0);
  const unit = end.split(' ')[1] ?? 'Hz';
  const factor = engineeringScale(range.stopHz);
  const value = (hz: number) => (hz / factor).toFixed(3).replace('-', '−');
  const compact = (hz: number) => formatEng(hz, 'Hz', 0).replace(/(\.\d*?[1-9])0+(?= )/, '$1');
  const fullStart = full.startHz === 0 ? '0' : compact(full.startHz);
  const fullEnd = compact(full.stopHz);
  const compactStart = fullStart.endsWith(` ${fullEnd.split(' ')[1]}`) ? fullStart.split(' ')[0] : fullStart;
  return `${value(range.startHz)} → ${value(range.stopHz)} ${unit} of ${compactStart}–${fullEnd}`;
}
