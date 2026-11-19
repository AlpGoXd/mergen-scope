import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  LEGEND_FADE_MS,
  chooseHomeCorner,
  initialDodgeState,
  returnDelay,
  stepDodge,
} from '../domain/chart/legend-placement';
import type { DodgeState, LegendCorner, PixelPoint, PixelSize } from '../domain/chart/legend-placement';

/** The plot rectangle (relative to the chart svg) and real scale domains of a pane. */
export interface LegendPlotView {
  readonly plot: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly x: readonly [number, number] | null;
  readonly y: readonly [number, number] | null;
}

export interface LegendDodgeOptions {
  /** The pane content box the legend is positioned in. */
  containerRef: RefObject<HTMLElement | null>;
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
  xKey: string;
  yKeys: readonly string[];
  plotView: LegendPlotView | null;
}

// Legend box before it has been measured: 220 px minimum width, a title row and one row per trace.
const ESTIMATE_WIDTH = 240;
const estimateHeight = (rowCount: number): number => 20 + 18 + rowCount * 24;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Keeps the hover legend off the point under the cursor.
 * The home corner is recomputed only when the traces, the domains or the pane size change; pointer moves only run the dodge state machine.
 */
export function useLegendDodge({ containerRef, rows, xKey, yKeys, plotView }: LegendDodgeOptions) {
  const legendRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<PixelSize>({ width: 0, height: 0 });
  const [home, setHome] = useState<LegendCorner>('top-right');
  const [shown, setShown] = useState<LegendCorner>('top-right');
  const [target, setTarget] = useState<LegendCorner>('top-right');
  const [faded, setFaded] = useState(false);
  const stateRef = useRef<DodgeState>(initialDodgeState('top-right'));
  const homeRef = useRef<LegendCorner>('top-right');
  const cursorRef = useRef<PixelPoint | null>(null);
  const dotsRef = useRef<ReadonlyArray<{ x: number; y: number }>>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const viewRef = useRef<LegendPlotView | null>(plotView);
  viewRef.current = plotView;
  const yKeyCount = yKeys.length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize(current => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  const legendSize = useCallback((): PixelSize => {
    const el = legendRef.current;
    return el && el.offsetWidth > 0 ? { width: el.offsetWidth, height: el.offsetHeight } : { width: ESTIMATE_WIDTH, height: estimateHeight(yKeyCount) };
  }, [yKeyCount]);

  // Home corner: only the traces, the domains and the pane size are dependencies, never the pointer.
  const xLo = plotView?.x?.[0], xHi = plotView?.x?.[1], yLo = plotView?.y?.[0], yHi = plotView?.y?.[1];
  const plotLeft = plotView?.plot.left, plotTop = plotView?.plot.top, plotWidth = plotView?.plot.width, plotHeight = plotView?.plot.height;
  useEffect(() => {
    const container = containerRef.current;
    const svg = container?.querySelector('svg.recharts-surface');
    let corner: LegendCorner = 'top-right';
    if (container && svg && plotLeft !== undefined && plotTop !== undefined && plotWidth !== undefined && plotHeight !== undefined
      && xLo !== undefined && xHi !== undefined && yLo !== undefined && yHi !== undefined) {
      const c = container.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      corner = chooseHomeCorner({
        rows, xKey, yKeys,
        xDomain: [xLo, xHi], yDomain: [yLo, yHi],
        plot: { left: s.left - c.left + plotLeft, top: s.top - c.top + plotTop, width: plotWidth, height: plotHeight },
        pane: size, legend: legendSize(),
      });
    }
    homeRef.current = corner;
    stateRef.current = initialDodgeState(corner);
    setHome(corner);
  }, [containerRef, rows, xKey, yKeys, size, legendSize, xLo, xHi, yLo, yHi, plotLeft, plotTop, plotWidth, plotHeight]);

  // A new home resets everything; after that the shown corner follows the state with a short opacity fade.
  useEffect(() => { setTarget(home); setShown(home); setFaded(false); }, [home]);
  useEffect(() => {
    if (target === shown) { setFaded(false); return; }
    if (prefersReducedMotion()) { setShown(target); return; }
    setFaded(true);
    const timer = window.setTimeout(() => { setShown(target); setFaded(false); }, LEGEND_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [target, shown]);

  const run = useCallback(() => {
    window.clearTimeout(timerRef.current);
    const container = containerRef.current;
    const view = viewRef.current;
    const cursor = cursorRef.current;
    if (!container) return;
    const c = container.getBoundingClientRect();
    const svg = container.querySelector('svg.recharts-surface')?.getBoundingClientRect();
    const dots: PixelPoint[] = [];
    if (cursor && svg && view?.x && view.y && view.plot.width > 0 && view.plot.height > 0 && view.x[1] > view.x[0] && view.y[1] > view.y[0]) {
      for (const dot of dotsRef.current) {
        const px = svg.left - c.left + view.plot.left + ((dot.x - view.x[0]) / (view.x[1] - view.x[0])) * view.plot.width;
        const py = svg.top - c.top + view.plot.top + (1 - (dot.y - view.y[0]) / (view.y[1] - view.y[0])) * view.plot.height;
        if (Number.isFinite(px) && Number.isFinite(py)) dots.push({ x: px, y: py });
      }
    }
    const now = performance.now();
    const next = stepDodge(stateRef.current, { home: homeRef.current, pane: { width: c.width, height: c.height }, legend: legendSize(), cursor, dots, now });
    stateRef.current = next;
    setTarget(next.corner);
    const wait = returnDelay(next, now);
    if (wait !== null) timerRef.current = window.setTimeout(run, wait);
  }, [containerRef, legendSize]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  /** Feed a pointer move (client px) and the hover dots (data coordinates). */
  const onPointerMove = useCallback((clientX: number, clientY: number, dots: ReadonlyArray<{ x: number; y: number }>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    cursorRef.current = { x: clientX - rect.left, y: clientY - rect.top };
    dotsRef.current = dots;
    run();
  }, [containerRef, run]);

  /** The pointer left the pane: the legend is hidden, so put it back home at once. */
  const onPointerLeave = useCallback(() => {
    cursorRef.current = null;
    window.clearTimeout(timerRef.current);
    stateRef.current = initialDodgeState(homeRef.current);
    setTarget(homeRef.current);
    setShown(homeRef.current);
    setFaded(false);
  }, []);

  return {
    legendRef,
    corner: shown,
    style: { opacity: faded ? 0 : 1, transition: prefersReducedMotion() ? 'none' : `opacity ${LEGEND_FADE_MS}ms ease` },
    onPointerMove,
    onPointerLeave,
  };
}
