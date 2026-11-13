// Analysis panel kit: presentation only (boards R1, R8, X1 AC-3, P4c step 06).
// Positioning of menus, focus and Escape belong to the app's shared popover; the app renders
// AddAnalysisMenu inside it, anchored to the "+ Add analysis" button.
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type {
  AddAnalysisMenuProps, AddMenuItem, AnalysisCardProps, AnalysisKind, CardMessage, CreateRowProps, CrossingsListProps,
  KeyValue, MathOutput, ParamField, ResultValue,
} from './types';
import { Fx, IconEye, IconEyeOff, IconRuler, IconSearch, IconWarn } from './icons';

const hueStyle = (hue: number): CSSProperties => ({ '--h': hue } as CSSProperties);

export function KindIcon({ kind }: { kind: AnalysisKind }): ReactElement {
  return kind === 'math' ? <Fx /> : <IconRuler size={12} />;
}

/* ---------- panel ---------- */
export interface AnalysisPanelProps {
  count: number;
  addOpen?: boolean;
  onAdd: (anchor: HTMLElement) => void;
  /** Shown when there are no cards. */
  empty?: ReactNode;
  children?: ReactNode;
}
export function AnalysisPanel({ count, addOpen, onAdd, empty, children }: AnalysisPanelProps): ReactElement {
  return (
    <section className="an-panel" aria-label="Analysis">
      <header className="an-panel__head">
        <span className="an-panel__title">Analysis</span>
        <span className="an-panel__count">{count}</span>
        <span className="an-panel__spacer" />
        <button type="button" className="an-btn" aria-haspopup="menu" aria-expanded={addOpen ?? false}
          onClick={(e) => onAdd(e.currentTarget)}>+ Add analysis</button>
      </header>
      <div className="an-panel__body">{count === 0 ? empty : children}</div>
    </section>
  );
}

export function AnalysisEmpty({ onAdd }: { onAdd: (anchor: HTMLElement) => void }): ReactElement {
  return (
    <div className="an-panel__empty">
      <span>No analyses yet. Select a trace, then add one: bandwidth, peaks, smoothing, A − B…</span>
      <button type="button" className="an-btn" onClick={(e) => onAdd(e.currentTarget)}>+ Add analysis</button>
    </div>
  );
}

/* ---------- card ---------- */
export function AnalysisCard(p: AnalysisCardProps): ReactElement {
  const cls = `an-card${p.collapsed ? ' is-collapsed' : ''}${p.selected ? ' is-selected' : ''}`;
  const bodyId = `an-card-body-${p.id}`;
  return (
    <article className={cls} aria-label={p.title} data-testid={`analysis-card-${p.id}`}>
      <div className="an-card__head" role="button" tabIndex={0} aria-expanded={!p.collapsed} aria-controls={bodyId}
        onClick={p.onToggle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); p.onToggle?.(); } }}>
        <span className="an-card__kind" title={p.kind === 'math' ? 'Math: makes a trace' : 'Measure: reads values'}><KindIcon kind={p.kind} /></span>
        <span className="an-card__title">{p.title}</span>
        <span className="an-card__source" title={p.source}>
          {p.sourceHue !== undefined ? <span className="an-swatch" style={hueStyle(p.sourceHue)} aria-hidden="true" /> : null}{p.source}
        </span>
        {p.collapsed && p.summary ? <span className="an-card__summary">{p.summary}</span> : null}
        {p.overlay ? (
          <button type="button" className="an-icon-btn" aria-pressed={p.overlay.on}
            aria-label={p.overlay.on ? `Hide ${p.title} on the chart` : `Show ${p.title} on the chart`}
            title={p.overlay.on ? 'Shown on the chart' : 'Hidden on the chart'}
            onClick={(e) => { e.stopPropagation(); p.overlay?.onToggle(); }}>
            {p.overlay.on ? <IconEye size={12} /> : <IconEyeOff size={12} />}
          </button>
        ) : null}
        {p.onMenu ? (
          <button type="button" className="an-icon-btn an-icon-btn--more" aria-label={`${p.title} actions`} aria-haspopup="menu"
            aria-expanded={p.menuOpen ?? false} onClick={(e) => { e.stopPropagation(); p.onMenu?.(e.currentTarget); }}>···</button>
        ) : null}
        {p.onRemove ? (
          <button type="button" className="an-icon-btn" aria-label={`Remove ${p.title}`}
            onClick={(e) => { e.stopPropagation(); p.onRemove?.(); }}>×</button>
        ) : null}
      </div>
      {p.collapsed ? null : <div className="an-card__body" id={bodyId}>{p.children}</div>}
    </article>
  );
}

