import type { AnalysisTool } from '../../../types/registry-contract';
import { computeBinaryTraceMathData } from '../../trace-ops';
import { areUnitsCompatible } from '../../units';
import { allowed, anyTrace, denied, derived } from './shared';

const params = { operation: { kind: 'choice', title: 'Operation', defaultValue: 'add', options: ['add', 'subtract', 'multiply', 'divide'] } } as const;
export const traceMathTool: AnalysisTool<typeof params> = {
  kind: 'math', meta: { id: 'trace-math', title: 'Trace math', description: 'Combine two traces.' }, params,
  outputs: [{ type: 'trace' }], appliesTo: anyTrace,
  appliesToInputs: ({ traces }) => { const a = traces[0]; const b = traces[1]; if (!a || !b) return denied('Select two traces.'); const result = areUnitsCompatible(a.units.y, b.units.y, 'add'); return result.compatible ? allowed : denied(result.warning ?? 'Incompatible units.'); },
  compute: ({ traces }, p) => { const a = traces[0]; const b = traces[1]; if (!a || !b) return []; const units = areUnitsCompatible(a.units.y, b.units.y, p.operation); if (!units.compatible) return []; const result = computeBinaryTraceMathData(a.data, b.data, 'auto', p.operation); return result.data ? [{ type: 'trace', trace: { ...derived(a, result.data, p.operation, { ...p }, [a.id, b.id]), units: { ...a.units, y: units.resultUnit } } }] : []; },
};
