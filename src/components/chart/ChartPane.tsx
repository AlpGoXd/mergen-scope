import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import { usePaneState, usePaneDispatch } from '../../stores/pane-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useFileDispatch } from '../../stores/file-store';
import { useTraceState } from '../../stores/trace-store';
import { useTheme } from '../../hooks/use-theme';
import { usePaneData } from '../../hooks/use-pane-data';
import { deriveAxisInfo } from '../../domain/units';
import { canAssignTraceToPane } from '../../domain/pane-math';
import { formatAdaptiveXAxisTickLabels, formatAdaptiveXAxisValue, formatScalarWithUnit } from '../../domain/format';
import { getResolvedInterpolationStrategy } from '../../domain/interpolation';
import { placeMarker, nearestIndexByFreq } from '../../domain/markers';
import { makeNiceTicks } from '../../domain/trace-math';
import { Btn } from '../shared/Btn';
import { EmptyChartPane } from './EmptyChartPane';
import { SmithPane } from './SmithPane';

export interface ChartPaneProps {
  paneId: string;
}

interface ChartMouseEvent {
  readonly activeLabel?: number | string;
  readonly activePayload?: ReadonlyArray<{ readonly value?: number }>;
  readonly xValue?: number;
  readonly chartX?: number;
  readonly nativeEvent?: { readonly clientX?: number; readonly clientY?: number };
  readonly offset?: { readonly left?: number; readonly width?: number };
  readonly xAxisMap?: Record<string, unknown>;
}

const CHART_Y_AXIS_WIDTH = 50;
const CHART_MARGIN_RIGHT = 20;

