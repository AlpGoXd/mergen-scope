import { useMemo } from 'react';
import { computeStabilityFactors } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { MR } from '../../shared/MR';
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
			{!result && <div className="ac-note">Requires a 2-port Touchstone network.</div>}
			{result && (
				<div className="ac-kvs">
					<MR label="Min K" value={`${result.minK.value.toFixed(4)} @ ${fmtF(result.minK.freq)}`} />
					<MR label="Min mu1" value={`${result.minMu1.value.toFixed(4)} @ ${fmtF(result.minMu1.freq)}`} />
					<MR label="Min mu2" value={`${result.minMu2.value.toFixed(4)} @ ${fmtF(result.minMu2.freq)}`} />
					<MR label="Unstable points" value={`${result.unstableCount} / ${result.count}`} />
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
