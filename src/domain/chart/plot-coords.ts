import type { ZoomWindow } from '../../types/marker';
import type { AxisScale, YDomain } from '../../types/pane';
import { fromAxisSpace, mapAxisDomain, toAxisSpace } from './axis-scale';

/** Map a pixel to a linear axis, clamping at the plot edges. Y runs from max to min. */
export function pixelToAxisValue(
  pixel: number, origin: number, length: number, min: number, max: number, reversed = false, scale: AxisScale = 'linear',
): number | null {
  if (scale === 'log') {
    if (!(min > 0)) return null;
    const value = pixelToAxisValue(pixel, origin, length, Math.log10(min), Math.log10(max), reversed);
    return value === null ? null : fromAxisSpace(value, scale);
  }
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

/** Minimum vertical pointer travel (px) before a right-drag switches from X-only zoom to an X+Y box zoom. */
export const BOX_ZOOM_MIN_Y_PX = 12;

/** A horizontal drag creates a window at any positive span. */
export function dragZoomXDomain(start: number, end: number): ZoomWindow | null {
  const left = Math.min(start, end);
  const right = Math.max(start, end);
  return right - left > 0 ? { left, right } : null;
}

/** A vertical drag creates a Y domain at any positive span (and strictly positive on log axes). */
export function dragZoomYDomain(start: number, end: number, scale: AxisScale = 'linear'): YDomain | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  if (!(max > min)) return null;
  if (scale === 'log' && !(min > 0)) return null;
  return { min, max };
}

/** True once the pointer has moved far enough vertically to count as a 2D box zoom rather than an X band. */
export function isBoxZoomGesture(startClientY: number | undefined, currentClientY: number | undefined): boolean {
  return startClientY !== undefined && currentClientY !== undefined
    && Number.isFinite(startClientY) && Number.isFinite(currentClientY)
    && Math.abs(currentClientY - startClientY) >= BOX_ZOOM_MIN_Y_PX;
}

/**
 * Resolve a right-drag zoom gesture into X and optional Y target domains.
 * Flat horizontal drags return `y: null` so the caller fits Y; diagonal drags return both X and Y.
 */
export function dragZoomBox(
  startX: number, endX: number,
  startY: number | null | undefined, endY: number | null | undefined,
  startClientY: number | undefined, endClientY: number | undefined,
  xScale: AxisScale = 'linear', yScale: AxisScale = 'linear',
): { readonly x: ZoomWindow; readonly y: YDomain | null } | null {
  const x = dragZoomXDomain(startX, endX);
  if (!x || (xScale === 'log' && !(x.left > 0))) return null;
  if (!isBoxZoomGesture(startClientY, endClientY) || startY == null || endY == null) {
    return { x, y: null };
  }
  return { x, y: dragZoomYDomain(startY, endY, yScale) };
}

/** Shift by the difference of two values on the starting domain, then constrain the window to the data. */
export function panXDomain(
  start: ZoomWindow, anchor: number, current: number, bounds: { min: number; max: number } | null, scale: AxisScale = 'linear',
): ZoomWindow {
  if (scale === 'log') {
    const next = panXDomain({ left: Math.log10(start.left), right: Math.log10(start.right) },
      Math.log10(anchor), Math.log10(current), bounds && bounds.min > 0 ? mapAxisDomain(bounds, scale) : null);
    return { left: fromAxisSpace(next.left, scale), right: fromAxisSpace(next.right, scale) };
  }
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

export function wheelAxisDomain(domain: YDomain, direction: -1 | 1, cursor: number | null, pan: boolean, scale: AxisScale): YDomain | null {
  const mapped = mapAxisDomain(domain, scale);
  const next = pan ? panYDomain(mapped, direction) : zoomYDomain(mapped, direction, cursor === null ? null : toAxisSpace(cursor, scale));
  if (!next) return null;
  const result = mapAxisDomain(next, scale, true);
  return Number.isFinite(result.min) && Number.isFinite(result.max) && result.max > result.min && (scale !== 'log' || result.min > 0) ? result : null;
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

/** Zoom an X window in by `factor` around its centre (the geometric centre on a log axis). */
export function zoomXByFactor(window: ZoomWindow, factor: number, scale: AxisScale = 'linear'): ZoomWindow | null {
  if (!(factor > 1) || !Number.isFinite(factor) || !(window.right > window.left)) return null;
  if (scale === 'log') {
    if (!(window.left > 0)) return null;
    const lo = Math.log10(window.left);
    const hi = Math.log10(window.right);
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / (2 * factor);
    return { left: 10 ** (mid - half), right: 10 ** (mid + half) };
  }
  const mid = (window.left + window.right) / 2;
  const half = (window.right - window.left) / (2 * factor);
  return { left: mid - half, right: mid + half };
}

/** Center Y on a reference line while keeping the visible span. */
export function centerYDomain(value: number, min: number, max: number): YDomain {
  const half = Math.max(max - min, 1e-12) / 2;
  return { min: value - half, max: value + half };
}
