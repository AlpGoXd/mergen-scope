import { useState } from 'react';
import { useAnalysisState, useAnalysisDispatch } from '../../../stores/analysis-store';
import { useTraceState } from '../../../stores/trace-store';
import { useUiState } from '../../../stores/ui-store';
import { usePaneState } from '../../../stores/pane-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { Btn } from '../../shared/Btn';
import { computeRangeStats } from '../../../domain/analysis/range-stats';
import { fmtF } from '../../../domain/format';

/**
 * RangeStatsCard for measuring min/max/avg over a trace.
 */
export function RangeStatsCard() {
  const { allTraces } = useTraceState();
  const { selectedTraceName } = useUiState();
  const { activePaneId, tracePaneMap } = usePaneState();
  const { rangeStatsResults } = useAnalysisState();
  const analysisDispatch = useAnalysisDispatch();

  const [sourceTrace, setSourceTrace] = useState<string>(selectedTraceName || '');
  
  const result = rangeStatsResults[sourceTrace] || null;
  const trace = allTraces.find(t => t.name === sourceTrace);

  const handleCompute = () => {
    if (!trace) return;
    const res = computeRangeStats(trace.data);
    analysisDispatch({ 
      type: 'SET_RANGE_STATS_RESULT', 
      payload: { id: sourceTrace, result: res } 
    });
  };

  return (
    <AnalysisFeatureCard 
      title="Range Statistics" 
      description="Calculate basic statistics (min, max, average) for the selected trace."
      onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'range-stats', forceValue: false } })}
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
            {allTraces.filter((t) => tracePaneMap[t.name] === activePaneId).map((t) => (
              <option key={t.name} value={t.name}>{t.dn || t.name}</option>
            ))}
          </select>
        </div>

        <Btn soft onClick={handleCompute} disabled={!sourceTrace} style={{ width: '100%', marginTop: '4px' }}>
          Compute Stats
        </Btn>

        {result && (
          <div style={{ marginTop: '12px', padding: '10px', background: 'var(--bg-soft)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)' }}>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>Maximum</div>
                <div style={{ color: 'var(--text)', fontWeight: 'bold' }}>{result.max.amp.toFixed(2)} dB</div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>@ {fmtF(result.max.freq)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>Minimum</div>
                <div style={{ color: 'var(--text)', fontWeight: 'bold' }}>{result.min.amp.toFixed(2)} dB</div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>@ {fmtF(result.min.freq)}</div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', gridColumn: 'span 2' }}>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>Average Amplitude</div>
                <div style={{ color: 'var(--text)', fontSize: 'var(--font-emphasis)', lineHeight: 'var(--lh-body)' }}>{result.average.toFixed(3)} dB</div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', gridColumn: 'span 2' }}>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>Frequency Span</div>
                <div style={{ color: 'var(--text)' }}>{fmtF(result.spanHz)}</div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>{result.count} samples analyzed</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnalysisFeatureCard>
  );
}
