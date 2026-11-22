import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

export type ListDropTarget = {
  'data-reorder-edge'?: 'before' | 'after';
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

export function useListReorder(
  mime: string,
  keys: readonly string[] | ((target: string) => readonly string[]),
  onMove: (source: number, index: number, siblings: readonly string[]) => void,
) {
  const [insert, setInsert] = useState<{ key: string; edge: 'before' | 'after' } | null>(null);
  const active = useRef<string | null>(null);
  const clear = () => { active.current = null; setInsert(null); };
  const start = (event: DragEvent<HTMLElement>, key: string) => {
    active.current = key;
    event.dataTransfer.setData(mime, key);
  };
  const siblingsOf = (key: string) => typeof keys === 'function' ? keys(key) : keys;
  const edgeAt = (event: DragEvent<HTMLElement>) => {
    const { top, height } = event.currentTarget.getBoundingClientRect();
    return event.clientY < top + height / 2 ? 'before' : 'after';
  };
  const target = (key: string): ListDropTarget => ({
    'data-reorder-edge': insert?.key === key ? insert.edge : undefined,
    onDragOver(event) {
      if (!event.dataTransfer.types.includes(mime)) return;
      if (typeof keys === 'function' && (active.current === null || !siblingsOf(key).includes(active.current))) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      const edge = edgeAt(event);
      setInsert(current => current?.key === key && current.edge === edge ? current : { key, edge });
    },
    onDragLeave(event) {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setInsert(current => current?.key === key ? null : current);
    },
    onDrop(event) {
      if (!event.dataTransfer.types.includes(mime)) return;
      event.preventDefault();
      event.stopPropagation();
      clear();
      const siblings = siblingsOf(key);
      const source = siblings.indexOf(event.dataTransfer.getData(mime));
      const targetIndex = siblings.indexOf(key);
      if (source < 0 || targetIndex < 0 || source === targetIndex) return;
      const boundary = targetIndex + (edgeAt(event) === 'after' ? 1 : 0);
      const index = boundary > source ? boundary - 1 : boundary;
      if (index !== source) onMove(source, index, siblings);
    },
  });
  return { clear, start, target };
}
