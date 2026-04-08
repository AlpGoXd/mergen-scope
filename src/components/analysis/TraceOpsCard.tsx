import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { areUnitsCompatible } from '../../domain/units';
import { useTraceState } from '../../stores/trace-store';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useTraceOps } from '../../hooks/use-trace-ops';
import type { BinaryOp, InterpolationMethod, SmoothingMethod } from '../../domain/trace-ops';
import { AnalysisFeatureCard } from './AnalysisFeatureCard';
import { Btn } from '../shared/Btn';
import { Sec } from '../shared/Sec';

const INPUT_STYLE: CSSProperties = {
  fontSize: '11px',
  padding: '4px 6px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
};

function CollapsibleSection(props: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const { title, open, onToggle, children } = props;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
      <button type="button" onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: 'none', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}>
        <Sec first>{title}</Sec>
        <span style={{ fontSize: '11px', color: 'var(--dim)' }}>{open ? '-' : '+'}</span>
      </button>
      {open && <div style={{ padding: '10px', display: 'grid', gap: '8px' }}>{children}</div>}
    </div>
  );
}

function TraceSelect(props: { label: string; value: string; onChange: (value: string) => void; traces: readonly { name: string; dn?: string }[] }) {
  const { label, value, onChange, traces } = props;
  return (
    <label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}>
      <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={INPUT_STYLE}>
        <option value="">(Select trace)</option>
        {traces.map((trace) => <option key={trace.name} value={trace.name}>{trace.dn || trace.name}</option>)}
      </select>
    </label>
  );
}

export function TraceOpsCard() {
  const { allTraces } = useTraceState();
  const { traceOpsOpenSections } = useUiState();
  const uiDispatch = useUiDispatch();
  const {
    offsetSource, setOffsetSource, offsetValue, setOffsetValue,
    scaleSource, setScaleSource, scaleValue, setScaleValue,
    smoothSource, setSmoothSource, smoothMethod, setSmoothMethod, smoothWindow, setSmoothWindow, smoothPolyOrder, setSmoothPolyOrder,
    subtractA, setSubtractA, subtractB, setSubtractB, traceMathOperation, setTraceMathOperation, subtractInterpolation, setSubtractInterpolation,
    error, applyOffset, applyScale, applySmoothing, applyTraceMath,
  } = useTraceOps();

  const compatibility = useMemo(() => {
    const traceA = allTraces.find((trace) => trace.name === subtractA) ?? null;
    const traceB = allTraces.find((trace) => trace.name === subtractB) ?? null;
    if (!traceA || !traceB) return null;
    return areUnitsCompatible(traceA.units.y, traceB.units.y, traceMathOperation);
  }, [allTraces, subtractA, subtractB, traceMathOperation]);

  const toggleSection = (key: keyof typeof traceOpsOpenSections) => {
    uiDispatch({ type: 'SET', payload: { key: 'traceOpsOpenSections', value: { ...traceOpsOpenSections, [key]: !traceOpsOpenSections[key] } } });
  };

  return (
    <AnalysisFeatureCard title="Trace Ops" description="Create derived traces with offset, scale, smoothing, and trace math.">
      <div style={{ display: 'grid', gap: '10px' }}>
        <CollapsibleSection title="Offset" open={traceOpsOpenSections.offset} onToggle={() => toggleSection('offset')}>
          <TraceSelect label="Source trace" value={offsetSource} onChange={setOffsetSource} traces={allTraces} />
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--muted)', fontWeight: 700 }}>dB</span><input type="number" step="0.1" value={offsetValue} onChange={(event) => setOffsetValue(event.target.value)} style={INPUT_STYLE} /></label>
          <Btn soft onClick={applyOffset} disabled={!offsetSource}>Create Offset Trace</Btn>
        </CollapsibleSection>

        <CollapsibleSection title="Scale" open={traceOpsOpenSections.scale} onToggle={() => toggleSection('scale')}>
          <TraceSelect label="Source trace" value={scaleSource} onChange={setScaleSource} traces={allTraces} />
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--muted)', fontWeight: 700 }}>×</span><input type="number" step="0.1" value={scaleValue} onChange={(event) => setScaleValue(event.target.value)} style={INPUT_STYLE} /></label>
          <Btn soft onClick={applyScale} disabled={!scaleSource}>Create Scaled Trace</Btn>
        </CollapsibleSection>

        <CollapsibleSection title="Smoothing" open={traceOpsOpenSections.smoothing} onToggle={() => toggleSection('smoothing')}>
          <TraceSelect label="Source trace" value={smoothSource} onChange={setSmoothSource} traces={allTraces} />
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Method</span>
            <select value={smoothMethod} onChange={(event) => setSmoothMethod((event.target.value === 'median' ? 'median-filter' : event.target.value) as SmoothingMethod)} style={INPUT_STYLE}>
              <option value="moving-average">moving-average</option>
              <option value="median">median</option>
              <option value="savitzky-golay">savitzky-golay</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Window</span><input type="number" min="3" step="2" value={smoothWindow} onChange={(event) => setSmoothWindow(event.target.value)} style={INPUT_STYLE} /></label>
          {smoothMethod === 'savitzky-golay' && <label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Poly order</span><input type="number" min="1" step="1" value={smoothPolyOrder} onChange={(event) => setSmoothPolyOrder(event.target.value)} style={INPUT_STYLE} /></label>}
          <Btn soft onClick={applySmoothing} disabled={!smoothSource}>Create Smoothed Trace</Btn>
        </CollapsibleSection>

        <CollapsibleSection title="Trace Math" open={traceOpsOpenSections.subtract} onToggle={() => toggleSection('subtract')}>
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Operation</span>
            <select value={traceMathOperation} onChange={(event) => setTraceMathOperation(event.target.value as BinaryOp)} style={INPUT_STYLE}>
              {(['subtract', 'add', 'multiply', 'divide'] as const).map((operation) => <option key={operation} value={operation}>{operation}</option>)}
            </select>
          </label>
          <TraceSelect label="Trace A" value={subtractA} onChange={setSubtractA} traces={allTraces} />
          <TraceSelect label="Trace B" value={subtractB} onChange={setSubtractB} traces={allTraces} />
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Interpolation</span>
            <select value={subtractInterpolation} onChange={(event) => setSubtractInterpolation(event.target.value as InterpolationMethod)} style={INPUT_STYLE}>
              {(['auto', 'exact', 'linear', 'nearest', 'previous', 'next', 'cubic'] as const).map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          {compatibility && !compatibility.compatible && <div style={{ fontSize: '11px', color: '#ff6b6b' }}>{compatibility.warning ?? 'Trace units are not compatible.'}</div>}
          {compatibility && compatibility.compatible && compatibility.warning && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{compatibility.warning}</div>}
          {error && <div style={{ fontSize: '11px', color: '#ff6b6b' }}>{error}</div>}
          <Btn soft onClick={applyTraceMath} disabled={!subtractA || !subtractB}>Create Result</Btn>
        </CollapsibleSection>
      </div>
    </AnalysisFeatureCard>
  );
}
