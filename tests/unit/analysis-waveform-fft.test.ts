import { describe, expect, it } from 'vitest';
import { measureWaveform } from '../../src/domain/analysis/waveform';
import { computeFft, largestPowerOfTwo, windowCoefficients } from '../../src/domain/analysis/fft';
import type { FftWindow } from '../../src/domain/analysis/fft';
import { waveformTool } from '../../src/domain/analysis/tools/waveform';
import { FFT_DEFAULTS, fftTool } from '../../src/domain/analysis/tools/fft';
import { computeInstance, createInstance, shortTraceLabel } from '../../src/domain/analysis/instances';
import { listAddableTools } from '../../src/domain/analysis/tool-registry';
import { describeNumbers } from '../../src/domain/analysis/card-view';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import type { WorkspaceEngine } from '../../src/stores/aggregate-workspace-store';
import type { AnalysisAction } from '../../src/stores/analysis-store';
import type { DataPoint, Trace } from '../../src/types/trace';
import { makeTestTrace } from './helpers';

// ---------------------------------------------------------------------------
// Known-answer signals
// ---------------------------------------------------------------------------

const sampled = (n: number, dt: number, f: (t: number, i: number) => number): DataPoint[] =>
  Array.from({ length: n }, (_, i) => ({ freq: i * dt, amp: f(i * dt, i) }));

/** 1 V amplitude sine, `cycles` whole periods in `n` samples (end point excluded). */
const sine = (n: number, dt: number, freq: number, amplitude = 1, phase = 0): DataPoint[] =>
  sampled(n, dt, t => amplitude * Math.sin(2 * Math.PI * freq * t + phase));

/** 0/1 pulse train: `high` samples at 1 then `period - high` samples at 0. */
const pulse = (n: number, dt: number, period: number, high: number): DataPoint[] =>
  sampled(n, dt, (_t, i) => (i % period) < high ? 1 : 0);

/** Seeded uniform PRNG (mulberry32) and Box-Muller normal deviates, so noise tests are repeatable. */
function gaussian(seed: number): () => number {
  let s = seed >>> 0;
  const uniform = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}

const timeTrace = (data: DataPoint[], overrides: Partial<Trace> = {}): Trace =>
  makeTestTrace({ id: 'ch1', name: 'ch1', dn: 'CH1', data, units: { x: 's', y: 'V' }, domain: 'time', family: 'waveform', file: 'scope.csv', ...overrides });

const dBV = (vrms: number) => 20 * Math.log10(vrms);
const WINDOWS: readonly FftWindow[] = ['hann', 'rectangular', 'flattop', 'blackman-harris'];

// ---------------------------------------------------------------------------
// Waveform measurements
// ---------------------------------------------------------------------------

