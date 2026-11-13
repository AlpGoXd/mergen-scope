import React, { useMemo, useState, useRef, useEffect, useContext } from 'react';
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
  ReferenceArea,
  Customized,
} from 'recharts';
import { planLastPaneLines, planWorkspacePaneRemoval, useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { usePaneState, usePaneDispatch, usePaneLimit } from '../../stores/pane-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useTraceState } from '../../stores/trace-store';
import { useSharedHoverPublisher } from '../../stores/shared-hover-store';
import { useTheme } from '../../hooks/use-theme';
import { usePaneData } from '../../hooks/use-pane-data';
import { useTableView } from '../../hooks/use-table-view';
import { useAnalysisOverlays } from '../../hooks/use-analysis-overlays';
import { useTraceColors } from '../../hooks/use-trace-colors';
import { useFileImport } from '../../hooks/use-file-import';
import { deriveAxisInfo } from '../../domain/units';
import { defaultTraceForPane } from '../../domain/default-trace';
import { canRenderInPane, checkPaneAssignment, planEmptyPaneType, planPaneTypeChange } from '../../domain/pane-placement';
import { paneDisplayState } from '../../domain/pane-display-state';
import { createPaneTypeRegistry, paneTypeOfMode } from '../../domain/pane-type-registry';
import type { PaneTypeDefinition } from '../../types/registry-contract';
import { PaneTypeChip } from '../panes/PaneTypeChip';
import { PaneTypeMenu } from '../panes/PaneTypeMenu';
import type { TypeChangePlan } from '../panes/PaneTypeMenu';
import type { PickerTileId } from '../panes/PaneTypePicker';
import { paneTypeCompatibilityNote, summarizePaneTypeChange } from '../../domain/pane-type-change-summary';
import { formatAdaptiveXAxisTickLabels, formatAdaptiveXAxisValue, formatPerDivision, formatScalarWithUnit, makeYAxisTickFormatter } from '../../domain/format';
import { getResolvedInterpolationStrategy } from '../../domain/interpolation';
import { placeMarker, nearestIndexByFreq } from '../../domain/markers';
import { computeVerticalIntersections, computeHorizontalIntersections } from '../../domain/ref-lines';
import { makeNiceTicks, NICE_TICK_COUNT } from '../../domain/trace-math';
import { allocateTraceColors, traceWidth } from '../../domain/trace-palette';
import { Btn } from '../shared/Btn';
import { LinesLayer, CrossingsLayer } from './LinesLayer';
import { OverlaysLayer } from './OverlaysLayer';
import { SymbolsLayer } from './SymbolsLayer';
import { useTraceSymbols } from '../../hooks/use-trace-symbols';
import type { ToastKind } from '../../stores/toast-store';
import type { PlotView } from './LinesLayer';
import { EdgeTag, lineContextEntries, lineShowInEntries } from '../lines/Lines';
import { Menu as KitMenu } from '../left-panel/Menu';
import { PopoverAt } from '../shared/Controls';
import { LineCrossingsContext } from '../analysis/line-crossings-context';
import { lineShowInChoices, linePaneAxisUnit, paneName } from '../../domain/line-view';
import { formatCrossingValue, } from '../../domain/analysis/crossing-rows';
import { EmptyChartPane, panePickerTiles } from './EmptyChartPane';
import { rendererFor } from './pane-renderers';
import { PaneSettingsPopover } from './PaneSettingsPopover';
import { PaneHeader, SamplesIcon } from './PaneHeader';
import { copyChartImage, downloadText } from './copy-chart';
import { tracesToCSV } from '../../domain/export';
import { defaultPaneSettings } from '../../types/pane';
import type { RefLine } from '../../types/ref-line';
import { usePaneDrag } from './use-pane-drag';
import { PaneDragOverlay } from './PaneDragOverlay';
import { refusalGuidance, traceAlreadyInPane } from '../../domain/pane-drop-hints';

/** Non-color glyph shape per marker type (normal = circle, delta = diamond, peak = triangle). */
function markerGlyphPolygonPoints(type: 'normal' | 'delta' | 'peak', cx: number, cy: number, r: number): string | null {
  if (type === 'delta') {
    return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  }
  if (type === 'peak') {
    const h = r * 1.15;
    return `${cx},${cy - h} ${cx + r},${cy + h * 0.6} ${cx - r},${cy + h * 0.6}`;
  }
  return null;
}

/** Next label for a new line (V1, V2, … / H1, H2, …).
 */
function nextLineLabel(type: 'v' | 'h', lines: readonly RefLine[]): string {
  const prefix = type === 'v' ? 'V' : 'H';
  const nums = lines
    .filter((l) => l.type === type && l.label?.startsWith(prefix))
    .map((l) => parseInt((l.label ?? '').slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return `${prefix}${nums.length ? Math.max(...nums) + 1 : 1}`;
}

export interface ChartPaneProps {
  paneId: string;
  hideXTicks?: boolean;
}

interface ChartMouseEvent {
  readonly activeLabel?: number | string;
  readonly activePayload?: ReadonlyArray<{ readonly value?: number }>;
  readonly xValue?: number;
  readonly chartX?: number;
  readonly chartY?: number;
  readonly nativeEvent?: { readonly clientX?: number; readonly clientY?: number };
  readonly offset?: { readonly left?: number; readonly width?: number };
  readonly xAxisMap?: Record<string, unknown>;
  readonly yAxisMap?: Record<string, unknown>;
}

const CHART_MARGIN_RIGHT = 20;
const CHART_MARGIN_TOP = 10;
const CHART_X_AXIS_HEIGHT = 35; // approximate height for x-axis ticks + label

export function ChartPane({ paneId, hideXTicks = false }: ChartPaneProps) {
  const xAxisHeight = hideXTicks ? 0 : CHART_X_AXIS_HEIGHT;
  const overlays = useAnalysisOverlays(paneId);
  const aggregate = useOptionalAggregateWorkspace();
  const historyDispatch = aggregate?.historyDispatch;
  const revision = aggregate?.state.revision;
  const { panes, activePaneId, tracePaneMap, paneActiveTraceMap, zoomAll, sharedZoom, paneXZooms, paneYZooms } = usePaneState();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const { refLines, refMode, selectedRefLineId, hoveredRefLineId } = useRefLineState();
  const refLineDispatch = useRefLineDispatch();
  const { selectedTraceName, markerTrace, traceHueSlots, paneAssignmentWarning } = useUiState();
  const resolveColor = useTraceColors();
  const traceSymbol = useTraceSymbols();
  const uiDispatch = useUiDispatch();
  const paneDispatch = usePaneDispatch();
  const { limit } = usePaneLimit();
  const importFiles = useFileImport();
  const { allTraces, allKnownTraces, allDisplayTraces, vis } = useTraceState();
  const publishHover = useSharedHoverPublisher();
  useEffect(() => () => publishHover(null, paneId), [publishHover, paneId]);
  const tableView = useTableView(paneId);
  const colorAssignments = useMemo(() => allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))), [allKnownTraces, traceHueSlots]);
  const { colors } = useTheme();

  const pane = panes.find((item) => item.id === paneId) || panes[0];
  if (!pane) return null;
  const drag = usePaneDrag({ pane, panes, traces: allKnownTraces, memberships: tracePaneMap, displays: allDisplayTraces }, source => historyDispatch?.({ type: 'change', command: { slice: 'layout', action: { type: 'SWAP_PANES', sourcePaneId: source, targetPaneId: paneId } } }));
  useEffect(() => {
    if (paneAssignmentWarning?.source !== 'drop' || paneAssignmentWarning.paneId !== paneId) return;
    drag.showRefusal(paneAssignmentWarning.message);
    uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } });
  }, [paneAssignmentWarning, paneId, uiDispatch]);
  const isActive = activePaneId === paneId;
  const isSmith = pane.renderMode === 'smith' || pane.renderMode === 'smith-inverted';
  const settings = { ...defaultPaneSettings(), ...pane.settings };

  const [smithFitRequest, setSmithFitRequest] = useState(0);
  useEffect(() => {
    const fit = () => setSmithFitRequest(value => value + 1);
    window.addEventListener('mergen-fit-all', fit);
    return () => window.removeEventListener('mergen-fit-all', fit);
  }, []);
  const [typeAnchor, setTypeAnchor] = useState<HTMLElement | null>(null);
  const [typeChange, setTypeChange] = useState<{ plan: TypeChangePlan; revision: number | undefined } | null>(null);
  const pendingType = typeChange?.plan ?? null;
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [hoveredType, setHoveredType] = useState<PickerTileId | null>(null);
  const [focusedType, setFocusedType] = useState<PickerTileId | null>(null);
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const typeTriggerRef = useRef<HTMLElement | null>(null);
  const returnToTileRef = useRef<string | null>(null);
  const paneRootRef = useRef<HTMLDivElement>(null);
  const paneTypes = createPaneTypeRegistry({ smithCapability: trace => canRenderInPane({ trace, paneIds: [], displayTrace: allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) }, { ...pane, renderMode: 'smith' }) });
  const currentType = paneTypeOfMode(pane.renderMode);
  const SmithRenderer = currentType === 'smith' ? rendererFor(currentType) : null;
  const TableRenderer = currentType === 'table' ? rendererFor(currentType) : null;
  const tileFromTarget = (target: EventTarget | null): PickerTileId | null => {
    if (!(target instanceof Element)) return null;
    const tile = target.closest('.ptm-tile');
    if (!tile || !typeMenuRef.current?.contains(tile)) return null;
    return panePickerTiles(Object.values(paneTypes)).find(item => item.label === tile.textContent?.trim())?.id ?? null;
  };
  const cancelTypeChange = () => {
    returnToTileRef.current = pendingType?.toLabel ?? null;
    setTypeChange(null);
  };
  const selectPaneType = (type: PaneTypeDefinition, confirmed = false) => {
    if (type.status !== 'available' || type.renderMode === null || (type.id === currentType && pane.typed)) return;
    const mode = type.renderMode;
    const entries = allKnownTraces.map(trace => ({ trace, paneIds: tracePaneMap[trace.name] ?? [], displayTrace: allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) }));
    const plan = planPaneTypeChange(panes, entries, paneId, mode);
    if (!plan.ok) return;
    const leaving = entries.filter(entry => entry.paneIds.includes(paneId) && !canRenderInPane(entry, { ...pane, renderMode: mode }).allowed).map(entry => ({ name: entry.trace.name, displayName: entry.trace.dn || entry.trace.name }));
    if (confirmed && revision !== typeChange?.revision && !leaving.length) { cancelTypeChange(); return; }
    if (leaving.length && (!confirmed || revision !== typeChange?.revision)) {
      const summary = summarizePaneTypeChange(plan.plan, leaving, id => paneName(panes, id));
      setTypeChange({ plan: { to: type.id as PickerTileId, toLabel: type.title, ...summary }, revision });
      return;
    }
    const action = { type: 'SET_RENDER_MODE' as const, payload: { paneId, mode, confirmed, ...(confirmed && typeChange?.revision !== undefined ? { expectedRevision: typeChange.revision } : {}) } };
    if (historyDispatch) historyDispatch({ type: 'change', command: { slice: 'panes', action, limit } });
    else paneDispatch({ ...action, payload: { ...action.payload, traces: entries } });
    setTypeChange(null);
    setTypeAnchor(null);
    setSettingsAnchor(null);
    typeTriggerRef.current?.focus({ preventScroll: true });
    typeTriggerRef.current = null;
  };

  useEffect(() => {
    const root = typeAnchor ? typeMenuRef.current : settingsAnchor ? settingsMenuRef.current : null;
    if (!root) return;
    if (!pendingType && returnToTileRef.current) {
      const tiles = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      const target = tiles.find(tile => tile.textContent?.trim() === returnToTileRef.current) ?? tiles[0];
      returnToTileRef.current = null;
      target?.focus({ preventScroll: true });
      return;
    }
    const target = pendingType ? root.querySelector<HTMLButtonElement>('.ptm-actions .ui-btn--solid') : typeAnchor ? root.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]') : null;
    target?.focus({ preventScroll: true });
  }, [typeAnchor, settingsAnchor, pendingType]);

  const traceNamesInPane = useMemo(() => {
    return Object.entries(tracePaneMap)
      .filter(([_, ids]) => ids.includes(paneId))
      .map(([name]) => name);
  }, [tracePaneMap, paneId]);
  const displayState = paneDisplayState(pane, traceNamesInPane.length);

  const currentXZoom = zoomAll ? sharedZoom : (paneXZooms[paneId] || null);
  const xRange = currentXZoom ? { left: currentXZoom.left, right: currentXZoom.right } : null;
  const { paneTraces, mergedData, plotData } = usePaneData(traceNamesInPane, xRange);
  const shownCount = TableRenderer ? tableView.traces.length : paneTraces.length;
  const currentYZoom = paneYZooms[paneId] ?? null;

  const xDiv = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const t of paneTraces) {
      const first = t.data[0]?.freq, last = t.data[t.data.length - 1]?.freq;
      if (Number.isFinite(first)) lo = Math.min(lo, first as number);
      if (Number.isFinite(last)) hi = Math.max(hi, last as number);
    }
    const defaultXDomain = Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? { min: lo, max: hi } : null;
    const dom = currentXZoom ? { min: currentXZoom.left, max: currentXZoom.right } : defaultXDomain;
    const ticks = makeNiceTicks(dom, NICE_TICK_COUNT);
    if (!ticks || ticks.length < 2) return '—';
    const first = ticks[0], second = ticks[1];
    if (first === undefined || second === undefined) return '—';
    return formatPerDivision(second - first);
  }, [paneTraces, currentXZoom]);

  const yDiv = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const t of paneTraces) {
      for (const p of t.data) {
        if (Number.isFinite(p.amp)) { lo = Math.min(lo, p.amp); hi = Math.max(hi, p.amp); }
      }
    }
    const defaultYDomain = Number.isFinite(lo) && Number.isFinite(hi) && hi > lo
      ? { min: lo - (hi - lo) * 0.05, max: hi + (hi - lo) * 0.05 }
      : null;
    const dom = currentYZoom ?? defaultYDomain;
    const ticks = makeNiceTicks(dom, NICE_TICK_COUNT);
    if (!ticks || ticks.length < 2) return '—';
    const first = ticks[0], second = ticks[1];
    if (first === undefined || second === undefined) return '—';
    return formatPerDivision(second - first, paneTraces[0]?.units.y);
  }, [paneTraces, currentYZoom]);

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

  const paneRefLines = useMemo(() => {
    return refLines.filter(l => l.paneIds.includes(paneId));
  }, [refLines, paneId]);

  const paneVLines = useMemo(() => paneRefLines.filter(l => l.type === 'v'), [paneRefLines]);
  const paneHLines = useMemo(() => paneRefLines.filter(l => l.type === 'h'), [paneRefLines]);

  const vDeltaPairs = useMemo(() => {
    const pairs: [typeof paneVLines[0], typeof paneVLines[0]][] = [];
    const seen = new Set<string>();
    for (const line of paneVLines) {
      if (line.deltaPartnerId == null) continue;
      const partner = paneVLines.find(l => l.id === line.deltaPartnerId);
      if (!partner) continue;
      const key = `${Math.min(line.id, partner.id)}-${Math.max(line.id, partner.id)}`;
      if (!seen.has(key)) { seen.add(key); pairs.push([line, partner]); }
    }
    return pairs;
  }, [paneVLines]);

  const hDeltaPairs = useMemo(() => {
    const pairs: [typeof paneHLines[0], typeof paneHLines[0]][] = [];
    const seen = new Set<string>();
    for (const line of paneHLines) {
      if (line.deltaPartnerId == null) continue;
      const partner = paneHLines.find(l => l.id === line.deltaPartnerId);
      if (!partner) continue;
      const key = `${Math.min(line.id, partner.id)}-${Math.max(line.id, partner.id)}`;
      if (!seen.has(key)) { seen.add(key); pairs.push([line, partner]); }
    }
    return pairs;
  }, [paneHLines]);

  const xDomain = useMemo(() => {
    const min = currentXZoom?.left ?? mergedData[0]?.fs ?? null;
    const max = currentXZoom?.right ?? mergedData[mergedData.length - 1]?.fs ?? null;
    if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return null;
    }
    return { min, max };
  }, [currentXZoom, mergedData]);

  // Right-click menu on a line (kit lineContextEntries; "Show in" opens the checklist as a second menu).
  const [lineMenu, setLineMenu] = useState<{ lineId: number; at: { x: number; y: number }; mode: 'main' | 'showin' } | null>(null);
  const { listCrossings } = useContext(LineCrossingsContext);
  const changeLine = (action: Parameters<typeof refLineDispatch>[0], message: string, toastKind?: ToastKind) => {
    if (historyDispatch) historyDispatch({ type: 'change', ...(toastKind ? { toastMessage: message, toastKind } : {}), command: { slice: 'lines', action } });
    else refLineDispatch(action);
  };
  const [dragStart, setDragStart] = React.useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = React.useState<number | null>(null);
  const [zoomDragActive, setZoomDragActive] = React.useState(false);
  const [panStartZoom, setPanStartZoom] = React.useState<{ left: number; right: number } | null>(null);
  const [panStartClientX, setPanStartClientX] = React.useState<number | null>(null);
  const [draggingMarkerIdx, setDraggingMarkerIdx] = React.useState<number | null>(null);
  const [draggingRefLineId, setDraggingRefLineId] = React.useState<number | null>(null);
  const [hoverFreq, setHoverFreq] = React.useState<number | null>(null);
  const chartAreaRef = React.useRef<HTMLDivElement | null>(null);
  const [plotHeight, setPlotHeight] = useState(0);
  const [paneDragOver, setPaneDragOver] = useState(false);
  const hasChart = !isSmith && traceNamesInPane.length > 0 && mergedData.length > 0;
  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const height = Math.max(0, entry.contentRect.height - CHART_MARGIN_TOP - xAxisHeight - 10);
      setPlotHeight(current => current === height ? current : height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasChart, xAxisHeight]);
  useEffect(() => {
    const clear = () => setPaneDragOver(false);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear, true);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear, true);
    };
  }, []);
  const lastPointerClientXRef = React.useRef<number | null>(null);
  const lastPointerClientYRef = React.useRef<number | null>(null);
  const lastPointerButtonRef = React.useRef<number | null>(null);
  const yAxisMapRef = React.useRef<Record<string, unknown> | null>(null);
  const lineChartRef = React.useRef<any>(null);
  const latestMergedDataRef = React.useRef(mergedData);
  latestMergedDataRef.current = mergedData;
  const latestPaneTracesRef = React.useRef(paneTraces);
  latestPaneTracesRef.current = paneTraces;

  const clearPointerDragState = React.useCallback(() => {
    setDragStart(null);
    setDragCurrent(null);
    setZoomDragActive(false);
    setPanStartZoom(null);
    setPanStartClientX(null);
    setDraggingMarkerIdx(null);
    setDraggingRefLineId(null);
    lastPointerClientXRef.current = null;
    lastPointerClientYRef.current = null;
    lastPointerButtonRef.current = null;
  }, []);

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

  const activePaneTrace = useMemo(() => {
    const activeTraceName = paneActiveTraceMap[paneId];
    return paneTraces.find((trace) => trace.name === activeTraceName)
      ?? paneTraces.find((trace) => trace.name === selectedTraceName)
      ?? paneTraces[0]
      ?? null;
  }, [paneActiveTraceMap, paneId, paneTraces, selectedTraceName]);

  // Visible Y range: the zoom window, or the data extremes when Recharts auto-scales.
  const yValueRange = useMemo((): { min: number; max: number } | null => {
    if (Array.isArray(yDomain) && yDomain[0] !== 'auto') {
      return { min: yDomain[0], max: yDomain[1] };
    }
    let lo = Infinity, hi = -Infinity;
    for (const row of mergedData) {
      for (const tr of paneTraces) {
        const v = row[tr.name] as number | undefined;
        if (v != null && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
    }
    return Number.isFinite(lo) && Number.isFinite(hi) ? { min: lo, max: hi } : null;
  }, [mergedData, paneTraces, yDomain]);

  const formatYTick = useMemo(
    () => makeYAxisTickFormatter(yValueRange, activePaneTrace?.units.y),
    [activePaneTrace?.units.y, yValueRange],
  );

  const yAxisWidthRef = useRef<{ key: string; width: number } | null>(null);
  // A grow-only width stops the plot from shifting during pan/zoom.
  // Y axis width follows the longest tick label so ticks never run into the rotated axis title.
  // The pointer math below must use the same width, or clicks/zoom/markers land off by the difference.
  const yAxisWidth = useMemo(() => {
    const niceTicks = makeNiceTicks(yValueRange, NICE_TICK_COUNT) ?? [];
    const autoDomainTicks: number[] = [];
    if (niceTicks.length >= 2) {
      const first = niceTicks[0];
      const second = niceTicks[1];
      const last = niceTicks[niceTicks.length - 1];
      if (first !== undefined && second !== undefined && last !== undefined) {
        const step = second - first;
        // Recharts' auto domain rounds out to these values, so measure them too.
        autoDomainTicks.push(first - step, last + step);
      }
    }
    // Raw range edges are not drawn as labels.
    const ticks = niceTicks.length > 0 ? [...niceTicks, ...autoDomainTicks] : yValueRange ? [yValueRange.min, yValueRange.max] : [];
    const maxChars = Math.max(0, ...ticks.map((tick) => formatYTick(tick).length));
    // shortcut: ~7px per character at --font-label; measure text with a canvas if the font becomes user-scalable
    const measuredWidth = Math.min(110, Math.max(56, 26 + maxChars * 7));
    const key = `${traceNamesInPane.join('|')}|${activePaneTrace?.units.y ?? ''}`;
    const previous = yAxisWidthRef.current;
    const width = previous?.key === key ? Math.max(previous.width, measuredWidth) : measuredWidth;
    yAxisWidthRef.current = { key, width };
    return width;
  }, [activePaneTrace?.units.y, formatYTick, traceNamesInPane, yValueRange]);
  // The pane's real plot rectangle in client pixels (reported by the lines layer), so the cursor maps to axis values exactly.
  const plotGeometry = (): { svgLeft: number; svgTop: number; plot: PlotView['plot'] } | null => {
    const svg = chartAreaRef.current?.querySelector('svg.recharts-surface');
    if (!svg || !plotView || plotView.plot.width <= 0 || plotView.plot.height <= 0) return null;
    const rect = svg.getBoundingClientRect();
    return { svgLeft: rect.left, svgTop: rect.top, plot: plotView.plot };
  };

  const resolveClientFreq = (
    clientX: number,
    domainOverride?: { left: number; right: number } | null,
  ): number | null => {
    const chartEl = chartAreaRef.current;
    const geometry = plotGeometry();
    const domainLeft = domainOverride?.left ?? (geometry ? plotView?.x?.[0] : undefined) ?? currentXZoom?.left ?? mergedData[0]?.fs ?? null;
    const domainRight = domainOverride?.right ?? (geometry ? plotView?.x?.[1] : undefined) ?? currentXZoom?.right ?? mergedData[mergedData.length - 1]?.fs ?? null;
    if (!chartEl || domainLeft == null || domainRight == null || domainRight <= domainLeft) return null;
    if (geometry) {
      const gx = Math.max(0, Math.min(geometry.plot.width, clientX - geometry.svgLeft - geometry.plot.left));
      return geometry.plot.width > 0 ? domainLeft + (gx / geometry.plot.width) * (domainRight - domainLeft) : null;
    }
    const rect = chartEl.getBoundingClientRect();
    const plotLeft = yAxisWidth;
    const plotWidth = rect.width - plotLeft - CHART_MARGIN_RIGHT;
    if (plotWidth <= 0) return null;
    const x = Math.max(0, Math.min(plotWidth, clientX - rect.left - plotLeft));
    return domainLeft + (x / plotWidth) * (domainRight - domainLeft);
  };

  const computeRefLineYTolerance = React.useCallback((): number => {
    const chartEl = chartAreaRef.current;
    const plotHeight = chartEl ? chartEl.getBoundingClientRect().height - CHART_MARGIN_TOP - xAxisHeight : 0;
    if (plotHeight <= 0) return 0;
    if (Array.isArray(yDomain) && yDomain[0] !== 'auto') {
      const span = (yDomain[1] as number) - (yDomain[0] as number);
      return (span / plotHeight) * 8;
    }
    return 0;
  }, [yDomain, xAxisHeight]);

  const computeMarkerHitTolerance = React.useCallback((): number => {
    const chartEl = chartAreaRef.current;
    const plotWidth = chartEl
      ? chartEl.getBoundingClientRect().width - yAxisWidth - CHART_MARGIN_RIGHT
      : 0;
    if (plotWidth <= 0 || !Number.isFinite(plotWidth)) {
      return visibleXSpan * 0.006;
    }

    const fullSpan = paneDataBounds ? Math.max(paneDataBounds.max - paneDataBounds.min, visibleXSpan) : visibleXSpan;
    const zoomRatio = fullSpan > 0 ? Math.max(0, Math.min(1, visibleXSpan / fullSpan)) : 1;
    const hitRadiusPx = 3 + zoomRatio * 4;
    return Math.max((visibleXSpan / plotWidth) * hitRadiusPx, visibleXSpan * 1e-6);
  }, [paneDataBounds, visibleXSpan, yAxisWidth]);

  const resolveBaseYDomain = React.useCallback((): { min: number; max: number } | null => {
    if (Array.isArray(yDomain) && yDomain[0] !== 'auto') {
      return { min: yDomain[0], max: yDomain[1] };
    }
    const amps = mergedData.flatMap((row) =>
      paneTraces.map((tr) => row[tr.name] as number | undefined).filter((v): v is number => v != null && Number.isFinite(v))
    );
    if (!amps.length) return null;
    const minAmp = Math.min(...amps);
    const maxAmp = Math.max(...amps);
    const pad = (maxAmp - minAmp) * 0.05 || 1;
    return { min: minAmp - pad, max: maxAmp + pad };
  }, [mergedData, paneTraces, yDomain]);

  // The line layer reports the plot rectangle and the real scale domains: they feed the edge tags here and the rows' "off view" text.
  const [plotView, setPlotView] = useState<PlotView | null>(null);
  const handlePlotView = React.useCallback((view: PlotView) => {
    setPlotView(prev => prev && prev.x?.[0] === view.x?.[0] && prev.x?.[1] === view.x?.[1] && prev.y?.[0] === view.y?.[0] && prev.y?.[1] === view.y?.[1]
      && prev.plot.left === view.plot.left && prev.plot.top === view.plot.top && prev.plot.width === view.plot.width && prev.plot.height === view.plot.height ? prev : view);
    refLineDispatch({ type: 'SET_PANE_VIEW', payload: { paneId, view: { x: view.x, y: view.y } } });
  }, [refLineDispatch, paneId]);
  useEffect(() => () => refLineDispatch({ type: 'SET_PANE_VIEW', payload: { paneId, view: null } }), [refLineDispatch, paneId]);

  const resolveClientAmp = (clientY: number, overshootFraction = 0): number | null => {
    const chartEl = chartAreaRef.current;
    if (!chartEl) return null;
    const geometry = plotGeometry();
    const baseDomain = geometry && plotView?.y ? { min: plotView.y[0], max: plotView.y[1] } : resolveBaseYDomain();
    if (!baseDomain) return null;
    let yMin = baseDomain.min;
    let yMax = baseDomain.max;
    if (overshootFraction > 0) {
      const overshoot = (yMax - yMin) * overshootFraction;
      yMin -= overshoot;
      yMax += overshoot;
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) return null;
    if (geometry) {
      const gy = Math.max(0, Math.min(geometry.plot.height, clientY - geometry.svgTop - geometry.plot.top));
      return yMax - (gy / geometry.plot.height) * (yMax - yMin);
    }
    const rect = chartEl.getBoundingClientRect();
    const plotHeight = rect.height - CHART_MARGIN_TOP - xAxisHeight;
    if (plotHeight <= 0) return null;
    const y = Math.max(0, Math.min(plotHeight, clientY - rect.top - CHART_MARGIN_TOP));
    return yMax - (y / plotHeight) * (yMax - yMin);
  };

  const resolveEventAmp = (e: ChartMouseEvent | undefined): number | null => {
    if (!e) return null;
    if (e.yAxisMap) yAxisMapRef.current = e.yAxisMap;
    const instanceYMap = lineChartRef.current?.state?.yAxisMap as Record<string, unknown> | undefined;
    if (instanceYMap && !yAxisMapRef.current) yAxisMapRef.current = instanceYMap;
    const clientY = e.nativeEvent?.clientY ?? lastPointerClientYRef.current;
    if (clientY == null) return null;

    // Explicit yDomain (manual zoom): resolveClientAmp is exact — use it directly.
    if (Array.isArray(yDomain) && yDomain[0] !== 'auto') {
      return resolveClientAmp(clientY);
    }

    // Auto-scale: Recharts' nice-tick domain differs from our 5%-padded estimate,
    // so use scale.invert from the D3 scale which knows the actual rendered domain.
    const yMap = e.yAxisMap ?? yAxisMapRef.current ?? instanceYMap;
    if (yMap && chartAreaRef.current) {
      const yEntry = Object.values(yMap)[0] as any;
      const scale = yEntry?.scale;
      if (scale && typeof scale.invert === 'function') {
        const svgEl = chartAreaRef.current.querySelector('svg');
        const svgRect = svgEl?.getBoundingClientRect();
        if (svgRect) {
          const val = scale.invert(clientY - svgRect.top) as number;
          if (Number.isFinite(val)) return val;
        }
      }
    }

    return resolveClientAmp(clientY);
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

    if (button === 2) return;
    if (button !== 0) return;

    if (refMode === 'v') {
      const newId = Date.now();
      refLineDispatch({ type: 'ADD_LINE', payload: { id: newId, type: 'v', value: freq, paneIds: [paneId], label: nextLineLabel('v', refLines) } });
      refLineDispatch({ type: 'SET_MODE', payload: null });
      refLineDispatch({ type: 'SET_SELECTED', payload: newId });
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
      return;
    }
    if (refMode === 'h') {
      const yVal = resolveEventAmp(e) ?? 0;
      const newId = Date.now();
      refLineDispatch({ type: 'ADD_LINE', payload: { id: newId, type: 'h', value: yVal, paneIds: [paneId], label: nextLineLabel('h', refLines) } });
      refLineDispatch({ type: 'SET_MODE', payload: null });
      refLineDispatch({ type: 'SET_SELECTED', payload: newId });
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
      return;
    }

    if (armed) {
      const reference = armed.kind === 'delta' ? markers.find(marker => marker.id === armed.refId) : null;
      const trace = reference ? allTraces.find(item => item.name === reference.trace && traceNamesInPane.includes(item.name)) : resolvePlacementTrace(freq, e?.nativeEvent?.clientY ?? lastPointerClientYRef.current);
      if (trace) { refLineDispatch({ type: 'SET_SELECTED', payload: null }); markerDispatch({ type: 'PLACE_MARKER', payload: { trace, targetFreq: freq, markerType: armed.kind, refId: reference?.id ?? null, magneticSnap: { nearestPointPixelDistance: computeNearestPixelDist(trace, freq), snapThresholdPx: 10 } } }); }
      return;
    }

    const tol = computeMarkerHitTolerance();

    // Click near an existing marker → select it and start drag (in all modes)
    const markerHit = paneMarkers.find(({ marker }) => Math.abs(marker.freq - freq) < tol);
    if (markerHit) {
      refLineDispatch({ type: 'SET_SELECTED', payload: null });
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: markerHit.index });
      historyDispatch?.({type:'begin-gesture'});
      setDraggingMarkerIdx(markerHit.index);
      return;
    }

    const lineHit = refLines
      .filter((line) => line.type === 'v' && line.paneIds.includes(paneId))
      .find((line) => Math.abs(line.value - freq) < tol);
    if (lineHit) {
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
      refLineDispatch({ type: 'SET_SELECTED', payload: lineHit.id });
      historyDispatch?.({type:'begin-gesture'});
          setDraggingRefLineId(lineHit.id);
      return;
    }

    const cursorAmp = resolveEventAmp(e);
    const yTol = computeRefLineYTolerance();
    const hLineHit = cursorAmp != null && yTol > 0
      ? refLines
          .filter((line) => line.type === 'h' && line.paneIds.includes(paneId))
          .find((line) => Math.abs(cursorAmp - line.value) < yTol)
      : null;
    if (hLineHit) {
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
      refLineDispatch({ type: 'SET_SELECTED', payload: hLineHit.id });
      historyDispatch?.({type:'begin-gesture'});
          setDraggingRefLineId(hLineHit.id);
      return;
    }

    markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
    refLineDispatch({ type: 'SET_SELECTED', payload: null });
    uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: null } });
  };

  const handleMouseMove = (e: ChartMouseEvent | undefined) => {
    if (e?.yAxisMap) yAxisMapRef.current = e.yAxisMap;
    const freq = resolveEventFreq(e, true);
    if (freq == null || !Number.isFinite(freq)) return;
    setHoverFreq(freq);
    const xUnit = paneTraces[0]?.units.x;
    if (xUnit) publishHover({ paneId, xUnit, value: freq }, paneId);

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
      const draggingLine = refLines.find(l => l.id === draggingRefLineId);
      if (draggingLine) {
        refLineDispatch({ type: 'SET_SELECTED', payload: draggingRefLineId });
        const newValue = draggingLine.type === 'h'
          ? (resolveEventAmp(e) ?? draggingLine.value)
          : freq;
        refLineDispatch({ type: 'UPDATE_LINE', payload: { id: draggingRefLineId, updates: { value: newValue } } });
      }
      return;
    }
  };

  const handleMouseLeave = () => {
    setHoverFreq(null);
    publishHover(null, paneId);
    lastPointerClientXRef.current = null;
    lastPointerClientYRef.current = null;
  };

  const handleMouseUp = () => {
    if (zoomDragActive || panStartZoom) return;
    if (draggingMarkerIdx !== null || draggingRefLineId !== null) historyDispatch?.({type:'commit-gesture'});
    clearPointerDragState();
  };

  React.useEffect(() => {
    if (draggingMarkerIdx === null && draggingRefLineId === null) return;
    const finish = () => { historyDispatch?.({type:'commit-gesture'}); clearPointerDragState(); };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      historyDispatch?.({type:'cancel-gesture'}); clearPointerDragState(); event.preventDefault(); event.stopPropagation();
    };
    window.addEventListener('mouseup',finish);
    window.addEventListener('keydown',cancel,true);
    return () => { window.removeEventListener('mouseup',finish); window.removeEventListener('keydown',cancel,true); };
  },[draggingMarkerIdx,draggingRefLineId,historyDispatch,clearPointerDragState]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const direction: -1 | 1 = e.deltaY > 0 ? 1 : -1; // +1 = out, -1 = in
    const baseDomain = resolveBaseYDomain();
    if (!baseDomain) return;
    const span = baseDomain.max - baseDomain.min;
    if (!(span > 0)) return;

    // Shift+wheel: pan Y
    if (e.shiftKey) {
      const shift = span * 0.15 * direction;
      paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: { min: baseDomain.min + shift, max: baseDomain.max + shift } } });
      return;
    }

    // Default wheel: zoom Y by ~8% per tick, anchored at cursor
    const rawAnchor = resolveClientAmp(e.clientY) ?? (baseDomain.min + baseDomain.max) / 2;
    const anchor = Math.max(baseDomain.min, Math.min(baseDomain.max, rawAnchor));
    const WHEEL_ZOOM_FACTOR = 1.08;
    const newSpan = span * (direction > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR);
    if (!Number.isFinite(newSpan) || newSpan < 1e-10) return;
    const frac = Math.max(0, Math.min(1, (anchor - baseDomain.min) / span));
    const newMin = anchor - frac * newSpan;
    const newMax = newMin + newSpan;
    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: { min: newMin, max: newMax } } });
  };

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activePaneId !== paneId) {
      paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
    }
    lastPointerButtonRef.current = e.button;
    if (e.button === 2) {
      if (armed || refMode) return;
      e.preventDefault();
      const zoom = zoomAll ? sharedZoom : (paneXZooms[paneId] || null);
      if (zoom) {
        setPanStartZoom({ left: zoom.left, right: zoom.right });
        setPanStartClientX(e.clientX);
        return;
      }
      const startFreq = resolveClientFreq(e.clientX);
      if (startFreq == null || !Number.isFinite(startFreq)) return;
      setDragStart(startFreq);
      setDragCurrent(startFreq);
      setZoomDragActive(true);
      return;
    }
    if (e.button !== 1) return;
    e.preventDefault();
    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: null } });
    if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: null });
    else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: null } });
  };

  // Right-click on a chart: the browser menu never appears. A line (or its label) handles it itself and opens its own menu first;
  // on anything else it does nothing, except that it cancels an armed tool, like Esc.
  const handlePaneContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const handledByLine = e.defaultPrevented;
    e.preventDefault();
    if (handledByLine) return;
    if (refMode !== null) refLineDispatch({ type: 'SET_MODE', payload: null });
    if (armed) markerDispatch({ type: 'ARM', payload: null });
  };

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
    if (activePaneTrace.kind === 'derived') return 'Amplitude (–)';
    return axisInfo.yLabel || 'Amplitude';
  }, [activePaneTrace, axisInfo.yLabel]);

  const shortYLabel = yAxisLabelText.match(/\([^()]+\)\s*$/)?.[0] ?? yAxisLabelText.split(/\s+/)[0] ?? '';
  const fittedYLabel = yAxisLabelText.length * 7 <= plotHeight ? yAxisLabelText
    : shortYLabel.length * 7 <= plotHeight ? shortYLabel : '';

  const xTickValues = useMemo(() => makeNiceTicks(xDomain, NICE_TICK_COUNT), [xDomain]);
  const yTickValues = useMemo(() => {
    if (Array.isArray(yDomain) && yDomain[0] !== 'auto') {
      return makeNiceTicks({ min: yDomain[0] as number, max: yDomain[1] as number }, NICE_TICK_COUNT);
    }
    return undefined;
  }, [yDomain]);
  const xTickLabelMap = useMemo(() => {
    const ticks = xTickValues ?? [];
    const labels = formatAdaptiveXAxisTickLabels(ticks, visibleXSpan, {
      domain: activePaneTrace?.domain ?? 'frequency',
      unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz'),
    });
    return new Map(ticks.map((tick, index) => [tick, labels[index] ?? '--']));
  }, [activePaneTrace?.domain, activePaneTrace?.units.x, visibleXSpan, xTickValues]);

  // Close pane (Pane settings and the empty-pane header): traces and lines move by the closing-pane rule.
  const closePane = () => {
    if (!aggregate) return;
    const state = aggregate.state;
    const result = planWorkspacePaneRemoval(state, paneId);
    if (!result.ok) { window.alert(result.reason); return; }
    const { moved, unplaced } = result.plan;
    const lines = planLastPaneLines(state, paneId, result.plan.memberships);
    if (unplaced.length || lines.length) {
      const details = [...moved.map(move => `${move.traceName} -> ${paneName(panes, move.to)}`), ...unplaced.map(name => `${name} -> not in a pane`), ...lines.map(move => `${move.line.label || `Line ${move.line.id}`} -> ${move.to ? paneName(panes, move.to) : 'not in a pane'}`)];
      if (!window.confirm(`Close ${paneName(panes, paneId)}? Traces will remain available.\n\n${details.join('\n')}`)) return;
    }
    const destinations = [...new Set(moved.map(move => paneName(panes, move.to)))];
    aggregate.historyDispatch({ type: 'change', command: { slice: 'remove-pane', targetPaneId: paneId, expectedRevision: state.revision, confirmed: unplaced.length > 0 || lines.length > 0, limit }, ...(moved.length ? { toastMessage: `${moved.length} trace${moved.length === 1 ? '' : 's'} moved to ${destinations.join(', ')}`, toastKind: 'moved' as const } : {}) });
  };

  const resolveTraceColor = useMemo(() => {
    return (traceName: string): string => {
      const trace = allTraces.find((item) => item.name === traceName);
      return trace ? resolveColor(trace) : 'var(--accent)';
    };
  }, [allTraces, resolveColor]);

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

    const defaultTrace = defaultTraceForPane(allTraces, selectedTraceName, paneId, tracePaneMap, vis);
    if (defaultTrace) return defaultTrace;

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
  }, [markerTrace, selectedTraceName, paneActiveTraceMap, paneId, paneTraces, currentXZoom, allTraces, tracePaneMap, vis]);

  const computeNearestPixelDist = React.useCallback((trace: typeof paneTraces[0], targetFreq: number): number => {
    const nearestIdx = nearestIndexByFreq(trace.data, targetFreq);
    const nearest = trace.data[nearestIdx];
    if (!nearest) return Infinity;
    const el = chartAreaRef.current;
    if (!el) return Infinity;
    const domainLeft = currentXZoom?.left ?? mergedData[0]?.fs ?? 0;
    const domainRight = currentXZoom?.right ?? mergedData[mergedData.length - 1]?.fs ?? 1;
    if (domainRight <= domainLeft) return Infinity;
    const plotWidth = el.getBoundingClientRect().width - yAxisWidth - CHART_MARGIN_RIGHT;
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
  }, [currentXZoom, mergedData, yAxisWidth]);

  const handlePaneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (drag.over(e)) return;
    // dataTransfer.files is always empty during dragover; only `types` is readable then.
    if (e.dataTransfer.types.includes('application/x-mergen-trace') || e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setPaneDragOver(true);
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-mergen-trace') ? 'move' : 'copy';
    }
  };

  const handlePaneDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (drag.drop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setPaneDragOver(false);
    const traceName = e.dataTransfer.getData('application/x-mergen-trace') || e.dataTransfer.getData('text/plain');
    // Only a known trace name is a trace move; file drags can carry unrelated text/plain too.
    const trace = traceName ? allKnownTraces.find((item) => item.name === traceName) : undefined;
    if (trace) {
      if (traceAlreadyInPane(tracePaneMap, trace.name, paneId)) return;
      const entry = { trace, paneIds: [], displayTrace: allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) };
      const acceptsCurrent = pane.renderMode === 'smith' || pane.renderMode === 'smith-inverted' ? canRenderInPane(entry, pane) : paneTypes[currentType].appliesTo(trace);
      const choice = acceptsCurrent.allowed ? { mode: pane.renderMode, reason: undefined } : !pane.typed ? planEmptyPaneType(paneTypes, pane, trace, traceNamesInPane.length === 0) : { mode: null, reason: acceptsCurrent.reason };
      if (!choice.mode) {
        drag.showRefusal(refusalGuidance(choice.reason ?? 'Cannot assign trace to this pane.', trace, `Pane ${panes.findIndex(item => item.id === paneId) + 1}`, []));
        return;
      }
      const targetPanes = choice.mode ? panes.map(item => item.id === paneId ? { ...item, renderMode: choice.mode ?? item.renderMode } : item) : panes;
      const validation = checkPaneAssignment(trace, paneId, allKnownTraces, tracePaneMap, targetPanes, allDisplayTraces);
      if (!validation.allowed) {
        drag.showRefusal(refusalGuidance(validation.reason, trace, `Pane ${panes.findIndex(item => item.id === paneId) + 1}`, allKnownTraces.filter(item => tracePaneMap[item.name]?.includes(paneId))));
        return;
      }
      const fromPaneId = activePaneId && tracePaneMap[trace.name]?.includes(activePaneId) ? activePaneId : tracePaneMap[trace.name]?.[0];
      if (historyDispatch && choice.mode && choice.mode !== pane.renderMode) {
        const action = fromPaneId
          ? { type: 'MOVE_MEMBERSHIP' as const, payload: { trace, fromPaneId, targetPaneId: paneId, allTraces: allKnownTraces, drop: true } }
          : { type: 'ADD_MEMBERSHIP' as const, payload: { trace, targetPaneId: paneId, allTraces: allKnownTraces, drop: true } };
        historyDispatch({ type: 'change', command: { slice: 'transaction', actions: [{ slice: 'panes', limit, action: { type: 'SET_RENDER_MODE', payload: { paneId, mode: choice.mode } } }, { slice: 'panes', limit, action }] } });
        return;
      }
      if (fromPaneId) paneDispatch({ type: 'MOVE_MEMBERSHIP', payload: { trace, fromPaneId, targetPaneId: paneId, allTraces: allKnownTraces, drop: true } });
      else paneDispatch({ type: 'ADD_MEMBERSHIP', payload: { trace, targetPaneId: paneId, allTraces: allKnownTraces, drop: true } });
      if (!aggregate) {
        paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName: trace.name } });
        paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
      }
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      void importFiles(e.dataTransfer.files, paneId, false, true);
    }
  };

  React.useEffect(() => {
    if (!zoomDragActive && !(panStartZoom && panStartClientX != null)) return;

    const handleWindowMouseMove = (ev: MouseEvent) => {
      lastPointerClientXRef.current = ev.clientX;
      lastPointerClientYRef.current = ev.clientY;

      if (zoomDragActive && dragStart !== null) {
        const freq = resolveClientFreq(ev.clientX);
        if (freq != null && Number.isFinite(freq)) {
          setDragCurrent(freq);
        }
        return;
      }

      if (panStartZoom && panStartClientX != null) {
        const anchorFreq = resolveClientFreq(panStartClientX, panStartZoom);
        const currentFreq = resolveClientFreq(ev.clientX, panStartZoom);
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

    const handleWindowMouseUp = (ev: MouseEvent) => {
      if (zoomDragActive && dragStart !== null) {
        const endFreq = resolveClientFreq(ev.clientX) ?? dragCurrent ?? dragStart;
        const left = Math.min(dragStart, endFreq);
        const right = Math.max(dragStart, endFreq);
        if (right - left > 0) {
          if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: { left, right } });
          else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: { left, right } } });
          // Auto-fit Y to the new X window
          const md = latestMergedDataRef.current;
          const pt = latestPaneTracesRef.current;
          let lo = Infinity, hi = -Infinity;
          for (const row of md) {
            if (row.freq < left || row.freq > right) continue;
            for (const tr of pt) {
              const v = row[tr.name] as number | undefined;
              if (v != null && Number.isFinite(v)) {
                if (v < lo) lo = v;
                if (v > hi) hi = v;
              }
            }
          }
          if (Number.isFinite(lo) && Number.isFinite(hi)) {
            const pad = (hi - lo) * 0.08 || 1;
            paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: { min: lo - pad, max: hi + pad } } });
          }
        }
      }
      clearPointerDragState();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [
    clampZoomToDataBounds,
    clearPointerDragState,
    dragCurrent,
    dragStart,
    paneDispatch,
    paneId,
    panStartClientX,
    panStartZoom,
    resolveClientFreq,
    zoomAll,
    zoomDragActive,
  ]);

  return (
    <div
      ref={paneRootRef}
      data-testid={`chart-pane-${paneId}`}
      onMouseDownCapture={() => { if (!isActive) paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId }); }}
      onContextMenu={handlePaneContextMenu}
      style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '120px', background: 'var(--bg)', userSelect: 'none', outline: paneDragOver ? '2px solid var(--accent)' : undefined, outlineOffset: '-2px' }}
      onDragEnter={handlePaneDragOver}
      onDragOver={handlePaneDragOver}
      onDragLeave={(e) => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) { setPaneDragOver(false); drag.leave(); } }}
      onDrop={handlePaneDrop}
    >
      <PaneDragOverlay hint={drag.hint} />
      {displayState === 'picker' ? (
        <div data-testid={`chart-pane-header-${paneId}`} draggable onPointerDown={drag.pointerDown} onDragStart={drag.start} onDragEnd={drag.end} className={`ph${isActive ? ' is-target' : ''}${drag.dragging ? ' pane-header-dragging' : ''}`}>
          <span className="ph-title t-card-title" title={paneName(panes, paneId)}>{paneName(panes, paneId)}</span>
          <span className="t-caption">Empty</span>
          <span className="ph-spacer" />
          {panes.length > 1 && <button type="button" className="lp-icon-btn ph-close" aria-label={`Close ${paneName(panes, paneId)}`} onClick={event => { event.stopPropagation(); closePane(); }}>×</button>}
        </div>
      ) : (
        <PaneHeader data-testid={`chart-pane-header-${paneId}`} draggable onPointerDown={drag.pointerDown} onDragStart={drag.start} onDragEnd={drag.end} className={drag.dragging ? 'pane-header-dragging' : ''}
          name={paneName(panes, paneId)} target={isActive}
          count={shownCount > 0 ? `${shownCount} ${shownCount === 1 ? 'trace' : 'traces'}` : null}
          scale={paneTraces.length > 0 && !isSmith && !TableRenderer ? `X ${xDiv} · Y ${yDiv}` : null}
          samples={TableRenderer ? null : iconOnly => (
            <Btn variant={settings.showSampleDots ? 'armed' : 'neutral'} tone="pane" small className={`ph-samples${iconOnly ? ' is-icon' : ''}`} aria-label="Samples" aria-pressed={settings.showSampleDots} title="Show the measured sample points" data-testid="samples-toggle"
              onClick={e => { e.stopPropagation(); paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: { showSampleDots: !settings.showSampleDots } } }); }}>
              {iconOnly ? <SamplesIcon /> : 'Samples'}
            </Btn>
          )}
          chip={fit => <>
            <PaneTypeChip ref={typeButtonRef} icon={paneTypes[currentType].iconKey} label={currentType === 'eye' ? 'Eye · CH1' : paneTypes[currentType].title} open={!!typeAnchor} fit={fit} onClick={() => { setTypeChange(null); returnToTileRef.current = null; setSettingsAnchor(null); setHoveredType(null); setFocusedType(null); typeTriggerRef.current = typeAnchor ? null : typeButtonRef.current; setTypeAnchor(typeAnchor ? null : typeButtonRef.current); }} />
            {typeAnchor && <PopoverAt label="Chart type" at={typeAnchor} onClose={() => { setTypeChange(null); returnToTileRef.current = null; setHoveredType(null); setFocusedType(null); setTypeAnchor(null); typeTriggerRef.current?.focus({ preventScroll: true }); typeTriggerRef.current = null; }}>
              <div ref={typeMenuRef} onMouseOver={event => setHoveredType(tileFromTarget(event.target))} onMouseOut={event => setHoveredType(tileFromTarget(event.relatedTarget))} onFocus={event => setFocusedType(tileFromTarget(event.target))} onBlur={event => setFocusedType(tileFromTarget(event.relatedTarget))}>
                <PaneTypeMenu paneName={paneName(panes, paneId)} current={currentType} tiles={panePickerTiles(Object.values(paneTypes))} pending={pendingType ?? undefined} lockedNote={currentType === 'eye' ? 'This pane belongs to the Eye diagram card on CH1.' : undefined}
                  note={(() => { const id = hoveredType ?? focusedType; if (!id) return undefined; const members = allKnownTraces.filter(trace => traceNamesInPane.includes(trace.name)); const accepted = members.filter(trace => paneTypes[id].appliesTo(trace).allowed).map(trace => trace.dn || trace.name); return paneTypeCompatibilityNote(paneName(panes, paneId), paneTypes[id].title, members.length, accepted); })()}
                  onChoose={id => selectPaneType(paneTypes[id])}
                  onConfirm={() => { if (pendingType) selectPaneType(paneTypes[pendingType.to], true); }}
                  onCancel={cancelTypeChange} />
              </div>
            </PopoverAt>}
          </>}>
          <PaneSettingsPopover paneId={paneId} settings={settings} sections={paneTypes[currentType].settings} paneName={paneName(panes, paneId)} current={currentType} tiles={panePickerTiles(Object.values(paneTypes))} pending={pendingType} anchor={settingsAnchor} contentRef={settingsMenuRef}
            onAnchorChange={anchor => { setTypeChange(null); returnToTileRef.current = null; setTypeAnchor(null); setSettingsAnchor(anchor); if (anchor) typeTriggerRef.current = anchor; else { typeTriggerRef.current?.focus({ preventScroll: true }); typeTriggerRef.current = null; } }}
            onChoose={id => selectPaneType(paneTypes[id])} onConfirm={() => { if (pendingType) selectPaneType(paneTypes[pendingType.to], true); }} onCancel={cancelTypeChange}
            table={TableRenderer ? { settings: tableView.settings, visible: tableView.visible } : null}
            axes={!isSmith && !TableRenderer && paneTraces.length > 0 ? {
              x: xDiv, y: yDiv,
              onFitX: () => { if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: null }); else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: null } }); },
              onFitY: () => paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: null } }),
            } : null}
            onFit={isSmith && paneTraces.length > 0 ? () => setSmithFitRequest(value => value + 1) : null}
            actions={{
              onCopy: () => paneRootRef.current ? copyChartImage(paneRootRef.current) : Promise.resolve('failed' as const),
              onExport: paneTraces.length > 0 ? () => downloadText(`${paneName(panes, paneId)}.csv`, tracesToCSV(paneTraces, paneTraces[0]?.domain === 'time' ? 'Time' : 'Frequency'), 'text/csv;charset=utf-8') : null,
              onClose: panes.length > 1 ? closePane : null,
            }} />
        </PaneHeader>
      )}

      {/* overflow hidden: pane content must never paint over (and steal clicks from) the next pane's header */}
      <div onClick={() => { if (traceNamesInPane.length === 0 && !isActive) paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId }); }} style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', containerType: 'size' }}>
        {TableRenderer && displayState !== 'picker' ? (
          <TableRenderer paneId={paneId} />
        ) : SmithRenderer && traceNamesInPane.length > 0 ? (
          <SmithRenderer paneId={paneId} fitRequest={smithFitRequest} />
        ) : traceNamesInPane.length === 0 ? (
          <EmptyChartPane mode={allTraces.length > 0 ? 'traces' : 'files'} paneId={paneId} compact={panes.length > 2} types={Object.values(paneTypes)} currentType={currentType} displayState={displayState} onSelectType={selectPaneType} />
        ) : mergedData.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 'var(--font-title)' }}>No visible traces in this pane.</div>
        ) : (
          <div data-testid={`chart-plot-${paneId}`} data-line-labels={settings.showLineLabels ? 'on' : 'off'} ref={chartAreaRef} onWheel={handleWheel} onMouseDownCapture={(e) => { lastPointerClientXRef.current = e.clientX; lastPointerClientYRef.current = e.clientY; lastPointerButtonRef.current = e.button; }} onMouseMoveCapture={(e) => { lastPointerClientXRef.current = e.clientX; lastPointerClientYRef.current = e.clientY; }} onMouseDown={handleContainerMouseDown} style={{ height: '100%', cursor: draggingRefLineId !== null ? 'grabbing' : hoveredRefLineId !== null ? (refLines.find(l => l.id === hoveredRefLineId)?.type === 'h' ? 'ns-resize' : 'ew-resize') : undefined }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart ref={lineChartRef} data={plotData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }} onMouseDown={(state) => handleMouseDown(state, (state as any)?.nativeEvent?.button ?? lastPointerButtonRef.current ?? 0)} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onMouseUp={handleMouseUp}>
                {settings.gridMajor && (
                  <CartesianGrid
                    stroke="var(--grid)"
                    strokeOpacity={settings.gridMajorOpacity}
                    strokeWidth={settings.gridMajorThickness}
                    strokeDasharray={settings.gridDashStyle === 'solid' ? undefined : settings.gridDashStyle}
                    horizontal
                    vertical
                  />
                )}
                <XAxis
                  dataKey="fs"
                  type="number"
                  domain={xDomain ? [xDomain.min, xDomain.max] : ['dataMin', 'dataMax']}
                  allowDataOverflow={!!xDomain}
                  ticks={xTickValues}
                  {...(hideXTicks ? { tick: false, height: 0 } : {})}
                  stroke="var(--muted)"
                  fontSize={'var(--font-label)'}
                  tickFormatter={(value) => xTickLabelMap.get(Number(value)) ?? formatAdaptiveXAxisValue(Number(value), visibleXSpan, {
                    domain: activePaneTrace?.domain ?? 'frequency',
                    unit: activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz'),
                  })}
                  label={hideXTicks ? undefined : { value: xAxisLabelText, position: 'insideBottom', offset: -5, style: { fontSize: 'var(--font-label)', fill: 'var(--muted)', textAnchor: 'middle' } }}
                />
                <YAxis
                  domain={yDomain}
                  allowDataOverflow={Array.isArray(yDomain) && yDomain[0] !== 'auto'}
                  ticks={yTickValues}
                  stroke="var(--muted)"
                  fontSize={'var(--font-label)'}
                  width={yAxisWidth}
                  tickFormatter={formatYTick}

                  label={{ value: fittedYLabel, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 'var(--font-label)', fill: 'var(--muted)', textAnchor: 'middle' } }}
                />
                <Tooltip isAnimationActive={false} cursor={false} content={() => null} />
                {paneTraces.map((trace) => (
                  <Line key={trace.name} type="linear" dataKey={trace.name} name={trace.dn || trace.name} stroke={resolveTraceColor(trace.name)} dot={settings.showSampleDots && traceSymbol(trace.id) === null ? { r: 2, fill: resolveTraceColor(trace.name), stroke: resolveTraceColor(trace.name) } : false} activeDot={false} isAnimationActive={false} connectNulls strokeWidth={colorAssignments.get(trace.id) ? traceWidth(colorAssignments.get(trace.id) as NonNullable<ReturnType<typeof colorAssignments.get>>) : 1.5} />
                ))}
                {hoverFreq != null && Number.isFinite(hoverFreq) && <ReferenceLine x={hoverFreq} stroke="color-mix(in srgb, var(--accent) 60%, white)" strokeDasharray="4 4" strokeWidth={1} />}
                {settings.showMarkers && paneMarkers.map(({ marker, index }) => {
                  const color = resolveTraceColor(marker.trace || '');
                  const isSelected = index === selectedMkrIdx;
                  const labelPrefix = marker.type === 'delta' ? `DM${index + 1}` : `M${index + 1}`;
                  const labelText = `${labelPrefix} ${formatAdaptiveXAxisValue(marker.freq, visibleXSpan, {
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
                            {/* Bullseye glyph: colored fill → white ring → black outline.
                                Shape encodes marker type (circle/diamond/triangle) as a non-color cue. */}
                            {(() => {
                              const fillPts = markerGlyphPolygonPoints(marker.type, roundedCx, roundedCy, 5);
                              const outlinePts = markerGlyphPolygonPoints(marker.type, roundedCx, roundedCy, 6.5);
                              const Fill = fillPts
                                ? <polygon points={fillPts} fill={color} stroke="white" strokeWidth={1.5} strokeLinejoin="round" paintOrder="stroke" shapeRendering="geometricPrecision" />
                                : <circle cx={roundedCx} cy={roundedCy} r={5} fill={color} stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" paintOrder="stroke" shapeRendering="geometricPrecision" />;
                              const Outline = outlinePts
                                ? <polygon points={outlinePts} fill="none" stroke="#222" strokeWidth={1} strokeLinejoin="round" shapeRendering="geometricPrecision" />
                                : <circle cx={roundedCx} cy={roundedCy} r={6.5} fill="none" stroke="#222" strokeWidth={1} vectorEffect="non-scaling-stroke" shapeRendering="geometricPrecision" />;
                              return <>{Fill}{Outline}</>;
                            })()}
                            {/* Label pill (gated by showMarkerLabels) */}
                            {settings.showMarkerLabels && (
                              <>
                                <rect
                                  x={pillX} y={pillY}
                                  width={pillW} height={pillH}
                                  rx={4} ry={4}
                                  fill="rgba(255,255,255,0.88)"
                                  stroke="rgba(0,0,0,0.13)"
                                  strokeWidth={1}
                                />
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
                              </>
                            )}
                          </g>
                        );
                      }}
                    />
                  );
                })}
                <Customized component={<LinesLayer lines={settings.showReferenceLines ? paneRefLines : []} litId={hoveredRefLineId ?? selectedRefLineId} selectedId={selectedRefLineId}
                  onView={handlePlotView}
                  onHover={(id) => refLineDispatch({ type: 'SET_HOVERED', payload: id })}
                  onContextMenu={(line, event) => { event.preventDefault(); markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 }); refLineDispatch({ type: 'SET_SELECTED', payload: line.id }); setLineMenu({ lineId: line.id, at: { x: event.clientX, y: event.clientY }, mode: 'main' }); }}
                  onLabelClick={(line) => { markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 }); refLineDispatch({ type: 'SET_SELECTED', payload: line.id }); }} />} />
                <Customized component={<OverlaysLayer overlays={overlays} />} />
                <Customized component={<SymbolsLayer traces={paneTraces} showDots={settings.showSampleDots} />} />
                {/* ΔX between V-line delta pairs */}
                {settings.showReferenceLines && vDeltaPairs.map(([a, b]) => {
                  const lo = Math.min(a.value, b.value);
                  const hi = Math.max(a.value, b.value);
                  const delta = hi - lo;
                  const deltaText = `ΔX = ${formatAdaptiveXAxisValue(delta, delta, { domain: axisInfo.axisDomain, unit: axisInfo.axisDomain === 'time' ? 's' : 'Hz' })}`;
                  const dColor = colors?.refV ?? '#d48a2b';
                  return (
                    <ReferenceArea key={`vd-${a.id}-${b.id}`} x1={lo} x2={hi} fill={dColor} fillOpacity={0.06} strokeOpacity={0}
                      label={(props: { viewBox?: { x: number; y: number; width: number; height: number } }) => {
                        const vb = props.viewBox;
                        if (!vb || vb.width < 20) return <></> as any;
                        const cx = vb.x + vb.width / 2;
                        const ty = vb.y + 13;
                        const tw = deltaText.length * 6.3;
                        return (
                          <g>
                            <rect x={cx - tw / 2 - 4} y={ty - 11} width={tw + 8} height={14} rx={3}
                              fill="var(--card)" fillOpacity={0.88} />
                            <text x={cx} y={ty} textAnchor="middle" fill={dColor}
                              fontSize={10} fontFamily="var(--font-mono, monospace)" fontWeight={500}>
                              {deltaText}
                            </text>
                          </g>
                        );
                      }} />
                  );
                })}
                {/* ΔY between H-line delta pairs */}
                {settings.showReferenceLines && hDeltaPairs.map(([a, b]) => {
                  const lo = Math.min(a.value, b.value);
                  const hi = Math.max(a.value, b.value);
                  const delta = hi - lo;
                  const deltaText = `ΔY = ${formatScalarWithUnit(delta, axisInfo.yUnit, { digits: 3 })}`;
                  const dColor = colors?.refH ?? '#2b9ab7';
                  return (
                    <ReferenceArea key={`hd-${a.id}-${b.id}`} y1={lo} y2={hi} fill={dColor} fillOpacity={0.06} strokeOpacity={0}
                      label={(props: { viewBox?: { x: number; y: number; width: number; height: number } }) => {
                        const vb = props.viewBox;
                        if (!vb || vb.height < 14) return <></> as any;
                        const rx = vb.x + vb.width - 4;
                        const cy = vb.y + vb.height / 2;
                        const tw = deltaText.length * 6.3;
                        return (
                          <g>
                            <rect x={rx - tw - 4} y={cy - 10} width={tw + 8} height={14} rx={3}
                              fill="var(--card)" fillOpacity={0.88} />
                            <text x={rx - 2} y={cy} textAnchor="end" fill={dColor}
                              fontSize={10} fontFamily="var(--font-mono, monospace)" fontWeight={500}>
                              {deltaText}
                            </text>
                          </g>
                        );
                      }} />
                  );
                })}
                {settings.showReferenceLines && (
                  <Customized component={<CrossingsLayer points={paneRefLines.flatMap((line) => {
                    const intersections = line.type === 'v'
                      ? computeVerticalIntersections(line.value, paneTraces, paneId)
                      : computeHorizontalIntersections(line.value, paneTraces, paneId);
                    return intersections.map((ix, i) => ({ key: `rl-${line.id}-ix-${i}`, x: ix.freq, y: ix.amp, color: resolveTraceColor(ix.traceName) }));
                  })} />} />
                )}
                {dragStart !== null && dragCurrent !== null && <ReferenceLine x={dragStart} stroke="var(--accent)" strokeWidth={1} />}
                {dragStart !== null && dragCurrent !== null && <ReferenceLine x={dragCurrent} stroke="var(--accent)" strokeWidth={1} />}
                <ReferenceLine y={0} stroke="var(--dim)" strokeWidth={0.5} />
              </LineChart>
            </ResponsiveContainer>
            {settings.showReferenceLines && plotView && paneRefLines.flatMap((line) => {
              const range = line.type === 'v' ? plotView.x : plotView.y;
              if (!range || (line.value >= range[0] && line.value <= range[1])) return [];
              const side = line.type === 'v' ? (line.value > range[1] ? 'right' : 'left') : (line.value > range[1] ? 'top' : 'bottom');
              const offset = line.type === 'v' ? plotView.plot.top + plotView.plot.height / 2 : plotView.plot.left + plotView.plot.width / 2;
              const unit = line.type === 'v' ? (activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz')) : axisInfo.yUnit;
              const value = formatCrossingValue(line.value, unit, Math.abs(line.value) > 0 ? 10 ** (Math.floor(Math.log10(Math.abs(line.value))) - 5) : 0);
              const reveal = () => {
                if (line.type === 'v') {
                  // Centre the line, but keep the window inside the data so the pane never goes blank.
                  const span = Math.max(visibleXSpan, 1e-12);
                  const lo = paneDataBounds?.min ?? line.value - span / 2, hi = paneDataBounds?.max ?? line.value + span / 2;
                  const left = Math.min(Math.max(line.value - span / 2, lo), Math.max(lo, hi - span));
                  const win = { left, right: left + span };
                  if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: win });
                  else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: win } });
                } else {
                  const half = Math.max(range[1] - range[0], 1e-12) / 2;
                  paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: { min: line.value - half, max: line.value + half } } });
                }
              };
              return [<EdgeTag key={`edge-${line.id}`} side={side} offset={offset} label={line.label ?? (line.type === 'v' ? 'V' : 'H')} value={value}
                lit={(hoveredRefLineId ?? selectedRefLineId) === line.id} onReveal={reveal}
                onHover={(hovering) => refLineDispatch({ type: 'SET_HOVERED', payload: hovering ? line.id : null })} />];
            })}

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
      {lineMenu && (() => {
        const line = refLines.find(item => item.id === lineMenu.lineId);
        if (!line) return null;
        const name = line.label ?? (line.type === 'v' ? 'V' : 'H');
        const entries = allKnownTraces.map(trace => ({ trace, paneIds: tracePaneMap[trace.name] ?? [] }));
        const close = () => setLineMenu(null);
        const toggle = (target: string) => {
          if (line.paneIds.includes(target)) changeLine({ type: 'REMOVE_LINE_PANE', payload: { lineId: line.id, paneId: target, axisUnit: linePaneAxisUnit(line, target, entries) } }, `Removed ${name} from ${paneName(panes, target)}`);
          else changeLine({ type: 'ADD_LINE_PANE', payload: { lineId: line.id, paneId: target, panes, entries } }, `${name} also shown in ${paneName(panes, target)}`);
          close();
        };
        const suffix = line.paneIds.length > 1 ? ` from ${line.paneIds.length} panes` : ` from ${paneName(panes, line.paneIds[0] ?? paneId)}`;
        return (
          <PopoverAt label={`${name} menu`} at={lineMenu.at} onClose={close}>
            {lineMenu.mode === 'showin'
              ? <KitMenu label="Show in" title="Show in" checklist style={{ width: 220 }} entries={lineShowInEntries(lineShowInChoices(line, panes, entries), toggle)} />
              : <KitMenu label={`${name} line`} entries={lineContextEntries({
                  label: name, kind: line.type, paneName: paneName(panes, paneId),
                  onShowIn: () => setLineMenu({ ...lineMenu, mode: 'showin' }),
                  onEdit: () => { close(); const input = document.querySelector<HTMLInputElement>(`[data-testid="ref-line-row-${name}"] input`); input?.focus(); input?.select(); },
                  onListCrossings: () => { close(); listCrossings?.(line.id); },
                  onRemoveHere: () => { changeLine({ type: 'REMOVE_LINE_PANE', payload: { lineId: line.id, paneId, axisUnit: linePaneAxisUnit(line, paneId, entries) } }, `Removed ${name} from ${paneName(panes, paneId)}`); close(); },
                  onDelete: () => { changeLine({ type: 'REMOVE_LINE', payload: line.id }, `Deleted ${name}${suffix}`, 'delete'); close(); },
                })} />}
          </PopoverAt>
        );
      })()}
    </div>
  );
}
