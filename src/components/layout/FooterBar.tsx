import React from 'react';
import { useFileState } from '../../stores/file-store';
import { usePaneState } from '../../stores/pane-store';
import { useUiState } from '../../stores/ui-store';
import { useMarkerState } from '../../stores/marker-store';
import { useRefLineState } from '../../stores/ref-line-store';
import { useTraceState } from '../../stores/trace-store';

function deriveMode(armed: string | null, refMode: string | null): string {
  if (refMode === 'h') return 'H-Line';
  if (refMode === 'v') return 'V-Line';
  if (armed === 'normal') return 'Place Marker';
  if (armed === 'delta') return 'Place Delta';
  return 'Select';
}

const HINTS = [
  { action: 'L-click', effect: 'select / place' },
  { action: 'L-drag', effect: 'move marker / ref line' },
  { action: 'R-drag', effect: 'X zoom / pan' },
  { action: 'Wheel', effect: 'Y zoom' },
  { action: 'Shift+Wheel', effect: 'Y pan' },
  { action: 'Middle', effect: 'reset X + Y' },
];

/**
 * FooterBar — status row (mode · target · trace) + compact control hints.
 */
export function FooterBar() {
  const { files } = useFileState();
  const hasData = files.length > 0;

  const { activePaneId, paneActiveTraceMap, tracePaneMap } = usePaneState();
  const { selectedTraceName } = useUiState();
  const { armed } = useMarkerState();
  const { refMode } = useRefLineState();
  const { allTraces } = useTraceState();

  if (!hasData) return null;

  const paneNum = activePaneId ? activePaneId.split('-')[1] : '—';
  const mode = deriveMode(armed?.kind ?? null, refMode);

  const activeTraceName: string | null =
    (activePaneId ? paneActiveTraceMap[activePaneId] : null)
    ?? selectedTraceName
    ?? Object.entries(tracePaneMap).find(([, pid]) => pid.includes(activePaneId ?? ''))?.[0]
    ?? null;
  const traceLabel = activeTraceName
    ? (allTraces.find(t => t.name === activeTraceName)?.dn ?? activeTraceName)
    : 'none';

  const muted: React.CSSProperties = { color: 'var(--muted)' };
  const val: React.CSSProperties = { color: 'var(--text)', fontWeight: 500 };
  const sep: React.CSSProperties = { margin: '0 8px', color: 'var(--muted)', opacity: 0.4 };

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      flexShrink: 0,
      background: 'var(--card)',
    }}>
      {/* Status row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 12px',
        fontSize: 'var(--font-caption)',
        gap: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
      }}>
        <span style={val}>{mode}</span>
        <span style={sep}>·</span>
        <span style={muted}>Target:</span>&nbsp;<span style={val}>Pane {paneNum}</span>
        <span style={sep}>·</span>
        <span style={muted}>Trace:</span>&nbsp;
        <span style={{ ...val, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px', display: 'inline-block', verticalAlign: 'bottom' }}>
          {traceLabel}
        </span>
        {/* Compact control hints after a wider separator */}
        <span style={{ ...sep, margin: '0 12px' }}>|</span>
        {HINTS.map((h, i) => (
          <React.Fragment key={h.action}>
            <span style={muted}>{h.action}</span>
            <span style={{ color: 'var(--dim, var(--muted))', marginLeft: 4 }}>{h.effect}</span>
            {i < HINTS.length - 1 && <span style={sep}>·</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
