import { useState } from 'react';
import type React from 'react';
import type { ColumnRole } from '../../domain/import-wizard';
import type { Separators } from '../../domain/parsers/tabular-detect';
import { splitCells } from '../../domain/parsers/tabular-detect';
import { PopoverAt } from '../shared/Controls';
import { CaretDownIcon } from '../shared/Icons';

export const PREVIEW_ROWS = 100;
const MAX_SKIPPED_PREVIEW = 4;

export interface WizardPreviewTableProps {
  /** Content lines of the file. */
  lines: readonly string[];
  separators: Separators;
  skipRows: number;
  /** How many data rows to render in the scrollable table. */
  rowLimit?: number;
  onShowMore?: () => void;
  headers: readonly string[];
  /** Header text as shown (with the picked unit). */
  names: readonly string[];
  roles: readonly ColumnRole[];
  /** Colour per column for Y columns (trace colour the column will get). */
  colors: readonly (string | undefined)[];
  numeric: readonly number[];
  onRole: (col: number, role: ColumnRole) => void;
}

const ROLE_TEXT: Record<ColumnRole, string> = { x: 'X', y: 'Y', skip: '— skip' };
const ROLE_NAME: Record<ColumnRole, string> = { x: 'X', y: 'Y', skip: 'Skip' };
const ROLE_HINT: Record<ColumnRole, string> = { x: 'Horizontal axis', y: 'One trace', skip: 'Not imported' };

export function WizardPreviewTable({
  lines, separators, skipRows, rowLimit = PREVIEW_ROWS, onShowMore,
  headers, names, roles, colors, numeric, onRole,
}: WizardPreviewTableProps) {
  const [menu, setMenu] = useState<{ col: number; at: HTMLElement } | null>(null);
  const totalDataRows = Math.max(0, lines.length - skipRows);
  const shownCount = Math.min(rowLimit, totalDataRows);
  const remaining = Math.max(0, totalDataRows - shownCount);
  const rows = lines.slice(skipRows, skipRows + shownCount).map(line => splitCells(line, separators));
  const skippedCount = Math.max(0, Math.min(skipRows, lines.length));
  const hiddenSkipped = Math.max(0, skippedCount - MAX_SKIPPED_PREVIEW);
  const skippedLines = lines.slice(hiddenSkipped, skippedCount);
  const close = () => setMenu(null);
  return (
    <div className="iw-table-wrap" data-testid="import-wizard-table-wrap">
      {skippedCount > 0 && (
        <div className="iw-skipped" data-testid="import-wizard-skipped" aria-label="Skipped rows">
          {hiddenSkipped > 0 && (
            <div className="iw-skipped-row iw-skipped-more t-caption">
              … {hiddenSkipped} earlier skipped {hiddenSkipped === 1 ? 'row' : 'rows'}
            </div>
          )}
          {skippedLines.map((line, index) => (
            <div key={hiddenSkipped + index} className="iw-skipped-row">
              <span className="iw-skipped-num t-caption">{hiddenSkipped + index + 1}</span>
              <span className="iw-skipped-text t-readout" title={line}>{line}</span>
            </div>
          ))}
        </div>
      )}
      <table className="iw-table" data-testid="import-wizard-preview">
        <thead>
          <tr>
            {headers.map((header, col) => {
              const role = roles[col] ?? 'skip';
              const style = { '--iw-trace': colors[col] ?? 'var(--accent)' } as React.CSSProperties;
              return (
                <th key={col} className={`is-${role}`} style={style} data-testid={`wizard-col-${col}`} scope="col">
                  <div className="iw-colhead">
                    <span className="iw-colname t-caption" title={names[col] ?? header}>{names[col] ?? header}</span>
                    <button
                      type="button"
                      className={`iw-chip t-caption is-${role}`}
                      data-testid={`wizard-chip-${col}`}
                      data-role={role}
                      aria-haspopup="menu"
                      aria-expanded={menu?.col === col}
                      aria-label={`${header}: ${ROLE_NAME[role]}. Change role`}
                      onClick={event => { const at = event.currentTarget; setMenu(current => (current?.col === col ? null : { col, at })); }}
                    >
                      <span className="iw-chip-role">{ROLE_TEXT[role]}</span>
                      <CaretDownIcon />
                    </button>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {headers.map((_, col) => (
                <td key={col} className={`t-readout ${(roles[col] ?? 'skip') === 'skip' ? 'is-skip' : ''}`}>{row[col] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {remaining > 0 && onShowMore && (
        <div className="iw-more-rows">
          <button type="button" className="iw-more-rows-btn t-caption" onClick={onShowMore}>
            Show {Math.min(PREVIEW_ROWS, remaining)} more {Math.min(PREVIEW_ROWS, remaining) === 1 ? 'row' : 'rows'} ({remaining} remaining)
          </button>
        </div>
      )}
      {menu && (
        <PopoverAt label="Column role" at={menu.at} onClose={close} onEscape={() => { const at = menu.at; close(); at.focus(); }}>
          <div className="iw-role-menu" role="menu" aria-label={`Role of ${headers[menu.col] ?? 'column'}`}>
            {(['x', 'y', 'skip'] as const).map(role => {
              const disabled = role !== 'skip' && !numeric.includes(menu.col);
              return (
                <button
                  key={role}
                  type="button"
                  role="menuitemradio"
                  aria-checked={(roles[menu.col] ?? 'skip') === role}
                  aria-disabled={disabled || undefined}
                  title={disabled ? 'This column has no numbers' : undefined}
                  onClick={() => { if (disabled) return; const at = menu.at; onRole(menu.col, role); close(); at.focus(); }}
                >
                  <span className="iw-role-key t-card-title">{role === 'skip' ? '—' : ROLE_TEXT[role]}</span>
                  <span className="t-label">{ROLE_NAME[role]}</span>
                  <span className="t-caption">{ROLE_HINT[role]}</span>
                </button>
              );
            })}
          </div>
        </PopoverAt>
      )}
    </div>
  );
}
