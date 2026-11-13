import { describe, expect, it } from 'vitest';
import { lineView } from '../../src/domain/line-view';
import type { RefLine } from '../../src/types/ref-line';

const layout = [{ id: 'a', title: 'Pane 1' }, { id: 'b', title: 'Pane 2' }];
const line: RefLine = { id: 1, type: 'v', value: 2, paneIds: ['b', 'a'], label: 'V1' };

describe('lineView', () => {
  it('orders badges by layout, counts crossings and uses inclusive X bounds', () => {
    const result = lineView(line, layout, { a: { x: [1, 2], y: null }, b: { x: [3, 4], y: null } }, [
      { paneId: 'a', traceName: 'a', freq: 2, amp: 1 },
      { paneId: 'b', traceName: 'b', freq: 2, amp: 1 },
    ], '2 Hz');
    expect(result).toEqual({ value: '2 Hz', panes: ['P1', 'P2'], offView: ['P2'], crossings: '2 crossings' });
  });

  it('uses Y for horizontal lines and treats missing views as unknown', () => {
    const result = lineView({ ...line, type: 'h' }, layout, { a: { x: [0, 1], y: [3, 4] } }, [], '2');
    expect(result.offView).toEqual(['P1']);
    expect(result.crossings).toBe('0 crossings');
  });

  it('omits crossing count when unplaced', () => {
    expect(lineView({ ...line, paneIds: [] }, layout, {}, [], '2').crossings).toBeUndefined();
  });
});
