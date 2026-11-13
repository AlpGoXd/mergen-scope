import { useState, useCallback } from 'react';

export interface HoverRow {
  readonly name: string;
  readonly value: number;
  readonly freq: number;
  readonly interpolated?: boolean;
}

/**
 * Hook for managing the crosshair/cursor state on the chart.
 * As per Agent-State-PROMPT.md, this uses local state only.
 * Syncing between panes is handled by passing this state down or 
 * by the caller managing the hook instance.
 */
export function useSharedCursor() {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverData, setHoverData] = useState<HoverRow[] | null>(null);

  const clear = useCallback(() => {
    setHoverX(null);
    setHoverData(null);
  }, []);

  const setSharedCursor = useCallback((freq: number | null, rows: HoverRow[] | null) => {
    setHoverX(freq && isFinite(freq) ? freq : null);
    setHoverData(Array.isArray(rows) ? rows : null);
  }, []);

  const clearSharedCursor = useCallback(() => {
    clear();
  }, [clear]);

  return {
    hoverX,
    setHoverX,
    hoverData,
    setHoverData,
    setSharedCursor,
    clearSharedCursor,
    clear,
  };
}
