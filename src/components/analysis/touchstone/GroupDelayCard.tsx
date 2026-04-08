import { useMemo } from 'react';
import { computeGroupDelay } from '../../../domain/analysis/touchstone';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { useAnalysisTarget } from '../../../hooks/use-analysis-target';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
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
			{!result && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Not enough Touchstone samples for group delay.</div>}
			{result && (
				<div style={{ display: 'grid', gap: '6px', fontSize: '11px' }}>
					<div>Min: <strong>{formatScalarWithUnit(result.min.value, 's')}</strong> @ {fmtF(result.min.freq)}</div>
					<div>Max: <strong>{formatScalarWithUnit(result.max.value, 's')}</strong> @ {fmtF(result.max.freq)}</div>
					<div>Average: <strong>{formatScalarWithUnit(result.average, 's')}</strong></div>
					<div style={{ color: 'var(--muted)' }}>{result.count} samples</div>
				</div>
			)}
		</AnalysisFeatureCard>
	);
}
