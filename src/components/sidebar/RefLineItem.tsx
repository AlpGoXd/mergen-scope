import type { RefLine } from '../../types/ref-line';

export interface RefLineItemProps {
	line: RefLine;
	selected: boolean;
	onSelect: () => void;
	onRemove: () => void;
}

export function RefLineItem({ line, selected, onSelect, onRemove }: RefLineItemProps) {
	return (
		<div
			onClick={onSelect}
			style={{
				border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
				borderRadius: '8px',
				padding: '6px',
				fontSize: '11px',
				cursor: 'pointer',
				display: 'flex',
				justifyContent: 'space-between',
				alignItems: 'center',
			}}
		>
			<span>
				{line.type.toUpperCase()} = {line.value.toFixed(4)} {line.label ? `(${line.label})` : ''}
			</span>
			<button type="button" onClick={(event) => { event.stopPropagation(); onRemove(); }}>
				×
			</button>
		</div>
	);
}
