import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { usePaneState, usePaneDispatch } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { findAbsoluteMax, findAbsoluteMin, findNextLocalExtremum } from '../../domain/markers';
import { makeNiceTicks } from '../../domain/trace-math';
import { useInteractionMode } from '../../hooks/use-interaction-mode';
import { useXControls } from '../../hooks/use-x-controls';
import { useYControls } from '../../hooks/use-y-controls';
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
    showViewTools,
    showMarkerTools,
    searchDirection,
    lockLinesAcrossPanes,
    markerTrace,
    dRef,
  } = useUiState();

  const { allTraces, vis } = useTraceState();
  const { markers, selectedMkrIdx, mkrMode } = useMarkerState();
  const { panes, activePaneId, tracePaneMap, paneActiveTraceMap, zoomAll, sharedZoom, paneXZooms, paneYZooms } = usePaneState();
  const { refMode } = useRefLineState();

  const uiDispatch = useUiDispatch();
  const markerDispatch = useMarkerDispatch();
  const refLineDispatch = useRefLineDispatch();
  const paneDispatch = usePaneDispatch();
  const { toggleRefPlacement, selectNormal, selectDelta } = useInteractionMode();
  const { clearAllXZooms, setZoom } = useXControls();
  const { resetYZ } = useYControls();

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

  // --- X/div and Y/div computation ---
  const xZoom = zoomAll ? sharedZoom : (activePaneId ? paneXZooms[activePaneId] ?? null : null);
  const xDiv = (() => {
    const dom = xZoom ? { min: xZoom.left, max: xZoom.right } : null;
    const ticks = makeNiceTicks(dom);
    if (!ticks || ticks.length < 2) return '—';
    const step = ticks[1]! - ticks[0]!;
    return step >= 1e9 ? `${(step / 1e9).toFixed(1)}G/div`
      : step >= 1e6 ? `${(step / 1e6).toFixed(1)}M/div`
      : step >= 1e3 ? `${(step / 1e3).toFixed(1)}k/div`
      : `${step.toFixed(2)}/div`;
  })();

  const yZoom = activePaneId ? paneYZooms[activePaneId] ?? null : null;
  const yDiv = (() => {
    const ticks = makeNiceTicks(yZoom);
    if (!ticks || ticks.length < 2) return '—';
    const step = ticks[1]! - ticks[0]!;
    return `${step.toFixed(2)}/div`;
  })();

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
              active={mkrMode === 'normal'}
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
                {markers.map((_, i) => (
                  <option key={i} value={i}>M{i + 1}</option>
                ))}
              </select>
            )}
            <Btn
              title="Place a new marker on next click"
              onClick={() => uiDispatch({ type: 'SET', payload: { key: 'newMarkerArmed', value: true } })}
            >
              New Marker
            </Btn>
            <Btn
              title="Deselect active marker and ref line"
              onClick={() => {
                markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
                refLineDispatch({ type: 'SET_SELECTED', payload: null });
              }}
            >
              Unselect
            </Btn>
            <span style={{ fontSize: '11px', color: 'var(--dim)' }}>Trace:</span>
            <select
              value={markerTrace}
              onChange={(e) => uiDispatch({ type: 'SET', payload: { key: 'markerTrace', value: e.target.value } })}
              style={{ fontSize: '13px', padding: '4px 6px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', minWidth: '120px' }}
              title="Choose which trace new markers bind to"
            >
              <option value="__auto__">Auto</option>
              {visiblePaneTraces.map((trace) => (
                <option key={trace.name} value={trace.name}>
                  {trace.dn || trace.name}
                </option>
              ))}
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
            {panes.map((p, idx) => (
              <Btn
                key={p.id}
                active={activePaneId === p.id}
                onClick={() => paneDispatch({ type: 'SET_ACTIVE_PANE', payload: p.id })}
              >
                {p.title || `Pane ${idx + 1}`}
              </Btn>
            ))}
            <Btn title="Fit all panes" onClick={clearAllXZooms}>Fit All</Btn>
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
            <Btn
              active={lockLinesAcrossPanes}
              onClick={() => uiDispatch({ type: 'SET', payload: { key: 'lockLinesAcrossPanes', value: !lockLinesAcrossPanes } })}
            >
              {lockLinesAcrossPanes ? "Lock: All Panes" : "Lock: Active Pane"}
            </Btn>
          </>
        ))}

        {showViewTools && group("View", "var(--view-color)", (
          <>
            <Btn title="Zoom to fit all traces" onClick={clearAllXZooms}>Fit All</Btn>
            <Btn title="Reset current pane Y zoom" onClick={() => resetYZ()}>Reset Y</Btn>
            <Btn title="Reset X zoom" onClick={() => setZoom(null)}>Reset X</Btn>
            <span className="btn" style={{ fontFamily: 'var(--font-mono)', cursor: 'default' }}>X: {xDiv}</span>
            <span className="btn" style={{ fontFamily: 'var(--font-mono)', cursor: 'default' }}>Y: {yDiv}</span>
          </>
        ))}

      </div>
    </div>
  );
}
