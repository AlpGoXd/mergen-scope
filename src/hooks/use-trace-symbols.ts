import { useEffect, useState } from 'react';
import { readAppPreferences } from '../components/settings/app-preferences';
import { allocateTraceColors, symbolFor } from '../domain/trace-palette';
import { useTraceState } from '../stores/trace-store';
import { useUiState } from '../stores/ui-store';

export function useTraceSymbols() {
  const { allKnownTraces } = useTraceState();
  const { traceHueSlots } = useUiState();
  const assignments = allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots)));
  const [setting, setSetting] = useState(() => readAppPreferences().traceSymbols);
  useEffect(() => {
    const update = () => setSetting(readAppPreferences().traceSymbols);
    window.addEventListener('mergen-preferences', update);
    return () => window.removeEventListener('mergen-preferences', update);
  }, []);
  return (id: string) => {
    const assignment = assignments.get(id);
    return assignment ? symbolFor(assignment, setting) : null;
  };
}
