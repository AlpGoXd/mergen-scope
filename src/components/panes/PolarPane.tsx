import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { usePaneDispatch, usePaneState } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useMarkerDispatch, useMarkerState } from '../../stores/marker-store';
import { useRefLineDispatch } from '../../stores/ref-line-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { useSharedHoverPublisher, useSharedHoverValue } from '../../stores/shared-hover-store';
import { usePointerReadoutPublisher } from '../../stores/pointer-readout-store';
import { useTraceColors } from '../../hooks/use-trace-colors';
import { DEFAULT_POLAR_SETTINGS } from '../../types/pane';
import { placeMarker } from '../../domain/markers';
import { polarCrosshair, polarPlotModel, polarRadius, polarReadout, polarSampleDots, polarSamples, polarTrace, polarVector, polarViewport } from '../../domain/polar';
import { linkedPeers, paneXUnits } from '../../domain/x-link';
import { smithLinkedBand, smithLinkedPaneLabel, smithMarkerFrequency } from '../../domain/smith-pane-model';
import { gammaAtFrequency, nearestSample, nearestTracePoint } from '../../domain/smith/hit';
import { pointToGamma, gammaToPoint, panBy, wheelZoomFactor, zoomRelativeAt } from '../../domain/smith/viewport';
import { BURST_MS, MAX_STEPS } from '../../domain/zoom-history';
import { samplesPath } from '../../domain/smith/band';
import { SmithRangeBar } from '../smith/SmithRangeBar';
import type { ExportView } from '../chart/export/export-context';
import type { SmithPoint, SmithViewport } from '../../types/smith-plot';
import './polar-pane.css';
import '../smith/smith-pane.css';

const FIT_VIEW = { center: { re: 0, im: 0 }, zoom: 1 };

function atView(fit: SmithViewport, view: typeof FIT_VIEW): SmithViewport {
  return { ...fit, center: view.center, scale: fit.scale * view.zoom };
}

