import { describe, expect, it } from 'vitest';
import { createPaneTypeRegistry } from '../../src/domain/pane-type-registry';
import { planEmptyPaneType } from '../../src/domain/pane-placement';
import { defaultPaneSettings } from '../../src/types/pane';
import { makeTestTrace } from './helpers';
import type { PlacementPane } from '../../src/domain/pane-placement';

describe('empty pane type planning', () => {
  it('keeps chart or selects the first compatible available type', () => {
    const registry = createPaneTypeRegistry({ smithCapability: () => ({ allowed: false, reason: 'later' }) });
    const pane = { id: 'pane-1', renderMode: 'cartesian', settings: defaultPaneSettings() } as PlacementPane;
    expect(planEmptyPaneType(registry, pane, makeTestTrace(), true).mode).toBe('cartesian');
    const fake = { ...registry, chart: { ...registry.chart, appliesTo: () => ({ allowed: false as const, reason: 'no' }) }, table: { ...registry.table, status: 'available' as const } };
    expect(planEmptyPaneType(fake, pane, makeTestTrace(), true).mode).toBe('table');
    expect(planEmptyPaneType(fake, pane, makeTestTrace(), false).mode).toBe('cartesian');
  });
});
