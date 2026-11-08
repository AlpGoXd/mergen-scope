import { traceXGroup } from '../../domain/pane-placement';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { computeVerticalIntersections, computeHorizontalIntersections } from '../../domain/ref-lines';
import type { LineIntersection } from '../../domain/ref-lines';
import { getInterpolationOptionDisabledReason, getResolvedInterpolationStrategy } from '../../domain/interpolation';
import { placeMarker } from '../../domain/markers';
import { makeDefaultTouchstoneState } from '../../domain/touchstone/selections';
import { useTouchstoneState } from '../../hooks/use-touchstone-state';
import { useTheme } from '../../hooks/use-theme';
import { useTraceActions } from '../../hooks/use-trace-actions';
import { useFileDispatch, useFileState } from '../../stores/file-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { useMarkerDispatch, useMarkerState } from '../../stores/marker-store';
import { usePaneState } from '../../stores/pane-store';
import { useRefLineDispatch, useRefLineState } from '../../stores/ref-line-store';
import { useTraceDispatch, useTraceState } from '../../stores/trace-store';
import { useUiDispatch, useUiState } from '../../stores/ui-store';
import type { Dataset } from '../../types/dataset';
import type { RawFileRecord, FileMetadata, MetadataEntry } from '../../types/file';
import type { TouchstoneFamily, TouchstoneView } from '../../types/touchstone';
import type { Trace } from '../../types/trace';
import { PretextLabel } from '../shared/PretextLabel';
import { Sec } from '../shared/Sec';
import { TouchstoneMatrixPicker } from '../sidebar/TouchstoneMatrixPicker';
import { TraceRow } from '../sidebar/LiveTraceRow';
import { MarkerItem } from '../sidebar/LiveMarkerItem';
import { RefLineItem } from '../sidebar/LiveRefLineItem';
import { badgeStyle, formatWithUnit, sidebarButtonStyle } from '../sidebar/live-row-helpers';

