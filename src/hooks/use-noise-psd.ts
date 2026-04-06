import { useCallback } from 'react';
import { useUiState, useUiDispatch } from '../stores/ui-store';
import { useAnalysisState, useAnalysisDispatch } from '../stores/analysis-store';
import { makeSavedNoiseResult } from '../domain/analysis/noise-psd';

/**
 * Hook for managing Noise PSD analysis state.
 * Ported from app-hooks.js.
 */
export function useNoisePSD() {
  const { noiseFilter, noiseSource } = useUiState();
  const { noiseResults } = useAnalysisState();
  
  const uiDispatch = useUiDispatch();
  const analysisDispatch = useAnalysisDispatch();

  const setNoiseFilter = useCallback((filter: string) => {
    uiDispatch({ type: 'SET', payload: { key: 'noiseFilter', value: filter } });
  }, [uiDispatch]);

  const setNoiseSource = useCallback((source: string | null) => {
    uiDispatch({ type: 'SET', payload: { key: 'noiseSource', value: source } });
  }, [uiDispatch]);

  const setNoiseResults = useCallback((results: any[]) => {
    analysisDispatch({ type: 'SET_NOISE_RESULTS', payload: results });
  }, [analysisDispatch]);

  const addSavedNoise = useCallback((npsdStats: any) => {
    // Ported from app-hooks.js makeSavedNoiseResult
    const saved = makeSavedNoiseResult(npsdStats, noiseFilter, npsdStats?.src || noiseSource);
    if (!saved) return;
    analysisDispatch({ type: 'ADD_NOISE_RESULT', payload: saved });
  }, [noiseFilter, noiseSource, analysisDispatch]);

  return {
    noiseFilter,
    setNoiseFilter,
    noiseSource,
    setNoiseSource,
    noiseResults,
    setNoiseResults,
    addSavedNoise,
  };
}
