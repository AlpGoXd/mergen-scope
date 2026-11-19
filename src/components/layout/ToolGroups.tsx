import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import type { UiState } from '../../stores/ui-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { usePaneState, usePaneDispatch, usePaneLimit } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { findAbsoluteMax, findAbsoluteMin, findNextLocalExtremum } from '../../domain/markers';
import { defaultTraceForPane } from '../../domain/default-trace';
import { paneName } from '../../domain/line-view';
import { useInteractionMode } from '../../hooks/use-interaction-mode';
import { Btn } from '../shared/Btn';
import { MarkerSplitButton } from './MarkerSplitButton';
import { planLastPaneLines, planLastPaneRemoval, useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { LayoutMenu } from '../chart/LayoutMenu';
import './tool-zones.css';

type ZoneTone = 'marker' | 'search' | 'lines' | 'pane';

const Chevron = () => <svg className="tool-zone__chevron" aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 5l7 7-7 7" /></svg>;

/**
 * One tool group of the top bar: its chip is the zone's title, and when open the tools follow inline,
 * in the same row. Closed, it is just the chip. The tools slide out when the group goes from closed to open,
 * not when it is already open at first paint.
 */
function ToolZone({ tone, label, open, onToggle, children }: { tone: ZoneTone; label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const wasOpen = React.useRef(open);
  const slideRef = React.useRef(false);
  if (open && !wasOpen.current) slideRef.current = true;
  if (!open) slideRef.current = false;
  wasOpen.current = open;
  const slide = slideRef.current;
  return <div className={`tool-zone tool-zone--${tone}${open ? ' is-open' : ''}`}>
    <Btn variant="chip" tone={tone} active={open} aria-expanded={open} className="tool-zone__chip" onClick={onToggle}>{label}<Chevron /></Btn>
    {open && <div className={`tool-zone__tools${slide ? ' is-sliding' : ''}`}>{children}</div>}
  </div>;
}

/**
 * The Markers / Search / Lines / Pane groups of the top bar (chart-local actions in the active pane).
 * Own flex-wrap container: a whole group moves to a second line when it does not fit. Nothing else lives in
 * it (Clear All and Analysis are outside), so only the groups themselves ever wrap.
 */
export function ToolGroups() {
  const traceSelect = React.useRef<HTMLSelectElement>(null);
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
  const { markers, selectedMkrIdx } = useMarkerState();
  const { panes, activePaneId, tracePaneMap } = usePaneState();
  const { refMode } = useRefLineState();
  const refDispatch = useRefLineDispatch();
  const { limit } = usePaneLimit();

  const uiDispatch = useUiDispatch();
  const markerDispatch = useMarkerDispatch();
  const paneDispatch = usePaneDispatch();
  const { toggleRefPlacement } = useInteractionMode();
  const toggle = (key: keyof UiState, value: boolean) => uiDispatch({ type: 'SET', payload: { key, value: !value } });

  const paneTraceNames = React.useMemo(() => Object.entries(tracePaneMap)
    .filter(([, pid]) => pid.includes(activePaneId ?? ''))
    .map(([n]) => n), [tracePaneMap, activePaneId]);
  const visiblePaneTraces = allTraces.filter(t => paneTraceNames.includes(t.name) && vis[t.name] !== false);

  // --- Active trace resolution ---
  const activeTraceName = defaultTraceForPane(allTraces, selectedTraceName, activePaneId, tracePaneMap, vis)?.name ?? null;
  const activeTr = allTraces.find(t => t.name === activeTraceName) ?? null;

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
  return <div className="tool-groups" onKeyDown={event => {
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
  }}>
    <ToolZone tone="marker" label="Markers" open={showMarkerTools} onToggle={() => toggle('showMarkerTools', showMarkerTools)}>
      {/* "Trace:" and the arrow sit inside the control's face; a click anywhere on it opens the same picker. */}
      <span className="zone-tool tool-zone__field" onMouseDown={event => { if (event.target === traceSelect.current) return; event.preventDefault(); traceSelect.current?.focus(); traceSelect.current?.showPicker?.(); }}>
        <span className="tool-zone__field-label" aria-hidden="true">Trace:</span>
        <select ref={traceSelect} className="tool-zone__select" aria-label="Trace" value={markerTrace} onChange={e => uiDispatch({ type: 'SET', payload: { key: 'markerTrace', value: e.target.value } })} title="Auto picks the selected trace or first visible trace">
          <option value="__auto__">Auto</option>{visiblePaneTraces.map(trace => <option key={trace.name} value={trace.name}>{trace.dn || trace.name}</option>)}
        </select>
      </span>
      <MarkerSplitButton />
    </ToolZone>
    <ToolZone tone="search" label="Search" open={showSearchTools} onToggle={() => toggle('showSearchTools', showSearchTools)}>
      <Btn small className="zone-tool" disabled={!canSearch} title={canSearch ? 'Find peak' : 'Select a trace with data'} onClick={handlePeak}>Peak</Btn>
      <Btn small className="zone-tool" disabled={!canSearch} title={canSearch ? 'Find next peak' : 'Select a trace with data'} onClick={handleNextPeak}>Next peak</Btn>
      <Btn small className="zone-tool" disabled={!canSearch} title={canSearch ? 'Find minimum' : 'Select a trace with data'} onClick={handleMin}>Min</Btn>
      <Btn small className="zone-tool" disabled={!canSearch} title={canSearch ? 'Find next minimum' : 'Select a trace with data'} onClick={handleNextMin}>Next min</Btn>
      <Btn small className="zone-tool tool-zone__dir" title="Change search direction" onClick={() => uiDispatch({ type: 'SET', payload: { key: 'searchDirection', value: searchDirection === 'right' ? 'left' : 'right' } })}>{searchDirection === 'right' ? 'Dir L → R' : 'Dir L ← R'}</Btn>
    </ToolZone>
    <ToolZone tone="lines" label="Lines" open={showLineTools} onToggle={() => toggle('showLineTools', showLineTools)}>
      <Btn small className="zone-tool" variant="armed" tone="lines" active={refMode === 'v'} aria-pressed={refMode === 'v'} aria-label="V-Line" title="Place vertical line" onClick={() => toggleRefPlacement('v')}>V line</Btn>
      <Btn small className="zone-tool" variant="armed" tone="lines" active={refMode === 'h'} aria-pressed={refMode === 'h'} aria-label="H-Line" title="Place horizontal line" onClick={() => toggleRefPlacement('h')}>H line</Btn>
    </ToolZone>
    <ToolZone tone="pane" label="Pane" open={showPaneTools} onToggle={() => toggle('showPaneTools', showPaneTools)}>
      {aggregate && <LayoutMenu paneCount={panes.length} limit={limit} className="zone-tool" />}
      <Btn small className="zone-tool" disabled={panes.length >= limit || !aggregate} title={panes.length >= limit ? `Maximum ${limit} panes` : 'Add a pane'} onClick={() => { const targetPaneId = activePaneId ?? panes[0]?.id; if (targetPaneId) aggregate?.dispatch({ slice: 'layout', action: { type: 'ADD_PANE_AFTER', targetPaneId, limit } }); }}>+ Pane</Btn>
      <Btn small className="zone-tool" disabled={panes.length <= 1 || !aggregate} title={panes.length <= 1 ? "At least one pane must remain" : !aggregate ? "Pane removal requires workspace history" : "Remove the last pane"} onClick={removeLastPane}>- Pane</Btn>
      <Btn small className="zone-tool" title="Fit all panes" onClick={() => paneDispatch({ type: 'CLEAR_ALL_ZOOMS' })}>Fit all</Btn>
    </ToolZone>
  </div>;
}
