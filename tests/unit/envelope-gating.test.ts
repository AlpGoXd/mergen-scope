import { describe, expect, it } from 'vitest';
import { computeInstance, createInstance } from '../../src/domain/analysis/instances';
import { ANALYSIS_TOOLS, ANALYSIS_TOOL_IDS, getAnalysisTool, listAddableTools, toolAppliesTo } from '../../src/domain/analysis/tool-registry';
import { envelopeDenied } from '../../src/domain/analysis/tools/shared';
import type { Marker } from '../../src/types/marker';
import { makeTestTrace } from './helpers';

const ORIGINAL_SAMPLES = 3_000_000;
const EXPECTED_DENIAL = `This trace is a display envelope of ${ORIGINAL_SAMPLES} samples. Re-import with Keep all or Decimate to analyse it.`;

function makeEnvelopeTimeTrace(id = 'env-time') {
  return makeTestTrace({
    id,
    name: id,
    family: 'waveform',
    domain: 'time',
    units: { x: 's', y: 'V' },
    isUniform: false,
    envelopeOf: ORIGINAL_SAMPLES,
    data: [
      { freq: 0, amp: -1 },
      { freq: 1e-6, amp: 2 },
      { freq: 2e-6, amp: -0.5 },
      { freq: 3e-6, amp: 5 },
      { freq: 4e-6, amp: 0 },
    ],
  });
}

function makeEnvelopeSpectrumTrace(id = 'env-spec') {
  return makeTestTrace({
    id,
    name: id,
    family: 'spectrum',
    domain: 'frequency',
    units: { x: 'Hz', y: 'dBm/Hz' },
    isUniform: false,
    envelopeOf: ORIGINAL_SAMPLES,
    data: [
      { freq: 1e6, amp: -40 },
      { freq: 2e6, amp: -5 },
      { freq: 3e6, amp: -42 },
      { freq: 4e6, amp: -10 },
      { freq: 5e6, amp: -45 },
    ],
  });
}

