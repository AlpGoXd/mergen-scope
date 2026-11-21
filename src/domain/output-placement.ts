// Where a created trace on its own X axis (an FFT of a time trace) goes, so that it is visible right away.
// Pure: the aggregate store supplies each pane's visible X range.

export interface XRange { readonly min: number; readonly max: number }

export interface OutputPaneCandidate {
  readonly id: string;
  /** A chart pane (not Table or Smith). */
  readonly chart: boolean;
  /** Holds no traces at all. */
  readonly empty: boolean;
  /** Holds traces on the output's X axis (e.g. Hz) and accepts the output. */
  readonly sameAxis: boolean;
  /** What the pane shows now: its X zoom, else the extent of its visible traces (for a linked pane, its group). */
  readonly visible: XRange | null;
}

export type OutputPlacement =
  | { readonly kind: 'join'; readonly paneId: string }
  | { readonly kind: 'empty'; readonly paneId: string }
  | { readonly kind: 'new' }
  | { readonly kind: 'nearest'; readonly paneId: string; readonly fitX: XRange }
  | { readonly kind: 'none' };

/** Gap between two ranges; 0 when they touch or overlap. */
export function rangeGap(a: XRange, b: XRange): number {
  return Math.max(0, a.min - b.max, b.min - a.max);
}

export function rangesOverlap(a: XRange, b: XRange): boolean {
  return Math.min(a.max, b.max) > Math.max(a.min, b.min) || (a.min === a.max && a.min >= b.min && a.min <= b.max);
}

/** The X extent of some samples, or null when there are none. */
export function extentOf(points: readonly { readonly freq: number }[]): XRange | null {
  let min = Infinity, max = -Infinity;
  for (const point of points) { if (Number.isFinite(point.freq)) { if (point.freq < min) min = point.freq; if (point.freq > max) max = point.freq; } }
  return min <= max ? { min, max } : null;
}

/**
 * 1. a chart pane on the same axis whose visible X range overlaps the output;
 * 2. else an empty chart pane;
 * 3. else a new pane, while under the pane limit;
 * 4. else the same-axis chart pane whose visible range is nearest, with its X fitted to the output.
 */
export function chooseOutputPane(candidates: readonly OutputPaneCandidate[], output: XRange, canAddPane: boolean): OutputPlacement {
  const sameAxis = candidates.filter(pane => pane.chart && pane.sameAxis);
  const overlapping = sameAxis.find(pane => pane.visible !== null && rangesOverlap(pane.visible, output));
  if (overlapping) return { kind: 'join', paneId: overlapping.id };
  const empty = candidates.find(pane => pane.chart && pane.empty);
  if (empty) return { kind: 'empty', paneId: empty.id };
  if (canAddPane) return { kind: 'new' };
  let nearest: OutputPaneCandidate | undefined;
  for (const pane of sameAxis) {
    if (!nearest) { nearest = pane; continue; }
    const gap = pane.visible ? rangeGap(pane.visible, output) : Infinity;
    const best = nearest.visible ? rangeGap(nearest.visible, output) : Infinity;
    if (gap < best) nearest = pane;
  }
  return nearest ? { kind: 'nearest', paneId: nearest.id, fitX: output } : { kind: 'none' };
}
