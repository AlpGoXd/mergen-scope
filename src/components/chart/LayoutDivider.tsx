import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { equalSizes, moveDivider, splitPercentages } from '../../domain/pane-layout';
import type { Divider, LayoutSizes } from '../../domain/pane-layout';

export function LayoutDivider({ divider, sizes, count, pixels, style, onLive, onCommit, onCancel }: {
  divider: Divider; sizes: LayoutSizes; count: number; pixels: number; style: CSSProperties;
  onLive: (sizes: LayoutSizes) => void; onCommit: (sizes: LayoutSizes) => void; onCancel: () => void;
}) {
  const drag = useRef<{ start: number; original: LayoutSizes; latest: LayoutSizes; pointerId: number; element: HTMLDivElement } | null>(null);
  const [active, setActive] = useState(false);
  const cancel = () => {
    const current = drag.current; if (!current) return;
    drag.current = null; setActive(false);
    if (current.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
    onCancel();
  };
  useEffect(() => {
    if (!active) return;
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  });
  const vertical = divider.orientation === 'vertical';
  const min = vertical ? 160 : 120;
  const coordinate = (event: PointerEvent) => vertical ? event.clientX : event.clientY;
  const move = (source: LayoutSizes, delta: number) => moveDivider(source, divider.key, delta, pixels, min);
  const reset = () => onCommit(equalSizes(sizes.kind, count));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const backward = vertical ? 'ArrowLeft' : 'ArrowUp';
    const forward = vertical ? 'ArrowRight' : 'ArrowDown';
    if (event.key === 'Enter') { event.preventDefault(); reset(); return; }
    const delta = event.key === backward ? -pixels * (event.shiftKey ? 0.1 : 0.01) : event.key === forward ? pixels * (event.shiftKey ? 0.1 : 0.01) : event.key === 'Home' ? -pixels : event.key === 'End' ? pixels : null;
    if (delta !== null) { event.preventDefault(); onCommit(move(sizes, delta)); }
  };
  const percentages = splitPercentages(sizes, divider.key);
  return <div role="separator" aria-label="Resize panes" aria-orientation={divider.orientation} tabIndex={0} style={style} className={`layout-divider ${vertical ? 'layout-divider--vertical' : 'layout-divider--horizontal'}${active ? ' is-dragging' : ''}`}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { start: coordinate(event), original: sizes, latest: sizes, pointerId: event.pointerId, element: event.currentTarget }; setActive(true); }}
    onPointerMove={event => { const current = drag.current; if (!current) return; current.latest = move(current.original, coordinate(event) - current.start); onLive(current.latest); }}
    onPointerUp={event => { const current = drag.current; if (!current) return; drag.current = null; setActive(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (JSON.stringify(current.original) === JSON.stringify(current.latest)) onCancel(); else onCommit(current.latest); }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onDoubleClick={reset} onKeyDown={onKeyDown}>
    {active && percentages && <span className="layout-divider__tag t-caption">{percentages[0]}% · {percentages[1]}%</span>}
  </div>;
}
