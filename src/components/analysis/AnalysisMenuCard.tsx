import { ANALYSIS_ITEMS } from '../../domain/analysis/registry';
import { useAnalysisDispatch, useAnalysisState } from '../../stores/analysis-store';
import { AnalysisFeatureCard } from './AnalysisFeatureCard';
import { Btn } from '../shared/Btn';

const ANALYSIS_COLORS: Record<string, string> = {
	'noise-psd': '#a8c8e8',
	ip3: '#f3a6c8',
	'peak-spur-table': '#e8c58e',
	'channel-power': '#b7dfc8',
	'occupied-bandwidth': '#bdd6ec',
	'bandwidth-helper': '#b9e2dd',
	'ripple-flatness': '#d7c2ef',
	'range-stats': '#d9b8eb',
	'threshold-crossings': '#eac6a1',
	vswr: '#f0b39a',
	'return-loss': '#b9d4ef',
	'group-delay': '#bfe5cf',
	'reciprocity-isolation': '#ecd4a7',
	'touchstone-stability': '#d9c1ee',
};

export function AnalysisMenuCard() {
	const { analysisOpenState } = useAnalysisState();
	const analysisDispatch = useAnalysisDispatch();

	return (
		<AnalysisFeatureCard title="Analysis Menu" description="Enable and disable analysis cards.">
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
				{ANALYSIS_ITEMS.map((item) => (
					<Btn
						key={item.id}
						active={Boolean(analysisOpenState[item.id])}
						soft
						color={ANALYSIS_COLORS[item.id] ?? 'var(--accent)'}
						onClick={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: item.id } })}
						style={{ flex: '1 1 130px', justifyContent: 'center' }}
					>
						{item.title}
					</Btn>
				))}
			</div>
		</AnalysisFeatureCard>
	);
}
