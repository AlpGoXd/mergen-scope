import { describe, expect, it } from 'vitest';
import { pickerLayout } from '../../src/components/panes/pane-picker-layout';

describe('pickerLayout (design board P9)', () => {
  it('uses large tiles in a big pane', () => {
    expect(pickerLayout(900, 600)).toEqual({ size: 'L', cols: 3 });
    expect(pickerLayout(640, 400)).toEqual({ size: 'L', cols: 3 });
  });
  it('steps down to medium just below the large thresholds', () => {
    expect(pickerLayout(639, 400)).toEqual({ size: 'M', cols: 3 });
    expect(pickerLayout(640, 399)).toEqual({ size: 'M', cols: 3 });
    expect(pickerLayout(360, 300)).toEqual({ size: 'M', cols: 3 });
  });
  it('uses small buttons in a quarter pane', () => {
    expect(pickerLayout(470, 230)).toEqual({ size: 'S', cols: 3 });
    expect(pickerLayout(300, 150)).toEqual({ size: 'S', cols: 3 });
    expect(pickerLayout(359, 300)).toEqual({ size: 'S', cols: 3 });
  });
  it('goes to icons only in very small panes', () => {
    expect(pickerLayout(299, 150)).toEqual({ size: 'I', cols: 3 });
    expect(pickerLayout(400, 149)).toEqual({ size: 'I', cols: 3 });
  });
  it('switches tall narrow panes to 2 columns × 3 rows', () => {
    expect(pickerLayout(260, 500)).toEqual({ size: 'S', cols: 2 });
    expect(pickerLayout(299, 300)).toEqual({ size: 'S', cols: 2 });
  });
});