export function KeyValues({ rows }: { rows: KeyValue[] }): ReactElement {
  return (
    <dl className="an-kv">
      {rows.map((r) => [
        <dt key={`${r.label}-l`}>{r.label}</dt>,
        <dd key={`${r.label}-v`} title={r.title}>{r.value}</dd>,
      ])}
    </dl>
  );
}

export function Result({ value, unit, note }: ResultValue): ReactElement {
  return (
    <div>
      <div className="an-result"><span className="an-result__value">{value}</span>{unit ? <span className="an-result__unit">{unit}</span> : null}</div>
      {note ? <div className="an-result__note">{note}</div> : null}
    </div>
  );
}

/** The settings part of a card. `cardId` keeps field ids unique when two cards use the same tool. */
export function Params({ cardId, fields }: { cardId: string; fields: ParamField[] }): ReactElement {
  return (
    <div className="an-params">
      {fields.map((f) => {
        const id = `an-param-${cardId}-${f.id}`;
        const c = f.control;
        return [
          <label key={`${f.id}-l`} className="an-params__label" htmlFor={id}>{f.label}</label>,
          <div key={`${f.id}-c`} className="an-params__control">
            {c.type === 'number' ? (
              <>
                <input id={id} className="an-input" defaultValue={c.value} placeholder={c.placeholder} aria-invalid={c.invalid ? true : undefined}
                  onKeyDown={(e) => { if (e.key === 'Enter') c.onCommit(e.currentTarget.value); }}
                  onBlur={(e) => c.onCommit(e.currentTarget.value)} />
                {c.unit ? <span className="an-input__unit">{c.unit}</span> : null}
              </>
            ) : c.type === 'select' ? (
              <button id={id} type="button" className="an-select" aria-haspopup="listbox" title={c.title ?? c.value}
                onClick={(e) => c.onOpen(e.currentTarget)}>
                {c.hue !== undefined ? <span className="an-swatch" style={hueStyle(c.hue)} aria-hidden="true" /> : null}
                <span className="an-select__text">{c.value}</span><span className="an-select__arrow">▾</span>
              </button>
            ) : (
              <span className="an-seg" role="group" aria-labelledby={id}>
                <span id={id} hidden>{f.label}</span>
                {c.options.map((o) => (
                  <button key={o.value} type="button" className="an-seg__item" aria-pressed={o.value === c.value}
                    disabled={Boolean(o.disabledReason)} title={o.disabledReason} onClick={() => c.onChange(o.value)}>{o.label}</button>
                ))}
              </span>
            )}
          </div>,
        ];
      })}
    </div>
  );
}

