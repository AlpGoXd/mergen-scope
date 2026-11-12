// ============================================================================
// Mergen Scope — Import units (tabular import wizard)
// ============================================================================
// A unit the source column is written in. Picking one sets the multiplier that
// converts the column to the base unit the trace is stored in.
// ============================================================================

import type { TraceDomain } from "../types/trace.ts";

export interface ImportUnit {
  /** Unit as written in the file (also the stored WizardConfig value). */
  readonly id: string;
  /** Multiplier from this unit to `base`. */
  readonly factor: number;
  /** Unit the trace is stored in after conversion ('' = no unit). */
  readonly base: string;
  /** Spoken name for menus, e.g. "seconds". */
  readonly name: string;
}

export const X_UNITS: Readonly<Record<TraceDomain, readonly ImportUnit[]>> = {
  time: [
    { id: "s", factor: 1, base: "s", name: "seconds" },
    { id: "ms", factor: 1e-3, base: "s", name: "milliseconds" },
    { id: "µs", factor: 1e-6, base: "s", name: "microseconds" },
    { id: "ns", factor: 1e-9, base: "s", name: "nanoseconds" },
  ],
  frequency: [
    { id: "Hz", factor: 1, base: "Hz", name: "hertz" },
    { id: "kHz", factor: 1e3, base: "Hz", name: "kilohertz" },
    { id: "MHz", factor: 1e6, base: "Hz", name: "megahertz" },
    { id: "GHz", factor: 1e9, base: "Hz", name: "gigahertz" },
  ],
};

export const Y_UNITS: readonly ImportUnit[] = [
  { id: "V", factor: 1, base: "V", name: "volts" },
  { id: "mV", factor: 1e-3, base: "V", name: "millivolts" },
  { id: "µV", factor: 1e-6, base: "V", name: "microvolts" },
  { id: "A", factor: 1, base: "A", name: "amperes" },
  { id: "mA", factor: 1e-3, base: "A", name: "milliamperes" },
  { id: "W", factor: 1, base: "W", name: "watts" },
  { id: "mW", factor: 1e-3, base: "W", name: "milliwatts" },
  { id: "dB", factor: 1, base: "dB", name: "decibels" },
  { id: "dBm", factor: 1, base: "dBm", name: "dB milliwatt" },
  { id: "dBV", factor: 1, base: "dBV", name: "dB volt" },
  { id: "", factor: 1, base: "", name: "no unit" },
];

/** Menu label: "seconds (s)"; the unitless entry reads "no unit". */
export function unitLabel(unit: ImportUnit): string {
  return unit.id ? `${unit.name} (${unit.id})` : unit.name;
}

export function baseXUnit(domain: TraceDomain): string {
  return domain === "time" ? "s" : "Hz";
}

export function findXUnit(domain: TraceDomain, id: string | undefined): ImportUnit | undefined {
  return id === undefined ? undefined : X_UNITS[domain].find((unit) => unit.id === id);
}

export function findYUnit(id: string | undefined): ImportUnit | undefined {
  return id === undefined ? undefined : Y_UNITS.find((unit) => unit.id === id);
}

/** Unit the converted Y values are stored in; a custom unit not in the list is kept as written. */
export function storedYUnit(id: string): string | null {
  const base = findYUnit(id)?.base ?? id;
  return base === "" ? null : base;
}

/** Text inside (…) or […], else the whole header. */
function unitText(header: string): string {
  return (header.match(/[([]([^)\]]+)[)\]]/)?.[1] ?? header).trim();
}

const X_PATTERNS: readonly (readonly [RegExp, TraceDomain, string])[] = [
  [/\bghz\b/, "frequency", "GHz"],
  [/\bmhz\b/, "frequency", "MHz"],
  [/\bkhz\b/, "frequency", "kHz"],
  [/\bhz\b/, "frequency", "Hz"],
  [/\bms\b/, "time", "ms"],
  [/(\bus\b|µs|μs)/, "time", "µs"],
  [/\bns\b/, "time", "ns"],
  [/\bs\b|\bsec\b|\bseconds?\b/, "time", "s"],
];

/** X unit named in a column header, e.g. "Time (ms)" → ms, "Freq [GHz]" → GHz. */
export function detectXUnit(header: string): { domain: TraceDomain; unit: string } | null {
  const text = unitText(header).toLowerCase();
  for (const [pattern, domain, unit] of X_PATTERNS) if (pattern.test(text)) return { domain, unit };
  return null;
}

const Y_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bdbm\b/, "dBm"],
  [/\bdbv\b/, "dBV"],
  [/\bdb\b/, "dB"],
  [/\bmv\b/, "mV"],
  [/(\buv\b|µv|μv)/, "µV"],
  [/\bv\b|\bvolts?\b/, "V"],
  [/\bma\b/, "mA"],
  [/\ba\b|\bamps?\b/, "A"],
  [/\bmw\b/, "mW"],
  [/\bw\b|\bwatts?\b/, "W"],
];

/** Y unit named in a column header, e.g. "CH1 (V)" → V, "Power dBm" → dBm. */
export function detectYUnit(header: string): string | null {
  const text = unitText(header).toLowerCase();
  for (const [pattern, unit] of Y_PATTERNS) if (pattern.test(text)) return unit;
  return null;
}
