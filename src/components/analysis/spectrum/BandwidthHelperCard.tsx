import { useState } from 'react';
import { useAnalysisState, useAnalysisDispatch } from '../../../stores/analysis-store';
import { useTraceState } from '../../../stores/trace-store';
import { useUiState } from '../../../stores/ui-store';
import { usePaneState } from '../../../stores/pane-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { MR } from '../../shared/MR';
import { Btn } from '../../shared/Btn';
import { computeBandwidth } from '../../../domain/analysis/bandwidth';
import { fmtF } from '../../../domain/format';

/**
 * BandwidthHelperCard for measuring 3dB/6dB/10dB bandwidth.
 */
export function BandwidthHelperCard() {
  const { allTraces } = useTraceState();
  const { selectedTraceName } = useUiState();
  const { activePaneId, tracePaneMap } = usePaneState();
  const { bandwidthResults } = useAnalysisState();
  const analysisDispatch = useAnalysisDispatch();

  const [sourceTrace, setSourceTrace] = useState<string>(selectedTraceName || '');
  const [dropDb, setDropDb] = useState<number>(3);
  
  const result = bandwidthResults[sourceTrace] || null;
  const trace = allTraces.find(t => t.name === sourceTrace);

  const handleCompute = () => {
    if (!trace) return;
    
    // In a real app, we might find the peak automatically if not provided.
    // For now, let's find the max amp in the visible data.
    const maxPoint = trace.data.reduce((prev, curr) => (curr.amp > prev.amp ? curr : prev), trace.data[0]!);
    if (!maxPoint) return;

    const res = computeBandwidth(trace.data, maxPoint.freq, maxPoint.amp, dropDb);
    analysisDispatch({ 
      type: 'SET_BANDWIDTH_RESULT', 
      payload: { id: sourceTrace, result: res } 
    });
  };

  return (
    <AnalysisFeatureCard 
      source={trace ? `${trace.dn || trace.name} · ${trace.file}` : undefined}
      title="Bandwidth Helper" 
      description="Calculate bandwidth at a specified dB drop from the peak."
      onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'bandwidth-helper', forceValue: false } })}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', color: 'var(--muted)', minWidth: '40px' }}>Drop:</span>
          <select 
            value={dropDb} 
            onChange={(e) => setDropDb(parseFloat(e.target.value))}
            style={{ flex: 1, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', padding: '0.24rem 0.45rem' }}
          >
            <option value="3">3 dB</option>
            <option value="6">6 dB</option>
            <option value="10">10 dB</option>
            <option value="20">20 dB</option>
          </select>
        </div>

        <Btn soft onClick={handleCompute} disabled={!sourceTrace} style={{ width: '100%', marginTop: '4px' }}>
          Compute Bandwidth
        </Btn>

        {result && (
          <>
            <div>
              <div className="ac-kv-k">Bandwidth</div>
              <div className="ac-result">{fmtF(result.bandwidth)}</div>
            </div>
            <div className="ac-kvs">
              <MR label="Center" value={fmtF((result.left + result.right) / 2)} />
              <MR label="Left Edge" value={fmtF(result.left)} />
              <MR label="Right Edge" value={fmtF(result.right)} />
              <div className="ac-note">Ref: {result.refAmp.toFixed(2)} dB @ {fmtF(result.refFreq)}</div>
            </div>
          </>
        )}
      </div>
    </AnalysisFeatureCard>
  );
}
