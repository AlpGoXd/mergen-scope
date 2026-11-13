import { describe, expect, it } from 'vitest';
import { decimalsForRows, tableXFormat, tableYFormat } from '../../src/domain/table-format';
import { tableFollowChoices, tableFollowedPane, tableLinkedToChart, tableSettingsOf, tableVisibleRange, tableXLabel, VISIBLE_RANGE_REASON } from '../../src/domain/table-view';
import { defaultPaneSettings } from '../../src/types/pane';

describe('table number formats', () => {
  it('shows X in one prefix with the decimals the row step needs', () => {
    const xs = [2.43e9, 2.4325e9, 2.435e9];
    const f = tableXFormat(xs, 'Hz');
    expect(f.unit).toBe('GHz');
    expect(xs.map(f.format)).toEqual(['2.4300', '2.4325', '2.4350']);
    expect(decimalsForRows([1, 2, 3], 1)).toBe(0);
    expect(decimalsForRows([0, 0.1, 0.2], 1)).toBe(1);
    expect(decimalsForRows([1419905499.5004995, 1419906498.5014985], 1e9)).toBe(8);
    expect(decimalsForRows([5], 1)).toBe(3);
  });
  it('formats dB columns with two decimals and a real minus', () => {
    const f = tableYFormat([-2.034, -16.49], 'dB');
    expect(f.unit).toBe('dB');
    expect(f.format(-2.034)).toBe('−2.03');
    expect(f.format(-0.001)).toBe('0.00');
  });
  it('gives linear columns one prefix and four significant digits', () => {
    const f = tableYFormat([0.0012, -0.0034], 'V');
    expect(f.unit).toBe('mV');
    expect(f.format(0.0012)).toBe('1.200');
    expect(f.format(-0.0034)).toBe('−3.400');
    expect(tableYFormat([123.4], 'deg').format(123.4)).toBe('123.4');
    expect(tableYFormat([], '').unit).toBe('');
  });
});

describe('table view', () => {
  it('fills missing table settings with the defaults', () => {
    expect(tableSettingsOf({ settings: defaultPaneSettings() })).toEqual({ rows: 'near', range: 'all', follow: null });
    expect(tableSettingsOf({ settings: { ...defaultPaneSettings(), table: { rows: 'all', range: 'visible', follow: 'pane-1' } } })).toEqual({ rows: 'all', range: 'visible', follow: 'pane-1' });
  });
  it('names the X column', () => {
    expect(tableXLabel('frequency', 'Hz')).toBe('Frequency');
    expect(tableXLabel('time', 's')).toBe('Time');
    expect(tableXLabel(null, 'V')).toBe('X');
  });
  it('offers Visible only when following or linked', () => {
    const paneXZooms = { 'pane-1': { left: 5, right: 6 }, 'pane-3': { left: 1, right: 2 } };
    expect(tableVisibleRange({ paneXZooms, followedPaneId: null, linkedPaneId: null })).toEqual({ available: false, reason: VISIBLE_RANGE_REASON });
    expect(tableVisibleRange({ paneXZooms, followedPaneId: null, linkedPaneId: 'pane-3' })).toEqual({ available: true, window: { min: 1, max: 2 } });
    expect(tableVisibleRange({ paneXZooms, followedPaneId: 'pane-1', linkedPaneId: null })).toEqual({ available: true, window: { min: 5, max: 6 } });
    expect(tableVisibleRange({ paneXZooms: {}, followedPaneId: null, linkedPaneId: 'pane-3' })).toEqual({ available: true, window: null });
  });
  it('is linked only to a chart of the same X unit in its own X link group', () => {
    const panes = [{ id: 'pane-1', renderMode: 'cartesian' as const, xLinkGroup: 'x1' }, { id: 'pane-2', renderMode: 'table' as const, xLinkGroup: 'x1' }, { id: 'pane-3', renderMode: 'cartesian' as const, xLinkGroup: 'x1' }];
    const paneXGroups = { 'pane-1': 's', 'pane-2': 'Hz', 'pane-3': 'Hz' };
    expect(tableLinkedToChart({ paneId: 'pane-2', xGroup: 'Hz', panes, paneXGroups })).toBe('pane-3');
    expect(tableLinkedToChart({ paneId: 'pane-2', xGroup: 'Hz', panes: panes.map(pane => ({ ...pane, xLinkGroup: pane.id === 'pane-3' ? 'x2' : pane.xLinkGroup })), paneXGroups })).toBeNull();
    expect(tableLinkedToChart({ paneId: 'pane-2', xGroup: 'Hz', panes: panes.map(pane => ({ ...pane, xLinkGroup: null })), paneXGroups })).toBeNull();
    expect(tableLinkedToChart({ paneId: 'pane-2', xGroup: 'V', panes, paneXGroups })).toBeNull();
  });
  it('follows only another non-table pane', () => {
    const panes = [{ id: 'pane-1', renderMode: 'cartesian' as const }, { id: 'pane-2', renderMode: 'table' as const }, { id: 'pane-3', renderMode: 'smith' as const }, { id: 'pane-4', renderMode: 'table' as const }];
    expect(tableFollowChoices(panes, 'pane-2')).toEqual(['pane-1', 'pane-3']);
    expect(tableFollowedPane(panes, 'pane-2', 'pane-1')).toBe('pane-1');
    expect(tableFollowedPane(panes, 'pane-2', 'pane-4')).toBeNull();
    expect(tableFollowedPane(panes, 'pane-2', 'pane-2')).toBeNull();
    expect(tableFollowedPane(panes, 'pane-2', 'pane-9')).toBeNull();
    expect(tableFollowedPane(panes, 'pane-2', null)).toBeNull();
  });
});
