import { expect, it } from 'vitest';
import { DEFAULT_POLAR_SETTINGS, defaultPaneSettings } from '../../src/types/pane';
import { canPlaceMembership } from '../../src/domain/pane-placement';
import { complexPolar, POLAR_REFUSAL, polarCapability, polarFraction, polarReadout, polarRings, polarTrace, polarValue, polarVector } from '../../src/domain/polar';
import { makeTestTrace } from './helpers';

it('maps complex values into linear magnitude, dB and signed phase', () => {
  const result = complexPolar({ re: 0, im: -0.5 });
  expect(result.linear).toBe(0.5);
  expect(result.db).toBeCloseTo(-6.0206);
  expect(result.angle).toBe(-90);
});

it('converts antenna gain to a power ratio and retains the recorded dB value', () => {
  for (const unit of ['dBi', 'dBd', 'dB']) {
    const pattern = polarTrace(makeTestTrace({ units: { x: '°', y: unit } }));
    if (!pattern) throw new Error('Missing pattern');
    const value = polarValue({ re: 10, im: 45 }, pattern);
    expect(value.linear).toBeCloseTo(unit === 'dB' ? Math.sqrt(10) : 10);
    expect(value.db).toBe(10);
    expect(value.angle).toBe(45);
  }
});

it('rounds the auto limits, draws nice rings, and clips dB values below the floor to the centre', () => {
  const settings = { ...DEFAULT_POLAR_SETTINGS, radius: 'db' } as const;
  const rings = polarRings(-4.5, settings);
  expect(rings).toEqual({ min: -40, max: 0, ticks: [0, -10, -20, -30] });
  expect(polarFraction({ angle: 0, linear: 0, db: -60 }, rings, true)).toBe(0);
  expect(polarFraction({ angle: 0, linear: 0.1, db: -20 }, rings, true)).toBe(0.5);
  expect(polarRings(1.27, DEFAULT_POLAR_SETTINGS)).toEqual({ min: 0, max: 2, ticks: [0.5, 1, 1.5, 2] });
  expect(polarRings(4.7, DEFAULT_POLAR_SETTINGS).ticks).toEqual([1, 2, 3, 4, 5]);
  expect(polarRings(5, { ...settings, manual: { linearMax: 3, dbTop: 10, dbRange: 20 } })).toEqual({ min: -10, max: 10, ticks: [10, 0] });
});

it('rotates zero and reverses the angle direction independently', () => {
  expect(polarVector(0, 1, DEFAULT_POLAR_SETTINGS)).toEqual({ re: 1, im: 0 });
  expect(polarVector(0, 1, { ...DEFAULT_POLAR_SETTINGS, zero: 'top' }).im).toBe(1);
  expect(polarVector(90, 1, DEFAULT_POLAR_SETTINGS).im).toBe(1);
  expect(polarVector(90, 1, { ...DEFAULT_POLAR_SETTINGS, direction: 'cw' }).im).toBe(-1);
});

it('accepts angle patterns and complex parameters, formats readouts and refuses incompatible memberships', () => {
  const sample = { re: 0, im: -0.95 };
  const network = makeTestTrace({
    units: { x: 'Hz', y: 'dB' },
    networkSource: { family: 'S', row: 1, col: 0 },
    touchstoneNetwork: { parameterType: 'S', portCount: 2, referenceOhms: 50, freqUnit: 'Hz', dataFormat: 'RI', comments: [],
      samples: [{ freq: 2.441e9, sMatrix: [[sample, sample], [sample, sample]] }] },
  });
  const pattern = makeTestTrace({ name: 'pattern', file: 'pattern.csv', units: { x: '°', y: 'dB' },
    data: [{ freq: 0, amp: -3 }, { freq: 45, amp: -3.2 }, { freq: 360, amp: -3 }] });
  const networkModel = polarTrace(network), patternModel = polarTrace(pattern);
  if (!networkModel || !patternModel) throw new Error('Missing polar trace');
  expect(patternModel.closed).toBe(true);
  expect(polarReadout(networkModel, 2.441e9, 'M1')).toBe('M1 ● S21 2.441 GHz |S21| 0.95 (−0.45 dB) ∠ −90.0°');
  expect(polarReadout(patternModel, 45, 'M2', true)).toBe('M2 ≈ pattern.csv 45.0° −3.2 dB');
  expect(polarCapability(makeTestTrace())).toEqual({ allowed: false, reason: POLAR_REFUSAL });
  const pane = { id: 'p', title: '', typed: true, renderMode: 'polar', settings: defaultPaneSettings() } as const;
  expect(canPlaceMembership({ trace: network, paneIds: [] }, 'p', [pane], [{ trace: pattern, paneIds: ['p'] }]).allowed).toBe(false);
});
