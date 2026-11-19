// Where the hover legend sits in a chart pane so it stays off the point under the cursor.
// Pure: every coordinate is in pixels local to the pane's content box; no React, no DOM.

export type LegendCorner = 'top-right' | 'top-left';

export interface PixelPoint { readonly x: number; readonly y: number }
export interface PixelRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
export interface PixelSize { readonly width: number; readonly height: number }

/** Gap between the legend and the pane edge. */
export const LEGEND_INSET_PX = 12;
/** The cursor or a hover dot this close to the legend makes it jump to the other corner. */
export const DODGE_DISTANCE_PX = 12;
/** The cursor must be farther than this from the home box before the legend may return. */
export const RETURN_DISTANCE_PX = 24;
/** ...and stay that far for this long. */
export const RETURN_DELAY_MS = 300;
/** Opacity fade used when the legend changes corner. */
export const LEGEND_FADE_MS = 120;

export function otherCorner(corner: LegendCorner): LegendCorner {
  return corner === 'top-right' ? 'top-left' : 'top-right';
}

/** The legend's box in a pane of the given width when it sits in `corner`. */
export function legendBox(corner: LegendCorner, pane: PixelSize, legend: PixelSize, inset = LEGEND_INSET_PX): PixelRect {
  const left = corner === 'top-left' ? inset : pane.width - inset - legend.width;
  return { left, top: inset, width: legend.width, height: legend.height };
}

/** Shortest distance from a point to a rectangle (0 when inside). */
export function distanceToRect(point: PixelPoint, rect: PixelRect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - (rect.left + rect.width));
  const dy = Math.max(rect.top - point.y, 0, point.y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

export interface HomeCornerInput {
  /** Rows of the plotted data: one X value under `xKey`, one Y value under each of `yKeys`. */
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly xKey: string;
  readonly yKeys: readonly string[];
  /** The scales' real domains; null when unknown. */
  readonly xDomain: readonly [number, number] | null;
  readonly yDomain: readonly [number, number] | null;
  /** The plot rectangle in pane-local pixels. */
  readonly plot: PixelRect;
  readonly pane: PixelSize;
  readonly legend: PixelSize;
}

function toPixel(value: number, domain: readonly [number, number], origin: number, length: number, flip: boolean): number {
  const t = (value - domain[0]) / (domain[1] - domain[0]);
  return origin + (flip ? 1 - t : t) * length;
}

/** Number of visible trace points under a box. */
function pointsInBox(input: HomeCornerInput, box: PixelRect, xDomain: readonly [number, number], yDomain: readonly [number, number]): number {
  const { plot, rows, xKey, yKeys } = input;
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  let count = 0;
  for (const row of rows) {
    const x = row[xKey];
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    const px = toPixel(x, xDomain, plot.left, plot.width, false);
    if (px < box.left || px > right || px < plot.left || px > plot.left + plot.width) continue;
    for (const key of yKeys) {
      const y = row[key];
      if (typeof y !== 'number' || !Number.isFinite(y)) continue;
      const py = toPixel(y, yDomain, plot.top, plot.height, true);
      if (py >= box.top && py <= bottom && py >= plot.top && py <= plot.top + plot.height) count += 1;
    }
  }
  return count;
}

/** The top corner with fewer visible trace points under the legend box; a tie goes to top-right. */
export function chooseHomeCorner(input: HomeCornerInput): LegendCorner {
  const { xDomain, yDomain, plot } = input;
  if (!xDomain || !yDomain || plot.width <= 0 || plot.height <= 0) return 'top-right';
  if (!(xDomain[1] > xDomain[0]) || !(yDomain[1] > yDomain[0])) return 'top-right';
  const right = pointsInBox(input, legendBox('top-right', input.pane, input.legend), xDomain, yDomain);
  const left = pointsInBox(input, legendBox('top-left', input.pane, input.legend), xDomain, yDomain);
  return left < right ? 'top-left' : 'top-right';
}

export interface DodgeState {
  /** Where the legend is now. */
  readonly corner: LegendCorner;
  /** When the cursor first stayed beyond the return distance from the home box (null while it has not). */
  readonly clearSince: number | null;
}

export interface DodgeInput {
  readonly home: LegendCorner;
  readonly pane: PixelSize;
  readonly legend: PixelSize;
  /** The cursor, or null once it has left the pane. */
  readonly cursor: PixelPoint | null;
  /** Hover dots: the trace values at the cursor's X. */
  readonly dots: readonly PixelPoint[];
  /** Time of this event in ms. */
  readonly now: number;
}

export function initialDodgeState(home: LegendCorner): DodgeState {
  return { corner: home, clearSince: null };
}

/**
 * One step of the dodge state machine.
 * At home: the cursor or any hover dot within 12 px of the box sends the legend to the other corner.
 * Away from home: it returns only after the cursor has been more than 24 px from the home box for 300 ms.
 * A cursor that left the pane resets straight to home (the legend is hidden then).
 */
export function stepDodge(state: DodgeState, input: DodgeInput): DodgeState {
  const { home, cursor, now } = input;
  if (!cursor) return state.corner === home && state.clearSince === null ? state : initialDodgeState(home);
  const homeBox = legendBox(home, input.pane, input.legend);
  if (state.corner === home) {
    const near = [cursor, ...input.dots].some(point => distanceToRect(point, homeBox) <= DODGE_DISTANCE_PX);
    return near ? { corner: otherCorner(home), clearSince: null } : state;
  }
  if (distanceToRect(cursor, homeBox) <= RETURN_DISTANCE_PX) return state.clearSince === null ? state : { corner: state.corner, clearSince: null };
  const since = state.clearSince ?? now;
  return now - since >= RETURN_DELAY_MS ? initialDodgeState(home) : { corner: state.corner, clearSince: since };
}

/** Ms until a pending return is due, or null when none is pending. */
export function returnDelay(state: DodgeState, now: number): number | null {
  return state.clearSince === null ? null : Math.max(0, RETURN_DELAY_MS - (now - state.clearSince));
}
