import { useLayoutEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { ChartTypeChipFit } from '../panes/PaneTypeChip';
import './pane-chrome.css';

/**
 * What the header has given up to fit, in this order:
 * 1 scale text, 2 trace count, 3 the "Chart type" prefix, 4 the type name (icon stays), 5 Samples as an icon.
 * The pane name is always first and the settings button never hides.
 */
export type PaneHeaderLevel = 0 | 1 | 2 | 3 | 4 | 5;
const MAX_LEVEL = 5;

export function chipFitForLevel(level: number): ChartTypeChipFit {
  return level >= 4 ? 'icon' : level >= 3 ? 'value' : 'full';
}

export function SamplesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true">
      <path d="M1.5 10.5 5 5.5l4 3 3.5-5" />
      <circle cx="5" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" aria-hidden="true">
      {/* Eight teeth: a dashed ring whose dash and gap are each 1/16 of the circumference. */}
      <circle cx="7" cy="7" r="5.1" strokeWidth="1.9" strokeDasharray="2.003 2.003" strokeDashoffset="1" />
      <circle cx="7" cy="7" r="3.5" strokeWidth="1.4" />
    </svg>
  );
}

export interface PaneHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  /** "Pane 1": always first, never hidden. */
  readonly name: string;
  readonly target: boolean;
  /** The Chart type control, drawn at the fit the header can afford. */
  readonly chip: (fit: ChartTypeChipFit) => ReactNode;
  /** "1 trace", or null when the pane has none. */
  readonly count: string | null;
  /** "X 200 k/div · Y 50/div", or null. */
  readonly scale: string | null;
  /** The Samples toggle; `iconOnly` is true on the narrowest step. */
  readonly samples: ((iconOnly: boolean) => ReactNode) | null;
  /** The settings button and anything that must stay at the end. */
  readonly children: ReactNode;
}

/**
 * Pane header: Pane N · [Chart type │ icon Chart] · "1 trace" · (spacer) · scale · [Samples] · [settings].
 * It never wraps and never overlaps. A measured priority list decides what shows: after each change of
 * width or content the header starts from everything and drops one step at a time until its content fits.
 */
export function PaneHeader({ name, target, chip, count, scale, samples, children, className = '', ...rest }: PaneHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState<{ key: string; level: number }>({ key: '', level: 0 });
  const key = `${width}|${name}|${count ?? ''}|${scale ?? ''}|${samples ? 1 : 0}`;
  const level = fit.key === key ? fit.level : 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Runs after every render, before paint: at most five extra passes, and only this header re-renders.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth && level < MAX_LEVEL) setFit({ key, level: level + 1 });
    else if (fit.key !== key) setFit({ key, level });
  });

  return (
    <div ref={ref} {...rest} className={`ph${target ? ' is-target' : ''} ${className}`.trim()} data-level={level}>
      <span className="ph-title t-card-title" title={name}>{name}</span>
      {chip(chipFitForLevel(level))}
      {count && level < 2 && <span className="ph-count t-caption">{count}</span>}
      <span className="ph-spacer" />
      {scale && level < 1 && <span className="ph-scale t-readout">{scale}</span>}
      {samples?.(level >= 5)}
      {children}
    </div>
  );
}
