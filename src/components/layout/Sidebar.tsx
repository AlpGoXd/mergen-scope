import '../left-panel/left-panel.css';
import { LeftPanel, Section, DropZone, OpenButton, EMPTY_TEXT } from '../left-panel/LeftPanel';
import { TraceColumnsHeader } from '../left-panel/Rows';
import { FileRow as KitFileRow, Info, Matrix } from '../left-panel/FileRow';
import type { FileFormat, MatrixView } from '../left-panel/types';
import { Popover } from '../shared/Controls';
import { Menu as KitMenu } from '../left-panel/Menu';
import type { ToastKind } from '../../stores/toast-store';
import { useTraceColors } from '../../hooks/use-trace-colors';
import { planMatrixAdd } from '../../domain/matrix-add';
import type { MatrixTrace } from '../../domain/matrix-add';
import { orderTracesForList } from '../../domain/trace-order';
import { defaultTraceForPane } from '../../domain/default-trace';
import { canPlaceMembership } from '../../domain/pane-placement';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { computeLineIntersections } from '../../domain/ref-lines';
import { getInterpolationOptionDisabledReason, getResolvedInterpolationStrategy } from '../../domain/interpolation';
import { placeMarker } from '../../domain/markers';
import { appendTouchstoneDisplayTrace, makeDefaultTouchstoneState } from '../../domain/touchstone/selections';
import { adaptDisplayTracesToLegacyTraces } from '../../domain/display-trace-adapter';
import { useTouchstoneState } from '../../hooks/use-touchstone-state';
import { useTheme } from '../../hooks/use-theme';
import { useTraceActions } from '../../hooks/use-trace-actions';
import { useFileDispatch, useFileState } from '../../stores/file-store';
import { useOptionalAggregateWorkspace, workspaceReducer, traceView, type WorkspaceAction } from '../../stores/aggregate-workspace-store';
import { useMarkerDispatch, useMarkerState, type MarkerAction } from '../../stores/marker-store';
import { usePaneDispatch, usePaneLimit, usePaneState } from '../../stores/pane-store';
import { useRefLineDispatch, useRefLineState, type RefLineAction } from '../../stores/ref-line-store';
import { useTraceDispatch, useTraceState } from '../../stores/trace-store';
import { useAnalysisState } from '../../stores/analysis-store';
import { useUiDispatch, useUiState } from '../../stores/ui-store';
import type { FileMetadata, MetadataEntry } from '../../types/file';
import type { TouchstoneView } from '../../types/touchstone';
import type { Trace } from '../../types/trace';
import type { InterpolationStrategy } from '../../types/interpolation';
import { TouchstoneMatrixPicker } from '../sidebar/TouchstoneMatrixPicker';
import { TraceRow } from '../sidebar/LiveTraceRow';
import { MarkerItem } from '../sidebar/LiveMarkerItem';
import { LiveLineRow } from '../sidebar/LiveLineRow';
import { formatWithUnit } from '../sidebar/live-row-helpers';

