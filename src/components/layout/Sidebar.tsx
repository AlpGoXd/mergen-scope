import { makeTraceColorResolver } from '../../domain/trace-colors';
import { canPlaceMembership, traceXGroup } from '../../domain/pane-placement';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { computeVerticalIntersections, computeHorizontalIntersections } from '../../domain/ref-lines';
import type { LineIntersection } from '../../domain/ref-lines';
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
import { useUiDispatch, useUiState } from '../../stores/ui-store';
import type { FileMetadata, MetadataEntry } from '../../types/file';
import type { TouchstoneFamily, TouchstoneView } from '../../types/touchstone';
import type { Trace } from '../../types/trace';
import { PretextLabel } from '../shared/PretextLabel';
import { TouchstoneMatrixPicker } from '../sidebar/TouchstoneMatrixPicker';
import { TraceRow } from '../sidebar/LiveTraceRow';
import { MarkerItem } from '../sidebar/LiveMarkerItem';
import { RefLineItem } from '../sidebar/LiveRefLineItem';
import { badgeStyle, formatWithUnit, sidebarButtonStyle } from '../sidebar/live-row-helpers';

const MATRIX_VIEWS_BY_FAMILY: Record<TouchstoneFamily, readonly TouchstoneView[]> = {
  S: ['dB', 'Mag', 'Phase', 'Real', 'Imag'],
  Y: ['Mag', 'Phase', 'Real', 'Imag'],
  Z: ['Mag', 'Phase', 'Real', 'Imag'],
  ABCD: ['Mag', 'Phase', 'Real', 'Imag'],
};

const headerCellStyle: CSSProperties = {
  fontSize: 'var(--font-caption)',
  lineHeight: 'var(--lh-caption)',
  color: 'var(--muted)',
  userSelect: 'none',
};

