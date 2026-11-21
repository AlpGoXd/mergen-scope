import { describe, expect, it } from 'vitest';
import { computeInstance } from '../../src/domain/analysis/instances';
import { defaultMarkerState, markerReducer } from '../../src/stores/marker-store';
import { makeTestTrace } from './helpers';

const freqs = [1, 2, 3, 4, 5, 6];
const dataFor = (tones: number) => freqs.map(freq => ({ freq, amp: freq === 2 || freq === 3 ? tones : -40 }));
const ROLES = [{ freq: 2, label: 'F1' }, { freq: 3, label: 'F2' }, { freq: 1, label: 'IM3L' }, { freq: 4, label: 'IM3U' }];

describe('IP3 role markers are per trace', () => {
  const a = makeTestTrace({ name: 'a', data: dataFor(0) });
  const b = makeTestTrace({ name: 'b', data: dataFor(10) });
  const instance = (traceId: string) => ({ id: `ip3-${traceId}`, toolId: 'ip3', params: { gain: 0 }, source: { traceId }, collapsed: false, outputTraceId: null });

  it('keeps both traces\' role markers and computes each card from its own trace', () => {
    let state = markerReducer(defaultMarkerState, { type: 'SET_ROLE_MARKERS', payload: { trace: a, items: ROLES } });
    state = markerReducer(state, { type: 'SET_ROLE_MARKERS', payload: { trace: b, items: ROLES } });
    expect(state.markers).toHaveLength(8);
    const inputs = { traces: [a, b], markers: state.markers };
    const ra = computeInstance(instance('a'), inputs);
    const rb = computeInstance(instance('b'), inputs);
    expect(ra.outputs?.[0]).toMatchObject({ values: { p1: 0 } });
    expect(rb.outputs?.[0]).toMatchObject({ values: { p1: 10 } });
  });

  it('re-placing roles on one trace leaves the other trace alone', () => {
    let state = markerReducer(defaultMarkerState, { type: 'SET_ROLE_MARKERS', payload: { trace: a, items: ROLES } });
    state = markerReducer(state, { type: 'SET_ROLE_MARKERS', payload: { trace: b, items: ROLES } });
    state = markerReducer(state, { type: 'SET_ROLE_MARKERS', payload: { trace: a, items: ROLES } });
    expect(state.markers.filter(marker => marker.trace === 'a')).toHaveLength(4);
    expect(state.markers.filter(marker => marker.trace === 'b')).toHaveLength(4);
  });

  it('setting a role by hand only moves it among markers on the same trace', () => {
    let state = markerReducer(defaultMarkerState, { type: 'SET_ROLE_MARKERS', payload: { trace: a, items: ROLES } });
    state = markerReducer(state, { type: 'PLACE_MARKER', payload: { trace: b, targetFreq: 5 } });
    state = markerReducer(state, { type: 'SET_MARKER_ROLE', payload: { idx: state.markers.length - 1, label: 'F1' } });
    expect(state.markers.filter(marker => marker.label === 'F1').map(marker => marker.trace).sort()).toEqual(['a', 'b']);
  });
});
