import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initialWorkspaceState, workspaceReducer, snapshotFromWorkspace, workspaceFromSnapshot, traceView } from '../../src/stores/aggregate-workspace-store';
import { parseTabularFile } from '../../src/domain/parsers/tabular';
import { parseTouchstoneFile } from '../../src/domain/parsers/touchstone';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';
import { makeTestTrace } from './helpers';

it('accepts optional trace math alignment choices and rejects unknown choices', () => {
  const base = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension'));
  if (!base) throw new Error('fixture');
  const instance = { id: 'analysis-1', toolId: 'trace-math', source: { traceId: null, secondTraceId: null }, params: { operation: 'add' }, collapsed: false, outputTraceId: null };
  expect(migrateWorkspaceV5({ ...base, analyses: [instance] })?.analyses?.[0]?.params).toEqual(instance.params);
  expect(migrateWorkspaceV5({ ...base, analyses: [{ ...instance, params: { ...instance.params, points: 'both', fill: 'linear' } }] })).not.toBeNull();
  expect(migrateWorkspaceV5({ ...base, analyses: [{ ...instance, params: { ...instance.params, fill: 'unknown' } }] })).toBeNull();
  const output = { ...makeTestTrace({ id: 'math-output', name: 'math-output' }), kind: 'derived', operationType: 'add', analysisId: instance.id };
  const saved = migrateWorkspaceV5({ ...base, derivedTraces: [...base.derivedTraces, output], analyses: [{ ...instance, outputTraceId: output.id }] });
  expect(saved?.analyses?.[0]?.outputTraceId).toBe(output.id);
  const renamed = migrateWorkspaceV5({ ...base, derivedTraces: [...base.derivedTraces, { ...output, dn: 'Manual', automaticDisplayName: 'Automatic' }], analyses: [{ ...instance, outputTraceId: output.id, autoName: 'Automatic' }] });
  expect(renamed?.analyses?.[0]?.autoName).toBe('Automatic');
  expect(renamed?.derivedTraces.find(trace => trace.id === output.id)?.dn).toBe('Manual');
  expect(migrateWorkspaceV5(renamed)?.analyses?.[0]?.autoName).toBe('Automatic');
});

