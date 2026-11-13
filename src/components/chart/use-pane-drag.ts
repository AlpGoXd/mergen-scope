import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { dropHint } from '../../domain/pane-drop-hints';
import type { DropHint, DropHintInput } from '../../domain/pane-drop-hints';

let activeDrag: DropHintInput['drag'] | null = null;
export function usePaneDrag(input: Omit<DropHintInput, 'drag'>, swap: (source: string) => void) {
  const [hint, setHint] = useState<DropHint | null>(null);
  const [dragging, setDragging] = useState(false);
  const blocked = useRef(false);
  const transient = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const start = (event: DragEvent) => {
      const transfer = event.dataTransfer;
      if (transfer?.types.includes('application/x-mergen-pane')) activeDrag = { kind: 'pane', paneId: transfer.getData('application/x-mergen-pane') };
      else if (transfer?.types.includes('application/x-mergen-trace')) activeDrag = { kind: 'trace', traceName: transfer.getData('application/x-mergen-trace') };
    };
    const clear = () => { activeDrag = null; if (!transient.current) setHint(null); setDragging(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { transient.current = false; clear(); } };
    document.addEventListener('dragstart', start); document.addEventListener('dragend', clear); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('dragstart', start); document.removeEventListener('dragend', clear); document.removeEventListener('keydown', key); if (timer.current) clearTimeout(timer.current); };
  }, []);
  const showRefusal = (message: string) => { if (timer.current) clearTimeout(timer.current); transient.current = true; setHint({ kind: 'refused', text: message }); timer.current = setTimeout(() => { transient.current = false; setHint(null); }, 4000); };
  const over = (event: React.DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer.types;
    const drag = types.includes('Files') ? { kind: 'file' as const } : activeDrag;
    if (!drag) return false;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = drag.kind === 'file' ? 'copy' : 'move';
    if (timer.current) clearTimeout(timer.current); transient.current = false; setHint(dropHint({ ...input, drag })); return true;
  };
  const drop = (event: React.DragEvent<HTMLDivElement>) => {
    setHint(null);
    if (!event.dataTransfer.types.includes('application/x-mergen-pane')) return false;
    event.preventDefault(); event.stopPropagation(); const source = event.dataTransfer.getData('application/x-mergen-pane');
    if (source && source !== input.pane.id) swap(source);
    activeDrag = null; return true;
  };
  return { hint, dragging, showRefusal, over, drop, leave: () => setHint(null),
    pointerDown: (event: React.PointerEvent<HTMLDivElement>) => { blocked.current = event.target instanceof Element && !!event.target.closest('button,input,select,textarea,a,[role="button"]'); },
    start: (event: React.DragEvent<HTMLDivElement>) => { if (blocked.current) { event.preventDefault(); return; } event.dataTransfer.setData('application/x-mergen-pane', input.pane.id); event.dataTransfer.effectAllowed = 'move'; activeDrag = { kind: 'pane', paneId: input.pane.id }; setDragging(true); },
    end: () => { activeDrag = null; setDragging(false); setHint(null); },
  };
}