export interface SidebarProps {
  width?: number;
  onOpenFiles?: () => void;
  onDropFiles?: (files: FileList) => void;
  onLoadDemo?: () => void;
  onReplaceFile?: (fileId: string) => void;
  onEditColumns?: (fileId: string) => void;
  onRenameFile?: (fileId: string) => void;
  onThresholdCrossings?: (lineId: number) => void;
}
export function Sidebar({ width = 280, onOpenFiles, onDropFiles, onLoadDemo, onReplaceFile, onEditColumns, onRenameFile, onThresholdCrossings }: SidebarProps) {
  const { files, rawFileData } = useFileState();
  const { allTraces, allKnownTraces, allDisplayTraces, vis } = useTraceState();
  const { analyses } = useAnalysisState();
  const { markers, selectedMkrIdx } = useMarkerState();
  const { refLines, selectedRefLineId, hoveredRefLineId, paneViews } = useRefLineState();
  const { selectedTraceName, showSidebar, traceColors } = useUiState();
  const { panes, activePaneId, tracePaneMap, zoomAll, sharedZoom, paneXZooms } = usePaneState();

  const fileDispatch = useFileDispatch();
  const paneDispatch = usePaneDispatch();
  const { limit } = usePaneLimit();
  const aggregate = useOptionalAggregateWorkspace();
  const markerDispatch = useMarkerDispatch();
  const refLineDispatch = useRefLineDispatch();
  const traceDispatch = useTraceDispatch();
  const uiDispatch = useUiDispatch();
  const { touchstoneStateByFileId, appendCell, setActiveFamily, setActiveView } = useTouchstoneState();
  const { selectTrace, removeTrace, toggleVisibility } = useTraceActions();
  const { colors } = useTheme();

  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [expandedByFileId, setExpandedByFileId] = useState<Record<string, { columns?: boolean; meta?: boolean }>>({});
  const compactSidebar = files.length <= 1 && allTraces.length <= 1 && markers.length === 0 && refLines.length === 0;
  const effectiveWidth = width;
  const fileCardRadius = '6px';

  const visibleDisplayTraces = allDisplayTraces.filter((displayTrace) => !displayTrace.hidden);
  const displayTraceLocationByLegacyName = useMemo(() => {
    const result = new Map<string, { fileId: string; displayTraceId: string }>();
    files.forEach((file) => {
      (file.displayTraces ?? []).forEach((displayTrace) => {
        result.set(displayTrace.compat?.legacyTraceName ?? displayTrace.id, {
          fileId: String(file.id),
          displayTraceId: displayTrace.id,
        });
      });
    });
    return result;
  }, [files]);

  const resolveColor = useTraceColors();
  const resolveTraceColor = (trace: Trace, _fallbackIndex: number) => resolveColor(trace);

  // Removed toggleMetadata usage

  const changeMarker = (action: MarkerAction, message: string, toastKind?: ToastKind) => {
    if (aggregate) aggregate.historyDispatch({ type: 'change', ...(toastKind ? { toastMessage: message, toastKind } : {}), command: { slice: 'markers', action } });
    else markerDispatch(action);
  };
  const changeLine = (action: RefLineAction, message: string, toastKind?: ToastKind) => {
    if (aggregate) aggregate.historyDispatch({ type: 'change', ...(toastKind ? { toastMessage: message, toastKind } : {}), command: { slice: 'lines', action } });
    else refLineDispatch(action);
  };

  const getTraceDataSpan = (trace: Trace | null): number => {
    if (!trace || trace.data.length < 2) {
      return 1;
    }
    const span = (trace.data[trace.data.length - 1]?.freq ?? 0) - (trace.data[0]?.freq ?? 0);
    if (Number.isFinite(span) && span > 0) {
      return span;
    }
    const step = Math.abs((trace.data[1]?.freq ?? 0) - (trace.data[0]?.freq ?? 0));
    return Number.isFinite(step) && step > 0 ? step : 1;
  };

  const getVisibleXSpanForPaneId = (paneId: string | null): number => {
    const pid = paneId ?? 'pane-1';
    const zoom = zoomAll ? sharedZoom : (paneXZooms[pid] ?? null);
    if (zoom && Number.isFinite(zoom.left) && Number.isFinite(zoom.right) && zoom.right > zoom.left) {
      return zoom.right - zoom.left;
    }
    const tracesInPane = allTraces.filter((t) => tracePaneMap[t.name]?.includes(pid));
    for (const trace of tracesInPane) {
      const span = getTraceDataSpan(trace);
      if (span > 1) return span;
    }
    return 1;
  };

  const getVisibleTraceXSpan = (trace: Trace | null): number => {
    if (!trace) {
      return 1;
    }
    const paneId = tracePaneMap[trace.name]?.[0] ?? 'pane-1';
    const zoom = zoomAll ? sharedZoom : (paneXZooms[paneId] ?? null);
    if (zoom && Number.isFinite(zoom.left) && Number.isFinite(zoom.right) && zoom.right > zoom.left) {
      return zoom.right - zoom.left;
    }
    return getTraceDataSpan(trace);
  };

  if (!showSidebar) {
    return null;
  }

  return (
    <LeftPanel width={effectiveWidth}>
        <PanelSection title="Files" count={files.length} actions={[{ label: 'Close all files…', disabled: !files.length, run: () => {
          const actions = files.map(file => ({ slice: 'files' as const, action: { type: 'REMOVE_FILE' as const, payload: { fileId: String(file.id) } } }));
          if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: `Closed ${files.length} files`, toastKind: 'close', command: { slice: 'transaction', actions } });
          else actions.forEach(item => fileDispatch(item.action));
        } }]} rightElement={
          <OpenButton onOpen={() => onOpenFiles?.()} />
        }>
          {files.map((file) => {
            const fileId = String(file.id);
            const isMatrixTab = !!file.matrixOpen;
            const isColumnsTab = !!expandedByFileId[fileId]?.columns;
            const isMetaTab = !!expandedByFileId[fileId]?.meta;
            const touchstoneState = touchstoneStateByFileId[fileId] ?? makeDefaultTouchstoneState(file);
            const activeFamily = touchstoneState.activeFamily;
            const activeView = touchstoneState.activeViewByFamily[activeFamily];
            const targetPane = panes.find(pane => pane.id === activePaneId);
            const smithTarget = targetPane?.renderMode === 'smith' || targetPane?.renderMode === 'smith-inverted';
            const matrixView: TouchstoneView = smithTarget ? (activeFamily === 'S' ? 'dB' : 'Mag') : activeView;
            const componentViews: Record<string, TouchstoneView> = { 'magnitude-db': 'dB', 'magnitude-linear': 'Mag', phase: 'Phase', real: 'Real', imag: 'Imag', vswr: 'VSWR', 'return-loss': 'Return loss', 'group-delay': 'Group delay' };
            const matrixTraces: MatrixTrace[] = (file.displayTraces ?? []).flatMap(display => {
              const source = display.source;
              if (display.hidden || source.sourceType !== 'network-parameter') return [];
              if (source.parameterFamily !== 'S' && source.parameterFamily !== 'Y' && source.parameterFamily !== 'Z' && source.parameterFamily !== 'ABCD') return [];
              const view = componentViews[source.component];
              if (!view) return [];
              const name = display.compat?.legacyTraceName ?? display.id;
              return [{ name, family: source.parameterFamily, row: source.row, col: source.col, view, paneIds: tracePaneMap[name] ?? [] }];
            });
            const hiddenViewCount = (file.displayTraces ?? []).filter((displayTrace) => displayTrace.hidden).length;

            const toggleMatrix = (row: number, col: number, view: TouchstoneView) => {
                        view = smithTarget ? matrixView : view;
                        const plan = planMatrixAdd({ family: activeFamily, row, col, view, targetPaneId: activePaneId ?? 'pane-1', targetPaneType: targetPane?.renderMode ?? 'cartesian', traces: matrixTraces });
                        if (plan.kind === 'refused') return;
                        if (plan.kind === 'duplicate') {
                          selectTrace(plan.traceName);
                          const rowElement = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="trace-row-"]')).find(element => element.dataset.testid === `trace-row-${plan.traceName}`);
                          rowElement?.scrollIntoView({ block: 'nearest' });
                          rowElement?.classList.add('matrix-highlight');
                          window.setTimeout(() => rowElement?.classList.remove('matrix-highlight'), 1000);
                          return;
                        }
                        const component = ({ dB: 'magnitude-db', Mag: 'magnitude-linear', Phase: 'phase', Real: 'real', Imag: 'imag', VSWR: 'vswr', 'Return loss': 'return-loss', 'Group delay': 'group-delay' } as const)[view];
                        const display = (file.displayTraces ?? []).find(item => !item.hidden && item.source.sourceType === 'network-parameter' && item.source.parameterFamily === activeFamily && item.source.row === row && item.source.col === col && item.source.component === component);
                        const trace = display && allKnownTraces.find(item => item.name === (display.compat?.legacyTraceName ?? display.id));
                        const paneId = activePaneId ?? 'pane-1';
                        if (!trace) {
                          const nextFile = appendTouchstoneDisplayTrace(file, touchstoneState, activeFamily, row + 1, col + 1, view);
                          const added = nextFile.displayTraces?.[nextFile.displayTraces.length - 1];
                          const created = added && adaptDisplayTracesToLegacyTraces(nextFile.datasets ?? [], [added], nextFile)[0];
                          if (!created || nextFile === file) return;
                          const fileAction = { type: 'APPEND_TOUCHSTONE_VIEW' as const, payload: { fileId, family: activeFamily, row: row + 1, col: col + 1, view } };
                          const paneAction = { type: 'ADD_MEMBERSHIP' as const, payload: { trace: created, targetPaneId: paneId, allTraces: [...allKnownTraces, created], displayTraces: [...allDisplayTraces, added] } };
                          const entries = allKnownTraces.map(item => ({ trace: item, paneIds: tracePaneMap[item.name] ?? [], displayTrace: allDisplayTraces.find(itemDisplay => itemDisplay.id === item.id) }));
                          const result = canPlaceMembership({ trace: created, paneIds: [], displayTrace: added }, paneId, panes, entries);
                          if (!result.allowed) { uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: { message: result.reason, paneId, traceName: created.name } } }); return; }
                          if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'transaction', actions: [{ slice: 'files', action: fileAction }, { slice: 'panes', action: paneAction, limit }] } });
                          else { appendCell(fileId, activeFamily, row + 1, col + 1, view); paneDispatch(paneAction); }
                          return;
                        }
                        if ((tracePaneMap[trace.name] ?? []).includes(paneId)) { selectTrace(trace.name); return; }
                        const action = { type: 'ADD_MEMBERSHIP' as const, payload: { trace, targetPaneId: paneId, allTraces: allKnownTraces, displayTraces: allDisplayTraces } };
                        if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'panes', action, limit } });
                        else paneDispatch(action);
            };

            return (
              <div
                key={fileId}
                style={{
                  border: `1px ${!file.touchstoneNetwork && file.displayTraces?.length === 1 && hiddenViewCount ? 'dashed' : 'solid'} ${file.error ? 'var(--danger-line)' : 'var(--border)'}`,
                  color: file.error ? 'var(--danger-ink)' : undefined,
                  borderRadius: fileCardRadius,
                  padding: '0 5px',
                  background: file.error ? 'var(--danger-fill)' : 'var(--raised)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                  minWidth: 0,
                }}
              >
                <FileTitleRow
                  fileName={file.fileName}
                  error={file.error}
                  summary={file.touchstoneNetwork ? `${file.touchstoneNetwork.portCount} ports \u00b7 ${file.touchstoneNetwork.samples.length} pts${file.touchstoneNetwork.samples.length ? ` \u00b7 ${formatWithUnit((file.touchstoneNetwork.samples[0]?.freq ?? 0), "Hz")}\u2013${formatWithUnit((file.touchstoneNetwork.samples[file.touchstoneNetwork.samples.length - 1]?.freq ?? 0), "Hz")}` : ""} \u00b7 ${file.displayTraces?.length ?? file.traces.length}\u00a0${(file.displayTraces?.length ?? file.traces.length) === 1 ? "trace" : "traces"}` : `${file.traces.length} ${file.traces.length === 1 ? "trace" : "traces"}`}
                  matrixOpen={file.touchstoneNetwork ? isMatrixTab : undefined}
                  onMatrix={file.touchstoneNetwork ? () => fileDispatch({ type: 'SET_MATRIX_OPEN', payload: { fileId, open: !isMatrixTab } }) : undefined}
                  onReplace={onReplaceFile ? () => onReplaceFile(fileId) : undefined}
                  onRename={onRenameFile ? () => onRenameFile(fileId) : undefined}
                  onEdit={file.format === 'tabular' ? () => onEditColumns ? onEditColumns(fileId) : fileDispatch({ type: 'RERUN_WIZARD', payload: { fileId, fileName: file.fileName } }) : undefined}
                  onVisibility={(visible) => { const traces = allTraces.filter(item => displayTraceLocationByLegacyName.get(item.name)?.fileId === fileId); const actions = traces.map(item => ({ slice: 'traces' as const, action: { type: 'SET_VISIBILITY' as const, name: item.name, visible } })); if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'transaction', actions } }); else actions.forEach(item => traceDispatch(item.action)); }}
                  onInfo={() => setExpandedByFileId(prev => ({ ...prev, [fileId]: { ...prev[fileId], meta: !prev[fileId]?.meta } }))}
                  compact={compactSidebar}
                  showSummary={isMatrixTab || isMetaTab}
                  columnsOpen={isColumnsTab}
                  onColumns={!file.touchstoneNetwork && file.format === 'tabular' && (file.displayTraces?.length ?? 0) > 1 ? () => setExpandedByFileId(prev => ({ ...prev, [fileId]: { ...prev[fileId], columns: !prev[fileId]?.columns } })) : undefined}
                  onPlot={!file.touchstoneNetwork && file.displayTraces?.length === 1 && hiddenViewCount ? () => fileDispatch({ type: 'SHOW_ALL_DISPLAY_TRACES', payload: { fileId } }) : undefined}
                  multiTrace={(file.displayTraces?.length ?? file.traces.length) > 1}
                  onRemove={() => {
                    const names = new Set([...file.traces.map(trace => trace.name), ...(file.displayTraces ?? []).map(display => display.compat?.legacyTraceName ?? display.id)]);
                    if (((file.displayTraces?.length ?? file.traces.length) > 1 || markers.some(marker => names.has(marker.trace))) && !window.confirm(`Remove ${file.fileName} and its traces?`)) return;
                    const action = {type:'REMOVE_FILE' as const,payload:{fileId}};
                    if (aggregate) aggregate.historyDispatch({type:'change',toastMessage:`Closed ${file.fileName}`,toastKind:'close',command:{slice:'files',action}});
                    else fileDispatch(action);
                  }}
                />

                {file.error && <span role="alert" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{file.error}</span>}

                {isMatrixTab && file.touchstoneNetwork && (
                  <div
                    data-testid="matrix-controls"
                    style={{
                      display: 'grid',
                      gap: '4px',
                      padding: '2px 0 5px',
                    }}
                  >
                    <Matrix ports={file.touchstoneNetwork.portCount} family={activeFamily} plotAsDisabled={smithTarget}
                      view={(activeView === 'Real' ? 'Re' : activeView === 'Imag' ? 'Im' : activeView) as MatrixView}
                      abcdAllowed={file.touchstoneNetwork.portCount === 2} cells={[]} moreViews={[]}
                      onFamily={family => setActiveFamily(fileId, family)}
                      onView={view => setActiveView(fileId, activeFamily, view === 'Re' ? 'Real' : view === 'Im' ? 'Imag' : view)}
                      onMore={() => {}} onToggleCell={(row, col) => toggleMatrix(row - 1, col - 1, activeView)}
                      moreControl={<MoreViews family={activeFamily} view={activeView} onChange={view => setActiveView(fileId, activeFamily, view)} />}
                      quickControl={file.touchstoneNetwork.portCount >= 3 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(['All Sii', 'All Sij', 'Lower'] as const).map(pick => <button type="button" key={pick} onClick={() => {
                        const n = file.touchstoneNetwork?.portCount ?? 0;
                        if (!aggregate) return;
                        let candidate = aggregate.state;
                        const actions: Extract<WorkspaceAction, { slice: 'transaction' }>['actions'][number][] = [];
                        const apply = (action: typeof actions[number]) => { candidate = workspaceReducer(candidate, action); actions.push(action); };
                        const component = ({ dB: 'magnitude-db', Mag: 'magnitude-linear', Phase: 'phase', Real: 'real', Imag: 'imag', VSWR: 'vswr', 'Return loss': 'return-loss', 'Group delay': 'group-delay' } as const)[matrixView];
                        const paneId = activePaneId ?? 'pane-1';
                        for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
                          if (smithTarget && planMatrixAdd({ family: activeFamily, row, col, view: matrixView, targetPaneId: paneId, targetPaneType: targetPane?.renderMode ?? 'cartesian', traces: [] }).kind === 'refused') continue;
                          if ((matrixView === 'VSWR' || matrixView === 'Return loss') && row !== col) continue;
                          const matches = pick === 'All Sii' ? row === col : pick === 'All Sij' ? row !== col : pick === 'Lower' ? row > col : true;
                          if (!matches) continue;
                          const currentFile = candidate.files.files.find(item => String(item.id) === fileId);
                          if (!currentFile) continue;
                          const projection = (currentFile.displayTraces ?? []).find(item => !item.hidden && item.source.sourceType === 'network-parameter' && item.source.parameterFamily === activeFamily && item.source.row === row && item.source.col === col && item.source.component === component);
                          let currentView = traceView(candidate.files, candidate.traces);
                          let trace = projection && currentView.allKnownTraces.find(item => item.name === (projection.compat?.legacyTraceName ?? projection.id));
                          const selected = !!trace && (candidate.panes.tracePaneMap[trace.name] ?? []).includes(paneId);
                          if (selected) continue;
                          if (!trace) {
                            const nextFile = appendTouchstoneDisplayTrace(currentFile, touchstoneState, activeFamily, row + 1, col + 1, matrixView);
                            const added = nextFile === currentFile ? undefined : nextFile.displayTraces?.at(-1);
                            const created = added && adaptDisplayTracesToLegacyTraces(nextFile.datasets ?? [], [added], nextFile)[0];
                            if (!created) continue;
                            const entries = currentView.allKnownTraces.map(item => ({ trace: item, paneIds: candidate.panes.tracePaneMap[item.name] ?? [], displayTrace: currentView.allDisplayTraces.find(display => display.id === item.id) }));
                            if (!canPlaceMembership({ trace: created, paneIds: [], displayTrace: added }, paneId, candidate.panes.panes, entries).allowed) continue;
                            apply({ slice: 'files', action: { type: 'APPEND_TOUCHSTONE_VIEW', payload: { fileId, family: activeFamily, row: row + 1, col: col + 1, view: matrixView } } });
                            currentView = traceView(candidate.files, candidate.traces);
                            trace = currentView.allKnownTraces.find(item => item.id === created.id);
                          }
                          if (trace) apply({ slice: 'panes', limit, action: { type: 'ADD_MEMBERSHIP', payload: { trace, targetPaneId: paneId, allTraces: currentView.allKnownTraces, displayTraces: currentView.allDisplayTraces } } });
                        }
                        if (actions.length) aggregate.historyDispatch({ type: 'change', command: { slice: 'transaction', actions } });
                      }} disabled={!aggregate || (smithTarget && pick !== 'All Sii')} title={smithTarget && pick !== 'All Sii' ? 'Smith panes show reflection (Sii) only' : !aggregate ? 'Batch actions require workspace history' : pick}>{pick === 'Lower' ? 'Lower \u25e3' : pick}</button>)}
                    </div>}
                      grid={<div style={{ marginLeft: file.touchstoneNetwork.portCount <= 2 ? 51 : 0, maxWidth: file.touchstoneNetwork.portCount <= 2 ? 168 : undefined }}><TouchstoneMatrixPicker
                      portCount={file.touchstoneNetwork.portCount}
                      family={activeFamily}
                      view={matrixView}
                      traces={matrixTraces}
                      targetPaneId={activePaneId ?? 'pane-1'}
                      targetPaneType={targetPane?.renderMode ?? 'cartesian'}
                      targetPaneTitle={targetPane?.title || 'Pane 1'}
                      paneTitle={id => panes.find(pane => pane.id === id)?.title || id}
                      disabledReason={(row, col) => smithTarget && planMatrixAdd({ family: activeFamily, row, col, view: matrixView, targetPaneId: activePaneId ?? 'pane-1', targetPaneType: targetPane?.renderMode ?? 'cartesian', traces: [] }).kind === 'refused' ? 'Smith panes show reflection (Sii) only' : (matrixView === 'VSWR' || matrixView === 'Return loss') && row !== col ? 'Reflection parameters only' : undefined}
                      onToggle={toggleMatrix}
                    /></div>} />
                  </div>
                )}

                {isColumnsTab && <div style={{ display: 'grid', padding: '0 0 5px 35px', fontSize: 'var(--font-caption)' }}>{(file.displayTraces ?? []).map((display, index) => <label key={display.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!display.hidden} onChange={event => fileDispatch({ type: 'SET_DISPLAY_TRACE_HIDDEN', payload: { fileId, displayTraceId: display.id, hidden: !event.target.checked } })} />{file.columnIdentities?.[index]?.header || display.label.replace(`${file.fileName} `, '')}{display.hidden ? ' \u00b7 not plotted' : ''}</label>)}</div>}

                {isMetaTab && <MetadataPanel meta={file.meta} raw={rawFileData[fileId] ?? ''} compact={compactSidebar} onClose={() => setExpandedByFileId(prev => ({ ...prev, [fileId]: { ...prev[fileId], meta: false } }))} />}


              </div>
            );
          })}
          {files.length === 0 && <div onDragOver={onDropFiles ? event => event.preventDefault() : undefined} onDrop={onDropFiles ? event => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.files.length) onDropFiles(event.dataTransfer.files); } : undefined}><DropZone onOpen={() => onOpenFiles?.()} onDemo={() => onLoadDemo?.()} /></div>}
        </PanelSection>

        {files.length > 0 && <>
        <PanelSection title="Traces" count={allTraces.length} actions={[
          ...([true, false] as const).map(visible => ({ label: visible ? 'Show all' : 'Hide all', disabled: !allTraces.length, run: () => { const actions = allTraces.map(trace => ({ slice: 'traces' as const, action: { type: 'SET_VISIBILITY' as const, name: trace.name, visible } })); if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'transaction', actions } }); else actions.forEach(item => traceDispatch(item.action)); } })),
        ]}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
            {allTraces.length > 0 && <TraceColumnsHeader />}
            {orderTracesForList(allTraces).map((trace, index) => {
              const traceColor = resolveTraceColor(trace, index);
              const isBackedByDisplayTrace = visibleDisplayTraces.some(
                (displayTrace) => (displayTrace.compat?.legacyTraceName ?? displayTrace.id) === trace.name,
              );
              const displayTraceLocation = displayTraceLocationByLegacyName.get(trace.name) ?? null;
              const displayForName = allDisplayTraces.find(item => (item.compat?.legacyTraceName ?? item.id) === trace.name);
              const automaticName = trace.kind === 'derived' ? analyses.find(item => item.outputTraceId === trace.id)?.autoName ?? trace.automaticDisplayName ?? trace.dn : displayForName?.compat?.automaticDisplayName ?? displayForName?.compat?.legacyDisplayName ?? trace.automaticDisplayName ?? trace.dn;
              const effectiveInterpolation = getResolvedInterpolationStrategy(
                trace.family,
                trace.interpolation,
                trace.isUniform ?? false,
              );
              const sincDisabledReason = getInterpolationOptionDisabledReason(
                trace.family,
                'sinc',
                trace.isUniform ?? false,
              );

              const applyInterpolation = (interpolation: InterpolationStrategy, allFile: boolean) => {
                const targets = allFile && displayTraceLocation ? allKnownTraces.filter(item => displayTraceLocationByLegacyName.get(item.name)?.fileId === displayTraceLocation.fileId) : [trace];
                const actions: Extract<WorkspaceAction, { slice: 'transaction' }>['actions'][number][] = [];
                for (const target of targets) {
                  if (getInterpolationOptionDisabledReason(target.family, interpolation, target.isUniform ?? false)) continue;
                  markers.forEach((marker, idx) => {
                    if (marker.trace !== target.name) return;
                    const placement = placeMarker({ ...target, interpolation }, marker.requestedFreq ?? marker.freq);
                    actions.push({ slice: 'markers', action: { type: 'UPDATE_MARKER', payload: { idx, updates: { requestedFreq: placement.requestedFreq, freq: placement.freq, amp: placement.amp, interpolated: placement.interpolated } } } });
                  });
                  const location = displayTraceLocationByLegacyName.get(target.name);
                  if (target.kind === 'derived') actions.push({ slice: 'traces', action: { type: 'SET_DERIVED_INTERPOLATION', payload: { traceId: target.id, interpolation } } });
                  else if (location) actions.push({ slice: 'files', action: { type: 'SET_DISPLAY_TRACE_INTERPOLATION', payload: { ...location, interpolation } } });
                }
                if (!actions.length) return;
                if (aggregate) aggregate.historyDispatch({ type: 'change', ...(allFile ? { toastMessage: 'Applied interpolation to all traces of the file', toastKind: 'apply-all' as const } : {}), command: { slice: 'transaction', actions } });
                else actions.forEach(item => { if (item.slice === 'markers') markerDispatch(item.action); else if (item.slice === 'traces') traceDispatch(item.action); else if (item.slice === 'files') fileDispatch(item.action); });
              };
              const sourceFile = displayTraceLocation ? files.find(file => String(file.id) === displayTraceLocation.fileId) : undefined;
              const rowName = sourceFile && trace.dn.startsWith(sourceFile.fileName) ? sourceFile.fileName : trace.dn;
              return (
                <TraceRow
                  key={trace.id || trace.name}
                  trace={trace}
                  displayName={rowName.length > 28 ? `${rowName.slice(0, 14)}\u2026${rowName.slice(-11)}` : rowName}
                  subtitle={(() => { const display = allDisplayTraces.find(item => (item.compat?.legacyTraceName ?? item.id) === trace.name); const source = display?.source; return source?.sourceType === 'network-parameter' ? `${source.parameterFamily}${source.row + 1}${source.col + 1} · ${({ 'magnitude-db': 'dB', 'magnitude-linear': 'Mag', phase: 'Phase', real: 'Re', imag: 'Im', vswr: 'VSWR', 'return-loss': 'Return loss', 'group-delay': 'Group delay', complex: 'Complex', 'stability-k': 'K', 'stability-mu1': 'mu1', 'stability-mu2': 'mu2', 'stability-muprime': 'mu-prime' } as const)[source.component]}` : source?.sourceType === 'series' ? trace.dn : undefined; })()}
                  isVisible={!!vis[trace.name]}
                  isSelected={selectedTraceName === trace.name}
                  paneIds={tracePaneMap[trace.name] ?? []}
                  panes={panes.map((pane, paneIndex) => {
                    const entries = allKnownTraces.map(item => ({ trace: item, paneIds: tracePaneMap[item.name] ?? [], displayTrace: allDisplayTraces.find(display => display.id === item.id) }));
                    const entry = entries.find(item => item.trace.name === trace.name);
                    const result = entry && canPlaceMembership(entry, pane.id, panes, entries);
                    return { id: pane.id, title: pane.title || `Pane ${paneIndex + 1}`, type: pane.renderMode, disabledReason: !(tracePaneMap[trace.name] ?? []).includes(pane.id) && result && !result.allowed ? result.reason : undefined };
                  })}
                  newPaneDisabledReason={panes.length >= limit ? `The current limit is ${limit} panes.` : undefined}
                  onNewPane={() => {
                    const action = { type: 'CREATE_PANE_WITH_TRACE' as const, payload: { trace, allTraces: allKnownTraces, displayTraces: allDisplayTraces } };
                    if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Added pane with trace', toastKind: 'moved', command: { slice: 'panes', action, limit } });
                    else paneDispatch(action);
                  }}
                  onTogglePane={(paneId) => {
                    const action = (tracePaneMap[trace.name] ?? []).includes(paneId)
                      ? { type: 'REMOVE_MEMBERSHIP' as const, payload: { traceName: trace.name, paneId } }
                      : { type: 'ADD_MEMBERSHIP' as const, payload: { trace, targetPaneId: paneId, allTraces: allKnownTraces, displayTraces: allDisplayTraces } };
                    if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'panes', action, limit } });
                    else paneDispatch(action);
                  }}
                  traceColor={traceColor}
                  onSelect={() => selectTrace(trace.name)}
                  canResetName={trace.dn !== automaticName}
                  onRename={(value) => {
                    const label = value.trim() || automaticName;
                    if (label === trace.dn) return;
                    if (trace.kind === 'derived') {
                      const action = { type: 'RENAME_DERIVED' as const, payload: { traceId: trace.id, label } };
                      if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'traces', action } }); else traceDispatch(action);
                    } else if (displayTraceLocation) {
                      const action = { type: 'RENAME_DISPLAY_TRACE' as const, payload: { ...displayTraceLocation, label } };
                      if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'files', action } }); else fileDispatch(action);
                    } else {
                      const action = { type: 'RENAME_RAW_TRACE' as const, payload: { traceId: trace.id, label } };
                      if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'files', action } }); else fileDispatch(action);
                    }
                  }}
                  onRemove={() => { if (markers.some(marker => marker.trace === trace.name) && !window.confirm(`Remove ${trace.dn} and its markers?`)) return; removeTrace(trace); }}
                  onToggle={() => toggleVisibility(trace.name)}
                  onColorChange={(color) => {
                    const next = { ...traceColors, [trace.name]: color };
                    const action = { type: 'SET' as const, payload: { key: 'traceColors' as const, value: next } };
                    if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'ui', action } }); else uiDispatch(action);
                  }}
                  interpolation={effectiveInterpolation}
                  sincDisabledReason={sincDisabledReason}
                  onInterpolationChange={interpolation => applyInterpolation(interpolation, false)}
                  onApplyInterpolation={interpolation => applyInterpolation(interpolation, true)}
                  compact={compactSidebar}
                  removeLabel={
                    trace.kind === 'derived'
                      ? 'Delete derived trace'
                      : isBackedByDisplayTrace
                        ? 'Hide view'
                        : 'Delete source file'
                  }
                />
              );
            })}
            {allTraces.length === 0 && <SidebarEmpty text={EMPTY_TEXT.traces} compact={compactSidebar} />}
          </div>
        </PanelSection>

          <PanelSection 
            title="Markers" 
            count={markers.length}
            actions={[{ label: 'Remove all', disabled: !markers.length, run: () => { const action = { type: 'CLEAR_ALL' as const }; if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Removed all markers', toastKind: 'delete', command: { slice: 'markers', action } }); else markerDispatch(action); } }]}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '4px', minWidth: 0 }}>
              {markers.map((marker, index) => {
                const trace = allTraces.find((item) => item.name === marker.trace) ?? null;
                const traceIndex = trace ? allTraces.findIndex((item) => item.name === trace.name) : index;
                const traceColor = trace
                  ? resolveTraceColor(trace, Math.max(traceIndex, 0))
                  : (colors?.mn ?? 'var(--accent)');
                const paneId = tracePaneMap[marker.trace]?.[0] ?? 'pane-1';
                const paneNumber = parseInt(paneId.replace('pane-', ''), 10);

                const refMarker = marker.refId ? markers.find(item => item.id === marker.refId) ?? null : null;

                return (
                  <MarkerItem
                    key={`${marker.trace}-${index}`}
                    marker={marker}
                    index={index}
                    trace={trace}
                    traceColor={traceColor}
                    xSpan={getVisibleTraceXSpan(trace)}
                    isSelected={selectedMkrIdx === index}
                    isVisible={!!vis[marker.trace]}
                    isRelated={!!hoveredMarkerId && (marker.refId === hoveredMarkerId || markers.some(other => other.id === hoveredMarkerId && other.refId === marker.id))}
                    onHover={(hovered) => setHoveredMarkerId(hovered ? marker.id : null)}
                    paneNumbers={(tracePaneMap[marker.trace] ?? []).map(id => panes.findIndex(pane => pane.id === id) + 1).filter(n => n > 0)}
                    onSelect={() => { uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: null } }); refLineDispatch({ type: 'SET_SELECTED', payload: null }); markerDispatch({ type: 'SET_SELECTED_IDX', payload: index }); }}
                    onRemove={() => changeMarker({ type: 'REMOVE_MARKER', payload: index }, 'Removed marker', 'delete')}
                    compact={compactSidebar}
                    paneNumber={paneNumber}
                    refMarker={refMarker}
                    allMarkers={markers}
                    onUpdateRefIdx={(refIdx) => {
                      changeMarker({
                        type: 'UPDATE_MARKER',
                        payload: {
                          idx: index,
                          updates: { refId: refIdx != null ? markers[refIdx]?.id ?? null : null, type: refIdx != null && markers[refIdx] ? 'delta' : 'normal' },
                        },
                      }, 'Updated marker');
                    }}
                    onUpdateFreq={(freq) => {
                      if (!trace) {
                        return;
                      }
                      const placement = placeMarker(trace, freq);
                      changeMarker({
                        type: 'UPDATE_MARKER',
                        payload: {
                          idx: index,
                          updates: {
                            requestedFreq: placement.requestedFreq,
                            freq: placement.freq,
                            amp: placement.amp,
                            interpolated: placement.interpolated,
                          },
                        },
                      }, 'Updated marker');
                    }}
                  />
                );
              })}
            </div>
            {markers.length === 0 && <SidebarEmpty text={EMPTY_TEXT.markers} />}
          </PanelSection>

          <PanelSection title="Lines" count={refLines.length} actions={[{ label: 'Remove all', disabled: !refLines.length, run: () => {
            const actions = refLines.map(line => ({ slice: 'lines' as const, action: { type: 'REMOVE_LINE' as const, payload: line.id } }));
            if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Removed all lines', toastKind: 'delete', command: { slice: 'transaction', actions } });
            else actions.forEach(item => refLineDispatch(item.action));
          } }]}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '4px', minWidth: 0 }}>
              {(() => {
                return refLines
                  .map((refLine) => {
                    const intersections = computeLineIntersections(refLine, refLines, allTraces, tracePaneMap, vis);
                    return (
                      <LiveLineRow
                        key={refLine.id}
                        refLine={refLine}
                        lit={(hoveredRefLineId ?? selectedRefLineId) === refLine.id}
                        selected={selectedRefLineId === refLine.id}
                        onHover={hovered => refLineDispatch({ type: 'SET_HOVERED', payload: hovered ? refLine.id : null })}
                        intersections={intersections}
                        panes={panes}
                        paneViews={paneViews}
                        entries={allKnownTraces.map(trace => ({ trace, paneIds: tracePaneMap[trace.name] ?? [], displayTrace: allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) }))}
                        onList={() => { markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 }); refLineDispatch({ type: 'SET_SELECTED', payload: refLine.id }); onThresholdCrossings?.(refLine.id); }}
                        onSelect={() => {
                          uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: null } });
                          refLineDispatch({ type: 'SET_SELECTED', payload: refLine.id });
                          markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
                        }}
                        changeLine={changeLine}
                        selectedTrace={defaultTraceForPane(allTraces, selectedTraceName, refLine.paneIds[0] ?? activePaneId, tracePaneMap, vis)}
                        xSpan={getVisibleXSpanForPaneId(refLine.paneIds[0] ?? null)}
                      />
                    );
                  });
              })()}
            </div>
            {refLines.length === 0 && <SidebarEmpty text={EMPTY_TEXT.lines} />}
          </PanelSection>
        </>}
    </LeftPanel>
  );
}

