import { useNoisePSD } from '../../../hooks/use-noise-psd';
import { useTraceState } from '../../../stores/trace-store';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { Btn } from '../../shared/Btn';
import { MR } from '../../shared/MR';
import { Sec } from '../../shared/Sec';

/**
 * Noise PSD Analysis Card.
 * Ported from legacy NoisePSDPanel in app-analysis-components.js.
 */
export function NoisePSDCard() {
  const { 
    noiseFilter, 
    setNoiseFilter, 
    noiseSource, 
    setNoiseSource, 
    result: currentResult,
    compute,
    noiseResults, 
    addSavedNoise 
  } = useNoisePSD();
  
  const { allTraces } = useTraceState();
  const analysisDispatch = useAnalysisDispatch();

  const handleSave = () => {
    if (currentResult) {
      addSavedNoise(currentResult.stats);
    }
  };

  return (
    <AnalysisFeatureCard 
      title="Noise PSD" 
      color="var(--noiseTr)" 
      description="Calculate Power Spectral Density normalized to a user-defined filter bandwidth."
      onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'noise-psd', forceValue: false } })}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: 'var(--font-label)', fontWeight: 400, color: 'var(--muted)' }}>Source Trace</label>
          <select 
            value={noiseSource || ''} 
            onChange={(e) => setNoiseSource(e.target.value)}
            style={{ 
              width: '100%', 
              background: 'var(--bg)', 
              color: 'var(--text)', 
              border: '1px solid var(--border)', 
              borderRadius: '6px', 
              padding: '6px',
              fontSize: 'var(--font-body)',
              lineHeight: 'var(--lh-body)' 
            }}
          >
            <option value="">(Select Trace)</option>
            {allTraces.map(tr => (
              <option key={tr.name} value={tr.name}>{tr.dn || tr.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: 'var(--font-label)', fontWeight: 400, color: 'var(--muted)' }}>Filter Bandwidth</label>
          <input 
            type="text" 
            value={noiseFilter} 
            onChange={(e) => setNoiseFilter(e.target.value)}
            placeholder="e.g. 1 (Hz), 1k (kHz)"
            style={{ 
              width: '100%', 
              background: 'var(--bg)', 
              color: 'var(--text)', 
              border: '1px solid var(--border)', 
              borderRadius: '6px', 
              padding: '6px',
              fontSize: 'var(--font-body)',
              lineHeight: 'var(--lh-body)' 
            }}
          />
        </div>

        <Btn soft color="var(--noiseTr)" onClick={compute} style={{ width: '100%' }} disabled={!allTraces.length}>
          Calculate
        </Btn>

        {currentResult && (
          <div style={{ padding: '8px', background: 'var(--da)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <MR label="Peak Density" value={`${currentResult.stats.peak?.amp.toFixed(3) ?? '--'}`} vc="var(--noiseTr)" />
            <MR label="Avg Density" value={currentResult.stats.avg != null ? `${currentResult.stats.avg.toFixed(3)} dB` : '--'} vc="var(--noiseTr)" />
            <MR label="Min Density" value={`${currentResult.stats.min?.amp.toFixed(3) ?? '--'}`} vc="var(--noiseTr)" />
            <MR label="RBW" value={`${currentResult.stats.rbw.toFixed(3)} Hz`} vc="var(--noiseTr)" />
            <div style={{ marginTop: '8px' }}>
              <Btn soft color="var(--noiseTr)" style={{ width: '100%' }} onClick={handleSave}>
                Save Result
              </Btn>
            </div>
          </div>
        )}

        {Object.keys(noiseResults).length > 0 && (
          <>
            <Sec>Saved Results</Sec>
            {Object.entries(noiseResults).map(([id, result]) => (
              <div key={id} style={{ 
                padding: '8px', 
                background: 'var(--card)', 
                border: '1px solid var(--border)', 
                borderRadius: '8px', 
                marginBottom: '4px',
                position: 'relative'
              }}>
                <button 
                  onClick={() => analysisDispatch({ type: 'SET_NOISE_RESULT', payload: { id, result: null } })}
                  style={{ position: 'absolute', right: '8px', top: '4px', background: 'none', border: 'none', color: '#f55', cursor: 'pointer' }}
                >
                  &times;
                </button>
                <div style={{ fontSize: 'var(--font-label)', fontWeight: 400, color: 'var(--noiseTr)', marginBottom: '4px' }}>
                  {id}
                </div>
                <MR label="Samples" value={`${result.length}`} />
              </div>
            ))}
          </>
        )}
      </div>
    </AnalysisFeatureCard>
  );
}

