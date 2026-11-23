// ============================================================================
// Mergen Scope — Import wizard rules (pure)
// ============================================================================
// Column roles, why Add is unavailable, preview range summary, and Edit columns.
// ============================================================================

import type { ColumnIdentity, WizardConfig } from "../types/file.ts";
import { sweepBands } from "./sweep-bands.ts";
import type { TraceDomain, DataPoint } from "../types/trace.ts";
import { baseXUnit, detectXUnit, detectYUnit, findXUnit, findYUnit, storedXUnit, storedYUnit } from "./import-units.ts";
import { formatAdaptiveXAxisValue, formatScalarWithUnit } from "./format.ts";
import { columnHeaders, contentLines, numericColumns, splitCells } from "./parsers/tabular-detect.ts";
import { normalizeTraceData } from "./parsers/helpers.ts";
import { decimateMinMax } from "./trace-math.ts";

export type ColumnRole = "x" | "y" | "skip";

export function columnRole(config: Pick<WizardConfig, "xCol" | "yCols">, col: number): ColumnRole {
  if (col === config.xCol && config.xCol >= 0) return "x";
  return config.yCols.includes(col) ? "y" : "skip";
}

/** Give a column a role. There is one X: a new X demotes the old one to skip. */
export function setColumnRole(config: WizardConfig, col: number, role: ColumnRole): WizardConfig {
  const yCols = config.yCols.filter((item) => item !== col);
  if (role === "x") return { ...config, xCol: col, yCols };
  const xCol = config.xCol === col ? -1 : config.xCol;
  return { ...config, xCol, yCols: role === "y" ? [...yCols, col].sort((a, b) => a - b) : yCols };
}

/** Switching domain resets X to the new domain's base unit. */
export function setDomain(config: WizardConfig, domain: TraceDomain): WizardConfig {
  if (domain === config.domain) return config;
  return { ...config, domain, xUnit: baseXUnit(domain), xMult: 1 };
}

/** Picking any X unit sets xUnit, xMult, and the matching internal domain automatically. */
export function setXUnit(config: WizardConfig, unitId: string): WizardConfig {
  const unit = findXUnit(unitId);
  return unit ? { ...config, domain: unit.domain, xUnit: unit.id, xMult: unit.factor } : config;
}

/** Picking a Y unit sets yUnit and yMult; passing undefined resets to "from column names". */
export function setYUnit(config: WizardConfig, unitId: string | undefined): WizardConfig {
  if (unitId === undefined) {
    const { yUnit: _removed, ...rest } = config;
    return { ...rest, yMult: 1 };
  }
  const unit = findYUnit(unitId);
  return unit ? { ...config, yUnit: unit.id, yMult: unit.factor } : config;
}

/** True when the multiplier is not the one the picked unit implies (the advanced ×N field was used). */
export function hasCustomMultiplier(config: WizardConfig, axis: "x" | "y"): boolean {
  if (axis === "x") {
    const unit = findXUnit(config.xUnit);
    return unit ? unit.factor !== config.xMult : config.xMult !== 1;
  }
  const unit = findYUnit(config.yUnit);
  return unit ? unit.factor !== config.yMult : config.yMult !== 1;
}

export interface WizardLayout {
  readonly lines: readonly string[];
  readonly headers: readonly string[];
  readonly numeric: readonly number[];
}

export function wizardLayout(text: string, config: Pick<WizardConfig, "delimiter" | "valueDelimiter" | "skipRows">): WizardLayout {
  const lines = contentLines(text);
  const headers = columnHeaders(lines, config, config.skipRows);
  return { lines, headers, numeric: numericColumns(lines, config, config.skipRows, headers.length) };
}

/** Why the main button is unavailable, or null when the settings can import. */
export function wizardBlocker(config: WizardConfig, layout: WizardLayout): string | null {
  if (layout.numeric.length === 0) return "No numeric columns with these settings. Check the separators and skipped rows.";
  if (config.xCol < 0 || config.xCol >= layout.headers.length) return "No X column. Click a column chip and pick X.";
  if (!layout.numeric.includes(config.xCol)) return "The X column has no numbers. Pick another X column.";
  const yCols = config.yCols.filter((col) => col < layout.headers.length);
  if (yCols.length === 0) return "No Y column. Click a column chip and pick Y.";
  if (!yCols.some((col) => layout.numeric.includes(col))) return "No Y column has numbers. Pick a numeric column as Y.";
  return null;
}

/** Y columns that can produce a trace. */
export function importableYCols(config: WizardConfig, layout: WizardLayout): number[] {
  return config.yCols.filter((col) => col !== config.xCol && layout.numeric.includes(col));
}

/** Same identity rule as the replacement logic: header when the file has names, else the column index. */
export function identityMatches(identity: ColumnIdentity, col: number, headers: readonly string[], named: boolean): boolean {
  return identity.header !== undefined ? named && headers[col] === identity.header : col === identity.index;
}

