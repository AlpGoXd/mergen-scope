import { useMemo } from 'react';
import { computeReciprocityIsolation } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { MR } from '../../shared/MR';
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
			{!result && <div className="ac-note">Requires a 2-port Touchstone network.</div>}
			{result && (
				<div className="ac-kvs">
					<MR label="Worst reciprocity error" value={`${result.reciprocityError.value.toFixed(3)} dB @ ${fmtF(result.reciprocityError.freq)}`} />
					<MR label="Average reciprocity error" value={`${result.averageReciprocityErrorDb.toFixed(3)} dB`} />
					<MR label="Worst isolation" value={`${result.worstIsolationDb.value.toFixed(3)} dB @ ${fmtF(result.worstIsolationDb.freq)}`} />
					<div className="ac-note">{result.count} samples</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
