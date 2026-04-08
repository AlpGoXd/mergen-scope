import type { Marker } from '../../types/marker';

export interface MarkerItemProps {
	marker: Marker;
	index: number;
	selected: boolean;
	onSelect: () => void;
	onRemove: () => void;
}

export function MarkerItem({ marker, index, selected, onSelect, onRemove }: MarkerItemProps) {
	return (
		<div
			onClick={onSelect}
			style={{
				border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
				borderRadius: '8px',
				padding: '6px',
				fontSize: '11px',
				cursor: 'pointer',
			}}
		>
			<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
				<strong>
					M{index + 1} {marker.interpolated ? '(intp)' : ''}
				</strong>
				<button type="button" onClick={(event) => { event.stopPropagation(); onRemove(); }}>
					×
				</button>
			</div>
			<div>f: {marker.freq.toExponential(5)}</div>
			<div>a: {marker.amp.toFixed(4)}</div>
		</div>
	);
}
