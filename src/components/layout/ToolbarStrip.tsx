import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { usePaneState, usePaneDispatch, usePaneLimit } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { findAbsoluteMax, findAbsoluteMin, findNextLocalExtremum } from '../../domain/markers';
import { useInteractionMode } from '../../hooks/use-interaction-mode';
import { Btn } from '../shared/Btn';
import { planLastPaneLines, planLastPaneRemoval, useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';

/**
 * ToolbarStrip component for chart-local actions in the active pane.
 * Ported from legacy ToolbarStrip in app-shell-components.js.
 */
export function ToolbarStrip() {
  const {
    showPaneTools,
    showSearchTools,
    showLineTools,
    showMarkerTools,
    searchDirection,
    markerTrace,
  } = useUiState();

  const { allTraces, vis } = useTraceState();
  const aggregate = useOptionalAggregateWorkspace();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const { panes, activePaneId, tracePaneMap, paneActiveTraceMap } = usePaneState();
  const { refMode, refLines, selectedRefLineId } = useRefLineState();
  const refDispatch = useRefLineDispatch();
  const { limit } = usePaneLimit();

  const uiDispatch = useUiDispatch();
  const markerDispatch = useMarkerDispatch();
  const paneDispatch = usePaneDispatch();
  const { toggleRefPlacement, selectNormal, hint } = useInteractionMode();

  const paneTraceNames = React.useMemo(() => Object.entries(tracePaneMap)
    .filter(([, pid]) => pid.includes(activePaneId ?? ''))
    .map(([n]) => n), [tracePaneMap, activePaneId]);
  const visiblePaneTraces = allTraces.filter(t => paneTraceNames.includes(t.name) && vis[t.name] !== false);

  // --- Active trace resolution ---
  const activeTraceName =
    (activePaneId != null ? paneActiveTraceMap[activePaneId] : null)
    ?? paneTraceNames[0]
    ?? null;
  const activeTr = allTraces.find(t => t.name === activeTraceName) ?? null;

  if (!showMarkerTools && !showSearchTools && !showLineTools && !showPaneTools) return null;

  // --- Peak/Min search handlers ---
  const moveOrPlace = (freq: number, amp: number) => {
    if (selectedMkrIdx >= 0) {
      markerDispatch({ type: 'UPDATE_MARKER', payload: { idx: selectedMkrIdx, updates: { requestedFreq: freq, freq, amp, interpolated: false } } });
    } else {
      markerDispatch({ type: 'PLACE_MARKER', payload: { trace: activeTr!, targetFreq: freq } });
    }
  };

  const handlePeak = () => {
    if (!activeTr || activeTr.data.length === 0) return;
    const best = findAbsoluteMax(activeTr.data);
    if (!best) return;
    moveOrPlace(best.freq, best.amp);
  };

  const handleMin = () => {
    if (!activeTr || activeTr.data.length === 0) return;
    const best = findAbsoluteMin(activeTr.data);
    if (!best) return;
    moveOrPlace(best.freq, best.amp);
  };

  const handleNextPeak = () => {
    if (!activeTr || activeTr.data.length === 0) return;
    const fromFreq = selectedMkrIdx >= 0 ? (markers[selectedMkrIdx]?.freq ?? null) : null;
    const best = findNextLocalExtremum(activeTr.data, fromFreq, searchDirection, 'max');
    if (!best) return;
    moveOrPlace(best.freq, best.amp);
  };

  const handleNextMin = () => {
    if (!activeTr || activeTr.data.length === 0) return;
    const fromFreq = selectedMkrIdx >= 0 ? (markers[selectedMkrIdx]?.freq ?? null) : null;
    const best = findNextLocalExtremum(activeTr.data, fromFreq, searchDirection, 'min');
    if (!best) return;
    moveOrPlace(best.freq, best.amp);
  };

  const group = (title: string, tone: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', minHeight: 'var(--tool-row-height)', background: `var(--${tone}-tint)`, flex: '0 0 auto', whiteSpace: 'nowrap' }}>
      <span style={{ color: `var(--${tone}-ink)`, fontWeight: 700, marginRight: 4 }}>{title}</span>{children}
    </div>
  );
  // Size each reserved hint slot to its longest sentence, keeping groups still
  // when placement is armed without reserving arbitrary extra width.
  const hintSlot = (longest: string, message: string | null) => (
    <span style={{ display: 'inline-grid', color: 'var(--text-muted)' }}>
      <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{longest}</span>
      <span aria-live="polite" style={{ gridArea: '1 / 1' }}>{message}</span>
    </span>
  );
  const normalMarkers = markers.filter(marker => marker.type !== 'delta');
  const selected = markers[selectedMkrIdx];
  const selectedLine = refLines.find(line => line.id === selectedRefLineId);
  const armDelta = (refId: string) => {
    refDispatch({ type: 'SET_MODE', payload: null });
    markerDispatch({ type: 'ARM', payload: { kind: 'delta', refId } });
  };
  const canSearch = !!activeTr?.data.length;
  const removeLastPane = () => {
    if (panes.length <= 1) return;
    const removed = panes[panes.length - 1];
    if (!removed) return;
    if (!aggregate) return;
    const result = planLastPaneRemoval(aggregate.state, removed.id);
    if (!result.ok) { window.alert(result.reason); return; }
    const { moved, unplaced } = result.plan;
    const linePlan = planLastPaneLines(aggregate.state, removed.id, result.plan.memberships);
    if (unplaced.length || linePlan.length) {
      const lines = [...moved.map(move => `${move.traceName} -> ${panes.find(pane => pane.id === move.to)?.title || move.to}`), ...unplaced.map(name => `${name} -> not in a pane`), ...linePlan.map(move => `${move.line.label || `Line ${move.line.id}`} -> ${move.to ? (panes.find(pane => pane.id === move.to)?.title || move.to) : 'not in a pane'}`)];
      if (!window.confirm(`Remove the last pane? Traces will remain available.\n\n${lines.join('\n')}`)) return;
    }
    {
      const destinations = [...new Set(moved.map(move => panes.find(pane => pane.id === move.to)?.title || move.to))];
      const message = moved.length ? `${moved.length} trace${moved.length === 1 ? '' : 's'} moved to ${destinations.join(', ')}` : 'Pane removed';
      aggregate.historyDispatch({ type: 'change', command: { slice: 'remove-last-pane', targetPaneId: removed.id, expectedRevision: aggregate.state.revision, confirmed: unplaced.length > 0 || linePlan.length > 0, limit }, toastMessage: message });
    }
  };
  return <div onKeyDown={event => {
    // The global shortcut intentionally ignores native controls; let Escape
    // cancel placement when focus remains on a toolbar button.
    if (event.key === 'Escape' && event.target instanceof HTMLButtonElement && (armed || refMode)) {
      markerDispatch({ type: 'ARM', payload: null });
      refDispatch({ type: 'SET_MODE', payload: null });
      event.preventDefault();
    }
  }} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', borderBottom: '1px solid var(--border)', background: 'var(--panel)', flexShrink: 0 }}>
    {showMarkerTools && group('Markers', 'marker', <>
      <label>Trace: <select className="ui-select" style={{ minHeight: 20, height: 20, maxWidth: 110, padding: '0 4px' }} value={markerTrace} onChange={e => uiDispatch({ type: 'SET', payload: { key: 'markerTrace', value: e.target.value } })} title="Auto picks the trace nearest the click">
        <option value="__auto__">Auto</option>{visiblePaneTraces.map(trace => <option key={trace.name} value={trace.name}>{trace.dn || trace.name}</option>)}
      </select></label>
      <Btn small variant="slate" active={!!armed} aria-pressed={!!armed} aria-label="New Marker" title="Place a marker (N)" onClick={selectNormal}>+ New</Btn>
      <details style={{ position: 'relative' }}><summary aria-label="Choose a delta marker reference" title="Choose a delta marker reference" style={{ cursor: 'pointer', listStyle: 'none', padding: '0 4px', border: '1px solid var(--border)', borderRadius: 4 }}>▾</summary>
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, minWidth: 170, background: 'var(--raised)', border: '1px solid var(--border)', padding: 4 }}>
          {normalMarkers.map((marker, i) => <Btn key={marker.id} small onClick={e => { armDelta(marker.id); e.currentTarget.closest('details')?.removeAttribute('open'); }}>+ Δ from {marker.label || `M${i + 1}`}</Btn>)}
          <Btn small disabled={!selected || selected.type === 'delta'} title={!selected || selected.type === 'delta' ? 'Select a normal marker first' : 'Place delta from selected marker (Shift+N)'} onClick={e => { if (selected) armDelta(selected.id); e.currentTarget.closest('details')?.removeAttribute('open'); }}>+ Δ from selected</Btn>
        </div>
      </details>
    </>)}
    {showSearchTools && group('Search', 'search', <>
      <Btn small disabled={!canSearch} title={canSearch ? 'Find peak' : 'Select a trace with data'} onClick={handlePeak}>Peak</Btn>
      <Btn small disabled={!canSearch} title={canSearch ? 'Find next peak' : 'Select a trace with data'} onClick={handleNextPeak}>Next peak</Btn>
      <Btn small disabled={!canSearch} title={canSearch ? 'Find minimum' : 'Select a trace with data'} onClick={handleMin}>Min</Btn>
      <Btn small disabled={!canSearch} title={canSearch ? 'Find next minimum' : 'Select a trace with data'} onClick={handleNextMin}>Next min</Btn>
      <Btn small style={{ borderStyle: 'dashed' }} title="Change search direction" onClick={() => uiDispatch({ type: 'SET', payload: { key: 'searchDirection', value: searchDirection === 'right' ? 'left' : 'right' } })}>{searchDirection === 'right' ? 'Dir L → R' : 'Dir L ← R'}</Btn>
    </>)}
    {showLineTools && group('Lines', 'lines', <>
      <Btn small variant="slate" active={refMode === 'v'} aria-pressed={refMode === 'v'} aria-label="V-Line" title="Place vertical line" onClick={() => toggleRefPlacement('v')}>V line</Btn>
      <Btn small variant="slate" active={refMode === 'h'} aria-pressed={refMode === 'h'} aria-label="H-Line" title="Place horizontal line" onClick={() => toggleRefPlacement('h')}>H line</Btn>
      <Btn small variant="chip" tone="lines" active={!!selectedLine?.groupId} disabled={!selectedLine || selectedLine.type !== 'v'} title={!selectedLine ? 'Select a vertical line first' : selectedLine.type !== 'v' ? 'Only vertical lines can be linked' : 'Link selected line across panes'} onClick={() => { if (!selectedLine) return; refDispatch(selectedLine.groupId ? { type: 'UNLOCK_LINE', payload: { lineId: selectedLine.id } } : { type: 'LOCK_LINE', payload: { lineId: selectedLine.id, allPaneIds: panes.map(pane => pane.id) } }); }}>Link</Btn>
    </>)}
    {showPaneTools && group('Pane', 'pane', <>
      <Btn small disabled title="Layout presets will be available after integration">Layout: Rows ▾</Btn>
      <Btn small disabled={panes.length >= limit} title={panes.length >= limit ? `Maximum ${limit} panes` : 'Add a pane'} onClick={() => paneDispatch({ type: 'SET_PANE_COUNT', payload: panes.length + 1, limit })}>+ Pane</Btn>
      <Btn small disabled={panes.length <= 1 || !aggregate} title={panes.length <= 1 ? "At least one pane must remain" : !aggregate ? "Pane removal requires workspace history" : "Remove the last pane"} onClick={removeLastPane}>- Pane</Btn>
      <Btn small title="Fit all panes" onClick={() => paneDispatch({ type: 'CLEAR_ALL_ZOOMS' })}>Fit all</Btn>
    </>)}
    {(showMarkerTools || showLineTools) && hintSlot('Click to place a delta marker', (showMarkerTools && armed) || (showLineTools && refMode) ? hint : null)}
  </div>;
}
