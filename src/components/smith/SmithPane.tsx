import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Marker } from '../../types/marker';
import type { SmithPoint, SmithSample, SmithViewport } from '../../types/smith-plot';
import type { Complex } from '../../types/touchstone';
import { samplesPath, splitByBand } from '../../domain/smith/band';
import { clipTraceToRange } from '../../domain/smith/range';
import type { SmithBand } from '../../domain/smith/band';
import { REAL_AXIS_PATH, UNIT_CIRCLE, buildGrid, circlePath, gridLevelForScale, gridThroughGamma, gridValues } from '../../domain/smith/grid';
import { gammaAtFrequency, nearestSample, nearestTracePoint } from '../../domain/smith/hit';
import { buildLabels } from '../../domain/smith/labels';
import type { SmithLabelMode } from '../../domain/smith/labels';
import {
  SMITH_NO_VALUE, formatAdmittance, formatEquivalent, formatGammaPolar, formatImpedance, formatReturnLoss,
  formatSmithFrequency, formatSmithFrequencyShort, formatVswr, smithReadout,
} from '../../domain/smith/readout';
import type { SmithReadout } from '../../domain/smith/readout';
import { directionChevrons, traceEnds } from '../../domain/smith/trace-decor';
import type { SmithDirectionMode } from '../../domain/smith/trace-decor';
import { fitViewport, gammaToPoint, panBy, zoomAt } from '../../domain/smith/viewport';
import { DOT_RADIUS, planDotsAndSymbols } from '../../domain/dots-and-symbols';
import type { TraceSymbol as SymbolKind } from '../../domain/trace-palette';
import { TraceSymbol } from '../shared/TraceSymbol';
import './smith-pane.css';
import { SmithRangeBar } from './SmithRangeBar';
import type { SmithRangeBarProps } from './SmithRangeBar';

/** One reflection trace, already as Γ referred to `z0`. */
export interface SmithPaneTrace {
  readonly traceId: string;
  /** Trace name. Markers point at their trace through `Marker.trace`, which holds this name. */
  readonly name: string;
  /** Short name for the readout strip ("S11"). Falls back to `name`. */
  readonly shortName?: string;
  /** CSS colour from the trace palette. */
  readonly color: string;
  /** Created (ƒ) traces are drawn 2 px wide; source traces 1.5 px. */
  readonly created?: boolean;
  /** The trace's symbol when colours repeat (or symbols are always on); null or absent for none. */
  readonly symbol?: SymbolKind | null;
  /** Frequencies of the measured samples. When given, dots and symbols skip any other point (interpolated range edges). */
  readonly measured?: ReadonlySet<number>;
  /** Reference impedance in ohms that Γ is referred to (per file, usually 50). */
  readonly z0: number;
  readonly samples: readonly SmithSample[];
}

export type SmithReadoutField = 'z' | 'y' | 'gamma' | 'vswr' | 'return-loss';
export type SmithGridMode = 'z' | 'y' | 'both';

export interface SmithTraceClick {
  readonly traceId: string;
  /** Frequency at the clicked point of the line (interpolated between samples). */
  readonly frequencyHz: number;
  /** Frequency of the measured sample nearest to the click. */
  readonly sampleFrequencyHz: number;
  readonly sampleDistancePx?: number;
}

