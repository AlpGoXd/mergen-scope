import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';
import { initialWorkspaceState, snapshotFromWorkspace, traceView, workspaceFromSnapshot, workspaceReducer } from '../../src/stores/aggregate-workspace-store';
import type { WorkspaceSnapshotV5 } from '../../src/types/workspace-v5';
import { makeTestTrace } from './helpers';

function snapshotWithTrace(): WorkspaceSnapshotV5 {
  const trace = makeTestTrace({ id: 'source', name: 'source' });
  const state = workspaceReducer(initialWorkspaceState(), { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'source.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [trace] } } } });
  const snapshot = snapshotFromWorkspace(state);
  if (!snapshot) throw new Error('Expected workspace snapshot');
  return snapshot;
}

describe('analysis workspace migration', () => {
  it('converts legacy open cards in registry order and saved rows in ID order', () => {
    const snapshot = snapshotWithTrace();
    const { analyses: _analyses, droppedViews: _note, ...legacy } = snapshot;
    const selected = snapshot.selectedTraceName;
    const expectedSource = snapshot.files.flatMap(file => file.displayTraces ?? []).find(display => (display.compat?.legacyTraceName ?? display.id) === selected)?.id
      ?? snapshot.files.flatMap(file => file.traces).find(trace => trace.name === selected)?.id ?? null;
    const raw = { ...legacy,
      analysisOpenState: { 'noise-psd': true, ip3: true, 'peak-spur-table': true, 'range-stats': true, 'bandwidth-helper': true, 'threshold-crossings': true, 'ripple-flatness': true, 'occupied-bandwidth': true, 'channel-power': true, 'reciprocity-isolation': true, 'touchstone-stability': true, vswr: true, 'return-loss': true, 'group-delay': true },
      savedNoise: [{ id: 20, functionType: 'noise-psd', traceLabel: 'n', sourceTraceId: 'noise-source', sourceTraceName: null, parameters: { filter: 'flattop', rbw: 1 }, values: {} }],
      savedIP3: [{ id: 10, functionType: 'ip3', traceLabel: 'i', sourceTraceId: 'ip-source', sourceTraceName: null, parameters: { gain: 7, roles: {} }, values: {} }],
    };
    const result = migrateWorkspaceV5(raw);
    if (!result?.analyses) throw new Error('Expected analyses');
    expect(result.droppedViews).toBe(3);
    expect(result.analyses.map(item => item.toolId)).toEqual(['noise-psd', 'ip3', 'peak-table', 'range-stats', 'bandwidth', 'crossings', 'ripple', 'occupied-bandwidth', 'channel-power', 'reciprocity-isolation', 'stability', 'ip3', 'noise-psd']);
    expect(result.analyses.map(item => item.id)).toEqual(Array.from({ length: 13 }, (_, i) => `analysis-${i + 1}`));
    expect(result.analyses.slice(0, 11).every(item => item.source.traceId === expectedSource && !item.collapsed)).toBe(true);
    expect(result.analyses[11]).toMatchObject({ collapsed: true, source: { traceId: 'ip-source' }, params: { gain: 7 } });
    expect(result.analyses[12]).toMatchObject({ collapsed: true, source: { traceId: 'noise-source' }, params: { filter: 'flattop' } });
    expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it('round trips instances and derived outputs through aggregate snapshots and preserves the allocator', () => {
    const trace = makeTestTrace({ id: 'source', name: 'source' });
    let state = workspaceReducer(initialWorkspaceState(), { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'source.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [trace] } } } });
    const selected = traceView(state.files, state.traces).allKnownTraces[0];
    if (!selected) throw new Error('Expected source');
    state = workspaceReducer(state, { slice: 'analysis', action: { type: 'ADD_ANALYSIS', payload: { toolId: 'offset-scale', source: { traceId: selected.id }, params: { offset: 4 } } } });
    const snapshot = snapshotFromWorkspace(state); if (!snapshot) throw new Error('Expected snapshot');
    const reread = migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot))); if (!reread) throw new Error('Expected round trip');
    expect(reread.analyses).toEqual(state.analysis.analyses);
    expect(reread.analysisOpenState).toEqual(state.analysis.analysisOpenState);
    const restored = workspaceFromSnapshot(initialWorkspaceState(), reread); if (!restored) throw new Error('Expected restore');
    expect(restored.analysis.analyses).toEqual(state.analysis.analyses);
    expect(restored.traces.derivedTraces).toEqual(state.traces.derivedTraces);
    const added = workspaceReducer(restored, { slice: 'analysis', action: { type: 'ADD_ANALYSIS', payload: { toolId: 'ripple', source: { traceId: selected.id } } } });
    expect(added.analysis.analyses.map(item => item.id)).toEqual(['analysis-1', 'analysis-2']);
    const frozen = workspaceReducer(restored, { slice: 'files', action: { type: 'REMOVE_FILE', payload: { fileId: 'f' } } });
    expect(frozen.analysis.analyses[0]?.live).toBe(false);
    const frozenSnapshot = snapshotFromWorkspace(frozen); if (!frozenSnapshot) throw new Error('Expected frozen snapshot');
    expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(frozenSnapshot)))?.analyses?.[0]?.live).toBe(false);
  });

  it('rejects malformed new instances and prefers the new field when both shapes exist', () => {
    const snapshot = snapshotWithTrace();
    const instance = { id: 'analysis-1', toolId: 'ripple', params: {}, source: { traceId: null }, collapsed: false, live: true, outputTraceId: null };
    const valid = { ...snapshot, analysisOpenState: { 'noise-psd': true }, analyses: [instance] };
    expect(migrateWorkspaceV5(valid)?.analyses).toEqual([instance]);
    const invalid = [
      [{ ...instance, toolId: 'unknown' }],
      [{ ...instance, params: { unexpected: 1 } }],
      [{ ...instance, toolId: 'ip3', params: { gain: 'invalid' } }],
      [instance, instance],
      [{ ...instance, id: 'bad-id' }],
      [{ ...instance, live: 'yes' }],
      [{ ...instance, toolId: 'smooth', params: { method: 'moving-average', window: 3, sgOrder: 2 }, outputTraceId: 'missing' }],
      [{ ...instance, toolId: 'smooth', params: { method: 'moving-average', window: 3, sgOrder: 2 }, outputTraceId: null }],
    ];
    for (const analyses of invalid) expect(migrateWorkspaceV5({ ...snapshot, analyses })).toBeNull();
    expect(migrateWorkspaceV5({ ...snapshot, analyses: null })).toBeNull();
  });

  it('uses no source when the legacy snapshot has no selected trace', () => {
    const snapshot = snapshotWithTrace();
    const { analyses: _analyses, ...legacy } = snapshot;
    const result = migrateWorkspaceV5({ ...legacy, selectedTraceName: null, analysisOpenState: { 'range-stats': true } });
    expect(result?.analyses?.[0]).toMatchObject({ toolId: 'range-stats', source: { traceId: null }, params: { range: 'visible' } });
  });

  it('continues to migrate a real v4 preservation fixture', () => {
    const fixture: unknown = JSON.parse(readFileSync('tests/fixtures/phase3-preservation/workspace-v4-live-legacy.json', 'utf8'));
    const migrated = migrateWorkspaceV5(fixture);
    expect(migrated?.version).toBe(5);
    expect(migrated?.analyses).toBeDefined();
    expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
  });
  it('checks math output ownership and permits detached frozen instances', () => {
    const snapshot = snapshotWithTrace();
    const instance = { id: 'analysis-1', toolId: 'offset-scale', params: { offset: 0, scale: 1 }, source: { traceId: 'source' }, collapsed: false, live: false, outputTraceId: null };
    expect(migrateWorkspaceV5({ ...snapshot, analyses: [instance] })).not.toBeNull();
    const trace = { ...makeTestTrace({ id: 'out', name: 'out' }), kind: 'derived' as const, analysisId: 'analysis-2' };
    expect(migrateWorkspaceV5({ ...snapshot, derivedTraces: [trace], analyses: [{ ...instance, live: true, outputTraceId: 'out' }] })).toBeNull();
  });

});
