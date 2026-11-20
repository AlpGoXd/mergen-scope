import { describe, expect, it } from 'vitest';
import { pdfPageSize } from '../../src/domain/export-pdf';

describe('paper PDF page size', () => {
  it('uses exact IEEE widths and preserves the viewBox aspect ratio', () => {
    expect(pdfPageSize('ieee-1', 336, 210)).toEqual({ width: 88.9, height: 88.9 * 210 / 336 });
    const landscape = pdfPageSize('ieee-2', 688, 300);
    expect(landscape.width).toBe(181.9);
    expect(landscape.height).toBeCloseTo(181.9 * 300 / 688, 12);
  });
});
