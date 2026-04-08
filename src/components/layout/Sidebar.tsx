import { useMemo, useRef, useState } from 'react';
import { useTraceState } from '../../stores/trace-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { usePaneState } from '../../stores/pane-store';
import { useFileState, useFileDispatch } from '../../stores/file-store';
import { useTouchstoneState } from '../../hooks/use-touchstone-state';
import { useTraceActions } from '../../hooks/use-trace-actions';
import { useTheme } from '../../hooks/use-theme';
import { Sec } from '../shared/Sec';
import { MR } from '../shared/MR';
import { TouchstoneMatrixPicker } from '../sidebar/TouchstoneMatrixPicker';
import { makeDefaultTouchstoneState } from '../../domain/touchstone/selections';
import type { Trace } from '../../types/trace';
import type { Marker } from '../../types/marker';
import type { RefLine } from '../../types/ref-line';
import type { RawFileRecord, WizardConfig, FileMetadata, MetadataEntry } from '../../types/file';
import type { TouchstoneFamily, TouchstoneView } from '../../types/touchstone';
import type { Dataset } from '../../types/dataset';

const MATRIX_VIEWS_BY_FAMILY: Record<TouchstoneFamily, readonly TouchstoneView[]> = {
  S: ['dB', 'Mag', 'Phase', 'Real', 'Imag'],
  Y: ['Mag', 'Phase', 'Real', 'Imag'],
  Z: ['Mag', 'Phase', 'Real', 'Imag'],
};

