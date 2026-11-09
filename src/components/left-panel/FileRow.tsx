// File card (C03) with the Touchstone matrix (C04) and Info (C05) opening under the row.
import type { CSSProperties, ReactElement } from 'react';
import type { FileRowProps, InfoProps, MatrixFamily, MatrixProps, MatrixView } from './types';

const BASE_VIEWS: Record<MatrixFamily, MatrixView[]> = {
  S: ['dB', 'Mag', 'Phase', 'Re', 'Im'],
  Y: ['Mag', 'Phase', 'Re', 'Im'],
  Z: ['Mag', 'Phase', 'Re', 'Im'],
  ABCD: ['Mag', 'Phase', 'Re', 'Im'],
};
const FAMILIES: MatrixFamily[] = ['S', 'Y', 'Z', 'ABCD'];
const hueStyle = (hue: number): CSSProperties => ({ ['--h' as string]: hue }) as CSSProperties;

export function Matrix(p: MatrixProps): ReactElement {
  const views = BASE_VIEWS[p.family];
  const moreAllowed = p.moreViews.some((m) => m.allowed);
  const prefix = p.family === 'ABCD' ? '' : p.family;
  const label = (r: number, c: number): string =>
    p.family === 'ABCD' ? (['A', 'B', 'C', 'D'][(r - 1) * 2 + (c - 1)] ?? '?') : `${prefix}${r}${r >= 10 || c >= 10 ? ',' : ''}${c}`;
  const small = p.ports > 4;
  return (
    <div className="lp-matrix">
      <div className="lp-matrix__line">
        <span className="lp-matrix__label">Family</span>
        <span className="lp-seg" role="group" aria-label="Parameter family">
          {FAMILIES.map((f) => (
            <button key={f} type="button" className="lp-seg__item" aria-pressed={p.family === f}
              disabled={f === 'ABCD' && !p.abcdAllowed} title={f === 'ABCD' && !p.abcdAllowed ? '2-port only' : undefined}
              onClick={() => p.onFamily(f)}>{f}</button>
          ))}
        </span>
      </div>
      <div className="lp-matrix__line">
        <span className="lp-matrix__label">Plot as</span>
        <span className="lp-seg" role="group" aria-label="Plot as">
          {views.map((v) => (
            <button key={v} type="button" className="lp-seg__item" aria-pressed={p.view === v} onClick={() => p.onView(v)}>{v}</button>
          ))}
        </span>
        {p.moreControl ?? <button type="button" className="lp-toggle" disabled={!moreAllowed}
          title={moreAllowed ? 'VSWR, Return loss, Group delay' : 'S-parameter views only'}
          style={moreAllowed ? undefined : { opacity: 0.6, cursor: 'not-allowed' }}
          aria-pressed={!BASE_VIEWS[p.family].includes(p.view)}
          onClick={(e) => p.onMore(e.currentTarget)}>
          {BASE_VIEWS[p.family].includes(p.view) ? 'More' : p.view} ▾
        </button>}
      </div>
      {p.quickControl ?? (p.ports >= 3 && p.onQuickPick ? (
        <div className="lp-picks">
          <button type="button" className="lp-chip" onClick={() => p.onQuickPick?.('allSii')}>All Sii</button>
          <button type="button" className="lp-chip" onClick={() => p.onQuickPick?.('allSij')}>All Sij</button>
          <button type="button" className="lp-chip" onClick={() => p.onQuickPick?.('lower')}>Lower ◣</button>
          <button type="button" className="lp-chip lp-chip--danger" onClick={() => p.onQuickPick?.('clear')}>Clear</button>
        </div>
      ) : null)}
      {p.grid ?? (p.list ? (
        <div className="lp-list" style={{ paddingLeft: 50 }}>
          <div className="lp-matrix__line">
            <button type="button" className="lp-toggle" onClick={p.list.onAdd}>+ Plot…</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="lp-link" onClick={p.list.onOpenGrid}>Grid…</button>
          </div>
          <div className="lp-list__chips">
            {p.list.plotted.map((c) => (
              <span key={c.label} className="lp-list__chip" style={hueStyle(c.hue)}>
                {c.label}
                <button type="button" className="lp-icon-btn" aria-label={`Remove ${c.label}`} onClick={() => p.list?.onRemove(c.label)}>×</button>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="lp-grid" role="grid" aria-label="Parameters"
          style={{ gridTemplateColumns: `14px repeat(${p.ports}, minmax(0, 1fr))`, paddingLeft: 36 }}>
          <span />
          {Array.from({ length: p.ports }, (_, c) => <span key={`c${c}`} className="lp-grid__index">{c + 1}</span>)}
          {Array.from({ length: p.ports }, (_, r) => (
            <RowCells key={`r${r}`} row={r + 1} p={p} label={label} small={small} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RowCells({ row, p, label, small }: { row: number; p: MatrixProps; label: (r: number, c: number) => string; small: boolean }): ReactElement {
  return (
    <>
      <span className="lp-grid__index">{row}</span>
      {Array.from({ length: p.ports }, (_, i) => {
        const col = i + 1;
        const cell = p.cells.find((c) => c.row === row && c.col === col);
        const hue = cell?.plotted?.hue ?? cell?.elsewhere?.hue;
        return (
          <button key={col} type="button" role="gridcell"
            className={`lp-cell${row === col ? ' is-diag' : ''}${small ? ' is-small' : ''}`}
            aria-pressed={Boolean(cell?.plotted)} title={cell?.title}
            style={hue === undefined ? undefined : hueStyle(hue)}
            onClick={() => p.onToggleCell(row, col)}>
            {label(row, col)}
            {cell?.elsewhere && !cell.plotted ? <span className="lp-cell__dot" /> : null}
          </button>
        );
      })}
    </>
  );
}

export function Info(p: InfoProps): ReactElement {
  return (
    <div className="lp-info">
      <div className="lp-info__head">
        <span className="lp-info__title">Info</span>
        <span className="lp-seg" role="group" aria-label="Info view">
          <button type="button" className="lp-seg__item" aria-pressed={p.mode === 'table'} onClick={() => p.onMode('table')}>Table</button>
          <button type="button" className="lp-seg__item" aria-pressed={p.mode === 'raw'} onClick={() => p.onMode('raw')}>Raw</button>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="lp-link" onClick={p.onCopy}>Copy</button>
        <button type="button" className="lp-icon-btn" aria-label="Close info" onClick={p.onClose}>×</button>
      </div>
      {p.fields.length === 0 ? (
        <span className="lp-empty" style={{ padding: 0 }}>No header fields in this file</span>
      ) : p.mode === 'table' ? (
        <dl className="lp-info__table">
          {p.fields.map((f) => (
            <div key={f.key} style={{ display: 'contents' }}><dt>{f.key}</dt><dd title={f.value}>{f.value}</dd></div>
          ))}
        </dl>
      ) : (
        <pre className="lp-info__raw">{p.raw}</pre>
      )}
    </div>
  );
}

export function FileRow(p: FileRowProps): ReactElement {
  const cls = ['lp-file', p.state === 'traceRemoved' ? 'is-dashed' : '', p.state === 'error' ? 'is-error' : '', p.state === 'parsing' ? 'is-parsing' : '', p.headerOnly ? 'lp-file--header' : ''].join(' ').trim();
  const open = Boolean(p.matrix?.open);
  return (
    <div className={cls}>
      <div className="lp-row" title={p.state === 'error' ? p.errorReason : p.title}>
        <span className="lp-badge">{p.format}</span>
        <span title={p.title} className={`lp-name${open ? ' is-strong' : ''}`} style={p.state === 'traceRemoved' ? { color: 'var(--text-muted)' } : undefined}>{p.name}</span>
        {p.state === 'parsing' ? <span className="lp-file__pct">{p.progressPct ?? 0}%</span> : null}
        {p.state === 'error' ? <button type="button" className="lp-file__fix" onClick={p.onFix}>Fix…</button> : null}
        {p.state === 'traceRemoved' && p.onPlot ? <button type="button" className="lp-toggle" style={{ fontWeight: 600, borderColor: 'var(--border-strong)' }} onClick={p.onPlot}>Plot</button> : null}
        {p.matrix && p.state === 'ready' ? (
          <button type="button" className="lp-toggle" aria-label="Matrix" aria-pressed={open} aria-expanded={open} onClick={p.matrix.onToggle}>Matrix {open ? '▴' : '▾'}</button>
        ) : null}
        {p.columns && p.state === 'ready' ? (
          <button type="button" className="lp-toggle" aria-label="Columns" aria-pressed={p.columns.open} aria-expanded={p.columns.open} onClick={p.columns.onToggle}>Columns {p.columns.open ? '▴' : '▾'}</button>
        ) : null}
        {p.state !== 'parsing' && p.state !== 'error' ? (
          p.menuControl ?? <button type="button" className="lp-icon-btn lp-icon-btn--more" aria-label={`More actions for ${p.name}`} aria-haspopup="menu" aria-expanded={Boolean(p.menuOpen)}
            onClick={(e) => p.onMenu(e.currentTarget)}>⋯</button>
        ) : null}
        <button type="button" className="lp-icon-btn" aria-label={`Remove ${p.name}`} title="Remove file" onClick={p.onRemove}>×</button>
      </div>
      {p.state === 'parsing' ? <div className="lp-file__progress" style={{ width: `${p.progressPct ?? 0}%` }} /> : null}
      {open && p.summary ? <div className="lp-file__summary">{p.summary}</div> : null}
      {open && p.matrix?.props ? <Matrix {...p.matrix.props} /> : null}
      {p.columns?.open ? (
        <div className="lp-columns">
          {p.columns.items.map((c) => (
            <label key={c.name} className={c.plotted ? undefined : 'is-off'}>
              <input type="checkbox" checked={c.plotted} onChange={c.onToggle} />
              {c.name}{c.plotted ? '' : ' · not plotted'}
            </label>
          ))}
        </div>
      ) : null}
      {p.info ? <Info {...p.info} /> : null}
    </div>
  );
}
