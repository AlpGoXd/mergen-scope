// Presentation data for analysis cards: turns a tool's raw outputs into the strings the Analysis kit shows
// (key/value rows, the headline result, crossing groups). Pure: no React, no stores; every number goes through formatEng.
import type { AnalysisOutput } from '../../types/registry-contract';
import type { AnalysisInstance } from '../../types/analysis-instance';
import type { InstanceResult } from './instances';
import type { Trace } from '../../types/trace';
import type { TraceMathOp } from '../trace-math-units';
import { traceMathUnit } from '../trace-math-units';
import { formatCrossingValue, significantStep } from './crossing-rows';

export interface CardUnits { x: string | null | undefined; y: string | null | undefined }
export interface CardRow { label: string; value: string }
export interface CardResult { value: string; unit?: string; note?: string }
export interface CardNumbersView { result?: CardResult; rows: CardRow[]; summary: string }

export function traceMathAdvice(operation: TraceMathOp, a: Trace, b: Trace): string | undefined {
  return traceMathUnit(a.units.y, b.units.y, operation).warning;
}

const X_DIGITS = 6;
const Y_DIGITS = 4;

const fmtX = (value: number, units: CardUnits): string => formatCrossingValue(value, units.x ?? 'Hz', significantStep(value, X_DIGITS));
const fmtY = (value: number, units: CardUnits): string => formatCrossingValue(value, units.y, significantStep(value, Y_DIGITS));
const fmtPlain = (value: number, digits = 3): string => formatCrossingValue(value, null, significantStep(value, digits));

/** "86.2 MHz" -> { value: "86.2", unit: "MHz" } (the unit stays muted in the kit). */
export function splitUnit(text: string): { value: string; unit?: string } {
  const space = text.lastIndexOf(' ');
  if (space <= 0) return { value: text };
  const unit = text.slice(space + 1);
  return /^[\d.,−+-]/.test(unit) ? { value: text } : { value: text.slice(0, space), unit };
}

function numbersOf(outputs: readonly AnalysisOutput[]): Readonly<Record<string, number>> | null {
  const found = outputs.find(output => output.type === 'numbers');
  return found && found.type === 'numbers' ? found.values : null;
}

