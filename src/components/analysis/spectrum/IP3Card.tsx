import { useIP3 } from '../../../hooks/use-ip3';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useTraceState } from '../../../stores/trace-store';
import type { IP3RoleKey } from '../../../types/marker';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { Btn } from '../../shared/Btn';
import { MR } from '../../shared/MR';
import { Sec } from '../../shared/Sec';

/**
 * IP3 / TOI Analysis Card.
 * Ported from legacy IP3Panel in app-analysis-components.js.
 */
export function IP3Card() {
  const { 
    ip3Pts, 
    ip3Res, 
    ip3Gain, 
    setIP3Gain, 
    ip3Results, 
    saveIP3 
  } = useIP3();
  
  const { allTraces } = useTraceState();
  const analysisDispatch = useAnalysisDispatch();

  const handleSave = () => {
    const firstTrace = allTraces[0];
    if (ip3Res && firstTrace) {
      saveIP3(firstTrace);
    }
  };

  const roles: ReadonlyArray<{ key: IP3RoleKey; label: string; color: string }> = [
    { key: 'f1', label: 'F1 (Main)', color: '#3fb950' },
    { key: 'f2', label: 'F2 (Main)', color: '#3fb950' },
    { key: 'im3l', label: 'IM3 Lower', color: '#ff7b72' },
    { key: 'im3u', label: 'IM3 Upper', color: '#ff7b72' },
  ];

  return (
    <AnalysisFeatureCard 
      title="IP3 / TOI" 
      color="var(--ip3C)" 
      description="Calculate Third-Order Intercept point from placed markers. Assign marker roles (F1, F2, IM3L, IM3U) via the marker menu or auto-pick."
      onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'ip3', forceValue: false } })}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {roles.map((r) => {
            const point = ip3Pts[r.key];
            return (
              <div key={r.key} style={{ 
                padding: '6px', 
                border: '1px solid var(--border)', 
                borderRadius: '6px',
                background: point ? 'var(--da)' : 'transparent',
                fontSize: '11px'
              }}>
                <div style={{ color: r.color, fontWeight: 700, marginBottom: '2px' }}>{r.label}</div>
                <div style={{ fontFamily: 'monospace', color: point ? 'var(--text)' : 'var(--dim)' }}>
                  {point ? `${(point.freq / 1e6).toFixed(2)} MHz` : '---'}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>Power Gain (dB)</label>
          <input 
            type="text" 
            value={ip3Gain} 
            onChange={(e) => setIP3Gain(e.target.value)}
            placeholder="0.0"
            style={{ 
              width: '100%', 
              background: 'var(--bg)', 
              color: 'var(--text)', 
              border: '1px solid var(--border)', 
              borderRadius: '6px', 
              padding: '6px',
              fontSize: '12px' 
            }}
          />
        </div>

        <div style={{ padding: '8px', background: 'var(--da)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <MR label="OIP3 avg" value={ip3Res ? `${ip3Res.oip3_avg.toFixed(2)} dBm` : '--'} vc="var(--ip3C)" />
          <MR label="OIP3 Lower" value={ip3Res ? `${ip3Res.oip3_l.toFixed(2)} dBm` : '--'} />
          <MR label="OIP3 Upper" value={ip3Res ? `${ip3Res.oip3_u.toFixed(2)} dBm` : '--'} />
          <div style={{ marginTop: '8px' }}>
            <Btn soft color="var(--ip3C)" style={{ width: '100%' }} disabled={!ip3Res} onClick={handleSave}>
              Save Result
            </Btn>
          </div>
        </div>

        {Object.keys(ip3Results).length > 0 && (
          <>
            <Sec>Saved Results</Sec>
            {Object.entries(ip3Results).map(([id, r]) => (
              <div key={id} style={{ 
                padding: '8px', 
                background: 'var(--card)', 
                border: '1px solid var(--border)', 
                borderRadius: '8px', 
                marginBottom: '4px',
                position: 'relative'
              }}>
                <button 
                  onClick={() => analysisDispatch({ type: 'SET_IP3_RESULT', payload: { id, result: null } })}
                  style={{ position: 'absolute', right: '8px', top: '4px', background: 'none', border: 'none', color: '#f55', cursor: 'pointer' }}
                >
                  &times;
                </button>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ip3C)', marginBottom: '4px' }}>
                   {r?.f1 && r?.f2 ? `${(r.f1 / 1e6).toFixed(1)} / ${(r.f2 / 1e6).toFixed(1)} MHz` : id}
                </div>
                <MR label="OIP3" value={r ? `${(r.oip3_avg || 0).toFixed(2)} dBm` : '--'} />
              </div>
            ))}
          </>
        )}
      </div>
    </AnalysisFeatureCard>
  );
}