export interface SmithPaneProps {
  readonly rangeBar?: SmithRangeBarProps;
  readonly traces: readonly SmithPaneTrace[];
  /** Existing marker data. Only markers whose `trace` names one of `traces` are shown. */
  readonly markers?: readonly Marker[];
  /** Marker id → display name ("M1"). Defaults to the chart's rule: M / DM + position in `markers`. */
  readonly markerNames?: Readonly<Record<string, string>>;
  readonly selectedMarkerId?: string | null;
  readonly onSelectMarker?: (markerId: string) => void;
  /** A click on a trace: the caller decides whether that places a marker. */
  readonly onTraceClick?: (click: SmithTraceClick) => void;
  /** Dragging a marker along its own trace: called on every move with the point under the pointer. */
  readonly onMoveMarker?: (markerId: string, to: SmithTraceClick) => void;
  /** The marker drag ended (one Undo step for the whole drag). */
  readonly onMoveMarkerEnd?: () => void;
  /** Visible range of the linked Hz pane: inside is drawn in full colour, the rest faint. */
  readonly band?: SmithBand | null;
  readonly grid?: SmithGridMode;
  readonly labels?: SmithLabelMode | 'off';
  readonly direction?: SmithDirectionMode;
  /** Fields of the readout strip. An empty list hides the strip. */
  readonly readout?: readonly SmithReadoutField[];
  readonly showMarkers?: boolean;
  readonly showMarkerTags?: boolean;
  /** Samples: a filled dot (radius 2) on every measured sample, as on charts. */
  readonly showSamples?: boolean;
  /** Frequency under the cursor of a linked pane: drawn as a ghost ring on every trace. */
  readonly cursorFrequencyHz?: number | null;
  /** The frequency under the pointer in this pane (null on leave), for ghost crosshairs elsewhere. */
  readonly onHoverFrequency?: (frequencyHz: number | null) => void;
  /** Change this number to fit the view from outside (the app's Fit button and Space / F). */
  readonly fitRequest?: number;
  /** Fixed plot size in CSS px; skips measuring. For image export and tests. */
  readonly size?: { readonly width: number; readonly height: number };
}

interface View { readonly center: Complex; readonly zoom: number }
interface Hover { readonly traceId: string; readonly frequencyHz: number; readonly gamma: Complex }

const FIT_VIEW: View = { center: { re: 0, im: 0 }, zoom: 1 };
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 400;
const HOVER_REACH_PX = 28;
const CLICK_REACH_PX = 10;
const MARKER_REACH_PX = 10;
const CLICK_SLOP_PX = 4;
const END_TEXT_DX = 7;
const END_TEXT_DY = 8;
const DEFAULT_READOUT: readonly SmithReadoutField[] = ['z', 'gamma', 'vswr'];
const NO_MARKERS: readonly Marker[] = [];

function useElementSize(ref: RefObject<HTMLDivElement | null>, fixed: SmithPaneProps['size']): { width: number; height: number } {
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || fixed) return;
    const read = (): void => {
      const width = el.clientWidth, height = el.clientHeight;
      setMeasured(previous => (previous.width === width && previous.height === height ? previous : { width, height }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, fixed]);
  return fixed ?? measured;
}

/** The readout role's font size in px, so label boxes follow Compact / Comfortable / Large. */
function useFontPx(ref: RefObject<HTMLDivElement | null>): number {
  const [fontPx, setFontPx] = useState(12);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void => {
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (Number.isFinite(px) && px > 0) setFontPx(px);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-size', 'class', 'style'] });
    return () => observer.disconnect();
  }, [ref]);
  return fontPx;
}

function markerGlyph(type: Marker['type'], x: number, y: number, r: number): string {
  if (type === 'delta') return `M${x},${y - r * 1.25}L${x + r * 1.25},${y}L${x},${y + r * 1.25}L${x - r * 1.25},${y}Z`;
  if (type === 'peak') return `M${x},${y - r * 1.3}L${x + r * 1.2},${y + r * 0.9}L${x - r * 1.2},${y + r * 0.9}Z`;
  return `M${x - r},${y}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0Z`;
}

function inBand(frequencyHz: number, band: SmithBand | null | undefined): boolean {
  return !band || (frequencyHz >= band.minHz && frequencyHz <= band.maxHz);
}

/**
 * Smith chart pane body: grid, reflection traces, markers, hover and the readout strip.
 * It reads no store: everything arrives as props, and zoom / pan are local to the pane, so
 * scrolling here never moves another pane.
 */