export function ChartPane({ paneId }: ChartPaneProps) {
  const { panes, activePaneId, tracePaneMap, paneActiveTraceMap, zoomAll, sharedZoom, paneXZooms, paneYZooms } = usePaneState();
  const { markers, selectedMkrIdx } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const { refLines, refMode, selectedRefLineId } = useRefLineState();
  const refLineDispatch = useRefLineDispatch();
  const { newMarkerArmed, selectedTraceName, lockLinesAcrossPanes, showDots, traceColors, markerTrace } = useUiState();
  const uiDispatch = useUiDispatch();
  const paneDispatch = usePaneDispatch();
  const fileDispatch = useFileDispatch();
  const { allTraces, vis } = useTraceState();
  const { colors } = useTheme();

  const pane = panes.find((item) => item.id === paneId) || panes[0];
  if (!pane) return null;
  const firstPaneId = panes[0]?.id;
  const isActive = activePaneId === paneId;
  const isSmith = pane.renderMode === 'smith' || pane.renderMode === 'smith-inverted';

  const traceNamesInPane = useMemo(() => {
    return Object.entries(tracePaneMap)
      .filter(([_, pid]) => pid === paneId)
      .map(([name]) => name);
  }, [tracePaneMap, paneId]);

  const currentXZoom = zoomAll ? sharedZoom : (paneXZooms[paneId] || null);
  const xRange = currentXZoom ? { left: currentXZoom.left, right: currentXZoom.right } : null;
  const { paneTraces, mergedData } = usePaneData(traceNamesInPane, xRange);

  const axisInfo = useMemo(() => {
    const tracesInPane = allTraces.filter((trace) => traceNamesInPane.includes(trace.name));
    return deriveAxisInfo(tracesInPane, vis, selectedTraceName, null, mergedData.length > 0);
  }, [allTraces, traceNamesInPane, vis, selectedTraceName, mergedData.length]);

  const paneMarkers = useMemo(() => {
    return markers.map((marker, index) => ({ marker, index })).filter(({ marker }) => traceNamesInPane.includes(marker.trace));
  }, [markers, traceNamesInPane]);

  const yZoom = paneYZooms[paneId];
  const yDomain: [number, number] | ['auto', 'auto'] = yZoom ? [yZoom.min, yZoom.max] : ['auto', 'auto'];
  const visibleXSpan = currentXZoom
    ? Math.max(currentXZoom.right - currentXZoom.left, 1e-12)
    : Math.max((mergedData[mergedData.length - 1]?.fs ?? 0) - (mergedData[0]?.fs ?? 0), 1e-12);
  const xDomain = useMemo(() => {
    const min = currentXZoom?.left ?? mergedData[0]?.fs ?? null;
    const max = currentXZoom?.right ?? mergedData[mergedData.length - 1]?.fs ?? null;
    if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return null;
    }
    return { min, max };
  }, [currentXZoom, mergedData]);

  const [rightMode, setRightMode] = React.useState<'zoom' | 'pan'>('zoom');
  const [dragStart, setDragStart] = React.useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = React.useState<number | null>(null);
  const [zoomDragActive, setZoomDragActive] = React.useState(false);
  const [panStartZoom, setPanStartZoom] = React.useState<{ left: number; right: number } | null>(null);
  const [panStartClientX, setPanStartClientX] = React.useState<number | null>(null);
  const [draggingMarkerIdx, setDraggingMarkerIdx] = React.useState<number | null>(null);
  const [draggingRefLineId, setDraggingRefLineId] = React.useState<number | null>(null);
  const [hoverFreq, setHoverFreq] = React.useState<number | null>(null);
  const chartAreaRef = React.useRef<HTMLDivElement | null>(null);
  const lastPointerClientXRef = React.useRef<number | null>(null);
  const lastPointerClientYRef = React.useRef<number | null>(null);

  const paneDataBounds = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const trace of paneTraces) {
      const first = trace.data[0]?.freq;
      const last = trace.data[trace.data.length - 1]?.freq;
      if (Number.isFinite(first)) min = Math.min(min, first as number);
      if (Number.isFinite(last)) max = Math.max(max, last as number);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return null;
    }
    return { min, max };
  }, [paneTraces]);

  const clampZoomToDataBounds = React.useCallback((zoom: { left: number; right: number }) => {
    if (!paneDataBounds) return zoom;
    const span = zoom.right - zoom.left;
    if (!Number.isFinite(span) || span <= 0) return zoom;
    if (span >= paneDataBounds.max - paneDataBounds.min) {
      return { left: paneDataBounds.min, right: paneDataBounds.max };
    }
    if (zoom.left < paneDataBounds.min) {
      return { left: paneDataBounds.min, right: paneDataBounds.min + span };
    }
    if (zoom.right > paneDataBounds.max) {
      return { left: paneDataBounds.max - span, right: paneDataBounds.max };
    }
    return zoom;
  }, [paneDataBounds]);

  const resolveClientFreq = (
    clientX: number,
    domainOverride?: { left: number; right: number } | null,
  ): number | null => {
    const chartEl = chartAreaRef.current;
    const domainLeft = domainOverride?.left ?? currentXZoom?.left ?? mergedData[0]?.fs ?? null;
    const domainRight = domainOverride?.right ?? currentXZoom?.right ?? mergedData[mergedData.length - 1]?.fs ?? null;
    if (!chartEl || domainLeft == null || domainRight == null || domainRight <= domainLeft) return null;
    const rect = chartEl.getBoundingClientRect();
    const plotLeft = CHART_Y_AXIS_WIDTH;
    const plotWidth = rect.width - plotLeft - CHART_MARGIN_RIGHT;
    if (plotWidth <= 0) return null;
    const x = Math.max(0, Math.min(plotWidth, clientX - rect.left - plotLeft));
    return domainLeft + (x / plotWidth) * (domainRight - domainLeft);
  };

  const resolveEventFreq = (e: ChartMouseEvent | undefined, preferPointer = false): number | null => {
    if (!e) return null;

    const pointerFreq = (() => {
      if (typeof e.nativeEvent?.clientX === 'number' && Number.isFinite(e.nativeEvent.clientX)) {
        return resolveClientFreq(e.nativeEvent.clientX);
      }
      if (lastPointerClientXRef.current != null) {
        return resolveClientFreq(lastPointerClientXRef.current);
      }
      return null;
    })();
    if (preferPointer && pointerFreq != null) return pointerFreq;

    const xAxisEntry = e.xAxisMap ? Object.values(e.xAxisMap)[0] : null;
    const scale = xAxisEntry && typeof xAxisEntry === 'object' ? (xAxisEntry as { readonly scale?: unknown }).scale : undefined;
    const invert = scale && (typeof scale === 'function' || typeof scale === 'object')
      ? (scale as { readonly invert?: unknown }).invert
      : undefined;
    if (typeof invert === 'function' && typeof e.chartX === 'number' && Number.isFinite(e.chartX)) {
      const direct = invert(e.chartX);
      if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
    }
    if (typeof e.xValue === 'number' && Number.isFinite(e.xValue)) return e.xValue;
    if (
      typeof e.chartX === 'number' && Number.isFinite(e.chartX)
      && typeof e.offset?.left === 'number' && Number.isFinite(e.offset.left)
      && typeof e.offset?.width === 'number' && Number.isFinite(e.offset.width)
    ) {
      const domainLeft = currentXZoom?.left ?? mergedData[0]?.fs ?? null;
      const domainRight = currentXZoom?.right ?? mergedData[mergedData.length - 1]?.fs ?? null;
      if (domainLeft != null && domainRight != null && domainRight > domainLeft && e.offset.width > 0) {
        const frac = Math.max(0, Math.min(1, (e.chartX - e.offset.left) / e.offset.width));
        return domainLeft + frac * (domainRight - domainLeft);
      }
    }
    if (e.activeLabel != null) {
      const fallback = Number(e.activeLabel);
      if (Number.isFinite(fallback)) return fallback;
    }
    return pointerFreq;
  };

  const handleMouseDown = (e: ChartMouseEvent | undefined, button: number) => {
    if (activePaneId !== paneId) {
      paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
    }
    const freq = resolveEventFreq(e, true);
    if (freq == null || !Number.isFinite(freq)) return;

    if (button === 2) {
      if (rightMode === 'zoom') {
        setDragStart(freq);
        setDragCurrent(freq);
        setZoomDragActive(true);
      } else {
        const zoom = zoomAll ? sharedZoom : (paneXZooms[paneId] || null);
        if (zoom) {
          setPanStartZoom({ left: zoom.left, right: zoom.right });
          setPanStartClientX(e?.nativeEvent?.clientX ?? lastPointerClientXRef.current ?? null);
        }
      }
      return;
    }
    if (button !== 0) return;

    if (refMode === 'v') {
      refLineDispatch({ type: 'ADD_LINE', payload: { id: Date.now(), type: 'v', value: freq, paneId: lockLinesAcrossPanes ? null : paneId, groupId: null, label: null } });
      refLineDispatch({ type: 'SET_MODE', payload: null });
      return;
    }
    if (refMode === 'h') {
      const yVal = e?.activePayload?.[0]?.value ?? 0;
      refLineDispatch({ type: 'ADD_LINE', payload: { id: Date.now(), type: 'h', value: yVal, paneId: lockLinesAcrossPanes ? null : paneId, groupId: null, label: null } });
      refLineDispatch({ type: 'SET_MODE', payload: null });
      return;
    }

    if (newMarkerArmed) {
      const trace = resolvePlacementTrace(freq, e?.nativeEvent?.clientY ?? lastPointerClientYRef.current);
      if (trace) {
        markerDispatch({ type: 'PLACE_MARKER', payload: { trace, targetFreq: freq, magneticSnap: { nearestPointPixelDistance: computeNearestPixelDist(trace, freq), snapThresholdPx: 10 } } });
        uiDispatch({ type: 'SET', payload: { key: 'newMarkerArmed', value: false } });
      }
      return;
    }

    const xSpan = mergedData.length > 1 ? (mergedData[mergedData.length - 1]?.fs ?? 0) - (mergedData[0]?.fs ?? 0) : 0;
    const tol = xSpan * 0.015;

    // Click near an existing marker → select it and start drag
    const markerHit = paneMarkers.find(({ marker }) => Math.abs(marker.freq - freq) < tol);
    if (markerHit) {
      refLineDispatch({ type: 'SET_SELECTED', payload: null });
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: markerHit.index });
      setDraggingMarkerIdx(markerHit.index);
      return;
    }

    // Drag already-selected marker anywhere on chart
    const selectedMarker = selectedMkrIdx >= 0 ? markers[selectedMkrIdx] : null;
    if (selectedMarker && traceNamesInPane.includes(selectedMarker.trace)) {
      refLineDispatch({ type: 'SET_SELECTED', payload: null });
      setDraggingMarkerIdx(selectedMkrIdx);
      return;
    }

    const lineHit = refLines
      .filter((line) => line.type === 'v' && (!line.paneId || line.paneId === paneId))
      .find((line) => Math.abs(line.value - freq) < tol);
    if (lineHit) {
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
      refLineDispatch({ type: 'SET_SELECTED', payload: lineHit.id });
      setDraggingRefLineId(lineHit.id);
      return;
    }

    const trace = resolvePlacementTrace(freq, e?.nativeEvent?.clientY ?? lastPointerClientYRef.current);
    if (trace) {
      markerDispatch({ type: 'PLACE_MARKER', payload: { trace, targetFreq: freq, magneticSnap: { nearestPointPixelDistance: computeNearestPixelDist(trace, freq), snapThresholdPx: 10 } } });
    }
  };

  const handleMouseMove = (e: ChartMouseEvent | undefined) => {
    const freq = resolveEventFreq(e, true);
    if (freq == null || !Number.isFinite(freq)) return;
    setHoverFreq(freq);

    if (draggingMarkerIdx !== null) {
      const marker = markers[draggingMarkerIdx];
      const trace = marker ? paneTraces.find((item) => item.name === marker.trace) : undefined;
      if (trace) {
        const placement = placeMarker(trace, freq, { nearestPointPixelDistance: computeNearestPixelDist(trace, freq), snapThresholdPx: 10 });
        markerDispatch({ type: 'SET_SELECTED_IDX', payload: draggingMarkerIdx });
        markerDispatch({ type: 'UPDATE_MARKER', payload: { idx: draggingMarkerIdx, updates: { requestedFreq: placement.requestedFreq, freq: placement.freq, amp: placement.amp, interpolated: placement.interpolated } } });
      }
      return;
    }
    if (draggingRefLineId !== null) {
      refLineDispatch({ type: 'SET_SELECTED', payload: draggingRefLineId });
      refLineDispatch({ type: 'UPDATE_LINE', payload: { id: draggingRefLineId, updates: { value: freq } } });
      return;
    }
    if (zoomDragActive && dragStart !== null) {
      setDragCurrent(freq);
      return;
    }
    if (panStartZoom && panStartClientX != null) {
      const currentClientX = e?.nativeEvent?.clientX ?? lastPointerClientXRef.current;
      if (currentClientX == null) return;
      const anchorFreq = resolveClientFreq(panStartClientX, panStartZoom);
      const currentFreq = resolveClientFreq(currentClientX, panStartZoom);
      if (anchorFreq == null || currentFreq == null) return;
      const delta = anchorFreq - currentFreq;
      const next = clampZoomToDataBounds({
        left: panStartZoom.left + delta,
        right: panStartZoom.right + delta,
      });
      if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: next });
      else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: next } });
    }
  };

  const handleMouseLeave = () => {
    setHoverFreq(null);
    lastPointerClientXRef.current = null;
  };

  const handleMouseUp = () => {
    if (zoomDragActive && draggingMarkerIdx === null && draggingRefLineId === null && dragStart !== null && dragCurrent !== null) {
      const left = Math.min(dragStart, dragCurrent);
      const right = Math.max(dragStart, dragCurrent);
      if (right - left > 0) {
        if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: { left, right } });
        else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: { left, right } } });
        setRightMode('pan');
      }
    }
    setDragStart(null);
    setDragCurrent(null);
    setZoomDragActive(false);
    setPanStartZoom(null);
    setPanStartClientX(null);
    setDraggingMarkerIdx(null);
    setDraggingRefLineId(null);
    lastPointerClientXRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const allAmps = mergedData.flatMap((row) => paneTraces.map((trace) => row[trace.name] as number | undefined).filter((value): value is number => value != null && Number.isFinite(value)));
    if (allAmps.length === 0) return;
    const currentY = paneYZooms[paneId];
    const minA = currentY?.min ?? Math.min(...allAmps);
    const maxA = currentY?.max ?? Math.max(...allAmps);
    const pad = (maxA - minA) * 0.05 || 1;
    const baseMin = currentY ? currentY.min : minA - pad;
    const baseMax = currentY ? currentY.max : maxA + pad;
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const mid = (baseMin + baseMax) / 2;
    const half = ((baseMax - baseMin) / 2) * factor;
    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: { min: mid - half, max: mid + half } } });
  };

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activePaneId !== paneId) {
      paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
    }
    if (e.button !== 1) return;
    e.preventDefault();
    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: null } });
    if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: null });
    else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: null } });
    setRightMode('zoom');
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragStart(null);
    setDragCurrent(null);
    setZoomDragActive(false);
    setPanStartZoom(null);
    setPanStartClientX(null);
    setDraggingMarkerIdx(null);
    setDraggingRefLineId(null);
    lastPointerClientXRef.current = null;
  };

  const activePaneTrace = useMemo(() => {
    const activeTraceName = paneActiveTraceMap[paneId];
    return paneTraces.find((trace) => trace.name === activeTraceName)
      ?? paneTraces.find((trace) => trace.name === selectedTraceName)
      ?? paneTraces[0]
      ?? null;
  }, [paneActiveTraceMap, paneId, paneTraces, selectedTraceName]);

  const xAxisLabelText = useMemo(() => {
    if (!activePaneTrace) return axisInfo.xLabel;
    const xUnit = activePaneTrace.units.x ? String(activePaneTrace.units.x) : (activePaneTrace.domain === 'time' ? 's' : 'Hz');
    return activePaneTrace.domain === 'time' ? `Time (${xUnit})` : `Frequency (${xUnit})`;
  }, [activePaneTrace, axisInfo.xLabel]);

  const yAxisLabelText = useMemo(() => {
    if (!activePaneTrace) return axisInfo.yLabel;
    const yUnit = activePaneTrace.units.y ? String(activePaneTrace.units.y) : '';
    const source = activePaneTrace.kind === 'raw' ? activePaneTrace.networkSource : undefined;
    if (source?.view === 'Phase') return `Phase (${yUnit || 'deg'})`;
    if (source?.family === 'S' && source?.view === 'dB') return `Magnitude (${yUnit || 'dB'})`;
    if (source?.view === 'Real') return `Real (${yUnit || 'linear'})`;
    if (source?.view === 'Imag') return `Imag (${yUnit || 'linear'})`;
    if (yUnit) return `Amplitude (${yUnit})`;
    return axisInfo.yLabel || 'Amplitude';
  }, [activePaneTrace, axisInfo.yLabel]);

  const xTickValues = useMemo(() => makeNiceTicks(xDomain, 6), [xDomain]);
  const xTickLabelMap = useMemo(() => {
    const ticks = xTickValues ?? [];
    const labels = formatAdaptiveXAxisTickLabels(ticks, visibleXSpan, {
      domain: activePaneTrace?.domain ?? 'frequency',
      unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz'),
    });
    return new Map(ticks.map((tick, index) => [tick, labels[index] ?? '--']));
  }, [activePaneTrace?.domain, activePaneTrace?.units.x, visibleXSpan, xTickValues]);

  const selectedTrace = useMemo(() => {
    return selectedTraceName ? allTraces.find((trace) => trace.name === selectedTraceName) ?? null : null;
  }, [allTraces, selectedTraceName]);

  const canMoveSelectedHere = !!selectedTrace && (tracePaneMap[selectedTrace.name] || 'pane-1') !== paneId;

  const resolveTraceColor = useMemo(() => {
    const tracePalette = colors?.tr ?? [];
    const derivedPalette = colors?.dr ?? [];
    return (traceName: string): string => {
      const custom = traceColors[traceName];
      if (custom) return custom;
      const trace = allTraces.find((item) => item.name === traceName);
      const isDerived = trace?.kind === 'derived';
      const palette = isDerived ? derivedPalette : tracePalette;
      const globalIdx = allTraces.filter((item) => item.kind === (isDerived ? 'derived' : 'raw')).findIndex((item) => item.name === traceName);
      const safeIdx = globalIdx >= 0 ? globalIdx : 0;
      return palette[safeIdx % (palette.length || 1)] || 'var(--accent)';
    };
  }, [allTraces, colors?.dr, colors?.tr, traceColors]);

  const hoverRows = useMemo(() => {
    if (hoverFreq == null || !Number.isFinite(hoverFreq)) return [];
    return paneTraces.map((trace) => {
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

  const resolvePlacementTrace = React.useCallback((targetFreq?: number, pointerClientY?: number | null) => {
    // Specific trace selected from toolbar dropdown — always honour it
    if (markerTrace && markerTrace !== '__auto__') {
      const explicitTrace = paneTraces.find((trace) => trace.name === markerTrace) ?? null;
      if (explicitTrace) return explicitTrace;
    }

    // Auto mode: pick the trace whose resolved Y-value at the click X is closest
    // in pixel distance to where the user clicked vertically.
    if (targetFreq != null && paneTraces.length > 1) {
      const clientY = pointerClientY ?? lastPointerClientYRef.current;
      const el = chartAreaRef.current;
      if (clientY != null && el) {
        // Read actual rendered y-axis tick elements to get both their data values
        // AND their pixel positions. This gives an exact linear mapping from
        // screen pixel → data amplitude, matching exactly what Recharts renders.
        const tickNodes = Array.from(
          el.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick')
        );
        const tickPairs: { val: number; svgY: number }[] = [];
        for (const node of tickNodes) {
          const tspan = node.querySelector('tspan');
          const val = tspan ? Number(tspan.textContent) : NaN;
          if (!Number.isFinite(val)) continue;
          // The tick group has a transform="translate(x,y)" with the SVG y coordinate
          const transform = (node as SVGGElement).getAttribute?.('transform') ?? '';
          const match = /translate\(\s*[^,]+,\s*([\d.eE+\-]+)\s*\)/.exec(transform);
          if (!match) continue;
          const svgY = Number(match[1]);
          if (!Number.isFinite(svgY)) continue;
          // Convert SVG y to client y using the SVG element's bounding rect
          const svgEl = el.querySelector('svg');
          const svgRect = svgEl?.getBoundingClientRect();
          if (!svgRect) continue;
          const clientYOfTick = svgRect.top + svgY;
          tickPairs.push({ val, svgY: clientYOfTick });
        }

        if (tickPairs.length >= 2) {
          // Sort by svgY ascending (top ticks have smaller clientY)
          tickPairs.sort((a, b) => a.svgY - b.svgY);
          const topTick = tickPairs[0]!;
          const botTick = tickPairs[tickPairs.length - 1]!;
          const pixelSpan = botTick.svgY - topTick.svgY;
          if (pixelSpan > 0) {
            // Linear interpolation: top tick = higher value, bottom tick = lower value
            const frac = (clientY - topTick.svgY) / pixelSpan;
            const clickAmp = topTick.val + frac * (botTick.val - topTick.val);

            let bestTrace = paneTraces[0];
            let bestDist = Infinity;
            for (const tr of paneTraces) {
              const placement = placeMarker(tr, targetFreq);
              const dist = Math.abs(placement.amp - clickAmp);
              if (dist < bestDist) { bestDist = dist; bestTrace = tr; }
            }
            return bestTrace ?? null;
          }
        }

        // Fallback: use tick value range + chart margin estimate
        const tickVals = tickPairs.map(t => t.val);
        if (tickVals.length < 2) {
          // Compute from data if ticks unavailable
          const allAmps = paneTraces.flatMap(tr =>
            tr.data
              .filter(p => p.freq >= (currentXZoom?.left ?? -Infinity) && p.freq <= (currentXZoom?.right ?? Infinity))
              .map(p => p.amp)
              .filter(Number.isFinite)
          );
          tickVals.push(...(allAmps.length ? [Math.min(...allAmps), Math.max(...allAmps)] : [0, 1]));
        }
        const yMin = Math.min(...tickVals);
        const yMax = Math.max(...tickVals);
        if (yMax > yMin) {
          const rect = el.getBoundingClientRect();
          const CHART_MARGIN_TOP = 10;
          const CHART_MARGIN_BOTTOM = 30; // accounts for x-axis ticks + label
          const plotH = rect.height - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM;
          if (plotH > 0) {
            const fracFromTop = Math.max(0, Math.min(1, (clientY - rect.top - CHART_MARGIN_TOP) / plotH));
            const clickAmp = yMax - fracFromTop * (yMax - yMin);
            let bestTrace = paneTraces[0];
            let bestDist = Infinity;
            for (const tr of paneTraces) {
              const placement = placeMarker(tr, targetFreq);
              const dist = Math.abs(placement.amp - clickAmp);
              if (dist < bestDist) { bestDist = dist; bestTrace = tr; }
            }
            return bestTrace ?? null;
          }
        }
      }
    }

    // Fallback: sidebar-selected trace, or pane active trace, or first trace
    const preferredTraceName = paneActiveTraceMap[paneId] || selectedTraceName || paneTraces[0]?.name;
    return paneTraces.find((trace) => trace.name === preferredTraceName) ?? paneTraces[0] ?? null;
  }, [markerTrace, selectedTraceName, paneActiveTraceMap, paneId, paneTraces, currentXZoom]);

  const computeNearestPixelDist = React.useCallback((trace: typeof paneTraces[0], targetFreq: number): number => {
    const nearestIdx = nearestIndexByFreq(trace.data, targetFreq);
    const nearest = trace.data[nearestIdx];
    if (!nearest) return Infinity;
    const el = chartAreaRef.current;
    if (!el) return Infinity;
    const domainLeft = currentXZoom?.left ?? mergedData[0]?.fs ?? 0;
    const domainRight = currentXZoom?.right ?? mergedData[mergedData.length - 1]?.fs ?? 1;
    if (domainRight <= domainLeft) return Infinity;
    const plotWidth = el.getBoundingClientRect().width - CHART_Y_AXIS_WIDTH - CHART_MARGIN_RIGHT;
    if (plotWidth <= 0) return Infinity;
    const pxPerUnit = plotWidth / (domainRight - domainLeft);
    // Count how many of this trace's points fall inside the visible x-range
    const pointsInView = trace.data.filter(p => p.freq >= domainLeft && p.freq <= domainRight).length;
    // Only engage pixel-distance snap when data points are sparse enough on screen.
    // If the average spacing between adjacent points is < 20px, points are too dense
    // for the 10px threshold to be meaningful — clicking between two points would always
    // be within 10px of one of them, making true interpolation impossible.
    const avgSpacingPx = pointsInView > 1 ? plotWidth / (pointsInView - 1) : Infinity;
    if (avgSpacingPx < 20) return Infinity; // data too dense — let interpolation strategy decide
    return Math.abs(nearest.freq - targetFreq) * pxPerUnit;
  }, [currentXZoom, mergedData]);

  const handlePaneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/x-mergen-trace') || e.dataTransfer.types.includes('text/plain') || e.dataTransfer.files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-mergen-trace') ? 'move' : 'copy';
    }
  };

  const handlePaneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const traceName = e.dataTransfer.getData('application/x-mergen-trace') || e.dataTransfer.getData('text/plain');
    if (traceName) {
      const trace = allTraces.find((item) => item.name === traceName);
      if (!trace) return;
      const validation = canAssignTraceToPane(trace, paneId, allTraces, tracePaneMap);
      if (!validation.allowed) return;
      paneDispatch({ type: 'ASSIGN_TRACE_TO_PANE', payload: { trace, targetPaneId: paneId, allTraces } });
      paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName: trace.name } });
      paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        const rawText = await file.text();
        fileDispatch({ type: 'QUEUE_WIZARD', payload: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`, fileName: file.name, rawText } });
      }
    }
  };

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '220px', borderTop: firstPaneId && paneId !== firstPaneId ? '1px solid var(--border)' : 'none', background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg) 97%, white), var(--bg))', userSelect: 'none' }}
      onDragEnter={handlePaneDragOver}
      onDragOver={handlePaneDragOver}
      onDrop={handlePaneDrop}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: isActive ? `color-mix(in srgb, ${colors?.accent || 'var(--accent)'} 8%, white)` : 'color-mix(in srgb, var(--card) 96%, white)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId })}>
        <span style={{ fontSize: 'var(--font-label)', fontWeight: 500, color: isActive ? colors?.accent : 'var(--muted)', textTransform: 'uppercase' }}>{pane.title || `Pane ${paneId.split('-')[1]}`}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          <Btn soft style={{ padding: '0.2rem 0.55rem', fontSize: 'var(--font-caption)', minHeight: 'auto' }} disabled={!canMoveSelectedHere} onClick={(e) => {
            e.stopPropagation();
            if (!selectedTrace) return;
            const validation = canAssignTraceToPane(selectedTrace, paneId, allTraces, tracePaneMap);
            if (!validation.allowed) return;
            paneDispatch({ type: 'ASSIGN_TRACE_TO_PANE', payload: { trace: selectedTrace, targetPaneId: paneId, allTraces } });
            paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName: selectedTrace.name } });
            paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
          }}>Move Selected Trace Here</Btn>
          <Btn soft style={{ padding: '0.2rem 0.55rem', fontSize: 'var(--font-caption)', minHeight: 'auto' }} onClick={(e) => {
            e.stopPropagation();
            if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: null });
            else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: null } });
          }}>Fit</Btn>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {isSmith ? (
          <SmithPane paneId={paneId} traces={paneTraces} renderMode={pane.renderMode as 'smith' | 'smith-inverted'} />
        ) : traceNamesInPane.length === 0 ? (
          <EmptyChartPane mode={allTraces.length > 0 ? 'traces' : 'files'} />
        ) : mergedData.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 'var(--font-title)' }}>No visible traces in this pane.</div>
        ) : (
          <div ref={chartAreaRef} onWheel={handleWheel} onMouseDownCapture={(e) => { lastPointerClientXRef.current = e.clientX; lastPointerClientYRef.current = e.clientY; }} onMouseMoveCapture={(e) => { lastPointerClientXRef.current = e.clientX; lastPointerClientYRef.current = e.clientY; }} onMouseDown={handleContainerMouseDown} onContextMenu={handleContextMenu} style={{ height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mergedData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }} onMouseDown={(state) => handleMouseDown(state, (window.event as MouseEvent | undefined)?.button ?? 0)} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onMouseUp={handleMouseUp}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical horizontal />
                <XAxis
                  dataKey="fs"
                  type="number"
                  domain={xDomain ? [xDomain.min, xDomain.max] : ['dataMin', 'dataMax']}
                  ticks={xTickValues}
                  stroke="var(--muted)"
                  fontSize={'var(--font-label)'}
                  tickFormatter={(value) => xTickLabelMap.get(Number(value)) ?? formatAdaptiveXAxisValue(Number(value), visibleXSpan, {
                    domain: activePaneTrace?.domain ?? 'frequency',
                    unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz'),
                  })}
                  label={{ value: xAxisLabelText, position: 'insideBottom', offset: -5, style: { fontSize: 'var(--font-label)', fill: 'var(--muted)', textAnchor: 'middle' } }}
                />
                <YAxis
                  domain={yDomain}
                  stroke="var(--muted)"
                  fontSize={'var(--font-label)'}
                  width={56}
                  tickFormatter={(value) => {
                    const n = Number(value);
                    if (!Number.isFinite(n)) return '';
                    const unit = activePaneTrace?.units.y ?? '';
                    const unitStr = String(unit ?? '').toLowerCase();
                    // For dB-family units, just show the numeric value (unit is on the axis label)
                    if (unitStr.startsWith('db') || unitStr === 'db') return n.toFixed(1);
                    // For large linear values (e.g. impedance, raw counts), use engineering notation
                    const absN = Math.abs(n);
                    if (absN >= 1e6 || (absN > 0 && absN < 0.01)) return formatScalarWithUnit(n, unit as string, { digits: 2 });
                    return n.toFixed(2);
                  }}
                  label={{ value: yAxisLabelText, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 'var(--font-label)', fill: 'var(--muted)' } }}
                />
                <Tooltip isAnimationActive={false} cursor={false} content={() => null} />
                {paneTraces.map((trace) => (
                  <Line key={trace.name} type="linear" dataKey={trace.name} name={trace.dn || trace.name} stroke={resolveTraceColor(trace.name)} dot={showDots ? { r: 2, fill: resolveTraceColor(trace.name), stroke: resolveTraceColor(trace.name) } : false} activeDot={false} isAnimationActive={false} connectNulls strokeWidth={selectedTraceName === trace.name ? 2 : 1.5} />
                ))}
                {hoverFreq != null && Number.isFinite(hoverFreq) && <ReferenceLine x={hoverFreq} stroke="color-mix(in srgb, var(--accent) 60%, white)" strokeDasharray="4 4" strokeWidth={1} />}
                {paneMarkers.map(({ marker, index }) => {
                  const color = resolveTraceColor(marker.trace || '');
                  const isSelected = index === selectedMkrIdx;
                  const labelText = `M${index + 1} ${formatAdaptiveXAxisValue(marker.freq, visibleXSpan, {
                    domain: activePaneTrace?.domain ?? 'frequency',
                    unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz'),
                  })}${marker.interpolated ? ' (interp)' : ''}`;
                  return (
                    <ReferenceDot
                      key={`m-${index}`}
                      x={marker.freq}
                      y={marker.amp}
                      r={7}
                      isFront
                      shape={(dotProps: { readonly cx?: number; readonly cy?: number }) => {
                        const cx = Number(dotProps.cx);
                        const cy = Number(dotProps.cy);
                        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return <g />;
                        const roundedCx = Math.round(cx);
                        const roundedCy = Math.round(cy);
                        // Compute label y-offset: above by default, nudge down if near top
                        const labelYOffset = roundedCy < 30 ? 18 : -14;
                        const charWidth = 6.5;
                        const pillPadX = 5;
                        const pillPadY = 3;
                        const textWidth = labelText.length * charWidth;
                        const pillW = textWidth + pillPadX * 2;
                        const pillH = 13 + pillPadY * 2;
                        const pillX = roundedCx - pillW / 2;
                        const pillY = roundedCy + labelYOffset - pillH + pillPadY;
                        return (
                          <g>
                            {/* Selection ring */}
                            {isSelected && (
                              <circle
                                cx={roundedCx} cy={roundedCy} r={9}
                                fill="none"
                                stroke={color} strokeWidth={2}
                                strokeDasharray="3 2"
                                vectorEffect="non-scaling-stroke"
                                opacity={0.85}
                              />
                            )}
                            {/* Bullseye dot: colored fill → white ring → black outline */}
                            <circle
                              cx={roundedCx} cy={roundedCy} r={5}
                              fill={color}
                              stroke="white" strokeWidth={1.5}
                              vectorEffect="non-scaling-stroke"
                              paintOrder="stroke"
                              shapeRendering="geometricPrecision"
                            />
                            <circle
                              cx={roundedCx} cy={roundedCy} r={6.5}
                              fill="none"
                              stroke="#222" strokeWidth={1}
                              vectorEffect="non-scaling-stroke"
                              shapeRendering="geometricPrecision"
                            />
                            {/* Label pill */}
                            <rect
                              x={pillX} y={pillY}
                              width={pillW} height={pillH}
                              rx={4} ry={4}
                              fill="rgba(255,255,255,0.88)"
                              stroke="rgba(0,0,0,0.13)"
                              strokeWidth={1}
                            />
                            {/* Leader line from pill bottom-center to dot top */}
                            <line
                              x1={roundedCx} y1={pillY + pillH}
                              x2={roundedCx} y2={roundedCy - 7}
                              stroke="rgba(0,0,0,0.25)" strokeWidth={1}
                            />
                            <text
                              x={roundedCx} y={pillY + pillH - pillPadY - 1}
                              textAnchor="middle"
                              fontSize={11}
                              fontFamily="var(--font-mono, monospace)"
                              fill="#111"
                              style={{ userSelect: 'none' }}
                            >
                              {labelText}
                            </text>
                          </g>
                        );
                      }}
                    />
                  );
                })}
                {refLines.filter((line) => !line.paneId || line.paneId === paneId).map((line) => (
                  <ReferenceLine key={line.id} {...(line.type === 'v' ? { x: line.value } : { y: line.value })} stroke={line.type === 'v' ? colors?.refV : colors?.refH} strokeDasharray="4 4" strokeWidth={selectedRefLineId === line.id ? 2 : 1} />
                ))}
                {dragStart !== null && dragCurrent !== null && <ReferenceLine x={dragStart} stroke="var(--accent)" strokeWidth={1} />}
                {dragStart !== null && dragCurrent !== null && <ReferenceLine x={dragCurrent} stroke="var(--accent)" strokeWidth={1} />}
                <ReferenceLine y={0} stroke="var(--dim)" strokeWidth={0.5} />
              </LineChart>
            </ResponsiveContainer>

            {hoverFreq != null && hoverRows.length > 0 && (
              <div style={{ position: 'absolute', top: '12px', right: '12px', minWidth: '220px', maxWidth: '320px', padding: '10px 12px', borderRadius: '12px', border: '1px solid color-mix(in srgb, var(--tipBd) 88%, white)', background: 'color-mix(in srgb, var(--tipBg) 82%, transparent)', boxShadow: '0 10px 28px rgba(0,0,0,0.18)', display: 'grid', gap: '6px', pointerEvents: 'none' }}>
                <div style={{ fontSize: 'var(--font-label)', fontWeight: 600, color: 'var(--text)' }}>
                  {formatAdaptiveXAxisValue(hoverFreq, visibleXSpan, { domain: activePaneTrace?.domain ?? 'frequency', unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz') })}
                </div>
                {hoverRows.map(({ trace, placement, color, resolutionLabel }) => (
                  <div key={trace.name} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', gap: '8px', alignItems: 'center' }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: color, boxShadow: '0 0 0 1px #333333' }} />
                    <span title={trace.dn || trace.name} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--font-label)', color: 'var(--text)' }}>{trace.dn || trace.name}</span>
                    <span style={{ fontSize: 'var(--font-label)', color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatScalarWithUnit(placement.amp, trace.units.y ?? null, { digits: 2 })}</span>
                    <span style={{ fontSize: 'var(--font-caption)', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{resolutionLabel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
