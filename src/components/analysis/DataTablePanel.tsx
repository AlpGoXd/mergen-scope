import { useMemo } from 'react';
import { useTraceState } from '../../stores/trace-store';
import { useUiState } from '../../stores/ui-store';

/**
 * DataTablePanel for inspecting raw signal points.
 */
export function DataTablePanel({ onClose }: { onClose?: () => void }) {
  const { allTraces } = useTraceState();
  const { selectedTraceName } = useUiState();

  const trace = useMemo(
    () => allTraces.find((item) => item.name === selectedTraceName) ?? null,
    [allTraces, selectedTraceName],
  );

  if (!trace) {
    return <div style={{ padding: '12px', color: 'var(--dim)', fontSize: '11px' }}>Select a trace to view data.</div>;
  }

  return (
    <div style={{ maxHeight: '400px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px' }}>
      {onClose && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>
          <span style={{ fontWeight: 700 }}>Data Table</span>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--dim)', cursor: 'pointer', fontSize: '14px' }}>&times;</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr', position: 'sticky', top: onClose ? 29 : 0, background: 'var(--card)', fontWeight: 700, padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
        <span>#</span><span>{trace.domain === 'time' ? 'Time' : 'Freq'}</span><span>{trace.units.y ?? 'Amp'}</span>
      </div>
      {trace.data.map((d, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr', padding: '2px 8px', background: i % 2 === 0 ? 'transparent' : 'var(--da, rgba(0,0,0,0.02))' }}>
          <span>{i + 1}</span>
          <span>{d.freq.toFixed(1)}</span>
          <span>{d.amp.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}
