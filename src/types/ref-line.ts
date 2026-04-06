// ============================================================================
// Mergen Scope — Reference Line Type Definitions
// ============================================================================
// Ported from: app-modules/app-controller.js shapes
// ============================================================================

/** Reference line orientation: horizontal or vertical. */
export type RefLineType = "h" | "v";

/** A reference line drawn on the chart. */
export interface RefLine {
  /** Unique reference line ID (sequential integer). */
  readonly id: number;

  /** Orientation: "h" for horizontal, "v" for vertical. */
  readonly type: RefLineType;

  /** The pane this line belongs to, or `null` for all panes. */
  readonly paneId: string | null;

  /** Group ID for locking lines across panes. */
  readonly groupId: string | null;

  /** The value (Y for horizontal, X for vertical) in axis units. */
  readonly value: number;

  /** Optional user label. */
  readonly label: string | null;
}
