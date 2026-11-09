import { useState } from 'react';
import { ANALYSIS_ITEMS } from '../../domain/analysis/registry';
import { useAnalysisDispatch, useAnalysisState } from '../../stores/analysis-store';
import { Btn } from '../shared/Btn';
import './analysis-card.css';

/**
 * Analysis panel header (32 px bar): "Analysis" · count · "+ Add analysis", above the chooser.
 * The chooser is the existing toggle list; the searchable Add analysis menu arrives in Phase 7C.
 */
export function AnalysisMenuCard() {
	const { analysisOpenState } = useAnalysisState();
	const analysisDispatch = useAnalysisDispatch();
	const [open, setOpen] = useState(true);
	const count = ANALYSIS_ITEMS.filter((item) => analysisOpenState[item.id]).length;

	return (
		<section className="ac-panel" data-testid="analysis-card-analysis-menu" aria-label="Analysis">
			<div className={`ac-panel-head${open ? '' : ' is-collapsed'}`}>
				<span className="ac-panel-title">Analysis</span>
				<span className="ac-panel-count" aria-label={`${count} open`}>{count}</span>
				<Btn small aria-expanded={open} aria-controls="analysis-chooser" onClick={() => setOpen(!open)}>+ Add analysis</Btn>
			</div>
			{open && (
				<div className="ac-panel-body" id="analysis-chooser">
					{ANALYSIS_ITEMS.map((item) => (
						<Btn key={item.id} active={Boolean(analysisOpenState[item.id])} tone="analysis" small onClick={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: item.id } })}>
							{item.title}
						</Btn>
					))}
				</div>
			)}
		</section>
	);
}
