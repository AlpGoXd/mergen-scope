import { formatEng } from "../format";
import type { LineIntersection } from "../ref-lines";
import type { ThresholdCrossing } from "./threshold";

export interface CrossingRowView {
  key: string;
  name: string;
  x: string;
  y?: string;
}

export function formatCrossingValue(value: number, unit: string | null | undefined, step: number): string {
  return Number.isFinite(value) ? formatEng(value, unit, step) : "--";
}

/** Tick step that keeps `digits` significant digits of `value` (each value gets its own, so close crossings stay distinguishable). */
export function significantStep(value: number, digits: number): number {
  return Number.isFinite(value) && value !== 0 ? 10 ** (Math.floor(Math.log10(Math.abs(value))) - (digits - 1)) : 0;
}

const X_DIGITS = 6;
const Y_DIGITS = 4;
const MAX_ROWS = 50;

export function lineCrossingRows(
  points: readonly LineIntersection[],
  units: Readonly<Record<string, { xUnit?: string | null; yUnit?: string | null }>>,
  panes: Readonly<Record<string, string>>,
  traceLabels: Readonly<Record<string, string>> = {},
): CrossingRowView[] {
  return points.slice(0, MAX_ROWS).map((p, i) => {
    const u = units[p.traceName];
    const label = traceLabels[p.traceName] || p.traceName;
    return {
      key: `${p.traceName}-${p.paneId}-${i}`,
      name: `${label} · ${panes[p.paneId] || p.paneId}`,
      x: formatCrossingValue(p.freq, u?.xUnit, significantStep(p.freq, X_DIGITS)),
      y: formatCrossingValue(p.amp, u?.yUnit, significantStep(p.amp, Y_DIGITS)),
    };
  });
}

export function manualCrossingRows(points: readonly ThresholdCrossing[], traceName: string, xUnit: string | null | undefined): CrossingRowView[] {
  return points.slice(0, MAX_ROWS).map((p, i) => ({
    key: `${traceName}-${i}`,
    name: `${traceName} · ${p.mode}`,
    x: formatCrossingValue(p.freq, xUnit, significantStep(p.freq, X_DIGITS)),
  }));
}

