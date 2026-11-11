// Trace row (C02), marker item (C01) and line row (L1).
import type { CSSProperties, ReactElement } from 'react';
import type { MarkerItemProps, TraceRowProps } from './types';

const hueStyle = (hue: number): CSSProperties => ({ ['--h' as string]: hue }) as CSSProperties;

export function TraceColumnsHeader(): ReactElement {
  return (
    <div className="lp-colhead" aria-hidden="true">
      <span style={{ flex: 1 }}>Name</span>
      <span className="lp-colhead__interp">Interp</span>
      <span className="lp-colhead__pane">Pane</span>
      <span className="lp-colhead__end" />
    </div>
  );
}
export function TraceRow(p: TraceRowProps): ReactElement {
  const unplaced = p.panes.length === 0;
  const cls = ['lp-trace', p.selected ? 'is-selected lp-selected' : '', p.visible ? '' : 'is-hidden', unplaced ? 'is-unplaced' : '', p.created ? 'is-created' : ''].join(' ').replace(/\s+/g, ' ').trim();
  return (
    <div className={cls} style={p.color ? ({ ['--trace' as string]: p.color } as CSSProperties) : hueStyle(p.hue)} onClick={p.onSelect} title={p.name}>
      <div className="lp-row">
        {p.child ? <span className="lp-trace__child" aria-hidden="true">└</span> : null}
        <input className="lp-trace__check" type="checkbox" checked={p.visible} aria-label={p.visible ? `Hide ${p.name}` : `Show ${p.name}`}
          onClick={(e) => e.stopPropagation()} onChange={(e) => p.onVisible(e.currentTarget.checked)} />
        {p.swatch ?? <span className="lp-swatch" aria-hidden="true" />}
        {p.created ? <span className="lp-trace__fx" aria-hidden="true">ƒ</span> : null}
        {p.editingName ? <input className="lp-name" aria-label="Trace name" data-testid="trace-name-input" defaultValue={p.name} ref={el => { if (el && document.activeElement !== el) { el.focus(); el.select(); } }} onClick={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); p.onCancelName?.(); } }} onBlur={e => p.onCommitName?.(e.currentTarget.value)} style={{ minWidth: 0, font: 'inherit' }} /> : <span className={`lp-name${p.selected ? ' is-strong' : ''}`} onDoubleClick={e => { e.stopPropagation(); p.onRename(); }}>{p.name}</span>}
        {p.interpControl ?? <button type="button" className="lp-chip" title={`Interpolation: ${p.interp}`} aria-haspopup="menu"
          onClick={(e) => { e.stopPropagation(); p.onInterp(e.currentTarget); }}>{p.interp}</button>}
        {p.panesControl ?? <button type="button" className="lp-panes" aria-haspopup="menu" title={unplaced ? 'Not in a pane: drag onto one, or choose' : 'Show in…'}
          onClick={(e) => { e.stopPropagation(); p.onPanes(e.currentTarget); }}>
          {unplaced ? <span className="lp-pane lp-pane--none">—</span> : p.panes.map((pn) => <span key={pn} className="lp-pane">{pn}</span>)}
        </button>}
        {p.actionsControl}
        <button type="button" className="lp-icon-btn" aria-label={`Remove ${p.name}`} onClick={(e) => { e.stopPropagation(); p.onRemove(); }}>×</button>
      </div>
      {unplaced ? (
        <div className="lp-sub"><span className="lp-sub__text">{p.subline ? `${p.subline} · ` : ''}not in a pane, drag onto one</span></div>
      ) : p.subline ? (
        <div className="lp-sub"><span className="lp-sub__text">{p.subline}</span></div>
      ) : null}
    </div>
  );
}
export function MarkerItem(p: MarkerItemProps): ReactElement {
  const cls = ['lp-marker', p.delta ? 'is-delta' : '', p.selected ? 'is-selected lp-selected' : '', p.related ? 'is-related' : ''].join(' ').replace(/\s+/g, ' ').trim();
  return (
    <div className={cls} style={p.color ? ({ ['--trace' as string]: p.color, ['--tag-bg' as string]: p.color } as CSSProperties) : hueStyle(p.hue)} onClick={p.onSelect}>
      <div className="lp-row">
        <span className={`lp-tag${p.delta ? ' lp-tag--delta' : ''}`}>{p.label}</span>
        <input className={`lp-input${p.invalid ? ' is-invalid' : ''}`} defaultValue={p.delta ? `Δ ${p.x}` : p.x} aria-label={`${p.label} position`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter') p.onX(e.currentTarget.value.replace(/^Δ\s*/, '')); }} />
        <span className="lp-value">{p.y}</span>
        <button type="button" className="lp-icon-btn" aria-label={`Remove ${p.label}`} onClick={(e) => { e.stopPropagation(); p.onRemove(); }}>×</button>
      </div>
      <div className="lp-sub">
        <span className="lp-sub__text">
          {p.delta ? (
            <>
              from{' '}
              {p.referenceControl ?? <button type="button" className="lp-from" style={hueStyle(p.delta.fromHue)} aria-haspopup="menu"
                onClick={(e) => { e.stopPropagation(); p.delta?.onChangeRef(e.currentTarget); }}>{p.delta.from} ▾</button>}
              {' · at '}<span className="lp-mono">{p.delta.at}</span>
            </>
          ) : <>{p.traceName}{p.roleControl ? <> {p.roleControl}</> : null}</>}
        </span>
        {p.panes.map((pn) => <span key={pn} className="lp-pane">{pn}</span>)}
        <span>{p.mode === 'snap' ? '● snap' : '≈ interp'}</span>
      </div>
    </div>
  );
}

