import type { Trace } from '../types/trace';
import type { PresetId } from './pane-layout';
import { shortName } from './footer-state';
import { angleAxisUnit, isDecibelGain, isLinearGain } from './units';

const PREFIXES: Readonly<Record<number, string>> = { [-12]: 'p', [-9]: 'n', [-6]: 'µ', [-3]: 'm', 0: '', 3: 'k', 6: 'M', 9: 'G', 12: 'T' };

export interface ExportAxis {
  title: string;
  annotation: string;
  offset: number;
  factor: number;
  digits: number;
}

const prefixPower = (value: number) => Math.min(12, Math.max(-12, 3 * Math.floor((Math.log10(value || 1) + 1e-10) / 3)));

export function engineeringExportAxis(quantity: string, unit: string, range: readonly [number, number], ticks: readonly number[] = []): ExportAxis {
  const [min, max] = range;
  const magnitude = Math.max(Math.abs(min), Math.abs(max));
  const span = max - min;
  const prefixable = /^(Hz|s|V|W|A|Ω|Ohm|S|F|H)$/.test(unit);
  const narrow = prefixable && span > 0 && magnitude / span >= 1000;
  const offsetStep = narrow ? 10 ** (Math.floor(Math.log10(span)) + 1) : 1;
  const center = min + span / 2;
  const roundBase = Math.round(center / (offsetStep * 10)) * offsetStep * 10;
  const offset = !narrow ? 0 : Math.abs(roundBase - center) <= span ? roundBase : Math.round(center / offsetStep) * offsetStep;
  const exp = prefixable ? prefixPower(narrow ? Math.max(Math.abs(min - offset), Math.abs(max - offset)) : magnitude) : 0;
  const factor = 10 ** exp;
  const step = ticks.length > 1 ? Math.abs(ticks[1]! - ticks[0]!) : span / 4;
  let digits = step > 0 ? Math.max(0, Math.min(9, Math.ceil(-Math.log10(step / factor) - 1e-9))) : 0;
  const values = ticks.map(value => (value - offset) / factor);
  const tolerance = Math.max(1e-9, magnitude / factor * Number.EPSILON * 8);
  while (digits < 9 && values.some(value => Math.abs(Number(value.toFixed(digits)) - value) > tolerance)) digits++;
  const offExp = prefixPower(Math.abs(offset));
  const normalizedUnit = unit === 'Ohm' ? 'Ω' : unit;
  const offsetLabel = offset ? ` ${offset < 0 ? '+' : '−'} ${Number((Math.abs(offset) / 10 ** offExp).toPrecision(15))} ${PREFIXES[offExp]}${normalizedUnit}` : '';
  const suffix = unit ? ` (${PREFIXES[exp]}${normalizedUnit})` : '';
  const annotation = (offsetLabel + suffix).trim();
  return { title: quantity + offsetLabel + suffix, annotation, offset, factor, digits };
}

/**
 * A Y title that fits the plot height in an export image: the whole title, else only its trailing "(unit)",
 * else nothing (the same fallback the screen uses). `charPx` is the average character width.
 */
export function fitAxisTitle(title: string, roomPx: number, charPx: number): string {
  if (title.length * charPx <= roomPx) return title;
  const unit = title.match(/\([^()]+\)\s*$/u)?.[0]?.trim() ?? '';
  return unit && unit.length * charPx <= roomPx ? unit : '';
}

export function exportAxisTitle(axis: ExportAxis, mode: 'auto' | 'edit' | 'off', custom?: string): string {
  if (mode === 'off') return axis.offset || axis.factor !== 1 ? axis.annotation : '';
  const title = custom?.trim();
  if (mode !== 'edit' || !title) return axis.title;
  if (!axis.annotation || title.endsWith(axis.annotation)) return title;
  const quantity = title.replace(/\s*\((?:[pnumkMGTµ]?(?:Hz|s|V|W|A|Ω|Ohm|S|F|H)|dB(?:m|W)?|deg)\)\s*$/u, '');
  return `${quantity} ${axis.annotation}`.trim();
}

export function exportTick(axis: ExportAxis, value: number): string {
  const scaled = (value - axis.offset) / axis.factor;
  return (Math.abs(scaled) < 0.5 * 10 ** -axis.digits ? 0 : scaled).toFixed(axis.digits);
}

