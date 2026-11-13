import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { usePaneState, usePaneDispatch, usePaneLimit } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { findAbsoluteMax, findAbsoluteMin, findNextLocalExtremum } from '../../domain/markers';
import { defaultTraceForPane } from '../../domain/default-trace';
import { paneName } from '../../domain/line-view';
import { useInteractionMode } from '../../hooks/use-interaction-mode';
import { Btn } from '../shared/Btn';
import { PopoverAt } from '../shared/Controls';
import { planLastPaneLines, planLastPaneRemoval, useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { LayoutMenu } from '../chart/LayoutMenu';

/**
 * ToolbarStrip component for chart-local actions in the active pane.
 * Ported from legacy ToolbarStrip in app-shell-components.js.
 */
export function ToolbarStrip() {
  const [deltaAnchor, setDeltaAnchor] = React.useState<HTMLElement | null>(null);
  const {
    showPaneTools,
    showSearchTools,
    showLineTools,
    showMarkerTools,
    searchDirection,
    markerTrace,
    selectedTraceName,
  } = useUiState();

  const { allTraces, vis } = useTraceState();
  const aggregate = useOptionalAggregateWorkspace();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const { panes, activePaneId, tracePaneMap } = usePaneState();
  const { refMode } = useRefLineState();
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
  const activeTraceName = defaultTraceForPane(allTraces, selectedTraceName, activePaneId, tracePaneMap, vis)?.name ?? null;
  const activeTr = allTraces.find(t => t.name === activeTraceName) ?? null;

  if (!showMarkerTools && !showSearchTools && !showLineTools && !showPaneTools) return null;

  // --- Peak/Min search handlers ---
  const moveOrPlace = (freq: number, amp: number) => {
    refDispatch({ type: 'SET_SELECTED', payload: null });
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
      const lines = [...moved.map(move => `${move.traceName} -> ${paneName(panes, move.to)}`), ...unplaced.map(name => `${name} -> not in a pane`), ...linePlan.map(move => `${move.line.label || `Line ${move.line.id}`} -> ${move.to ? paneName(panes, move.to) : 'not in a pane'}`)];
      if (!window.confirm(`Remove the last pane? Traces will remain available.\n\n${lines.join('\n')}`)) return;
    }
    {
      const destinations = [...new Set(moved.map(move => paneName(panes, move.to)))];
      const message = moved.length ? `${moved.length} trace${moved.length === 1 ? '' : 's'} moved to ${destinations.join(', ')}` : 'Pane removed';
      aggregate.historyDispatch({ type: 'change', command: { slice: 'remove-last-pane', targetPaneId: removed.id, expectedRevision: aggregate.state.revision, confirmed: unplaced.length > 0 || linePlan.length > 0, limit }, ...(moved.length ? { toastMessage: message, toastKind: 'moved' as const } : {}) });
    }
  };
  return <div onKeyDown={event => {
    // The global shortcut intentionally ignores native controls; let Escape
    // cancel placement when focus remains on a toolbar button.
    if (event.key === 'Escape' && event.target instanceof HTMLButtonElement) {
      markerDispatch({ type: 'ARM', payload: null });
      refDispatch({ type: 'SET_MODE', payload: null });
      markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
      refDispatch({ type: 'SET_SELECTED', payload: null });
      uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: null } });
      event.preventDefault();
    }
  }} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', borderBottom: '1px solid var(--border)', background: 'var(--panel)', flexShrink: 0 }}>
    {showMarkerTools && group('Markers', 'marker', <>
      <label>Trace: <select className="ui-select" style={{ minHeight: 20, height: 20, maxWidth: 110, padding: '0 4px' }} value={markerTrace} onChange={e => uiDispatch({ type: 'SET', payload: { key: 'markerTrace', value: e.target.value } })} title="Auto picks the selected trace or first visible trace">
        <option value="__auto__">Auto</option>{visiblePaneTraces.map(trace => <option key={trace.name} value={trace.name}>{trace.dn || trace.name}</option>)}
      </select></label>
      <Btn small variant="armed" tone="marker" active={!!armed} aria-pressed={!!armed} aria-label="New Marker" title="Place a marker (N)" onClick={selectNormal}>+ New</Btn>
      <Btn small aria-label="Choose a delta marker reference" aria-expanded={deltaAnchor !== null} onClick={event => setDeltaAnchor(deltaAnchor ? null : event.currentTarget)}>▾</Btn>
      {deltaAnchor && <PopoverAt label="Delta marker reference" at={deltaAnchor} onClose={() => setDeltaAnchor(null)}><div role="menu" aria-label="Delta marker reference" style={{ display: 'grid', minWidth: 170 }}>
          {normalMarkers.map((marker, i) => <Btn role="menuitem" key={marker.id} small onClick={() => { armDelta(marker.id); setDeltaAnchor(null); }}>+ Δ from {marker.label || `M${i + 1}`}</Btn>)}
          <Btn role="menuitem" small disabled={!selected || selected.type === 'delta'} title={!selected || selected.type === 'delta' ? 'Select a normal marker first' : 'Place delta from selected marker (Shift+N)'} onClick={() => { if (selected) armDelta(selected.id); setDeltaAnchor(null); }}>+ Δ from selected</Btn>
      </div></PopoverAt>}
    </>)}
    {showSearchTools && group('Search', 'search', <>
      <Btn small disabled={!canSearch} title={canSearch ? 'Find peak' : 'Select a trace with data'} onClick={handlePeak}>Peak</Btn>
      <Btn small disabled={!canSearch} title={canSearch ? 'Find next peak' : 'Select a trace with data'} onClick={handleNextPeak}>Next peak</Btn>
      <Btn small disabled={!canSearch} title={canSearch ? 'Find minimum' : 'Select a trace with data'} onClick={handleMin}>Min</Btn>
      <Btn small disabled={!canSearch} title={canSearch ? 'Find next minimum' : 'Select a trace with data'} onClick={handleNextMin}>Next min</Btn>
      <Btn small style={{ borderStyle: 'dashed' }} title="Change search direction" onClick={() => uiDispatch({ type: 'SET', payload: { key: 'searchDirection', value: searchDirection === 'right' ? 'left' : 'right' } })}>{searchDirection === 'right' ? 'Dir L → R' : 'Dir L ← R'}</Btn>
    </>)}
    {showLineTools && group('Lines', 'lines', <>
      <Btn small variant="armed" tone="lines" active={refMode === 'v'} aria-pressed={refMode === 'v'} aria-label="V-Line" title="Place vertical line" onClick={() => toggleRefPlacement('v')}>V line</Btn>
      <Btn small variant="armed" tone="lines" active={refMode === 'h'} aria-pressed={refMode === 'h'} aria-label="H-Line" title="Place horizontal line" onClick={() => toggleRefPlacement('h')}>H line</Btn>
    </>)}
    {showPaneTools && group('Pane', 'pane', <>
      {aggregate && <LayoutMenu paneCount={panes.length} limit={limit} />}
      <Btn small disabled={panes.length >= limit || !aggregate} title={panes.length >= limit ? `Maximum ${limit} panes` : 'Add a pane'} onClick={() => { const targetPaneId = activePaneId ?? panes[0]?.id; if (targetPaneId) aggregate?.dispatch({ slice: 'layout', action: { type: 'ADD_PANE_AFTER', targetPaneId, limit } }); }}>+ Pane</Btn>
      <Btn small disabled={panes.length <= 1 || !aggregate} title={panes.length <= 1 ? "At least one pane must remain" : !aggregate ? "Pane removal requires workspace history" : "Remove the last pane"} onClick={removeLastPane}>- Pane</Btn>
      <Btn small title="Fit all panes" onClick={() => paneDispatch({ type: 'CLEAR_ALL_ZOOMS' })}>Fit all</Btn>
    </>)}
    {(showMarkerTools || showLineTools) && hintSlot('Click to place a delta marker', (showMarkerTools && armed) || (showLineTools && refMode) ? hint : null)}
  </div>;
}