export function SmithPane({
  traces, markers = NO_MARKERS, markerNames, selectedMarkerId = null, onSelectMarker, onTraceClick, onMoveMarker, onMoveMarkerEnd, band = null, rangeBar,
  grid = 'z', labels = 'normalised', direction = 'chevrons', readout = DEFAULT_READOUT,
  showMarkers = true, showMarkerTags = true, showSamples = false, cursorFrequencyHz = null, onHoverFrequency, fitRequest, size,
}: SmithPaneProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(plotRef, size);
  const fontPx = useFontPx(plotRef);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [hover, setHover] = useState<Hover | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number; pan: boolean; markerId?: string; moved?: boolean } | null>(null);

  // Fit: the unit circle plus any |Γ| > 1 samples, with room for the rim labels.
  const allGammas = useMemo(() => traces.flatMap(trace => trace.samples.map(sample => sample.gamma)), [traces]);
  const padding = labels === 'off' ? 12 : Math.round(fontPx * 2.4 + 6);
  const fit = useMemo(() => fitViewport(width, height, allGammas, padding) ?? fitViewport(width, height, allGammas, 0), [width, height, allGammas, padding]);
  const viewport = useMemo<SmithViewport | null>(() => (fit ? { width, height, center: view.center, scale: fit.scale * view.zoom } : null), [fit, width, height, view]);
  const hasActive = useMemo(() => allGammas.some(g => Math.hypot(g.re, g.im) > 1 + 1e-9), [allGammas]);

  const live = useRef({ viewport, fitScale: fit?.scale ?? 0 });
  live.current = { viewport, fitScale: fit?.scale ?? 0 };

  const fitView = useCallback(() => setView(FIT_VIEW), []);
  useEffect(() => { if (fitRequest !== undefined) setView(FIT_VIEW); }, [fitRequest]);

  const zoomBy = useCallback((anchor: SmithPoint, factor: number) => {
    const { viewport: current, fitScale } = live.current;
    if (!current || !(fitScale > 0)) return;
    const zoom = current.scale / fitScale;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    const next = zoomAt(current, anchor, clamped / zoom);
    if (next) setView({ center: next.center, zoom: next.scale / fitScale });
  }, []);

  // React attaches wheel listeners as passive, so the page would scroll: listen natively instead.
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const pixels = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      zoomBy({ x: event.clientX - rect.left, y: event.clientY - rect.top }, Math.max(0.5, Math.min(2, Math.exp(-pixels * 0.0015))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // ---- Geometry that does not depend on pan (paths are in chart space) ----
  const level = gridLevelForScale(viewport?.scale ?? 0);
  const values = useMemo(() => gridValues(level), [level]);
  const zGrid = useMemo(() => (grid === 'y' ? null : buildGrid('z', values)), [grid, values]);
  const yGrid = useMemo(() => (grid === 'z' ? null : buildGrid('y', values)), [grid, values]);
  const unitPath = useMemo(() => circlePath(UNIT_CIRCLE), []);
  const tracePaths = useMemo(() => traces.map(trace => ({
    trace,
    runs: splitByBand(trace.samples, band).map(run => ({ inBand: run.inBand, path: samplesPath(run.samples) })),
    ends: traceEnds((band ? clipTraceToRange(trace.samples, { startHz: band.minHz, stopHz: band.maxHz }) : splitByBand(trace.samples).map(run => run.samples)).flatMap(run => run)),
  })), [traces, band]);

  const labelZ0 = traces[0]?.z0 ?? 50;
  // Start and end dots with their frequency text; a grid label under one of these gives way.
  const endMarks = useMemo(() => (viewport && direction !== 'off' ? tracePaths.flatMap(({ trace, ends }) => {
    if (!ends) return [];
    return [{ sample: ends.start, hollow: true }, { sample: ends.end, hollow: false }].flatMap(({ sample, hollow }) => {
      const at = gammaToPoint(sample.gamma, viewport);
      if (!at) return [];
      const text = formatSmithFrequencyShort(sample.frequencyHz);
      return [{ key: `${trace.traceId}-${hollow ? 'start' : 'end'}`, trace, at, hollow, text, frequencyHz: sample.frequencyHz, textWidth: text.length * fontPx * 0.62 }];
    });
  }) : []), [viewport, direction, tracePaths, fontPx]);

  const gridLabels = useMemo(() => (viewport && labels !== 'off'
    ? buildLabels({ grid: grid === 'y' ? 'y' : 'z', values, viewport, mode: labels, z0: labelZ0, fontPx }).filter(label => !endMarks.some(mark =>
      label.x + label.width / 2 > mark.at.x - 4 && label.x - label.width / 2 < mark.at.x + END_TEXT_DX + mark.textWidth
      && label.y + label.height / 2 > mark.at.y - END_TEXT_DY - fontPx && label.y - label.height / 2 < mark.at.y + 4))
    : []), [viewport, labels, grid, values, labelZ0, fontPx, endMarks]);

  const chevrons = useMemo(() => (viewport && direction === 'chevrons'
    ? traces.map(trace => ({ trace, items: (band ? clipTraceToRange(trace.samples, { startHz: band.minHz, stopHz: band.maxHz }) : splitByBand(trace.samples).map(run => run.samples)).flatMap(run => directionChevrons(run, viewport)) }))
    : []), [traces, viewport, direction, band]);

  // Sample dots and symbols sit on real samples only; a sample outside the view is skipped, never moved.
  const samplePlans = useMemo(() => (viewport ? traces.flatMap(trace => {
    const showSymbols = trace.symbol !== undefined && trace.symbol !== null;
    if (!showSamples && !showSymbols) return [];
    const points = trace.samples.map(sample => {
      const at = gammaToPoint(sample.gamma, viewport);
      return at && (!trace.measured || trace.measured.has(sample.frequencyHz)) && at.x >= 0 && at.x <= viewport.width && at.y >= 0 && at.y <= viewport.height ? at : { x: Number.NaN, y: Number.NaN };
    });
    return [{ trace, points, plan: planDotsAndSymbols({ points, showDots: showSamples, showSymbols }) }];
  }) : []), [traces, viewport, showSamples]);

  // ---- Markers ----
  const paneMarkers = useMemo(() => markers.flatMap((marker, index) => {
    const trace = traces.find(candidate => candidate.name === marker.trace);
    if (!trace) return [];
    const gamma = gammaAtFrequency(trace.samples, marker.freq);
    const name = markerNames?.[marker.id] ?? `${marker.type === 'delta' ? 'DM' : 'M'}${index + 1}`;
    return [{ marker, trace, gamma, name, values: gamma ? smithReadout(gamma, trace.z0, marker.freq) : null }];
  }), [markers, traces, markerNames]);
  const stripMarker = paneMarkers.find(entry => entry.marker.id === selectedMarkerId) ?? paneMarkers[paneMarkers.length - 1] ?? null;

  const stepMarker = (step: 1 | -1): void => {
    if (!onSelectMarker || paneMarkers.length === 0) return;
    const at = stripMarker ? paneMarkers.indexOf(stripMarker) : -1;
    const next = paneMarkers[(at + step + paneMarkers.length) % paneMarkers.length];
    if (next) onSelectMarker(next.marker.id);
  };

  // ---- Pointer ----
  const localPoint = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>): SmithPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const clearHover = (): void => {
    if (hover) { setHover(null); onHoverFrequency?.(null); }
  };
  /** The marker under a screen point, the selected one first when several overlap. */
  const markerAt = (point: SmithPoint) => {
    if (!showMarkers || !viewport) return undefined;
    const near = paneMarkers.filter(entry => {
      const at = entry.gamma ? gammaToPoint(entry.gamma, viewport) : null;
      return !!at && Math.hypot(at.x - point.x, at.y - point.y) <= MARKER_REACH_PX;
    });
    return near.find(entry => entry.marker.id === selectedMarkerId) ?? near[near.length - 1];
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = event.button === 1 || (event.button === 0 && event.ctrlKey);
    if (!pan && event.button !== 0) return;
    if (pan) event.preventDefault();
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, pan };
    // A press on a marker starts dragging it along its trace.
    const grabbed = !pan && onMoveMarker ? markerAt(localPoint(event)) : undefined;
    if (grabbed) {
      drag.current.markerId = grabbed.marker.id;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      clearHover();
    }
    if (pan) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setPanning(true);
      clearHover();
    }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    if (active?.pan && active.pointerId === event.pointerId) {
      const delta = { x: event.clientX - active.x, y: event.clientY - active.y };
      active.x = event.clientX; active.y = event.clientY;
      const current = live.current.viewport;
      const next = current ? panBy(current, delta) : null;
      if (next) setView(previous => ({ center: next.center, zoom: previous.zoom }));
      return;
    }
    if (!viewport) return;
    if (active?.markerId && active.pointerId === event.pointerId) {
      if (!active.moved && Math.hypot(event.clientX - active.startX, event.clientY - active.startY) <= CLICK_SLOP_PX) return;
      const entry = paneMarkers.find(item => item.marker.id === active.markerId);
      // Only the marker's own trace is a target, however close another trace is.
      const own = entry ? traces.filter(trace => trace.traceId === entry.trace.traceId) : [];
      const point = localPoint(event);
      const hit = nearestTracePoint(own, point, viewport);
      if (!entry || !hit) return;
      const sample = nearestSample(own, hit.point, viewport);
      if (!active.moved) { active.moved = true; setPanning(true); onSelectMarker?.(entry.marker.id); }
      onMoveMarker?.(entry.marker.id, { traceId: hit.traceId, frequencyHz: hit.frequencyHz, sampleFrequencyHz: sample?.frequencyHz ?? hit.frequencyHz, sampleDistancePx: sample?.distancePx });
      return;
    }
    const hit = nearestTracePoint(traces, localPoint(event), viewport, HOVER_REACH_PX);
    if (!hit) { clearHover(); return; }
    if (hover && hover.traceId === hit.traceId && hover.frequencyHz === hit.frequencyHz) return;
    setHover({ traceId: hit.traceId, frequencyHz: hit.frequencyHz, gamma: hit.gamma });
    onHoverFrequency?.(hit.frequencyHz);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    drag.current = null;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.pan) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      setPanning(false);
      return;
    }
    if (active.markerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (active.moved) { setPanning(false); onMoveMarkerEnd?.(); return; }
    }
    if (!viewport || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > CLICK_SLOP_PX) return;
    const point = localPoint(event);
    const onMarker = markerAt(point);
    if (onMarker) { onSelectMarker?.(onMarker.marker.id); return; }
    if (!onTraceClick) return;
    const hit = nearestTracePoint(traces, point, viewport, CLICK_REACH_PX);
    if (!hit) return;
    const sample = nearestSample(traces.filter(trace => trace.traceId === hit.traceId).map(trace => ({ ...trace, samples: band ? trace.samples.filter(item => item.frequencyHz >= band.minHz && item.frequencyHz <= band.maxHz) : trace.samples })), point, viewport);
    if (!sample) return;
    onTraceClick({ traceId: hit.traceId, frequencyHz: hit.frequencyHz, sampleFrequencyHz: sample.frequencyHz, sampleDistancePx: sample.distancePx });
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ' || event.key === 'f' || event.key === 'F') { event.preventDefault(); fitView(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy({ x: width / 2, y: height / 2 }, 1.25); }
    else if (event.key === '-') { event.preventDefault(); zoomBy({ x: width / 2, y: height / 2 }, 1 / 1.25); }
  };

  // ---- Hover ----
  const hoverTrace = hover ? traces.find(trace => trace.traceId === hover.traceId) ?? null : null;
  const hoverPoint = hover && viewport ? gammaToPoint(hover.gamma, viewport) : null;
  const hoverValues = hover && hoverTrace ? smithReadout(hover.gamma, hoverTrace.z0, hover.frequencyHz) : null;
  const hoverGrid = hover ? gridThroughGamma(hover.gamma, grid === 'y' ? 'y' : 'z') : null;
  const showY = readout.includes('y') && !readout.includes('z');

  const transform = viewport
    ? `translate(${width / 2 - viewport.center.re * viewport.scale} ${height / 2 + viewport.center.im * viewport.scale}) scale(${viewport.scale})`
    : undefined;
  // The area outside the unit circle, in chart space, for the active-port tint.
  const outsidePath = viewport && hasActive ? (() => {
    const halfW = width / 2 / viewport.scale, halfH = height / 2 / viewport.scale;
    const left = viewport.center.re - halfW, right = viewport.center.re + halfW;
    const top = -viewport.center.im - halfH, bottom = -viewport.center.im + halfH;
    return `M${left},${top}H${right}V${bottom}H${left}Z${unitPath}`;
  })() : null;

  const cardLeft = hoverPoint ? (hoverPoint.x > width - 200 ? hoverPoint.x - 14 : hoverPoint.x + 14) : 0;
  const cardTop = hoverPoint ? (hoverPoint.y > height - 84 ? hoverPoint.y - 14 : hoverPoint.y + 14) : 0;
  const cardShift = hoverPoint ? `translate(${hoverPoint.x > width - 200 ? '-100%' : '0'}, ${hoverPoint.y > height - 84 ? '-100%' : '0'})` : undefined;

  const stripValues: { label: string; trace: SmithPaneTrace; values: SmithReadout | null; frequencyHz: number; fromHover: boolean } | null =
    stripMarker ? { label: stripMarker.name, trace: stripMarker.trace, values: stripMarker.values, frequencyHz: stripMarker.marker.freq, fromHover: false }
      : hover && hoverTrace ? { label: '', trace: hoverTrace, values: hoverValues, frequencyHz: hover.frequencyHz, fromHover: true }
        : null;
  const deltaRef = stripMarker && stripMarker.marker.type === 'delta' && stripMarker.marker.refId
    ? paneMarkers.find(entry => entry.marker.id === stripMarker.marker.refId) ?? null
    : null;

  return (
    <div className="smith-pane" data-testid="smith-pane" data-grid={grid}>
      <div
        ref={plotRef}
        className={`smith-plot t-readout${panning ? ' is-panning' : ''}`}
        data-testid="smith-plot"
        role="img"
        aria-label={traces.length > 0 ? `Smith chart: ${traces.map(trace => trace.shortName ?? trace.name).join(', ')}` : 'Smith chart, empty'}
        tabIndex={0}
        style={size ? { width: size.width, height: size.height, flex: 'none' } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { if (!drag.current?.pan && !drag.current?.markerId) clearHover(); }}
        onMouseDown={event => { if (event.button === 1) event.preventDefault(); }}
        onDoubleClick={fitView}
        onKeyDown={onKeyDown}
      >
        {viewport && (
          <svg className="smith-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <g transform={transform}>
              {outsidePath && <path className="smith-active-area" d={outsidePath} fillRule="evenodd" data-testid="smith-active-area" />}
              {yGrid && (
                <g className={`smith-grid smith-grid-y${zGrid ? ' is-secondary' : ''}`} data-testid="smith-grid-y">
                  {yGrid.circles.map(item => <path key={`g${item.value}`} d={item.path} />)}
                  {yGrid.arcs.map(item => <path key={`b${item.value}`} d={item.path} />)}
                </g>
              )}
              {zGrid && (
                <g className="smith-grid smith-grid-z" data-testid="smith-grid-z">
                  {zGrid.circles.map(item => <path key={`r${item.value}`} d={item.path} />)}
                  {zGrid.arcs.map(item => <path key={`x${item.value}`} d={item.path} />)}
                </g>
              )}
              <path className="smith-axis" d={REAL_AXIS_PATH} />
              <path className={`smith-rim${hasActive ? ' is-active' : ''}`} d={unitPath} />
              {hoverGrid && (
                <g className="smith-hover-grid" data-testid="smith-hover-grid">
                  <path d={hoverGrid.circle.path} />
                  {hoverGrid.arc && <path d={hoverGrid.arc.path} />}
                </g>
              )}
              {tracePaths.map(({ trace, runs }) => (
                <g key={trace.traceId} className="smith-trace" data-testid={`smith-trace-${trace.traceId}`} stroke={trace.color} strokeWidth={trace.created ? 2 : 1.5}>
                  {runs.map((run, index) => <path key={index} className={run.inBand ? undefined : 'is-faint'} d={run.path} />)}
                </g>
              ))}
            </g>

            {gridLabels.map(label => (
              <text key={label.key} className="smith-label" x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central">{label.text}</text>
            ))}

            {samplePlans.map(({ trace, points, plan }) => (
              <g key={`${trace.traceId}-samples`} pointerEvents="none">
                {plan.symbols.map((point, index) => <g key={`s${index}`} data-testid="trace-symbol" data-trace={trace.name} data-sample-index={point.sampleIndex} transform={`translate(${point.x} ${point.y})`}><TraceSymbol kind={trace.symbol ?? 'circle'} color={trace.color} background="var(--smith-bg)" hollow={plan.hollow} /></g>)}
                {plan.dots.map(index => { const point = points[index]; return point ? <circle key={index} data-testid="sample-dot" data-trace={trace.name} data-sample-index={index} cx={point.x} cy={point.y} r={DOT_RADIUS} fill={trace.color} /> : null; })}
              </g>
            ))}

            {chevrons.map(({ trace, items }) => items.map((chevron, index) => (
              <path
                key={`${trace.traceId}-c${index}`}
                className={`smith-chevron${inBand(chevron.frequencyHz, band) ? '' : ' is-faint'}`}
                d="M-3,-3.5L2.5,0L-3,3.5"
                stroke={trace.color}
                strokeWidth={trace.created ? 2 : 1.5}
                transform={`translate(${chevron.x} ${chevron.y}) rotate(${chevron.angleDeg})`}
              />
            )))}

            {endMarks.map(mark => (
              <g key={mark.key} className={`smith-ends${inBand(mark.frequencyHz, band) ? '' : ' is-faint'}`}>
                {mark.hollow
                  ? <circle className="smith-end-start" cx={mark.at.x} cy={mark.at.y} r={3} stroke={mark.trace.color} />
                  : <circle cx={mark.at.x} cy={mark.at.y} r={3} fill={mark.trace.color} />}
                <text className="smith-label" x={mark.at.x + END_TEXT_DX} y={mark.at.y - END_TEXT_DY}>{mark.text}</text>
              </g>
            ))}

            {cursorFrequencyHz !== null && traces.map(trace => {
              const gamma = gammaAtFrequency(trace.samples, cursorFrequencyHz);
              const at = gamma ? gammaToPoint(gamma, viewport) : null;
              return at ? <circle key={`${trace.traceId}-ghost`} className="smith-ghost" data-testid="smith-ghost" cx={at.x} cy={at.y} r={5} /> : null;
            })}

            {showMarkers && paneMarkers.map(({ marker, trace, gamma, name }) => {
              const at = gamma ? gammaToPoint(gamma, viewport) : null;
              if (!at) return null;
              const selected = marker.id === selectedMarkerId;
              const text = selected ? `${name} ${formatSmithFrequency(marker.freq)}` : name;
              const tagW = text.length * fontPx * 0.62 + 10, tagH = fontPx + 7;
              const below = at.y < tagH + 16;
              const tagX = Math.max(2, Math.min(width - tagW - 2, at.x - tagW / 2));
              const tagY = below ? at.y + 12 : at.y - 12 - tagH;
              return (
                <g key={marker.id} className={`smith-marker${selected ? ' is-selected' : ''}`} data-testid={`smith-marker-${marker.id}`}>
                  {selected && <circle className="smith-marker-ring" cx={at.x} cy={at.y} r={9.5} stroke={trace.color} />}
                  <path className="smith-marker-glyph" d={markerGlyph(marker.type, at.x, at.y, 5)} fill={trace.color} />
                  {showMarkerTags && (
                    <>
                      <rect className="smith-tag" x={tagX} y={tagY} width={tagW} height={tagH} rx={4} />
                      <text className="smith-tag-text" x={tagX + tagW / 2} y={tagY + tagH / 2} textAnchor="middle" dominantBaseline="central">{text}</text>
                    </>
                  )}
                </g>
              );
            })}

            {hoverPoint && hoverTrace && <circle className="smith-hover-dot" cx={hoverPoint.x} cy={hoverPoint.y} r={4} stroke={hoverTrace.color} />}
          </svg>
        )}

        {traces.length === 0 && <div className="smith-empty t-caption">No reflection traces in this pane.</div>}

        {hoverPoint && hoverTrace && hoverValues && (
          <div className="smith-card t-readout" data-testid="smith-hover-card" style={{ left: cardLeft, top: cardTop, transform: cardShift }}>
            <div className="smith-card-title"><i className="smith-swatch" style={{ background: hoverTrace.color }} />{hoverTrace.shortName ?? hoverTrace.name}</div>
            <div>{formatSmithFrequency(hoverValues.frequencyHz)}</div>
            <div><span className="smith-key">{showY ? 'Y' : 'Z'}</span>{showY ? formatAdmittance(hoverValues.admittance) : formatImpedance(hoverValues.impedance)}</div>
            <div><span className="smith-key">{'Γ'}</span>{formatGammaPolar(hoverValues.magnitude, hoverValues.angleDeg)}</div>
          </div>
        )}
      </div>

      {rangeBar && traces.length > 0 && <SmithRangeBar {...rangeBar} />}
      {readout.length > 0 && (
        <div className="smith-strip t-readout" data-testid="smith-readout">
          <button type="button" className="smith-step" aria-label="Previous marker" title="Previous marker" disabled={!onSelectMarker || paneMarkers.length < 2} onClick={() => stepMarker(-1)}>{'‹'}</button>
          <button type="button" className="smith-step" aria-label="Next marker" title="Next marker" disabled={!onSelectMarker || paneMarkers.length < 2} onClick={() => stepMarker(1)}>{'›'}</button>
          {stripValues ? (
            <div className="smith-fields">
              <span className="smith-field" data-field="marker">
                <i className="smith-swatch" style={{ background: stripValues.trace.color }} />
                {stripValues.label && <span>{stripValues.label}</span>}
                <span className="smith-key">{stripValues.trace.shortName ?? stripValues.trace.name}</span>
              </span>
              <span className="smith-field" data-field="frequency">{formatSmithFrequency(stripValues.frequencyHz)}</span>
              {deltaRef ? (
                <>
                  <span className="smith-field" data-field="delta-f"><span className="smith-key">{'Δ'}f</span>{formatSmithFrequency(stripValues.frequencyHz - deltaRef.marker.freq)}</span>
                  <span className="smith-field" data-field="delta-rl"><span className="smith-key">{'Δ'}RL</span>{
                    stripValues.values?.returnLossDb.kind === 'value' && deltaRef.values?.returnLossDb.kind === 'value'
                      ? `${(stripValues.values.returnLossDb.value - deltaRef.values.returnLossDb.value).toFixed(2).replace('-', '−')} dB`
                      : SMITH_NO_VALUE
                  }</span>
                </>
              ) : stripValues.values ? (
                <>
                  {readout.includes('z') && <span className="smith-field" data-field="z"><span className="smith-key">Z</span>{formatImpedance(stripValues.values.impedance)}</span>}
                  {readout.includes('y') && <span className="smith-field" data-field="y"><span className="smith-key">Y</span>{formatAdmittance(stripValues.values.admittance)}</span>}
                  {readout.includes('gamma') && <span className="smith-field" data-field="gamma"><span className="smith-key">{'Γ'}</span>{formatGammaPolar(stripValues.values.magnitude, stripValues.values.angleDeg)}</span>}
                  {readout.includes('z') && stripValues.values.equivalent.kind === 'value' && <span className="smith-field" data-field="equivalent"><span className="smith-key">{stripValues.values.equivalent.value.kind}</span>{formatEquivalent(stripValues.values.equivalent)}</span>}
                  {readout.includes('return-loss') && <span className="smith-field" data-field="return-loss"><span className="smith-key">RL</span>{formatReturnLoss(stripValues.values.returnLossDb)}</span>}
                  {readout.includes('vswr') && <span className="smith-field" data-field="vswr"><span className="smith-key">VSWR</span>{formatVswr(stripValues.values.vswr)}</span>}
                </>
              ) : (
                <span className="smith-field smith-key">outside the measured range</span>
              )}
            </div>
          ) : (
            <div className="smith-fields"><span className="smith-field smith-key">{traces.length > 0 ? 'Point at a trace to read Z, Γ and VSWR' : SMITH_NO_VALUE}</span></div>
          )}
        </div>
      )}
    </div>
  );
}
