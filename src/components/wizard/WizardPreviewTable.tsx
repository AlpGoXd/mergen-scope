import { useState } from 'react';
import type React from 'react';
import type { ColumnRole } from '../../domain/import-wizard';
import { splitCells } from '../../domain/parsers/tabular-detect';
import { PopoverAt } from '../shared/Controls';

export const PREVIEW_ROWS = 8;

export interface WizardPreviewTableProps {
  /** Content lines of the file. */
  lines: readonly string[];
  delimiter: string;
  skipRows: number;
  headers: readonly string[];
  roles: readonly ColumnRole[];
  /** Colour per column for Y columns (trace colour the column will get). */
  colors: readonly (string | undefined)[];
  numeric: readonly number[];
  onRole: (col: number, role: ColumnRole) => void;
}

const ROLE_TEXT: Record<ColumnRole, string> = { x: 'X', y: 'Y', skip: '—' };
const ROLE_NAME: Record<ColumnRole, string> = { x: 'X', y: 'Y', skip: 'Skip' };
const ROLE_HINT: Record<ColumnRole, string> = { x: 'Horizontal axis', y: 'One trace', skip: 'Not imported' };

export function WizardPreviewTable({ lines, delimiter, skipRows, headers, roles, colors, numeric, onRole }: WizardPreviewTableProps) {
  const [menu, setMenu] = useState<{ col: number; at: HTMLElement } | null>(null);
  const rows = lines.slice(skipRows, skipRows + PREVIEW_ROWS).map(line => splitCells(line, delimiter));
  const close = () => setMenu(null);
  return (
    <div className="iw-table-wrap">
      <table className="iw-table" data-testid="import-wizard-preview">
        <thead>
          <tr>
            {headers.map((header, col) => {
              const role = roles[col] ?? 'skip';
              const style = { '--iw-trace': colors[col] ?? 'var(--accent)' } as React.CSSProperties;
              return (
                <th key={col} className={`is-${role}`} style={style} data-testid={`wizard-col-${col}`} scope="col">
                  <div className="iw-colhead">
                    <button
                      type="button"
                      className={`iw-chip t-card-title is-${role}`}
                      data-testid={`wizard-chip-${col}`}
                      aria-haspopup="menu"
                      aria-expanded={menu?.col === col}
                      aria-label={`${header}: ${ROLE_NAME[role]}. Change role`}
                      onClick={event => { const at = event.currentTarget; setMenu(current => (current?.col === col ? null : { col, at })); }}
                    >
                      {role === 'y' && <span className="iw-swatch" aria-hidden="true" />}
                      {ROLE_TEXT[role]}
                    </button>
                    <span className="iw-colname t-label" title={header}>{header}</span>
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
                  <span className="iw-role-key t-card-title">{ROLE_TEXT[role]}</span>
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
