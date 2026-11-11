import { expect, it } from 'vitest';
import { smithLinkedBand, smithMarkerFrequency, smithTraceSamples } from '../../src/domain/smith-pane-model';
import type { RawTrace } from '../../src/types/trace';
import { makeTestTrace } from './helpers';

it('extracts reflection samples and renormalises them to the pane impedance', () => {
  const trace: RawTrace = {
    ...makeTestTrace(), kind: 'raw', operationType: null,
    networkSource: { family: 'S', row: 0, col: 0 },
    touchstoneNetwork: { parameterType: 'S', portCount: 1, referenceOhms: [75], freqUnit: 'Hz', dataFormat: 'RI', comments: [], matrixFormat: 'full', version: 1,
      samples: [{ freq: 100, sMatrix: [[{ re: 0, im: 0 }]] }, { freq: 200, sMatrix: [[{ re: 1, im: 0 }]] }] },
  };
  expect(smithTraceSamples(trace)).toEqual({ z0: 75, shortName: 'S11', samples: [{ frequencyHz: 100, gamma: { re: 0, im: 0 } }, { frequencyHz: 200, gamma: { re: 1, im: 0 } }] });
  const converted = smithTraceSamples(trace, 50);
  expect(converted?.z0).toBe(50);
  expect(converted?.samples[0]?.gamma.re).toBeCloseTo(0.2);
  expect(converted?.samples[1]?.gamma.re).toBe(1);
  expect(smithTraceSamples({ ...trace, networkSource: { family: 'S', row: 0, col: 1 } })).toBeNull();
});

it('passes only a linked visible X range as a Smith band', () => {
  const traces = [{ samples: [{ frequencyHz: 1e9, gamma: { re: 0, im: 0 } }, { frequencyHz: 2e9, gamma: { re: 0, im: 0 } }] }];
  expect(smithLinkedBand(true, { left: 1.2e9, right: 1.8e9 }, traces)).toEqual({ minHz: 1.2e9, maxHz: 1.8e9 });
  expect(smithLinkedBand(true, { left: 0, right: 1 }, traces)).toBeNull();
  expect(smithLinkedBand(true, { left: 0, right: 3e9 }, traces)).toBeNull();
  expect(smithLinkedBand(false, { left: 1.2e9, right: 1.8e9 }, traces)).toBeNull();
  expect(smithLinkedBand(true, null, traces)).toBeNull();
});

it('retains singular and missing samples as gaps', () => {
  const trace: RawTrace = { ...makeTestTrace(), kind: 'raw', operationType: null, networkSource: { family: 'S', row: 0, col: 0 },
    touchstoneNetwork: { parameterType: 'S', portCount: 1, referenceOhms: [75], freqUnit: 'Hz', dataFormat: 'RI', comments: [], matrixFormat: 'full', version: 1,
      samples: [{ freq: 1, sMatrix: [[{ re: 0, im: 0 }]] }, { freq: 2, sMatrix: [[{ re: -5, im: 0 }]] }, { freq: 3, sMatrix: [[]] }, { freq: 4, sMatrix: [[{ re: 0.5, im: 0 }]] }] } };
  const samples = smithTraceSamples(trace, 50)?.samples;
  expect(samples).toHaveLength(4);
  expect(samples?.[1]?.gamma.re).toBeNaN();
  expect(samples?.[2]?.gamma.re).toBeNaN();
});

it('uses magnetic snapping and respects exact and snap interpolation', () => {
  const click = { frequencyHz: 15, sampleFrequencyHz: 10, sampleDistancePx: 10 };
  expect(smithMarkerFrequency(makeTestTrace({ interpolation: 'linear' }), click)).toBe(10);
  expect(smithMarkerFrequency(makeTestTrace({ interpolation: 'linear' }), { ...click, sampleDistancePx: 10.1 })).toBe(15);
  expect(smithMarkerFrequency(makeTestTrace({ interpolation: 'linear' }), { frequencyHz: 15, sampleFrequencyHz: 10 })).toBe(15);
  for (const interpolation of ['snap', 'exact'] as const) expect(smithMarkerFrequency(makeTestTrace({ interpolation }), { ...click, sampleDistancePx: 30 })).toBe(10);
});
