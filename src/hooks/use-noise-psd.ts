import { useCallback, useState } from 'react';
import { useUiState, useUiDispatch } from '../stores/ui-store';
import { useAnalysisState, useAnalysisDispatch } from '../stores/analysis-store';
import { useTraceState } from '../stores/trace-store';
import { makeSavedNoiseResult, type NoiseStats } from '../domain/analysis/noise-psd';
import { noisePSD } from '../domain/analysis/noise-psd';
import type { DataPoint } from '../types/trace';

export interface NoisePsdResult {
  readonly traceName: string;
  readonly traceLabel: string;
  readonly rbw: number;
  readonly data: readonly DataPoint[];
  readonly stats: NoiseStats;
}

/**
 * Hook for managing Noise PSD analysis state.
 * Ported from app-hooks.js.
 */
export function useNoisePSD() {
  const { noiseFilter, noiseSource, selectedTraceName } = useUiState();
  const { noiseResults } = useAnalysisState();
  const { allTraces } = useTraceState();
  const [result, setResult] = useState<NoisePsdResult | null>(null);
  
  const uiDispatch = useUiDispatch();
  const analysisDispatch = useAnalysisDispatch();

  const setNoiseFilter = useCallback((filter: string) => {
    uiDispatch({ type: 'SET', payload: { key: 'noiseFilter', value: filter } });
  }, [uiDispatch]);

  const setNoiseSource = useCallback((source: string | null) => {
    uiDispatch({ type: 'SET', payload: { key: 'noiseSource', value: source } });
  }, [uiDispatch]);

  const setNoiseResults = useCallback((results: DataPoint[][]) => {
    results.forEach((result, index) => {
      analysisDispatch({ type: 'SET_NOISE_RESULT', payload: { id: `noise-${index}`, result } });
    });
  }, [analysisDispatch]);

  const estimateRbw = useCallback((data: readonly DataPoint[]) => {
    if (data.length < 2) {
      return 1;
    }

    const deltas = data
      .slice(1)
      .map((point, index) => point.freq - data[index]!.freq)
      .filter((delta) => Number.isFinite(delta) && delta > 0)
      .sort((a, b) => a - b);

    if (deltas.length === 0) {
      return 1;
    }

    const middle = Math.floor(deltas.length / 2);
    return deltas[middle] ?? 1;
  }, []);

  const compute = useCallback(() => {
    const traceName = noiseSource || selectedTraceName || allTraces[0]?.name || null;
    const trace = traceName ? allTraces.find((item) => item.name === traceName) ?? null : null;
    if (!trace || trace.data.length === 0) {
      setResult(null);
      return null;
    }

    const rbw = estimateRbw(trace.data);
    const data = noisePSD(trace.data, rbw, noiseFilter);
    if (data.length === 0) {
      setResult(null);
      return null;
    }

    const peak = data.reduce((best, point) => (point.amp > best.amp ? point : best), data[0]!);
    const min = data.reduce((best, point) => (point.amp < best.amp ? point : best), data[0]!);
    const avg = data.reduce((sum, point) => sum + point.amp, 0) / data.length;

    const nextResult: NoisePsdResult = {
      traceName: trace.name,
      traceLabel: trace.dn || trace.name,
      rbw,
      data,
      stats: {
        rbw,
        peak,
        min,
        avg,
        src: trace.name,
      },
    };

    setResult(nextResult);
    return nextResult;
  }, [allTraces, estimateRbw, noiseFilter, noiseSource, selectedTraceName]);

  const addSavedNoise = useCallback((npsdStats: NoiseStats) => {
    // Ported from app-hooks.js makeSavedNoiseResult
    const saved = makeSavedNoiseResult(npsdStats, noiseFilter, { name: npsdStats?.src || noiseSource || null });
    if (!saved) return;
    analysisDispatch({ type: 'SET_NOISE_RESULT', payload: { id: String(saved.id), result: [] } });
  }, [noiseFilter, noiseSource, analysisDispatch]);

  return {
    noiseFilter,
    setNoiseFilter,
    noiseSource,
    setNoiseSource,
    result,
    compute,
    noiseResults,
    setNoiseResults,
    addSavedNoise,
  };
}
