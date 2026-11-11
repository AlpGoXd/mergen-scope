import type { SmithSample } from '../../types/smith-plot.ts';

/** The visible frequency range of a linked Hz pane. */
export interface SmithBand { readonly minHz: number; readonly maxHz: number }
/** A stretch of a trace that is wholly inside or wholly outside the band. */
export interface SmithRun { readonly inBand: boolean; readonly samples: readonly SmithSample[] }

const finiteSample = (s: SmithSample): boolean =>
  Number.isFinite(s.frequencyHz) && Number.isFinite(s.gamma.re) && Number.isFinite(s.gamma.im);

function lerpSample(a: SmithSample, b: SmithSample, frequencyHz: number): SmithSample {
  const t = (frequencyHz - a.frequencyHz) / (b.frequencyHz - a.frequencyHz);
  return { frequencyHz, synthetic: true, gamma: { re: a.gamma.re + (b.gamma.re - a.gamma.re) * t, im: a.gamma.im + (b.gamma.im - a.gamma.im) * t } };
}

function validBand(band: SmithBand | null | undefined): band is SmithBand {
  return !!band && Number.isFinite(band.minHz) && Number.isFinite(band.maxHz) && band.maxHz >= band.minHz;
}

/**
 * Split a trace into in-band and out-of-band runs. The band edges are interpolated, so the colour
 * changes exactly at the edge and neighbouring runs share that point (no gap in the drawn line).
 * Without a band the whole trace is one in-band run. Non-finite samples break a run.
 */
export function splitByBand(samples: readonly SmithSample[], band?: SmithBand | null): SmithRun[] {
  const runs: { inBand: boolean; samples: SmithSample[] }[] = [];
  let current: { inBand: boolean; samples: SmithSample[] } | null = null;
  const inside = (hz: number): boolean => !validBand(band) || (hz >= band.minHz && hz <= band.maxHz);
  const push = (inBand: boolean, from: SmithSample, to: SmithSample): void => {
    if (!current || current.inBand !== inBand) {
      current = { inBand, samples: [from] };
      runs.push(current);
    }
    current.samples.push(to);
  };

  let previous: SmithSample | null = null;
  for (const sample of samples) {
    if (!finiteSample(sample)) {
      if (previous && !current) runs.push({ inBand: inside(previous.frequencyHz), samples: [previous] });
      previous = null; current = null; continue;
    }
    if (!previous) {
      previous = sample;
      continue;
    }
    const a: SmithSample = previous, b = sample;
    const cuts: SmithSample[] = [a];
    if (validBand(band) && a.frequencyHz !== b.frequencyHz) {
      const lo = Math.min(a.frequencyHz, b.frequencyHz), hi = Math.max(a.frequencyHz, b.frequencyHz);
      const edges = [band.minHz, band.maxHz].filter((edge, index, all) => edge > lo && edge < hi && all.indexOf(edge) === index);
      edges.sort((p, q) => (b.frequencyHz > a.frequencyHz ? p - q : q - p));
      for (const edge of edges) cuts.push(lerpSample(a, b, edge));
    }
    cuts.push(b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const from = cuts[i], to = cuts[i + 1];
      if (!from || !to) continue;
      push(inside((from.frequencyHz + to.frequencyHz) / 2), from, to);
    }
    previous = sample;
  }

  if (previous && !current) runs.push({ inBand: inside(previous.frequencyHz), samples: [previous] });
  return runs;
}

const num = (v: number): string => String(Number(v.toFixed(7)));

/** Polyline path in chart space (re, −im). Non-finite samples break the line. */
export function samplesPath(samples: readonly SmithSample[]): string {
  let path = '';
  let pen = false;
  for (const sample of samples) {
    if (!finiteSample(sample)) { pen = false; continue; }
    path += `${pen ? 'L' : 'M'}${num(sample.gamma.re)},${num(-sample.gamma.im)}`;
    pen = true;
  }
  return path;
}