const MATRIX_VIEWS_BY_FAMILY: Record<TouchstoneFamily, readonly TouchstoneView[]> = {
  S: ['dB', 'Mag', 'Phase', 'Real', 'Imag'],
  Y: ['Mag', 'Phase', 'Real', 'Imag'],
  Z: ['Mag', 'Phase', 'Real', 'Imag'],
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

export function Sidebar({ width = 300 }: { width?: number }) {
  const { files } = useFileState();
  const { allTraces, allKnownTraces, allDisplayTraces, vis } = useTraceState();
  const { markers, selectedMkrIdx } = useMarkerState();
  const { refLines, selectedRefLineId } = useRefLineState();
  const { selectedTraceName, showSidebar, showDetailedFiles, traceColors } = useUiState();
  const { panes, tracePaneMap, zoomAll, sharedZoom, paneXZooms } = usePaneState();

  const fileDispatch = useFileDispatch();
  const aggregate = useOptionalAggregateWorkspace();
  const markerDispatch = useMarkerDispatch();
  const refLineDispatch = useRefLineDispatch();
  const traceDispatch = useTraceDispatch();
  const uiDispatch = useUiDispatch();
  const { touchstoneStateByFileId, appendCell, setActiveFamily, setActiveView } = useTouchstoneState();
  const { selectTrace, removeTrace, toggleVisibility } = useTraceActions();
  const { colors } = useTheme();

  const [activeTabByFileId, setActiveTabByFileId] = useState<Record<string, 'matrix' | 'meta' | null>>({});
  const compactSidebar = files.length <= 1 && allTraces.length <= 1 && markers.length === 0 && refLines.length === 0;
  const effectiveWidth = compactSidebar ? Math.min(width, 248) : width;
  const sidebarMinWidth = compactSidebar ? '176px' : '200px';
  const sidebarMaxWidth = 'min(45vw, 560px)';
  const sidebarInnerGap = compactSidebar ? '5px' : '7px';
  const sidebarInnerPadding = compactSidebar ? '4px 4px 6px' : '5px 5px 7px';
  const fileCardPadding = compactSidebar ? '4px' : '5px';
  const fileCardGap = compactSidebar ? '3px' : '4px';
  const fileCardRadius = compactSidebar ? '8px' : '10px';

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
  const sourceDatasetsByFileId = useMemo<Record<string, Dataset[]>>(() => {
    return files.reduce<Record<string, Dataset[]>>((acc, file) => {
      acc[String(file.id)] = (file.datasets ?? []).filter((dataset) => dataset.kind === 'source');
      return acc;
    }, {});
  }, [files]);

  const resolveTraceColor = useMemo(() => {
    const rawPalette = colors?.tr ?? [];
    const derivedPalette = colors?.dr ?? [];

    return (trace: Trace, fallbackIndex: number): string => {
      const custom = traceColors[trace.name];
      if (custom) {
        return custom;
      }

      const sameKind = allTraces.filter((item) => item.kind === trace.kind);
      const kindIndex = sameKind.findIndex((item) => item.name === trace.name);
      const palette = trace.kind === 'derived' ? derivedPalette : rawPalette;
      const paletteIndex = kindIndex >= 0 ? kindIndex : fallbackIndex;
      return palette[paletteIndex % (palette.length || 1)] || 'var(--accent)';
    };
  }, [allTraces, colors?.dr, colors?.tr, traceColors]);

  // Removed toggleMetadata usage

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Sec first>Files</Sec>
          <button
            type="button"
            onClick={() => uiDispatch({ type: 'SET', payload: { key: 'showDetailedFiles', value: !showDetailedFiles } })}
            className={showDetailedFiles ? 'btn-active' : 'btn'}
          >
            {showDetailedFiles ? 'Compact' : 'Detailed'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {files.map((file) => {
            const fileId = String(file.id);
            const activeTab = activeTabByFileId[fileId] || null;
            const isMatrixTab = activeTab === 'matrix';
            const isMetaTab = activeTab === 'meta';
            const touchstoneState = touchstoneStateByFileId[fileId] ?? makeDefaultTouchstoneState(file);
            const activeFamily = touchstoneState.activeFamily;
            const activeView = touchstoneState.activeViewByFamily[activeFamily];
            const sourceDatasets = sourceDatasetsByFileId[fileId] ?? [];
            const visibleViewCount = (file.displayTraces ?? []).filter((displayTrace) => !displayTrace.hidden).length;
            const hiddenViewCount = (file.displayTraces ?? []).filter((displayTrace) => displayTrace.hidden).length;
            const hasMetadata = Object.keys(file.meta ?? {}).length > 0;
            const fileTags = getFileTags(file, sourceDatasets);
            const availableViews = MATRIX_VIEWS_BY_FAMILY[activeFamily];

            return (
              <div
                key={fileId}
                style={{
                  border: '1px solid color-mix(in srgb, var(--accent) 9%, var(--border))',
                  borderRadius: fileCardRadius,
                  padding: fileCardPadding,
                  background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, white), var(--card))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: fileCardGap,
                  minWidth: 0,
                }}
              >
                <FileTitleRow
                  fileName={file.fileName}
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

                {showDetailedFiles && (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={badgeStyle}>{visibleViewCount} views</span>
                    <span style={badgeStyle}>{sourceDatasets.length} datasets</span>
                    {fileTags.map((tag) => (
                      <span key={tag} style={badgeStyle}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {file.error && <div role="alert" title={file.error}>{file.error}</div>}

                {showDetailedFiles && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {file.touchstoneNetwork && (
                      <button
                        type="button"
                        onClick={() => setActiveTabByFileId((prev) => ({ ...prev, [fileId]: prev[fileId] === 'matrix' ? null : 'matrix' }))}
                        className={isMatrixTab ? 'btn-active' : 'btn'}
                        style={{ padding: compactSidebar ? '2px 6px' : '4px 8px', fontSize: 'var(--font-caption)' }}
                        title="Show network parameter tools"
                      >
                        Matrix
                      </button>
                    )}
                    {hasMetadata && (
                      <button
                        type="button"
                        onClick={() => setActiveTabByFileId((prev) => ({ ...prev, [fileId]: prev[fileId] === 'meta' ? null : 'meta' }))}
                        className={isMetaTab ? 'btn-active' : 'btn'}
                        style={{ padding: compactSidebar ? '2px 6px' : '4px 8px', fontSize: 'var(--font-caption)' }}
                      >
                        Meta
                      </button>
                    )}
                    {file.format === 'tabular' && (
                      <button
                        type="button"
                        onClick={() => fileDispatch({ type: 'RERUN_WIZARD', payload: { fileId, fileName: file.fileName } })}
                        className="btn"
                        style={{ padding: compactSidebar ? '2px 6px' : '4px 8px', fontSize: 'var(--font-caption)' }}
                        title="Open the import wizard again for this table"
                      >
                        Re-import
                      </button>
                    )}
                  </div>
                )}

                {showDetailedFiles && isMatrixTab && file.touchstoneNetwork && (
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
                      {(['S', 'Y', 'Z'] as const).map((family) => (
                        <button
                          key={family}
                          type="button"
                          onClick={() => setActiveFamily(fileId, family)}
                          className={touchstoneState.activeFamily === family ? 'btn-active' : 'btn'}
                          style={{ padding: '4px 8px', fontSize: 'var(--font-caption)' }}
                        >
                          {family}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gap: '3px' }}>
                      <span style={subsectionLabelStyle}>Append view</span>
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
                      </div>
                    </div>

                    <TouchstoneMatrixPicker
                      portCount={file.touchstoneNetwork.portCount}
                      family={activeFamily}
                      view={activeView}
                      cellColors={(() => {
                        const cellPattern = `${activeFamily}`;
                        const map: Record<string, string> = {};
                        allTraces.forEach((trace, index) => {
                          if (displayTraceLocationByLegacyName.get(trace.name)?.fileId !== fileId) return;
                          const match = trace.name.match(new RegExp(`_${cellPattern}(\\d+)(\\d+)_`));
                          if (!match) return;
                          const key = `${match[1]}:${match[2]}`;
                          if (!map[key]) map[key] = resolveTraceColor(trace, index);
                        });
                        return map;
                      })()}
                      onToggle={(row, col, view) => appendCell(fileId, activeFamily, row + 1, col + 1, view)}
                    />
                  </div>
                )}

                {showDetailedFiles && hasMetadata && isMetaTab && <MetadataPanel meta={file.meta} compact={compactSidebar} />}

                {showDetailedFiles && hiddenViewCount > 0 && (
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
          {files.length === 0 && <SidebarEmpty text="No files loaded." compact={compactSidebar} />}
        </div>

        <PanelSection title="Traces" compact={compactSidebar}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr) auto auto auto auto', columnGap: '5px', rowGap: '2px' }}>
            {allTraces.length > 0 && !compactSidebar && effectiveWidth >= 230 && (
              <div style={{
                display: 'grid',
                gridColumn: '1 / -1',
                gridTemplateColumns: 'subgrid',
                alignItems: 'center',
                padding: '0 6px',
                marginBottom: '1px',
              }}>
                <span />
                <span />
                <span style={headerCellStyle} title="Display name of the trace">Trace</span>
                <span style={headerCellStyle} title="Which chart pane this trace is displayed in (P1, P2, …)">Pane</span>
                <span style={headerCellStyle} title="How marker values are read between data points&#10;Snap — nearest sample&#10;Linear — straight line between samples&#10;Sinc — bandlimited reconstruction (uniform data only)">Interp</span>
                <span style={headerCellStyle} title="r = Raw — imported directly from a file&#10;d = Derived — computed from one or more raw traces">Kind</span>
                <span />
              </div>
            )}
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
                  isVisible={!!vis[trace.name]}
                  isSelected={selectedTraceName === trace.name}
                  paneId={tracePaneMap[trace.name]?.[0]}
                  traceColor={traceColor}
                  onSelect={() => selectTrace(trace.name)}
                  onRemove={() => removeTrace(trace)}
                  onToggle={() => toggleVisibility(trace.name)}
                  onColorChange={(color) => {
                    const next = { ...traceColors, [trace.name]: color };
                    uiDispatch({ type: 'SET', payload: { key: 'traceColors', value: next } });
                  }}
                  interpolation={effectiveInterpolation}
                  sincDisabledReason={sincDisabledReason}
                  onInterpolationChange={(interpolation) => {
                    const nextTrace = { ...trace, interpolation };
                    markers.forEach((marker, markerIndex) => {
                      if (marker.trace !== trace.name) {
                        return;
                      }
                      const placement = placeMarker(nextTrace, marker.requestedFreq ?? marker.freq);
                      markerDispatch({
                        type: 'UPDATE_MARKER',
                        payload: {
                          idx: markerIndex,
                          updates: {
                            requestedFreq: placement.requestedFreq,
                            freq: placement.freq,
                            amp: placement.amp,
                            interpolated: placement.interpolated,
                          },
                        },
                      });
                    });

                    if (trace.kind === 'derived') {
                      traceDispatch({ type: 'SET_DERIVED_INTERPOLATION', payload: { traceId: trace.id, interpolation } });
                      return;
                    }
                    if (!displayTraceLocation) {
                      return;
                    }
                    fileDispatch({
                      type: 'SET_DISPLAY_TRACE_INTERPOLATION',
                      payload: {
                        fileId: displayTraceLocation.fileId,
                        displayTraceId: displayTraceLocation.displayTraceId,
                        interpolation,
                      },
                    });
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
            {allTraces.length === 0 && <SidebarEmpty text="No traces loaded." compact={compactSidebar} />}
          </div>
        </PanelSection>

        {markers.length > 0 && (
          <PanelSection 
            title="Markers" 
            compact={compactSidebar}
            rightElement={
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); markerDispatch({ type: 'CLEAR_ALL' }); }}
                style={{ fontSize: 'var(--font-caption)', color: 'var(--accent)', textDecoration: 'none' }}
              >
                Clear All
              </a>
            }
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
                    onSelect={() => markerDispatch({ type: 'SET_SELECTED_IDX', payload: index })}
                    onRemove={() => markerDispatch({ type: 'REMOVE_MARKER', payload: index })}
                    compact={compactSidebar}
                    paneNumber={paneNumber}
                    refMarker={refMarker}
                    allMarkers={markers}
                    onUpdateRefIdx={(refIdx) => {
                      markerDispatch({
                        type: 'UPDATE_MARKER',
                        payload: {
                          idx: index,
                          updates: { refId: refIdx != null ? markers[refIdx]?.id ?? null : null, type: refIdx != null && markers[refIdx] ? 'delta' : 'normal' },
                        },
                      });
                    }}
                    onUpdateFreq={(freq) => {
                      if (!trace) {
                        return;
                      }
                      const placement = placeMarker(trace, freq);
                      markerDispatch({
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
                      });
                    }}
                  />
                );
              })}
            </div>
          </PanelSection>
        )}

        {refLines.length > 0 && (
          <PanelSection title="Reference Lines" compact={compactSidebar}>
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
                        onSelect={() => {
                          refLineDispatch({ type: 'SET_SELECTED', payload: refLine.id });
                          markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
                        }}
                        onRemove={() => {
                          if (refLine.groupId) {
                            // Remove all lines in the group
                            refLines
                              .filter((l) => l.groupId === refLine.groupId)
                              .forEach((l) => refLineDispatch({ type: 'REMOVE_LINE', payload: l.id }));
                          } else {
                            refLineDispatch({ type: 'REMOVE_LINE', payload: refLine.id });
                          }
                        }}
                        onLock={() => { const groupFor = (paneId: string) => { const members=allKnownTraces.filter(trace=>tracePaneMap[trace.name]?.includes(paneId)); const groups=members.map(traceXGroup); return groups.length && groups[0] && groups.every(group=>group===groups[0]) ? groups[0] : null; }; const group=refLine.paneId ? groupFor(refLine.paneId) : null; if (group) refLineDispatch({ type: 'LOCK_LINE', payload: { lineId: refLine.id, allPaneIds: panes.filter(pane=>groupFor(pane.id)===group).map(pane=>pane.id) } }); }}
                        onUnlock={() => refLineDispatch({ type: 'UNLOCK_LINE', payload: { lineId: refLine.id } })}
                        onUpdateValue={(value) => {
                          if (refLine.groupId) {
                            refLineDispatch({ type: 'MOVE_GROUP', payload: { groupId: refLine.groupId, value } });
                          } else {
                            refLineDispatch({ type: 'UPDATE_LINE', payload: { id: refLine.id, updates: { value } } });
                          }
                        }}
                        siblingLines={refLines.filter(l => l.type === refLine.type && l.paneId === refLine.paneId && l.id !== refLine.id)}
                        onUpdateDeltaPartner={(partnerId) => refLineDispatch({ type: 'UPDATE_LINE', payload: { id: refLine.id, updates: { deltaPartnerId: partnerId } } })}
                        selectedTrace={selectedTrace}
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
          </PanelSection>
        )}
      </div>
    </div>
  );
}

function FileTitleRow({ fileName, compact = false, onRemove }: { fileName: string; compact?: boolean; onRemove: () => void }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: compact ? '4px' : '6px',
        alignItems: 'start',
        minWidth: 0,
      }}
    >
      <PretextLabel
        text={fileName}
        font="400 var(--font-body) system-ui"
        lineHeight="var(--lh-body)"
        maxLines={compact ? 4 : 5}
        style={{ fontSize: 'var(--font-body)', color: 'var(--text)', minWidth: 0 }}
        lineStyle={{ whiteSpace: 'normal' }}
      />
      <button
        type="button"
        onClick={onRemove}
        style={{ ...sidebarButtonStyle('#d76482', false, compact), lineHeight: '1.2', flexShrink: 0 }}
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

function PanelSection({ title, compact = false, children, rightElement }: { title: string; compact?: boolean; children: ReactNode; rightElement?: ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid color-mix(in srgb, var(--accent) 10%, var(--border))',
        borderRadius: compact ? '8px' : '10px',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, white), var(--card))',
        padding: compact ? '4px 5px 5px' : '5px 6px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '3px' : '4px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Sec>{title}</Sec>
        {rightElement}
      </div>
      {children}
    </div>
  );
}

function getFileTags(file: RawFileRecord, sourceDatasets: readonly Dataset[]): string[] {
  const tags = new Set<string>();
  sourceDatasets.forEach((dataset) => {
    if (dataset.family === 'spectrum') tags.add('Spectrum');
    if (dataset.family === 'waveform') tags.add('Waveform');
    if (dataset.family === 'network') tags.add('Network');
  });
  if (file.touchstoneNetwork) {
    tags.add('Touchstone');
  }
  return [...tags];
}

function metadataEntryToDisplay(entry: MetadataEntry): string {
  if (typeof entry === 'string') {
    return entry;
  }
  return formatWithUnit(entry.value, entry.unit);
}

function MetadataPanel({ meta, compact = false }: { meta: FileMetadata; compact?: boolean }) {
  const entries = useMemo(() => Object.entries(meta), [meta]);
  if (entries.length === 0) {
    return null;
  }

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
      <div style={subsectionLabelStyle}>Metadata</div>
      {entries.map(([key, value]) => (
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