function FileTitleRow({ fileName, error, summary, matrixOpen, onMatrix, compact: _compact = false, showSummary, multiTrace, columnsOpen, onColumns, onPlot, onRemove, onInfo, onReplace, onRename, onEdit, onVisibility }: { fileName: string; error?: string; summary: string; matrixOpen?: boolean; onMatrix?: () => void; compact?: boolean; showSummary: boolean; multiTrace: boolean; columnsOpen?: boolean; onColumns?: () => void; onPlot?: () => void; onRemove: () => void; onInfo: () => void; onReplace?: () => void; onRename?: () => void; onEdit?: () => void; onVisibility: (visible: boolean) => void }) {
  const extension = fileName.split('.').pop()?.toUpperCase() ?? '';
  const format: FileFormat = /^S[0-9]+P$/.test(extension) ? extension as FileFormat : extension === 'CSV' || extension === 'TXT' || extension === 'DAT' ? extension : 'DAT';
  const actions: SidebarAction[] = [{ label: 'Info', run: onInfo }, { label: 'Replace file\u2026', disabled: !onReplace, run: () => onReplace?.() }, ...(onEdit ? [{ label: 'Edit columns\u2026', note: 'CSV only', run: onEdit }] : []), { label: 'Rename', disabled: !onRename, run: () => onRename?.() }, ...(multiTrace ? [{ label: 'Show all', run: () => onVisibility(true) }, { label: 'Hide all', run: () => onVisibility(false) }] : []), { label: 'Remove file\u2026', danger: true, run: onRemove }];
  return <KitFileRow headerOnly format={format} name={fileName} title={`${fileName} \u00b7 ${summary}`} state={error ? 'error' : onPlot ? 'traceRemoved' : 'ready'} errorReason={error} summary={showSummary ? summary : undefined}
    matrix={onMatrix ? { open: !!matrixOpen, onToggle: onMatrix } : undefined}
    columns={onColumns ? { open: !!columnsOpen, onToggle: onColumns, items: [] } : undefined}
    onPlot={onPlot} onFix={onEdit ?? onReplace} onMenu={() => {}} onRemove={onRemove}
    menuControl={<ActionMenu label={`Actions for ${fileName}`} actions={actions} />} />;
}

