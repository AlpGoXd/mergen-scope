import { useMemo } from 'react';
import { computeVSWR } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { fmtF } from '../../../domain/format';

export function VSWRCard() {
	const analysisDispatch = useAnalysisDispatch();
	const { target } = useAnalysisTarget();
	const result = useMemo(() => computeVSWR(target.touchstone), [target.touchstone]);

	return (
		<AnalysisFeatureCard
			title="VSWR"
			description="Voltage standing-wave ratio computed from the active Sii trace."
			onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'vswr', forceValue: false } })}
		>
			{!result && <div style={{ fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', color: 'var(--muted)' }}>No valid Touchstone reflection data.</div>}
			{result && (
				<div style={{ display: 'grid', gap: '6px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)' }}>
					<div>Min VSWR: <strong>{result.min.value.toFixed(4)}</strong> @ {fmtF(result.min.freq)}</div>
					<div>Max VSWR: <strong>{result.max.value.toFixed(4)}</strong> @ {fmtF(result.max.freq)}</div>
					<div>Average: <strong>{result.average.toFixed(4)}</strong></div>
					<div style={{ color: 'var(--muted)' }}>{result.count} samples</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