export function CardMsg({ tone, text, action }: CardMessage): ReactElement {
  return (
    <div className={`an-msg an-msg--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="an-msg__icon"><IconWarn size={12} /></span>
      <span style={{ flex: 1 }}>{text}</span>
      {action ? <button type="button" className="an-link" onClick={action.onClick}>{action.label}</button> : null}
    </div>
  );
}

export function Busy({ text = 'Computing…' }: { text?: string }): ReactElement {
  return <div className="an-busy" role="status">{text}</div>;
}

/** The results part of a card, under the settings, separated by a hairline (R1). */
export function Results({ children }: { children?: ReactNode }): ReactElement {
  return <div className="an-results">{children}</div>;
}

/** A Math card before it has made a trace. */
export function CreateRow({ label = 'Create trace', disabledReason, name, note = 'Adds a new trace under its input, in the same pane.', onCreate }: CreateRowProps): ReactElement {
  const button = <button type="button" className="an-btn an-btn--primary" disabled={Boolean(disabledReason)} title={disabledReason} onClick={onCreate}>{label}</button>;
  if (name === undefined) {
    return (
      <div className="an-create">
        {button}
        <span className="an-create__note">{disabledReason ?? note}</span>
      </div>
    );
  }
  return (
    <div className="an-create an-create--named">
      <span className="an-output__arrow" aria-hidden="true">→</span>
      <span className="an-create__name" title={name}>{name}</span>
      {button}
      <span className="an-create__note">{disabledReason ?? note}</span>
    </div>
  );
}

/** A Math card's created trace. It always follows its inputs and settings. */
export function OutputRow({ hue, name, panes }: MathOutput): ReactElement {
  return (
    <div className="an-output">
      <span className="an-output__arrow" aria-hidden="true">→</span>
      <span className="an-output__swatch is-created" style={hueStyle(hue)} />
      <span className="an-output__fx" aria-hidden="true"><Fx /></span>
      <span className="an-output__name" title={name}>{name}</span>
      {panes.map((p) => <span key={p} className="an-pane-badge">{p}</span>)}
      <span className="an-output__note" title="Updates when its inputs or settings change. To keep a fixed copy, use ⋯ › Freeze as a copy.">follows inputs</span>
    </div>
  );
}

/* ---------- crossings ---------- */
export function CrossingsList({ groups, valueLabel, capNote, emptyText = 'No crossings with the visible traces.', onSelect, onCopy }: CrossingsListProps): ReactElement {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <div className="an-cross">
      {total === 0 ? <div className="an-busy">{emptyText}</div> : groups.map((g) => (
        <div key={g.paneBadge}>
          {groups.length > 1 ? <div className="an-cross__group"><span className="an-pane-badge">{g.paneBadge}</span>{g.paneTitle} · {g.rows.length}</div> : null}
          <div className="an-cross__table" role="list">
            <div className="an-cross__head" aria-hidden="true"><span /><span>Trace</span><span>{valueLabel}</span></div>
            {g.rows.map((r) => (
              <button key={r.id} type="button" role="listitem" className="an-cross__row" style={hueStyle(r.hue)}
                aria-current={r.current ? true : undefined} title={`${r.trace} · ${valueLabel} ${r.value}`} onClick={() => onSelect(r.id)}>
                <span className="an-cross__swatch" />
                <span className="an-cross__trace">{r.trace}</span>
                <span className="an-cross__value" aria-label={`${valueLabel} ${r.value}`}>{r.value}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {total > 0 && (capNote || onCopy) ? (
        <div className="an-cross__foot">
          {capNote ? <span>{capNote}</span> : null}
          <span style={{ flex: 1 }} />
          {onCopy ? <button type="button" className="an-link" onClick={onCopy}>Copy as CSV</button> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- + Add analysis ---------- */
function MenuItem({ item, active, onPick }: { item: AddMenuItem; active: boolean; onPick: (id: string) => void }): ReactElement {
  return (
    <button type="button" role="option" className="an-menu__item" aria-selected={active}
      aria-disabled={item.disabledReason ? true : undefined} title={item.disabledReason ?? item.note}
      onClick={item.disabledReason ? undefined : () => onPick(item.id)}>
      <span className="an-menu__lead"><KindIcon kind={item.kind} /></span>
      <span className="an-menu__text"><span>{item.title}</span><span className="an-menu__note">{item.disabledReason ?? item.note}</span></span>
      {item.added ? <span className="an-menu__check" aria-label="Already added">✓</span> : null}
    </button>
  );
}

export function AddAnalysisMenu({ query, filter, recent, items, activeId, onQuery, onFilter, onPick }: AddAnalysisMenuProps): ReactElement {
  const filters: { f: typeof filter; label: ReactNode }[] = [
    { f: 'all', label: 'All' }, { f: 'math', label: <><Fx /> Math</> }, { f: 'measure', label: 'Measure' },
  ];
  const showRecent = !query && recent && recent.length > 0;
  return (
    <div className="an-menu" role="dialog" aria-label="Add analysis">
      <label className="an-menu__search">
        <IconSearch size={13} />
        <input value={query} placeholder="Search analyses…" aria-label="Search analyses" autoFocus
          onChange={(e) => onQuery(e.currentTarget.value)} />
      </label>
      <div className="an-menu__filters" role="group" aria-label="Kind">
        {filters.map(({ f, label }) => (
          <button key={f} type="button" className="an-menu__filter" aria-pressed={filter === f} onClick={() => onFilter(f)}>{label}</button>
        ))}
      </div>
      <div className="an-menu__list" role="listbox" aria-label="Analyses">
        {showRecent ? <>
          <div className="an-menu__heading">Recent</div>
          {recent.map((it) => <MenuItem key={`r-${it.id}`} item={it} active={false} onPick={onPick} />)}
        </> : null}
        <div className="an-menu__heading">{query ? `Matching “${query}”` : 'All, A–Z'}</div>
        {items.length === 0 ? <div className="an-menu__none">Nothing matches. Try another word, such as “band” or “peak”.</div>
          : items.map((it) => <MenuItem key={it.id} item={it} active={it.id === activeId} onPick={onPick} />)}
      </div>
    </div>
  );
}
