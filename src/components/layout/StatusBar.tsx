import React from 'react';
import { usePaneState } from '../../stores/pane-store';
import { useUiState } from '../../stores/ui-store';
import { useMarkerState } from '../../stores/marker-store';
import { useRefLineState } from '../../stores/ref-line-store';
import { useTraceState } from '../../stores/trace-store';
import { paneName } from '../../domain/line-view';

function deriveMode(armed: string | null, refMode: string | null): string {
  if (refMode === 'h') return 'H-Line';
  if (refMode === 'v') return 'V-Line';
  if (armed === 'normal') return 'Place Marker';
  if (armed === 'delta') return 'Place Delta';
  return 'Select';
}

export function StatusBar() {
  const { activePaneId, paneActiveTraceMap, tracePaneMap, panes } = usePaneState();
  const { selectedTraceName } = useUiState();
  const { armed } = useMarkerState();
  const { refMode } = useRefLineState();
  const { allTraces } = useTraceState();

  const targetName = activePaneId ? paneName(panes, activePaneId) : '—';
  const mode = deriveMode(armed?.kind ?? null, refMode);

  const activeTraceName: string | null =
    (activePaneId ? paneActiveTraceMap[activePaneId] : null)
    ?? selectedTraceName
    ?? Object.entries(tracePaneMap).find(([, pid]) => pid.includes(activePaneId ?? ''))?.[0]
    ?? null;
  const traceLabel = activeTraceName
    ? (allTraces.find(t => t.name === activeTraceName)?.name ?? activeTraceName)
    : 'none';

  const dim: React.CSSProperties = { color: 'var(--muted)' };
  const val: React.CSSProperties = { color: 'var(--text)' };
  const dot: React.CSSProperties = { margin: '0 6px', color: 'var(--dim, var(--muted))', opacity: 0.5 };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '3px 12px',
      fontSize: 'var(--font-caption)',
      background: 'var(--card)',
      borderBottom: '1px solid var(--border)',
      gap: 0,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    }}>
      <span style={dim}>Mode:</span>&nbsp;<span style={val}>{mode}</span>
      <span style={dot}>·</span>
      <span style={dim}>Target:</span>&nbsp;<span style={val}>{targetName}</span>
      <span style={dot}>·</span>
      <span style={dim}>Trace:</span>&nbsp;<span style={{ ...val, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px', display: 'inline-block', verticalAlign: 'bottom' }}>{traceLabel}</span>
    </div>
  );
}
