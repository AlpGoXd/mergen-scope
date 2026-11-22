import React, { useMemo, useState, useRef, useEffect, useContext } from 'react';
import type { LineChart } from 'recharts';
import { planLastPaneLines, planWorkspacePaneRemoval, useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { usePaneState, usePaneDispatch, usePaneLimit } from '../../stores/pane-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useTraceState } from '../../stores/trace-store';
import { useChartHover } from '../../hooks/use-chart-hover';
import { useLegendDodge } from '../../hooks/use-legend-dodge';
import { dragReducer, idleDragState } from '../../domain/chart/drag-state';
import {
  computeMarkerHitTolerance as markerHitToleranceForPlot,
  computeNearestPixelDist as nearestPixelDistForPlot,
  findMarkerHit,
  pickPlacementTraceIndex,
} from '../../domain/chart/marker-placement';
import { centerXDomain, centerYDomain, dragZoomXDomain, paddedYDomain, panXDomain, pixelToAxisValue, refLineYTolerance, wheelAxisDomain } from '../../domain/chart/plot-coords';
import { chartAxisData, isPhase, logXReason, logYReason, positiveDomain, suggestLog } from '../../domain/chart/axis-scale';
import { mergePaneData } from '../../domain/pane-data';
import { useTheme } from '../../hooks/use-theme';
import { usePaneData } from '../../hooks/use-pane-data';
import { useTableView } from '../../hooks/use-table-view';
import { useAnalysisOverlays } from '../../hooks/use-analysis-overlays';
import { useTraceColors } from '../../hooks/use-trace-colors';
import { useFileImport } from '../../hooks/use-file-import';
import { deriveAxisInfo } from '../../domain/units';
import { defaultTraceForPane } from '../../domain/default-trace';
import { canRenderInPane, planPaneTypeChange } from '../../domain/pane-placement';
import { paneDisplayState } from '../../domain/pane-display-state';
import { createPaneTypeRegistry, paneTypeOfMode } from '../../domain/pane-type-registry';
import type { PaneTypeDefinition } from '../../types/registry-contract';
import type { TypeChangePlan } from '../panes/PaneTypeMenu';
import type { PickerTileId } from '../panes/PaneTypePicker';
import { paneTypeCompatibilityNote, summarizePaneTypeChange } from '../../domain/pane-type-change-summary';
import { formatEngineeringValue, formatPerDivision, makeYAxisTickFormatter } from '../../domain/format';
import { placeMarker } from '../../domain/markers';
import { nextLineLabel } from '../../domain/ref-lines';
import { makeNiceTicks, NICE_TICK_COUNT } from '../../domain/trace-math';
import { sampleDotsVisible, visibleSampleCount } from '../../domain/dots-and-symbols';
import { allocateTraceColors } from '../../domain/trace-palette';
import { Btn } from '../shared/Btn';
import { ChartHoverLegend } from './ChartHoverLegend';
import { ChartReferenceEdgeTags } from './ChartReferenceEdgeTags';
import { ChartPanePlot } from './ChartPanePlot';
import type { ChartMouseEvent } from './ChartPanePlot';
import { useChartPaneAxes } from './use-chart-pane-axes';
import { useTraceSymbols } from '../../hooks/use-trace-symbols';
import type { ToastKind } from '../../stores/toast-store';
import { useOptionalToast } from '../../stores/toast-store';
import { useAsk } from '../../stores/dialog-store';
import { closePaneText } from '../../domain/confirm-text';
import type { PlotView } from './LinesLayer';
import { lineContextEntries, lineShowInEntries } from '../lines/Lines';
import { Menu as KitMenu } from '../left-panel/Menu';
import { PopoverAt } from '../shared/Controls';
import { LineCrossingsContext } from '../analysis/line-crossings-context';
import { lineShowInChoices, linePaneAxisUnit, paneName } from '../../domain/line-view';
import { EmptyChartPane, panePickerTiles } from './EmptyChartPane';
import { rendererFor } from './pane-renderers';
import { AxisScaleChoices, PaneSettingsPopover } from './PaneSettingsPopover';
import type { PaneAxes } from './PaneSettingsPopover';
import { PaneHeader, SamplesIcon } from './PaneHeader';
import { PaneChartTypeControl } from './PaneChartTypeControl';
import { XLinkChip } from './XLinkChip';
import { fittedXBounds, linkedPeers } from '../../domain/x-link';
import { usePaneImageExport } from './export/export-context';
import { exportTraceName } from '../../domain/export-plot';
import type { ExportView } from './export/export-context';
import { DEFAULT_CHART_AXES, defaultPaneSettings } from '../../types/pane';
import { usePaneDrag } from './use-pane-drag';
import { PaneDragOverlay } from './PaneDragOverlay';
import { planTraceDrop } from '../../domain/pane-drop-hints';

export interface ChartPaneProps {
  paneId: string;
  hideXTicks?: boolean;
  /** Image export: render only the plot at a fixed size, with no chrome, interaction or shared side effects. */
  exportView?: ExportView;
}

const CHART_MARGIN_RIGHT = 20;
const CHART_MARGIN_TOP = 10;
const CHART_X_AXIS_HEIGHT = 35; // approximate height for x-axis ticks + label

export function ChartPane({ paneId, hideXTicks: hideXTicksProp = false, exportView }: ChartPaneProps) {
  const isExport = exportView !== undefined;
  const hideXTicks = hideXTicksProp && !isExport;
  const xAxisHeight = hideXTicks ? 0 : CHART_X_AXIS_HEIGHT;
  const imageExport = usePaneImageExport();
  const overlays = useAnalysisOverlays(paneId);
  const aggregate = useOptionalAggregateWorkspace();
  const ask = useAsk();
  const toast = useOptionalToast();
  const historyDispatch = aggregate?.historyDispatch;
  const revision = aggregate?.state.revision;
  const { panes, activePaneId, tracePaneMap, paneActiveTraceMap, paneXZooms, paneYZooms } = usePaneState();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const { refLines, refMode, selectedRefLineId, hoveredRefLineId } = useRefLineState();
  const refLineDispatch = useRefLineDispatch();
  const { selectedTraceName, markerTrace, traceHueSlots, paneAssignmentWarning } = useUiState();
  const resolveColor = useTraceColors(exportView?.colorTheme, exportView?.paperTone);
  const traceSymbol = useTraceSymbols(isExport ? 'always' : undefined);
  const uiDispatch = useUiDispatch();
  const paneDispatch = usePaneDispatch();
  const { limit } = usePaneLimit();
  const importFiles = useFileImport();
  const { allTraces, allKnownTraces, allDisplayTraces, vis } = useTraceState();
  const tableView = useTableView(paneId);
  const colorAssignments = useMemo(() => allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))), [allKnownTraces, traceHueSlots]);
  const { colors } = useTheme();

  const pane = panes.find((item) => item.id === paneId) || panes[0];
  if (!pane) return null;
  const drag = usePaneDrag({ pane, panes, traces: allKnownTraces, memberships: tracePaneMap, displays: allDisplayTraces }, source => historyDispatch?.({ type: 'change', command: { slice: 'layout', action: { type: 'SWAP_PANES', sourcePaneId: source, targetPaneId: paneId } } }));
  useEffect(() => {
    if (isExport || paneAssignmentWarning?.source !== 'drop' || paneAssignmentWarning.paneId !== paneId) return;
    drag.showRefusal(paneAssignmentWarning.message);
    uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } });
  }, [paneAssignmentWarning, paneId, uiDispatch]);
  const isActive = activePaneId === paneId;
  const isSmith = pane.renderMode === 'smith' || pane.renderMode === 'smith-inverted';
  const isPolar = pane.renderMode === 'polar';
  const isRadial = isSmith || isPolar;
  const appearance = exportView?.appearance;
  const settings = {
    ...defaultPaneSettings(), ...pane.settings,
    ...(appearance ? { gridMajor: appearance.grid, showMarkerLabels: appearance.include.markerTags, showReferenceLines: appearance.include.refLines } : {}),
  };

  const [smithFitRequest, setSmithFitRequest] = useState(0);
  // Space fits the target pane: a Smith pane fits its own view.
  useEffect(() => {
    const fit = (event: Event) => { if (event instanceof CustomEvent && (event.detail as { paneId?: string } | null)?.paneId === paneId) setSmithFitRequest(value => value + 1); };
    window.addEventListener('mergen-fit-pane', fit);
    return () => window.removeEventListener('mergen-fit-pane', fit);
  }, [paneId]);
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
  const RadialRenderer = isRadial ? rendererFor(currentType) : null;
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
    const leaving = entries.filter(entry => entry.paneIds.includes(paneId) && !plan.plan.memberships[entry.trace.name]?.includes(paneId))
      .map(entry => ({ name: entry.trace.name, displayName: entry.trace.dn || entry.trace.name }));
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

  // Panes in one X link group hold the same zoom; the store applies a zoom to the whole group.
  const currentXZoom = paneXZooms[paneId] || null;
  const xRange = currentXZoom ? { left: currentXZoom.left, right: currentXZoom.right } : null;
  const { paneTraces, mergedData, plotData } = usePaneData(traceNamesInPane, xRange);
  const configuredAxes = settings.axes ?? DEFAULT_CHART_AXES;
  const paneMembers = useMemo(() => allTraces.filter(trace => traceNamesInPane.includes(trace.name)), [allTraces, traceNamesInPane]);
  const xReason = useMemo(() => logXReason(paneTraces), [paneTraces]);
  const yReason = useMemo(() => logYReason(paneMembers), [paneMembers]);
  const xScale = xReason ? 'linear' : configuredAxes.x;
  const yScale = yReason ? 'linear' : configuredAxes.y;
  const { displayTraces, byTrace, omitted, logYFit } = useMemo(
    () => chartAxisData(paneTraces, { x: xScale, y: yScale, phase: configuredAxes.phase },
      currentXZoom ? { left: currentXZoom.left, right: currentXZoom.right } : null),
    [paneTraces, xScale, yScale, configuredAxes.phase, currentXZoom],
  );
  const displayPlotData = useMemo(() => displayTraces === paneTraces ? plotData : mergePaneData(displayTraces, xRange, true),
    [displayTraces, paneTraces, plotData, currentXZoom]);
  const shownCount = TableRenderer ? tableView.traces.length : paneTraces.length;
  const currentYZoom = paneYZooms[paneId] ?? null;
  // A fitted linked pane shows the data range of its whole group, so every pane of the group shows the same X range.
  const linkedFit = useMemo(() => {
    const peers = linkedPeers(panes, paneId);
    return peers.length ? fittedXBounds([paneId, ...peers], allTraces, tracePaneMap, vis) : null;
  }, [panes, paneId, allTraces, tracePaneMap, vis]);

  const xDiv = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const t of paneTraces) {
      const first = t.data[0]?.freq, last = t.data[t.data.length - 1]?.freq;
      if (Number.isFinite(first)) lo = Math.min(lo, first as number);
      if (Number.isFinite(last)) hi = Math.max(hi, last as number);
    }
    const defaultXDomain = linkedFit ?? (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? { min: lo, max: hi } : null);
    const dom = currentXZoom ? { min: currentXZoom.left, max: currentXZoom.right } : defaultXDomain;
    const ticks = makeNiceTicks(dom, NICE_TICK_COUNT);
    if (!ticks || ticks.length < 2) return '—';
    const first = ticks[0], second = ticks[1];
    if (first === undefined || second === undefined) return '—';
    return formatPerDivision(second - first);
  }, [paneTraces, currentXZoom, linkedFit]);

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
  const yDomain: [number, number] | ['auto', 'auto'] = yScale === 'log'
    ? [yZoom && yZoom.min > 0 ? yZoom.min : logYFit.min, yZoom && yZoom.min > 0 ? yZoom.max : logYFit.max]
    : yZoom ? [yZoom.min, yZoom.max] : ['auto', 'auto'];
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
    const min = currentXZoom?.left ?? linkedFit?.min ?? mergedData[0]?.fs ?? null;
    const max = currentXZoom?.right ?? linkedFit?.max ?? mergedData[mergedData.length - 1]?.fs ?? null;
    if (xScale === 'log') {
      const first = Math.min(...paneTraces.map(trace => trace.data[0]?.freq ?? Infinity));
      return positiveDomain(min && min > 0 ? min : first, max ?? first) ?? { min: 1, max: 10 };
    }
    if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return null;
    }
    return { min, max };
  }, [currentXZoom, linkedFit, mergedData, paneTraces, xScale]);
  const [axisMenu, setAxisMenu] = useState<{ axis: 'x' | 'y'; at: { x: number; y: number } } | null>(null);

  // Right-click menu on a line (kit lineContextEntries; "Show in" opens the checklist as a second menu).
  const [lineMenu, setLineMenu] = useState<{ lineId: number; at: { x: number; y: number }; mode: 'main' | 'showin' } | null>(null);
  const { listCrossings } = useContext(LineCrossingsContext);
  const changeLine = (action: Parameters<typeof refLineDispatch>[0], message: string, toastKind?: ToastKind) => {
    if (historyDispatch) historyDispatch({ type: 'change', ...(toastKind ? { toastMessage: message, toastKind } : {}), command: { slice: 'lines', action } });
    else refLineDispatch(action);
  };
  const [pointerDrag, dispatchPointerDrag] = React.useReducer(dragReducer, idleDragState);
  const zoomDrag = 'zoom' in pointerDrag ? pointerDrag.zoom : undefined;
  const panDrag = 'pan' in pointerDrag ? pointerDrag.pan : undefined;
  const zoomDragActive = zoomDrag !== undefined;
  const dragStart = zoomDrag?.start ?? null;
  const dragCurrent = zoomDrag?.current ?? null;
  const panStartZoom = panDrag?.startZoom ?? null;
  const panStartClientX = panDrag?.startClientX ?? null;
  const draggingMarkerIdx = 'marker' in pointerDrag ? pointerDrag.marker ?? null : null;
  const draggingRefLineId = 'line' in pointerDrag ? pointerDrag.line ?? null : null;
  const chartAreaRef = React.useRef<HTMLDivElement | null>(null);
  const [plotHeight, setPlotHeight] = useState(0);
  const [paneDragOver, setPaneDragOver] = useState(false);
  const hasChart = !isRadial && traceNamesInPane.length > 0 && mergedData.length > 0;
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
  /** The press in flight is a Ctrl+left press: it pans, so the chart's own press handler must ignore it. */
  const lastCtrlPanRef = React.useRef(false);
  const yAxisMapRef = React.useRef<Record<string, unknown> | null>(null);
  const lineChartRef = React.useRef<React.ComponentRef<typeof LineChart>>(null);
  const latestMergedDataRef = React.useRef(mergedData);
  latestMergedDataRef.current = mergedData;
  const latestPaneTracesRef = React.useRef(paneTraces);
  latestPaneTracesRef.current = paneTraces;

  const finishPointerDrag = React.useCallback((type: 'release' | 'cancel') => {
    dispatchPointerDrag({ type });
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
      const { left, width } = geometry.plot;
      return pixelToAxisValue(clientX - geometry.svgLeft, left, width, domainLeft, domainRight, false, xScale);
    }
    const rect = chartEl.getBoundingClientRect();
    const plotWidth = rect.width - yAxisWidth - CHART_MARGIN_RIGHT;
    return pixelToAxisValue(clientX - rect.left, yAxisWidth, plotWidth, domainLeft, domainRight, false, xScale);
  };

  const computeMarkerHitTolerance = React.useCallback((): number => {
    const chartEl = chartAreaRef.current;
    const plotWidth = chartEl
      ? chartEl.getBoundingClientRect().width - yAxisWidth - CHART_MARGIN_RIGHT
      : 0;
    return markerHitToleranceForPlot(plotWidth, visibleXSpan, paneDataBounds);
  }, [paneDataBounds, visibleXSpan, yAxisWidth]);

  const resolveBaseYDomain = React.useCallback((): { min: number; max: number } | null => {
    if (Array.isArray(yDomain) && yDomain[0] !== 'auto') {
      return { min: yDomain[0], max: yDomain[1] };
    }
    const amps = mergedData.flatMap((row) =>
      paneTraces.map((tr) => row[tr.name] as number | undefined).filter((v): v is number => v != null && Number.isFinite(v))
    );
    if (!amps.length) return null;
    return paddedYDomain(Math.min(...amps), Math.max(...amps), 0.05);
  }, [mergedData, paneTraces, yDomain]);

  // The line layer reports the plot rectangle and the real scale domains: they feed the edge tags here and the rows' "off view" text.
  const [plotView, setPlotView] = useState<PlotView | null>(null);
  const drawnYDomain = plotView?.y ? { min: plotView.y[0], max: plotView.y[1] } : null;
  const handlePlotView = React.useCallback((view: PlotView) => {
    setPlotView(prev => prev && prev.x?.[0] === view.x?.[0] && prev.x?.[1] === view.x?.[1] && prev.y?.[0] === view.y?.[0] && prev.y?.[1] === view.y?.[1]
      && prev.plot.left === view.plot.left && prev.plot.top === view.plot.top && prev.plot.width === view.plot.width && prev.plot.height === view.plot.height ? prev : view);
    if (!isExport) refLineDispatch({ type: 'SET_PANE_VIEW', payload: { paneId, view: { x: view.x, y: view.y } } });
  }, [refLineDispatch, paneId, isExport]);
  useEffect(() => isExport ? undefined : () => refLineDispatch({ type: 'SET_PANE_VIEW', payload: { paneId, view: null } }), [refLineDispatch, paneId, isExport]);

  const computeRefLineYTolerance = (): number => {
    const chartEl = chartAreaRef.current;
    if (!chartEl) return 0;
    const geometry = plotGeometry();
    const domain = (geometry && drawnYDomain) ?? resolveBaseYDomain();
    const height = geometry?.plot.height ?? chartEl.getBoundingClientRect().height - CHART_MARGIN_TOP - xAxisHeight;
    return domain ? refLineYTolerance(domain, height) : 0;
  };

  const resolveClientAmp = (clientY: number, overshootFraction = 0): number | null => {
    const chartEl = chartAreaRef.current;
    if (!chartEl) return null;
    const geometry = plotGeometry();
    const baseDomain = (geometry && drawnYDomain) ?? resolveBaseYDomain();
    if (!baseDomain) return null;
    const range = overshootFraction > 0 && yScale === 'linear' ? paddedYDomain(baseDomain.min, baseDomain.max, overshootFraction, 0) : baseDomain;
    if (!range) return null;
    const { min: yMin, max: yMax } = range;
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) return null;
    if (geometry) {
      const { top, height } = geometry.plot;
      return pixelToAxisValue(clientY - geometry.svgTop, top, height, yMin, yMax, true, yScale);
    }
    const rect = chartEl.getBoundingClientRect();
    const plotHeight = rect.height - CHART_MARGIN_TOP - xAxisHeight;
    return pixelToAxisValue(clientY - rect.top, CHART_MARGIN_TOP, plotHeight, yMin, yMax, true, yScale);
  };

  const resolveEventAmp = (e: ChartMouseEvent | undefined): number | null => {
    if (!e) return null;
    if (e.yAxisMap) yAxisMapRef.current = e.yAxisMap;
    const instanceYMap = lineChartRef.current?.state?.yAxisMap;
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
      const yEntry = Object.values(yMap)[0] as { readonly scale?: { readonly invert?: unknown } } | undefined;
      const scale = yEntry?.scale;
      if (typeof scale?.invert === 'function') {
        const svgEl = chartAreaRef.current.querySelector('svg');
        const svgRect = svgEl?.getBoundingClientRect();
        if (svgRect) {
          const val: unknown = scale.invert(clientY - svgRect.top);
          if (typeof val === 'number' && Number.isFinite(val)) return val;
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
    if ((preferPointer || xScale === 'log') && pointerFreq != null) return pointerFreq;

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
        return pixelToAxisValue(e.chartX, e.offset.left, e.offset.width, domainLeft, domainRight, false, xScale);
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
    // Ctrl+drag pans (handleContainerMouseDown starts it): never place, select or drag anything under it.
    if (lastCtrlPanRef.current) return;

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
    const markerHit = findMarkerHit(paneMarkers, freq, tol);
    if (markerHit) {
      refLineDispatch({ type: 'SET_SELECTED', payload: null });
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: markerHit.index });
      historyDispatch?.({type:'begin-gesture'});
      dispatchPointerDrag({ type: 'start-marker', index: markerHit.index });
      return;
    }

    const lineHit = refLines
      .filter((line) => line.type === 'v' && line.paneIds.includes(paneId))
      .find((line) => Math.abs(line.value - freq) < tol);
    if (lineHit) {
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
      refLineDispatch({ type: 'SET_SELECTED', payload: lineHit.id });
      historyDispatch?.({type:'begin-gesture'});
      dispatchPointerDrag({ type: 'start-line', id: lineHit.id });
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
      dispatchPointerDrag({ type: 'start-line', id: hLineHit.id });
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
    updateHover(freq, () => resolveEventAmp(e));

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
    clearHover();
    lastPointerClientXRef.current = null;
    lastPointerClientYRef.current = null;
    legendDodge.onPointerLeave();
  };

  const handleMouseUp = () => {
    if (zoomDragActive || panStartZoom) return;
    if (draggingMarkerIdx !== null || draggingRefLineId !== null) historyDispatch?.({type:'commit-gesture'});
    finishPointerDrag('release');
  };

  React.useEffect(() => {
    if (draggingMarkerIdx === null && draggingRefLineId === null) return;
    const finish = () => { historyDispatch?.({type:'commit-gesture'}); finishPointerDrag('release'); };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      historyDispatch?.({type:'cancel-gesture'}); finishPointerDrag('cancel'); event.preventDefault(); event.stopPropagation();
    };
    window.addEventListener('mouseup',finish);
    window.addEventListener('keydown',cancel,true);
    return () => { window.removeEventListener('mouseup',finish); window.removeEventListener('keydown',cancel,true); };
  },[draggingMarkerIdx,draggingRefLineId,historyDispatch,finishPointerDrag]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const direction: -1 | 1 = e.deltaY > 0 ? 1 : -1; // +1 = out, -1 = in
    if (e.ctrlKey) {
      if (!xDomain) return;
      const zoom = wheelAxisDomain(xDomain, direction, resolveClientFreq(e.clientX), false, xScale);
      if (zoom) paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: { left: zoom.min, right: zoom.max } } });
      return;
    }
    const baseDomain = (yScale === 'linear' ? yZoom : null) ?? ((plotGeometry() && drawnYDomain) || resolveBaseYDomain());
    if (!baseDomain || !(baseDomain.max > baseDomain.min)) return;
    const zoom = wheelAxisDomain(baseDomain, direction, resolveClientAmp(e.clientY), e.shiftKey, yScale);
    if (zoom) paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom } });
  };

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activePaneId !== paneId) {
      paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
    }
    lastPointerButtonRef.current = e.button;
    if ((e.button === 0 && e.ctrlKey) || e.button === 1) {
      // Ctrl+drag pans the zoomed X range, like right-drag does when zoomed.
      const zoom = xDomain ? { left: xDomain.min, right: xDomain.max } : null;
      if (!zoom) return;
      e.preventDefault();
      dispatchPointerDrag({ type: 'start-pan', startZoom: { left: zoom.left, right: zoom.right }, startClientX: e.clientX });
      return;
    }
    if (e.button === 2) {
      if (armed || refMode) return;
      e.preventDefault();
      const zoom = paneXZooms[paneId] || null;
      if (zoom && xScale === 'linear') {
        dispatchPointerDrag({ type: 'start-pan', startZoom: { left: zoom.left, right: zoom.right }, startClientX: e.clientX });
        return;
      }
      const startFreq = resolveClientFreq(e.clientX);
      if (startFreq == null || !Number.isFinite(startFreq)) return;
      dispatchPointerDrag({ type: 'start-zoom', start: startFreq });
      return;
    }
  };

  // Double-click fits both axes, like the Fit button. Not while a tool is armed (its clicks place things) or over a line.
  const handleDoubleClick = () => {
    if (armed || refMode || hoveredRefLineId !== null || draggingRefLineId !== null) return;
    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: null } });
    paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: null } });
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

  // Fixed-size exports need their axis labels before the resize observer runs.
  const labelRoom = exportView ? Math.max(0, exportView.height - CHART_MARGIN_TOP - xAxisHeight - 10) : plotHeight;
  const { xAxis, yAxis } = useChartPaneAxes({
    paneId, paneTraces, activePaneTrace, axisInfo, xDomain, yDomain, visibleXSpan, plotView,
    labelRoom, yAxisWidth, formatYTick, hideXTicks, exportView, xScale, yScale,
  });

  // Close pane (Pane settings and the empty-pane header): traces and lines move by the closing-pane rule.
  const closePane = async () => {
    if (!aggregate) return;
    const state = aggregate.state;
    const result = planWorkspacePaneRemoval(state, paneId);
    if (!result.ok) { toast?.show({ message: result.reason, kind: 'error' }); return; }
    const { moved, unplaced } = result.plan;
    const lines = planLastPaneLines(state, paneId, result.plan.memberships);
    if (unplaced.length || lines.length) {
      const label = (name: string) => { const trace = allKnownTraces.find(item => item.name === name); return trace ? exportTraceName(trace) : name; };
      const details = [...moved.map(move => `${label(move.traceName)} → ${paneName(panes, move.to)}`), ...unplaced.map(name => `${label(name)} → not in a pane`), ...lines.map(move => `${move.line.label || `Line ${move.line.id}`} → ${move.to ? paneName(panes, move.to) : 'not in a pane'}`)];
      const hiddenMarkers = state.markers.markers.filter(marker => unplaced.includes(marker.trace)).length;
      if (await ask(closePaneText(paneName(panes, paneId), details, unplaced.length, hiddenMarkers)) !== 'confirm') return;
    }
    const latest = aggregate.state;
    const destinations = [...new Set(moved.map(move => paneName(panes, move.to)))];
    aggregate.historyDispatch({ type: 'change', command: { slice: 'remove-pane', targetPaneId: paneId, expectedRevision: latest.revision, confirmed: unplaced.length > 0 || lines.length > 0, limit }, ...(moved.length ? { toastMessage: `${moved.length} trace${moved.length === 1 ? '' : 's'} moved to ${destinations.join(', ')}`, toastKind: 'moved' as const } : {}) });
  };

  const resolveTraceColor = useMemo(() => {
    return (traceName: string): string => {
      const trace = allTraces.find((item) => item.name === traceName);
      return trace ? resolveColor(trace) : 'var(--accent)';
    };
  }, [allTraces, resolveColor]);

  const { hoverFreq, hoverRows, crosshairX, ghostCrosshairX, updateHover, clearHover } = useChartHover({
    paneId, paneTraces, activeTrace: activePaneTrace, visibleXSpan, resolveTraceColor, isExport, isSmith: isRadial,
  });

  // The hover legend steps aside for the cursor and the hover dots (see domain/chart/legend-placement.ts).
  const paneTraceNames = useMemo(() => paneTraces.map(trace => trace.name), [paneTraces]);
  const legendDodge = useLegendDodge({ containerRef: chartAreaRef, rows: plotData, xKey: 'fs', yKeys: paneTraceNames, plotView });

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
        const tickPairs: { val: number; clientY: number }[] = [];
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
          tickPairs.push({ val, clientY: clientYOfTick });
        }

        const rect = el.getBoundingClientRect();
        const traceAmps = paneTraces.map(trace => placeMarker(trace, targetFreq).amp);
        const traceIndex = pickPlacementTraceIndex(tickPairs, traceAmps, clientY, {
          top: rect.top, height: rect.height, traces: paneTraces, xZoom: currentXZoom,
        });
        if (traceIndex !== null) return paneTraces[traceIndex] ?? null;
      }
    }

    // Fallback: sidebar-selected trace, or pane active trace, or first trace
    const preferredTraceName = paneActiveTraceMap[paneId] || selectedTraceName || paneTraces[0]?.name;
    return paneTraces.find((trace) => trace.name === preferredTraceName) ?? paneTraces[0] ?? null;
  }, [markerTrace, selectedTraceName, paneActiveTraceMap, paneId, paneTraces, currentXZoom, allTraces, tracePaneMap, vis]);

  const computeNearestPixelDist = React.useCallback((trace: typeof paneTraces[0], targetFreq: number): number => {
    const el = chartAreaRef.current;
    if (!el) return Infinity;
    const domainLeft = xDomain?.min ?? 0;
    const domainRight = xDomain?.max ?? 1;
    const plotWidth = el.getBoundingClientRect().width - yAxisWidth - CHART_MARGIN_RIGHT;
    return nearestPixelDistForPlot(trace.data, targetFreq, domainLeft, domainRight, plotWidth, xScale);
  }, [xDomain, xScale, yAxisWidth]);

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
      const plan = planTraceDrop({ pane, panes, traces: allKnownTraces, memberships: tracePaneMap, displays: allDisplayTraces }, trace.name, activePaneId, e.altKey);
      if (plan.kind === 'refused') {
        drag.showRefusal(plan.reason);
        return;
      }
      if (plan.kind !== 'move' && plan.kind !== 'add') return;
      const payload = { trace: plan.trace, targetPaneId: paneId, allTraces: allKnownTraces, drop: true };
      const action = plan.fromPaneId
        ? { type: 'MOVE_MEMBERSHIP' as const, payload: { ...payload, fromPaneId: plan.fromPaneId } }
        : { type: 'ADD_MEMBERSHIP' as const, payload };
      if (historyDispatch && plan.mode !== pane.renderMode) {
        historyDispatch({ type: 'change', command: { slice: 'transaction', actions: [{ slice: 'panes', limit, action: { type: 'SET_RENDER_MODE', payload: { paneId, mode: plan.mode } } }, { slice: 'panes', limit, action }] } });
        return;
      }
      paneDispatch(action);
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
          dispatchPointerDrag({ type: 'move', current: freq });
        }
        return;
      }

      if (panStartZoom && panStartClientX != null) {
        const anchorFreq = resolveClientFreq(panStartClientX, panStartZoom);
        const currentFreq = resolveClientFreq(ev.clientX, panStartZoom);
        if (anchorFreq == null || currentFreq == null) return;
        // A linked pane pans within the data of its whole group.
        const next = panXDomain(panStartZoom, anchorFreq, currentFreq, linkedFit ?? paneDataBounds, xScale);
        paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: next } });
      }
    };

    const handleWindowMouseUp = (ev: MouseEvent) => {
      if (zoomDragActive && dragStart !== null) {
        const endFreq = resolveClientFreq(ev.clientX) ?? dragCurrent ?? dragStart;
        const zoom = dragZoomXDomain(dragStart, endFreq);
        if (zoom) {
          const { left, right } = zoom;
          paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom } });
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
          const yZoom = yScale === 'linear' && configuredAxes.phase === 'wrapped' ? paddedYDomain(lo, hi, 0.08) : null;
          if (yZoom || yScale === 'log' || configuredAxes.phase === 'unwrapped') {
            paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: yZoom } });
          }
        }
      }
      finishPointerDrag('release');
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [
    finishPointerDrag,
    dragCurrent,
    dragStart,
    linkedFit,
    paneDataBounds,
    paneDispatch,
    paneId,
    panStartClientX,
    panStartZoom,
    resolveClientFreq,
    zoomDragActive,
    xScale, yScale, configuredAxes.phase,
  ]);

  const axes: PaneAxes | null = !isRadial && !TableRenderer && paneTraces.length > 0 ? {
    x: xScale === 'log' ? 'Log' : xDiv, y: yScale === 'log' ? 'Log' : yDiv,
    values: configuredAxes, xReason, yReason, hasPhase: paneTraces.some(isPhase),
    suggestLog: suggestLog(paneDataBounds) && !xReason && xScale !== 'log',
    xRange: xDomain ? [xDomain.min, xDomain.max].map(value => formatEngineeringValue(value, activePaneTrace?.units.x ?? '', 3).trim()).join(' → ') : '—',
    onFitX: () => paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: null } }),
    onFitY: () => paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: null } }),
    onChange: values => {
      paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: { axes: values } } });
      if (values.phase !== configuredAxes.phase) paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: null } });
    },
  } : null;
  const chartPlot = hasChart ? (
    <ChartPanePlot
      paneId={paneId} plotData={displayPlotData} plotView={plotView} lineChartRef={lineChartRef}
      axisSettings={{ ...configuredAxes, x: xScale, y: yScale }} displayTraces={displayTraces} logRows={byTrace}
      mouseEvents={{
        onMouseDown: state => handleMouseDown(
          state, (state?.nativeEvent as { button?: number } | undefined)?.button ?? lastPointerButtonRef.current ?? 0,
        ),
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
        onMouseUp: handleMouseUp,
      }}
      settings={settings} exportView={exportView} axisInfo={axisInfo} xAxis={xAxis} yAxis={yAxis}
      paneTraces={paneTraces} activePaneTrace={activePaneTrace} visibleXSpan={visibleXSpan}
      resolveTraceColor={resolveTraceColor} traceSymbol={traceSymbol} colorAssignments={colorAssignments}
      crosshairX={crosshairX} ghostCrosshairX={ghostCrosshairX} paneMarkers={paneMarkers} selectedMkrIdx={selectedMkrIdx}
      linesLayer={{
        lines: settings.showReferenceLines ? paneRefLines : [],
        litId: isExport ? null : hoveredRefLineId ?? selectedRefLineId,
        selectedId: isExport ? null : selectedRefLineId,
        onView: handlePlotView,
        onHover: id => refLineDispatch({ type: 'SET_HOVERED', payload: id }),
        onContextMenu: (line, event) => {
          event.preventDefault();
          markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
          refLineDispatch({ type: 'SET_SELECTED', payload: line.id });
          setLineMenu({ lineId: line.id, at: { x: event.clientX, y: event.clientY }, mode: 'main' });
        },
        onLabelClick: line => {
          markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
          refLineDispatch({ type: 'SET_SELECTED', payload: line.id });
        },
      }}
      overlays={overlays} paneRefLines={paneRefLines} vDeltaPairs={vDeltaPairs} hDeltaPairs={hDeltaPairs}
      colors={colors} dragStart={dragStart} dragCurrent={dragCurrent}
    />
  ) : null;

  const choosePaneType = (id: PickerTileId) => selectPaneType(paneTypes[id]);
  const confirmPaneType = () => { if (pendingType) selectPaneType(paneTypes[pendingType.to], true); };
  const typeNote = () => {
    const id = hoveredType ?? focusedType;
    if (!id) return undefined;
    const members = allKnownTraces.filter(trace => traceNamesInPane.includes(trace.name));
    const accepted = members.filter(trace => paneTypes[id].appliesTo(trace).allowed).map(trace => trace.dn || trace.name);
    return paneTypeCompatibilityNote(paneName(panes, paneId), paneTypes[id].title, members.length, accepted);
  };

  if (exportView) {
    return (
      <div data-testid={`export-pane-${paneId}`} style={{ position: 'relative', width: exportView.width, height: exportView.height, background: 'var(--bg)' }}>
        {chartPlot && <div data-testid={`export-plot-${paneId}`} data-export-chart="" data-line-labels={settings.showLineLabels ? 'on' : 'off'} ref={chartAreaRef} style={{ width: '100%', height: '100%' }}>{chartPlot}</div>}
      </div>
    );
  }

  return (
    <div
      ref={paneRootRef}
      data-testid={`chart-pane-${paneId}`}
      data-pane-target={isActive ? '' : undefined}
      onMouseDownCapture={() => { if (!isActive) paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId }); }}
      onContextMenu={handlePaneContextMenu}
      style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '120px', background: 'var(--plot)', userSelect: 'none', outline: paneDragOver ? '2px solid var(--accent)' : undefined, outlineOffset: '-2px' }}
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
          scale={axes ? `X ${axes.x} · Y ${axes.y}` : null}
          link={traceNamesInPane.length > 0 ? iconOnly => <XLinkChip paneId={paneId} iconOnly={iconOnly} /> : null}
          samples={TableRenderer ? null : iconOnly => (
            <Btn variant={settings.showSampleDots ? 'armed' : 'neutral'} tone="pane" small className={`ph-samples${iconOnly ? ' is-icon' : ''}`} aria-label="Samples" aria-pressed={settings.showSampleDots}
              title={settings.showSampleDots && !isRadial && plotView && plotView.plot.width > 0 && paneTraces.some(trace => {
                const points = visibleSampleCount(trace.data, plotView.x);
                return points > 0 && !sampleDotsVisible(points, plotView.plot.width);
              }) ? 'Zoom in to see the sample points' : 'Show the measured sample points'} data-testid="samples-toggle"
              onClick={e => { e.stopPropagation(); paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: { showSampleDots: !settings.showSampleDots } } }); }}>
              {iconOnly ? <SamplesIcon /> : 'Samples'}
            </Btn>
          )}
          chip={fit => (
            <PaneChartTypeControl
              fit={fit} icon={paneTypes[currentType].iconKey} label={currentType === 'eye' ? 'Eye · CH1' : paneTypes[currentType].title}
              anchor={typeAnchor} buttonRef={typeButtonRef} menuRef={typeMenuRef} getNote={typeNote}
              onToggle={() => { setTypeChange(null); returnToTileRef.current = null; setSettingsAnchor(null); setHoveredType(null); setFocusedType(null); typeTriggerRef.current = typeAnchor ? null : typeButtonRef.current; setTypeAnchor(typeAnchor ? null : typeButtonRef.current); }}
              onClose={() => { setTypeChange(null); returnToTileRef.current = null; setHoveredType(null); setFocusedType(null); setTypeAnchor(null); typeTriggerRef.current?.focus({ preventScroll: true }); typeTriggerRef.current = null; }}
              onTileHover={target => setHoveredType(tileFromTarget(target))}
              onTileFocus={target => setFocusedType(tileFromTarget(target))}
              menu={{
                paneName: paneName(panes, paneId),
                current: currentType,
                tiles: panePickerTiles(Object.values(paneTypes)),
                pending: pendingType ?? undefined,
                lockedNote: currentType === 'eye' ? 'This pane belongs to the Eye diagram card on CH1.' : undefined,
                onChoose: choosePaneType,
                onConfirm: confirmPaneType,
                onCancel: cancelTypeChange,
              }}
            />
          )}>
          <PaneSettingsPopover paneId={paneId} settings={settings} sections={paneTypes[currentType].settings} paneName={paneName(panes, paneId)} current={currentType} tiles={panePickerTiles(Object.values(paneTypes))} pending={pendingType} anchor={settingsAnchor} contentRef={settingsMenuRef}
            onAnchorChange={anchor => { setTypeChange(null); returnToTileRef.current = null; setTypeAnchor(null); setSettingsAnchor(anchor); if (anchor) typeTriggerRef.current = anchor; else { typeTriggerRef.current?.focus({ preventScroll: true }); typeTriggerRef.current = null; } }}
            onChoose={choosePaneType} onConfirm={confirmPaneType} onCancel={cancelTypeChange}
            table={TableRenderer ? { settings: tableView.settings, visible: tableView.visible } : null}
            axes={axes}
            onFit={isRadial && paneTraces.length > 0 ? (isPolar
              ? () => paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: null } })
              : () => setSmithFitRequest(value => value + 1)) : null}
            actions={{
              onCopyImage: imageExport && paneTraces.length > 0 ? () => imageExport.copyImage(paneId) : null,
              onDownloadImage: imageExport && paneTraces.length > 0 ? () => imageExport.downloadImage(paneId) : null,
              onDownloadSvg: imageExport && paneTraces.length > 0 ? () => imageExport.downloadSvg(paneId) : null,
              onCopyLatex: imageExport && !TableRenderer && !isPolar && paneTraces.length > 0 ? () => imageExport.copyLatex(paneId) : null,
              onExportOptions: imageExport && traceNamesInPane.length > 0 ? () => imageExport.openDialog(paneId) : null,
              onExportData: imageExport && traceNamesInPane.length > 0 ? () => imageExport.openDialog(paneId, 'csv') : null,
              onClose: panes.length > 1 ? closePane : null,
            }} />
        </PaneHeader>
      )}

      {/* overflow hidden: pane content must never paint over (and steal clicks from) the next pane's header */}
      <div onClick={() => { if (traceNamesInPane.length === 0 && !isActive) paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId }); }} style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', containerType: 'size' }}>
        {TableRenderer && displayState !== 'picker' ? (
          <TableRenderer paneId={paneId} />
        ) : RadialRenderer && traceNamesInPane.length > 0 ? (
          <RadialRenderer paneId={paneId} fitRequest={smithFitRequest} />
        ) : traceNamesInPane.length === 0 ? (
          <EmptyChartPane mode={allTraces.length > 0 ? 'traces' : 'files'} paneId={paneId} compact={panes.length > 2} types={Object.values(paneTypes)} currentType={currentType} displayState={displayState} onSelectType={selectPaneType} />
        ) : mergedData.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 'var(--font-title)' }}>No visible traces in this pane.</div>
        ) : (
          <div data-testid={`chart-plot-${paneId}`} data-line-labels={settings.showLineLabels ? 'on' : 'off'} ref={chartAreaRef} onWheel={handleWheel} onMouseDownCapture={(e) => { lastPointerClientXRef.current = e.clientX; lastPointerClientYRef.current = e.clientY; lastPointerButtonRef.current = e.button; lastCtrlPanRef.current = e.button === 0 && e.ctrlKey; }} onDoubleClick={handleDoubleClick} onMouseMoveCapture={(e) => { lastPointerClientXRef.current = e.clientX; lastPointerClientYRef.current = e.clientY; legendDodge.onPointerMove(e.clientX, e.clientY, hoverRows.map(row => ({ x: row.placement.freq, y: row.placement.amp }))); }} onMouseDown={handleContainerMouseDown} style={{ height: '100%', background: 'var(--plot)', cursor: draggingRefLineId !== null ? 'grabbing' : hoveredRefLineId !== null ? (refLines.find(l => l.id === hoveredRefLineId)?.type === 'h' ? 'ns-resize' : 'ew-resize') : undefined }}>
            <div style={{ height: omitted ? 'calc(100% - 18px)' : '100%' }} onClick={event => {
              const target = event.target;
              if (!(target instanceof Element) || !target.closest('.recharts-cartesian-axis-tick-value')) return;
              const axis = target.closest('.recharts-xAxis') ? 'x' : 'y';
              setAxisMenu({ axis, at: { x: event.clientX, y: event.clientY } });
            }}>{chartPlot}</div>
            {omitted > 0 && <div className="t-caption" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{omitted} points ≤ 0 not shown</div>}
            {axisMenu && axes && <PopoverAt label={`${axisMenu.axis.toUpperCase()} axis`} at={axisMenu.at} onClose={() => setAxisMenu(null)}>
              <AxisScaleChoices axis={axisMenu.axis} axes={axes} />
              <Btn small onClick={axisMenu.axis === 'x' ? axes.onFitX : axes.onFitY}>Fit {axisMenu.axis.toUpperCase()}</Btn>
              <Btn small onClick={() => window.dispatchEvent(new CustomEvent('mergen-previous-zoom', { detail: paneId }))}>Previous zoom</Btn>
            </PopoverAt>}
            {settings.showReferenceLines && plotView && (
              <ChartReferenceEdgeTags
                paneRefLines={paneRefLines} plotView={plotView} activePaneTrace={activePaneTrace}
                yUnit={axisInfo.yUnit} litId={hoveredRefLineId ?? selectedRefLineId}
                onReveal={(line, range) => {
                  if (line.type === 'v') {
                    const zoom = centerXDomain(line.value, visibleXSpan, paneDataBounds);
                    paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom } });
                  } else {
                    const zoom = centerYDomain(line.value, range[0], range[1]);
                    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom } });
                  }
                }}
                onHover={id => refLineDispatch({ type: 'SET_HOVERED', payload: id })}
              />
            )}
            <ChartHoverLegend
              paneId={paneId} hoverFreq={hoverFreq} hoverRows={hoverRows} visibleXSpan={visibleXSpan}
              activePaneTrace={activePaneTrace} legendRef={legendDodge.legendRef}
              corner={legendDodge.corner} style={legendDodge.style}
            />
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