export function Sidebar() {
  const { files } = useFileState();
  const { allTraces, allDatasets, allDisplayTraces, vis } = useTraceState();
  const { markers, selectedMkrIdx } = useMarkerState();
  const { refLines, selectedRefLineId } = useRefLineState();
  const { selectedTraceName, showSidebar, showMeta, showDetailedFiles, traceColors } = useUiState();
  const { tracePaneMap } = usePaneState();

  const fileDispatch = useFileDispatch();
  const markerDispatch = useMarkerDispatch();
  const refLineDispatch = useRefLineDispatch();
  const uiDispatch = useUiDispatch();
  const { touchstoneStateByFileId, appendCell, setActiveFamily, setActiveView } = useTouchstoneState();
  const [expandedTouchstoneFileId, setExpandedTouchstoneFileId] = useState<string | null>(null);
  const [showDerivedDatasets, setShowDerivedDatasets] = useState(false);
  const [expandedMetadataByFileId, setExpandedMetadataByFileId] = useState<Record<string, boolean>>({});

  const { selectTrace, removeTrace, toggleVisibility } = useTraceActions();
  const { colors } = useTheme();

  const visibleDisplayTraces = allDisplayTraces.filter((displayTrace) => !displayTrace.hidden);
  const derivedDatasets = allDatasets.filter((dataset) => dataset.kind === 'derived');
  const sourceDatasetsByFileId = files.reduce<Record<string, Dataset[]>>((acc, file) => {
    acc[String(file.id)] = (file.datasets ?? []).filter((dataset) => dataset.kind === 'source');
    return acc;
  }, {});

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

  const toggleMetadata = (fileId: string) => {
    setExpandedMetadataByFileId((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  if (!showSidebar) return null;

  return (
    <div
      style={{
        width: '260px',
        minWidth: 0,
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{ padding: '12px', overflowY: 'auto', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Sec first>Files</Sec>
          <button
            type="button"
            onClick={() => uiDispatch({ type: 'SET', payload: { key: 'showDetailedFiles', value: !showDetailedFiles } })}
            style={{ ...smallButtonStyle, ...(showDetailedFiles ? activeSmallButtonStyle('#e6b6c8') : null) }}
          >
            {showDetailedFiles ? 'Compact' : 'Detailed'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {files.map((file) => {
            const fileId = String(file.id);
            const isExpanded = expandedTouchstoneFileId === fileId;
            const touchstoneState = touchstoneStateByFileId[fileId] ?? makeDefaultTouchstoneState(file);
            const activeFamily = touchstoneState.activeFamily;
            const activeView = touchstoneState.activeViewByFamily[activeFamily];
            const sourceDatasets = sourceDatasetsByFileId[fileId] ?? [];
            const visibleViewCount = (file.displayTraces ?? []).filter((displayTrace) => !displayTrace.hidden).length;
            const hiddenViewCount = (file.displayTraces ?? []).filter((displayTrace) => displayTrace.hidden).length;
            const hasMetadata = Object.keys(file.meta ?? {}).length > 0;
            const isMetadataExpanded = !!expandedMetadataByFileId[fileId];
            const fileTags = getFileTags(file, sourceDatasets);
            const availableViews = MATRIX_VIEWS_BY_FAMILY[activeFamily];

            return (
              <div key={fileId} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: 'var(--card)', minWidth: 0 }}>
                <div style={{ display: 'grid', gap: '8px', minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={file.fileName}
                    >
                      {file.fileName}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={badgeStyle}>{visibleViewCount} views</span>
                      <span style={badgeStyle}>{sourceDatasets.length} datasets</span>
                      {fileTags.map((tag) => (
                        <span key={tag} style={badgeStyle}>{tag}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {file.touchstoneNetwork && (
                        <button
                          type="button"
                          onClick={() => setExpandedTouchstoneFileId((prev) => (prev === fileId ? null : fileId))}
                          style={{
                            ...smallButtonStyle,
                            ...(isExpanded ? activeSmallButtonStyle('#cbb8ea') : null),
                          }}
                          title="Show network parameter tools"
                        >
                          {isExpanded ? 'Hide Matrix' : 'Matrix'}
                        </button>
                      )}
                      {showDetailedFiles && hasMetadata && (
                        <button
                          type="button"
                          onClick={() => toggleMetadata(fileId)}
                          style={{ ...smallButtonStyle, ...(isMetadataExpanded ? activeSmallButtonStyle('#b7d7ef') : null) }}
                        >
                          {isMetadataExpanded ? 'Hide Meta' : 'Meta'}
                        </button>
                      )}
                      {showDetailedFiles && <button
                        type="button"
                        onClick={() => fileDispatch({ type: 'RERUN_WIZARD', payload: { fileId, fileName: file.fileName, previousConfig: buildReimportConfig(file) } })}
                        style={smallButtonStyle}
                      >
                        Re-import
                      </button>}
                      <button
                        type="button"
                        onClick={() => fileDispatch({ type: 'REMOVE_FILE', payload: { fileId } })}
                        style={{ ...smallButtonStyle, marginLeft: 'auto', color: '#c14f63', borderColor: '#df9dad', background: 'rgba(247, 220, 223, 0.92)', fontWeight: 700 }}
                        title="Remove file"
                      >
                        x
                      </button>
                    </div>
                </div>

                {showDetailedFiles && sourceDatasets.length > 0 && (
                  <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                    <div style={subsectionLabelStyle}>Source datasets</div>
                    {sourceDatasets.map((dataset) => (
                      <DatasetRow key={dataset.id} dataset={dataset} />
                    ))}
                  </div>
                )}

                {showDetailedFiles && hasMetadata && isMetadataExpanded && (
                  <MetadataPanel meta={file.meta} />
                )}

                {showDetailedFiles && hiddenViewCount > 0 && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--dim)' }}>
                      {hiddenViewCount} hidden {hiddenViewCount === 1 ? 'view' : 'views'}
                    </span>
                    <button
                      type="button"
                      onClick={() => fileDispatch({ type: 'SHOW_ALL_DISPLAY_TRACES', payload: { fileId } })}
                      style={smallButtonStyle}
                    >
                      Restore Views
                    </button>
                  </div>
                )}

                {showDetailedFiles && file.touchstoneNetwork && isExpanded && (
                  <div style={{ marginTop: '8px', display: 'grid', gap: '8px', padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(['S', 'Y', 'Z'] as const).map((family) => (
                        <button
                          key={family}
                          type="button"
                          onClick={() => setActiveFamily(fileId, family)}
                          style={toggleButtonStyle(touchstoneState.activeFamily === family)}
                        >
                          {family}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gap: '4px', fontSize: '11px' }}>
                      <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Append View</span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {availableViews.map((view) => (
                          <button
                            key={view}
                            type="button"
                            onClick={() => setActiveView(fileId, activeFamily, view)}
                            style={toggleButtonStyle(activeView === view)}
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
              </div>
            );
          })}
          {files.length === 0 && <div style={{ fontSize: '11px', color: 'var(--dim)', padding: '8px 4px' }}>No files loaded.</div>}
        </div>

        <Sec>Display Traces</Sec>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '16px' }}>
          {allTraces.map((tr, i) => {
            const isBackedByDisplayTrace = visibleDisplayTraces.some(
              (displayTrace) => (displayTrace.compat?.legacyTraceName ?? displayTrace.id) === tr.name,
            );
            return (
              <TraceRow
                key={tr.id || tr.name}
                trace={tr}
                index={i}
                isVisible={!!vis[tr.name]}
                isSelected={selectedTraceName === tr.name}
                paneId={tracePaneMap[tr.name]}
                customColor={traceColors[tr.name] ?? null}
                onSelect={() => selectTrace(tr.name)}
                onRemove={() => removeTrace(tr)}
                onToggle={() => toggleVisibility(tr.name)}
                onColorChange={(color) => {
                  const next = { ...traceColors, [tr.name]: color };
                  uiDispatch({ type: 'SET', payload: { key: 'traceColors', value: next } });
                }}
                colors={colors}
                removeLabel={tr.kind === 'derived' ? 'Delete derived trace' : isBackedByDisplayTrace ? 'Hide view' : 'Delete source file'}
              />
            );
          })}
          {allTraces.length === 0 && <div style={{ fontSize: '11px', color: 'var(--dim)', padding: '8px 4px' }}>No traces loaded.</div>}
        </div>

        <Sec>Derived Datasets</Sec>
        <div style={{ marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setShowDerivedDatasets((prev) => !prev)}
            style={{ ...smallButtonStyle, ...(showDerivedDatasets ? activeSmallButtonStyle('#cbb8ea') : null) }}
          >
            {showDerivedDatasets ? 'Hide' : 'Show'} derived datasets ({derivedDatasets.length})
          </button>
          {showDerivedDatasets && (
            <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
              {derivedDatasets.map((dataset) => (
                <DatasetRow key={dataset.id} dataset={dataset} />
              ))}
              {derivedDatasets.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--dim)', padding: '8px 4px' }}>No derived datasets yet.</div>
              )}
            </div>
          )}
        </div>

        {showMeta && (() => {
          const tr = allTraces.find((trace) => trace.name === selectedTraceName);
          if (!tr) return null;
          const first = tr.data[0];
          const last = tr.data[tr.data.length - 1];
          return (
            <>
              <Sec>Metadata</Sec>
              <div style={{ marginBottom: '16px' }}>
                <MR label="Domain" value={tr.domain} />
                <MR label="Points" value={tr.data.length} />
                {first && <MR label="F start" value={first.freq} />}
                {last && <MR label="F stop" value={last.freq} />}
                <MR label="Y unit" value={tr.units.y ?? '-'} />
              </div>
            </>
          );
        })()}

        {markers.length > 0 && (
          <>
            <Sec>Markers</Sec>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
              {markers.map((marker, index) => (
                <MarkerItem
                  key={index}
                  marker={marker}
                  index={index}
                  isSelected={selectedMkrIdx === index}
                  onSelect={() => markerDispatch({ type: 'SET_SELECTED_IDX', payload: index })}
                  onRemove={() => markerDispatch({ type: 'REMOVE_MARKER', payload: index })}
                />
              ))}
            </div>
          </>
        )}

        {refLines.length > 0 && (
          <>
            <Sec>Reference Lines</Sec>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {refLines.map((refLine) => (
                <RefLineItem
                  key={refLine.id}
                  refLine={refLine}
                  isSelected={selectedRefLineId === refLine.id}
                  onSelect={() => refLineDispatch({ type: 'SET_SELECTED', payload: refLine.id })}
                  onRemove={() => refLineDispatch({ type: 'REMOVE_LINE', payload: refLine.id })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const badgeStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--dim)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '0 6px',
};

const smallButtonStyle: React.CSSProperties = {
  background: 'rgba(247, 244, 255, 0.9)',
  border: '1px solid #d8cde8',
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '11px',
  cursor: 'pointer',
  color: 'var(--text)',
};

function activeSmallButtonStyle(color: string): React.CSSProperties {
  return {
    background: `color-mix(in srgb, ${color} 26%, white)`,
    borderColor: color,
    color,
  };
}

const subsectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

function toggleButtonStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? '1px solid #cbb8ea' : '1px solid #d8cde8',
    background: active ? 'rgba(242, 234, 251, 0.95)' : 'rgba(247, 244, 255, 0.9)',
    color: active ? '#8e6fb0' : 'var(--text)',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '11px',
    cursor: 'pointer',
  };
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

function formatMetadataValue(entry: MetadataEntry): string {
  if (typeof entry === 'string') {
    return entry;
  }
  return `${entry.value} ${entry.unit}`.trim();
}

function MetadataPanel({ meta }: { meta: FileMetadata }) {
  const entries = useMemo(() => Object.entries(meta), [meta]);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '8px', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: 'var(--bg)', display: 'grid', gap: '4px' }}>
      <div style={subsectionLabelStyle}>Metadata</div>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 90px) minmax(0, 1fr)', gap: '8px', fontSize: '11px' }}>
          <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={key}>{key}</span>
          <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatMetadataValue(value)}>
            {formatMetadataValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DatasetRow({ dataset }: { dataset: Dataset }) {
  const badgeLabel = dataset.kind === 'derived' ? `${dataset.family} / derived` : dataset.family;
  const detail =
    dataset.family === 'network'
      ? `${dataset.parameterFamily}, ${dataset.portCount}-port, ${dataset.basis}`
      : dataset.family === 'waveform'
        ? 'time domain'
        : dataset.family === 'spectrum'
          ? 'frequency domain'
          : dataset.family;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '6px 8px',
        background: 'var(--bg)',
        display: 'grid',
        gap: '4px',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
          title={dataset.label}
        >
          {dataset.label}
        </span>
        <span
          style={{
            fontSize: '9px',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            padding: '0 6px',
            lineHeight: '1.6',
            flexShrink: 0,
          }}
        >
          {badgeLabel}
        </span>
      </div>
      <span style={{ fontSize: '10px', color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detail}>{detail}</span>
    </div>
  );
}

function TraceRow({
  trace,
  index,
  isVisible,
  isSelected,
  paneId,
  customColor,
  onSelect,
  onRemove,
  onToggle,
  onColorChange,
  colors,
  removeLabel,
}: {
  trace: Trace;
  index: number;
  isVisible: boolean;
  isSelected: boolean;
  paneId?: string;
  customColor: string | null;
  onSelect: () => void;
  onRemove: () => void;
  onToggle: () => void;
  onColorChange: (color: string) => void;
  colors: { tr: readonly string[] } | null;
  removeLabel: string;
}) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const tracePalette = colors?.tr ?? [];
  const paletteColor = tracePalette[index % (tracePalette.length || 1)] || '#888888';
  const traceColor = customColor || paletteColor;
  const paneBadge = paneId ? `P${paneId.split('-')[1] || '1'}` : null;

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-mergen-trace', trace.name);
        event.dataTransfer.setData('text/plain', trace.name);
      }}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        borderRadius: '4px',
        background: isSelected ? 'var(--bg-alt, rgba(0,0,0,0.05))' : 'transparent',
        border: isSelected ? '1px solid var(--border)' : '1px solid transparent',
        minWidth: 0,
      }}
    >
      <input
        type="checkbox"
        checked={isVisible}
        onChange={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        onClick={(event) => event.stopPropagation()}
        style={{ accentColor: traceColor }}
      />
      <input
        ref={colorInputRef}
        type="color"
        value={traceColor}
        onChange={(event) => {
          event.stopPropagation();
          onColorChange(event.target.value);
        }}
        onClick={(event) => event.stopPropagation()}
        title="Change trace color"
        style={{
          width: '16px',
          height: '16px',
          padding: 0,
          border: '1px solid var(--border)',
          borderRadius: '3px',
          cursor: 'pointer',
          background: 'none',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: traceColor,
          fontWeight: 600,
          fontSize: '11px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
        title={trace.dn || trace.name}
      >
        {trace.dn || trace.name}
      </span>
      {paneBadge && (
        <span
          style={{
            fontSize: '9px',
            color: 'var(--dim)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            padding: '0 5px',
            lineHeight: '1.4',
            flexShrink: 0,
          }}
        >
          {paneBadge}
        </span>
      )}
      <button
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        title={removeLabel}
        style={{
          background: 'none',
          border: 'none',
          color: '#f55',
          cursor: 'pointer',
          fontSize: '14px',
          padding: '0 2px',
          opacity: 0.6,
          flexShrink: 0,
        }}
      >
        x
      </button>
    </div>
  );
}

function MarkerItem({ marker, index, isSelected, onSelect, onRemove }: {
  marker: Marker;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '6px',
        background: isSelected ? 'var(--da, rgba(0,0,0,0.02))' : 'var(--card)',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '6px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--accent)' }}>
          M{index + 1} {marker.label ? `(${marker.label})` : ''}
        </span>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          style={{ background: 'none', border: 'none', color: '#f55', cursor: 'pointer', padding: 0 }}
        >
          x
        </button>
      </div>
      <MR label="Freq" value={marker.freq} />
      <MR label="Amp" value={marker.amp} />
    </div>
  );
}

function RefLineItem({ refLine, isSelected, onSelect, onRemove }: {
  refLine: RefLine;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const color = refLine.type === 'h' ? 'var(--refH)' : 'var(--refV)';

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '6px',
        background: isSelected ? 'var(--da, rgba(0,0,0,0.02))' : 'var(--card)',
        border: `1px solid ${isSelected ? color : 'var(--border)'}`,
        borderRadius: '6px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontWeight: 700, fontSize: '11px', color }}>
          {refLine.type === 'h' ? 'H' : 'V'}-Ref
        </span>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          style={{ background: 'none', border: 'none', color: '#f55', cursor: 'pointer', padding: 0 }}
        >
          x
        </button>
      </div>
      <MR label="Value" value={refLine.value} />
    </div>
  );
}
