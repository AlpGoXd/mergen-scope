import { useState, useCallback, useEffect, useRef } from 'react';
import { usePaneState, usePaneDispatch } from '../stores/pane-store';
import { useTraceState } from '../stores/trace-store';
import { useUiState } from '../stores/ui-store';
import { placeMarker } from '../domain/markers';
import type { Trace } from '../types/trace';
import type { ZoomWindow } from '../types/marker';
import type { HoverRow } from './use-shared-cursor';

// Standard chart layout constants (sync with CSS/Theme if possible)
const CHART_MARGIN_LEFT = 0;
const CHART_Y_AXIS_WIDTH = 56;
const CHART_PLOT_LEFT = CHART_MARGIN_LEFT + CHART_Y_AXIS_WIDTH;
const CHART_MARGIN_RIGHT = 12;

interface ChartCursorApi {
  setHoverX: (value: number | null) => void;
  setHoverData: (rows: HoverRow[] | null) => void;
}

interface ChartMouseEvent {
  readonly activeLabel?: number;
  readonly activePayload?: Array<{ readonly payload?: { readonly freq?: number } }>;
  readonly xValue?: number;
  readonly nativeEvent?: { readonly clientX?: number };
}

interface PanState {
  readonly mode: 'x-pan' | 'x-zoom';
  readonly startClientX: number;
  readonly startLabel: number;
  readonly startZoom: ZoomWindow;
  didMove: boolean;
}

