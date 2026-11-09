// Left panel shell (L1, L-a): one scroll, sticky section headers, Files → Traces → Markers → Lines.
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { IconOpen } from './icons';

export interface SectionProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Only Files has a header button (Open…). */
  action?: ReactNode;
  onMenu?: (anchor: HTMLElement) => void;
  menu?: ReactNode;
  /** Muted line when the section has no items, saying where items come from. */
  emptyText: string;
  children?: ReactNode;
}

export function Section(p: SectionProps): ReactElement {
  const headRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = headRef.current;
    const scroller = el?.closest('.lp');
    if (!el || !scroller) return;
    const onScroll = (): void => {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      setStuck(top <= 0 && scroller.scrollTop > 0);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);
  const empty = p.count === 0;
  return (
    <section className="lp-section" aria-label={p.title}>
      <div ref={headRef} className={`lp-head${stuck ? ' is-stuck' : ''}`}>
        <button type="button" className="lp-head__toggle" aria-expanded={!p.collapsed} onClick={p.onToggle}>
          <span className="lp-head__chev" aria-hidden="true">{p.collapsed ? '▸' : '▾'}</span>
          <span className="lp-head__title">{p.title}</span>
          <span className="lp-head__count">{p.count}</span>
        </button>
        {p.action}
        {p.menu ?? <button type="button" className="lp-icon-btn lp-icon-btn--more" aria-label={`${p.title}: all actions`} aria-haspopup="menu"
          onClick={(e) => p.onMenu?.(e.currentTarget)}>⋯</button>}
      </div>
      {p.collapsed ? null : empty && !p.children ? <div className="lp-empty">{p.emptyText}</div> : p.children}
    </section>
  );
}

export function OpenButton({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <button type="button" className="lp-btn" onClick={onOpen}><IconOpen size={12} />Open…</button>
  );
}

/** No file open: the whole panel is one drop zone (the empty app itself is E1). */
export function DropZone({ over, onOpen, onDemo }: { over?: boolean; onOpen: () => void; onDemo: () => void }): ReactElement {
  return (
    <div className={`lp-drop${over ? ' is-over' : ''}`}>
      <span className="lp-drop__title">Drop files here</span>
      <span className="lp-drop__formats">.s1p … .sNp · .dat · .csv · .txt</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <OpenButton onOpen={onOpen} />
        <button type="button" className="lp-btn" onClick={onDemo}>Load demo</button>
      </span>
      <span className="lp-drop__note">Files are read in this browser; nothing is uploaded.</span>
    </div>
  );
}

export function LeftPanel({ children, width }: { children: ReactNode; width?: number }): ReactElement {
  return (
    <aside className="lp" aria-label="Files, traces, markers and lines" style={width ? { ['--lp-width' as string]: `${width}px` } : undefined}>
      {children}
    </aside>
  );
}

export const EMPTY_TEXT = {
  files: 'No files. Open… or drop files here.',
  traces: 'No traces. Plot from a file’s Matrix or Columns.',
  markers: 'No markers. N or + New in the Markers group.',
  lines: 'No lines. V line / H line in the Lines group.',
} as const;
