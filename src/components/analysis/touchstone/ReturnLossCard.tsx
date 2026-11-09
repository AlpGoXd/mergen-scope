import { useMemo } from 'react';
import { computeReturnLoss } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { MR } from '../../shared/MR';
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
			{!result && <div className="ac-note">No valid Touchstone reflection data.</div>}
			{result && (
				<div className="ac-kvs">
					<MR label="Min RL" value={`${result.min.value.toFixed(3)} dB @ ${fmtF(result.min.freq)}`} />
					<MR label="Max RL" value={`${result.max.value.toFixed(3)} dB @ ${fmtF(result.max.freq)}`} />
					<MR label="Average" value={`${result.average.toFixed(3)} dB`} />
					<div className="ac-note">{result.count} samples</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
