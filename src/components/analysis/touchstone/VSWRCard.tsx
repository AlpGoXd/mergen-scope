import { useMemo } from 'react';
import { computeVSWR } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { MR } from '../../shared/MR';
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
			{!result && <div className="ac-note">No valid Touchstone reflection data.</div>}
			{result && (
				<div className="ac-kvs">
					<MR label="Min VSWR" value={`${result.min.value.toFixed(4)} @ ${fmtF(result.min.freq)}`} />
					<MR label="Max VSWR" value={`${result.max.value.toFixed(4)} @ ${fmtF(result.max.freq)}`} />
					<MR label="Average" value={`${result.average.toFixed(4)}`} />
					<div className="ac-note">{result.count} samples</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
