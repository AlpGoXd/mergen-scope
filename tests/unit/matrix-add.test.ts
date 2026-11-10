import { expect, it } from 'vitest';
import { matrixCellTraces, planMatrixAdd } from '../../src/domain/matrix-add';
import type { MatrixTrace } from '../../src/domain/matrix-add';

it('distinguishes a duplicate from a new view or pane', () => {
  const traces: MatrixTrace[] = [{ name: 'S11', family: 'S', row: 0, col: 0, view: 'dB', paneIds: ['pane-1'] }];
  const input = { family: 'S' as const, row: 0, col: 0, view: 'dB' as const, targetPaneId: 'pane-1', targetPaneType: 'cartesian', traces };
  expect(planMatrixAdd(input).kind).toBe('duplicate');
  expect(planMatrixAdd({ ...input, view: 'Mag' }).kind).toBe('add');
  expect(planMatrixAdd({ ...input, targetPaneId: 'pane-2' }).kind).toBe('add');
  expect(planMatrixAdd({ ...input, targetPaneType: 'smith', col: 1 }).kind).toBe('refused');
  expect(planMatrixAdd({ ...input, targetPaneType: 'smith', view: 'Mag' }).kind).toBe('duplicate');
  for (const family of ['Z', 'Y'] as const) {
    expect(planMatrixAdd({ ...input, family, targetPaneType: 'smith' }).kind).toBe('add');
    expect(planMatrixAdd({ ...input, family, row: 1, col: 1, targetPaneType: 'smith' }).kind).toBe('refused');
  }
  expect(matrixCellTraces(traces, 'S', 0, 0)).toHaveLength(1);
  expect(matrixCellTraces(traces, 'S', 1, 0)).toEqual([]);
  expect(matrixCellTraces(traces, 'S', 0, 0)[0]).toEqual({ name: 'S11', view: 'dB', paneIds: ['pane-1'] });
});
