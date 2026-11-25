import { useState } from 'react';
import type React from 'react';
import type { ColumnRole } from '../../domain/import-wizard';
import type { WizardNetworkConfig } from '../../types/file';
import type { Separators } from '../../domain/parsers/tabular-detect';
import { splitCells } from '../../domain/parsers/tabular-detect';
import { PopoverAt } from '../shared/Controls';
import { CaretDownIcon } from '../shared/Icons';

export const PREVIEW_ROWS = 100;
const MAX_SKIPPED_PREVIEW = 4;

export interface WizardNetworkChipMenu {
  readonly network: WizardNetworkConfig;
  readonly onAssignFreq: (col: number) => void;
  readonly onClearCol: (col: number) => void;
  readonly onAssignSlot: (col: number, row: number, sCol: number, which: 'first' | 'second') => void;
}

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
  /** Optional custom chip labels per column (used by S-parameter mode, e.g. "Freq", "S11 Re"). */
  chipLabels?: readonly string[];
  /** Optional S-parameter chip menu actions; when set, column chip popovers assign Freq / Skip / Sij slots. */
  networkMenu?: WizardNetworkChipMenu;
  /** Colour per column for Y columns (trace colour the column will get). */
  colors: readonly (string | undefined)[];
  numeric: readonly number[];
  onRole: (col: number, role: ColumnRole) => void;
}

const ROLE_TEXT: Record<ColumnRole, string> = { x: 'X', y: 'Y', skip: '— skip' };
const ROLE_NAME: Record<ColumnRole, string> = { x: 'X', y: 'Y', skip: 'Skip' };
const ROLE_HINT: Record<ColumnRole, string> = { x: 'Horizontal axis', y: 'One trace', skip: 'Not imported' };

function networkPairLabels(format: WizardNetworkConfig['format']): readonly [string, string] {
  if (format === 'RI') return ['Re', 'Im'];
  if (format === 'DB') return ['dB', 'Ang'];
  return ['Mag', 'Ang'];
}

export function WizardPreviewTable({
  lines, separators, skipRows, rowLimit = PREVIEW_ROWS, onShowMore,
  headers, names, roles, chipLabels, networkMenu, colors, numeric, onRole,
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
              const chipText = chipLabels?.[col] ?? ROLE_TEXT[role];
              const ariaRole = chipLabels?.[col] ?? ROLE_NAME[role];
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
                      aria-label={`${header}: ${ariaRole}. Change role`}
                      onClick={event => { const at = event.currentTarget; setMenu(current => (current?.col === col ? null : { col, at })); }}
                    >
                      <span className="iw-chip-role">{chipText}</span>
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
          {networkMenu ? (() => {
            const colIdx = menu.col;
            const isNumeric = numeric.includes(colIdx);
            const [firstLabel, secondLabel] = networkPairLabels(networkMenu.network.format);
            const currentRole = roles[colIdx] ?? 'skip';
            const cells = networkMenu.network.cells;
            return (
              <div className="iw-role-menu iw-role-menu--sparam" role="menu" aria-label={`Role of ${headers[colIdx] ?? 'column'}`}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={currentRole === 'x'}
                  aria-disabled={!isNumeric || undefined}
                  title={!isNumeric ? 'This column has no numbers' : undefined}
                  onClick={() => { if (!isNumeric) return; const at = menu.at; networkMenu.onAssignFreq(colIdx); close(); at.focus(); }}
                >
                  <span className="iw-role-key t-card-title">X</span>
                  <span className="t-label">Frequency</span>
                  <span className="t-caption">Sweep axis</span>
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={currentRole === 'skip'}
                  onClick={() => { const at = menu.at; networkMenu.onClearCol(colIdx); close(); at.focus(); }}
                >
                  <span className="iw-role-key t-card-title">—</span>
                  <span className="t-label">Skip</span>
                  <span className="t-caption">Not imported</span>
                </button>
                <div className="iw-menu-sep" role="separator" />
                <div className="iw-role-sparam-list">
                  {Array.from({ length: networkMenu.network.portCount }, (_, r) =>
                    Array.from({ length: networkMenu.network.portCount }, (_, c) => {
                      const cell = cells.find(item => item.row === r && item.col === c);
                      const isFirst = cell?.first === colIdx;
                      const isSecond = cell?.second === colIdx;
                      const cellName = `S${r + 1}${c + 1}`;
                      return (
                        <div key={cellName} className="iw-role-sparam-row">
                          <span className="iw-role-sparam-name t-label">{cellName}</span>
                          <button
                            type="button"
                            role="menuitemradio"
                            className="iw-role-sparam-slot t-caption"
                            aria-checked={isFirst}
                            aria-disabled={!isNumeric || undefined}
                            aria-label={`${cellName} ${firstLabel}`}
                            title={!isNumeric ? 'This column has no numbers' : undefined}
                            onClick={() => { if (!isNumeric) return; const at = menu.at; networkMenu.onAssignSlot(colIdx, r, c, 'first'); close(); at.focus(); }}
                          >
                            {firstLabel}
                          </button>
                          <button
                            type="button"
                            role="menuitemradio"
                            className="iw-role-sparam-slot t-caption"
                            aria-checked={isSecond}
                            aria-disabled={!isNumeric || undefined}
                            aria-label={`${cellName} ${secondLabel}`}
                            title={!isNumeric ? 'This column has no numbers' : undefined}
                            onClick={() => { if (!isNumeric) return; const at = menu.at; networkMenu.onAssignSlot(colIdx, r, c, 'second'); close(); at.focus(); }}
                          >
                            {secondLabel}
                          </button>
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            );
          })() : (
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
          )}
        </PopoverAt>
      )}
    </div>
  );
}
