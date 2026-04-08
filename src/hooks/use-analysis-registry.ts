import { useMemo } from 'react';
import { useAnalysisState } from '../stores/analysis-store';
import { useAnalysisTarget } from './use-analysis-target';
import { makeAnalysisRegistry } from '../domain/analysis/registry';
import type { AnalysisRegistryEntry } from '../types/analysis';

/**
 * Hook for building the stateful analysis registry for the UI.
 * Consumes AnalysisStore and AnalysisTarget to filter and enrich analysis items.
 */
export function useAnalysisRegistry() {
  const { analysisOpenState, noiseResults, ip3Results } = useAnalysisState();
  const { target } = useAnalysisTarget();

  const registry = useMemo((): AnalysisRegistryEntry[] => {
    // Map existing results to counts for the registry badge
    const counts: Record<string, number> = {
      'noise-psd': Object.keys(noiseResults).length,
      'ip3': Object.keys(ip3Results).length,
    };

    return makeAnalysisRegistry(analysisOpenState, counts, { target });
  }, [analysisOpenState, noiseResults, ip3Results, target]);

  return registry;
}
