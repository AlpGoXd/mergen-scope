import { describe, expect, it } from 'vitest';
import { createPaneTypeRegistry, paneTypeOfMode, selectableTypes, typeForTrace } from '../../src/domain/pane-type-registry';
import { makeTestTrace } from './helpers';
import { smithParameterCapability } from '../../src/domain/pane-placement';

const registry = createPaneTypeRegistry({ smithCapability: () => ({ allowed: false, reason: 'Smith only' }) });

describe('pane type registry', () => {
  it('lists available and planned types in order', () => {
    expect(Object.keys(registry)).toEqual(['chart', 'table', 'smith', 'polar', 'eye', 'spectrogram']);
    expect(registry.eye.source).toBe('analysis');
    expect(Object.values(registry).filter(type => type.source !== 'analysis').map(type => type.id)).toEqual(['chart', 'table', 'smith', 'polar', 'spectrogram']);
    expect(registry.table.status).toBe('available');
    expect(registry.smith.status).toBe('available');
    expect(registry.smith.appliesTo(makeTestTrace())).toEqual({ allowed: false, reason: 'Smith shows reflections (S11, S22 …)' });
    expect(selectableTypes(registry).map(type => type.id)).toEqual(['chart', 'table', 'smith']);
    expect(Object.values(registry).filter(type => type.status === 'later').every(type => type.laterReason)).toBe(true);
  });
  it('maps legacy modes and checks capabilities', () => {
    expect(['cartesian', 'table', 'smith', 'smith-inverted'].map(mode => paneTypeOfMode(mode as 'cartesian' | 'table' | 'smith' | 'smith-inverted'))).toEqual(['chart', 'table', 'smith', 'smith']);
    expect(typeForTrace(registry, makeTestTrace()).type?.id).toBe('chart');
    expect(typeForTrace(registry, makeTestTrace({ family: 'iq' }))).toEqual({ type: null, reason: 'The IQ data kind is not supported.' });
    expect(typeForTrace(registry, makeTestTrace(), 'table').type?.id).toBe('table');
  });
});

it('accepts only diagonal S parameters for Smith', () => {
  expect(smithParameterCapability('S', 0, 0)).toEqual({ allowed: true });
  expect(smithParameterCapability('S', 1, 1)).toEqual({ allowed: true });
  for (const [family, row, col] of [['S', 1, 0], ['S', 0, 1], ['Z', 0, 0], ['Y', 0, 0], ['ABCD', 0, 0]] as const) {
    expect(smithParameterCapability(family, row, col)).toEqual({ allowed: false, reason: 'Smith shows reflections (S11, S22 …)' });
  }
});
