import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import type { UiState } from '../../stores/ui-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { usePaneState, usePaneDispatch } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { buildExtrema, findHighestPeakExcluding } from '../../domain/markers';
import { makeNiceTicks } from '../../domain/trace-math';
import { Btn } from '../shared/Btn';

/**
 * ToolbarStrip component for chart-local actions in the active pane.
 * Ported from legacy ToolbarStrip in app-shell-components.js.
 */
export function ToolbarStrip() {
  const {
    showMarkerTools,
    showPaneTools,
    showSearchTools,
    showLineTools,
    showViewTools,
    searchDirection,
    lockLinesAcrossPanes,
    dRef,
  } = useUiState();

  const { allTraces } = useTraceState();
  const { mkrMode, markers, selectedMkrIdx } = useMarkerState();
  const { panes, activePaneId, tracePaneMap, paneActiveTraceMap, zoomAll, sharedZoom, paneXZooms, paneYZooms } = usePaneState();
  const { refMode } = useRefLineState();

  const uiDispatch = useUiDispatch();
  const markerDispatch = useMarkerDispatch();
  const paneDispatch = usePaneDispatch();
  const refLineDispatch = useRefLineDispatch();

  // If no traces have data, hide the toolbar
  if (!allTraces.some(t => t.data && t.data.length > 0)) return null;

  // --- Active trace resolution ---
  const paneTraceNames = Object.entries(tracePaneMap)
    .filter(([, pid]) => pid === activePaneId)
    .map(([n]) => n);
  const activeTraceName =
    (activePaneId != null ? paneActiveTraceMap[activePaneId] : null)
    ?? paneTraceNames[0]
    ?? null;
  const activeTr = allTraces.find(t => t.name === activeTraceName) ?? null;

  // --- Peak/Min search handlers ---
  const xSpanOf = (tr: typeof activeTr) => {
    if (!tr || tr.data.length < 2) return 0;
    return (tr.data[tr.data.length - 1]?.freq ?? 0) - (tr.data[0]?.freq ?? 0);
  };

  const handlePeak = () => {
    if (!activeTr || activeTr.data.length === 0) return;
    const extrema = buildExtrema(activeTr.data, 'max');
    const best = extrema[0];
    if (!best) return;
    if (selectedMkrIdx >= 0) {
      markerDispatch({ type: 'UPDATE_MARKER', payload: { idx: selectedMkrIdx, updates: { freq: best.freq, amp: best.amp } } });
    } else {
      markerDispatch({ type: 'PLACE_MARKER', payload: { traceData: activeTr.data, targetFreq: best.freq, traceName: activeTr.name } });
    }
  };

  const handleNextPeak = () => {
    if (!activeTr || activeTr.data.length === 0) return;
    const existingFreqs = markers.filter(m => m.trace === activeTr.name).map(m => m.freq);
    const exHz = xSpanOf(activeTr) * 0.01;
    const best = findHighestPeakExcluding(activeTr.data, existingFreqs, exHz);
    if (!best) return;
    markerDispatch({ type: 'PLACE_MARKER', payload: { traceData: activeTr.data, targetFreq: best.freq, traceName: activeTr.name } });
  };

  const handleMin = () => {
    if (!activeTr || activeTr.data.length === 0) return;
    const extrema = buildExtrema(activeTr.data, 'min');
    const best = extrema[0];
    if (!best) return;
    if (selectedMkrIdx >= 0) {
      markerDispatch({ type: 'UPDATE_MARKER', payload: { idx: selectedMkrIdx, updates: { freq: best.freq, amp: best.amp } } });
    } else {
      markerDispatch({ type: 'PLACE_MARKER', payload: { traceData: activeTr.data, targetFreq: best.freq, traceName: activeTr.name } });
    }
  };

  const handleNextMin = () => {
    if (!activeTr || activeTr.data.length === 0) return;
    const extrema = buildExtrema(activeTr.data, 'min');
    const existingFreqs = markers.filter(m => m.trace === activeTr.name).map(m => m.freq);
    const exHz = xSpanOf(activeTr) * 0.01;
    const nextMin = extrema.find(p => existingFreqs.every(f => Math.abs(p.freq - f) > exHz));
    if (!nextMin) return;
    markerDispatch({ type: 'PLACE_MARKER', payload: { traceData: activeTr.data, targetFreq: nextMin.freq, traceName: activeTr.name } });
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
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      padding: '4px 8px',
      border: `1px solid color-mix(in srgb, ${color} 35%, var(--border))`,
      borderRadius: '8px',
      background: `color-mix(in srgb, ${color} 10%, var(--card))`,
      flexWrap: 'wrap'
    }}>
      <span style={{ fontSize: '10px', color, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px' }}>
        {title}
      </span>
      {children}
    </div>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      padding: '6px 12px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      background: 'var(--card)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>

        {showMarkerTools && group("Marker", "#d7ae63", (
          <>
            <Btn
              active={mkrMode === 'normal'}
              color="#d73f75"
              title="Normal marker mode"
              onClick={() => markerDispatch({ type: 'SET_MODE', payload: 'normal' })}
            >
              Normal
            </Btn>
            <Btn
              active={mkrMode === 'delta'}
              color="#8a7a66"
              title="Delta marker mode"
              onClick={() => markerDispatch({ type: 'SET_MODE', payload: 'delta' })}
            >
              Delta
            </Btn>
            {mkrMode === 'delta' && (
              <select
                value={dRef ?? ''}
                onChange={e => {
                  const v: number | null = e.target.value === '' ? null : Number(e.target.value);
                  uiDispatch({ type: 'SET', payload: { key: 'dRef', value: v as UiState[keyof UiState] } });
                }}
                style={{ fontSize: '11px', padding: '3px 5px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
              >
                <option value="">Ref…</option>
                {markers.map((_, i) => (
                  <option key={i} value={i}>M{i + 1}</option>
                ))}
              </select>
            )}
            <Btn
              active={false}
              color="#666"
              title="Place a new marker on next click"
              onClick={() => uiDispatch({ type: 'SET', payload: { key: 'newMarkerArmed', value: true as UiState[keyof UiState] } })}
            >
              New Marker
            </Btn>
            <Btn
              color="#666"
              title="Deselect active marker and ref line"
              onClick={() => {
                markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
                refLineDispatch({ type: 'SET_SELECTED', payload: null });
              }}
            >
              Unselect
            </Btn>
          </>
        ))}

        {showPaneTools && group("Pane", "#e69473", (
          <>
            <Btn
              color="#888"
              onClick={() => paneDispatch({ type: 'SET_PANE_COUNT', payload: Math.min(4, panes.length + 1) })}
              disabled={panes.length >= 4}
              title="Add a pane"
            >
              + Pane
            </Btn>
            <Btn
              color="#888"
              onClick={() => paneDispatch({ type: 'SET_PANE_COUNT', payload: Math.max(1, panes.length - 1) })}
              disabled={panes.length <= 1}
              title="Remove last pane"
            >
              - Pane
            </Btn>
            {panes.map((p, idx) => (
              <Btn
                key={p.id}
                color="#e85d04"
                active={activePaneId === p.id}
                onClick={() => paneDispatch({ type: 'SET_ACTIVE_PANE', payload: p.id })}
              >
                {p.title || `Pane ${idx + 1}`}
              </Btn>
            ))}
            <Btn
              color="#888"
              title="Fit all panes"
              onClick={() => paneDispatch({ type: 'CLEAR_ALL_ZOOMS' })}
            >
              Fit All
            </Btn>
          </>
        ))}

        {showSearchTools && group("Search", "#7eb2da", (
          <>
            <Btn color="#888" title="Find peak" onClick={handlePeak}>Peak</Btn>
            <Btn color="#888" title="Find next peak" onClick={handleNextPeak}>Next Peak</Btn>
            <Btn color="#888" title="Find min" onClick={handleMin}>Min</Btn>
            <Btn color="#888" title="Find next min" onClick={handleNextMin}>Next Min</Btn>
            <Btn
              color="#c05be3"
              active={true}
              style={{
                background: 'linear-gradient(135deg, rgba(255, 154, 192, 0.42), rgba(192, 91, 227, 0.34))',
                border: '1px solid #c05be3',
                color: '#8b2bb1',
              }}
              onClick={() => uiDispatch({ type: 'SET', payload: { key: 'searchDirection', value: (searchDirection === 'right' ? 'left' : 'right') as UiState[keyof UiState] } })}
            >
              {searchDirection === 'right' ? "Dir: L -> R" : "Dir: L <- R"}
            </Btn>
          </>
        ))}

        {showLineTools && group("Lines", "#d8ac7a", (
          <>
            <Btn
              color="#666"
              active={refMode === 'v'}
              title="Toggle V-line placement"
              onClick={() => refLineDispatch({ type: 'SET_MODE', payload: refMode === 'v' ? null : 'v' })}
            >
              V-Line
            </Btn>
            <Btn
              color="#666"
              active={refMode === 'h'}
              title="Toggle H-line placement"
              onClick={() => refLineDispatch({ type: 'SET_MODE', payload: refMode === 'h' ? null : 'h' })}
            >
              H-Line
            </Btn>
            <Btn
              color="#666"
              active={lockLinesAcrossPanes}
              onClick={() => uiDispatch({ type: 'SET', payload: { key: 'lockLinesAcrossPanes', value: !lockLinesAcrossPanes as UiState[keyof UiState] } })}
            >
              {lockLinesAcrossPanes ? "Lock: All Panes" : "Lock: Active Pane"}
            </Btn>
          </>
        ))}

        {showViewTools && group("View", "#8db7df", (
          <>
            <Btn
              color="#1f8fff"
              title="Zoom to fit all traces"
              onClick={() => paneDispatch({ type: 'CLEAR_ALL_ZOOMS' })}
            >
              Fit All
            </Btn>
            <Btn
              color="#666"
              title="Reset current pane Y zoom"
              onClick={() => {
                if (activePaneId) {
                  paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId: activePaneId, zoom: null } });
                }
              }}
            >
              Reset Y
            </Btn>
            <Btn
              color="#666"
              title="Reset X zoom"
              onClick={() => {
                if (zoomAll) {
                  paneDispatch({ type: 'SET_SHARED_ZOOM', payload: null });
                } else if (activePaneId) {
                  paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId: activePaneId, zoom: null } });
                }
              }}
            >
              Reset X
            </Btn>
            <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'monospace', padding: '0 4px' }}>X: {xDiv}</span>
            <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'monospace', padding: '0 4px' }}>Y: {yDiv}</span>
          </>
        ))}

      </div>
    </div>
  );
}
