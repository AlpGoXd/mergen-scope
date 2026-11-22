import type { ZoomWindow } from '../../types/marker';
import type { YDomain } from '../../types/pane';

/** Map a pixel to a linear axis, clamping at the plot edges. Y runs from max to min. */
export function pixelToAxisValue(
  pixel: number, origin: number, length: number, min: number, max: number, reversed = false,
): number | null {
  if (length <= 0 || max <= min) return null;
  const offset = Math.max(0, Math.min(length, pixel - origin));
  const distance = (offset / length) * (max - min);
  return reversed ? max - distance : min + distance;
}

/** Project a linear axis value to a pixel. Off-plot values retain their distance from the edge. */
export function axisValueToPixel(
  value: number, origin: number, length: number, min: number, max: number, reversed = false,
): number | null {
  if (length <= 0 || max <= min) return null;
  const fraction = (value - min) / (max - min);
  return origin + (reversed ? 1 - fraction : fraction) * length;
}

/** Convert the eight-pixel horizontal reference line hit radius to Y axis units. */
export function refLineYTolerance(domain: YDomain, plotHeight: number): number {
  const span = domain.max - domain.min;
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(plotHeight) || plotHeight <= 0) return 0;
  return (span / plotHeight) * 8;
}

/** A horizontal drag creates a window at any positive span. */
export function dragZoomXDomain(start: number, end: number): ZoomWindow | null {
  const left = Math.min(start, end);
  const right = Math.max(start, end);
  return right - left > 0 ? { left, right } : null;
}

/** Shift by the difference of two values on the starting domain, then constrain the window to the data. */
export function panXDomain(
  start: ZoomWindow, anchor: number, current: number, bounds: { min: number; max: number } | null,
): ZoomWindow {
  const delta = anchor - current;
  const zoom = { left: start.left + delta, right: start.right + delta };
  if (!bounds) return zoom;
  const span = zoom.right - zoom.left;
  if (!Number.isFinite(span) || span <= 0) return zoom;
  if (span >= bounds.max - bounds.min) return { left: bounds.min, right: bounds.max };
  if (zoom.left < bounds.min) return { left: bounds.min, right: bounds.min + span };
  if (zoom.right > bounds.max) return { left: bounds.max - span, right: bounds.max };
  return zoom;
}

/** Pad Y sample extremes, or return null when no finite samples supplied the extremes. */
export function paddedYDomain(min: number, max: number, fraction: number, flatPadding = 1): YDomain | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const pad = (max - min) * fraction || flatPadding;
  return { min: min - pad, max: max + pad };
}

export function panYDomain(domain: YDomain, direction: -1 | 1): YDomain | null {
  const span = domain.max - domain.min;
  if (!(span > 0)) return null;
  const shift = span * 0.15 * direction;
  return { min: domain.min + shift, max: domain.max + shift };
}

/** Zoom around a clamped cursor value, using the midpoint when the cursor value is unavailable. */
export function zoomYDomain(domain: YDomain, direction: -1 | 1, cursor: number | null): YDomain | null {
  const { min, max } = domain;
  const span = max - min;
  if (!(span > 0)) return null;
  const rawAnchor = cursor ?? (min + max) / 2;
  const anchor = Math.max(min, Math.min(max, rawAnchor));
  const zoomFactor = 1.08;
  const newSpan = span * (direction > 0 ? zoomFactor : 1 / zoomFactor);
  if (!Number.isFinite(newSpan) || newSpan < 1e-10) return null;
  const fraction = Math.max(0, Math.min(1, (anchor - min) / span));
  const newMin = anchor - fraction * newSpan;
  return { min: newMin, max: newMin + newSpan };
}

/** Center X on a reference line, stopping at the data edges. */
export function centerXDomain(value: number, visibleSpan: number, bounds: { min: number; max: number } | null): ZoomWindow {
  const span = Math.max(visibleSpan, 1e-12);
  const lo = bounds?.min ?? value - span / 2;
  const hi = bounds?.max ?? value + span / 2;
  const left = Math.min(Math.max(value - span / 2, lo), Math.max(lo, hi - span));
  return { left, right: left + span };
}

/** Center Y on a reference line while keeping the visible span. */
export function centerYDomain(value: number, min: number, max: number): YDomain {
  const half = Math.max(max - min, 1e-12) / 2;
  return { min: value - half, max: value + half };
}
