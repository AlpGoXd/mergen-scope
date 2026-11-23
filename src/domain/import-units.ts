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

export type XUnitCategory = "frequency" | "time" | "angle" | "electrical" | "other";

export interface ImportXUnit extends ImportUnit {
  /** Physical group shown in the X-axis unit picker. */
  readonly category: XUnitCategory;
  /** Compatible internal TraceDomain for workspace persistence ('time' for time units, 'frequency' otherwise). */
  readonly domain: TraceDomain;
}

export interface XUnitGroup {
  readonly id: XUnitCategory;
  readonly label: string;
  readonly units: readonly ImportXUnit[];
}

export const X_UNIT_GROUPS: readonly XUnitGroup[] = [
  {
    id: "frequency",
    label: "Frequency",
    units: [
      { id: "Hz", factor: 1, base: "Hz", name: "hertz", category: "frequency", domain: "frequency" },
      { id: "kHz", factor: 1e3, base: "Hz", name: "kilohertz", category: "frequency", domain: "frequency" },
      { id: "MHz", factor: 1e6, base: "Hz", name: "megahertz", category: "frequency", domain: "frequency" },
      { id: "GHz", factor: 1e9, base: "Hz", name: "gigahertz", category: "frequency", domain: "frequency" },
      { id: "THz", factor: 1e12, base: "Hz", name: "terahertz", category: "frequency", domain: "frequency" },
    ],
  },
  {
    id: "time",
    label: "Time",
    units: [
      { id: "s", factor: 1, base: "s", name: "seconds", category: "time", domain: "time" },
      { id: "ms", factor: 1e-3, base: "s", name: "milliseconds", category: "time", domain: "time" },
      { id: "µs", factor: 1e-6, base: "s", name: "microseconds", category: "time", domain: "time" },
      { id: "ns", factor: 1e-9, base: "s", name: "nanoseconds", category: "time", domain: "time" },
      { id: "ps", factor: 1e-12, base: "s", name: "picoseconds", category: "time", domain: "time" },
    ],
  },
  {
    id: "angle",
    label: "Angle",
    units: [
      { id: "°", factor: 1, base: "°", name: "degrees", category: "angle", domain: "frequency" },
      { id: "rad", factor: 1, base: "rad", name: "radians", category: "angle", domain: "frequency" },
    ],
  },
  {
    id: "electrical",
    label: "Electrical / RF",
    units: [
      { id: "V", factor: 1, base: "V", name: "volts", category: "electrical", domain: "frequency" },
      { id: "mV", factor: 1e-3, base: "V", name: "millivolts", category: "electrical", domain: "frequency" },
      { id: "A", factor: 1, base: "A", name: "amperes", category: "electrical", domain: "frequency" },
      { id: "mA", factor: 1e-3, base: "A", name: "milliamperes", category: "electrical", domain: "frequency" },
      { id: "W", factor: 1, base: "W", name: "watts", category: "electrical", domain: "frequency" },
      { id: "mW", factor: 1e-3, base: "W", name: "milliwatts", category: "electrical", domain: "frequency" },
      { id: "dBm", factor: 1, base: "dBm", name: "dB milliwatt", category: "electrical", domain: "frequency" },
      { id: "dB", factor: 1, base: "dB", name: "decibels", category: "electrical", domain: "frequency" },
      { id: "Ohm", factor: 1, base: "Ohm", name: "ohms", category: "electrical", domain: "frequency" },
    ],
  },
  {
    id: "other",
    label: "Other",
    units: [
      { id: "", factor: 1, base: "", name: "no unit", category: "other", domain: "frequency" },
    ],
  },
];

export const ALL_X_UNITS: readonly ImportXUnit[] = X_UNIT_GROUPS.flatMap((group) => group.units);

/** Backward-compatible domain-keyed X unit lookup. */
export const X_UNITS: Readonly<Record<TraceDomain, readonly ImportXUnit[]>> = {
  time: ALL_X_UNITS.filter((unit) => unit.domain === "time"),
  frequency: ALL_X_UNITS.filter((unit) => unit.domain === "frequency"),
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
  { id: "dBi", factor: 1, base: "dBi", name: "gain relative to isotropic" },
  { id: "dBm", factor: 1, base: "dBm", name: "dB milliwatt" },
  { id: "dBV", factor: 1, base: "dBV", name: "dB volt" },
  { id: "Ohm", factor: 1, base: "Ohm", name: "ohms" },
  { id: "", factor: 1, base: "", name: "no unit" },
];

/** Menu label: "seconds (s)"; the unitless entry reads "no unit". */
export function unitLabel(unit: ImportUnit): string {
  return unit.id ? `${unit.name} (${unit.id})` : unit.name;
}

export function baseXUnit(domain: TraceDomain): string {
  return domain === "time" ? "s" : "Hz";
}

