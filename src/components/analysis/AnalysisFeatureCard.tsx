import type { ReactElement, ReactNode } from 'react';
import './analysis-card.css';
import { Btn } from '../shared/Btn';
import { Icon, Menu } from '../shared/Controls';
import type { MenuItem } from '../shared/Controls';

export interface AnalysisFeatureCardProps {
  title: string;
  /** One-line tool description, shown as a muted note at the top of the body. */
  description?: string;
  /** Short source in the header, e.g. "S21 · lna_board_rev3.s2p". */
  source?: string;
  /** Kind icon: ruler (Measure, default) or ƒ (Math). */
  kind?: 'measure' | 'math';
  onClose?: () => void;
  /** Extra items for the ⋯ menu; Remove (calls onClose) is always last when onClose is given. */
  menuItems?: readonly MenuItem[];
  /** Overrides the test id derived from the title. */
  testId?: string;
  children?: ReactNode;
}

function KindIcon({ kind }: { kind: 'measure' | 'math' }): ReactElement {
  if (kind === 'math') return <span className="ac-icon ac-icon--fx" aria-hidden="true">ƒ</span>;
  return (
    <span className="ac-icon" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17 17 3l4 4L7 21z" /><path d="m7 13 2 2M10 10l2 2M13 7l2 2" />
      </svg>
    </span>
  );
}

/**
 * Analysis card, AC-3 (board X1 / 03): neutral card, 26 px header band in the faint Analysis tint,
 * kind icon · title · source · ⋯ · ×, then the body. No coloured stripe.
 */
export function AnalysisFeatureCard({ title, description, source, kind = 'measure', onClose, menuItems, testId, children }: AnalysisFeatureCardProps): ReactElement {
  const id = testId ?? `analysis-card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const items: MenuItem[] = [...(menuItems ?? []), ...(onClose ? [{ label: 'Remove', onSelect: onClose }] : [])];
  return (
    <section className="ac" data-testid={id} aria-label={title}>
      <header className="ac-head">
        <KindIcon kind={kind} />
        <span className="ac-title">{title}</span>
        <span className="ac-source">{source}</span>
        {items.length > 0 && <Menu label={`${title} options`} items={items} iconOnly icon="more" className="ac-btn" />}
        {onClose && (
          <Btn className="ac-btn" aria-label={`Close ${title}`} onClick={onClose}><Icon name="close" /></Btn>
        )}
      </header>
      <div className="ac-body">
        {description && <div className="ac-note">{description}</div>}
        {children}
      </div>
    </section>
  );
}
