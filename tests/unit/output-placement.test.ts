import { describe, expect, it } from 'vitest';
import { chooseOutputPane, extentOf, rangeGap, rangesOverlap } from '../../src/domain/output-placement';
import type { OutputPaneCandidate } from '../../src/domain/output-placement';

const fft = { min: 0, max: 50e3 };
const pane = (id: string, visible: { min: number; max: number } | null, extra: Partial<OutputPaneCandidate> = {}): OutputPaneCandidate =>
  ({ id, chart: true, empty: false, sameAxis: true, visible, ...extra });

describe('placing a created trace on its own X axis', () => {
  it('joins a frequency pane whose visible range overlaps the spectrum', () => {
    const panes = [pane('ghz', { min: 0.4e9, max: 3e9 }), pane('khz', { min: 0, max: 20e3 })];
    expect(chooseOutputPane(panes, fft, false)).toEqual({ kind: 'join', paneId: 'khz' });
  });
  it('ignores panes on another axis, Smith or Table panes', () => {
    const panes = [pane('time', { min: 0, max: 1 }, { sameAxis: false }), pane('smith', { min: 0, max: 1e6 }, { chart: false })];
    expect(chooseOutputPane(panes, fft, true)).toEqual({ kind: 'new' });
  });
  it('uses an empty chart pane before creating one', () => {
    const panes = [pane('ghz', { min: 1e9, max: 2e9 }), pane('blank', null, { empty: true, sameAxis: false })];
    expect(chooseOutputPane(panes, fft, true)).toEqual({ kind: 'empty', paneId: 'blank' });
  });
  it('creates a new pane when nothing overlaps and there is room', () => {
    expect(chooseOutputPane([pane('ghz', { min: 0.4e9, max: 3e9 })], fft, true)).toEqual({ kind: 'new' });
  });
  it('at the pane limit joins the nearest frequency pane and fits its X to the trace', () => {
    const panes = [pane('ip3', { min: 1.42e9, max: 1.421e9 }), pane('s21', { min: 0.4e9, max: 3e9 }), pane('time', { min: 0, max: 0.01 }, { sameAxis: false })];
    expect(chooseOutputPane(panes, fft, false)).toEqual({ kind: 'nearest', paneId: 's21', fitX: fft });
  });
  it('reports none when no pane can take it', () => {
    expect(chooseOutputPane([pane('time', { min: 0, max: 1 }, { sameAxis: false })], fft, false)).toEqual({ kind: 'none' });
  });
  it('range helpers', () => {
    expect(rangeGap({ min: 0, max: 1 }, { min: 3, max: 4 })).toBe(2);
    expect(rangeGap({ min: 0, max: 5 }, { min: 3, max: 4 })).toBe(0);
    expect(rangesOverlap({ min: 0, max: 1 }, { min: 1, max: 2 })).toBe(false);
    expect(rangesOverlap({ min: 0, max: 2 }, { min: 1, max: 3 })).toBe(true);
    expect(extentOf([{ freq: 3 }, { freq: -1 }, { freq: NaN }])).toEqual({ min: -1, max: 3 });
    expect(extentOf([])).toBeNull();
  });
});
