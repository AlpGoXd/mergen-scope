import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { formatAdaptiveXAxisValue, formatEngineeringValue, formatScalarWithUnit } from '../../domain/format';
import { getInterpolationOptionDisabledReason, getResolvedInterpolationStrategy } from '../../domain/interpolation';
import { placeMarker } from '../../domain/markers';
import { makeDefaultTouchstoneState } from '../../domain/touchstone/selections';
import { useTouchstoneState } from '../../hooks/use-touchstone-state';
import { useTheme } from '../../hooks/use-theme';
import { useTraceActions } from '../../hooks/use-trace-actions';
import { useFileDispatch, useFileState } from '../../stores/file-store';
import { useMarkerDispatch, useMarkerState } from '../../stores/marker-store';
import { usePaneState } from '../../stores/pane-store';
import { useRefLineDispatch, useRefLineState } from '../../stores/ref-line-store';
import { useTraceDispatch, useTraceState } from '../../stores/trace-store';
import { useUiDispatch, useUiState } from '../../stores/ui-store';
import type { InterpolationStrategy } from '../../types/interpolation';
import type { Dataset } from '../../types/dataset';
import type { RawFileRecord, WizardConfig, FileMetadata, MetadataEntry } from '../../types/file';
import type { Marker } from '../../types/marker';
import type { RefLine } from '../../types/ref-line';
import type { ThemeColors } from '../../types/theme';
import type { TouchstoneFamily, TouchstoneView } from '../../types/touchstone';
import type { Trace } from '../../types/trace';
import { MR } from '../shared/MR';
import { PretextLabel } from '../shared/PretextLabel';
import { Sec } from '../shared/Sec';
import { TouchstoneMatrixPicker } from '../sidebar/TouchstoneMatrixPicker';

const MATRIX_VIEWS_BY_FAMILY: Record<TouchstoneFamily, readonly TouchstoneView[]> = {
  S: ['dB', 'Mag', 'Phase', 'Real', 'Imag'],
  Y: ['Mag', 'Phase', 'Real', 'Imag'],
  Z: ['Mag', 'Phase', 'Real', 'Imag'],
};

const FREQUENCY_UNIT_SCALE: Record<string, number> = {
  hz: 1,
  khz: 1e3,
  mhz: 1e6,
  ghz: 1e9,
  thz: 1e12,
};

const TIME_UNIT_SCALE: Record<string, number> = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  ms: 1e-3,
  us: 1e-6,
  ns: 1e-9,
  ps: 1e-12,
};

const PREFIX_SCALE: Record<string, number> = {
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  K: 1e3,
  '': 1,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
};

const badgeStyle: CSSProperties = {
  fontSize: 'var(--font-caption)',
  color: 'var(--dim)',
  border: '1px solid color-mix(in srgb, var(--accent) 8%, var(--border))',
  borderRadius: '999px',
  padding: '0.08rem 0.42rem',
  lineHeight: 'var(--lh-caption)',
  background: 'rgba(255,255,255,0.78)',
};

const headerCellStyle: CSSProperties = {
  fontSize: 'var(--font-caption)',
  lineHeight: 'var(--lh-caption)',
  color: 'var(--muted)',
  userSelect: 'none',
};

const smallButtonBaseStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.98)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '0.22rem 0.58rem',
  fontSize: 'var(--font-label)',
  cursor: 'pointer',
  color: 'var(--text)',
  fontWeight: 400,
  lineHeight: 'var(--lh-label)',
  transition: 'all 0.15s ease-in-out',
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
  const { allTraces, allDisplayTraces, vis } = useTraceState();
  const { markers, selectedMkrIdx } = useMarkerState();
  const { refLines, selectedRefLineId } = useRefLineState();
  const { selectedTraceName, showSidebar, showDetailedFiles, traceColors } = useUiState();
  const { tracePaneMap, zoomAll, sharedZoom, paneXZooms } = usePaneState();

  const fileDispatch = useFileDispatch();
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

  const buildReimportConfig = (file: RawFileRecord): WizardConfig => {
    const firstTrace = file.traces[0];
    return {
      delimiter: ',',
      skipRows: 1,
      xCol: 0,
      yCols: [1],
      xMult: 1,
      yMult: 1,
      domain: firstTrace?.domain ?? 'frequency',
      confidence: 0,
      headers: [],
    };
  };

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

  const getVisibleTraceXSpan = (trace: Trace | null): number => {
    if (!trace) {
      return 1;
    }
    const paneId = tracePaneMap[trace.name] ?? 'pane-1';
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
                  onRemove={() => fileDispatch({ type: 'REMOVE_FILE', payload: { fileId } })}
                />

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
                    <button
                      type="button"
                      onClick={() =>
                        fileDispatch({
                          type: 'RERUN_WIZARD',
                          payload: {
                            fileId,
                            fileName: file.fileName,
                            previousConfig: buildReimportConfig(file),
                          },
                        })
                      }
                      className="btn"
                      style={{ padding: compactSidebar ? '2px 6px' : '4px 8px', fontSize: 'var(--font-caption)' }}
                    >
                      Re-import
                    </button>
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
                  paneId={tracePaneMap[trace.name]}
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
                const paneId = tracePaneMap[marker.trace] ?? 'pane-1';
                const paneNumber = parseInt(paneId.replace('pane-', ''), 10);

                const refMarker = marker.refIdx != null ? (markers[marker.refIdx] ?? null) : null;

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
                          updates: { refIdx, type: refIdx != null ? 'delta' : 'normal' },
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
              {refLines.map((refLine) => (
                <RefLineItem
                  key={refLine.id}
                  refLine={refLine}
                  isSelected={selectedRefLineId === refLine.id}
                  onSelect={() => refLineDispatch({ type: 'SET_SELECTED', payload: refLine.id })}
                  onRemove={() => refLineDispatch({ type: 'REMOVE_LINE', payload: refLine.id })}
                  selectedTrace={selectedTraceName ? allTraces.find((trace) => trace.name === selectedTraceName) ?? null : null}
                  compact={compactSidebar}
                  colors={colors}
                />
              ))}
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

function sidebarButtonStyle(color: string, active = false, compact = false): CSSProperties {
  return {
    ...smallButtonBaseStyle,
    border: `1px solid ${active ? color : `color-mix(in srgb, ${color} 62%, #9b8f7b)`}`,
    background: active
      ? `linear-gradient(180deg, color-mix(in srgb, ${color} 18%, white), color-mix(in srgb, ${color} 10%, white))`
      : `linear-gradient(180deg, rgba(255,255,255,0.98), color-mix(in srgb, ${color} 4%, white))`,
    color: active ? color : 'var(--text)',
    boxShadow: active
      ? `inset 0 1px 0 color-mix(in srgb, white 72%, ${color})`
      : `inset 0 1px 0 rgba(255,255,255,0.85)`,
    padding: compact ? '0.18rem 0.5rem' : '0.24rem 0.58rem',
    fontSize: 'var(--font-label)',
  };
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

function normalizeUnit(unit: string | null | undefined): string {
  return String(unit ?? '').trim().toLowerCase();
}

function metadataEntryToDisplay(entry: MetadataEntry): string {
  if (typeof entry === 'string') {
    return entry;
  }
  return formatWithUnit(entry.value, entry.unit);
}

function formatWithUnit(value: number, unit: string | null | undefined): string {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const normalized = normalizeUnit(unit);
  if (normalized in FREQUENCY_UNIT_SCALE) {
    const hz = value * FREQUENCY_UNIT_SCALE[normalized as keyof typeof FREQUENCY_UNIT_SCALE]!;
    return formatEngineeringValue(hz, 'Hz', 3);
  }

  if (normalized in TIME_UNIT_SCALE) {
    const seconds = value * TIME_UNIT_SCALE[normalized as keyof typeof TIME_UNIT_SCALE]!;
    return formatScalarWithUnit(seconds, 's', { digits: 3 });
  }

  return formatScalarWithUnit(value, unit, { digits: 3 });
}

function formatTraceXValue(value: number, trace: Trace | null, visibleSpan?: number): string {
  const hasVisibleSpan = Number.isFinite(visibleSpan) && (visibleSpan ?? 0) > 0;
  if (!trace) {
    return hasVisibleSpan
      ? formatAdaptiveXAxisValue(value, visibleSpan!, { domain: 'frequency', unit: 'Hz' })
      : formatEngineeringValue(value, 'Hz', 3);
  }
  if (!hasVisibleSpan) {
    if (trace.domain === 'frequency') {
      return formatEngineeringValue(value, 'Hz', 3);
    }
    return formatWithUnit(value, trace.units.x ?? 's');
  }
  return formatAdaptiveXAxisValue(value, visibleSpan!, {
    domain: trace.domain,
    unit: trace.units.x ?? (trace.domain === 'time' ? 's' : 'Hz'),
  });
}

function formatTraceYValue(value: number, trace: Trace | null): string {
  return formatWithUnit(value, trace?.units.y ?? null);
}

function formatRefLineValue(refLine: RefLine, selectedTrace: Trace | null): string {
  if (refLine.type === 'v') {
    return formatTraceXValue(refLine.value, selectedTrace);
  }
  return formatWithUnit(refLine.value, selectedTrace?.units.y ?? null);
}

function parseEngineeringInput(text: string, trace: Trace | null): number | null {
  const compact = text.trim().replace(/\s+/g, '').replace(/µ/g, 'u');
  if (!compact) {
    return null;
  }

  const match = compact.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([A-Za-z]*)$/);
  if (!match) {
    return null;
  }

  const rawValue = Number(match[1]);
  const rawSuffix = match[2] ?? '';
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const suffix = rawSuffix.trim();
  if (!suffix) {
    return rawValue;
  }

  const lower = suffix.toLowerCase();
  if (lower in FREQUENCY_UNIT_SCALE) {
    return rawValue * FREQUENCY_UNIT_SCALE[lower as keyof typeof FREQUENCY_UNIT_SCALE]!;
  }
  if (lower in TIME_UNIT_SCALE) {
    return rawValue * TIME_UNIT_SCALE[lower as keyof typeof TIME_UNIT_SCALE]!;
  }

  if (suffix in PREFIX_SCALE) {
    return rawValue * PREFIX_SCALE[suffix as keyof typeof PREFIX_SCALE]!;
  }

  const frequencyKey = lower + 'hz';
  if (trace?.domain === 'frequency' && frequencyKey in FREQUENCY_UNIT_SCALE) {
    return rawValue * FREQUENCY_UNIT_SCALE[frequencyKey as keyof typeof FREQUENCY_UNIT_SCALE]!;
  }

  const timeKey = lower + 's';
  if (trace?.domain === 'time' && timeKey in TIME_UNIT_SCALE) {
    return rawValue * TIME_UNIT_SCALE[timeKey as keyof typeof TIME_UNIT_SCALE]!;
  }

  return null;
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
function TraceRow(props: {
  trace: Trace;
  isVisible: boolean;
  isSelected: boolean;
  paneId?: string;
  traceColor: string;
  onSelect: () => void;
  onRemove: () => void;
  onToggle: () => void;
  onColorChange: (color: string) => void;
  interpolation: InterpolationStrategy;
  sincDisabledReason: string;
  onInterpolationChange: (interpolation: InterpolationStrategy) => void;
  compact?: boolean;
  removeLabel: string;
}) {
  const {
    trace,
    isVisible,
    isSelected,
    paneId,
    traceColor,
    onSelect,
    onRemove,
    onToggle,
    onColorChange,
    interpolation,
    sincDisabledReason,
    onInterpolationChange,
    compact = false,
    removeLabel,
  } = props;
  const selectTitle = sincDisabledReason || 'Trace interpolation';

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-mergen-trace', trace.name);
        e.dataTransfer.setData('text/plain', trace.name);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        display: 'grid',
        gridColumn: '1 / -1',
        gridTemplateColumns: 'subgrid',
        alignItems: 'center',
        minWidth: 0,
        padding: compact ? '2px 5px' : '3px 6px',
        borderRadius: compact ? '7px' : '8px',
        border: `1px solid ${isSelected ? traceColor : 'color-mix(in srgb, var(--accent) 8%, var(--border))'}`,
        background: isSelected
          ? `color-mix(in srgb, ${traceColor} 10%, white)`
          : 'rgba(255,255,255,0.78)',
        boxShadow: isSelected ? `inset 3px 0 0 ${traceColor}` : 'none',
        cursor: 'grab',
      }}
      onClick={onSelect}
      title={trace.dn}
    >
      <input
        type="checkbox"
        checked={isVisible}
        onChange={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        title={isVisible ? 'Hide trace' : 'Show trace'}
      />
      <input
        type="color"
        value={traceColor}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onColorChange(event.target.value)}
        title="Trace color"
        style={{
          width: compact ? '12px' : '14px',
          height: compact ? '12px' : '14px',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: 0,
          background: 'transparent',
          cursor: 'pointer',
        }}
      />
      <div style={{ minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span
          title={trace.dn}
          style={{
            fontSize: 'var(--font-label)',
            color: traceColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {trace.dn}
        </span>
        {trace.kind === 'derived' && (
          <span style={{ ...badgeStyle, borderColor: `color-mix(in srgb, ${traceColor} 30%, var(--border))`, color: traceColor, flexShrink: 0 }}>
            fx
          </span>
        )}
      </div>
      {paneId && <span style={badgeStyle}>{paneId.replace('pane-', 'P')}</span>}
      <select
        value={interpolation}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onInterpolationChange(event.target.value as InterpolationStrategy)}
        title={selectTitle}
        style={{
          background: 'rgba(255,255,255,0.98)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: '5px',
          fontSize: 'var(--font-caption)',
          lineHeight: 'var(--lh-caption)',
          padding: compact ? '0.18rem 0.28rem' : '0.22rem 0.34rem',
          minWidth: compact ? '58px' : '70px',
        }}
      >
        <option value="snap">Snap</option>
        <option value="linear">Linear</option>
        <option value="sinc" disabled={!!sincDisabledReason}>
          Sinc
        </option>
      </select>
      <span style={{ fontSize: 'var(--font-caption)', lineHeight: 'var(--lh-caption)', color: 'var(--dim)' }}>
        {trace.kind === 'derived' ? 'd' : 'r'}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        style={sidebarButtonStyle('#d76482', false, compact)}
        title={removeLabel}
      >
        x
      </button>
    </div>
  );
}

function MarkerItem(props: {
  marker: Marker;
  index: number;
  trace: Trace | null;
  traceColor: string;
  xSpan: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  compact?: boolean;
  onUpdateFreq: (freq: number) => void;
  paneNumber: number;
  refMarker?: Marker | null;
  allMarkers?: Marker[];
  onUpdateRefIdx?: (refIdx: number | null) => void;
}) {
  const { marker, index, trace, traceColor, xSpan, isSelected, onSelect, onRemove, compact = false, onUpdateFreq, paneNumber, refMarker = null, allMarkers = [], onUpdateRefIdx } = props;
  const roleLabel = marker.label ? ` - ${marker.label}` : '';
  const [freqText, setFreqText] = useState(() => formatTraceXValue(marker.freq, trace, xSpan));

  useEffect(() => {
    setFreqText(formatTraceXValue(marker.freq, trace, xSpan));
  }, [marker.freq, trace, xSpan]);

  const commitFreq = () => {
    const parsed = parseEngineeringInput(freqText, trace);
    if (parsed == null) {
      setFreqText(formatTraceXValue(marker.freq, trace, xSpan));
      return;
    }
    onUpdateFreq(parsed);
  };

  return (
    <div
      onClick={onSelect}
      style={{
        border: `1px solid ${isSelected ? traceColor : `color-mix(in srgb, ${traceColor} 20%, var(--border))`}`,
        borderRadius: compact ? '7px' : '8px',
        padding: compact ? '4px 5px' : '5px 6px',
        background: isSelected
          ? `color-mix(in srgb, ${traceColor} 14%, white)`
          : `color-mix(in srgb, ${traceColor} 6%, white)`,
        boxShadow: `inset 3px 0 0 ${traceColor}`,
        display: 'grid',
        gap: compact ? '3px' : '4px',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: compact ? '4px' : '6px', alignItems: 'start', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          <span
            title={`Marker ${index + 1}`}
            style={{
              ...badgeStyle,
              padding: '1px 6px',
              background: isSelected ? traceColor : 'rgba(255,255,255,0.94)',
              borderColor: traceColor,
              color: isSelected ? '#ffffff' : traceColor,
            }}
          >
            {marker.type === 'delta' ? `DM${index + 1}` : `M${index + 1}`}
          </span>
          <span
            title={`Pane ${paneNumber}`}
            style={{
              ...badgeStyle,
              padding: '1px 5px',
              background: 'transparent',
              borderColor: 'var(--border)',
              color: 'var(--muted)',
            }}
          >
            P{paneNumber}
          </span>
        </div>
        <div style={{ minWidth: 0, display: 'grid', gap: '1px' }}>
          <PretextLabel
            text={`${trace?.dn ?? marker.trace}${roleLabel}`}
            font="400 var(--font-label) system-ui"
            lineHeight="var(--lh-label)"
            maxLines={compact ? 3 : 4}
            style={{ fontSize: 'var(--font-label)', color: 'var(--text)', minWidth: 0 }}
            lineStyle={{ whiteSpace: 'normal' }}
          />
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          style={sidebarButtonStyle('#d76482', false, compact)}
          title="Remove marker"
        >
          x
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '18px minmax(0, 1fr)' : '24px minmax(0, 1fr)', gap: compact ? '4px' : '6px', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--font-caption)', lineHeight: 'var(--lh-caption)', color: 'var(--muted)' }}>X</span>
        <input
          value={freqText}
          onChange={(event) => setFreqText(event.target.value)}
          onBlur={commitFreq}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitFreq();
            }
            if (event.key === 'Escape') {
              setFreqText(formatTraceXValue(marker.freq, trace, xSpan));
            }
          }}
          onClick={(event) => event.stopPropagation()}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.98)',
            color: 'var(--text)',
            border: `1px solid color-mix(in srgb, ${traceColor} 25%, var(--border))`,
            borderRadius: '5px',
            fontSize: 'var(--font-label)',
            lineHeight: 'var(--lh-label)',
            padding: compact ? '0.2rem 0.38rem' : '0.24rem 0.46rem',
            minWidth: 0,
          }}
        />
      </div>

      <div style={{ display: 'grid', gap: '1px' }}>
        <MR label="Y" value={formatTraceYValue(marker.amp, trace)} vc={traceColor} />
      </div>

      {marker.type === 'delta' && (() => {
        const hasValidRefs = allMarkers.some((m, i) => m.type !== 'delta' && i !== index);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px', alignItems: 'start', borderTop: '1px solid color-mix(in srgb, var(--accent) 20%, var(--border))', paddingTop: compact ? '3px' : '4px' }}>
            {onUpdateRefIdx && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: 'var(--font-caption)', color: 'var(--accent)' }}>Ref</span>
                <select
                  value={marker.refIdx ?? ''}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    onUpdateRefIdx(v);
                  }}
                  style={{ fontSize: 'var(--font-caption)', padding: '2px 4px', borderRadius: '5px', border: '1px solid var(--accent)', background: 'var(--bg)', color: 'var(--accent)' }}
                >
                  {!hasValidRefs && <option value="">None</option>}
                  {allMarkers.map((m, i) => m.type !== 'delta' && i !== index ? (
                    <option key={i} value={i}>M{i + 1}</option>
                  ) : null)}
                </select>
              </div>
            )}
            <div style={{ display: 'grid', gap: '1px' }}>
              <MR label="ΔF" value={refMarker ? formatTraceXValue(marker.freq - refMarker.freq, trace, xSpan) : '0'} vc="var(--accent)" />
              <MR label="ΔA" value={refMarker ? formatTraceYValue(marker.amp - refMarker.amp, trace) : '0'} vc="var(--accent)" />
            </div>
          </div>
        );
      })()}

      <div style={{ fontSize: 'var(--font-caption)', lineHeight: 'var(--lh-caption)', color: 'var(--dim)' }}>
        {marker.interpolated ? 'interp' : 'snap'}
      </div>
    </div>
  );
}

