import { expect, it } from 'vitest';
import { antennaBearing, antennaFarFieldCapability, computeAntennaFarField } from '../../src/domain/analysis/antenna-far-field';
import { makeTestTrace } from './helpers';

const sweep = [
  [0, 10], [10, 7], [20, 0], [60, -20], [90, 0], [120, -15], [180, -10],
  [240, -18], [270, -3], [300, -14], [330, 0], [350, 7], [360, 10],
] as const;
const cut = (unit: string, radians = false) => makeTestTrace({
  units: { x: radians ? 'rad' : '°', y: unit },
  data: sweep.map(([angle, gain]) => ({ freq: radians ? angle * Math.PI / 180 : angle, amp: gain })),
});

it('resolves the main lobe across the 0° seam and finds the back gain and strongest secondary lobe', () => {
  const result = computeAntennaFarField(cut('dBi'));
  expect(result?.peak).toEqual({ freq: 0, amp: 10 });
  expect(result?.beam3).toMatchObject({ left: -10, right: 10, bandwidth: 20 });
  expect(result?.beam10).toMatchObject({ left: -30, right: 20, bandwidth: 50 });
  expect(result?.firstMinimumWidth).toBe(120);
  expect(result?.oppositeGain).toBe(-10);
  expect(result?.secondaryLobe).toEqual({ freq: 90, amp: 0 });
  expect(antennaBearing(-10)).toBe(350);
});

it('accepts radians, interpolates a dB crossing and handles full sweeps without an endpoint duplicate', () => {
  const radians = computeAntennaFarField(cut('dBd', true));
  expect(radians?.beam3?.bandwidth).toBeCloseTo(20);
  const trace = makeTestTrace({ units: { x: '°', y: 'dB' },
    data: [0, -2, -6, -20, -25, -20, -6, -2].map((amp, i) => ({ freq: i * 45, amp })) });
  const result = computeAntennaFarField(trace);
  expect(result?.beam3).toMatchObject({ left: -56.25, right: 56.25, bandwidth: 112.5 });
  expect(result?.oppositeGain).toBe(-25);
});

it('uses a power ratio for linear gain and keeps an actual zero in the calculation', () => {
  const trace = makeTestTrace({ units: { x: 'deg', y: 'linear' },
    data: [{ freq: -90, amp: 0 }, { freq: 0, amp: 1 }, { freq: 90, amp: 0 }, { freq: 180, amp: 0 }, { freq: 270, amp: 0 }] });
  const result = computeAntennaFarField(trace);
  expect(result?.beam3?.bandwidth).toBeCloseTo(180 * (1 - 10 ** -0.3));
  expect(result?.peak.amp).toBe(0);
  expect(result?.oppositeGain).toBe(-Infinity);
});

it('keeps the peak on partial cuts without estimating data outside the sweep', () => {
  const trace = cut('dBi');
  const result = computeAntennaFarField({ ...trace, data: trace.data.slice(0, 4) });
  expect(result).toMatchObject({ peak: { freq: 0, amp: 10 }, beam3: null, beam10: null, oppositeGain: undefined });
  expect(antennaFarFieldCapability(makeTestTrace())).toEqual({ allowed: false, reason: 'Antenna far-field analysis needs an angle on X.' });
  expect(antennaFarFieldCapability(cut('V')).allowed).toBe(false);
});
