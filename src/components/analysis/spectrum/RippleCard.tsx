import { useState } from 'react';
import { useAnalysisState, useAnalysisDispatch } from '../../../stores/analysis-store';
import { useTraceState } from '../../../stores/trace-store';
import { useUiState } from '../../../stores/ui-store';
import { usePaneState } from '../../../stores/pane-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { Btn } from '../../shared/Btn';
import { computeRipple } from '../../../domain/analysis/ripple';
import { fmtF } from '../../../domain/format';

/**
 * RippleCard for measuring peak-to-peak ripple and flatness.
 */
export function RippleCard() {
  const { allTraces } = useTraceState();
  const { selectedTraceName } = useUiState();
  const { activePaneId, tracePaneMap } = usePaneState();
  const { rippleResults } = useAnalysisState();
  const analysisDispatch = useAnalysisDispatch();

  const [sourceTrace, setSourceTrace] = useState<string>(selectedTraceName || '');
  
  const result = rippleResults[sourceTrace] || null;
  const trace = allTraces.find(t => t.name === sourceTrace);

  const handleCompute = () => {
    if (!trace) return;
    const res = computeRipple(trace.data);
    analysisDispatch({ 
      type: 'SET_RIPPLE_RESULT', 
      payload: { id: sourceTrace, result: res } 
    });
  };

  return (
    <AnalysisFeatureCard 
      title="Ripple / Flatness" 
      description="Measure peak-to-peak variation and flatness across the entire trace."
      onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'ripple-flatness', forceValue: false } })}
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
          Compute Ripple
        </Btn>

        {result && (
          <div style={{ marginTop: '12px', padding: '10px', background: 'var(--bg-soft)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: 'var(--font-caption)', color: 'var(--dim)' }}>Peak-to-Peak Ripple</div>
              <div style={{ fontSize: 'var(--font-display)', lineHeight: 1.1, fontWeight: 'bold', color: 'var(--accent)' }}>{result.ripple.toFixed(3)} dB</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>Max Amp</div>
                <div style={{ color: 'var(--text)' }}>{result.max.amp.toFixed(2)} dB</div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>@ {fmtF(result.max.freq)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>Min Amp</div>
                <div style={{ color: 'var(--text)' }}>{result.min.amp.toFixed(2)} dB</div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>@ {fmtF(result.min.freq)}</div>
              </div>
              <div style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--font-caption)' }}>Span</div>
                <div style={{ color: 'var(--text)' }}>{fmtF(result.spanHz)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnalysisFeatureCard>
  );
}
