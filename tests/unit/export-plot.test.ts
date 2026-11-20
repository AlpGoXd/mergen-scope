import { describe, expect, it } from 'vitest';
import { autoExportAxes, engineeringExportAxis, exportAxisTitle, exportGroupLayout, exportTick, exportTraceName, groupExportLegends, placeExportLabels } from '../../src/domain/export-plot';
import type { Trace } from '../../src/types/trace';

describe('export axes', () => {
  it('uses units and a shared engineering prefix with plain ticks', () => {
    const trace = { domain: 'frequency', units: { x: 'Hz', y: 'dB' }, kind: 'raw', networkSource: { family: 'S', view: 'dB' } } as Trace;
    const axes = autoExportAxes(trace, [0.5e9, 2e9], [-40, -10], [0.5e9, 1e9, 1.5e9]);
    expect(axes.x.title).toBe('Frequency (GHz)');
    expect(exportTick(axes.x, 0.5e9)).toBe('0.5');
    expect(exportTick(axes.x, 1e9)).toBe('1.0');
    expect(axes.y.title).toBe('Magnitude (dB)');
    const time = autoExportAxes({ ...trace, domain: 'time', units: { x: 's', y: 'V' } }, [0, 0.004], [-2, 2]);
    expect([time.x.title, time.y.title]).toEqual(['Time (ms)', 'Voltage (V)']);
    expect(autoExportAxes({ ...trace, units: { x: 'Hz', y: 'dBm' } }, [0, 1e9], [-60, 20]).y.title).toBe('Power (dBm)');
  });

  it('uses an offset for a narrow span near a large base frequency', () => {
    const axis = engineeringExportAxis('Frequency', 'Hz', [1.4202e9, 1.4208e9], [1.4202e9, 1.4204e9, 1.4206e9]);
    expect(axis.title).toBe('Frequency − 1.42 GHz (kHz)');
    expect(exportTick(axis, 1.4202e9)).toBe('200');
    expect(exportTick(axis, 1.4208e9)).toBe('800');
    expect(exportAxisTitle(axis, 'edit', 'Sweep (MHz)')).toBe('Sweep − 1.42 GHz (kHz)');
    expect(exportAxisTitle(axis, 'off')).toBe('− 1.42 GHz (kHz)');
  });

  it('keeps fractional tick intervals and the full offset needed to reconstruct a value', () => {
    const regular = engineeringExportAxis('Frequency', 'Hz', [0, 10e9], [0, 2.5e9, 5e9, 7.5e9, 10e9]);
    expect(exportTick(regular, 2.5e9)).toBe('2.5');
    const narrow = engineeringExportAxis('Frequency', 'Hz', [1234567890, 1234567891], [1234567890, 1234567891]);
    expect(narrow.title).toContain('1.23456789 GHz');
  });
});

it('groups legends by pane without removing a trace shared between panes', () => {
  const a = { id: 's11' }, b = { id: 's21' };
  const grouped = groupExportLegends([{ id: 'P1', traces: [a, b, a] }, { id: 'P2', traces: [b] }]);
  expect([...grouped]).toEqual([['P1', [a, b]], ['P2', [b]]]);
  const trace = { kind: 'raw', file: 'chain.s2p', dn: 'chain.s2p S21 magnitude-db', networkSource: { family: 'S', row: 1, col: 0, view: 'dB' } } as Trace;
  expect(exportTraceName(trace)).toBe('S21 · dB');
  expect(exportTraceName({ ...trace, dn: 'My measurement' })).toBe('My measurement');
});

it('stacks coincident marker labels and reports ones that cannot fit', () => {
  const anchor = { x: 60, y: 40, width: 70, height: 10 };
  const positions = placeExportLabels([anchor, anchor, anchor, { ...anchor, width: 150 }], 120, 80);
  expect(positions.slice(0, 3).every(Boolean)).toBe(true);
  const first = positions[0]!, second = positions[1]!, third = positions[2]!;
  expect(new Set([first.y, second.y, third.y]).size).toBe(3);
  expect(positions[3]).toBeNull();
});

it('maps each workspace layout to its groupplots arrangement', () => {
  expect(exportGroupLayout('rows', 4)).toEqual({ columns: 1, rows: 4, separateMain: false });
  expect(exportGroupLayout('columns', 3)).toEqual({ columns: 3, rows: 1, separateMain: false });
  expect(exportGroupLayout('grid', 4)).toEqual({ columns: 2, rows: 2, separateMain: false });
  expect(exportGroupLayout('one-side', 4)).toEqual({ columns: 1, rows: 3, separateMain: true });
});
