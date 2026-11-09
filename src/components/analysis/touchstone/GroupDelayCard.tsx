import { useMemo } from 'react';
import { computeGroupDelay } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { MR } from '../../shared/MR';
import { fmtF, formatScalarWithUnit } from '../../../domain/format';

export function GroupDelayCard() {
	const analysisDispatch = useAnalysisDispatch();
	const { target } = useAnalysisTarget();
	const result = useMemo(() => computeGroupDelay(target.touchstone), [target.touchstone]);

	return (
		<AnalysisFeatureCard
			title="Group Delay"
			description="Group delay from unwrapped phase derivative."
			onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: 'group-delay', forceValue: false } })}
		>
			{!result && <div className="ac-note">Not enough Touchstone samples for group delay.</div>}
			{result && (
				<div className="ac-kvs">
					<MR label="Min" value={`${formatScalarWithUnit(result.min.value, 's')} @ ${fmtF(result.min.freq)}`} />
					<MR label="Max" value={`${formatScalarWithUnit(result.max.value, 's')} @ ${fmtF(result.max.freq)}`} />
					<MR label="Average" value={`${formatScalarWithUnit(result.average, 's')}`} />
					<div className="ac-note">{result.count} samples</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