const subsectionLabelStyle: CSSProperties = {
  fontSize: 'var(--font-caption)',
  fontWeight: 500,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

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
  const { markers, selectedMkrIdx } = useMarkerState();
  const { refLines, selectedRefLineId } = useRefLineState();
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
  const { colors, theme } = useTheme();

  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [expandedByFileId, setExpandedByFileId] = useState<Record<string, { matrix?: boolean; meta?: boolean }>>({});
  const compactSidebar = files.length <= 1 && allTraces.length <= 1 && markers.length === 0 && refLines.length === 0;
  const effectiveWidth = width;
  const sidebarMinWidth = '220px';
  const sidebarMaxWidth = 'min(45vw, 420px)';
  const sidebarInnerGap = compactSidebar ? '5px' : '7px';
  const sidebarInnerPadding = compactSidebar ? '4px 4px 6px' : '5px 5px 7px';
  const fileCardPadding = '4px';
  const fileCardGap = compactSidebar ? '3px' : '4px';
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

  const resolveTraceColor = useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const sourcePalette = Array.from({ length: 8 }, (_, index) => styles.getPropertyValue(`--tr${index}`).trim());
    const derivedPalette = Array.from({ length: 8 }, (_, index) => styles.getPropertyValue(`--dr${index}`).trim());
    const resolve = makeTraceColorResolver(allKnownTraces, sourcePalette, derivedPalette, traceColors, theme);
    return (trace: Trace, _fallbackIndex: number) => resolve(trace);
  }, [allKnownTraces, colors, theme, traceColors]);

  // Removed toggleMetadata usage

  const changeMarker = (action: MarkerAction, message: string) => {
    if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: message, command: { slice: 'markers', action } });
    else markerDispatch(action);
  };
  const changeLine = (action: RefLineAction, message: string) => {
    if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: message, command: { slice: 'lines', action } });
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
    <div
      style={{
        width: `${effectiveWidth}px`,
        minWidth: sidebarMinWidth,
        maxWidth: sidebarMaxWidth,
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: sidebarInnerPadding,
          overflowY: 'auto',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: sidebarInnerGap,
        }}
      >
        <PanelSection title="Files" count={files.length} actions={[{ label: 'Close all files…', disabled: !files.length, run: () => {
          const actions = files.map(file => ({ slice: 'files' as const, action: { type: 'REMOVE_FILE' as const, payload: { fileId: String(file.id) } } }));
          if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: `Closed ${files.length} files`, command: { slice: 'transaction', actions } });
          else actions.forEach(item => fileDispatch(item.action));
        } }]} rightElement={
          <button type="button" className="btn" onClick={onOpenFiles} disabled={!onOpenFiles} title={onOpenFiles ? 'Open files' : 'Open files is available from the top bar'}>Open…</button>
        }>
          {files.map((file) => {
            const fileId = String(file.id);
            const isMatrixTab = !!file.matrixOpen;
            const isMetaTab = !!expandedByFileId[fileId]?.meta;
            const touchstoneState = touchstoneStateByFileId[fileId] ?? makeDefaultTouchstoneState(file);
            const activeFamily = touchstoneState.activeFamily;
            const activeView = touchstoneState.activeViewByFamily[activeFamily];
            const hiddenViewCount = (file.displayTraces ?? []).filter((displayTrace) => displayTrace.hidden).length;
            const availableViews = MATRIX_VIEWS_BY_FAMILY[activeFamily];

            const toggleMatrix = (row: number, col: number, view: TouchstoneView) => {
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
                          if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Added trace', command: { slice: 'transaction', actions: [{ slice: 'files', action: fileAction }, { slice: 'panes', action: paneAction, limit }] } });
                          else { appendCell(fileId, activeFamily, row + 1, col + 1, view); paneDispatch(paneAction); }
                          return;
                        }
                        const action = (tracePaneMap[trace.name] ?? []).includes(paneId)
                          ? { type: 'REMOVE_MEMBERSHIP' as const, payload: { traceName: trace.name, paneId } }
                          : { type: 'ADD_MEMBERSHIP' as const, payload: { trace, targetPaneId: paneId, allTraces: allKnownTraces, displayTraces: allDisplayTraces } };
                        if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Updated trace panes', command: { slice: 'panes', action, limit } });
                        else paneDispatch(action);
            };

            return (
              <div
                key={fileId}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: fileCardRadius,
                  padding: fileCardPadding,
                  background: 'var(--raised)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: fileCardGap,
                  minWidth: 0,
                }}
              >
                <FileTitleRow
                  fileName={file.fileName}
                  onReplace={onReplaceFile ? () => onReplaceFile(fileId) : undefined}
                  onRename={onRenameFile ? () => onRenameFile(fileId) : undefined}
                  onEdit={file.format === 'tabular' ? () => onEditColumns ? onEditColumns(fileId) : fileDispatch({ type: 'RERUN_WIZARD', payload: { fileId, fileName: file.fileName } }) : undefined}
                  onVisibility={(visible) => { const traces = allTraces.filter(item => displayTraceLocationByLegacyName.get(item.name)?.fileId === fileId); const actions = traces.map(item => ({ slice: 'traces' as const, action: { type: 'SET_VISIBILITY' as const, name: item.name, visible } })); if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: visible ? 'Showed file traces' : 'Hid file traces', command: { slice: 'transaction', actions } }); else actions.forEach(item => traceDispatch(item.action)); }}
                  onInfo={() => setExpandedByFileId(prev => ({ ...prev, [fileId]: { ...prev[fileId], meta: !prev[fileId]?.meta } }))}
                  compact={compactSidebar}
                  onRemove={() => {
                    const names = new Set([...file.traces.map(trace => trace.name), ...(file.displayTraces ?? []).map(display => display.compat?.legacyTraceName ?? display.id)]);
                    if (((file.displayTraces?.length ?? file.traces.length) > 1 || markers.some(marker => names.has(marker.trace))) && !window.confirm(`Remove ${file.fileName} and its traces?`)) return;
                    const action = {type:'REMOVE_FILE' as const,payload:{fileId}};
                    if (aggregate) aggregate.historyDispatch({type:'change',toastMessage:`Removed ${file.fileName}`,command:{slice:'files',action}});
                    else fileDispatch(action);
                  }}
                />

                {file.error && <div role="alert" title={file.error}>{file.error}</div>}

                {(
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {file.touchstoneNetwork && (
                      <button
                        type="button"
                        onClick={() => fileDispatch({ type: 'SET_MATRIX_OPEN', payload: { fileId, open: !isMatrixTab } })}
                        className={isMatrixTab ? 'btn-active' : 'btn'}
                        style={{ padding: compactSidebar ? '2px 6px' : '4px 8px', fontSize: 'var(--font-caption)' }}
                        aria-expanded={isMatrixTab}
                        title={isMatrixTab ? 'Hide network parameter tools' : 'Show network parameter tools'}
                      >
                        Matrix
                      </button>
                    )}
                    {(
                      <button
                        type="button"
                        onClick={() => setExpandedByFileId((prev) => ({ ...prev, [fileId]: { ...prev[fileId], meta: !prev[fileId]?.meta } }))}
                        className={isMetaTab ? 'btn-active' : 'btn'}
                        style={{ padding: compactSidebar ? '2px 6px' : '4px 8px', fontSize: 'var(--font-caption)' }}
                      >
                        Info
                      </button>
                    )}
                    {file.format === 'tabular' && (
                      <button
                        type="button"
                        onClick={() => onEditColumns ? onEditColumns(fileId) : fileDispatch({ type: 'RERUN_WIZARD', payload: { fileId, fileName: file.fileName } })}
                        className="btn"
                        style={{ padding: compactSidebar ? '2px 6px' : '4px 8px', fontSize: 'var(--font-caption)' }}
                        title="Edit columns for this table"
                      >
                        Edit columns…
                      </button>
                    )}
                  </div>
                )}

                {isMatrixTab && file.touchstoneNetwork && (
                  <div
                    style={{
                      display: 'grid',
                      gap: '6px',
                      padding: '6px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      background: 'var(--bg)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(['S', 'Y', 'Z', 'ABCD'] as const).map((family) => (
                        <button
                          key={family}
                          type="button"
                          disabled={family === 'ABCD' && file.touchstoneNetwork?.portCount !== 2}
                          title={family === 'ABCD' && file.touchstoneNetwork?.portCount !== 2 ? '2-port only' : family}
                          onClick={() => setActiveFamily(fileId, family)}
                          className={touchstoneState.activeFamily === family ? 'btn-active' : 'btn'}
                          style={{ padding: '4px 8px', fontSize: 'var(--font-caption)' }}
                        >
                          {family}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gap: '3px' }}>
                      <span style={subsectionLabelStyle}>Plot as</span>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {availableViews.map((view) => (
                          <button
                            key={view}
                            type="button"
                            onClick={() => setActiveView(fileId, activeFamily, view)}
                            className={activeView === view ? 'btn-active' : 'btn'}
                            style={{ padding: '4px 8px', fontSize: 'var(--font-caption)' }}
                          >
                            {view}
                          </button>
                        ))}
                        <select aria-label="More network views" value={['VSWR', 'Return loss', 'Group delay'].includes(activeView) ? activeView : ''} onChange={event => { if (event.target.value) setActiveView(fileId, activeFamily, event.target.value as TouchstoneView); }}><option value="">More…</option><option value="VSWR" disabled={activeFamily !== 'S'}>VSWR</option><option value="Return loss" disabled={activeFamily !== 'S'}>Return loss</option><option value="Group delay">Group delay</option></select>
                      </div>
                    </div>

                    {file.touchstoneNetwork.portCount >= 3 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(['All Sii', 'All Sij', 'Lower', 'Clear'] as const).map(pick => <button type="button" key={pick} onClick={() => {
                        const n = file.touchstoneNetwork?.portCount ?? 0;
                        if (!aggregate) return;
                        let candidate = aggregate.state;
                        const actions: Extract<WorkspaceAction, { slice: 'transaction' }>['actions'][number][] = [];
                        const apply = (action: typeof actions[number]) => { candidate = workspaceReducer(candidate, action); actions.push(action); };
                        const component = ({ dB: 'magnitude-db', Mag: 'magnitude-linear', Phase: 'phase', Real: 'real', Imag: 'imag', VSWR: 'vswr', 'Return loss': 'return-loss', 'Group delay': 'group-delay' } as const)[activeView];
                        const paneId = activePaneId ?? 'pane-1';
                        for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
                          if ((activeView === 'VSWR' || activeView === 'Return loss') && row !== col) continue;
                          const matches = pick === 'All Sii' ? row === col : pick === 'All Sij' ? row !== col : pick === 'Lower' ? row > col : true;
                          if (!matches) continue;
                          const currentFile = candidate.files.files.find(item => String(item.id) === fileId);
                          if (!currentFile) continue;
                          const projection = (currentFile.displayTraces ?? []).find(item => !item.hidden && item.source.sourceType === 'network-parameter' && item.source.parameterFamily === activeFamily && item.source.row === row && item.source.col === col && item.source.component === component);
                          let currentView = traceView(candidate.files, candidate.traces);
                          let trace = projection && currentView.allKnownTraces.find(item => item.name === (projection.compat?.legacyTraceName ?? projection.id));
                          const selected = !!trace && (candidate.panes.tracePaneMap[trace.name] ?? []).includes(paneId);
                          if (pick === 'Clear') {
                            if (trace && selected) apply({ slice: 'panes', limit, action: { type: 'REMOVE_MEMBERSHIP', payload: { traceName: trace.name, paneId } } });
                            continue;
                          }
                          if (selected) continue;
                          if (!trace) {
                            const nextFile = appendTouchstoneDisplayTrace(currentFile, touchstoneState, activeFamily, row + 1, col + 1, activeView);
                            const added = nextFile === currentFile ? undefined : nextFile.displayTraces?.at(-1);
                            const created = added && adaptDisplayTracesToLegacyTraces(nextFile.datasets ?? [], [added], nextFile)[0];
                            if (!created) continue;
                            const entries = currentView.allKnownTraces.map(item => ({ trace: item, paneIds: candidate.panes.tracePaneMap[item.name] ?? [], displayTrace: currentView.allDisplayTraces.find(display => display.id === item.id) }));
                            if (!canPlaceMembership({ trace: created, paneIds: [], displayTrace: added }, paneId, candidate.panes.panes, entries).allowed) continue;
                            apply({ slice: 'files', action: { type: 'APPEND_TOUCHSTONE_VIEW', payload: { fileId, family: activeFamily, row: row + 1, col: col + 1, view: activeView } } });
                            currentView = traceView(candidate.files, candidate.traces);
                            trace = currentView.allKnownTraces.find(item => item.id === created.id);
                          }
                          if (trace) apply({ slice: 'panes', limit, action: { type: 'ADD_MEMBERSHIP', payload: { trace, targetPaneId: paneId, allTraces: currentView.allKnownTraces, displayTraces: currentView.allDisplayTraces } } });
                        }
                        if (actions.length) aggregate.historyDispatch({ type: 'change', toastMessage: `${pick} matrix views`, command: { slice: 'transaction', actions } });
                      }} disabled={!aggregate} title={!aggregate ? 'Batch actions require workspace history' : pick}>{pick === 'Lower' ? 'Lower \u25e3' : pick}</button>)}
                    </div>}
                    <TouchstoneMatrixPicker
                      portCount={file.touchstoneNetwork.portCount}
                      family={activeFamily}
                      view={activeView}
                      cellColors={(() => {
                        const map: Record<string, string> = {};
                        const component = ({ dB: 'magnitude-db', Mag: 'magnitude-linear', Phase: 'phase', Real: 'real', Imag: 'imag', VSWR: 'vswr', 'Return loss': 'return-loss', 'Group delay': 'group-delay' } as const)[activeView];
                        for (const display of file.displayTraces ?? []) {
                          const source = display.source;
                          if (display.hidden || source.sourceType !== 'network-parameter' || source.parameterFamily !== activeFamily || source.component !== component) continue;
                          const name = display.compat?.legacyTraceName ?? display.id;
                          if (!(tracePaneMap[name] ?? []).includes(activePaneId ?? 'pane-1')) continue;
                          const trace = allTraces.find(item => item.name === name);
                          if (trace) map[`${source.row + 1}:${source.col + 1}`] = resolveTraceColor(trace, allTraces.indexOf(trace));
                        }
                        return map;
                      })()}
                      otherCells={(() => {
                        const cells = new Set<string>();
                        const component = ({ dB: 'magnitude-db', Mag: 'magnitude-linear', Phase: 'phase', Real: 'real', Imag: 'imag', VSWR: 'vswr', 'Return loss': 'return-loss', 'Group delay': 'group-delay' } as const)[activeView];
                        for (const display of file.displayTraces ?? []) {
                          const source = display.source;
                          if (display.hidden || source.sourceType !== 'network-parameter' || source.parameterFamily !== activeFamily) continue;
                          const name = display.compat?.legacyTraceName ?? display.id;
                          const memberships = tracePaneMap[name] ?? [];
                          if (memberships.some(id => id !== activePaneId) || (memberships.length && source.component !== component)) cells.add(`${source.row + 1}:${source.col + 1}`);
                        }
                        return cells;
                      })()}
                      disabledReason={(row, col) => (activeView === 'VSWR' || activeView === 'Return loss') && row !== col ? 'Reflection parameters only' : undefined}
                      onToggle={toggleMatrix}
                    />
                  </div>
                )}

                {isMetaTab && <MetadataPanel meta={file.meta} raw={rawFileData[fileId] ?? ''} compact={compactSidebar} />}

                {!file.touchstoneNetwork && hiddenViewCount > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: '6px',
                      minWidth: 0,
                    }}
                  >
                    <PretextLabel
                      text={`${hiddenViewCount} hidden ${hiddenViewCount === 1 ? 'view' : 'views'}`}
                      font="400 var(--font-label) system-ui"
                      lineHeight="var(--lh-label)"
                      maxLines={3}
                      style={{ fontSize: 'var(--font-label)', color: 'var(--dim)', minWidth: 0 }}
                      lineStyle={{ whiteSpace: 'normal' }}
                    />
                    <button
                      type="button"
                      onClick={() => fileDispatch({ type: 'SHOW_ALL_DISPLAY_TRACES', payload: { fileId } })}
                      className="btn"
                      style={{ padding: '2px 8px', fontSize: 'var(--font-caption)' }}
                    >
                      Restore
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {files.length === 0 && <div onDragOver={onDropFiles ? event => event.preventDefault() : undefined} onDrop={onDropFiles ? event => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.files.length) onDropFiles(event.dataTransfer.files); } : undefined} style={{ minHeight: 210, border: '1px dashed var(--border-strong)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, color: 'var(--text-muted)', textAlign: 'center' }}><strong style={{ color: 'var(--text)' }}>Drop files here</strong><span>.s1p ... .sNp ? .dat ? .csv ? .txt</span><div style={{ display: 'flex', gap: 4 }}><button type="button" disabled={!onOpenFiles} title={!onOpenFiles ? 'Open is available from the main file control' : 'Open files'} onClick={onOpenFiles}>Open…</button><button type="button" disabled={!onLoadDemo} title={!onLoadDemo ? 'Demo loading is not connected yet' : 'Load demo'} onClick={onLoadDemo}>Load demo</button></div><span>Files are read in this browser; nothing is uploaded.</span></div>}
        </PanelSection>

        {files.length > 0 && <>
        <PanelSection title="Traces" count={allTraces.length} actions={[
          ...([true, false] as const).map(visible => ({ label: visible ? 'Show all' : 'Hide all', disabled: !allTraces.length, run: () => { const actions = allTraces.map(trace => ({ slice: 'traces' as const, action: { type: 'SET_VISIBILITY' as const, name: trace.name, visible } })); if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: visible ? 'Showed all traces' : 'Hid all traces', command: { slice: 'transaction', actions } }); else actions.forEach(item => traceDispatch(item.action)); } })),
        ]}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr) auto auto auto auto', columnGap: '5px', rowGap: '2px' }}>
            {allTraces.length > 0 && <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '0 32px', ...headerCellStyle }}><span>Name</span><span>Interp</span><span>Pane</span></div>}
            {allTraces.map((trace, index) => {
              const traceColor = resolveTraceColor(trace, index);
              const isBackedByDisplayTrace = visibleDisplayTraces.some(
                (displayTrace) => (displayTrace.compat?.legacyTraceName ?? displayTrace.id) === trace.name,
              );
              const displayTraceLocation = displayTraceLocationByLegacyName.get(trace.name) ?? null;
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

              return (
                <TraceRow
                  key={trace.id || trace.name}
                  trace={trace}
                  displayName={trace.dn}
                  subtitle={(() => { const display = allDisplayTraces.find(item => (item.compat?.legacyTraceName ?? item.id) === trace.name); const source = display?.source; return source?.sourceType === 'network-parameter' ? `${source.parameterFamily}${source.row + 1}${source.col + 1} · ${display?.label.split(' ').pop() ?? ''}` : source?.sourceType === 'series' ? trace.dn : undefined; })()}
                  isVisible={!!vis[trace.name]}
                  isSelected={selectedTraceName === trace.name}
                  paneIds={tracePaneMap[trace.name] ?? []}
                  panes={panes.map((pane, paneIndex) => {
                    const entries = allKnownTraces.map(item => ({ trace: item, paneIds: tracePaneMap[item.name] ?? [], displayTrace: allDisplayTraces.find(display => display.id === item.id) }));
                    const entry = entries.find(item => item.trace.name === trace.name);
                    const result = entry && canPlaceMembership(entry, pane.id, panes, entries);
                    return { id: pane.id, title: pane.title || `Pane ${paneIndex + 1}`, disabledReason: !(tracePaneMap[trace.name] ?? []).includes(pane.id) && result && !result.allowed ? result.reason : undefined };
                  })}
                  onTogglePane={(paneId) => {
                    const action = (tracePaneMap[trace.name] ?? []).includes(paneId)
                      ? { type: 'REMOVE_MEMBERSHIP' as const, payload: { traceName: trace.name, paneId } }
                      : { type: 'ADD_MEMBERSHIP' as const, payload: { trace, targetPaneId: paneId, allTraces: allKnownTraces, displayTraces: allDisplayTraces } };
                    if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Updated trace panes', command: { slice: 'panes', action, limit } });
                    else paneDispatch(action);
                  }}
                  traceColor={traceColor}
                  onSelect={() => selectTrace(trace.name)}
                  onRemove={() => { if (markers.some(marker => marker.trace === trace.name) && !window.confirm(`Remove ${trace.dn} and its markers?`)) return; removeTrace(trace); }}
                  onToggle={() => toggleVisibility(trace.name)}
                  onColorChange={(color) => {
                    const next = { ...traceColors, [trace.name]: color };
                    const action = { type: 'SET' as const, payload: { key: 'traceColors' as const, value: next } };
                    if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Changed trace color', command: { slice: 'ui', action } }); else uiDispatch(action);
                  }}
                  interpolation={effectiveInterpolation}
                  sincDisabledReason={sincDisabledReason}
                  onInterpolationChange={(interpolation) => {
                    const actions: Extract<WorkspaceAction, { slice: 'transaction' }>['actions'][number][] = [];
                    const nextTrace = { ...trace, interpolation };
                    markers.forEach((marker, idx) => {
                      if (marker.trace !== trace.name) return;
                      const placement = placeMarker(nextTrace, marker.requestedFreq ?? marker.freq);
                      actions.push({ slice: 'markers', action: { type: 'UPDATE_MARKER', payload: { idx, updates: { requestedFreq: placement.requestedFreq, freq: placement.freq, amp: placement.amp, interpolated: placement.interpolated } } } });
                    });
                    if (trace.kind === 'derived') actions.push({ slice: 'traces', action: { type: 'SET_DERIVED_INTERPOLATION', payload: { traceId: trace.id, interpolation } } });
                    else if (displayTraceLocation) actions.push({ slice: 'files', action: { type: 'SET_DISPLAY_TRACE_INTERPOLATION', payload: { fileId: displayTraceLocation.fileId, displayTraceId: displayTraceLocation.displayTraceId, interpolation } } });
                    else return;
                    if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Changed interpolation', command: { slice: 'transaction', actions } });
                    else actions.forEach(item => { if (item.slice === 'markers') markerDispatch(item.action); else if (item.slice === 'traces') traceDispatch(item.action); else if (item.slice === 'files') fileDispatch(item.action); });
                  }}
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
            {allTraces.length === 0 && <SidebarEmpty text="Open files to add traces." compact={compactSidebar} />}
          </div>
        </PanelSection>

          <PanelSection 
            title="Markers" 
            count={markers.length}
            actions={[{ label: 'Remove all', disabled: !markers.length, run: () => { const action = { type: 'CLEAR_ALL' as const }; if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Removed all markers', command: { slice: 'markers', action } }); else markerDispatch(action); } }]}
          >
            <div style={{ display: 'grid', gap: '4px' }}>
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
                    onSelect={() => { markerDispatch({ type: 'SET_SELECTED_IDX', payload: index }); selectTrace(marker.trace); }}
                    onRemove={() => changeMarker({ type: 'REMOVE_MARKER', payload: index }, 'Removed marker')}
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
            {markers.length === 0 && <SidebarEmpty text="Use the Markers tools to add markers." />}
          </PanelSection>

          <PanelSection title="Lines" count={refLines.filter((line, index) => !line.groupId || refLines.findIndex((other) => other.groupId === line.groupId) === index).length} actions={[{ label: 'Remove all', disabled: !refLines.length, run: () => {
            const actions = refLines.map(line => ({ slice: 'lines' as const, action: { type: 'REMOVE_LINE' as const, payload: line.id } }));
            if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: 'Removed all lines', command: { slice: 'transaction', actions } });
            else actions.forEach(item => refLineDispatch(item.action));
          } }]}>
            <div style={{ display: 'grid', gap: '4px' }}>
              {(() => {
                const selectedTrace = selectedTraceName ? allTraces.find((t) => t.name === selectedTraceName) ?? null : null;
                // Deduplicate locked groups: show only one entry per groupId (the selected one or first)
                const seenGroups = new Set<string>();
                return refLines
                  .filter((refLine) => {
                    if (!refLine.groupId) return true;
                    if (seenGroups.has(refLine.groupId)) return false;
                    seenGroups.add(refLine.groupId);
                    return true;
                  })
                  .map((refLine) => {
                    // Collect traces for this line's pane
                    const paneTraces = allTraces.filter((t) => tracePaneMap[t.name]?.includes(refLine.paneId ?? ''));
                    // For locked lines, also collect intersections from all panes in the group
                    let intersections: LineIntersection[];
                    if (refLine.groupId) {
                      const groupLines = refLines.filter((l) => l.groupId === refLine.groupId);
                      intersections = groupLines.flatMap((gl) => {
                        const gTraces = allTraces.filter((t) => tracePaneMap[t.name]?.includes(gl.paneId ?? ''));
                        return gl.type === 'v'
                          ? computeVerticalIntersections(gl.value, gTraces, gl.paneId ?? 'pane-1')
                          : computeHorizontalIntersections(gl.value, gTraces, gl.paneId ?? 'pane-1');
                      });
                    } else {
                      intersections = refLine.type === 'v'
                        ? computeVerticalIntersections(refLine.value, paneTraces, refLine.paneId ?? 'pane-1')
                        : computeHorizontalIntersections(refLine.value, paneTraces, refLine.paneId ?? 'pane-1');
                    }
                    return (
                      <RefLineItem
                        key={refLine.id}
                        refLine={refLine}
                        isSelected={selectedRefLineId === refLine.id ||
                          (refLine.groupId != null && refLines.some((l) => l.groupId === refLine.groupId && l.id === selectedRefLineId))}
                        intersections={intersections}
                        allPanes={panes}
                        linkedPaneIds={refLine.groupId ? refLines.filter(line => line.groupId === refLine.groupId).map(line => line.paneId).filter((id): id is string => !!id) : refLine.paneId ? [refLine.paneId] : []}
                        onList={onThresholdCrossings ? () => onThresholdCrossings(refLine.id) : undefined}
                        onSelect={() => {
                          refLineDispatch({ type: 'SET_SELECTED', payload: refLine.id });
                          markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
                        }}
                        onRemove={() => changeLine({ type: 'REMOVE_LINE', payload: refLine.id }, 'Removed line')}
                        onLock={() => { const groupFor = (paneId: string) => { const members=allKnownTraces.filter(trace=>tracePaneMap[trace.name]?.includes(paneId)); const groups=members.map(traceXGroup); return groups.length && groups[0] && groups.every(group=>group===groups[0]) ? groups[0] : null; }; const group=refLine.paneId ? groupFor(refLine.paneId) : null; if (group) changeLine({ type: 'LOCK_LINE', payload: { lineId: refLine.id, allPaneIds: panes.filter(pane=>groupFor(pane.id)===group).map(pane=>pane.id) } }, 'Linked line'); }}
                        onUnlock={() => changeLine({ type: 'UNLOCK_LINE', payload: { lineId: refLine.id } }, 'Unlinked line')}
                        onUpdateValue={(value) => {
                          if (refLine.groupId) changeLine({ type: 'MOVE_GROUP', payload: { groupId: refLine.groupId, value } }, 'Moved line');
                          else changeLine({ type: 'UPDATE_LINE', payload: { id: refLine.id, updates: { value } } }, 'Moved line');
                        }}
                        siblingLines={refLines.filter(l => l.type === refLine.type && l.paneId === refLine.paneId && l.id !== refLine.id)}
                        onUpdateDeltaPartner={(partnerId) => refLineDispatch({ type: 'UPDATE_LINE', payload: { id: refLine.id, updates: { deltaPartnerId: partnerId } } })}
                        selectedTrace={paneTraces.find(trace => trace.name === selectedTraceName) ?? paneTraces[0] ?? selectedTrace}
                        xSpan={getVisibleXSpanForPaneId(refLine.paneId)}
                        compact={compactSidebar}
                        colors={colors}
                        resolveTraceColor={(name) => {
                          const t = allTraces.find((tr) => tr.name === name);
                          return t ? resolveTraceColor(t, allTraces.indexOf(t)) : 'var(--accent)';
                        }}
                      />
                    );
                  });
              })()}
            </div>
            {refLines.length === 0 && <SidebarEmpty text="Use the Lines tools to add lines." />}
          </PanelSection>
        </>}
      </div>
    </div>
  );
}

function FileTitleRow({ fileName, compact = false, onRemove, onInfo, onReplace, onRename, onEdit, onVisibility }: { fileName: string; compact?: boolean; onRemove: () => void; onInfo: () => void; onReplace?: () => void; onRename?: () => void; onEdit?: () => void; onVisibility: (visible: boolean) => void }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
        gap: compact ? '4px' : '6px',
        alignItems: 'start',
        minWidth: 0,
      }}
    >
      <span style={{ ...badgeStyle, borderRadius: 4, fontFamily: 'var(--font-mono)', minWidth: 30, textAlign: 'center', padding: '1px 2px' }}>{fileName.split('.').pop()?.toUpperCase().slice(0, 4) ?? 'FILE'}</span>
      <span title={fileName} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName.length > 28 ? `${fileName.slice(0, 14)}…${fileName.slice(-11)}` : fileName}</span>
      <ActionMenu label={`Actions for ${fileName}`} actions={[{ label: 'Info', run: onInfo }, { label: 'Replace file…', disabled: !onReplace, run: () => onReplace?.() }, ...(onEdit ? [{ label: 'Edit columns…', run: onEdit }] : []), { label: 'Rename', disabled: !onRename, run: () => onRename?.() }, { label: 'Show all', run: () => onVisibility(true) }, { label: 'Hide all', run: () => onVisibility(false) }, { label: 'Remove file…', run: onRemove }]} />
      <button
        type="button"
        onClick={onRemove}
        style={{ ...sidebarButtonStyle('var(--text-muted)', false, compact), lineHeight: '1.2', flexShrink: 0 }}
        title="Remove file"
      >
        x
      </button>
    </div>
  );
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