/** Rows, headline and collapsed summary for the numeric (Measure) tools. */
export function describeNumbers(toolId: string, outputs: readonly AnalysisOutput[], units: CardUnits): CardNumbersView | null {
  const v = numbersOf(outputs);
  const table = outputs.find(output => output.type === 'table');
  if (toolId === 'peak-table' && table && table.type === 'table') {
    const rows = table.rows.map(row => ({ label: `#${String(row[0])} · ${fmtX(Number(row[1]), units)}`, value: fmtY(Number(row[2]), units) }));
    return { rows, summary: `${rows.length} peak${rows.length === 1 ? '' : 's'}` };
  }
  if (!v) return null;
  const at = (y: number, x: number): string => `${fmtY(y, units)} @ ${fmtX(x, units)}`;
  switch (toolId) {
    case 'bandwidth': {
      const bandwidth = fmtX(v['bandwidth'] ?? NaN, units);
      return { result: { ...splitUnit(bandwidth), note: `centre ${fmtX(v['centre'] ?? NaN, units)} · ${fmtX(v['left'] ?? NaN, units)} → ${fmtX(v['right'] ?? NaN, units)}` },
        rows: [{ label: 'Reference', value: at(v['refAmp'] ?? NaN, v['refX'] ?? NaN) }], summary: bandwidth };
    }
    case 'range-stats':
      return { rows: [
        { label: 'Maximum', value: at(v['max'] ?? NaN, v['maxX'] ?? NaN) }, { label: 'Minimum', value: at(v['min'] ?? NaN, v['minX'] ?? NaN) },
        { label: 'Average', value: fmtY(v['average'] ?? NaN, units) }, { label: 'Span', value: fmtX(v['span'] ?? NaN, units) },
        { label: 'Samples', value: String(v['count'] ?? 0) },
      ], summary: `max ${fmtY(v['max'] ?? NaN, units)}` };
    case 'ripple': {
      const ripple = fmtY(v['ripple'] ?? NaN, units);
      return { result: splitUnit(ripple), rows: [
        { label: 'Maximum', value: fmtY(v['max'] ?? NaN, units) }, { label: 'Minimum', value: fmtY(v['min'] ?? NaN, units) }, { label: 'Span', value: fmtX(v['span'] ?? NaN, units) },
      ], summary: ripple };
    }
    case 'noise-psd':
      return { rows: [
        { label: 'Peak density', value: fmtY(v['peak'] ?? NaN, units) }, { label: 'Average', value: fmtY(v['avg'] ?? NaN, units) },
        { label: 'Minimum', value: fmtY(v['min'] ?? NaN, units) }, { label: 'RBW', value: fmtX(v['rbw'] ?? NaN, units) },
      ], summary: `avg ${fmtY(v['avg'] ?? NaN, units)}` };
    case 'ip3': {
      const oip3 = formatCrossingValue(v['oip3_avg'] ?? NaN, 'dBm', significantStep(v['oip3_avg'] ?? 0, Y_DIGITS));
      return { result: { ...splitUnit(oip3), note: 'OIP3, average of the two IM3 products' }, rows: [
        { label: 'OIP3 lower', value: formatCrossingValue(v['oip3_l'] ?? NaN, 'dBm', 0.01) }, { label: 'OIP3 upper', value: formatCrossingValue(v['oip3_u'] ?? NaN, 'dBm', 0.01) },
        { label: 'Delta lower', value: formatCrossingValue(v['deltaL'] ?? NaN, 'dB', 0.01) }, { label: 'Delta upper', value: formatCrossingValue(v['deltaU'] ?? NaN, 'dB', 0.01) },
        ...(v['iip3'] !== undefined ? [{ label: 'IIP3', value: formatCrossingValue(v['iip3'], 'dBm', 0.01) }] : []),
      ], summary: oip3 };
    }
    case 'occupied-bandwidth': {
      const bandwidth = fmtX(v['bandwidth'] ?? NaN, units);
      return { result: { ...splitUnit(bandwidth), note: `${fmtPlain(v['percent'] ?? NaN, 4)} % · ${fmtX(v['lower'] ?? NaN, units)} → ${fmtX(v['upper'] ?? NaN, units)}` }, rows: [], summary: bandwidth };
    }
    case 'channel-power': {
      const power = formatCrossingValue(v['powerDbm'] ?? NaN, 'dBm', 0.001);
      return { result: { ...splitUnit(power), note: `${formatCrossingValue(v['powerDbw'] ?? NaN, 'dBW', 0.001)}` }, rows: [], summary: power };
    }
    case 'reciprocity-isolation':
      return { rows: [
        { label: 'Worst reciprocity error', value: formatCrossingValue(v['reciprocityError'] ?? NaN, 'dB', 0.001) },
        { label: 'Average reciprocity error', value: formatCrossingValue(v['averageReciprocityErrorDb'] ?? NaN, 'dB', 0.001) },
        { label: 'Worst isolation', value: formatCrossingValue(v['worstIsolationDb'] ?? NaN, 'dB', 0.001) },
        { label: 'Samples', value: String(v['count'] ?? 0) },
      ], summary: `${formatCrossingValue(v['worstIsolationDb'] ?? NaN, 'dB', 0.01)} isolation` };
    case 'stability':
      return { rows: [
        { label: 'Min K', value: fmtPlain(v['minK'] ?? NaN, 4) }, { label: 'Min μ1', value: fmtPlain(v['minMu1'] ?? NaN, 4) }, { label: 'Min μ2', value: fmtPlain(v['minMu2'] ?? NaN, 4) },
        { label: '|Δ| min → max', value: `${fmtPlain(v['minDelta'] ?? NaN, 4)} → ${fmtPlain(v['maxDelta'] ?? NaN, 4)}` },
        { label: 'Unstable points', value: `${v['unstableCount'] ?? 0} of ${v['count'] ?? 0}` },
      ], summary: (v['unstableCount'] ?? 0) === 0 ? 'unconditionally stable' : `${v['unstableCount']} unstable` };
    default:
      return { rows: Object.entries(v).map(([label, value]) => ({ label, value: fmtPlain(value) })), summary: '' };
  }
}