export function autoExportAxes(trace: Trace | undefined, x: readonly [number, number], y: readonly [number, number], xTicks?: readonly number[], yTicks?: readonly number[], mixedY = false) {
  const time = trace?.domain === 'time';
  const angle = angleAxisUnit(trace?.units.x);
  const xUnit = angle ?? (trace?.units.x || (time ? 's' : 'Hz'));
  const linearGain = !mixedY && isLinearGain(xUnit, trace?.units.y);
  const yUnit = mixedY ? '' : linearGain ? 'ratio' : trace?.units.y || '';
  const network = trace?.kind === 'raw' ? trace.networkSource : undefined;
  const normalized = yUnit.toLowerCase();
  const quantity = mixedY ? 'Amplitude' : linearGain || isDecibelGain(xUnit, yUnit) ? 'Gain' : /^(dbm|dbw|w|w\/hz|dbm\/hz)$/.test(normalized) ? 'Power' :
    /^(v|mv|µv)$/.test(normalized) ? 'Voltage' : normalized === 'a' ? 'Current' :
      normalized === 'ohm' || normalized === 'ω' ? 'Impedance' :
        network?.view === 'Phase' || normalized === 'deg' ? 'Phase' :
          network?.view === 'Group delay' ? 'Group delay' :
            network?.view === 'Real' ? 'Real' : network?.view === 'Imag' ? 'Imaginary' :
              normalized === 'db' || network?.view === 'Mag' ? 'Magnitude' : 'Amplitude';
  const xQuantity = angle ? 'Angle' : time ? 'Time' : xUnit === 'Hz' ? 'Frequency' : 'X';
  return { x: engineeringExportAxis(xQuantity, xUnit, x, xTicks), y: engineeringExportAxis(quantity, yUnit, y, yTicks) };
}

/** Match the user-facing parameter/view label used in the Traces list for automatic network traces. */
export function exportTraceName(trace: Trace, shorten = false): string {
  const label = trace.dn || trace.automaticDisplayName || 'Trace';
  const network = trace.kind === 'raw' ? trace.networkSource : undefined;
  const automatic = trace.automaticDisplayName === label || (!trace.automaticDisplayName && !!trace.file && label.startsWith(trace.file + ' '));
  const views: Readonly<Record<string, string>> = { 'magnitude-db': 'dB', 'magnitude-linear': 'Mag', phase: 'Phase', real: 'Re', imag: 'Im', vswr: 'VSWR', 'return-loss': 'Return loss', 'group-delay': 'Group delay' };
  const rawView = network?.view ?? '';
  const view = views[rawView] ?? (rawView === 'Real' ? 'Re' : rawView === 'Imag' ? 'Im' : rawView);
  const display = automatic && network?.family && network.row !== undefined && network.col !== undefined
    ? `${network.family}${network.row + 1}${network.col + 1}${view ? ` · ${view}` : ''}`
    : label;
  const smooth = trace.kind === 'derived' && trace.operationType === 'smooth' && (automatic || !trace.automaticDisplayName) ? /(?:^| · )(smoothed · .+)$/u.exec(display) : null;
  const name = smooth?.[1] ?? display;
  return shorten ? shortName(name) : name;
}

export function groupExportLegends<T extends { id: string }>(panes: readonly { id: string; traces: readonly T[] }[]): Map<string, T[]> {
  return new Map(panes.map(pane => [pane.id, [...new Map(pane.traces.map(trace => [trace.id, trace])).values()]]));
}

export interface LabelAnchor { x: number; y: number; width: number; height: number }
export interface LabelBox { x: number; y: number; width: number; height: number }

/** Keep labels inside the pane, trying vertical stacks and both sides of each anchor. */
export function placeExportLabels(labels: readonly LabelAnchor[], width: number, height: number): (LabelBox | null)[] {
  const placed: LabelBox[] = [];
  const padding = 3;
  const gap = 3;
  return labels.map(label => {
    if (label.width + padding * 2 > width || label.height + padding * 2 > height) return null;
    const xs = [label.x - label.width / 2, label.x + 7, label.x - label.width - 7].map(x => Math.max(padding, Math.min(width - label.width - padding, x)));
    for (let row = 0; row * (label.height + gap) < height; row++) {
      const distance = 8 + row * (label.height + gap);
      for (const y of [label.y - distance - label.height, label.y + distance]) {
        if (y < padding || y + label.height > height - padding) continue;
        for (const x of xs) {
          if (placed.some(box => x < box.x + box.width + gap && x + label.width + gap > box.x && y < box.y + box.height + gap && y + label.height + gap > box.y)) continue;
          const box = { x, y, width: label.width, height: label.height };
          placed.push(box);
          return box;
        }
      }
    }
    return null;
  });
}

export function exportGroupLayout(layout: PresetId, count: number) {
  if (layout === 'one-side' && count > 1) return { columns: 1, rows: count - 1, separateMain: true };
  const columns = layout === 'columns' ? Math.max(1, count) : layout === 'grid' ? Math.min(2, Math.max(1, count)) : 1;
  return { columns, rows: Math.max(1, Math.ceil(count / columns)), separateMain: false };
}