/** Whether the header row is real names (not "Column N" placeholders). */
export function hasColumnNames(config: Pick<WizardConfig, "skipRows">, headers: readonly string[]): boolean {
  return config.skipRows > 0 && headers.some((header, idx) => header !== `Column ${idx + 1}`);
}

/** For Edit columns: which existing column each new Y column continues (index into `prior`), or -1 for a new trace. */
export function matchPriorColumns(prior: readonly ColumnIdentity[], yCols: readonly number[], headers: readonly string[], named: boolean): number[] {
  const taken = new Set<number>();
  return yCols.map((col) => {
    const index = prior.findIndex((identity, i) => !taken.has(i) && identityMatches(identity, col, headers, named));
    if (index >= 0) taken.add(index);
    return index;
  });
}

/** "10 000" with a narrow no-break space between thousands. */
export function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** "first 8 of 10 000 rows · rows 1–2 skipped". */
export function previewCaption(shown: number, total: number, skipRows: number): string {
  const rows = `first ${formatCount(shown)} of ${formatCount(total)} row${total === 1 ? "" : "s"}`;
  if (skipRows <= 0) return rows;
  return `${rows} · ${skipRows === 1 ? "row 1" : `rows 1–${skipRows}`} skipped`;
}

/** "CH1", "CH2 and CH3", "CH1, CH2 and CH3". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Header as shown in the wizard: adds the picked unit when the file's own name carries none,
 * and annotates overrides ("Time (s) → ms") when the user chose a different unit than the header states.
 */
export function columnDisplayName(header: string, role: ColumnRole, config: Pick<WizardConfig, "xUnit" | "yUnit">): string {
  if (role === "skip") return header;
  const unit = role === "x" ? config.xUnit : config.yUnit;
  if (unit === undefined) return header;
  const bracketMatch = header.match(/[([]([^)\]]+)[)\]]/);
  if (!bracketMatch) return unit ? `${header} (${unit})` : header;
  const existing = (bracketMatch[1] ?? "").trim();
  const detectedExisting = role === "x" ? detectXUnit(header)?.unit : detectYUnit(header);
  const sameUnit = existing.toLowerCase() === unit.toLowerCase()
    || (detectedExisting !== null && detectedExisting !== undefined && detectedExisting === unit);
  if (sameUnit) return header;
  return unit ? `${header} → ${unit}` : `${header} → no unit`;
}

/** Above this many data rows the plot reads every k-th row, so the dialog stays responsive. */
export const PLOT_MAX_ROWS = 500_000;
/** Min/max buckets across the plot: about one per pixel column of the preview plot. */
export const PLOT_BUCKETS = 600;

export interface NumericTable {
  /** Data rows in the file (after the skipped rows). */
  readonly total: number;
  /** 1 = every row was read; k = every k-th row. */
  readonly stride: number;
  /** One column of numbers per file column (NaN where a cell is empty or not a number). */
  readonly columns: readonly Float64Array[];
}

/** Read the data rows once as numbers; done again only when Delimiter or Skip rows changes. */
export function readNumericTable(lines: readonly string[], delimiter: string | Pick<WizardConfig, "delimiter" | "valueDelimiter">, skipRows: number, width: number, maxRows = PLOT_MAX_ROWS): NumericTable {
  const start = Math.max(0, skipRows);
  const total = Math.max(0, lines.length - start);
  const stride = Math.max(1, Math.ceil(total / Math.max(1, maxRows)));
  const count = Math.ceil(total / stride);
  const columns = Array.from({ length: Math.max(0, width) }, () => new Float64Array(count).fill(Number.NaN));
  for (let row = 0; row < count; row++) {
    const line = lines[start + row * stride];
    if (line === undefined) continue;
    const cells = splitCells(line, delimiter);
    for (let col = 0; col < columns.length; col++) {
      const cell = cells[col]?.trim();
      const column = columns[col];
      if (!column || cell === undefined || cell === "") continue;
      const value = Number(cell);
      if (Number.isFinite(value)) column[row] = value;
    }
  }
  return { total, stride, columns };
}

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export interface OverviewPlot {
  /** One polyline per measured band, grouped by Y column, on a shared normalized scale. */
  readonly series: readonly (readonly (readonly { x: number; y: number }[])[])[];
  /** Where the rows shown in the table sit along X (0–1), or null without data. */
  readonly band: { readonly from: number; readonly to: number } | null;
  /** Unscaled X range across the plotted points, or null without data. */
  readonly xRange: NumericRange | null;
  /** Unscaled Y range across all selected Y columns, or null without data. */
  readonly yRange: NumericRange | null;
}

