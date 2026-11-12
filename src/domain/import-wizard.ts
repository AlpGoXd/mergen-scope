// ============================================================================
// Mergen Scope — Import wizard rules (pure)
// ============================================================================
// Column roles, why Add is unavailable, and what Edit columns would remove.
// ============================================================================

import type { ColumnIdentity, WizardConfig } from "../types/file.ts";
import type { TraceDomain } from "../types/trace.ts";
import { baseXUnit, findXUnit, findYUnit } from "./import-units.ts";
import { columnHeaders, contentLines, numericColumns } from "./parsers/tabular-detect.ts";

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

export function setXUnit(config: WizardConfig, unitId: string): WizardConfig {
  const unit = findXUnit(config.domain, unitId);
  return unit ? { ...config, xUnit: unit.id, xMult: unit.factor } : config;
}

export function setYUnit(config: WizardConfig, unitId: string): WizardConfig {
  const unit = findYUnit(unitId);
  return unit ? { ...config, yUnit: unit.id, yMult: unit.factor } : config;
}

/** True when the multiplier is not the one the picked unit implies (the advanced ×N field was used). */
export function hasCustomMultiplier(config: WizardConfig, axis: "x" | "y"): boolean {
  if (axis === "x") {
    const unit = findXUnit(config.domain, config.xUnit);
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

export function wizardLayout(text: string, config: Pick<WizardConfig, "delimiter" | "skipRows">): WizardLayout {
  const lines = contentLines(text);
  const headers = columnHeaders(lines, config.delimiter, config.skipRows);
  return { lines, headers, numeric: numericColumns(lines, config.delimiter, config.skipRows, headers.length) };
}

/** Why the main button is unavailable, or null when the settings can import. */
export function wizardBlocker(config: WizardConfig, layout: WizardLayout): string | null {
  if (layout.numeric.length === 0) return "No numeric columns with these settings. Check Delimiter and Skip rows.";
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
