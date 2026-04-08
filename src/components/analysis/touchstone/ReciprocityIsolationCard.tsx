import { useMemo } from 'react';
import { computeReciprocityIsolation } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { fmtF } from '../../../domain/format';

export function ReciprocityIsolationCard() {
	const analysisDispatch = useAnalysisDispatch();
	const { target } = useAnalysisTarget();
	const result = useMemo(() => computeReciprocityIsolation(target.touchstone), [target.touchstone]);

	return (
		<AnalysisFeatureCard
			title="Reciprocity / Isolation"
			description="S21/S12 reciprocity error and worst-case isolation for 2-port networks."
			onClose={() =>
				analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'reciprocity-isolation', forceValue: false } })
			}
		>
			{!result && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Requires a 2-port Touchstone network.</div>}
			{result && (
				<div style={{ display: 'grid', gap: '6px', fontSize: '11px' }}>
					<div>Worst reciprocity error: <strong>{result.reciprocityError.value.toFixed(3)} dB</strong> @ {fmtF(result.reciprocityError.freq)}</div>
					<div>Average reciprocity error: <strong>{result.averageReciprocityErrorDb.toFixed(3)} dB</strong></div>
					<div>Worst isolation: <strong>{result.worstIsolationDb.value.toFixed(3)} dB</strong> @ {fmtF(result.worstIsolationDb.freq)}</div>
					<div style={{ color: 'var(--muted)' }}>{result.count} samples</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
