import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot
} from 'recharts';
import { usePaneState, usePaneDispatch } from '../../stores/pane-store';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useFileDispatch } from '../../stores/file-store';
import { useTraceState } from '../../stores/trace-store';
import { useTheme } from '../../hooks/use-theme';
import { usePaneData } from '../../hooks/use-pane-data';
import { deriveAxisInfo } from '../../domain/units';
import { canAssignTraceToPane } from '../../domain/pane-math';
import { placeMarker } from '../../domain/markers';
import { Btn } from '../shared/Btn';
import { EmptyChartPane } from './EmptyChartPane';
import { SmithChart } from './SmithChart';

export interface ChartPaneProps {
  paneId: string;
}

interface ChartMouseEvent {
  readonly activeLabel?: number | string;
  readonly activePayload?: ReadonlyArray<{ readonly value?: number }>;
}

/**
 * ChartPane component for rendering a single chart pane with multiple traces, markers, and ref lines.
 * Ported from legacy in app-chart-components.js.
 */
export function ChartPane({ paneId }: ChartPaneProps) {
  const { panes, activePaneId, tracePaneMap, paneActiveTraceMap, zoomAll, sharedZoom, paneXZooms, paneYZooms } = usePaneState();
  const { markers, selectedMkrIdx } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const { refLines, refMode, selectedRefLineId } = useRefLineState();
  const refLineDispatch = useRefLineDispatch();
  const { newMarkerArmed, selectedTraceName, lockLinesAcrossPanes, showDots, traceColors } = useUiState();
  const uiDispatch = useUiDispatch();
  const { colors } = useTheme();
  const paneDispatch = usePaneDispatch();
  const fileDispatch = useFileDispatch();
  const { allTraces, vis } = useTraceState();

  const pane = panes.find(p => p.id === paneId) || panes[0];
  if (!pane) return null; // Should not happen with default
  const firstPaneId = panes[0]?.id;

  const isActive = activePaneId === paneId;
  const isSmith = pane.renderMode === 'smith' || pane.renderMode === 'smith-inverted';

  // Identify traces belonging to this pane
  const traceNamesInPane = useMemo(() => {
    return Object.entries(tracePaneMap)
      .filter(([_, pid]) => pid === paneId)
      .map(([name, _]) => name);
  }, [tracePaneMap, paneId]);

  // Determine current X zoom range
  const currentXZoom = zoomAll ? sharedZoom : (paneXZooms[paneId] || null);
  const xRange = currentXZoom ? { left: currentXZoom.left, right: currentXZoom.right } : null;

  // Prepare data for Recharts (if not Smith)
  const { paneTraces, mergedData } = usePaneData(traceNamesInPane, xRange);

  const axisInfo = useMemo(() => {
    const tracesInPane = allTraces.filter((trace) => traceNamesInPane.includes(trace.name));
    return deriveAxisInfo(tracesInPane, vis, selectedTraceName, null, mergedData.length > 0);
  }, [allTraces, traceNamesInPane, vis, selectedTraceName, mergedData.length]);

  // Determine Y domain
  const yZoom = paneYZooms[paneId];
  const yDomain: [number, number] | ['auto', 'auto'] = yZoom
    ? [yZoom.min, yZoom.max]
    : ['auto', 'auto'];

  // --- Interaction State ---
  const [rightMode, setRightMode] = React.useState<'zoom' | 'pan'>('zoom');
  const [dragStart, setDragStart] = React.useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = React.useState<number | null>(null);
  const [zoomDragActive, setZoomDragActive] = React.useState(false);
  const [panStartFreq, setPanStartFreq] = React.useState<number | null>(null);
  const [panStartZoom, setPanStartZoom] = React.useState<{ left: number; right: number } | null>(null);
  const [draggingMarkerIdx, setDraggingMarkerIdx] = React.useState<number | null>(null);
  const [draggingRefLineId, setDraggingRefLineId] = React.useState<number | null>(null);

  const handleMouseDown = (e: ChartMouseEvent | undefined, button: number) => {
    if (!e || e.activeLabel == null) return;
    const freq = Number(e.activeLabel);
    if (!Number.isFinite(freq)) return;

    // Right mouse button starts one-shot box zoom, then switches to pan mode.
    if (button === 2) {
      if (rightMode === 'zoom') {
        setDragStart(freq);
        setDragCurrent(freq);
        setZoomDragActive(true);
      } else {
        const currentZoom = zoomAll ? sharedZoom : (paneXZooms[paneId] || null);
        if (currentZoom) {
          setPanStartFreq(freq);
          setPanStartZoom({ left: currentZoom.left, right: currentZoom.right });
        }
      }
      return;
    }

    // Only left-button interactions from here.
    if (button !== 0) {
      return;
    }

    // 1. Ref line placement modes
    if (refMode === 'v') {
      refLineDispatch({
        type: 'ADD_LINE',
        payload: {
          id: Date.now(),
          type: 'v',
          value: freq,
          paneId: lockLinesAcrossPanes ? null : paneId,
          groupId: null,
          label: null,
        }
      });
      refLineDispatch({ type: 'SET_MODE', payload: null });
      return;
    }

    if (refMode === 'h') {
      const yVal = e.activePayload?.[0]?.value ?? 0;
      refLineDispatch({
        type: 'ADD_LINE',
        payload: {
          id: Date.now(),
          type: 'h',
          value: yVal,
          paneId: lockLinesAcrossPanes ? null : paneId,
          groupId: null,
          label: null,
        }
      });
      refLineDispatch({ type: 'SET_MODE', payload: null });
      return;
    }

    // 2. Marker drag hit-test
    const xSpan = mergedData.length > 1
      ? (mergedData[mergedData.length - 1]?.fs ?? 0) - (mergedData[0]?.fs ?? 0)
      : 0;
    const tol = xSpan * 0.015;

    const paneMarkers = markers
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => traceNamesInPane.includes(m.trace));
    const markerHit = paneMarkers.find(({ m }) => Math.abs(m.freq - freq) < tol);
    if (markerHit) {
      setDraggingMarkerIdx(markerHit.i);
      return;
    }

    // 3. V-line drag hit-test
    const paneVLines = refLines.filter(rl => rl.type === 'v' && (!rl.paneId || rl.paneId === paneId));
    if (paneVLines.length > 0) {
      const lineHit = paneVLines.find(rl => Math.abs(rl.value - freq) < tol);
      if (lineHit) {
        setDraggingRefLineId(lineHit.id);
        return;
      }
    }

    // 4. Marker placement on left click (default behavior).
    const traceName = selectedTraceName || paneTraces[0]?.name;
    const trace = paneTraces.find((t) => t.name === traceName);
    if (traceName && trace) {
      markerDispatch({
        type: 'PLACE_MARKER',
        payload: {
          traceData: trace.data,
          targetFreq: freq,
          traceName,
        }
      });
      if (newMarkerArmed) {
        uiDispatch({ type: 'SET', payload: { key: 'newMarkerArmed', value: false } });
      }
    }
  };

  const handleMouseMove = (e: ChartMouseEvent | undefined) => {
    if (e && e.activeLabel != null) {
      const freq = Number(e.activeLabel);

      // Marker drag
      if (draggingMarkerIdx !== null) {
        const marker = markers[draggingMarkerIdx];
        const trace = marker ? paneTraces.find(t => t.name === marker.trace) : undefined;
        if (trace) {
          const p = placeMarker(trace.data, freq);
          markerDispatch({
            type: 'UPDATE_MARKER',
            payload: { idx: draggingMarkerIdx, updates: { freq: p.freq, amp: p.amp, interpolated: p.interpolated } }
          });
        }
        return;
      }

      // V-line drag
      if (draggingRefLineId !== null) {
        refLineDispatch({ type: 'UPDATE_LINE', payload: { id: draggingRefLineId, updates: { value: freq } } });
        return;
      }

      // Box zoom tracking (right mouse drag)
      if (zoomDragActive && dragStart !== null) {
        setDragCurrent(freq);
        return;
      }

      if (panStartFreq !== null && panStartZoom) {
        const delta = freq - panStartFreq;
        const next = {
          left: panStartZoom.left - delta,
          right: panStartZoom.right - delta,
        };
        if (zoomAll) {
          paneDispatch({ type: 'SET_SHARED_ZOOM', payload: next });
        } else {
          paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: next } });
        }
      }
    }
  };

  const handleMouseUp = () => {
    // Finalize box zoom
    if (zoomDragActive && draggingMarkerIdx === null && draggingRefLineId === null && dragStart !== null && dragCurrent !== null) {
      const left = Math.min(dragStart, dragCurrent);
      const right = Math.max(dragStart, dragCurrent);
      if (right - left > 0) {
        if (zoomAll) {
          paneDispatch({ type: 'SET_SHARED_ZOOM', payload: { left, right } });
        } else {
          paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: { left, right } } });
        }
        setRightMode('pan');
      }
    }
    setDragStart(null);
    setDragCurrent(null);
    setZoomDragActive(false);
    setPanStartFreq(null);
    setPanStartZoom(null);
    setDraggingMarkerIdx(null);
    setDraggingRefLineId(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();

    const currentY = paneYZooms[paneId];
    const allAmps = mergedData.flatMap((row) =>
      paneTraces
        .map((trace) => row[trace.name] as number | undefined)
        .filter((value): value is number => value != null && Number.isFinite(value))
    );

    if (allAmps.length === 0) {
      return;
    }

    const minA = currentY?.min ?? Math.min(...allAmps);
    const maxA = currentY?.max ?? Math.max(...allAmps);
    const pad = (maxA - minA) * 0.05 || 1;
    const baseMin = currentY ? currentY.min : minA - pad;
    const baseMax = currentY ? currentY.max : maxA + pad;
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const mid = (baseMin + baseMax) / 2;
    const half = ((baseMax - baseMin) / 2) * factor;

    paneDispatch({
      type: 'SET_PANE_Y_ZOOM',
      payload: { paneId, zoom: { min: mid - half, max: mid + half } },
    });
  };

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1) {
      return;
    }

    e.preventDefault();
    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId, zoom: null } });
    if (zoomAll) {
      paneDispatch({ type: 'SET_SHARED_ZOOM', payload: null });
    } else {
      paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: null } });
    }
    setRightMode('zoom');
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragStart(null);
    setDragCurrent(null);
    setZoomDragActive(false);
    setPanStartFreq(null);
    setPanStartZoom(null);
    setDraggingMarkerIdx(null);
    setDraggingRefLineId(null);
  };

  const activePaneTrace = useMemo(() => {
    const activeTraceName = paneActiveTraceMap[paneId];
    return paneTraces.find((trace) => trace.name === activeTraceName)
      ?? paneTraces.find((trace) => trace.name === selectedTraceName)
      ?? paneTraces[0]
      ?? null;
  }, [paneActiveTraceMap, paneId, paneTraces, selectedTraceName]);

  const xAxisLabelText = useMemo(() => {
    if (!activePaneTrace) {
      return axisInfo.xLabel;
    }
    const xUnit = activePaneTrace.units.x ? String(activePaneTrace.units.x) : (activePaneTrace.domain === 'time' ? 's' : 'Hz');
    return activePaneTrace.domain === 'time' ? `Time (${xUnit})` : `Frequency (${xUnit})`;
  }, [activePaneTrace, axisInfo.xLabel]);

  const yAxisLabelText = useMemo(() => {
    if (!activePaneTrace) {
      return axisInfo.yLabel;
    }

    const yUnit = activePaneTrace.units.y ? String(activePaneTrace.units.y) : '';
    const source = activePaneTrace.kind === 'raw' ? activePaneTrace.networkSource : undefined;
    if (source?.view === 'Phase') {
      return `Phase (${yUnit || 'deg'})`;
    }
    if (source?.family === 'S' && source?.view === 'dB') {
      return `Magnitude (${yUnit || 'dB'})`;
    }
    if (source?.view === 'Real') {
      return `Real (${yUnit || 'linear'})`;
    }
    if (source?.view === 'Imag') {
      return `Imag (${yUnit || 'linear'})`;
    }
    if (yUnit) {
      const lower = yUnit.toLowerCase();
      if (lower.includes('dbm')) return `Amplitude (${yUnit})`;
      if (lower.includes('db')) return `Magnitude (${yUnit})`;
      if (lower.includes('deg')) return `Phase (${yUnit})`;
      return `Amplitude (${yUnit})`;
    }
    return axisInfo.yLabel || 'Amplitude';
  }, [activePaneTrace, axisInfo.yLabel]);

  const selectedTrace = useMemo(() => {
    return selectedTraceName ? allTraces.find((trace) => trace.name === selectedTraceName) ?? null : null;
  }, [allTraces, selectedTraceName]);

  const canMoveSelectedHere = !!selectedTrace && (tracePaneMap[selectedTrace.name] || 'pane-1') !== paneId;

  const resolveTraceColor = useMemo(() => {
    const tracePalette = colors?.tr ?? [];
    const derivedPalette = colors?.dr ?? [];
    return (traceName: string): string => {
      const custom = traceColors[traceName];
      if (custom) return custom;
      const trace = allTraces.find((item) => item.name === traceName);
      const isDerived = trace?.kind === 'derived';
      const palette = isDerived ? derivedPalette : tracePalette;
      const globalIdx = allTraces
        .filter((item) => item.kind === (isDerived ? 'derived' : 'raw'))
        .findIndex((item) => item.name === traceName);
      const safeIdx = globalIdx >= 0 ? globalIdx : 0;
      return palette[safeIdx % (palette.length || 1)] || 'var(--accent)';
    };
  }, [allTraces, colors?.dr, colors?.tr, traceColors]);

  const handlePaneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (
      e.dataTransfer.types.includes('application/x-mergen-trace')
      || e.dataTransfer.types.includes('text/plain')
      || e.dataTransfer.files.length > 0
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-mergen-trace') ? 'move' : 'copy';
    }
  };

  const handlePaneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const traceName =
      e.dataTransfer.getData('application/x-mergen-trace') ||
      e.dataTransfer.getData('text/plain');
    if (traceName) {
      const trace = allTraces.find((item) => item.name === traceName);
      if (!trace) return;

      const validation = canAssignTraceToPane(trace, paneId, allTraces, tracePaneMap);
      if (!validation.allowed) {
        const paneDomain = allTraces.find((item) => (tracePaneMap[item.name] ?? 'pane-1') === paneId)?.domain;
        const message = paneDomain === 'time'
          ? 'Cannot place frequency-domain traces on a time-domain pane'
          : 'Cannot place time-domain traces on a frequency-domain pane';
        uiDispatch({
          type: 'SET',
          payload: {
            key: 'paneAssignmentWarning',
            value: { message, paneId, traceName: trace.name },
          },
        });
        return;
      }

      uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } });
      paneDispatch({
        type: 'ASSIGN_TRACE_TO_PANE',
        payload: { trace, targetPaneId: paneId, allTraces },
      });
      paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName: trace.name } });
      paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
      return;
    }

    if (e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        const rawText = await file.text();
        fileDispatch({
          type: 'QUEUE_WIZARD',
          payload: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`,
            fileName: file.name,
            rawText,
          },
        });
      }
    }
  };

  // Style helpers
  const paneHeader = (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 10px',
      background: isActive ? `${colors?.accent}10` : 'var(--card)',
      borderBottom: '1px solid var(--border)',
      cursor: 'pointer'
    }} onClick={() => paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId })}>
      <span
        title={pane.title || `Pane ${paneId.split('-')[1]}`}
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: isActive ? colors?.accent : 'var(--muted)',
          textTransform: 'uppercase',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {pane.title || `Pane ${paneId.split('-')[1]}`}
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', flexShrink: 0 }}>
        <Btn soft
          style={{ padding: '2px 6px', fontSize: '10px' }}
          disabled={!canMoveSelectedHere}
          onClick={(e) => {
            e.stopPropagation();
            if (!selectedTrace) return;
            const validation = canAssignTraceToPane(selectedTrace, paneId, allTraces, tracePaneMap);
            if (!validation.allowed) {
              const message = selectedTrace.domain === 'time'
                ? 'Cannot place time-domain traces on a frequency-domain pane'
                : 'Cannot place frequency-domain traces on a time-domain pane';
              uiDispatch({
                type: 'SET',
                payload: {
                  key: 'paneAssignmentWarning',
                  value: { message, paneId, traceName: selectedTrace.name },
                },
              });
              return;
            }
            uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } });
            paneDispatch({
              type: 'ASSIGN_TRACE_TO_PANE',
              payload: { trace: selectedTrace, targetPaneId: paneId, allTraces },
            });
            paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName: selectedTrace.name } });
            paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
          }}
        >
          Move Selected Trace Here
        </Btn>
        <Btn soft
          style={{ padding: '2px 6px', fontSize: '10px' }}
          onClick={(e) => {
            e.stopPropagation();
            if (zoomAll) paneDispatch({ type: 'SET_SHARED_ZOOM', payload: null });
            else paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: null } });
          }}
        >
          Fit
        </Btn>
      </div>
    </div>
  );

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: '200px',
      borderTop: firstPaneId && paneId !== firstPaneId ? '1px solid var(--border)' : 'none',
      background: 'var(--bg)',
      userSelect: 'none'
    }} onDragEnter={handlePaneDragOver} onDragOver={handlePaneDragOver} onDrop={handlePaneDrop}>
      {paneHeader}

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {isSmith ? (
          <SmithChart
            paneId={paneId}
            traces={paneTraces}
            renderMode={pane.renderMode as 'smith' | 'smith-inverted'}
          />
        ) : traceNamesInPane.length === 0 ? (
          <EmptyChartPane mode={allTraces.length > 0 ? 'traces' : 'files'} />
        ) : mergedData.length === 0 ? (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--dim)',
            fontSize: '13px'
          }}>
            No visible traces in this pane.
          </div>
        ) : (
          <div onWheel={handleWheel} onMouseDown={handleContainerMouseDown} onContextMenu={handleContextMenu} style={{ height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={mergedData}
                margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                onMouseDown={(state) => {
                  // Recharts does not expose native button directly in this callback.
                  // Capture via window event for immediate interaction mode decision.
                  const button = (window.event as MouseEvent | undefined)?.button ?? 0;
                  handleMouseDown(state, button);
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={true} horizontal={true} />

                <XAxis
                  dataKey="fs"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  stroke="var(--muted)"
                  fontSize={11}
                  tickFormatter={(v) => v >= 1e9 ? `${(v / 1e9).toFixed(1)}G` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v}
                  hide={false}
                  label={{ value: xAxisLabelText, position: 'insideBottom', offset: -5, style: { fontSize: 11, fill: 'var(--muted)', textAnchor: 'middle' } }}
                />

                <YAxis
                  domain={yDomain}
                  stroke="var(--muted)"
                  fontSize={11}
                  width={50}
                  label={{ value: yAxisLabelText, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: 'var(--muted)' } }}
                />

                <Tooltip
                  isAnimationActive={false}
                  contentStyle={{ background: 'var(--tipBg)', borderColor: 'var(--tipBd)', color: 'var(--text)', fontSize: '10px' }}
                  itemStyle={{ fontSize: '11px', padding: '2px 0' }}
                />

                {paneTraces.map((tr) => (
                  <Line
                    key={tr.name}
                    type="monotone"
                    dataKey={tr.name}
                    name={tr.dn || tr.name}
                    stroke={resolveTraceColor(tr.name)}
                    dot={showDots ? { r: 2, fill: resolveTraceColor(tr.name), stroke: resolveTraceColor(tr.name) } : false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                    connectNulls={true}
                    strokeWidth={selectedTraceName === tr.name ? 2 : 1.5}
                  />
                ))}

                {/* Markers */}
                {markers.filter(m => traceNamesInPane.includes(m.trace || '')).map((m, i) => (
                  <ReferenceDot
                    key={`m-${i}`}
                    x={m.freq}
                    y={m.amp}
                    r={selectedMkrIdx === i ? 5 : 4}
                    fill={m.interpolated ? 'none' : resolveTraceColor(m.trace || '')}
                    stroke={resolveTraceColor(m.trace || '')}
                    strokeWidth={m.interpolated ? 2 : 1}
                  />
                ))}

                {/* Reference Lines */}
                {refLines.filter(rl => !rl.paneId || rl.paneId === paneId).map(rl => (
                  <ReferenceLine
                    key={rl.id}
                    {...(rl.type === 'v' ? { x: rl.value } : { y: rl.value })}
                    stroke={rl.type === 'v' ? colors?.refV : colors?.refH}
                    strokeDasharray="4 4"
                    strokeWidth={selectedRefLineId === rl.id ? 2 : 1}
                  />
                ))}

                {/* Drag Overlay */}
                {dragStart !== null && dragCurrent !== null && (
                  <ReferenceLine x={dragStart} stroke="var(--accent)" strokeWidth={1} />
                )}
                {dragStart !== null && dragCurrent !== null && (
                  <ReferenceLine x={dragCurrent} stroke="var(--accent)" strokeWidth={1} />
                )}

                <ReferenceLine y={0} stroke="var(--dim)" strokeWidth={0.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
