import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMeasurementFile } from '../../src/domain/parsers/parse-file';
import { autoPickIp3 } from '../../src/domain/analysis/ip3-auto';
import { calcIP3FromPoints, getIP3PointsFromMarkers } from '../../src/domain/analysis/ip3';
import { markerReducer, defaultMarkerState } from '../../src/stores/marker-store';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import { computeInstance, createInstance } from '../../src/domain/analysis/instances';
import type { Trace } from '../../src/types/trace';

function realTrace(file: string): Trace {
  const parsed = parseMeasurementFile(readFileSync(`test files/${file}`, 'utf8'), file);
  const trace = parsed.traces[0];
  if (!trace) throw new Error('no trace');
  return trace;
}

describe('autoPickIp3 on the real two-tone captures', () => {
  for (const [file, tone, im3] of [['cascade_ip3_-12dBm.DAT', 7.5, -36], ['cascade_ip3_-15dBm.DAT', 4.2, -47.7], ['cascade_ip3_-18dBm.DAT', 1.2, -57.8]] as const) {
    it(`${file}: two tones and their third-order products`, () => {
      const result = autoPickIp3(realTrace(file).data);
      if (!result.ok) throw new Error(result.reason);
      const [f1, f2, lower, upper] = result.items;
      expect([f1.label, f2.label, lower.label, upper.label]).toEqual(['F1', 'F2', 'IM3L', 'IM3U']);
      expect(f1.freq).toBeLessThan(f2.freq);
      expect(lower.freq).toBeLessThan(f1.freq);
      expect(upper.freq).toBeGreaterThan(f2.freq);
      const spacing = f2.freq - f1.freq;
      expect(Math.abs(f1.freq - lower.freq - spacing)).toBeLessThan(2000);
      expect(Math.abs(upper.freq - f2.freq - spacing)).toBeLessThan(2000);
      expect(f1.amp).toBeCloseTo(tone, 0);
      expect(lower.amp).toBeCloseTo(im3, 0);
      expect(f1.amp).toBeGreaterThan(lower.amp + 30);
    });
  }

  it('gives an OIP3 near 29 to 30 dBm for the -12 dBm capture', () => {
    const result = autoPickIp3(realTrace('cascade_ip3_-12dBm.DAT').data);
    if (!result.ok) throw new Error(result.reason);
    const ip3 = calcIP3FromPoints(getIP3PointsFromMarkers(result.items.map(item => ({ label: item.label, freq: item.freq, amp: item.amp, trace: 't', type: 'normal', refId: null, interpolated: false, id: item.label } as never))));
    expect(ip3?.oip3_avg).toBeGreaterThan(29);
    expect(ip3?.oip3_avg).toBeLessThan(30);
  });
});

describe('autoPickIp3 refuses what it cannot measure', () => {
  const ramp = (n: number) => Array.from({ length: n }, (_, i) => ({ freq: 1e6 + i * 1e3, amp: -80 }));
  it('too few points', () => expect(autoPickIp3(ramp(5)).ok).toBe(false));
  it('a trace with a single tone', () => {
    const data = ramp(200).map((point, index) => index === 100 ? { ...point, amp: 0 } : point);
    const result = autoPickIp3(data.map((point, index) => ({ ...point, amp: index === 100 ? 0 : -80 - (index % 2) * 0.1 })));
    expect(result.ok).toBe(false);
  });
  it('products outside the sweep', () => {
    const data = ramp(200).map((point, index) => ({ ...point, amp: index === 10 ? 0 : index === 190 ? -1 : -80 - (index % 2) * 0.1 }));
    const result = autoPickIp3(data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/outside the sweep/);
  });
});

describe('IP3 role markers', () => {
  const trace = realTrace('cascade_ip3_-12dBm.DAT');
  const items = (() => { const r = autoPickIp3(trace.data); if (!r.ok) throw new Error(r.reason); return r.items.map(item => ({ freq: item.freq, label: item.label })); })();

  it('SET_ROLE_MARKERS places four labelled markers and replaces earlier role markers', () => {
    let state = markerReducer(defaultMarkerState, { type: 'SET_ROLE_MARKERS', payload: { trace, items } });
    expect(state.markers.map(marker => marker.label)).toEqual(['F1', 'F2', 'IM3L', 'IM3U']);
    state = markerReducer(state, { type: 'PLACE_MARKER', payload: { trace, targetFreq: trace.data[10]?.freq ?? 0 } });
    state = markerReducer(state, { type: 'SET_ROLE_MARKERS', payload: { trace, items } });
    expect(state.markers.map(marker => marker.label)).toEqual([null, 'F1', 'F2', 'IM3L', 'IM3U']);
  });

  it('SET_MARKER_ROLE moves a role between markers and clears it', () => {
    let state = markerReducer(defaultMarkerState, { type: 'PLACE_MARKER', payload: { trace, targetFreq: trace.data[100]?.freq ?? 0 } });
    state = markerReducer(state, { type: 'PLACE_MARKER', payload: { trace, targetFreq: trace.data[200]?.freq ?? 0 } });
    state = markerReducer(state, { type: 'SET_MARKER_ROLE', payload: { idx: 0, label: 'F1' } });
    state = markerReducer(state, { type: 'SET_MARKER_ROLE', payload: { idx: 1, label: 'F1' } });
    expect(state.markers.map(marker => marker.label)).toEqual([null, 'F1']);
    state = markerReducer(state, { type: 'SET_MARKER_ROLE', payload: { idx: 1, label: null } });
    expect(state.markers.map(marker => marker.label)).toEqual([null, null]);
  });

  it('auto-place is ONE undo step through the engine and the IP3 card then has a result', () => {
    let engine = workspaceEngineReducer(initialWorkspaceEngine(), { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'f.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [trace] } } } } });
    const before = engine.history.past.length;
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'markers', action: { type: 'SET_ROLE_MARKERS', payload: { trace, items } } } });
    expect(engine.present.markers.markers.map(marker => marker.label)).toEqual(['F1', 'F2', 'IM3L', 'IM3U']);
    expect(engine.history.past).toHaveLength(before + 1);
    expect(engine.toastMessage).toBeUndefined();
    const instance = createInstance('analysis-1', 'ip3', { traceId: trace.id });
    if (!instance) throw new Error('instance');
    const result = computeInstance(instance, { traces: [trace], markers: engine.present.markers.markers });
    expect(result.reason).toBeUndefined();
    expect(result.outputs?.[0]?.type).toBe('numbers');
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.markers.markers).toHaveLength(0);
  });
});
