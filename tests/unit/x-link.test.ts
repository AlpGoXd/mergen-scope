import { describe, expect, it } from 'vitest';
import { autoLinkByUnit, canLinkX, fittedXBounds, linkMenuRows, linkXPanes, linkedPeers, normalizeXLinks, paneXUnits, unlinkXPane } from '../../src/domain/x-link';
import type { LinkPane } from '../../src/domain/x-link';
import { defaultPaneState, paneReducer } from '../../src/stores/pane-store';
import type { PaneState } from '../../src/stores/pane-store';
import { makeTestTrace } from './helpers';

const pane = (id: string, xLinkGroup: string | null = null, renderMode = 'cartesian'): LinkPane => ({ id, title: '', renderMode, xLinkGroup });
const groupsOf = (panes: readonly LinkPane[]) => panes.map(item => item.xLinkGroup ?? null);
// Panes 1, 2 and 4 show Hz; pane 3 shows time; pane 5 is empty.
const units = { p1: 'Hz', p2: 'Hz', p3: 's', p4: 'Hz', p5: null };
const five = [pane('p1'), pane('p2'), pane('p3'), pane('p4'), pane('p5')];

describe('X link groups', () => {
  it('panes start unlinked', () => {
    expect(defaultPaneState.panes.every(item => !item.xLinkGroup)).toBe(true);
    const two = paneReducer(defaultPaneState, { type: 'SET_PANE_COUNT', payload: 2 });
    expect(two.panes.map(item => item.xLinkGroup ?? null)).toEqual([null, null]);
  });

  it('joins two panes into a new group, and a third into the same group', () => {
    const first = linkXPanes(five, units, 'p1', 'p2');
    if (!first.ok) throw new Error(first.reason);
    expect(groupsOf(first.panes)).toEqual(['x1', 'x1', null, null, null]);
    const second = linkXPanes(first.panes, units, 'p2', 'p4');
    if (!second.ok) throw new Error(second.reason);
    expect(groupsOf(second.panes)).toEqual(['x1', 'x1', null, 'x1', null]);
    expect(linkedPeers(second.panes, 'p4')).toEqual(['p1', 'p2']);
    expect(linkedPeers(second.panes, 'p3')).toEqual([]);
  });

  it('keeps a pane in at most one group: joining another group leaves the old one', () => {
    const start = [pane('p1', 'x1'), pane('p2', 'x1'), pane('p3'), pane('p4', 'x2'), pane('p5', 'x2'), pane('p6', 'x2')];
    const hz = { p1: 'Hz', p2: 'Hz', p3: 'Hz', p4: 'Hz', p5: 'Hz', p6: 'Hz' };
    const moved = linkXPanes(start, hz, 'p1', 'p4');
    if (!moved.ok) throw new Error(moved.reason);
    expect(groupsOf(moved.panes)).toEqual(['x1', 'x1', null, 'x1', 'x2', 'x2']);
    // The last but one member leaving dissolves a group.
    const left = linkXPanes(moved.panes, hz, 'p3', 'p5');
    if (!left.ok) throw new Error(left.reason);
    expect(groupsOf(left.panes)).toEqual(['x1', 'x1', 'x3', 'x1', 'x3', null]);
  });

  it('leaves a group with Unlink; a group of one dissolves', () => {
    const three = [pane('p1', 'x1'), pane('p2', 'x1'), pane('p4', 'x1')];
    expect(groupsOf(unlinkXPane(three, 'p2'))).toEqual(['x1', null, 'x1']);
    expect(groupsOf(unlinkXPane(unlinkXPane(three, 'p2'), 'p1'))).toEqual([null, null, null]);
    const alone = [pane('p1')];
    expect(unlinkXPane(alone, 'p1')).toBe(alone);
  });

  it('refuses panes with another X unit, with the reason', () => {
    expect(canLinkX(five, units, 'p1', 'p3')).toEqual({ ok: false, reason: 'Pane 3 shows time (s)' });
    expect(linkXPanes(five, units, 'p1', 'p3')).toEqual({ ok: false, reason: 'Pane 3 shows time (s)' });
    expect(canLinkX(five, units, 'p1', 'p5')).toEqual({ ok: false, reason: 'Pane 5 has no data yet' });
    expect(canLinkX([...five, pane('p6', null, 'table')], { ...units, p6: null }, 'p1', 'p6')).toEqual({ ok: false, reason: 'Pane 6 is a table' });
    expect(canLinkX(five, { ...units, p1: 'V' }, 'p1', 'p2')).toEqual({ ok: false, reason: 'Pane 2 shows frequency (Hz)' });
  });

  it('lists the other panes for the "Link X with" menu, greyed with the reason', () => {
    const linked = [pane('p1', 'x1'), pane('p2', 'x1'), pane('p3'), pane('p4'), pane('p5')];
    expect(linkMenuRows(linked, units, 'p1')).toEqual([
      { paneId: 'p2', label: 'Pane 2', checked: true },
      { paneId: 'p3', label: 'Pane 3', checked: false, reason: 'Pane 3 shows time (s)' },
      { paneId: 'p4', label: 'Pane 4', checked: false },
      { paneId: 'p5', label: 'Pane 5', checked: false, reason: 'Pane 5 has no data yet' },
    ]);
  });

  it('drops a member whose X unit changed and dissolves groups of one', () => {
    const linked = [pane('p1', 'x1'), pane('p2', 'x1'), pane('p3', 'x1')];
    expect(normalizeXLinks(linked, { p1: 'Hz', p2: 'Hz', p3: 'Hz' })).toBe(linked);
    expect(groupsOf(normalizeXLinks(linked, { p1: 'Hz', p2: 'Hz', p3: 's' }))).toEqual(['x1', 'x1', null]);
    expect(groupsOf(normalizeXLinks(linked, { p1: 'Hz', p2: 's', p3: 's' }))).toEqual([null, 'x1', 'x1']);
    expect(groupsOf(normalizeXLinks([pane('p1', 'x1'), pane('p2', 'x1')], { p1: 'Hz', p2: 's' }))).toEqual([null, null]);
    // An empty pane keeps its place until it shows another unit.
    expect(groupsOf(normalizeXLinks(linked, { p1: 'Hz', p2: null, p3: 'Hz' }))).toEqual(['x1', 'x1', 'x1']);
    expect(groupsOf(normalizeXLinks([pane('p1', 'x1'), pane('p2')]))).toEqual([null, null]);
  });

  it('when the first pane of a group changes unit, that pane leaves, not the others', () => {
    const linked = [pane('p1', 'x1'), pane('p2', 'x1'), pane('p3', 'x1')];
    // Through an empty state: the emptied pane stays linked, then shows time.
    const emptied = normalizeXLinks(linked, { p1: null, p2: 'Hz', p3: 'Hz' });
    expect(groupsOf(emptied)).toEqual(['x1', 'x1', 'x1']);
    expect(groupsOf(normalizeXLinks(emptied, { p1: 's', p2: 'Hz', p3: 'Hz' }))).toEqual([null, 'x1', 'x1']);
  });

  it('reads each pane X unit from its traces', () => {
    const hz = makeTestTrace({ name: 'a', units: { x: 'hz', y: 'dBm' } });
    const time = makeTestTrace({ name: 'b', units: { x: 'sec', y: 'V' } });
    const panes = [pane('p1'), pane('p2'), pane('p3'), pane('p4'), pane('p5', null, 'table')];
    expect(paneXUnits(panes, [hz, time], { a: ['p1', 'p3', 'p5'], b: ['p2', 'p3'] })).toEqual({ p1: 'Hz', p2: 's', p3: null, p4: null, p5: null });
  });

  it('fits a linked pane to the data of its whole group', () => {
    const a = makeTestTrace({ name: 'a', data: [{ freq: 10, amp: 0 }, { freq: 20, amp: 0 }] });
    const b = makeTestTrace({ name: 'b', data: [{ freq: 5, amp: 0 }, { freq: 15, amp: 0 }] });
    const hidden = makeTestTrace({ name: 'c', data: [{ freq: 0, amp: 0 }, { freq: 99, amp: 0 }] });
    const memberships = { a: ['p1'], b: ['p2'], c: ['p1'] };
    const vis = { a: true, b: true, c: false };
    expect(fittedXBounds(['p1'], [a, b, hidden], memberships, vis)).toEqual({ min: 10, max: 20 });
    expect(fittedXBounds(['p1', 'p2'], [a, b, hidden], memberships, vis)).toEqual({ min: 5, max: 20 });
    expect(fittedXBounds(['p3'], [a, b], memberships, vis)).toBeNull();
  });

  it('migrates automatic linking: one group per unit with two or more panes', () => {
    const migrated = autoLinkByUnit(five, units, { left: 1, right: 2 });
    expect(groupsOf(migrated.panes)).toEqual(['x1', 'x1', null, 'x1', null]);
    expect(Object.keys(migrated.paneXZooms)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(autoLinkByUnit(five, units, null).paneXZooms).toEqual({});
  });
});

describe('linked zoom in the pane store', () => {
  const state = (): PaneState => {
    const base = paneReducer(defaultPaneState, { type: 'SET_PANE_COUNT', payload: 3 });
    return { ...base, paneXZooms: { 'pane-1': { left: 10, right: 20 } } };
  };
  const hz = { 'pane-1': 'Hz', 'pane-2': 'Hz', 'pane-3': 's' };

  it('zoom, pan and fit apply to the whole group; unlinked panes keep their own', () => {
    let next = paneReducer(state(), { type: 'LINK_X_PANES', payload: { paneId: 'pane-1', otherId: 'pane-2', units: hz } });
    // The joining pane takes the group's range.
    expect(next.paneXZooms['pane-2']).toEqual({ left: 10, right: 20 });
    next = paneReducer(next, { type: 'SET_PANE_ZOOM', payload: { paneId: 'pane-2', zoom: { left: 12, right: 14 } } });
    expect(next.paneXZooms).toEqual({ 'pane-1': { left: 12, right: 14 }, 'pane-2': { left: 12, right: 14 } });
    next = paneReducer(next, { type: 'SET_PANE_ZOOM', payload: { paneId: 'pane-3', zoom: { left: 0, right: 1 } } });
    expect(next.paneXZooms['pane-1']).toEqual({ left: 12, right: 14 });
    next = paneReducer(next, { type: 'SET_PANE_ZOOM', payload: { paneId: 'pane-1', zoom: null } });
    expect(next.paneXZooms).toEqual({ 'pane-3': { left: 0, right: 1 } });
  });

  it('refuses a unit mismatch and unlinks on request', () => {
    const refused = paneReducer(state(), { type: 'LINK_X_PANES', payload: { paneId: 'pane-1', otherId: 'pane-3', units: hz } });
    expect(refused.panes.every(item => !item.xLinkGroup)).toBe(true);
    let next = paneReducer(state(), { type: 'LINK_X_PANES', payload: { paneId: 'pane-1', otherId: 'pane-2', units: hz } });
    next = paneReducer(next, { type: 'UNLINK_X_PANE', payload: { paneId: 'pane-2' } });
    expect(next.panes.every(item => !item.xLinkGroup)).toBe(true);
    next = paneReducer(next, { type: 'SET_PANE_ZOOM', payload: { paneId: 'pane-2', zoom: { left: 1, right: 2 } } });
    expect(next.paneXZooms['pane-1']).toEqual({ left: 10, right: 20 });
  });

  it('closing a pane dissolves a group left with one pane', () => {
    const linked = paneReducer(state(), { type: 'LINK_X_PANES', payload: { paneId: 'pane-1', otherId: 'pane-2', units: hz } });
    const closed = paneReducer(linked, { type: 'SET_PANE_COUNT', payload: 2, targetPaneId: 'pane-2', traces: [] });
    expect(closed.panes.map(item => item.xLinkGroup ?? null)).toEqual([null, null]);
  });
});