export function useChartNav(cursor: ChartCursorApi) {
  const { activePaneId, sharedZoom, zoomAll, paneXZooms, tracePaneMap } = usePaneState();
  const { allTraces } = useTraceState();
  // Note: UiStore handles global visibility. In many places, visibility is per-trace name.
  // We'll assume for now that FileStore/UiStore integration provides a vis map.
  // Actually, FileStore has 'vis' in its state in the original JS. Let's check FileStore.
  const { vis } = useUiState();
  
  const dispatch = usePaneDispatch();

  // Box-zoom selection state
  const [selA, setSelA] = useState<number | null>(null);
  const [selB, setSelB] = useState<number | null>(null);
  
  const chartRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const mouseBtnRef = useRef(0);
  const suppressClickRef = useRef(false);

  const zoom = zoomAll ? sharedZoom : (activePaneId ? (paneXZooms[activePaneId] || null) : null);

  const getActivePaneTraces = useCallback((): Trace[] => {
    if (!activePaneId) return [];
    return allTraces.filter(tr => (tracePaneMap[tr.name] || 'pane-1') === activePaneId);
  }, [allTraces, activePaneId, tracePaneMap]);

  const getXDomain = useCallback(() => {
    let mn = Infinity, mx = -Infinity;
    allTraces.forEach(tr => {
      if (!tr.data?.length) return;
      const first = tr.data[0]!.freq;
      const last = tr.data[tr.data.length - 1]!.freq;
      if (isFinite(first) && first < mn) mn = first;
      if (isFinite(last) && last > mx) mx = last;
    });
    return (isFinite(mn) && isFinite(mx) && mx > mn) ? { min: mn, max: mx } : null;
  }, [allTraces]);

  const getXDomainHz = useCallback((): ZoomWindow | null => {
    if (zoom && isFinite(zoom.left) && isFinite(zoom.right) && zoom.right > zoom.left) {
      return { left: zoom.left, right: zoom.right };
    }
    const domain = getXDomain();
    return domain ? { left: domain.min, right: domain.max } : null;
  }, [zoom, getXDomain]);

  const freqFromClientX = useCallback((clientX: number): number | null => {
    const el = chartRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const w = rect.width - CHART_PLOT_LEFT - CHART_MARGIN_RIGHT;
    if (w <= 20) return null;
    
    let x = clientX - rect.left - CHART_PLOT_LEFT;
    if (x < 0) x = 0; if (x > w) x = w;
    
    const dom = getXDomainHz();
    if (!dom) return null;
    
    const frac = x / w;
    return dom.left + frac * (dom.right - dom.left);
  }, [getXDomainHz]);

  const chartMM = useCallback((ev: ChartMouseEvent | undefined) => {
    const pan = panRef.current;
    if (pan && pan.mode === 'x-pan') return;
    
    if (!ev) {
      if (!(pan && pan.mode === 'x-zoom')) {
        cursor.setHoverX(null);
        cursor.setHoverData(null);
      }
      return;
    }

    // Prefer the true cursor x-value over snapped payload/sample labels.
    let f: number | null = null;
    if (typeof ev.xValue === 'number' && isFinite(ev.xValue)) {
      f = ev.xValue;
    } else if (typeof ev.nativeEvent?.clientX === 'number' && isFinite(ev.nativeEvent.clientX)) {
      f = freqFromClientX(ev.nativeEvent.clientX);
    } else if (ev.activePayload && ev.activePayload[0]?.payload?.freq != null) {
      f = ev.activePayload[0].payload.freq;
    }

    if (f === null || !isFinite(f)) {
      if (!(pan && pan.mode === 'x-zoom')) {
        cursor.setHoverX(null);
        cursor.setHoverData(null);
      }
      return;
    }

    if (pan && pan.mode === 'x-zoom') {
      if (Math.abs((ev.activeLabel || f) - (pan.startLabel || 0)) >= 2) {
        pan.didMove = true;
      }
      return;
    }

    cursor.setHoverX(f);
    
    // Find nearest points for all visible traces in the active pane
    const vals: HoverRow[] = [];
    const paneTraces = getActivePaneTraces();
    paneTraces.forEach((tr) => {
      if (vis && !vis[tr.name]) return;
      const res = placeMarker(tr, f!);
      if (res && isFinite(res.amp)) {
        vals.push({
          name: tr.dn || tr.name,
          value: res.amp,
          freq: res.freq,
          interpolated: res.interpolated
        });
      }
    });
    
    vals.sort((a, b) => a.name.localeCompare(b.name));
    cursor.setHoverData(vals);
  }, [cursor, freqFromClientX, getActivePaneTraces, vis]);

  const chartML = useCallback(() => {
    const pan = panRef.current;
    if (pan && pan.mode === 'x-pan') return;
    cursor.setHoverX(null);
    cursor.setHoverData(null);
  }, [cursor]);

  // Window-level mouse move/up for dragging
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      const pan = panRef.current;
      if (!pan || (pan.mode !== 'x-pan' && pan.mode !== 'x-zoom')) return;
      
      const f = freqFromClientX(ev.clientX);
      if (f === null) return;

      if (pan.mode === 'x-pan') {
        const span = pan.startZoom.right - pan.startZoom.left;
        if (span <= 0) return;
        
        const el = chartRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const plotW = rect.width - CHART_PLOT_LEFT - CHART_MARGIN_RIGHT;
        if (plotW <= 20) return;
        
        const dxPx = ev.clientX - pan.startClientX;
        const dxHz = -(dxPx / plotW) * span;
        
        if (Math.abs(dxPx) >= 2) pan.didMove = true;
        
        const dom = getXDomain();
        if (!dom) return;
        
        let nextLeft = pan.startZoom.left + dxHz;
        let nextRight = pan.startZoom.right + dxHz;
        
        if (nextLeft < dom.min) { nextRight += (dom.min - nextLeft); nextLeft = dom.min; }
        if (nextRight > dom.max) { nextLeft -= (nextRight - dom.max); nextRight = dom.max; }
        
        if (isFinite(nextLeft) && isFinite(nextRight) && nextRight > nextLeft) {
          dispatch({ type: 'SET_SHARED_ZOOM', payload: { left: nextLeft, right: nextRight } });
        }
      } else {
        if (Math.abs(ev.clientX - pan.startClientX) >= 2) pan.didMove = true;
        setSelB(f);
      }
    };

    const onUp = () => {
      const pan = panRef.current;
      if (!pan) return;
      
      if (pan.mode === 'x-pan') {
        if (pan.didMove) suppressClickRef.current = true;
      } else if (pan.mode === 'x-zoom') {
        if (pan.didMove && selA !== null && selB !== null && Math.abs(selA - selB) > 0) {
          suppressClickRef.current = true;
          const left = Math.min(selA, selB);
          const right = Math.max(selA, selB);
          dispatch({ type: 'SET_SHARED_ZOOM', payload: { left, right } });
        }
        setSelA(null);
        setSelB(null);
      }
      panRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [freqFromClientX, getXDomain, dispatch, selA, selB]);

  return {
    chartRef,
    selA,
    selB,
    chartMM,
    chartML,
    suppressClickRef,
    mouseBtnRef,
    panRef
  };
}