/** Find any supported X unit by id (or legacy (domain, id) call). */
export function findXUnit(id: string | undefined): ImportXUnit | undefined;
export function findXUnit(domain: TraceDomain, id: string | undefined): ImportXUnit | undefined;
export function findXUnit(first: string | undefined, second?: string | undefined): ImportXUnit | undefined {
  const id = arguments.length >= 2 ? second : first;
  return id === undefined ? undefined : ALL_X_UNITS.find((unit) => unit.id === id);
}

export function findYUnit(id: string | undefined): ImportUnit | undefined {
  return id === undefined ? undefined : Y_UNITS.find((unit) => unit.id === id);
}

/** Unit the converted X values are stored in; "no unit" ("") stores "unitless" so traces can share a pane. */
export function storedXUnit(id: string | undefined, domain: TraceDomain): string {
  if (id === undefined) return baseXUnit(domain);
  const found = findXUnit(id);
  if (found) return found.base === "" ? "unitless" : found.base;
  return id.trim() === "" ? "unitless" : id.trim();
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

function hasBracketedUnit(header: string): boolean {
  return /[([][^)\]]+[)\]]/.test(header);
}

export interface DetectedXUnit {
  readonly domain: TraceDomain;
  readonly category: XUnitCategory;
  readonly unit: string;
}

const PRIMARY_X_PATTERNS: readonly (readonly [RegExp, TraceDomain, XUnitCategory, string])[] = [
  [/^(?:°|deg(?:rees?)?)$/, "frequency", "angle", "°"],
  [/^rad(?:ians?)?$/, "frequency", "angle", "rad"],
  [/\bthz\b/, "frequency", "frequency", "THz"],
  [/\bghz\b/, "frequency", "frequency", "GHz"],
  [/\bmhz\b/, "frequency", "frequency", "MHz"],
  [/\bkhz\b/, "frequency", "frequency", "kHz"],
  [/\bhz\b/, "frequency", "frequency", "Hz"],
  [/\bps\b/, "time", "time", "ps"],
  [/\bns\b/, "time", "time", "ns"],
  [/(\bus\b|µs|μs)/, "time", "time", "µs"],
  [/\bms\b/, "time", "time", "ms"],
  [/\bs\b|\bsec\b|\bseconds?\b/, "time", "time", "s"],
];

const ELECTRICAL_X_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bdbm\b/, "dBm"],
  [/\bdb\b/, "dB"],
  [/\bmv\b/, "mV"],
  [/\bv\b|\bvolts?\b/, "V"],
  [/\bma\b/, "mA"],
  [/\ba\b|\bamps?\b|\bamperes?\b/, "A"],
  [/\bmw\b/, "mW"],
  [/\bw\b|\bwatts?\b/, "W"],
  [/\bohms?\b|ω|Ω/, "Ohm"],
];

/**
 * Primary X-axis unit named in a column header (frequency, time, angle),
 * e.g. "Time (ms)" → ms, "Freq [GHz]" → GHz, "Azimuth (°)" → °.
 */
export function detectXUnit(header: string): DetectedXUnit | null {
  const text = unitText(header).toLowerCase();
  for (const [pattern, domain, category, unit] of PRIMARY_X_PATTERNS) {
    if (pattern.test(text)) return { domain, category, unit };
  }
  return null;
}

/**
 * Electrical / RF unit named in a column header when used as an X sweep axis
 * (e.g. "Vgs (V)", "Pin [dBm]", "Bias (mA)"). Requires bracketed unit or explicit sweep unit token.
 */
export function detectElectricalXUnit(header: string): DetectedXUnit | null {
  const text = unitText(header).toLowerCase();
  const bracketed = hasBracketedUnit(header);
  for (const [pattern, unit] of ELECTRICAL_X_PATTERNS) {
    // Avoid matching stray single-letter tokens like "A" in "Channel A" unless inside () or [].
    if (!bracketed && unit.length === 1) continue;
    if (pattern.test(text)) return { domain: "frequency", category: "electrical", unit };
  }
  return null;
}

const Y_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bdbi\b/, "dBi"],
  [/\bdbm\b/, "dBm"],
  [/\bdbv\b/, "dBV"],
  [/\bdb\b/, "dB"],
  [/\bmv\b/, "mV"],
  [/(\buv\b|µv|μv)/, "µV"],
  [/\bv\b|\bvolts?\b/, "V"],
  [/\bma\b/, "mA"],
  [/\ba\b|\bamps?\b|\bamperes?\b/, "A"],
  [/\bmw\b/, "mW"],
  [/\bw\b|\bwatts?\b/, "W"],
  [/\bohms?\b|ω|Ω/, "Ohm"],
];

/** Y unit named in a column header, e.g. "CH1 (V)" → V, "Power dBm" → dBm. */
export function detectYUnit(header: string): string | null {
  const text = unitText(header).toLowerCase();
  for (const [pattern, unit] of Y_PATTERNS) if (pattern.test(text)) return unit;
  return null;
}