export function PolarPane({ paneId, exportView, fitRequest = 0 }: { paneId: string; exportView?: ExportView; fitRequest?: number }) {
  const { panes, tracePaneMap, paneXZooms } = usePaneState();
  const { allTraces, allKnownTraces, vis } = useTraceState();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const lineDispatch = useRefLineDispatch();
  const paneDispatch = usePaneDispatch();
  const historyDispatch = useOptionalAggregateWorkspace()?.historyDispatch;
  const publish = useSharedHoverPublisher();
  const publishReadout = usePointerReadoutPublisher();
  const color = useTraceColors(exportView?.colorTheme, exportView?.paperTone);
  const pane = panes.find(item => item.id === paneId);
  const savedSettings = pane?.settings.polar ?? DEFAULT_POLAR_SETTINGS;
  const traces = useMemo(() => allTraces.flatMap(trace => {
    if (vis[trace.name] === false || !tracePaneMap[trace.name]?.includes(paneId)) return [];
    const model = polarTrace(trace);
    return model ? [model] : [];
  }), [allTraces, vis, tracePaneMap, paneId]);
  const settings = useMemo(() => ({
    ...savedSettings, radius: polarRadius(savedSettings.radius, traces.map(trace => trace.trace)),
  }), [savedSettings, traces]);
  const network = traces[0]?.kind === 'network';
  const units = useMemo(() => paneXUnits(panes, allKnownTraces, tracePaneMap), [panes, allKnownTraces, tracePaneMap]);
  const xUnit = units[paneId] ?? null;
  const ghostX = useSharedHoverValue(paneId, exportView ? null : xUnit);
  const peer = useMemo(() => {
    if (!xUnit) return undefined;
    const peers = linkedPeers(panes, paneId);
    return panes.find(item => item.renderMode === 'cartesian' && peers.includes(item.id) && units[item.id] === xUnit);
  }, [xUnit, panes, paneId, units]);
  const xZoom = peer ? paneXZooms[peer.id] ?? null : null;
  const model = useMemo(() => {
    const band = smithLinkedBand(!!peer, xZoom, traces);
    return polarPlotModel(traces, settings, !!peer, band && { startHz: band.minHz, stopHz: band.maxHz });
  }, [peer, xZoom, traces, settings]);
  const { rings, plots } = model;
  const hits = useMemo(() => plots.flatMap(trace => trace.runs.map(run => ({ traceId: trace.trace.id, samples: run.samples }))), [plots]);
  const clip = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ id: string; x: number } | null>(null);
  const drag = useRef<{ id: string; pointer: number } | null>(null);
  const pan = useRef<{ pointer: number; button: number; at: SmithPoint; moved: boolean } | null>(null);
  const [view, setView] = useState(FIT_VIEW);
  const currentView = useRef(FIT_VIEW);
  const previous = useRef<typeof FIT_VIEW[]>([]);
  const lastWheel = useRef(-Infinity);
  const updateView = useCallback((next: typeof FIT_VIEW, remember: boolean) => {
    const current = currentView.current;
    if (current.zoom === next.zoom && current.center.re === next.center.re && current.center.im === next.center.im) return;
    if (remember) previous.current = [...previous.current, current].slice(-MAX_STEPS);
    currentView.current = next;
    setView(next);
  }, []);
  const fit = useCallback(() => {
    lastWheel.current = -Infinity;
    updateView(FIT_VIEW, true);
  }, [updateView]);
  useEffect(() => { if (fitRequest) fit(); }, [fitRequest, fit]);
  useEffect(() => {
    if (exportView) return;
    const restore = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail !== paneId) return;
      const step = previous.current.pop();
      if (!step) return;
      lastWheel.current = -Infinity;
      updateView(step, false);
      event.preventDefault();
    };
    window.addEventListener('mergen-previous-polar-view', restore);
    return () => window.removeEventListener('mergen-previous-polar-view', restore);
  }, [paneId, updateView, exportView]);
  useEffect(() => {
    if (exportView || !plotRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, [exportView]);
  useEffect(() => exportView ? undefined : () => { publish(null, paneId); publishReadout(null, paneId); }, [publish, publishReadout, paneId, exportView]);
  const { width, height } = exportView ?? size;
  const fitted = useMemo(() => polarViewport(width, height), [width, height]);
  const viewport = useMemo(() => atView(fitted, view), [fitted, view]);
  useEffect(() => {
    const plot = plotRef.current;
    if (exportView || !plot) return;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      const rect = plot.getBoundingClientRect();
      const next = zoomRelativeAt(atView(fitted, currentView.current), fitted.scale,
        { x: event.clientX - rect.left, y: event.clientY - rect.top }, wheelZoomFactor(event.deltaY, event.deltaMode));
      if (!next) return;
      paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
      const now = performance.now();
      updateView({ center: next.center, zoom: next.scale / fitted.scale }, now - lastWheel.current > BURST_MS);
      lastWheel.current = now;
    };
    plot.addEventListener('wheel', wheel, { passive: false });
    return () => plot.removeEventListener('wheel', wheel);
  }, [paneId, paneDispatch, exportView, fitted, updateView]);
  const sampleDots = useMemo(() => pane?.settings.showSampleDots
    ? plots.map(trace => ({ trace: trace.trace, dots: [...polarSampleDots(trace.runs, viewport)] })) : [],
    [pane?.settings.showSampleDots, plots, viewport]);
  const origin = gammaToPoint(FIT_VIEW.center, viewport);
  const cx = origin?.x ?? width / 2, cy = origin?.y ?? height / 2, radius = viewport.scale;
  const pointAt = (id: string, x: number) => {
    const trace = plots.find(item => item.trace.id === id);
    const sample = trace && gammaAtFrequency(trace.samples, x);
    if (!trace || !sample) return null;
    return polarSamples([{ frequencyHz: x, gamma: sample }], trace, rings, settings)[0]?.gamma ?? null;
  };
  const hitAt = (event: PointerEvent<HTMLDivElement>, target?: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const pixel = pointToGamma(pointer, viewport);
    if (!target && pixel && Math.hypot(pixel.re, pixel.im) > 1.04) return null;
    const candidates = target ? hits.filter(trace => trace.traceId === target) : hits;
    const hit = nearestTracePoint(candidates, pointer, viewport, target ? Infinity : 14);
    if (!hit) return null;
    const trace = traces.find(item => item.trace.id === hit.traceId);
    if (!trace) return null;
    const sample = nearestSample(candidates.filter(item => item.traceId === hit.traceId), pointer, viewport);
    return { trace, x: smithMarkerFrequency(trace.trace, {
      frequencyHz: hit.frequencyHz, sampleFrequencyHz: sample?.frequencyHz ?? hit.frequencyHz, sampleDistancePx: sample?.distancePx,
    }) };
  };
  const readout = (id: string, x: number, label?: string, interpolated?: boolean) => {
    const trace = traces.find(item => item.trace.id === id);
    return trace ? polarReadout(trace, x, label, interpolated) : '';
  };
  const markerLabel = (type: string, index: number) => `${type === 'delta' ? 'DM' : 'M'}${index + 1}`;
  const selected = !exportView ? markers[selectedMkrIdx] : undefined;
  const selectedTrace = selected && traces.find(item => item.trace.name === selected.trace);
  const readoutText = selected && selectedTrace ? readout(selectedTrace.trace.id, selected.freq, markerLabel(selected.type, selectedMkrIdx), selected.interpolated)
    : hover ? readout(hover.id, hover.x) : '';
  const crossPoint = hover ? pointAt(hover.id, hover.x) : null;
  const cross = crossPoint && polarCrosshair(crossPoint);
  const crossEnd = cross && gammaToPoint(cross.end, viewport);
  const spokes = Array.from({ length: 12 }, (_, index) => (network ? -180 : 0) + index * 30);
  const grid = exportView?.appearance?.grid ?? true;
  const setRange = (range: typeof settings.range) => paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: { polar: { ...savedSettings, range } } } });
  const leave = () => { setHover(null); publish(null, paneId); publishReadout(null, paneId); };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    historyDispatch?.({ type: 'commit-gesture' });
  };
  return <div className="polar-pane">
    <div className="polar-plot" ref={plotRef} data-testid="polar-plot" tabIndex={exportView ? undefined : 0}
      onDoubleClick={exportView ? undefined : () => { if (!armed) fit(); }}
      onAuxClick={exportView ? undefined : event => { if (event.button === 1) event.preventDefault(); }}
      onPointerLeave={exportView ? undefined : leave}
      onPointerDown={exportView ? undefined : event => {
        if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
          pan.current = { pointer: event.pointerId, button: event.button, at: { x: event.clientX, y: event.clientY }, moved: false };
          lastWheel.current = -Infinity;
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        if (event.button !== 0 || !armed) return;
        const hit = hitAt(event);
        if (!hit || (armed.kind === 'delta' && markers.find(marker => marker.id === armed.refId)?.trace !== hit.trace.trace.name)) return;
        lineDispatch({ type: 'SET_SELECTED', payload: null });
        markerDispatch({ type: 'PLACE_MARKER', payload: { trace: hit.trace.trace, targetFreq: hit.x,
          markerType: armed.kind, refId: armed.kind === 'delta' ? armed.refId : null } });
      }}
      onPointerMove={exportView ? undefined : event => {
        const panning = pan.current;
        if (panning?.pointer === event.pointerId) {
          const delta = { x: event.clientX - panning.at.x, y: event.clientY - panning.at.y };
          if (!panning.moved && Math.abs(delta.x) + Math.abs(delta.y) < 4) return;
          const next = panBy(atView(fitted, currentView.current), delta);
          if (!next) return;
          updateView({ center: next.center, zoom: currentView.current.zoom }, !panning.moved);
          panning.at = { x: event.clientX, y: event.clientY };
          panning.moved = true;
          leave();
          return;
        }
        const moving = drag.current && markers.findIndex(marker => marker.id === drag.current?.id);
        const marker = moving !== null && moving >= 0 ? markers[moving] : undefined;
        const target = marker && traces.find(item => item.trace.name === marker.trace)?.trace.id;
        const hit = hitAt(event, target);
        if (!hit) { leave(); return; }
        setHover({ id: hit.trace.trace.id, x: hit.x });
        publishReadout(readout(hit.trace.trace.id, hit.x), paneId);
        if (xUnit) publish({ paneId, xUnit, value: hit.x }, paneId);
        if (marker && moving !== null && event.pointerId === drag.current?.pointer) {
          const placement = placeMarker(hit.trace.trace, hit.x);
          historyDispatch?.({ type: 'begin-gesture' });
          markerDispatch({ type: 'UPDATE_MARKER', payload: { idx: moving, updates: {
            requestedFreq: placement.requestedFreq, freq: placement.freq, amp: placement.amp, interpolated: placement.interpolated,
          } } });
        }
      }}
      onPointerUp={event => {
        if (pan.current?.pointer === event.pointerId) {
          if (pan.current.button === 1 && !pan.current.moved) fit();
          pan.current = null;
        }
        endDrag();
      }} onPointerCancel={() => { pan.current = null; endDrag(); }}
      onLostPointerCapture={() => { pan.current = null; endDrag(); }}>
      {width > 0 && height > 0 && <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" className="polar-svg"
        aria-label={`Polar plot ${traces.map(trace => trace.name).join(', ')}`} data-radius={settings.radius}>
        <defs><clipPath id={clip}><circle cx={cx} cy={cy} r={radius} /></clipPath></defs>
        <rect width={width} height={height} fill="var(--plot)" />
        {grid && <g data-testid="polar-grid">
          {spokes.map(angle => {
            const at = polarVector(angle, 1, settings);
            return <g key={angle}>
              <line x1={cx} y1={cy} x2={cx + at.re * radius} y2={cy - at.im * radius} stroke="var(--border)" />
              <text className="polar-label" x={cx + at.re * (radius + 18)} y={cy - at.im * (radius + 18)} textAnchor="middle" dominantBaseline="middle">
                {`${String(angle).replace(/^-/, '−')}°`}
              </text>
            </g>;
          })}
          {rings.ticks.map(value => {
            const r = radius * (value - rings.min) / (rings.max - rings.min);
            const at = polarVector(0, 1, settings);
            return <g key={value}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={value === rings.max ? 'var(--border-strong)' : 'var(--border)'} />
              <text className="polar-label" x={cx + at.re * (r - 4) + (at.im > 0.5 ? 10 : 0)} y={cy - at.im * (r - 4) - (at.re > 0.5 ? 5 : 0)}
                textAnchor={at.re > 0.5 ? 'end' : 'start'}>{settings.radius === 'db' ? `${String(value).replace(/^-/, '−')} dB` : Number(value.toPrecision(3))}</text>
            </g>;
          })}
          {plots.some(trace => trace.sParameter) && settings.radius === 'linear' && rings.max >= 1 &&
            <circle cx={cx} cy={cy} r={radius / rings.max} fill="none" stroke="var(--border-strong)" strokeWidth={1.5} />}
        </g>}
        <g clipPath={`url(#${clip})`}>
          <g data-testid="polar-viewport" transform={`translate(${cx} ${cy}) scale(${radius})`}>
            {plots.map(trace => <g key={trace.trace.id} data-testid={`polar-trace-${trace.trace.id}`}>
              {trace.runs.map((run, index) => <path key={index} d={samplesPath(run.samples) + (trace.closed && trace.runs.length === 1 ? ' Z' : '')}
                fill="none" stroke={color(trace.trace)} strokeWidth={1.5} opacity={run.inBand ? 1 : 0.22} vectorEffect="non-scaling-stroke" />)}
            </g>)}
          </g>
          {sampleDots.flatMap(({ trace, dots }) => dots.map(([cell, at]) =>
            <circle key={`${trace.id}-${cell}`} data-testid="polar-sample-dot" cx={at.x} cy={at.y} r={2.5}
              fill={color(trace)} stroke="var(--plot)" opacity={at.inBand ? 1 : 0.22} />))}
          {!exportView && cross && crossEnd && <g stroke="var(--border-strong)" fill="none" pointerEvents="none" data-testid="polar-crosshair">
            <circle cx={cx} cy={cy} r={cross.radius * radius} />
            <line x1={cx} y1={cy} x2={crossEnd.x} y2={crossEnd.y} />
          </g>}
          {!exportView && ghostX !== null && plots.map(trace => {
            const value = pointAt(trace.trace.id, ghostX);
            const at = value && gammaToPoint(value, viewport);
            return at && <circle key={trace.trace.id} data-testid="polar-linked-cursor" cx={at.x} cy={at.y} r={5} fill="none" stroke={color(trace.trace)} strokeDasharray="3 2" />;
          })}
        </g>
        {pane?.settings.showMarkers && markers.map((marker, index) => {
          const trace = traces.find(item => item.trace.name === marker.trace);
          const value = trace && pointAt(trace.trace.id, marker.freq);
          const at = value && gammaToPoint(value, viewport);
          if (!trace || !value || !at || Math.hypot(value.re, value.im) > 1.001) return null;
          const label = markerLabel(marker.type, index);
          const hue = color(trace.trace);
          const delta = marker.type === 'delta';
          const tag = exportView?.appearance?.include.markerTags ?? pane.settings.showMarkerLabels;
          return <g key={marker.id} data-testid={`polar-marker-${marker.id}`} aria-label={label}
            transform={`translate(${at.x} ${at.y})`} className="polar-marker" onPointerDown={exportView ? undefined : event => {
              if (event.button !== 0 || event.ctrlKey || armed) return;
              event.stopPropagation();
              lineDispatch({ type: 'SET_SELECTED', payload: null });
              markerDispatch({ type: 'SET_SELECTED_IDX', payload: index });
              drag.current = { id: marker.id, pointer: event.pointerId };
              plotRef.current?.setPointerCapture(event.pointerId);
            }}>
            {!exportView && index === selectedMkrIdx && <circle r={9} fill="none" stroke={hue} strokeDasharray="3 2" />}
            <circle r={5} fill={hue} stroke="var(--plot)" />
            {tag && <g transform="translate(8 -9)">
              <rect x={0} y={-12} width={label.length * 8 + 10} height={17} rx={4} fill={delta ? 'var(--plot)' : hue} stroke={hue} />
              <text className="polar-tag" x={5} y={0} fill={delta ? hue : 'var(--plot)'}>{label}</text>
            </g>}
          </g>;
        })}
      </svg>}
    </div>
    {!exportView && <div className="smith-strip" data-testid="polar-readout"><span className="t-readout polar-readout">{readoutText || '—'}</span></div>}
    {!exportView && network && model.full && model.range && <SmithRangeBar full={model.full} range={model.range} allowMixedUnits
      linkedLabel={peer ? smithLinkedPaneLabel(panes, peer.id) : null} onChange={setRange} onFull={() => setRange(null)} />}
  </div>;
}
