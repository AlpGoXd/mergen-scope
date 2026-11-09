import { describe, expect, it } from 'vitest';
import { traceXGroup } from '../../src/domain/pane-placement';
import { lineShowInChoices, paneName } from '../../src/domain/line-view';
import { encodeXAxisUnit } from '../../src/types/ref-line';
import { defaultPaneSettings } from '../../src/types/pane';
import type { RefLine } from '../../src/types/ref-line';
import { makeTestTrace } from './helpers';

const pane = (id: string, title = '', renderMode: 'cartesian' | 'smith' | 'table' = 'cartesian') => ({ id, title, renderMode, settings: defaultPaneSettings() });
const panes = [pane('pane-1'), pane('pane-2'), pane('pane-3'), pane('pane-4', '', 'table'), pane('pane-5')];
const hz = makeTestTrace({ name: 'hz', units: { x: 'Hz', y: 'dB' } });
const time = makeTestTrace({ name: 'time', domain: 'time', family: 'waveform', units: { x: 's', y: 'V' } });
// Pane 1 and 2 show Hz data, pane 3 shows time data, pane 4 is a table, pane 5 is empty.
const entries = [{ trace: hz, paneIds: ['pane-1', 'pane-2'] }, { trace: time, paneIds: ['pane-3'] }];
const vLine: RefLine = { id: 1, type: 'v', value: 5, label: 'V1', paneIds: ['pane-1'] };

describe('Show in choices for a line (same checklist as a trace)', () => {
  it('names panes like traces do: title, or "Pane N" by position, then the pane kind', () => {
    const choices = lineShowInChoices(vLine, panes, entries);
    expect(choices.map(choice => choice.label)).toEqual(['Pane 1 · Chart', 'Pane 2 · Chart', 'Pane 3 · Chart', 'Pane 4 · Table', 'Pane 5 · Chart']);
    expect(paneName(panes, 'pane-2')).toBe('Pane 2');
    expect(paneName([pane('pane-1', 'Spectrum')], 'pane-1')).toBe('Spectrum');
  });

  it('ticks the panes the line is in and leaves a compatible pane selectable', () => {
    const [p1, p2] = lineShowInChoices(vLine, panes, entries);
    expect(p1).toMatchObject({ checked: true });
    expect(p1?.disabledReason).toBeUndefined();
    expect(p2).toMatchObject({ checked: false });
    expect(p2?.disabledReason).toBeUndefined();
  });

  it('greys a pane with another X unit, with the reason and "s ≠ Hz"', () => {
    const p3 = lineShowInChoices(vLine, panes, entries)[2];
    expect(p3?.disabledReason).toBeTruthy();
    expect(p3?.aside).toBe('s ≠ Hz');
  });

  it('greys a table pane and an empty pane with "no X axis"', () => {
    const choices = lineShowInChoices(vLine, panes, entries);
    expect(choices[3]?.disabledReason).toBeTruthy();
    expect(choices[3]?.aside).toBe('no X axis');
    expect(choices[4]?.disabledReason).toBeTruthy();
    expect(choices[4]?.aside).toBe('no X axis');
  });

  it('lets an H line stay in its one pane but greys every other pane (H lines belong to one pane)', () => {
    const hLine: RefLine = { id: 2, type: 'h', value: 1, label: 'H1', paneIds: ['pane-1'] };
    const choices = lineShowInChoices(hLine, panes, entries);
    expect(choices[0]?.checked).toBe(true);
    for (const choice of choices.slice(1)) expect(choice.disabledReason).toBeTruthy();
  });

  it('a line in no pane can go to any pane that has a known X axis and unit it remembers', () => {
    const unplaced: RefLine = { ...vLine, paneIds: [], axisUnit: encodeXAxisUnit(traceXGroup(hz) ?? '', 'Hz') };
    const choices = lineShowInChoices(unplaced, panes, entries);
    expect(choices[0]?.disabledReason).toBeUndefined();
    expect(choices[1]?.disabledReason).toBeUndefined();
    expect(choices[2]?.disabledReason).toBeTruthy();
  });
});
