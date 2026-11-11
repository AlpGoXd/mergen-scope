import { describe, expect, it } from 'vitest';
import { paneTypeCompatibilityNote, summarizePaneTypeChange } from '../../src/domain/pane-type-change-summary';
import type { PaneTypeChangePlan } from '../../src/domain/pane-placement';

const plan = (memberships: PaneTypeChangePlan['memberships']): PaneTypeChangePlan => ({
  paneId: 'pane-1', mode: 'smith', memberships, moved: [], unplaced: [], requiresConfirmation: true,
});

describe('paneTypeCompatibilityNote', () => {
  it('describes no compatible traces and uses the singular trace label', () => {
    expect(paneTypeCompatibilityNote('Pane 1', 'Smith', 1, []))
      .toBe('Pane 1 shows 1 trace. Smith cannot show any of them.');
  });
  it('uses names for one or two compatible traces and a count for more', () => {
    expect(paneTypeCompatibilityNote('Pane 1', 'Smith', 3, ['S11']))
      .toBe('Pane 1 shows 3 traces. Smith can only show S11 of them.');
    expect(paneTypeCompatibilityNote('Pane 1', 'Smith', 3, ['S11', 'S22']))
      .toBe('Pane 1 shows 3 traces. Smith can only show S11 and S22 of them.');
    expect(paneTypeCompatibilityNote('Pane 1', 'Smith', 4, ['A', 'B', 'C']))
      .toBe('Pane 1 shows 4 traces. Smith can only show 3 of them.');
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
