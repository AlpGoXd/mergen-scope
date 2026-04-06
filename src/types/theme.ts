// ============================================================================
// Mergen Scope — Theme Type Definitions
// ============================================================================
// Ported from: app-modules/ui-helpers.js
// ============================================================================

/** Complete set of theme color tokens read from CSS custom properties. */
export interface ThemeColors {
  /** Trace colors (6 slots). */
  readonly tr: readonly [string, string, string, string, string, string];

  /** Derived trace colors (6 slots). */
  readonly dr: readonly [string, string, string, string, string, string];

  /** Marker normal color. */
  readonly mn: string;

  /** Marker delta color. */
  readonly md: string;

  /** Marker peak color. */
  readonly mp: string;

  /** Accent color. */
  readonly accent: string;

  /** Muted text color. */
  readonly muted: string;

  /** Dim text color. */
  readonly dim: string;

  /** Primary text color. */
  readonly text: string;

  /** Background color. */
  readonly bg: string;

  /** Card background color. */
  readonly card: string;

  /** Border color. */
  readonly border: string;

  /** Tooltip background. */
  readonly tipBg: string;

  /** Tooltip border. */
  readonly tipBd: string;

  /** Grid line color. */
  readonly grid: string;

  /** Derived alternate color. */
  readonly dAlt: string;

  /** Derived amplitude color. */
  readonly dAmp: string;

  /** Noise trace color. */
  readonly noiseTr: string;

  /** IP3 color. */
  readonly ip3C: string;

  /** Vertical reference line color. */
  readonly refV: string;

  /** Horizontal reference line color. */
  readonly refH: string;

  /** Crosshair color. */
  readonly cross: string;
}
