import { describe, expect, it } from 'vitest';
import { pickerStep } from '../../src/domain/pane-picker-layout';

describe('pickerStep', () => {
  it.each([
    [640, 400, 'L', 3], [639, 400, 'M', 3], [360, 300, 'M', 3],
    [359, 300, 'S', 3], [300, 150, 'S', 3], [299, 150, 'I', 3],
    [299, 301, 'I', 2], [300, 149, 'I', 3], [640, 399, 'M', 3],
  ] as const)('%i x %i', (width, height, step, columns) => {
    expect(pickerStep(width, height)).toEqual({ step, columns });
  });
});
