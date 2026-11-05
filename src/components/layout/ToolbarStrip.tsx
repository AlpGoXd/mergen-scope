import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { usePaneState, usePaneDispatch } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { findAbsoluteMax, findAbsoluteMin, findNextLocalExtremum } from '../../domain/markers';
import { useInteractionMode } from '../../hooks/use-interaction-mode';
import { Btn } from '../shared/Btn';

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
    newMarkerArmed,
    dRef,
  } = useUiState();

  const { allTraces, vis } = useTraceState();
  const { markers, selectedMkrIdx, mkrMode } = useMarkerState();
  const { panes, activePaneId, tracePaneMap, paneActiveTraceMap } = usePaneState();
  const { refMode } = useRefLineState();

  const uiDispatch = useUiDispatch();
  const markerDispatch = useMarkerDispatch();
  const refLineDispatch = useRefLineDispatch();
  const paneDispatch = usePaneDispatch();
  const { toggleRefPlacement, selectNormal, selectDelta } = useInteractionMode();

  const paneTraceNames = React.useMemo(() => Object.entries(tracePaneMap)
    .filter(([, pid]) => pid === activePaneId)
    .map(([n]) => n), [tracePaneMap, activePaneId]);
  const visiblePaneTraces = allTraces.filter(t => paneTraceNames.includes(t.name) && vis[t.name] !== false);

  // --- Active trace resolution ---
  const activeTraceName =
    (activePaneId != null ? paneActiveTraceMap[activePaneId] : null)
    ?? paneTraceNames[0]
    ?? null;
  const activeTr = allTraces.find(t => t.name === activeTraceName) ?? null;

  // If no traces have data, hide the toolbar
  if (!allTraces.some(t => t.data && t.data.length > 0)) return null;

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

  const group = (title: string, color: string, children: React.ReactNode) => (
    <div style={{
      '--group-color': color,
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      padding: '5px 10px',
      border: `1px solid color-mix(in srgb, ${color} 28%, var(--border))`,
      borderRadius: '10px',
      background: `color-mix(in srgb, ${color} 7%, var(--card))`,
      flexWrap: 'wrap',
    } as React.CSSProperties}>
      <span style={{ fontSize: '11px', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '3px' }}>
        {title}
      </span>
      {children}
    </div>
  );

  return (
    <div style={{
      display: 'flex',
      padding: '7px 12px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      background: 'var(--card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>

        {showMarkerTools && group("Marker", "var(--marker-color)", (
          <>
            <Btn
              active={mkrMode !== 'delta'}
              title="Normal marker mode"
              onClick={selectNormal}
            >
              Normal
            </Btn>
            <Btn
              active={mkrMode === 'delta'}
              title="Delta marker mode"
              onClick={selectDelta}
            >
              Delta
            </Btn>
            {mkrMode === 'delta' && (
              <select
                value={dRef ?? ''}
                onChange={e => {
                  const v: number | null = e.target.value === '' ? null : Number(e.target.value);
                  uiDispatch({ type: 'SET', payload: { key: 'dRef', value: v } });
                }}
                style={{ fontSize: '13px', padding: '4px 6px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              >
                <option value="">Ref…</option>
                {markers.map((m, i) => m.type !== 'delta' ? (
                  <option key={i} value={i}>M{i + 1}</option>
                ) : null)}
              </select>
            )}
            <Btn
              active={selectedMkrIdx < 0 && newMarkerArmed}
              title={selectedMkrIdx >= 0 ? "Deselect active marker" : "Arm for new marker placement on next click"}
              onClick={() => {
                if (selectedMkrIdx >= 0) {
                  markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
                  refLineDispatch({ type: 'SET_SELECTED', payload: null });
                  uiDispatch({ type: 'SET', payload: { key: 'newMarkerArmed', value: false } });
                } else {
                  uiDispatch({ type: 'SET', payload: { key: 'newMarkerArmed', value: true } });
                }
              }}
            >
              {selectedMkrIdx >= 0 ? 'Unselect' : 'New Marker'}
            </Btn>
            <select
              value={markerTrace}
              onChange={(e) => uiDispatch({ type: 'SET', payload: { key: 'markerTrace', value: e.target.value } })}
              style={{ fontSize: '13px', padding: '4px 6px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', minWidth: '80px' }}
              title="Marker trace (Auto = pick nearest)"
            >
              <option value="__auto__">Auto</option>
              {visiblePaneTraces.map((trace) => {
                const label = trace.dn || trace.name;
                const display = label.length > 25
                  ? label.slice(0, 5) + '...' + label.slice(-12)
                  : label;
                return (
                  <option key={trace.name} value={trace.name} title={label}>
                    {display}
                  </option>
                );
              })}
            </select>
          </>
        ))}

        {showPaneTools && group("Pane", "var(--pane-color)", (
          <>
            <Btn
              onClick={() => paneDispatch({ type: 'SET_PANE_COUNT', payload: Math.min(4, panes.length + 1) })}
              disabled={panes.length >= 4}
              title="Add a pane"
            >
              + Pane
            </Btn>
            <Btn
              onClick={() => paneDispatch({ type: 'SET_PANE_COUNT', payload: Math.max(1, panes.length - 1) })}
              disabled={panes.length <= 1}
              title="Remove last pane"
            >
              - Pane
            </Btn>
          </>
        ))}

        {showSearchTools && group("Search", "var(--search-color)", (
          <>
            <Btn title="Find peak" onClick={handlePeak}>Peak</Btn>
            <Btn title="Find next peak" onClick={handleNextPeak}>Next Peak</Btn>
            <Btn title="Find min" onClick={handleMin}>Min</Btn>
            <Btn title="Find next min" onClick={handleNextMin}>Next Min</Btn>
            <Btn
              active={true}
              color="#e8579c"
              onClick={() => uiDispatch({ type: 'SET', payload: { key: 'searchDirection', value: searchDirection === 'right' ? 'left' : 'right' } })}
            >
              {searchDirection === 'right' ? "Dir: L → R" : "Dir: L ← R"}
            </Btn>
          </>
        ))}

        {showLineTools && group("Lines", "var(--lines-color)", (
          <>
            <Btn
              active={refMode === 'v'}
              title="Toggle V-line placement"
              onClick={() => toggleRefPlacement('v')}
            >
              V-Line
            </Btn>
            <Btn
              active={refMode === 'h'}
              title="Toggle H-line placement"
              onClick={() => toggleRefPlacement('h')}
            >
              H-Line
            </Btn>
          </>
        ))}


      </div>
    </div>
  );
}
