import { useState } from 'react';
import { useAnalysisState, useAnalysisDispatch } from '../../../stores/analysis-store';
import { useTraceState } from '../../../stores/trace-store';
import { useUiState } from '../../../stores/ui-store';
import { usePaneState } from '../../../stores/pane-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { MR } from '../../shared/MR';
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
      source={trace ? `${trace.dn || trace.name} · ${trace.file}` : undefined}
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
            {allTraces.filter((t) => tracePaneMap[t.name]?.includes(activePaneId ?? '')).map((t) => (
              <option key={t.name} value={t.name}>{t.dn || t.name}</option>
            ))}
          </select>
        </div>

        <Btn soft onClick={handleCompute} disabled={!sourceTrace} style={{ width: '100%', marginTop: '4px' }}>
          Compute Ripple
        </Btn>

        {result && (
          <>
            <div>
              <div className="ac-kv-k">Peak-to-Peak Ripple</div>
              <div className="ac-result">{result.ripple.toFixed(3)}<small>dB</small></div>
            </div>
            <div className="ac-kvs">
              <MR label="Max Amp" value={`${result.max.amp.toFixed(2)} dB @ ${fmtF(result.max.freq)}`} />
              <MR label="Min Amp" value={`${result.min.amp.toFixed(2)} dB @ ${fmtF(result.min.freq)}`} />
              <MR label="Span" value={fmtF(result.spanHz)} />
            </div>
          </>
        )}
      </div>
    </AnalysisFeatureCard>
  );
}
