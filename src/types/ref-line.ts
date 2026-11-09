// ============================================================================
// Mergen Scope — Reference Line Type Definitions
// ============================================================================
// Ported from: app-modules/app-controller.js shapes
// ============================================================================

/** Reference line orientation: horizontal or vertical. */
export type RefLineType = "h" | "v";

/** Encode the normalized group and original display unit without delimiter ambiguity. */
export function encodeXAxisUnit(group: string, unit: string): string {
  return JSON.stringify([group, unit]);
}

/** Read current and earlier colon-delimited workspace records. */
export function decodeXAxisUnit(encoded: string): [string, string] {
  try {
    const value: unknown = JSON.parse(encoded);
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string') return [value[0], value[1]];
  } catch { /* legacy encoding */ }
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === ':' && encoded.slice(0, i) === encoded.slice(i + 1)) return [encoded.slice(0, i), encoded.slice(i + 1)];
  }
  const separator = encoded.indexOf(':');
  return separator < 0 ? [encoded, encoded] : [encoded.slice(0, separator), encoded.slice(separator + 1)];
}

/** A reference line drawn on the chart. */
export interface RefLine {
  /** Unique reference line ID (sequential integer). */
  readonly id: number;

  /** Orientation: "h" for horizontal, "v" for vertical. */
  readonly type: RefLineType;

  /** The pane this line belongs to, or `null` for all panes. */
  readonly paneId: string | null;

  /** Explicitly unplaced; unlike legacy null paneId, this line is not global. */
  readonly paneless?: boolean;
  /** Axis unit recorded when the original pane was removed, when known. */
  readonly axisUnit?: string | null;

  /** Group ID for locking lines across panes. */
  readonly groupId: string | null;

  /** The value (Y for horizontal, X for vertical) in axis units. */
  readonly value: number;

  /** Optional user label. */
  readonly label: string | null;

  /** ID of the partner line to form a delta pair with, or null for none. */
  readonly deltaPartnerId?: number | null;
}
