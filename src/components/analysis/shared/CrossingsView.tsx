// Presentational Threshold crossings body (AC-3, board 03). Props and callbacks only: no stores, no formatting.
import type { ReactElement } from 'react';
import { Btn } from '../../shared/Btn';

export interface CrossingRowView {
  key: string;
  /** "trace · pane" line, already composed. */
  name: string;
  /** X value with unit, already formatted. */
  x: string;
  /** Y value with unit, already formatted; omitted when it equals the threshold. */
  y?: string;
}

export interface CrossingsViewProps {
  /** Source line under the header (trace · file · pane, or the line and its value). */
  sourceLine: string;
  /** Manual mode only: editable threshold text. Omit in line mode. */
  threshold?: { text: string; onChange: (text: string) => void; invalid?: boolean };
  /** Line mode only: switches back to the manual threshold. */
  onManual?: () => void;
  count: number;
  rows: readonly CrossingRowView[];
  emptyText: string;
}

export function CrossingsView(p: CrossingsViewProps): ReactElement {
  return (
    <>
      <div className="ac-note">{p.sourceLine}</div>
      {p.threshold && (
        <label className="ac-field">
          Threshold
          <input
            value={p.threshold.text}
            aria-invalid={p.threshold.invalid || undefined}
            onChange={(event) => p.threshold?.onChange(event.target.value)}
          />
        </label>
      )}
      <div className="ac-result" aria-live="polite">
        {p.count}
        <small>{p.count === 1 ? 'crossing' : 'crossings'}</small>
      </div>
      <div className="ac-list" role="list">
        {p.rows.map((row) => (
          <div className="ac-row" role="listitem" key={row.key}>
            <span className="ac-row-name" title={row.name}>{row.name}</span>
            <span className="ac-row-val">x={row.x}</span>
            {row.y !== undefined && <span className="ac-row-val">y={row.y}</span>}
          </div>
        ))}
        {p.rows.length === 0 && <div className="ac-empty">{p.emptyText}</div>}
      </div>
      {p.onManual && <Btn small onClick={p.onManual}>Manual threshold</Btn>}
    </>
  );
}
