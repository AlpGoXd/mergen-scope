import { useMemo } from 'react';
import { computeReturnLoss } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { fmtF } from '../../../domain/format';

export function ReturnLossCard() {
	const analysisDispatch = useAnalysisDispatch();
	const { target } = useAnalysisTarget();
	const result = useMemo(() => computeReturnLoss(target.touchstone), [target.touchstone]);

	return (
		<AnalysisFeatureCard
			title="Return Loss"
			description="Return loss from the active reflection coefficient."
			onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'return-loss', forceValue: false } })}
		>
			{!result && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No valid Touchstone reflection data.</div>}
			{result && (
				<div style={{ display: 'grid', gap: '6px', fontSize: '11px' }}>
					<div>Min RL: <strong>{result.min.value.toFixed(3)} dB</strong> @ {fmtF(result.min.freq)}</div>
					<div>Max RL: <strong>{result.max.value.toFixed(3)} dB</strong> @ {fmtF(result.max.freq)}</div>
					<div>Average: <strong>{result.average.toFixed(3)} dB</strong></div>
					<div style={{ color: 'var(--muted)' }}>{result.count} samples</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