describe('waveform measurements', () => {
  it('reads a 1 kHz, 1 V sine', () => {
    // 1000 samples per period, 5 periods: the peaks fall on samples.
    const r = measureWaveform(sine(5000, 1e-6, 1000));
    if (!r) throw new Error('no result');
    expect(r.frequency).toBeCloseTo(1000, 6);
    expect(r.period).toBeCloseTo(1e-3, 12);
    expect(r.vpp).toBeCloseTo(2, 9);
    expect(r.max).toBeCloseTo(1, 9);
    expect(r.min).toBeCloseTo(-1, 9);
    expect(r.mean).toBeCloseTo(0, 9);
    expect(r.rms).toBeCloseTo(Math.SQRT1_2, 9);
    // 10 % → 90 % of a sine: from −0.8 A to +0.8 A, Δt = 2·asin(0.8) / (2π f).
    const edge = Math.asin(0.8) / (Math.PI * 1000);
    expect((r.riseTime ?? NaN) / edge).toBeCloseTo(1, 3);
    expect((r.fallTime ?? NaN) / edge).toBeCloseTo(1, 3);
    expect(r.overshoot).toBeCloseTo(0, 6);
    expect(r.dutyCycle).toBeCloseTo(50, 3);
  });

  it('reads a 0/1 square wave and a 25 % pulse train', () => {
    const dt = 1e-6;
    const square = measureWaveform(pulse(1000, dt, 100, 50));
    if (!square) throw new Error('no result');
    expect(square.frequency).toBeCloseTo(1e4, 6);
    expect(square.vpp).toBe(1);
    expect(square.mean).toBeCloseTo(0.5, 12);
    expect(square.rms).toBeCloseTo(Math.SQRT1_2, 12);
    expect(square.dutyCycle).toBeCloseTo(50, 9);
    expect(square.overshoot).toBeCloseTo(0, 9);
    // One-sample edges: 10 % and 90 % interpolate to 0.1 dt and 0.9 dt.
    expect(square.riseTime).toBeCloseTo(0.8 * dt, 15);
    expect(square.fallTime).toBeCloseTo(0.8 * dt, 15);
    const narrow = measureWaveform(pulse(1000, dt, 100, 25));
    expect(narrow?.dutyCycle).toBeCloseTo(25, 9);
    expect(narrow?.mean).toBeCloseTo(0.25, 12);
  });

  it('measures overshoot against the settled top level, not the peak', () => {
    // A 0/1 square whose first high sample overshoots to 1.2: 20 % overshoot.
    const data = pulse(1000, 1e-6, 100, 50).map((point, i) => i % 100 === 0 ? { ...point, amp: 1.2 } : point);
    const r = measureWaveform(data);
    expect(r?.max).toBeCloseTo(1.2, 12);
    expect(r?.overshoot).toBeCloseTo(20, 6);
  });

  it('measures the 10–90 % rise of an RC edge as τ·ln 9', () => {
    const tau = 1e-6, dt = 1e-8, t0 = 2e-6;
    const data = sampled(5200, dt, t => t < t0 ? 0 : 1 - Math.exp(-(t - t0) / tau));
    const r = measureWaveform(data);
    if (!r) throw new Error('no result');
    expect((r.riseTime ?? NaN) / (tau * Math.log(9))).toBeCloseTo(1, 2);
    expect(Math.abs((r.riseTime ?? NaN) / (tau * Math.log(9)) - 1)).toBeLessThan(0.005);
    expect(r.fallTime).toBeNull();
    expect(r.frequency).toBeNull();
    expect(r.dutyCycle).toBeNull();
    expect(r.risingEdge).not.toBeNull();
  });

  it('reads the mean and RMS of white noise', () => {
    const next = gaussian(7);
    const sigma = 0.05;
    const r = measureWaveform(sampled(20000, 1e-6, () => sigma * next()));
    expect(Math.abs(r?.mean ?? 1)).toBeLessThan(4 * sigma / Math.sqrt(20000));
    expect((r?.rms ?? 0) / sigma).toBeCloseTo(1, 1);
  });

  it('returns null for too few samples and no edges for a flat line', () => {
    expect(measureWaveform([{ freq: 0, amp: 1 }])).toBeNull();
    const flat = measureWaveform(sampled(10, 1, () => 2));
    expect(flat).toMatchObject({ vpp: 0, mean: 2, rms: 2, frequency: null, riseTime: null, overshoot: null });
  });
});

describe('waveform tool', () => {
  const trace = timeTrace(sine(5000, 1e-6, 1000));
  it('applies to time traces only', () => {
    expect(waveformTool.appliesTo(trace)).toEqual({ allowed: true });
    expect(waveformTool.appliesTo(makeTestTrace())).toEqual({ allowed: false, reason: 'Select a time trace.' });
  });
  it('draws dashed 10 % / 90 % levels over one rising edge and a band over one period', () => {
    const outputs = waveformTool.compute({ traces: [trace] }, { range: 'all' });
    const numbers = outputs.find(output => output.type === 'numbers');
    expect(numbers?.type === 'numbers' && numbers.values['frequency']).toBeCloseTo(1000, 6);
    const shapes = outputs.find(output => output.type === 'shapes');
    if (shapes?.type !== 'shapes') throw new Error('no shapes');
    const levels = shapes.shapes.filter(shape => shape.kind === 'level');
    const bands = shapes.shapes.filter(shape => shape.kind === 'band');
    expect(levels.map(shape => shape.kind === 'level' ? shape.y : NaN)).toEqual([expect.closeTo(-0.8, 9), expect.closeTo(0.8, 9)]);
    expect(bands).toHaveLength(1);
    const band = bands[0];
    if (band?.kind !== 'band') throw new Error('no band');
    expect(band.x2 - band.x1).toBeCloseTo(1e-3, 12);
    expect(shapes.shapes.some(shape => shape.kind === 'dot' || shape.kind === 'triangle')).toBe(false);
  });
  it('measures only the visible range of the pane that shows the trace', () => {
    // Two periods at 1 kHz then three at 2 kHz; the pane shows only the first 2 ms.
    const data = sampled(8000, 1e-6, t => t < 2e-3 ? Math.sin(2 * Math.PI * 1000 * t) : Math.sin(2 * Math.PI * 2000 * t));
    const chirp = timeTrace(data);
    const inputs = { traces: [chirp], tracePaneMap: { ch1: ['pane-1'] }, paneRanges: { 'pane-1': { left: 0, right: 2e-3 } } };
    const visible = waveformTool.compute(inputs, { range: 'visible' }).find(output => output.type === 'numbers');
    const all = waveformTool.compute(inputs, { range: 'all' }).find(output => output.type === 'numbers');
    expect(visible?.type === 'numbers' && visible.values['period']).toBeCloseTo(1e-3, 9);
    expect(all?.type === 'numbers' && all.values['period']).not.toBeCloseTo(1e-3, 6);
  });
  it('formats every value with its unit', () => {
    const view = describeNumbers('waveform', waveformTool.compute({ traces: [trace] }, { range: 'all' }), { x: 's', y: 'V' });
    const row = (label: string) => view?.rows.find(item => item.label === label)?.value;
    expect(row('Frequency')).toBe('1 kHz');
    expect(row('Period')).toBe('1 ms');
    expect(row('Vpp')).toBe('2 V');
    expect(row('Mean')).toBe('0 V');
    expect(row('RMS')).toBe('707.1 mV');
    expect(row('Duty cycle')).toBe('50 %');
    expect(row('Rise time')).toMatch(/µs$/);
  });
});

