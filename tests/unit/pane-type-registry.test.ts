import { describe, expect, it } from 'vitest';
import { createPaneTypeRegistry, paneTypeOfMode, selectableTypes, typeForTrace } from '../../src/domain/pane-type-registry';
import { makeTestTrace } from './helpers';

const registry = createPaneTypeRegistry({ smithCapability: () => ({ allowed: false, reason: 'Smith only' }) });

describe('pane type registry', () => {
  it('lists available and planned types in order', () => {
    expect(Object.keys(registry)).toEqual(['chart', 'table', 'smith', 'polar', 'eye', 'spectrogram']);
    expect(selectableTypes(registry).map(type => type.id)).toEqual(['chart']);
    expect(Object.values(registry).filter(type => type.status === 'later').every(type => type.laterReason)).toBe(true);
  });
  it('maps legacy modes and checks capabilities', () => {
    expect(['cartesian', 'table', 'smith', 'smith-inverted'].map(mode => paneTypeOfMode(mode as 'cartesian' | 'table' | 'smith' | 'smith-inverted'))).toEqual(['chart', 'table', 'smith', 'smith']);
    expect(typeForTrace(registry, makeTestTrace()).type?.id).toBe('chart');
    expect(typeForTrace(registry, makeTestTrace({ family: 'iq' }))).toEqual({ type: null, reason: 'The IQ data kind is not supported.' });
    const both = { ...registry, table: { ...registry.table, status: 'available' as const } };
    expect(typeForTrace(both, makeTestTrace(), 'table').type?.id).toBe('table');
  });
});
