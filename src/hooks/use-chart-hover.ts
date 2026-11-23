import { useEffect, useMemo, useState } from 'react';
import { formatChartPointerReadout } from '../domain/chart/pointer-readout';
import { getResolvedInterpolationStrategy } from '../domain/interpolation';
import { placeMarker } from '../domain/markers';
import { traceXGroup } from '../domain/pane-placement';
import { usePointerReadoutPublisher } from '../stores/pointer-readout-store';
import { useSharedHoverPublisher, useSharedHoverValue } from '../stores/shared-hover-store';
import type { Trace } from '../types/trace';

interface ChartHoverOptions {
  paneId: string;
  paneTraces: readonly Trace[];
  activeTrace: Trace | null;
  visibleXSpan: number;
  resolveTraceColor: (name: string) => string;
  isExport: boolean;
  isSmith: boolean;
}

export function useChartHover({
  paneId, paneTraces, activeTrace, visibleXSpan, resolveTraceColor, isExport, isSmith,
}: ChartHoverOptions) {
  const [hoverFreq, setHoverFreq] = useState<number | null>(null);
  const publishHover = useSharedHoverPublisher();
  const publishReadout = usePointerReadoutPublisher();
  // The export copy shares the pane id: it must never clear the real pane's hover.
  useEffect(() => isExport ? undefined : () => publishHover(null, paneId), [publishHover, paneId, isExport]);
  useEffect(() => isExport ? undefined : () => publishReadout(null, paneId), [publishReadout, paneId, isExport]);

  // Matching X units share a crosshair independently of the pane's X zoom link.
  const paneXUnit = paneTraces[0] ? traceXGroup(paneTraces[0]) : null;
  const ghostX = useSharedHoverValue(paneId, isSmith ? null : paneXUnit);
  const crosshairX = !isExport && hoverFreq != null && Number.isFinite(hoverFreq) ? hoverFreq : null;
  const ghostCrosshairX = !isExport && hoverFreq == null && ghostX != null && Number.isFinite(ghostX) ? ghostX : null;

  const hoverRows = useMemo(() => {
    if (hoverFreq == null || !Number.isFinite(hoverFreq)) return [];
    return paneTraces.map(trace => {
      const placement = placeMarker(trace, hoverFreq);
      const strategy = getResolvedInterpolationStrategy(trace.family, trace.interpolation, trace.isUniform ?? false);
      return {
        trace,
        placement,
        color: resolveTraceColor(trace.name),
        resolutionLabel: strategy === 'snap' || !placement.interpolated ? 'snap' : 'interp',
      };
    });
  }, [hoverFreq, paneTraces, resolveTraceColor]);

  const updateHover = (freq: number, resolveAmp: () => number | null) => {
    setHoverFreq(freq);
    if (paneXUnit) publishHover({ paneId, xUnit: paneXUnit, value: freq }, paneId);
    const readout = formatChartPointerReadout(freq, resolveAmp(), visibleXSpan, activeTrace);
    if (readout !== null) publishReadout(readout, paneId);
  };

  const clearHover = () => {
    setHoverFreq(null);
    publishHover(null, paneId);
    publishReadout(null, paneId);
  };

  return { hoverFreq, hoverRows, crosshairX, ghostCrosshairX, updateHover, clearHover };
}
