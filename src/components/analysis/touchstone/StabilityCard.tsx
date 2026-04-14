import { useMemo } from 'react';
import { computeStabilityFactors } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { fmtF } from '../../../domain/format';

export function StabilityCard() {
	const analysisDispatch = useAnalysisDispatch();
	const { target } = useAnalysisTarget();
	const result = useMemo(() => computeStabilityFactors(target.touchstone), [target.touchstone]);

	return (
		<AnalysisFeatureCard
			title="Touchstone Stability"
			description="K, mu1, and mu2 stability factors for two-port networks."
			onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'touchstone-stability', forceValue: false } })}
		>
			{!result && <div style={{ fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', color: 'var(--muted)' }}>Requires a 2-port Touchstone network.</div>}
			{result && (
				<div style={{ display: 'grid', gap: '6px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)' }}>
					<div>Min K: <strong>{result.minK.value.toFixed(4)}</strong> @ {fmtF(result.minK.freq)}</div>
					<div>Min mu1: <strong>{result.minMu1.value.toFixed(4)}</strong> @ {fmtF(result.minMu1.freq)}</div>
					<div>Min mu2: <strong>{result.minMu2.value.toFixed(4)}</strong> @ {fmtF(result.minMu2.freq)}</div>
					<div>Unstable points: <strong>{result.unstableCount}</strong> / {result.count}</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
