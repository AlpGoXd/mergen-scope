import type { TouchstoneFamily, TouchstoneView } from '../../types/touchstone';

export interface TouchstoneMatrixPickerProps {
	portCount: number;
	family: TouchstoneFamily;
	onToggle: (row: number, col: number, view: TouchstoneView) => void;
	view: TouchstoneView;
}

export function TouchstoneMatrixPicker({ portCount, family, onToggle, view }: TouchstoneMatrixPickerProps) {
	return (
		<div style={{ display: 'grid', gap: '4px' }}>
			{Array.from({ length: portCount }, (_, row) => (
				<div key={row} style={{ display: 'grid', gridTemplateColumns: `repeat(${portCount}, minmax(0, 1fr))`, gap: '4px' }}>
					{Array.from({ length: portCount }, (_, col) => {
						return (
							<button
								key={`${row}:${col}`}
								type="button"
								onClick={() => onToggle(row, col, view)}
								style={{
									border: '1px solid var(--border)',
									background: 'transparent',
									color: 'var(--text)',
									fontSize: 'var(--font-label)',
									lineHeight: 'var(--lh-label)',
									borderRadius: '6px',
									padding: '0.3rem 0.35rem',
									cursor: 'pointer',
								}}
							>
								{family}{row + 1}{col + 1}
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}
