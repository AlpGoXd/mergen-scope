import type { DropHint } from '../../domain/pane-drop-hints';
import './pane-drag.css';

export function PaneDragOverlay({ hint }: { hint: DropHint | null }) {
  if (!hint || hint.kind === 'none') return null;
  return <div className={`pane-drag-overlay pane-drag-overlay--${hint.kind}`} role={hint.kind === 'refused' ? 'status' : undefined}><span className="t-card-title">{hint.text}</span></div>;
}
