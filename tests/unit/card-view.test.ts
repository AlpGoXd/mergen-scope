import { describe, expect, it } from 'vitest';
import { crossingsCsv, describeCrossings, describeNumbers, resultsText, splitUnit } from '../../src/domain/analysis/card-view';
import { formatEng } from '../../src/domain/units';

const units = { x: 'Hz', y: 'dBm' };

describe('card view strings', () => {
  it('splits a formatted value into number and muted unit', () => {
    expect(splitUnit('86.2 MHz')).toEqual({ value: '86.2', unit: 'MHz' });
    expect(splitUnit('42')).toEqual({ value: '42' });
    expect(splitUnit('1 2')).toEqual({ value: '1 2' });
  });

  it('bandwidth: headline in the X unit through formatEng, centre and edges in the note', () => {
    const view = describeNumbers('bandwidth', [{ type: 'numbers', values: { bandwidth: 86.2e6, centre: 2.441e9, left: 2.398e9, right: 2.484e9, refAmp: -3, refX: 2.441e9 } }], units);
    expect(view?.result?.unit).toBe('MHz');
    expect(view?.result?.value).toBe(splitUnit(formatEng(86.2e6, 'Hz', 10 ** (Math.floor(Math.log10(86.2e6)) - 5))).value);
    expect(view?.result?.note).toContain('centre');
    expect(view?.result?.note).toContain('→');
    expect(view?.rows).toHaveLength(1);
  });

  it('range statistics: five labelled rows and a collapsed summary', () => {
    const view = describeNumbers('range-stats', [{ type: 'numbers', values: { max: -10, maxX: 2e9, min: -80, minX: 1e9, average: -50, span: 1e9, count: 201 } }], units);
    expect(view?.rows.map(row => row.label)).toEqual(['Maximum', 'Minimum', 'Average', 'Span', 'Samples']);
    expect(view?.rows[4]?.value).toBe('201');
    expect(view?.summary).toContain('max');
  });

  it('stability: unstable count and |delta| row', () => {
    const view = describeNumbers('stability', [{ type: 'numbers', values: { minK: 1.2, minMu1: 1.1, minMu2: 1.3, minDelta: 0.2, maxDelta: 0.6, unstableCount: 0, count: 401 } }], units);
    expect(view?.rows.find(row => row.label.startsWith('|'))).toBeTruthy();
    expect(view?.summary).toBe('unconditionally stable');
  });

  it('peak table rows read "#rank · x" with the y value', () => {
    const view = describeNumbers('peak-table', [{ type: 'table', columns: [], rows: [[1, 2.4e9, -10], [2, 2.5e9, -12]] }], units);
    expect(view?.rows).toHaveLength(2);
    expect(view?.rows[0]?.label.startsWith('#1 · ')).toBe(true);
    expect(view?.summary).toBe('2 peaks');
  });
});

describe('crossings view', () => {
  const rows = [
    { paneId: 'pane-2', traceName: 'b', value: -9.2 }, { paneId: 'pane-1', traceName: 'a', value: -3.1 }, { paneId: 'pane-1', traceName: 'a', value: -3.4 },
  ];

  it('groups by pane in pane order and formats only the changing value', () => {
    const view = describeCrossings(rows, ['pane-1', 'pane-2'], units, 'y');
    expect(view.groups.map(group => group.paneId)).toEqual(['pane-1', 'pane-2']);
    expect(view.groups[0]?.rows).toHaveLength(2);
    expect(view.groups[0]?.rows[0]?.value).toContain('dBm');
    expect(view.total).toBe(3);
    expect(view.capNote).toBeUndefined();
  });

  it('caps long lists with a "Showing n of m" note and keeps the true total', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ paneId: 'pane-1', traceName: 'a', value: i }));
    const view = describeCrossings(many, ['pane-1'], units, 'x');
    expect(view.groups[0]?.rows).toHaveLength(200);
    expect(view.total).toBe(250);
    expect(view.capNote).toBe('Showing 200 of 250');
  });

  it('copies a list as CSV with a header and quoted cells', () => {
    const view = describeCrossings([{ paneId: 'pane-1', traceName: 'S11, dB', value: 1 }], ['pane-1'], units, 'y');
    const csv = crossingsCsv(view.groups, () => 'P1', 'Y');
    expect(csv.split('\n')[0]).toBe('Pane,Trace,Y');
    expect(csv.split('\n')[1]).toContain('"S11, dB"');
  });

  it('plain-text results for Copy results', () => {
    const text = resultsText('Bandwidth', { result: { value: '86.2', unit: 'MHz' }, rows: [{ label: 'Reference', value: '-3 dBm' }], summary: '' });
    expect(text).toBe('Bandwidth\n86.2 MHz\nReference: -3 dBm');
  });
});
