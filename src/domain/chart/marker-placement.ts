import { nearestIndexByFreq } from '../markers';
import { pixelToAxisValue } from './plot-coords';
import type { ZoomWindow } from '../../types/marker';
import type { DataPoint } from '../../types/trace';
import type { AxisScale } from '../../types/pane';
import { toAxisSpace } from './axis-scale';

export function computeMarkerHitTolerance(
  plotWidth: number, visibleXSpan: number, dataBounds: { min: number; max: number } | null,
): number {
  if (plotWidth <= 0 || !Number.isFinite(plotWidth)) return visibleXSpan * 0.006;

  const fullSpan = dataBounds ? Math.max(dataBounds.max - dataBounds.min, visibleXSpan) : visibleXSpan;
  const zoomRatio = fullSpan > 0 ? Math.max(0, Math.min(1, visibleXSpan / fullSpan)) : 1;
  const hitRadiusPx = 3 + zoomRatio * 4;
  return Math.max((visibleXSpan / plotWidth) * hitRadiusPx, visibleXSpan * 1e-6);
}

/** The first marker within tolerance wins, in array order. */
export function findMarkerHit<T extends { marker: { freq: number } }>(
  markers: readonly T[], clickFreq: number, tolerance: number,
): T | undefined {
  return markers.find(({ marker }) => Math.abs(marker.freq - clickFreq) < tolerance);
}

/** Pick a trace by its amplitude at the click X. A missing Y mapping leaves the choice to the pane. */
export function pickPlacementTraceIndex(
  tickPairs: readonly { val: number; clientY: number }[],
  traceAmps: readonly number[],
  clientY: number,
  fallback: { top: number; height: number; traces: readonly { data: readonly DataPoint[] }[]; xZoom: ZoomWindow | null },
): number | null {
  if (traceAmps.length === 0) return null;

  const orderedTicks = [...tickPairs].sort((a, b) => a.clientY - b.clientY);
  const topTick = orderedTicks[0];
  const bottomTick = orderedTicks.at(-1);
  let clickAmp: number | null = null;
  if (topTick && bottomTick) {
    const pixelSpan = bottomTick.clientY - topTick.clientY;
    if (pixelSpan > 0) {
      // The rendered tick mapping extrapolates outside the plot and permits equal tick values.
      const fraction = (clientY - topTick.clientY) / pixelSpan;
      clickAmp = topTick.val + fraction * (bottomTick.val - topTick.val);
    }
  }

  if (clickAmp === null) {
    const tickVals = orderedTicks.map(tick => tick.val);
    if (tickVals.length < 2) {
      const left = fallback.xZoom?.left ?? -Infinity;
      const right = fallback.xZoom?.right ?? Infinity;
      const allAmps = fallback.traces.flatMap(trace =>
        trace.data.filter(point => point.freq >= left && point.freq <= right)
          .map(point => point.amp).filter(Number.isFinite)
      );
      tickVals.push(...(allAmps.length ? [Math.min(...allAmps), Math.max(...allAmps)] : [0, 1]));
    }
    const yMin = Math.min(...tickVals);
    const yMax = Math.max(...tickVals);
    const topMargin = 10;
    const bottomMargin = 30; // Accounts for x-axis ticks and label.
    const plotHeight = fallback.height - topMargin - bottomMargin;
    if (!(yMax > yMin && plotHeight > 0)) return null;
    clickAmp = pixelToAxisValue(clientY - fallback.top, topMargin, plotHeight, yMin, yMax, true);
    if (clickAmp === null) return null;
  }

  // Amplitude distance has the same ordering as pixel distance on a non-flat linear axis.
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (const [index, amp] of traceAmps.entries()) {
    const distance = Math.abs(amp - clickAmp);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function computeNearestPixelDist(
  data: readonly DataPoint[], targetFreq: number, domainLeft: number, domainRight: number, plotWidth: number, scale: AxisScale = 'linear',
): number {
  const nearest = data[nearestIndexByFreq(data, targetFreq)];
  if (!nearest || domainRight <= domainLeft || plotWidth <= 0) return Infinity;

  const pxPerUnit = plotWidth / (toAxisSpace(domainRight, scale) - toAxisSpace(domainLeft, scale));
  const pointsInView = data.filter(point => point.freq >= domainLeft && point.freq <= domainRight).length;
  // At less than 20px average spacing, a 10px snap threshold would hide interpolation.
  const avgSpacingPx = pointsInView > 1 ? plotWidth / (pointsInView - 1) : Infinity;
  if (avgSpacingPx < 20) return Infinity;
  return Math.abs(toAxisSpace(nearest.freq, scale) - toAxisSpace(targetFreq, scale)) * pxPerUnit;
}