// ---------------------------------------------------------------------------
// FFT
// ---------------------------------------------------------------------------

describe('fft', () => {
  const N = 4096, fs = 1e6, dt = 1 / fs, bin = fs / N;

  it('picks the largest power of two that fits', () => {
    expect(largestPowerOfTwo(5000)).toBe(4096);
    expect(largestPowerOfTwo(4096)).toBe(4096);
    expect(largestPowerOfTwo(7)).toBe(4);
  });

  it('builds periodic windows with the textbook coherent gains', () => {
    const mean = (w: Float64Array) => w.reduce((sum, value) => sum + value, 0) / w.length;
    expect(mean(windowCoefficients('rectangular', 1024))).toBeCloseTo(1, 12);
    expect(mean(windowCoefficients('hann', 1024))).toBeCloseTo(0.5, 12);
    expect(mean(windowCoefficients('blackman-harris', 1024))).toBeCloseTo(0.35875, 12);
    expect(mean(windowCoefficients('flattop', 1024))).toBeCloseTo(0.21557895, 8);
  });

  it.each(WINDOWS)('reads a 1 V amplitude sine as −3.01 dBV with the %s window (bin-centred)', window => {
    const f = 100 * bin;
    const r = computeFft(sine(N, dt, f), { window, points: 'auto', scale: 'dbv' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.result.points).toBe(N);
    expect(r.result.binHz).toBeCloseTo(bin, 9);
    expect(r.result.fundamental?.freq).toBeCloseTo(f, 6);
    expect(Math.abs((r.result.fundamental?.level ?? 0) - dBV(Math.SQRT1_2))).toBeLessThan(0.1);
    // The created spectrum's peak bin also reads the RMS level.
    const peak = r.result.spectrum.reduce((best, point) => point.amp > best.amp ? point : best);
    expect(peak.freq).toBeCloseTo(f, 6);
    expect(Math.abs(peak.amp - dBV(Math.SQRT1_2))).toBeLessThan(0.1);
  });

  it.each(['hann', 'flattop', 'blackman-harris'] as const)('keeps the level within 0.1 dB between bins with the %s window', window => {
    const r = computeFft(sine(N, dt, 100.37 * bin, 1, 0.3), { window, points: 'auto', scale: 'dbv' });
    if (!r.ok) throw new Error(r.reason);
    expect(Math.abs((r.result.fundamental?.level ?? 0) - dBV(Math.SQRT1_2))).toBeLessThan(0.1);
    expect(Math.abs((r.result.fundamental?.freq ?? 0) / (100.37 * bin) - 1)).toBeLessThan(1e-3);
  });

  it('converts the level to V (RMS) and dBm into 50 Ω', () => {
    const data = sine(N, dt, 100 * bin);
    const volts = computeFft(data, { window: 'hann', points: 'auto', scale: 'v' });
    const dbm = computeFft(data, { window: 'hann', points: 'auto', scale: 'dbm' });
    if (!volts.ok || !dbm.ok) throw new Error('fft failed');
    expect(volts.result.fundamental?.level).toBeCloseTo(Math.SQRT1_2, 6);
    // 0.5 V² / 50 Ω = 10 mW = +10 dBm.
    expect(dbm.result.fundamental?.level).toBeCloseTo(10, 6);
  });

  it('uses all samples in range for Auto, at any length', () => {
    const r = computeFft(sine(5000, dt, 37 * fs / 5000), { window: 'hann', points: 'auto', scale: 'dbv' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.result.points).toBe(5000);
    expect(r.result.spectrum).toHaveLength(2501);
    expect(Math.abs((r.result.fundamental?.level ?? 0) - dBV(Math.SQRT1_2))).toBeLessThan(0.01);
  });

  it('refuses unevenly spaced samples', () => {
    const data = sine(N, dt, 100 * bin).map((point, i) => ({ ...point, freq: (i + (i % 2 ? 0.05 : 0)) * dt }));
    expect(computeFft(data, { window: 'hann', points: 'auto', scale: 'dbv' })).toEqual({ ok: false, reason: 'FFT needs evenly spaced samples' });
  });

  it('refuses more points than samples', () => {
    const r = computeFft(sine(3000, dt, 100 * bin), { window: 'hann', points: 4096, scale: 'dbv' });
    expect(r.ok).toBe(false);
  });
});

describe('fft tool', () => {
  const N = 4096, dt = 1e-6, bin = 1 / (N * dt);
  const trace = timeTrace(sine(N, dt, 100 * bin));
  const params = { ...FFT_DEFAULTS, range: 'all' } as const;

  it('applies to time traces only, also in the Add menu', () => {
    expect(fftTool.appliesTo(trace)).toEqual({ allowed: true });
    const spectrum = makeTestTrace();
    expect(fftTool.appliesTo(spectrum)).toEqual({ allowed: false, reason: 'Select a time trace.' });
    expect(listAddableTools({ trace: spectrum, inputs: { traces: [spectrum] }, analyses: [] }).find(item => item.id === 'fft')?.disabledReason).toBe('Select a time trace.');
    expect(listAddableTools({ trace: spectrum, inputs: { traces: [spectrum] }, analyses: [] }).find(item => item.id === 'waveform')?.disabledReason).toBe('Select a time trace.');
    expect(listAddableTools({ trace, inputs: { traces: [trace] }, analyses: [] }).find(item => item.id === 'fft')?.disabledReason).toBeUndefined();
  });

  it('returns the numbers and a frequency-domain spectrum trace that carries its window facts', () => {
    const outputs = fftTool.compute({ traces: [trace] }, params);
    const numbers = outputs.find(output => output.type === 'numbers');
    expect(numbers?.type === 'numbers' && numbers.values['fundamentalLevel']).toBeCloseTo(dBV(Math.SQRT1_2), 3);
    const output = outputs.find(output => output.type === 'trace');
    if (output?.type !== 'trace') throw new Error('no trace');
    expect(output.trace).toMatchObject({ kind: 'derived', domain: 'frequency', family: 'spectrum', units: { x: 'Hz', y: 'dBV' }, sourceTraceIds: ['ch1'] });
    expect(output.trace.parameters?.['fft']).toMatchObject({ enbw: expect.closeTo(1.5, 6), lobe: 2, binHz: expect.closeTo(bin, 6), sampleRate: expect.closeTo(1e6, 3) });
    expect(output.trace.data).toHaveLength(N / 2 + 1);
    expect(output.trace.data.every(point => Number.isFinite(point.amp))).toBe(true);
  });

  it('refuses uneven sampling through the instance, so Create trace is disabled', () => {
    const uneven = timeTrace(trace.data.map((point, i) => ({ ...point, freq: (i + (i % 2 ? 0.05 : 0)) * dt })));
    const instance = createInstance('analysis-1', 'fft', { traceId: 'ch1' });
    if (!instance) throw new Error('no instance');
    expect(computeInstance(instance, { traces: [uneven] })).toEqual({ reason: 'FFT needs evenly spaced samples' });
    expect(computeInstance(instance, { traces: [trace] }).reason).toBeUndefined();
  });

  it('keeps the card lean: the fundamental, then one line of window facts', () => {
    const view = describeNumbers('fft', fftTool.compute({ traces: [trace] }, params), { x: 's', y: 'V' });
    expect(view?.result).toMatchObject({ value: '−3.01', unit: 'dBV' });
    expect(view?.rows.map(row => row.label)).toEqual(['Fundamental']);
    expect(view?.rows[0]?.value).toMatch(/kHz$/);
    expect(view?.facts).toMatch(/^ENBW 1\.50 bins .* · CG −6\.02 dB · scallop 1\.42 dB · sidelobe −31\.5 dB$/);
  });

  it('reads tone levels in the matching power unit when the scale is a density', () => {
    const density = { ...params, scale: 'dbvhz' } as const;
    const view = describeNumbers('fft', fftTool.compute({ traces: [trace] }, density), { x: 's', y: 'V' }, density);
    expect(view?.result).toMatchObject({ value: '−3.01', unit: 'dBV' });
  });
});

describe('fft output name', () => {
  it('uses the channel name without file and unit', () => {
    expect(shortTraceLabel(makeTestTrace({ name: 'scope.csv CH1 (V)_1', dn: 'scope.csv ch1 (v)', file: 'scope.csv' }))).toBe('CH1');
    expect(shortTraceLabel(makeTestTrace({ name: 'x_1', dn: 'Probe A', file: 'scope.csv' }))).toBe('Probe A');
  });
});

describe('fft output placement', () => {
  const N = 1024, dt = 1e-6, bin = 1 / (N * dt);
  const ch1 = timeTrace(sine(N, dt, 50 * bin));
  const change = (engine: WorkspaceEngine, action: AnalysisAction) => workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action } });
  const setup = (): WorkspaceEngine => {
    let engine = workspaceEngineReducer(initialWorkspaceEngine(), { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'scope.csv', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [ch1] } } } } });
    engine = { ...engine, present: { ...engine.present, files: { ...engine.present.files, files: engine.present.files.files.map(file => ({ ...file, traces: [ch1], datasets: [], displayTraces: [] })) }, panes: { ...engine.present.panes, tracePaneMap: { ch1: ['pane-1'] } } } };
    return engine;
  };

  it('puts the spectrum in a new, unlinked frequency pane, then reuses that pane', () => {
    let engine = setup();
    engine = change(engine, { type: 'ADD_ANALYSIS', payload: { toolId: 'fft', source: { traceId: 'ch1' } } });
    engine = change(engine, { type: 'CREATE_ANALYSIS_OUTPUT', payload: { id: 'analysis-1' } });
    const output = engine.present.traces.derivedTraces[0];
    if (!output) throw new Error('no output');
    expect(output).toMatchObject({ dn: 'FFT · CH1', analysisId: 'analysis-1', domain: 'frequency', units: { x: 'Hz', y: 'dBV' } });
    expect(engine.present.panes.panes).toHaveLength(2);
    const fftPane = engine.present.panes.panes[1]?.id;
    expect(engine.present.panes.tracePaneMap[output.name]).toEqual([fftPane]);
    expect(engine.present.panes.tracePaneMap['ch1']).toEqual(['pane-1']);
    expect(engine.present.panes.zoomAll).toBe(false);

    engine = change(engine, { type: 'ADD_ANALYSIS', payload: { toolId: 'fft', source: { traceId: 'ch1' } } });
    engine = change(engine, { type: 'SET_ANALYSIS_PARAMS', payload: { id: 'analysis-2', params: { window: 'flattop' } } });
    engine = change(engine, { type: 'CREATE_ANALYSIS_OUTPUT', payload: { id: 'analysis-2' } });
    const second = engine.present.traces.derivedTraces[1];
    if (!second) throw new Error('no second output');
    expect(engine.present.panes.panes).toHaveLength(2);
    expect(engine.present.panes.tracePaneMap[second.name]).toEqual([fftPane]);
  });

  it('follows the visible range of the time pane when Range is Visible', () => {
    let engine = setup();
    engine = change(engine, { type: 'ADD_ANALYSIS', payload: { toolId: 'fft', source: { traceId: 'ch1' } } });
    engine = change(engine, { type: 'CREATE_ANALYSIS_OUTPUT', payload: { id: 'analysis-1' } });
    expect(engine.present.traces.derivedTraces[0]?.data).toHaveLength(N / 2 + 1);
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'lines', action: { type: 'SET_PANE_VIEW', payload: { paneId: 'pane-1', view: { x: [0, 300 * dt], y: null } } } } });
    // 301 samples in view: Auto takes all of them, so 151 bins.
    expect(engine.present.traces.derivedTraces[0]?.data).toHaveLength(151);
  });
});