/**
 * The whole file as the importer will read it (sorted by X, duplicate X → last value), reduced to the
 * lowest and highest point per bucket so spikes and the overall shape both survive.
 */
export function overviewPlot(table: NumericTable, xCol: number, yCols: readonly number[], tableRows: number, buckets = PLOT_BUCKETS, splitBands = false): OverviewPlot {
  const xs = table.columns[xCol];
  if (!xs) return { series: yCols.map(() => []), band: null, xRange: null, yRange: null };
  const data = yCols.map((col) => {
    const ys = table.columns[col];
    const points: DataPoint[] = [];
    if (ys) for (let i = 0; i < xs.length; i++) points.push({ freq: xs[i] ?? Number.NaN, amp: ys[i] ?? Number.NaN });
    return normalizeTraceData(points);
  });
  let x0 = Infinity; let x1 = -Infinity;
  for (const line of data) {
    const first = line[0]; const last = line[line.length - 1];
    if (first && first.freq < x0) x0 = first.freq;
    if (last && last.freq > x1) x1 = last.freq;
  }
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) return { series: yCols.map(() => []), band: null, xRange: null, yRange: null };
  const reduced = data.map((line) => (splitBands ? sweepBands(line) : [line]).map((run) => decimateMinMax(run, x0, x1, buckets)));
  let y0 = Infinity; let y1 = -Infinity;
  for (const bands of reduced) for (const line of bands) for (const point of line) { if (point.amp < y0) y0 = point.amp; if (point.amp > y1) y1 = point.amp; }
  const sx = (x: number) => (x1 > x0 ? (x - x0) / (x1 - x0) : 0.5);
  const sy = (y: number) => (y1 > y0 ? 1 - (y - y0) / (y1 - y0) : 0.5);

  // The table shows the first rows of the file; with a stride they are the first read rows.
  let from = Infinity; let to = -Infinity;
  const shown = Math.max(1, Math.ceil(tableRows / table.stride));
  for (let i = 0; i < Math.min(shown, xs.length); i++) {
    const x = xs[i];
    if (x === undefined || !Number.isFinite(x)) continue;
    if (x < from) from = x;
    if (x > to) to = x;
  }
  const band = Number.isFinite(from) && Number.isFinite(to) ? { from: sx(from), to: sx(to) } : null;
  const yRange = Number.isFinite(y0) && Number.isFinite(y1) ? { min: y0, max: y1 } : null;
  return {
    series: reduced.map((bands) => bands.map((line) => line.map((point) => ({ x: sx(point.freq), y: sy(point.amp) })))),
    band,
    xRange: { min: x0, max: x1 },
    yRange,
  };
}

/** Scaled X & Y min → max summary with units, e.g. "X: 100 MHz → 100.05 MHz · Y: -62.1 dBm → -60.4 dBm". */
export function previewRangeSummary(
  plot: Pick<OverviewPlot, "xRange" | "yRange">,
  config: Pick<WizardConfig, "domain" | "xUnit" | "yUnit" | "xMult" | "yMult">,
): string | null {
  if (!plot.xRange) return null;
  const xMult = Number.isFinite(config.xMult) && config.xMult !== 0 ? config.xMult : 1;
  const xA = plot.xRange.min * xMult;
  const xB = plot.xRange.max * xMult;
  const xMin = Math.min(xA, xB);
  const xMax = Math.max(xA, xB);
  const xSpan = xMax > xMin ? xMax - xMin : Math.max(Math.abs(xMax), 1e-12);
  const xStored = storedXUnit(config.xUnit, config.domain);
  const xOpts = { domain: config.domain, unit: xStored };
  const xText = `X: ${formatAdaptiveXAxisValue(xMin, xSpan, xOpts)} → ${formatAdaptiveXAxisValue(xMax, xSpan, xOpts)}`;

  if (!plot.yRange) return xText;
  const yMult = Number.isFinite(config.yMult) && config.yMult !== 0 ? config.yMult : 1;
  const yA = plot.yRange.min * yMult;
  const yB = plot.yRange.max * yMult;
  const yMin = Math.min(yA, yB);
  const yMax = Math.max(yA, yB);
  const yStored = config.yUnit !== undefined ? storedYUnit(config.yUnit) : null;
  const yText = `Y: ${formatScalarWithUnit(yMin, yStored, { digits: 3 })} → ${formatScalarWithUnit(yMax, yStored, { digits: 3 })}`;
  return `${xText} · ${yText}`;
}

/** "all 9 998 rows" or "every 4th of 2 000 000 rows". */
export function plotCaption(table: Pick<NumericTable, "total" | "stride">): string {
  if (table.stride <= 1) return `Plot: all ${formatCount(table.total)} row${table.total === 1 ? "" : "s"}`;
  const n = table.stride;
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
  return `Plot: every ${n}${suffix} of ${formatCount(table.total)} rows`;
}