const fixture = (name: string): unknown => JSON.parse(readFileSync(`tests/fixtures/phase3-preservation/${name}.json`, 'utf8'));
it('preserves and validates Smith ranges', () => {
  const base = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension'));
  if (!base) throw new Error('fixture');
  const withRange = (range: unknown, outside: unknown) => ({ ...base, panes: base.panes.map(p => ({ ...p, settings: { ...p.settings, smith: { ...p.settings.smith, range, outside } } })) });
  const range = { startHz: 2, stopHz: 5 };
  expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(withRange(range, 'faint'))))?.panes[0]?.settings.smith).toMatchObject({ range, outside: 'faint' });
  expect(migrateWorkspaceV5(withRange(undefined, undefined))?.panes[0]?.settings.smith).toMatchObject({ range: null, outside: 'hidden' });
  expect(migrateWorkspaceV5(withRange({ startHz: 5, stopHz: 2 }, 'hidden'))).toBeNull();
  expect(migrateWorkspaceV5(withRange({ startHz: '2', stopHz: 5 }, 'hidden'))).toBeNull();
  expect(migrateWorkspaceV5(withRange({ startHz: 2 }, 'hidden'))).toBeNull();
  expect(migrateWorkspaceV5(withRange(range, 'invalid'))).toBeNull();
  let state = initialWorkspaceState();
  const pane = state.panes.panes[0];
  if (!pane) throw new Error('pane');
  state = workspaceReducer(state, { slice: 'panes', limit: 4, action: { type: 'SET_PANE_SETTINGS', payload: { paneId: pane.id, patch: { smith: { ...pane.settings.smith, range, outside: 'faint' } } } } });
  expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshotFromWorkspace(state))))?.panes[0]?.settings.smith).toMatchObject({ range, outside: 'faint' });
});
it('migrates Smith labels and inverted panes and validates current settings', () => {
  const base = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension'));
  if (!base || !base.panes[0]) throw new Error('fixture');
  const first = base.panes[0];
  const withSmith = (labels: unknown, renderMode = first.renderMode) => ({ ...base, panes: base.panes.map((pane, index) => index ? pane : { ...pane, renderMode, typed: renderMode === 'smith-inverted' ? true : pane.typed, settings: { ...pane.settings, smith: { ...pane.settings.smith, labels } } }) });
  expect(migrateWorkspaceV5(withSmith(true))?.panes[0]?.settings.smith.labels).toBe('normalised');
  expect(migrateWorkspaceV5(withSmith(false))?.panes[0]?.settings.smith.labels).toBe('off');
  expect(migrateWorkspaceV5(withSmith(undefined))?.panes[0]?.settings.smith.labels).toBe('normalised');
  expect(migrateWorkspaceV5(withSmith('ohms'))?.panes[0]?.settings.smith.labels).toBe('ohms');
  let state = initialWorkspaceState();
  const smith = { ...state.panes.panes[0]?.settings.smith, grid: 'z' as const, labels: 'ohms' as const, direction: 'ends' as const, readout: ['z' as const] };
  state = workspaceReducer(state, { slice: 'panes', limit: 4, action: { type: 'SET_PANE_SETTINGS', payload: { paneId: 'pane-1', patch: { smith } } } });
  const saved = snapshotFromWorkspace(state);
  expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(saved)))?.panes[0]?.settings.smith).toEqual(smith);
  expect(migrateWorkspaceV5(withSmith('invalid'))).toBeNull();
  const inverted = migrateWorkspaceV5(withSmith(true, 'smith-inverted'))?.panes[0];
  expect(inverted?.renderMode).toBe('smith');
  expect(inverted?.settings.smith.grid).toBe('y');
  expect(inverted?.settings.smith.readout[0]).toBe('y');
});
it('persists typed panes and derives missing types in older workspaces', () => {
  let state = initialWorkspaceState();
  state = workspaceReducer(state, { slice: 'panes', limit: 4, action: { type: 'SET_RENDER_MODE', payload: { paneId: 'pane-1', mode: 'cartesian' } } });
  const written = snapshotFromWorkspace(state);
  if (!written) throw new Error('snapshot');
  expect(written.panes[0]?.typed).toBe(true);
  const reloaded = migrateWorkspaceV5(JSON.parse(JSON.stringify(written)));
  if (!reloaded) throw new Error('reload');
  expect(workspaceFromSnapshot(initialWorkspaceState(), reloaded)?.panes.panes[0]).toMatchObject({ typed: true, renderMode: 'cartesian' });
  const base = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension'));
  if (!base || base.panes.length < 2) throw new Error('fixture');
  const empty = { ...base, traceAssignments: Object.fromEntries(Object.keys(base.traceAssignments).map(name => [name, []])), paneActiveTraceMap: Object.fromEntries(base.panes.map(p => [p.id, null])) };
  const panes = empty.panes.map((p, i) => ({ ...p, renderMode: i === 1 ? 'smith' as const : 'cartesian' as const, typed: true }));
  const saved = migrateWorkspaceV5({ ...empty, panes });
  expect(saved?.panes[0]?.typed).toBe(true);
  expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(saved)))?.panes[1]).toMatchObject({ typed: true, renderMode: 'smith' });
  const oldPanes = panes.map(({ typed: _typed, ...pane }) => pane);
  const old = migrateWorkspaceV5({ ...empty, panes: oldPanes });
  expect(old?.panes[0]?.typed).toBe(false);
  expect(old?.panes[1]?.typed).toBe(true);
  const assigned = migrateWorkspaceV5({ ...base, panes: base.panes.map(({ typed: _typed, ...pane }) => pane) });
  for (const ids of Object.values(base.traceAssignments)) for (const id of ids) expect(assigned?.panes.find(p => p.id === id)?.typed).toBe(true);
  expect(migrateWorkspaceV5({ ...empty, panes: panes.map((p, i) => i === 0 ? { ...p, typed: 'yes' } : p) })).toBeNull();
  for (const renderMode of ['smith', 'smith-inverted', 'table']) {
    expect(migrateWorkspaceV5({ ...empty, panes: panes.map((p, i) => i === 0 ? { ...p, renderMode, typed: false } : p) })).toBeNull();
  }
});
it('preserves optional hue slots and accepts older snapshots', () => {
  const base = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension'));
  if (!base) throw new Error('fixture');
  expect(migrateWorkspaceV5(base)).not.toBeNull();
  const slot = { palette: 'source', index: 0, round: 0, hue: 270 };
  expect(migrateWorkspaceV5({ ...base, ui: { ...base.ui, traceHueSlots: { a: slot } } })?.ui.traceHueSlots).toEqual({ a: slot });
  expect(migrateWorkspaceV5({ ...base, ui: { ...base.ui, traceHueSlots: { a: 270 } } })?.ui.traceHueSlots).toBeUndefined();
  expect(migrateWorkspaceV5({ ...base, ui: { ...base.ui, traceHueSlots: { a: { ...slot, index: 9 } } } })).toBeNull();
  const created = { palette: 'created', index: 0, round: 0, hue: 22.5, cbIndex: 7 };
  expect(migrateWorkspaceV5({ ...base, ui: { ...base.ui, traceHueSlots: { a: created } } })?.ui.traceHueSlots).toEqual({ a: created });
  expect(migrateWorkspaceV5({ ...base, ui: { ...base.ui, traceHueSlots: { a: { ...created, cbIndex: 8 } } } })).toBeNull();
  expect(migrateWorkspaceV5({ ...base, ui: { ...base.ui, traceHueSlots: { a: { ...slot, cbIndex: 1 } } } })).toBeNull();
});
type LegacyTrace = { id: string; name: string; domain: string };
type LegacyPane = {
  id: string; title: string; renderMode: string;
  settings: {
    gridMajor: boolean; gridMinor: boolean; gridMajorThickness: number; gridMinorThickness: number;
    gridMajorOpacity: number; gridMinorOpacity: number; gridDashStyle: string; showMarkers: boolean;
    showReferenceLines: boolean; showLineLabels: boolean; showMarkerLabels: boolean;
  };
};
type LegacyMarker = {
  trace: string; freq: number; requestedFreq: number; amp: number;
  type: string; label: string | null; interpolated: boolean;
};
type LegacyEnvelope = {
  kind: string; version: number;
  snapshot: {
    files: { fileName: string; traces: LegacyTrace[] }[];
    panes: LegacyPane[];
    traceAssignments: Record<string, string | string[]>;
    markers: LegacyMarker[];
  };
};
type LegacyGoldenSnapshot = {
  version: number;
  files: { fileName: string; traces: { id: string; name: string; domain: string; data: { freq: number; amp: number }[] }[] }[];
  panes: { id: string }[];
  traceAssignments: Record<string, string | string[]>;
  markers: { trace: string; requestedFreq: number; freq: number; amp: number; type: string; label: string | null; refIdx: number | null }[];
  refLines: { id: number; type: string; value: number; paneId: string; groupId: string | null; label: string | null }[];
  ui: { showDots: boolean; theme?: string };
};
describe('v5 migration boundary', () => {
  it('preserves files, legacy traces, pane configuration, memberships and markers from a real v4 export', () => {
    const raw = fixture('workspace-v4-live-legacy') as LegacyEnvelope;
    const source = raw.snapshot;
    const migrated = migrateWorkspaceV5(raw);
    if (!migrated) throw Error('legacy fixture migration failed');

    expect(migrated.files.map(file => file.fileName)).toEqual(source.files.map(file => file.fileName));
    expect(migrated.files).toHaveLength(source.files.length);
    const sourceTraces = source.files.flatMap(file => file.traces);
    const migratedTraces = migrated.files.flatMap(file => file.traces);
    expect(migratedTraces).toHaveLength(sourceTraces.length);
    expect(migratedTraces.map(trace => ({ id: trace.id, name: trace.name }))).toEqual(sourceTraces.map(trace => ({ id: trace.id, name: trace.name })));

    expect(migrated.panes.map(pane => pane.id)).toEqual(source.panes.map(pane => pane.id));
    expect(migrated.panes.map(pane => ({ id: pane.id, title: pane.title, renderMode: pane.renderMode, settings: {
      gridMajor: pane.settings.gridMajor, gridMinor: pane.settings.gridMinor,
      gridMajorThickness: pane.settings.gridMajorThickness, gridMinorThickness: pane.settings.gridMinorThickness,
      gridMajorOpacity: pane.settings.gridMajorOpacity, gridMinorOpacity: pane.settings.gridMinorOpacity,
      gridDashStyle: pane.settings.gridDashStyle, showMarkers: pane.settings.showMarkers,
      showReferenceLines: pane.settings.showReferenceLines, showLineLabels: pane.settings.showLineLabels,
      showMarkerLabels: pane.settings.showMarkerLabels,
    } }))).toEqual(source.panes.map(pane => ({ ...pane })));
    expect(migrated.layout.paneOrder).toEqual(source.panes.map(pane => pane.id));
    expect(migrated.traceAssignments).toEqual(Object.fromEntries(Object.entries(source.traceAssignments).map(([name, pane]) => [name, Array.isArray(pane) ? pane : [pane]])));
    const traceDomains = Object.fromEntries(sourceTraces.map(trace => [trace.name, trace.domain]));
    expect(Object.entries(migrated.traceAssignments).filter(([name, panes]) => panes.includes('pane-1') && traceDomains[name] === 'frequency')).toHaveLength(2);
    expect(Object.entries(migrated.traceAssignments).filter(([name, panes]) => panes.includes('pane-2') && traceDomains[name] === 'time')).toHaveLength(2);

    expect(migrated.markers).toHaveLength(source.markers.length);
    expect(migrated.markers.map(marker => ({ trace: marker.trace, freq: marker.freq, requestedFreq: marker.requestedFreq, amp: marker.amp, type: marker.type, label: marker.label, interpolated: marker.interpolated }))).toEqual(source.markers.map(marker => ({ trace: marker.trace, freq: marker.freq, requestedFreq: marker.requestedFreq, amp: marker.amp, type: marker.type, label: marker.label, interpolated: marker.interpolated })));
    expect(new Set(migrated.markers.map(marker => marker.id)).size).toBe(source.markers.length);
    expect(migrated.markers.every(marker => migratedTraces.some(trace => trace.name === marker.trace))).toBe(true);
    const reloaded = migrateWorkspaceV5(JSON.parse(JSON.stringify(migrated)));
    expect(reloaded?.markers.map(marker => marker.id)).toEqual(migrated.markers.map(marker => marker.id));
  });

  it('preserves supported v4 golden files, panes, markers, grouped lines and legacy UI semantics', () => {
    const source = fixture('workspace-v4-legacy-golden') as LegacyGoldenSnapshot;
    const migrated = migrateWorkspaceV5(source);
    if (!migrated) throw Error('supported legacy fixture migration failed');

    expect(migrated.files.map(file => file.fileName)).toEqual(source.files.map(file => file.fileName));
    expect(migrated.files).toHaveLength(source.files.length);
    const sourceTraces = source.files.flatMap(file => file.traces);
    const migratedTraces = migrated.files.flatMap(file => file.traces);
    expect(migratedTraces.map(trace => ({ id: trace.id, name: trace.name, domain: trace.domain, data: trace.data }))).toEqual(sourceTraces.map(trace => ({ id: trace.id, name: trace.name, domain: trace.domain, data: trace.data })));
    expect(migrated.panes.map(pane => pane.id)).toEqual(source.panes.map(pane => pane.id));
    expect(migrated.layout.paneOrder).toEqual(source.panes.map(pane => pane.id));

    expect(migrated.traceAssignments.RF_Main_1).toEqual(['pane-a']);
    expect(migrated.traceAssignments.RF_Spur_1).toEqual(['pane-k']);
    expect(migrated.traceAssignments.CH1_1).toEqual([]);
    expect(migrated.markers).toHaveLength(source.markers.length);
    expect(migrated.markers.map(marker => ({ trace: marker.trace, requestedFreq: marker.requestedFreq, freq: marker.freq, amp: marker.amp, type: marker.type, label: marker.label }))).toEqual(source.markers.map(marker => ({ trace: marker.trace, requestedFreq: marker.requestedFreq, freq: marker.freq, amp: marker.amp, type: marker.type, label: marker.label })));
    const normal = migrated.markers.find(marker => marker.type === 'normal');
    const delta = migrated.markers.find(marker => marker.type === 'delta');
    expect(normal).toBeDefined();
    expect(delta?.refId).toBe(normal?.id);
    expect(delta?.requestedFreq).toBe(source.markers.find(marker => marker.refIdx === 0)?.requestedFreq);
    expect(delta?.freq).toBe(source.markers.find(marker => marker.refIdx === 0)?.freq);

    expect(migrated.refLines).toEqual([{ id: 101, type: 'v', value: 1500000000, paneIds: ['pane-a', 'pane-k'], label: 'V1' }]);
    expect(migrated.panes.every(pane => pane.settings.showSampleDots === source.ui.showDots)).toBe(true);
    expect(migrated.ui).not.toHaveProperty('theme');
  });

  it('preserves eight legacy pane IDs, memberships, target and per-pane dots', () => {
    const result = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension'));
    expect(result?.panes.map(p => p.id)).toEqual(['pane-a','pane-b','pane-c','pane-d','pane-e','pane-f','pane-g','pane-h']);
    expect(result?.traceAssignments.CH1_1).toEqual(['pane-h']);
    expect(result?.activePaneId).toBe('pane-h');
    expect(result?.panes.every(p => p.settings.showSampleDots)).toBe(true);
    expect(result?.markers[1]?.refId).toBe(result?.markers[0]?.id);
    expect(result?.ui).not.toHaveProperty('theme');
  });
  it('rejects malformed, future and mismatched envelopes before migration', () => {
    expect(migrateWorkspaceV5(fixture('workspace-future-version'))).toBeNull();
    expect(migrateWorkspaceV5(fixture('workspace-v4-malformed-shape'))).toBeNull();
    expect(migrateWorkspaceV5({kind:'mergen-scope-workspace', version:5, snapshot:{version:4,files:[]}})).toBeNull();
  });
  it('preserves copies and filters invalid pane IDs without inventing membership', () => {
    const source = fixture('workspace-v4-eight-pane-extension') as Record<string, unknown>;
    const result = migrateWorkspaceV5({...source, traceAssignments:{RF_Main_1:['pane-b','pane-h','missing','pane-b'], RF_Spur_1:[]}});
    expect(result?.traceAssignments.RF_Main_1).toEqual(['pane-b','pane-h']);
    expect(result?.traceAssignments.RF_Spur_1).toEqual([]);
    expect(result?.traceAssignments.CH1_1).toEqual([]);
  });
  it('requires stable unique marker IDs and array memberships in v5', () => {
    const legacy = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!legacy) throw Error('fixture');
    expect(migrateWorkspaceV5({...legacy, traceAssignments: {RF_Main_1: 'pane-a'}})).toBeNull();
    expect(migrateWorkspaceV5({...legacy, markers: [legacy.markers[0], legacy.markers[0]]})).toBeNull();
    expect(migrateWorkspaceV5({...legacy, markers: [{...legacy.markers[0], id: undefined}]})).toBeNull();
    expect(migrateWorkspaceV5(legacy)?.traceAssignments).toEqual(legacy.traceAssignments);
  });
  it('keeps the saved active choice in an eighth pane and filters invalid choices', () => {
    const source = fixture('workspace-v4-eight-pane-extension') as Record<string, unknown>;
    const result = migrateWorkspaceV5({...source, traceAssignments:{RF_Main_1:['pane-h'], RF_Spur_1:['pane-h'], CH1_1:[]}, paneActiveTraceMap:{'pane-h':'RF_Spur_1','pane-a':'CH1_1'}});
    expect(result?.paneActiveTraceMap['pane-h']).toBe('RF_Spur_1');
    expect(result?.paneActiveTraceMap['pane-a']).toBeNull();
  });
  it('preserves analysis controls and result maps through v5 migration', () => {
    const source = fixture('workspace-v4-eight-pane-extension') as Record<string, unknown>;
    const legacyUi = source.ui as Record<string, unknown>;
    const first = migrateWorkspaceV5({...source, ui:{...legacyUi,noiseFilter:'median',noiseSource:'RF_Main_1',ip3Gain:'12'}}); if (!first) throw Error('fixture');
    const results = {...first.analysisResults, noiseResults:{'RF_Main_1':[{freq:1,amp:2}]}};
    const result = migrateWorkspaceV5({...first, analysisResults:results});
    expect(result?.ui).toMatchObject({noiseFilter:'median',noiseSource:'RF_Main_1',ip3Gain:'12'});
    expect(result?.analysisResults).toEqual(results);
  });
  it('rejects malformed current envelope and nested data', () => {
    const valid = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!valid) throw Error('fixture');
    expect(migrateWorkspaceV5({kind:'mergen-scope-workspace',version:5,snapshot:{files:[]}})).toBeNull();
    expect(migrateWorkspaceV5({...valid,datasets:[{}]})).toBeNull();
    expect(migrateWorkspaceV5({...valid,displayTraces:[{}]})).toBeNull();
    expect(migrateWorkspaceV5({...valid,xZoomState:{}})).toBeNull();
    expect(migrateWorkspaceV5({...valid,analysisResults:{...valid.analysisResults,noiseResults:{x:[{}]}}})).toBeNull();
    expect(migrateWorkspaceV5({...valid,files:valid.files.map((file,index)=>index ? file : {...file,wizardConfig:{delimiter:4}})})).toBeNull();
    const withNull = {...valid, paneActiveTraceMap:{...valid.paneActiveTraceMap,'pane-a':null}};
    expect(migrateWorkspaceV5(withNull)?.paneActiveTraceMap['pane-a']).toBeNull();
  });
  it('preserves an intentionally empty active-trace selection through save and restore', () => {
    const valid = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!valid) throw Error('fixture');
    const paneId = 'pane-a';
    expect(Object.values(valid.traceAssignments).some(paneIds => paneIds.includes(paneId))).toBe(true);
    const withNull = migrateWorkspaceV5({ ...valid, paneActiveTraceMap: { ...valid.paneActiveTraceMap, [paneId]: null } });
    if (!withNull) throw Error('fixture with null active trace');
    expect(withNull.paneActiveTraceMap[paneId]).toBeNull();

    const restored = workspaceFromSnapshot(initialWorkspaceState(), withNull);
    if (!restored) throw Error('snapshot restore failed');
    expect(restored.panes.paneActiveTraceMap[paneId]).toBeNull();
    const saved = snapshotFromWorkspace(restored);
    expect(saved?.paneActiveTraceMap[paneId]).toBeNull();
    expect(migrateWorkspaceV5(saved)?.paneActiveTraceMap[paneId]).toBeNull();
    expect(saved?.ui.traceHueSlots).toEqual(restored.ui.traceHueSlots);
    if (!saved) throw Error('snapshot save failed');
    expect(workspaceFromSnapshot(initialWorkspaceState(), saved)?.ui.traceHueSlots).toEqual(restored.ui.traceHueSlots);
  });
  it('rejects broken discriminated trace, dataset and display data', () => {
    const valid = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!valid) throw Error('fixture');
    expect(valid.datasets.length).toBeGreaterThan(0); expect(valid.displayTraces.length).toBeGreaterThan(0);
    expect(migrateWorkspaceV5({...valid,datasets:valid.datasets.map((d,i)=>i ? d : {...d,capabilities:{}})})).toBeNull();
    expect(migrateWorkspaceV5({...valid,displayTraces:valid.displayTraces.map((d,i)=>i ? d : {...d,source:{}})})).toBeNull();
    expect(migrateWorkspaceV5({...valid,displayTraces:valid.displayTraces.map((d,i)=>i ? d : {...d,provenance:{}})})).toBeNull();
    expect(migrateWorkspaceV5({...valid,files:valid.files.map((file,i)=>i ? file : {...file,traces:file.traces.map((t,j)=>j ? t : {...t,units:undefined})})})).toBeNull();
    expect(migrateWorkspaceV5({...valid,files:valid.files.map((file,i)=>i ? file : {...file,touchstoneNetwork:{}})})).toBeNull();
  });
  it('round-trips hidden projections, markers, memberships and derived ancestry', () => {
    const valid = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!valid) throw Error('fixture');
    const file = valid.files[0]; const trace = file?.traces[0]; const display = valid.displayTraces.find(d => d.id === trace?.id);
    if (!file || !trace || !display) throw Error('fixture lacks projection');
    const hidden = { ...display, hidden: true, compat: { ...display.compat, legacyTraceName: trace.name } };
    const derived = { ...trace, id: 'derived-hidden', name: 'derived-hidden', kind: 'derived' as const, operationType: 'scale' as const, sourceTraceIds: [trace.id] };
    const marker = { id: 'hidden-marker', trace: trace.name, freq: 1, amp: 2, type: 'normal' as const, label: null, interpolated: false, refId: null };
    const source = { ...valid, files: valid.files.map(f => f.id === file.id ? { ...f, traces: f.traces.filter(t => t.id !== trace.id), displayTraces: f.displayTraces?.map(d => d.id === display.id ? hidden : d) } : f), displayTraces: valid.displayTraces.map(d => d.id === display.id ? hidden : d), derivedTraces: [...valid.derivedTraces, derived], markers: [...valid.markers, marker], traceAssignments: { ...valid.traceAssignments, [trace.name]: ['pane-a', 'pane-h'], [derived.name]: [] } };
    const savedFromLive = migrateWorkspaceV5({ ...source, version: 4 });
    expect(savedFromLive?.traceAssignments[trace.name]).toEqual(['pane-a', 'pane-h']);
    expect(savedFromLive?.traceAssignments[derived.name]).toEqual([]);
    expect(savedFromLive?.markers).toContainEqual(marker);
    const loaded = migrateWorkspaceV5(JSON.parse(JSON.stringify(savedFromLive)));
    expect(loaded).not.toBeNull();
    expect(loaded?.traceAssignments[trace.name]).toEqual(['pane-a', 'pane-h']);
    expect(loaded?.traceAssignments[derived.name]).toEqual([]);
    expect(loaded?.markers).toContainEqual(marker);
    expect(loaded?.derivedTraces.at(-1)?.sourceTraceIds).toEqual([trace.id]);
    expect(loaded?.files[0]?.displayTraces?.[0]?.hidden).toBe(true);
    expect(migrateWorkspaceV5(loaded)).toEqual(loaded);
  });
  it('rejects duplicate, dangling, inconsistent graph records and invalid optional fields', () => {
    const valid = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!valid) throw Error('fixture');
    const dataset = valid.datasets[0]; const display = valid.displayTraces[0]; if (!dataset || !display) throw Error('fixture');
    expect(migrateWorkspaceV5({ ...valid, datasets: [...valid.datasets, dataset] })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, derivedTraces: [{ ...valid.files[0]?.traces[0], id: 'derived-bad', name: 'derived-bad', kind: 'derived', operationType: 'scale', sourceTraceIds: ['missing'] }] })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, displayTraces: valid.displayTraces.map((d, i) => i ? d : { ...d, provenance: { ...d.provenance, parentDisplayTraceIds: ['missing'] } }) })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, displayTraces: [...valid.displayTraces, display] })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, displayTraces: valid.displayTraces.map((d, i) => i ? d : { ...d, datasetId: 'missing' }) })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, datasets: valid.datasets.map((d, i) => i ? d : { ...d, provenance: { ...d.provenance, rootDatasetIds: ['missing'] } }) })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, files: valid.files.map((f, i) => i ? f : { ...f, datasets: [{ ...dataset, label: 'different' }] }) })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, files: valid.files.map((f, i) => i ? f : { ...f, datasets: [] }) })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, files: valid.files.map((f, i) => i ? f : { ...f, error: 3 }) })).toBeNull();
    const failed = { ...valid, files: valid.files.map((f, i) => i ? f : { ...f, error: 'read failed' }) };
    expect(migrateWorkspaceV5(failed)?.files[0]).toHaveProperty('error', 'read failed');
    expect(migrateWorkspaceV5({ ...valid, datasets: valid.datasets.map((d, i) => i ? d : { ...d, hidden: 'yes' }) })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, displayTraces: valid.displayTraces.map((d, i) => i ? d : { ...d, interpolation: 'cubic' }) })).toBeNull();
    expect(migrateWorkspaceV5({ ...valid, ui: { ...valid.ui, traceInterpolations: { x: 'unsupported' } } })).toBeNull();
    const badSeries = { ...display, source: { sourceType: 'series', datasetFamily: display.family, seriesId: 'missing' } };
    expect(migrateWorkspaceV5({ ...valid, displayTraces: valid.displayTraces.map((d, i) => i ? d : badSeries) })).toBeNull();
  });

  it('does not fabricate displays when explicit canonical collections are empty', () => {
    const valid = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!valid) throw Error('fixture');
    const source = { ...valid, version: 4, files: valid.files.map(f => ({ ...f, traces: [], datasets: [], displayTraces: [] })), datasets: [], displayTraces: [], derivedTraces: [], markers: [], traceAssignments: {}, paneActiveTraceMap: {}, selectedTraceName: null };
    const result = migrateWorkspaceV5(source);
    expect(result?.datasets).toEqual([]); expect(result?.displayTraces).toEqual([]);
    expect(result?.traceAssignments).toEqual({});
  });

  it('strips extra browser preferences from current workspace UI', () => {
    const valid = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!valid) throw Error('fixture');
    const loaded = migrateWorkspaceV5({ ...valid, ui: { ...valid.ui, theme: 'glass', paneLimit: 8, customBrowserSetting: true } });
    expect(loaded?.ui).toEqual(valid.ui);
    expect(loaded?.ui).not.toHaveProperty('theme');
    expect(loaded?.ui).not.toHaveProperty('paneLimit');
  });
  it('migrates legacy derived trace ancestry into a valid v5 round trip', () => {
    const raw = fixture('workspace-v4-eight-pane-extension') as Record<string, unknown>;
    const first = migrateWorkspaceV5(raw); if (!first) throw Error('fixture');
    const parent = first.files[0]?.traces[0]; if (!parent) throw Error('missing parent');
    const derived = { ...parent, id: 'legacy-derived', name: 'legacy-derived', kind: 'derived' as const, operationType: 'scale' as const, sourceTraceIds: [parent.id] };
    const migrated = migrateWorkspaceV5({ ...raw, derivedTraces: [derived], traceAssignments: { ...raw.traceAssignments as object, 'legacy-derived': [] } });
    if (!migrated) throw Error('legacy migration failed');
    const loaded = migrateWorkspaceV5(JSON.parse(JSON.stringify(migrated)));
    expect(loaded).not.toBeNull();
    expect(loaded?.derivedTraces).toContainEqual(derived);
    expect(loaded?.traceAssignments['legacy-derived']).toEqual([]);
  });

  it('requires network matrices and normalized references to match port count', () => {
    const valid = migrateWorkspaceV5(fixture('workspace-v4-eight-pane-extension')); if (!valid) throw Error('fixture');
    const parsed = parseTouchstoneFile('# Hz S RI R 50\n1 0.1 0 0.2 0 0.3 0 0.4 0\n2 0.2 0 0.3 0 0.4 0 0.5 0\n', 'x.s2p');
    const network = parsed.touchstoneNetwork; if (!network) throw Error('network');
    const withNetwork = (value: unknown) => ({ ...valid, files: valid.files.map((f, i) => i ? f : { ...f, touchstoneNetwork: value }) });
    expect(migrateWorkspaceV5(withNetwork(network))).not.toBeNull();
    expect(migrateWorkspaceV5(withNetwork({ ...network, samples: [{ ...network.samples[0], sMatrix: [[{ re: 1, im: 0 }]] }] }))).toBeNull();
    expect(migrateWorkspaceV5(withNetwork({ ...network, referenceOhms: [50] }))).toBeNull();
    expect(migrateWorkspaceV5(withNetwork({ ...network, referenceOhms: [50, 0] }))).toBeNull();
  });

  it('round-trips real parser source and canonical display IDs, including a hidden marker', () => {
    const text = 'time,a,b\n0,1,2\n1,3,4\n';
    const config = { delimiter: ',', skipRows: 1, xCol: 0, yCols: [1, 2], xMult: 1, yMult: 1, domain: 'time' as const, confidence: 1, headers: ['time', 'a', 'b'] };
    const parsed = parseTabularFile(text, 'x.csv', config);
    let state = initialWorkspaceState();
    state = workspaceReducer(state, { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'csv', fileName: 'x.csv', text, parsed } } });
    const raw = state.files.files[0]?.traces[0]; const display = state.files.files[0]?.displayTraces?.[0];
    const trace = traceView(state.files, state.traces).allKnownTraces[0]; if (!raw || !display || !trace) throw Error('missing parsed records');
    expect(raw.id).not.toBe(display.id); expect(trace.id).toBe(display.id);
    state = workspaceReducer(state, { slice: 'panes', limit: 4, action: { type: 'ASSIGN_TRACE_TO_PANE', payload: { trace, targetPaneId: 'pane-1', allTraces: [trace] } } });
    state = workspaceReducer(state, { slice: 'markers', action: { type: 'PLACE_MARKER', payload: { trace, targetFreq: 0 } } });
    const save = () => { const snapshot = snapshotFromWorkspace(state); if (!snapshot) throw Error('snapshot'); return migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot))); };
    const visible = save(); expect(visible).not.toBeNull();
    expect(visible?.traceAssignments[trace.name]).toEqual(['pane-1']);
    const restored = visible && workspaceFromSnapshot(initialWorkspaceState(), visible); expect(restored && traceView(restored.files, restored.traces).allKnownTraces[0]?.id).toBe(display.id);
    state = workspaceReducer(state, { slice: 'files', action: { type: 'SET_DISPLAY_TRACE_HIDDEN', payload: { fileId: 'csv', displayTraceId: display.id, hidden: true } } });
    const hidden = save(); expect(hidden).not.toBeNull();
    expect(hidden?.traceAssignments[trace.name]).toEqual(['pane-1']); expect(hidden?.markers[0]?.trace).toBe(trace.name);
    const hiddenState = hidden && workspaceFromSnapshot(initialWorkspaceState(), hidden); expect(hiddenState && traceView(hiddenState.files, hiddenState.traces).allKnownTraces[0]?.id).toBe(display.id);
    if (!hidden) throw Error('hidden');
    const derived = { ...raw, id: 'derived-from-raw', name: 'derived-from-raw', kind: 'derived' as const, operationType: 'scale' as const, sourceTraceIds: [raw.id] };
    const hiddenWithDerived = { ...hidden, derivedTraces: [...hidden.derivedTraces, derived], traceAssignments: { ...hidden.traceAssignments, [derived.name]: [] } };
    expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(hiddenWithDerived)))?.derivedTraces.at(-1)?.sourceTraceIds).toEqual([raw.id]);
    const secondView = { ...display, id: 'second-projection', compat: { ...display.compat, legacyTraceName: 'second-projection' } };
    const sharedSeries = { ...hiddenWithDerived, displayTraces: [...hiddenWithDerived.displayTraces, secondView], files: hiddenWithDerived.files.map(f => f.id === 'csv' ? { ...f, displayTraces: [...(f.displayTraces ?? []), secondView], columnIdentities: undefined } : f) };
    expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(sharedSeries)))).not.toBeNull();
    if (!visible) throw Error('visible');
    const tamperedFiles = visible.files.map(f => ({ ...f, traces: f.traces.map((t, i) => i ? t : { ...t, data: [{ freq: 0, amp: 999 }] }) }));
    expect(migrateWorkspaceV5({ ...visible, files: tamperedFiles })).toBeNull();
  });

});