type SidebarAction = { label: string; run: () => void; disabled?: boolean };
function ActionMenu({ label, actions }: { label: string; actions: SidebarAction[] }) {
  return <details style={{ position: 'relative' }}><summary aria-label={label} title={label} style={{ cursor: 'pointer', listStyle: 'none', padding: '0 5px' }}>⋯</summary><div style={{ position: 'absolute', zIndex: 10, right: 0, minWidth: 140, padding: 4, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px oklch(0 0 0 / .15)' }}>{actions.map(action => <button key={action.label} type="button" disabled={action.disabled} title={action.disabled ? 'Unavailable until the required data or integration is present' : action.label} onClick={event => { action.run(); event.currentTarget.closest('details')?.removeAttribute('open'); }} style={{ display: 'block', width: '100%', textAlign: 'left', whiteSpace: 'nowrap' }}>{action.label}</button>)}</div></details>;
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
  return (
    <section style={{ minWidth: 0 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 1, height: 26, display: 'flex', alignItems: 'center', gap: 4, background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>
        <button type="button" onClick={toggle} aria-expanded={!collapsed} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontWeight: 700 }}>
          {collapsed ? '▸' : '▾'} {title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{count}</span>
        </button>
        {rightElement}
        {actions.length > 0 && <ActionMenu label={`${title} actions`} actions={actions} />}
      </div>
      {!collapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>{children}</div>}
    </section>
  );
}

function metadataEntryToDisplay(entry: MetadataEntry): string {
  if (typeof entry === 'string') {
    return entry;
  }
  return formatWithUnit(entry.value, entry.unit);
}

function MetadataPanel({ meta, raw, compact = false }: { meta: FileMetadata; raw: string; compact?: boolean }) {
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

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: compact ? '4px 5px' : '5px 6px',
        background: 'var(--bg)',
        display: 'grid',
        gap: compact ? '3px' : '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><strong style={{ flex: 1 }}>Info</strong><button type="button" aria-pressed={mode === 'table'} onClick={() => setMode('table')}>Table</button><button type="button" aria-pressed={mode === 'raw'} onClick={() => setMode('raw')}>Raw</button><button type="button" onClick={() => void navigator.clipboard.writeText(mode === 'raw' ? rawHeader : entries.map(([key, value]) => `${key}: ${metadataEntryToDisplay(value)}`).join('\n'))}>Copy</button></div>
      {mode === 'raw' ? <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 200, overflow: 'auto', margin: 0 }}>{rawHeader || 'No header fields in this file'}</pre> : entries.length === 0 ? <SidebarEmpty text="No header fields in this file" /> : entries.map(([key, value]) => (
        <div
          key={key}
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'minmax(0, 64px) minmax(0, 1fr)' : 'minmax(0, 74px) minmax(0, 1fr)',
            gap: compact ? '4px' : '5px',
            alignItems: 'start',
          }}
        >
          <PretextLabel
            text={key}
            font="400 var(--font-caption) system-ui"
            lineHeight="var(--lh-caption)"
            maxLines={4}
            style={{ fontSize: 'var(--font-caption)', color: 'var(--muted)' }}
            lineStyle={{ whiteSpace: 'normal' }}
          />
          <PretextLabel
            text={metadataEntryToDisplay(value)}
            font="400 var(--font-label) var(--font-mono)"
            lineHeight="var(--lh-label)"
            maxLines={4}
            style={{ fontSize: 'var(--font-label)', color: 'var(--text)' }}
            lineStyle={{ whiteSpace: 'normal' }}
          />
        </div>
      ))}
    </div>
  );
}
