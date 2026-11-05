import type { TouchstoneFamily, TouchstoneView } from '../../types/touchstone';

export interface TouchstoneMatrixPickerProps {
	portCount: number;
	family: TouchstoneFamily;
	onToggle: (row: number, col: number, view: TouchstoneView) => void;
	view: TouchstoneView;
	/** Maps "row:col" (1-based) to the color of the trace occupying that cell, when enabled. */
	cellColors?: Record<string, string>;
	/** "row:col" (1-based) of the cell currently selected/focused, if any. */
	selectedCell?: string | null;
}

export function TouchstoneMatrixPicker({ portCount, family, onToggle, view, cellColors = {}, selectedCell = null }: TouchstoneMatrixPickerProps) {
	return (
		<div style={{ display: 'grid', gap: '4px' }}>
			{Array.from({ length: portCount }, (_, row) => (
				<div key={row} style={{ display: 'grid', gridTemplateColumns: `repeat(${portCount}, minmax(0, 1fr))`, gap: '4px' }}>
					{Array.from({ length: portCount }, (_, col) => {
						const cellKey = `${row + 1}:${col + 1}`;
						const color = cellColors[cellKey];
						const isDiagonal = row === col;
						const isSelected = selectedCell === cellKey;
						return (
							<button
								data-testid={`touchstone-cell-${family}${row + 1}${col + 1}`}
								key={`${row}:${col}`}
								type="button"
								onClick={() => onToggle(row, col, view)}
								style={{
									border: isSelected
										? '2px solid var(--accent)'
										: `1px solid ${color ? `color-mix(in srgb, ${color} 45%, var(--border))` : 'var(--border)'}`,
									background: color
										? `color-mix(in srgb, ${color} 12%, var(--bg))`
										: isDiagonal
											? 'color-mix(in srgb, var(--text) 4%, transparent)'
											: 'transparent',
									color: color ?? 'var(--text)',
									fontSize: 'var(--font-label)',
									lineHeight: 'var(--lh-label)',
									borderRadius: '6px',
									padding: '0.3rem 0.35rem',
									cursor: 'pointer',
									position: 'relative',
									fontWeight: color ? 700 : 400,
								}}
							>
								{color && (
									<span
										aria-hidden
										style={{
											position: 'absolute',
											left: '3px',
											top: '3px',
											width: '5px',
											height: '5px',
											borderRadius: '50%',
											background: color,
										}}
									/>
								)}
								{family}{row + 1}{col + 1}
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}