function RefLineItem(props: {
  refLine: RefLine;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  selectedTrace: Trace | null;
  compact?: boolean;
  colors?: ThemeColors | null;
}) {
  const { refLine, isSelected, onSelect, onRemove, selectedTrace, compact = false, colors } = props;
  const accentColor = refLine.type === 'v' ? (colors?.refV ?? '#d48a2b') : (colors?.refH ?? '#2b9ab7');
  const label = refLine.label?.trim() || `${refLine.type === 'v' ? 'V' : 'H'} line ${refLine.id}`;

  return (
    <div
      onClick={onSelect}
      style={{
        border: `1px solid ${isSelected ? accentColor : `color-mix(in srgb, ${accentColor} 18%, var(--border))`}`,
        borderRadius: compact ? '7px' : '8px',
        padding: compact ? '4px 5px' : '5px 6px',
        background: isSelected
          ? `color-mix(in srgb, ${accentColor} 12%, white)`
          : `color-mix(in srgb, ${accentColor} 5%, white)`,
        boxShadow: `inset 3px 0 0 ${accentColor}`,
        display: 'grid',
        gap: compact ? '2px' : '3px',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: compact ? '4px' : '6px', alignItems: 'start', minWidth: 0 }}>
        <span style={{ ...badgeStyle, borderColor: accentColor, color: accentColor }}>{refLine.type.toUpperCase()}</span>
        <PretextLabel
          text={label}
          font="400 var(--font-label) system-ui"
          lineHeight="var(--lh-label)"
          maxLines={compact ? 3 : 4}
          style={{ fontSize: 'var(--font-label)', color: 'var(--text)', minWidth: 0 }}
          lineStyle={{ whiteSpace: 'normal' }}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          style={sidebarButtonStyle('#d76482', false, compact)}
          title="Remove reference line"
        >
          x
        </button>
      </div>
      <MR label="Value" value={formatRefLineValue(refLine, selectedTrace)} vc={accentColor} />
    </div>
  );
}



