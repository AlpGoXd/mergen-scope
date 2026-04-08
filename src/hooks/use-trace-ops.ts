import { useState, useCallback } from 'react';
import { useTraceState, useTraceDispatch } from '../stores/trace-store';
import { usePaneState } from '../stores/pane-store';
import { 
  smoothTraceData, 
  computeBinaryTraceMathData,
  type SmoothingMethod,
  type BinaryOp,
  type InterpolationMethod
} from '../domain/trace-ops';
import { makeTraceId } from '../domain/trace-model';
import type { DerivedTrace } from '../types/trace';

/**
 * Hook for managing trace operations (offset, scale, smoothing, subtraction).
 * Ported from app-controller.js.
 */
export function useTraceOps() {
  const { allTraces } = useTraceState();
  const { activePaneId, tracePaneMap } = usePaneState();
  const traceDispatch = useTraceDispatch();

  // Panel UI state
  const [offsetSource, setOffsetSource] = useState<string>('');
  const [offsetValue, setOffsetValue] = useState<string>('0');
  
  const [scaleSource, setScaleSource] = useState<string>('');
  const [scaleValue, setScaleValue] = useState<string>('1');

  const [smoothSource, setSmoothSource] = useState<string>('');
  const [smoothMethod, setSmoothMethod] = useState<SmoothingMethod>('moving-average');
  const [smoothWindow, setSmoothWindow] = useState<string>('11');
  const [smoothPolyOrder, setSmoothPolyOrder] = useState<string>('2');

  const [subtractA, setSubtractA] = useState<string>('');
  const [subtractB, setSubtractB] = useState<string>('');
  const [traceMathOperation, setTraceMathOperation] = useState<BinaryOp>('subtract');
  const [subtractInterpolation, setSubtractInterpolation] = useState<InterpolationMethod>('auto');

  const [error, setError] = useState<string | null>(null);

  /** Helper to get active trace display label. */
  const getTraceLabel = (name: string) => {
    const tr = allTraces.find(t => t.name === name);
    return tr ? (tr.dn || tr.name) : name;
  };

  /** Perform Offset operation. */
  const applyOffset = useCallback(() => {
    setError(null);
    const src = allTraces.find(t => t.name === offsetSource);
    if (!src) { setError('Select a source trace.'); return; }
    const val = parseFloat(offsetValue);
    if (!isFinite(val)) { setError('Invalid offset value.'); return; }

    const id = makeTraceId();
    const derived: DerivedTrace = {
      id,
      kind: 'derived',
      name: `offset-${id}`,
      dn: `${getTraceLabel(offsetSource)} Offset ${val}`,
      sourceTraceIds: [src.id],
      operationType: 'offset',
      parameters: { offset: val },
      data: src.data.map(p => ({ freq: p.freq, amp: p.amp + val })),
      domain: src.domain,
      units: src.units,
      paneId: tracePaneMap[src.name] || activePaneId || 'pane-1',
      file: src.file,
      mode: src.mode,
      detector: src.detector,
    };

    traceDispatch({ type: 'ADD_DERIVED', payload: derived });
  }, [allTraces, offsetSource, offsetValue, tracePaneMap, activePaneId, traceDispatch]);

  /** Perform Scale operation. */
  const applyScale = useCallback(() => {
    setError(null);
    const src = allTraces.find(t => t.name === scaleSource);
    if (!src) { setError('Select a source trace.'); return; }
    const val = parseFloat(scaleValue);
    if (!isFinite(val)) { setError('Invalid scale value.'); return; }

    const id = makeTraceId();
    const derived: DerivedTrace = {
      id,
      kind: 'derived',
      name: `scale-${id}`,
      dn: `${getTraceLabel(scaleSource)} x${val}`,
      sourceTraceIds: [src.id],
      operationType: 'scale',
      parameters: { scale: val },
      data: src.data.map(p => ({ freq: p.freq, amp: p.amp * val })),
      domain: src.domain,
      units: src.units,
      paneId: tracePaneMap[src.name] || activePaneId || 'pane-1',
      file: src.file,
      mode: src.mode,
      detector: src.detector,
    };

    traceDispatch({ type: 'ADD_DERIVED', payload: derived });
  }, [allTraces, scaleSource, scaleValue, tracePaneMap, activePaneId, traceDispatch]);

  /** Perform Smoothing operation. */
  const applySmoothing = useCallback(() => {
    setError(null);
    const src = allTraces.find(t => t.name === smoothSource);
    if (!src) { setError('Select a source trace.'); return; }
    
    const result = smoothTraceData(src.data, smoothMethod, smoothWindow, smoothPolyOrder);
    
    const id = makeTraceId();
    const derived: DerivedTrace = {
      id,
      kind: 'derived',
      name: `smooth-${id}`,
      dn: `${getTraceLabel(smoothSource)} Smooth(${smoothMethod},${result.window})`,
      sourceTraceIds: [src.id],
      operationType: 'smooth',
      parameters: { method: smoothMethod, window: result.window, polyOrder: result.polyOrder },
      data: result.data,
      domain: src.domain,
      units: src.units,
      paneId: tracePaneMap[src.name] || activePaneId || 'pane-1',
      file: src.file,
      mode: src.mode,
      detector: src.detector,
    };

    traceDispatch({ type: 'ADD_DERIVED', payload: derived });
  }, [allTraces, smoothSource, smoothMethod, smoothWindow, smoothPolyOrder, tracePaneMap, activePaneId, traceDispatch]);

  /** Perform Trace Math (Subtraction, etc.) operation. */
  const applyTraceMath = useCallback(() => {
    setError(null);
    const srcA = allTraces.find(t => t.name === subtractA);
    const srcB = allTraces.find(t => t.name === subtractB);
    if (!srcA || !srcB) { setError('Select two source traces.'); return; }

    const result = computeBinaryTraceMathData(srcA.data, srcB.data, subtractInterpolation, traceMathOperation);
    if (result.error) { setError(result.error); return; }
    if (!result.data) { setError('Operation produced no data.'); return; }

    const id = makeTraceId();
    const opLabels: Record<BinaryOp, string> = { add: '+', subtract: '-', multiply: '*', divide: '/' };
    const label = `${getTraceLabel(subtractA)} ${opLabels[traceMathOperation]} ${getTraceLabel(subtractB)}`;

    const derived: DerivedTrace = {
      id,
      kind: 'derived',
      name: `math-${id}`,
      dn: label,
      sourceTraceIds: [srcA.id, srcB.id],
      operationType: traceMathOperation,
      parameters: { operation: traceMathOperation, interpolation: result.appliedInterpolation },
      data: result.data,
      domain: srcA.domain,
      units: srcA.units,
      paneId: activePaneId || 'pane-1',
      file: srcA.file,
      mode: srcA.mode,
      detector: srcA.detector,
    };

    traceDispatch({ type: 'ADD_DERIVED', payload: derived });
  }, [allTraces, subtractA, subtractB, traceMathOperation, subtractInterpolation, activePaneId, traceDispatch]);

  return {
    offsetSource, setOffsetSource, offsetValue, setOffsetValue,
    scaleSource, setScaleSource, scaleValue, setScaleValue,
    smoothSource, setSmoothSource, smoothMethod, setSmoothMethod, smoothWindow, setSmoothWindow, smoothPolyOrder, setSmoothPolyOrder,
    subtractA, setSubtractA, subtractB, setSubtractB, traceMathOperation, setTraceMathOperation, subtractInterpolation, setSubtractInterpolation,
    error, setError,
    applyOffset, applyScale, applySmoothing, applyTraceMath
  };
}
