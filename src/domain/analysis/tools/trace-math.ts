import type { AnalysisTool } from '../../../types/registry-contract';
import { alignAndCompute, describeStimulus } from '../trace-math-align';
import type { MathFill, MathPoints } from '../trace-math-align';
import { traceMathUnit } from '../../units';
import { allowed, anyTrace, denied, derived } from './shared';

const params = { operation: { kind: 'choice', title: 'Operation', defaultValue: 'add', options: ['add', 'subtract', 'multiply', 'divide'] }, points: { kind: 'choice', title: 'Points', defaultValue: '', options: ['', 'a', 'b', 'both'] }, fill: { kind: 'choice', title: 'Fill gaps', defaultValue: '', options: ['', 'linear', 'cubic', 'nearest', 'previous', 'next', 'sinc'] } } as const;
export const traceMathTool: AnalysisTool<typeof params> = {
  kind: 'math', meta: { id: 'trace-math', title: 'Trace math', description: 'Combine two traces.' }, params,
  outputs: [{ type: 'trace' }], appliesTo: anyTrace,
  appliesToInputs: ({ traces }) => {
    const a = traces[0]; const b = traces[1];
    if (!a || !b) return denied('Select two traces.');
    const stimulus = describeStimulus(a, b);
    if (stimulus.domainMismatch || (!stimulus.overlap && !stimulus.identical)) {
      const result = alignAndCompute(a, b, 'add', undefined, undefined);
      return 'reason' in result ? denied(result.reason) : allowed;
    }
    return allowed;
  },
  compute: ({ traces }, p) => { const a = traces[0]; const b = traces[1]; if (!a || !b) return []; const units = traceMathUnit(p.operation, a.units.y, b.units.y); const result = alignAndCompute(a, b, p.operation, (p.points || undefined) as MathPoints | undefined, (p.fill || undefined) as MathFill | undefined); return 'data' in result ? [{ type: 'trace', trace: { ...derived(a, result.data, p.operation, { ...p }, [a.id, b.id]), units: { ...a.units, y: units.unit } } }] : []; },
};
