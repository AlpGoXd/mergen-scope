import { useState, useMemo } from 'react';
import { useAnalysisState, useAnalysisDispatch } from '../../../stores/analysis-store';
import { useTraceState } from '../../../stores/trace-store';
import { useUiState } from '../../../stores/ui-store';
import { usePaneState } from '../../../stores/pane-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { Btn } from '../../shared/Btn';
import { buildPeakSpurTable } from '../../../domain/analysis/range-stats';
import { fmtF } from '../../../domain/format';

/**
 * PeakTableCard component for finding and displaying peaks in a trace.
 * Ported from legacy in app-analysis-components.js.
 */
export function PeakTableCard() {
  const { allTraces } = useTraceState();
  const { selectedTraceName } = useUiState();
  const { activePaneId, tracePaneMap } = usePaneState();
  const { peakResults } = useAnalysisState();
  const analysisDispatch = useAnalysisDispatch();

  const [sourceTrace, setSourceTrace] = useState<string>(selectedTraceName || '');
  const [limit, setLimit] = useState<number>(10);
  const [minSpacingHz, setMinSpacingHz] = useState<number>(0);

  // Traces in the active pane are better candidates
  const paneTraces = useMemo(() => {
    return allTraces.filter(t => tracePaneMap[t.name] === activePaneId);
  }, [allTraces, tracePaneMap, activePaneId]);

  const results = peakResults[sourceTrace] || [];

  const handleFindPeaks = () => {
    const tr = allTraces.find(t => t.name === sourceTrace);
    if (!tr) return;

    const peaks = buildPeakSpurTable(tr.data, {
      limit,
      minSpacingHz,
      minAmp: null
    });

    analysisDispatch({ 
      type: 'SET_PEAKS_RESULT', 
      payload: { id: sourceTrace, result: peaks } 
    });
  };

  return (
    <AnalysisFeatureCard 
      title="Peak Table" 
      description="Identify and rank the highest peaks in a trace."
      onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'peak-spur-table', forceValue: false } })}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', color: 'var(--muted)', minWidth: '40px' }}>Trace:</span>
          <select 
            value={sourceTrace} 
            onChange={(e) => setSourceTrace(e.target.value)}
            style={{ flex: 1, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', padding: '0.24rem 0.45rem' }}
          >
            <option value="">(Select Trace)</option>
            {paneTraces.map(t => (
              <option key={t.name} value={t.name}>{t.dn || t.name}</option>
            ))}
            {allTraces.filter(t => tracePaneMap[t.name] !== activePaneId).map(t => (
              <option key={t.name} value={t.name}>{t.dn || t.name} (Other Pane)</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--font-caption)', color: 'var(--dim)', marginBottom: '2px' }}>Limit</div>
            <input 
              type="number" 
              value={limit} 
              onChange={(e) => setLimit(parseInt(e.target.value) || 1)} 
              style={{ width: '100%', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', padding: '0.24rem 0.45rem' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--font-caption)', color: 'var(--dim)', marginBottom: '2px' }}>Spacing (Hz)</div>
            <input 
              type="number" 
              value={minSpacingHz} 
              onChange={(e) => setMinSpacingHz(parseFloat(e.target.value) || 0)} 
              style={{ width: '100%', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', padding: '0.24rem 0.45rem' }}
            />
          </div>
        </div>

        <Btn 
          soft 
          onClick={handleFindPeaks} 
          disabled={!sourceTrace}
          style={{ width: '100%', marginTop: '4px' }}
        >
          Find Peaks
        </Btn>

        {results.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Rank</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Freq</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>Amp</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.rank} style={{ borderBottom: '1px dotted var(--da)', color: 'var(--text)' }}>
                    <td style={{ padding: '4px' }}>#{r.rank}</td>
                    <td style={{ padding: '4px' }}>{fmtF(r.freq)}</td>
                    <td style={{ padding: '4px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.amp.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AnalysisFeatureCard>
  );
}
