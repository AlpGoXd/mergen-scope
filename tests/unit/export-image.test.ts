import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS, PAPER_MARK_RADIUS_PT, PAPER_TAG_PT, exportFileName, exportGeometry, exportImageFileName, exportPhysicalSize, layoutLegend, mmToCssPx, parseExportOptions, ptToCssPx } from '../../src/domain/export-image';
import type { ExportDpi, ExportImageOptions } from '../../src/domain/export-image';

const options = (patch: Partial<ExportImageOptions>): ExportImageOptions => ({ ...DEFAULT_EXPORT_OPTIONS, ...patch });

describe('export image geometry', () => {
  it('exports pane size at 2×', () => {
    expect(exportGeometry(options({ size: 'pane' }), { width: 640.4, height: 359.6 })).toEqual({ cssWidth: 640, cssHeight: 360, pixelWidth: 1280, pixelHeight: 720, paper: false });
  });

  it('lays out IEEE columns at 96 css px per inch and rasterises at the chosen dpi', () => {
    const pane = { width: 800, height: 400 };
    const expected: Record<ExportDpi, number> = { 150: 525, 300: 1050, 600: 2100 };
    for (const dpi of [150, 300, 600] as const) {
      const one = exportGeometry(options({ size: 'ieee-1', dpi }), pane);
      expect(one.cssWidth).toBe(336);
      expect(one.cssHeight).toBe(168);
      expect(one.pixelWidth).toBe(expected[dpi]);
      expect(one.pixelHeight).toBe(Math.round(168 * expected[dpi] / 336));
      expect(one.paper).toBe(true);
    }
    const two = exportGeometry(options({ size: 'ieee-2', dpi: 600 }), pane);
    expect(two.cssWidth).toBe(687);
    expect(two.pixelWidth).toBe(4297);
  });

  it('clamps the paper aspect ratio and falls back when the pane has no size', () => {
    expect(exportGeometry(options({ size: 'ieee-1' }), { width: 1000, height: 100 }).cssHeight).toBe(Math.round(336 * 0.45));
    expect(exportGeometry(options({ size: 'ieee-1' }), { width: 100, height: 1000 }).cssHeight).toBe(336);
    expect(exportGeometry(options({ size: 'ieee-1' }), { width: 0, height: 0 }).cssHeight).toBe(Math.round(336 * 0.62));
    expect(exportGeometry(options({ size: 'pane' }), { width: Number.NaN, height: 0 })).toMatchObject({ cssWidth: 1, cssHeight: 1 });
  });

  it('converts points and millimetres to css px', () => {
    expect(ptToCssPx(8)).toBeCloseTo(10.667, 3);
    expect(ptToCssPx(0.75)).toBe(1);
    expect(mmToCssPx(25.4)).toBe(96);
  });
});

describe('export image file name', () => {
  const day = new Date(2026, 0, 5, 23, 30);
  it('uses {file}_{pane}_{yyyy-mm-dd}.png with the extension removed', () => {
    expect(exportImageFileName('amp.dat', 'Pane 1', new Date(2026, 10, 13))).toBe('amp_Pane-1_2026-11-13.png');
  });
  it('zero-pads the local date', () => {
    expect(exportImageFileName('a.csv', 'Pane 2', day)).toBe('a_Pane-2_2026-01-05.png');
  });
  it('sanitises characters that are not allowed in file names', () => {
    expect(exportImageFileName('my run: 1/2.s2p', ' Pane 3 ', day)).toBe('my-run-1-2_Pane-3_2026-01-05.png');
  });
  it('falls back to "mergen" without a file', () => {
    expect(exportImageFileName(null, 'Pane 1', day)).toBe('mergen_Pane-1_2026-01-05.png');
    expect(exportImageFileName('', 'Pane 1', day)).toBe('mergen_Pane-1_2026-01-05.png');
  });
});

describe('export options', () => {
  it('parses stored options and falls back field by field', () => {
    expect(parseExportOptions(null)).toEqual(DEFAULT_EXPORT_OPTIONS);
    expect(parseExportOptions('not json')).toEqual(DEFAULT_EXPORT_OPTIONS);
    expect(parseExportOptions(JSON.stringify({ size: 'ieee-2', dpi: 300, theme: 'dark' }))).toEqual({ size: 'ieee-2', dpi: 300, theme: 'dark' });
    expect(parseExportOptions({ size: 'huge', dpi: 72, theme: 'neon' })).toEqual(DEFAULT_EXPORT_OPTIONS);
    expect(parseExportOptions({ dpi: 150 })).toEqual({ ...DEFAULT_EXPORT_OPTIONS, dpi: 150 });
  });
});

describe('legend layout', () => {
  const opts = { itemGap: 10, rowHeight: 20, padding: 5 };
  it('is empty without items', () => {
    expect(layoutLegend([], 300, opts)).toEqual({ items: [], height: 0 });
  });
  it('wraps items onto rows that fit the width', () => {
    const layout = layoutLegend([100, 100, 100], 230, opts);
    expect(layout.items).toEqual([{ x: 5, y: 5 }, { x: 115, y: 5 }, { x: 5, y: 25 }]);
    expect(layout.height).toBe(2 * 20 + 10);
  });
  it('gives an item wider than the row a row of its own', () => {
    const layout = layoutLegend([50, 400, 50], 200, opts);
    expect(layout.items.map(item => item.y)).toEqual([5, 25, 45]);
  });
});

describe('export file names and SVG size', () => {
  const day = new Date(2026, 10, 13);
  it('names SVG and LaTeX files like the PNG', () => {
    expect(exportFileName('amp.dat', 'Pane 1', day, 'svg')).toBe('amp_Pane-1_2026-11-13.svg');
    expect(exportFileName('amp.dat', 'Pane 1', day, 'tex')).toBe('amp_Pane-1_2026-11-13.tex');
  });
  it('sizes a paper SVG in millimetres and a pane-size SVG in px', () => {
    expect(exportPhysicalSize(options({ size: 'ieee-1' }), { cssWidth: 336, cssHeight: 168 })).toEqual({ width: '88.9mm', height: '44.45mm' });
    expect(exportPhysicalSize(options({ size: 'ieee-2' }), { cssWidth: 687, cssHeight: 426 })).toEqual({ width: '181.9mm', height: `${Math.round(181.9 * 426 / 687 * 100) / 100}mm` });
    expect(exportPhysicalSize(options({ size: 'pane' }), { cssWidth: 640, cssHeight: 360 })).toEqual({ width: '640px', height: '360px' });
  });
  it('sizes paper marks with the 8 pt text', () => {
    expect(ptToCssPx(PAPER_MARK_RADIUS_PT)).toBeCloseTo(3.333, 3);
    expect(ptToCssPx(PAPER_TAG_PT)).toBe(10);
  });
});