export interface CrossingRowInput { paneId: string; traceName: string; value: number }
export interface CrossingGroupView { paneId: string; rows: { id: string; traceName: string; value: string }[] }

/** Crossings grouped by pane, only the value that changes formatted: y for a V line, x for an H line or a level. */
export function describeCrossings(rows: readonly CrossingRowInput[], paneOrder: readonly string[], units: CardUnits, valueIs: 'x' | 'y', cap = 200): { groups: CrossingGroupView[]; total: number; capNote?: string } {
  const fmt = valueIs === 'x' ? fmtX : fmtY;
  const byPane = new Map<string, CrossingGroupView>();
  let shown = 0;
  rows.forEach((row, index) => {
    if (shown >= cap) return;
    shown += 1;
    const group = byPane.get(row.paneId) ?? { paneId: row.paneId, rows: [] };
    group.rows.push({ id: `${row.paneId}:${row.traceName}:${index}`, traceName: row.traceName, value: fmt(row.value, units) });
    byPane.set(row.paneId, group);
  });
  const order = (id: string): number => { const i = paneOrder.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const groups = [...byPane.values()].sort((a, b) => order(a.paneId) - order(b.paneId));
  return { groups, total: rows.length, ...(rows.length > cap ? { capNote: `Showing ${cap} of ${rows.length}` } : {}) };
}

/** The complete measure presentation, shared by cards and domain tests. */
export function describeInstance(instance: AnalysisInstance, result: InstanceResult, units: CardUnits, options: { paneOrder?: readonly string[]; paneId?: string; traceName?: string; lineType?: 'v' | 'h' } = {}) {
  if (result.reason) return { message: result.reason, numbers: null, crossings: null, valueLabel: 'X' };
  const outputs = result.outputs ?? [];
  const isLine = instance.toolId === 'line-crossings';
  const isCrossings = isLine || instance.toolId === 'crossings';
  const numbers = isCrossings ? null : describeNumbers(instance.toolId, outputs, units);
  const table = outputs.find(output => output.type === 'table');
  const vertical = isLine && options.lineType === 'v';
  const crossings = isCrossings && table?.type === 'table' && (!isLine || options.lineType)
    ? describeCrossings(table.rows.map(row => isLine
      ? { paneId: String(row[0]), traceName: String(row[1]), value: Number(row[2]) }
      : { paneId: options.paneId ?? 'pane-1', traceName: options.traceName ?? '', value: Number(row[0]) }), options.paneOrder ?? [], units, vertical ? 'y' : 'x')
    : null;
  const message = !crossings && !numbers?.result && !numbers?.rows.length ? 'Nothing to measure on this trace.' : undefined;
  return { message, numbers, crossings, valueLabel: vertical ? 'Y' : 'X' };
}

/** "Copy as CSV" text for a crossings list. */
export function crossingsCsv(groups: readonly CrossingGroupView[], paneLabel: (paneId: string) => string, valueLabel: string): string {
  const lines = [`Pane,Trace,${valueLabel}`];
  for (const group of groups) for (const row of group.rows) lines.push([paneLabel(group.paneId), row.traceName, row.value].map(cell => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(','));
  return lines.join('\n');
}

/** Plain-text "Copy results" for a card. */
export function resultsText(title: string, view: CardNumbersView | null): string {
  if (!view) return title;
  return [title, ...(view.result ? [`${view.result.value}${view.result.unit ? ` ${view.result.unit}` : ''}${view.result.note ? ` (${view.result.note})` : ''}`] : []), ...view.rows.map(row => `${row.label}: ${row.value}`)].join('\n');
}