function SidebarEmpty({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      style={{
        fontSize: 'var(--font-label)',
        lineHeight: 'var(--lh-label)',
        color: 'var(--dim)',
        padding: compact ? '0.25rem 0.15rem' : '0.32rem 0.15rem',
      }}
    >
      {text}
    </div>
  );
}

type SidebarAction = { label: string; run: () => void; disabled?: boolean; note?: string; danger?: boolean };
function MoreViews({ family, view, onChange }: { family: string; view: TouchstoneView; onChange: (view: TouchstoneView) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const moreViews: TouchstoneView[] = ['VSWR', 'Return loss', 'Group delay'];
  const text = moreViews.includes(view) ? view : 'More';
  return <span ref={ref} className="lp-more-trigger"><Popover label="More network views"><KitMenu label="More network views" entries={moreViews.map(option => ({ label: option, disabledReason: option !== 'Group delay' && family !== 'S' ? 'S-parameter views only' : undefined, onSelect: () => { onChange(option); ref.current?.querySelector<HTMLButtonElement>('.ui-menu-root > button')?.click(); } }))} /></Popover><span className="lp-more-trigger__face" aria-hidden="true">{text} &#9662;</span></span>;
}
function ActionMenu({ label, actions }: { label: string; actions: SidebarAction[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  return <span ref={ref} className="lp-action-menu"><Popover label={label}><KitMenu label={label} entries={actions.map(action => ({ label: action.label, note: action.note, danger: action.danger, disabledReason: action.disabled ? 'Unavailable until the required data or integration is present' : undefined, onSelect: () => { action.run(); ref.current?.querySelector<HTMLButtonElement>('.ui-menu-root > button')?.click(); } }))} /></Popover></span>;
}
function PanelSection({ title, count, children, rightElement, actions = [] }: { title: string; count: number; children: ReactNode; rightElement?: ReactNode; actions?: SidebarAction[] }) {
  const key = `mergen.sidebar.collapsed.${title.toLowerCase()}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(key, String(next)); } catch { /* Storage can be unavailable. */ }
  };
  return <Section title={title} count={count} collapsed={collapsed} onToggle={toggle} action={rightElement} menu={<ActionMenu label={`${title} actions`} actions={actions} />} emptyText="">{children}</Section>;
}

function metadataEntryToDisplay(entry: MetadataEntry): string {
  if (typeof entry === 'string') {
    return entry;
  }
  return formatWithUnit(entry.value, entry.unit);
}

function MetadataPanel({ meta, raw, compact: _compact = false, onClose }: { meta: FileMetadata; raw: string; compact?: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'table' | 'raw'>('table');
  const entries = useMemo(() => Object.entries(meta), [meta]);
  const rawHeader = useMemo(() => {
    const lines = raw.split(/\r?\n/);
    const header: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !/^[!#;%]/.test(trimmed) && /^[+-]?(?:\d|\.\d)/.test(trimmed)) break;
      header.push(line);
    }
    return header.join('\n').trimEnd();
  }, [raw]);

  const fields = entries.map(([key, value]) => ({ key, value: metadataEntryToDisplay(value) }));
  return <Info mode={mode} fields={fields} raw={rawHeader || 'No header fields in this file'} onMode={setMode}
    onCopy={() => void navigator.clipboard.writeText(fields.map(({ key, value }) => `${key}: ${value}`).join('\n'))} onClose={onClose} />;
}