describe('declarative fail-closed envelope gating', () => {
  it('formats the exact envelope denial capability', () => {
    expect(envelopeDenied(ORIGINAL_SAMPLES)).toEqual({
      allowed: false,
      reason: EXPECTED_DENIAL,
    });
  });

  it('allows only ripple and peak-table on envelope traces and denies all other 18 tools', () => {
    const allowedIds = new Set(['ripple', 'peak-table']);
    expect(ANALYSIS_TOOLS).toHaveLength(20);
    expect(ANALYSIS_TOOL_IDS).toHaveLength(20);

    for (const envelope of [makeEnvelopeTimeTrace(), makeEnvelopeSpectrumTrace()]) {
      for (const id of ANALYSIS_TOOL_IDS) {
        const tool = getAnalysisTool(id);
        expect(tool).toBeDefined();
        if (!tool) continue;

        const capFromTool = tool.appliesTo(envelope);
        const capFromHelper = toolAppliesTo(tool, envelope);

        if (allowedIds.has(id)) {
          expect(tool.acceptsEnvelope).toBe(true);
          expect(capFromTool).toEqual({ allowed: true });
          expect(capFromHelper).toEqual({ allowed: true });
        } else {
          expect(tool.acceptsEnvelope).not.toBe(true);
          expect(capFromTool).toEqual({ allowed: false, reason: EXPECTED_DENIAL });
          expect(capFromHelper).toEqual({ allowed: false, reason: EXPECTED_DENIAL });
        }
      }
    }
  });

  it('keeps toolAppliesTo recursion-safe for wrapped tools on normal traces', () => {
    const normalTime = makeTestTrace({
      id: 'normal-time',
      family: 'waveform',
      domain: 'time',
      units: { x: 's', y: 'V' },
      data: [
        { freq: 0, amp: 0 },
        { freq: 1e-6, amp: 1 },
        { freq: 2e-6, amp: 0 },
      ],
    });
    const fftTool = getAnalysisTool('fft');
    expect(fftTool).toBeDefined();
    if (!fftTool) return;

    expect(fftTool.appliesTo(normalTime)).toEqual({ allowed: true });
    expect(toolAppliesTo(fftTool, normalTime)).toEqual({ allowed: true });

    const normalSpectrum = makeTestTrace({ id: 'normal-spec', domain: 'frequency', units: { x: 'Hz', y: 'dBm' } });
    expect(toolAppliesTo(fftTool, normalSpectrum)).toEqual({ allowed: false, reason: 'Select a time trace.' });
  });

  it('gates listAddableTools for envelope vs normal traces', () => {
    const envelope = makeEnvelopeTimeTrace();
    const envItems = listAddableTools({ trace: envelope, inputs: { traces: [envelope] }, analyses: [] });
    for (const item of envItems) {
      if (item.id === 'ripple' || item.id === 'peak-table') {
        expect(item.disabledReason).toBeUndefined();
      } else {
        expect(item.disabledReason).toBe(EXPECTED_DENIAL);
      }
    }

    const normalTime = makeTestTrace({
      id: 'normal-time',
      family: 'waveform',
      domain: 'time',
      units: { x: 's', y: 'V' },
    });
    const normalTimeItems = listAddableTools({ trace: normalTime, inputs: { traces: [normalTime] }, analyses: [] });
    for (const id of ['fft', 'waveform', 'ripple', 'peak-table']) {
      expect(normalTimeItems.find(item => item.id === id)?.disabledReason).toBeUndefined();
    }

    const normalSpectrum = makeTestTrace({
      id: 'normal-spec',
      family: 'spectrum',
      domain: 'frequency',
      units: { x: 'Hz', y: 'dBm' },
    });
    const normalSpecItems = listAddableTools({ trace: normalSpectrum, inputs: { traces: [normalSpectrum] }, analyses: [] });
    for (const id of ['harmonics', 'noise-psd', 'ripple', 'peak-table']) {
      expect(normalSpecItems.find(item => item.id === id)?.disabledReason).toBeUndefined();
    }
  });

  it('gates computeInstance on primary envelope traces and allows ripple and peak-table', () => {
    const envelope = makeEnvelopeTimeTrace();

    for (const toolId of ['fft', 'harmonics', 'waveform', 'noise-psd', 'range-stats', 'offset-scale']) {
      const instance = createInstance(`inst-${toolId}`, toolId, { traceId: envelope.id });
      expect(instance).not.toBeNull();
      if (!instance) continue;
      expect(computeInstance(instance, { traces: [envelope] })).toEqual({ reason: EXPECTED_DENIAL });
    }

    const rippleInstance = createInstance('inst-ripple', 'ripple', { traceId: envelope.id });
    expect(rippleInstance).not.toBeNull();
    if (rippleInstance) {
      const result = computeInstance(rippleInstance, { traces: [envelope] });
      expect(result.reason).toBeUndefined();
      expect(result.outputs?.[0]).toMatchObject({
        type: 'numbers',
        values: { min: -1, max: 5, ripple: 6 },
      });
    }

    const peakInstance = createInstance('inst-peak', 'peak-table', { traceId: envelope.id });
    expect(peakInstance).not.toBeNull();
    if (peakInstance) {
      const result = computeInstance(peakInstance, { traces: [envelope] });
      expect(result.reason).toBeUndefined();
      expect(result.outputs?.[0]).toMatchObject({ type: 'table' });
    }
  });

  it('gates trace-math when either primary or secondTraceId is an envelope trace', () => {
    const normal = makeTestTrace({
      id: 'normal',
      family: 'waveform',
      domain: 'time',
      units: { x: 's', y: 'V' },
      data: [
        { freq: 0, amp: 1 },
        { freq: 1e-6, amp: 2 },
        { freq: 2e-6, amp: 1 },
      ],
    });
    const envelope = makeEnvelopeTimeTrace('env-second');

    const normalPlusEnv = createInstance('tm-1', 'trace-math', { traceId: normal.id, secondTraceId: envelope.id });
    expect(normalPlusEnv).not.toBeNull();
    if (normalPlusEnv) {
      expect(computeInstance(normalPlusEnv, { traces: [normal, envelope] })).toEqual({
        reason: EXPECTED_DENIAL,
      });
    }

    const envPlusNormal = createInstance('tm-2', 'trace-math', { traceId: envelope.id, secondTraceId: normal.id });
    expect(envPlusNormal).not.toBeNull();
    if (envPlusNormal) {
      expect(computeInstance(envPlusNormal, { traces: [envelope, normal] })).toEqual({
        reason: EXPECTED_DENIAL,
      });
    }
  });

  it('gates line-crossings on all-envelope and excludes envelopes on mixed traces', () => {
    const normal = makeTestTrace({
      id: 'normal',
      name: 'normal',
      family: 'waveform',
      domain: 'time',
      units: { x: 's', y: 'V' },
      interpolation: 'linear',
      data: [
        { freq: 0, amp: 0 },
        { freq: 2e-6, amp: 4 },
      ],
    });
    const envelope = makeEnvelopeTimeTrace('env');
    const line = { id: 1, type: 'v' as const, paneIds: ['pane-1'], value: 1e-6, label: null };
    const instance = createInstance('lc-1', 'line-crossings', { traceId: null, lineId: 1 });
    expect(instance).not.toBeNull();
    if (!instance) return;

    const allEnvResult = computeInstance(instance, {
      traces: [envelope],
      lines: [line],
      lineId: 1,
      tracePaneMap: { [envelope.name]: ['pane-1'] },
      vis: { [envelope.name]: true },
    });
    expect(allEnvResult).toEqual({ reason: EXPECTED_DENIAL });

    const mixedResult = computeInstance(instance, {
      traces: [envelope, normal],
      lines: [line],
      lineId: 1,
      tracePaneMap: { [envelope.name]: ['pane-1'], [normal.name]: ['pane-1'] },
      vis: { [envelope.name]: true, [normal.name]: true },
    });
    expect(mixedResult.reason).toBeUndefined();
    expect(mixedResult.outputs?.[0]).toMatchObject({
      type: 'table',
      rows: [['pane-1', 'normal', 2]],
    });
  });

  it('gates ip3 when primary trace is omitted or deleted and role markers point to an envelope trace', () => {
    const envSpec = makeEnvelopeSpectrumTrace('env-spec');
    const normalSpec = makeTestTrace({
      id: 'norm-spec',
      name: 'norm-spec',
      family: 'spectrum',
      domain: 'frequency',
      units: { x: 'Hz', y: 'dBm' },
    });
    const makeIp3Markers = (traceNames: { f1: string; f2: string; im3l: string; im3u: string }): Marker[] => [
      { id: 'm1', freq: 10e6, amp: -10, trace: traceNames.f1, type: 'normal', label: 'F1', refId: null, interpolated: false },
      { id: 'm2', freq: 11e6, amp: -10, trace: traceNames.f2, type: 'normal', label: 'F2', refId: null, interpolated: false },
      { id: 'm3', freq: 9e6, amp: -60, trace: traceNames.im3l, type: 'normal', label: 'IM3L', refId: null, interpolated: false },
      { id: 'm4', freq: 12e6, amp: -60, trace: traceNames.im3u, type: 'normal', label: 'IM3U', refId: null, interpolated: false },
    ];

    const ip3Null = createInstance('ip3-null', 'ip3', { traceId: null });
    const ip3Deleted = createInstance('ip3-deleted', 'ip3', { traceId: 'deleted-trace' });
    expect(ip3Null).not.toBeNull();
    expect(ip3Deleted).not.toBeNull();
    if (!ip3Null || !ip3Deleted) return;

    const envMarkers = makeIp3Markers({ f1: envSpec.name, f2: envSpec.name, im3l: envSpec.name, im3u: envSpec.name });
    expect(computeInstance(ip3Null, { traces: [envSpec], markers: envMarkers })).toEqual({ reason: EXPECTED_DENIAL });
    expect(computeInstance(ip3Deleted, { traces: [envSpec], markers: envMarkers })).toEqual({ reason: EXPECTED_DENIAL });

    const mixedRoleMarkers = makeIp3Markers({ f1: envSpec.name, f2: normalSpec.name, im3l: normalSpec.name, im3u: normalSpec.name });
    expect(computeInstance(ip3Null, { traces: [envSpec, normalSpec], markers: mixedRoleMarkers })).toEqual({ reason: EXPECTED_DENIAL });

    // Normal IP3 computation with traceId: null works even if an unrelated envelope trace exists in the workspace
    const normalMarkers: Marker[] = [
      ...makeIp3Markers({ f1: normalSpec.name, f2: normalSpec.name, im3l: normalSpec.name, im3u: normalSpec.name }),
      { id: 'm5', freq: 1e6, amp: -40, trace: envSpec.name, type: 'normal', label: null, refId: null, interpolated: false },
    ];
    const normalResult = computeInstance(ip3Null, { traces: [envSpec, normalSpec], markers: normalMarkers });
    expect(normalResult.reason).toBeUndefined();
    expect(normalResult.outputs?.[0]).toMatchObject({
      type: 'numbers',
      values: { oip3_avg: 15, iip3: 15 },
    });

    // No IP3 markers placed yet preserves guidance message even when an envelope trace exists
    expect(computeInstance(ip3Null, { traces: [envSpec], markers: [] })).toEqual({
      reason: 'Place F1, F2, IM3L and IM3U markers',
    });
  });

  it('scopes line-crossings envelope gating to visible traces in line.paneIds', () => {
    const normal = makeTestTrace({
      id: 'normal',
      name: 'normal',
      family: 'waveform',
      domain: 'time',
      units: { x: 's', y: 'V' },
      interpolation: 'linear',
      data: [
        { freq: 0, amp: 0 },
        { freq: 2e-6, amp: 4 },
      ],
    });
    const envelope = makeEnvelopeTimeTrace('env');
    const line = { id: 1, type: 'v' as const, paneIds: ['pane-1'], value: 1e-6, label: null };
    const instance = createInstance('lc-scope', 'line-crossings', { traceId: null, lineId: 1 });
    expect(instance).not.toBeNull();
    if (!instance) return;

    // Envelope in line's pane-1, normal trace in unrelated pane-2 -> must deny instead of returning rows: []
    const crossPaneResult = computeInstance(instance, {
      traces: [envelope, normal],
      lines: [line],
      lineId: 1,
      tracePaneMap: { [envelope.name]: ['pane-1'], [normal.name]: ['pane-2'] },
      vis: { [envelope.name]: true, [normal.name]: true },
    });
    expect(crossPaneResult).toEqual({ reason: EXPECTED_DENIAL });

    // Envelope visible in pane-1, normal in pane-1 hidden via vis -> must deny
    const hiddenNormalResult = computeInstance(instance, {
      traces: [envelope, normal],
      lines: [line],
      lineId: 1,
      tracePaneMap: { [envelope.name]: ['pane-1'], [normal.name]: ['pane-1'] },
      vis: { [envelope.name]: true, [normal.name]: false },
    });
    expect(hiddenNormalResult).toEqual({ reason: EXPECTED_DENIAL });

    // Hidden envelope in pane-1 -> no visible traces in line's pane, returns empty rows (not a stale envelope denial)
    const hiddenEnvResult = computeInstance(instance, {
      traces: [envelope, normal],
      lines: [line],
      lineId: 1,
      tracePaneMap: { [envelope.name]: ['pane-1'], [normal.name]: ['pane-2'] },
      vis: { [envelope.name]: false, [normal.name]: true },
    });
    expect(hiddenEnvResult).toMatchObject({
      outputs: [{ type: 'table', rows: [] }],
    });

    // Normal visible in pane-1, envelope in pane-2 -> normal intersections still compute
    const normalPaneResult = computeInstance(instance, {
      traces: [envelope, normal],
      lines: [line],
      lineId: 1,
      tracePaneMap: { [envelope.name]: ['pane-2'], [normal.name]: ['pane-1'] },
      vis: { [envelope.name]: true, [normal.name]: true },
    });
    expect(normalPaneResult.reason).toBeUndefined();
    expect(normalPaneResult.outputs?.[0]).toMatchObject({
      type: 'table',
      rows: [['pane-1', 'normal', 2]],
    });
  });
});
