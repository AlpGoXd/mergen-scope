import { describe, expect, it } from 'vitest';
import { paneTypeCompatibilityNote, summarizePaneTypeChange } from '../../src/domain/pane-type-change-summary';
import type { PaneTypeChangePlan } from '../../src/domain/pane-placement';

const plan = (memberships: PaneTypeChangePlan['memberships']): PaneTypeChangePlan => ({
  paneId: 'pane-1', mode: 'smith', memberships, moved: [], unplaced: [], requiresConfirmation: true,
});

describe('paneTypeCompatibilityNote', () => {
  it('explains the Smith reflection restriction when no traces fit', () => {
    expect(paneTypeCompatibilityNote('Pane 1', 'Smith', 1, []))
      .toBe('Smith shows reflections (S11, S22 …)');
  });
  it('uses the common Smith reason for partially compatible sets', () => {
    expect(paneTypeCompatibilityNote('Pane 1', 'Smith', 3, ['S11']))
      .toBe('Smith shows reflections (S11, S22 …)');
    expect(paneTypeCompatibilityNote('Pane 1', 'Smith', 3, ['S11', 'S22']))
      .toBe('Smith shows reflections (S11, S22 …)');
    expect(paneTypeCompatibilityNote('Pane 1', 'Smith', 4, ['A', 'B', 'C']))
      .toBe('Smith shows reflections (S11, S22 …)');
  });
  it('retains generic summaries for other pane types', () => {
    expect(paneTypeCompatibilityNote('Pane 1', 'Table', 1, [])).toBe('Pane 1 shows 1 trace. Table cannot show any of them.');
    expect(paneTypeCompatibilityNote('Pane 1', 'Table', 3, ['A', 'B'])).toBe('Pane 1 shows 3 traces. Table can only show A and B of them.');
  });
  it('omits the note when all traces fit', () => {
    expect(paneTypeCompatibilityNote('Pane 1', 'Chart', 1, ['A'])).toBeUndefined();
  });
});
const name = (id: string) => id === 'pane-2' ? 'Pane 2' : 'Pane 3';

describe('summarizePaneTypeChange', () => {
  it('describes one leaving trace and its destination', () => {
    expect(summarizePaneTypeChange(plan({ a: ['pane-2'] }), [{ name: 'a', displayName: 'S21 · dB' }], name))
      .toEqual({ leaving: ['S21 · dB'], destination: 'Pane 2, which has the same X unit' });
  });

  it('preserves several display names', () => {
    expect(summarizePaneTypeChange(plan({ a: ['pane-2'], b: ['pane-2'] }), [{ name: 'a', displayName: 'S21 · dB' }, { name: 'b', displayName: 'ƒ smoothed' }], name))
      .toEqual({ leaving: ['S21 · dB', 'ƒ smoothed'], destination: 'Pane 2, which has the same X unit' });
  });

  it('uses a null destination for unplaced traces', () => {
    expect(summarizePaneTypeChange(plan({ a: [] }), [{ name: 'a', displayName: 'S21' }], name))
      .toEqual({ leaving: ['S21'], destination: null });
  });
});
