import { describe, expect, it } from 'vitest';
import { isUniformDataPoints } from '../../src/domain/interpolation';
import {
  boxcarDecimatePoints,
  defaultBinaryReduction,
  envelopeMinMaxPoints,
  reduceBinarySeries,
} from '../../src/domain/parsers/binary-reduce';

describe('binary-reduce', () => {
  it('chooses full for ok/large and decimate for very-large/exceeds-tab', () => {
    expect(defaultBinaryReduction(1_000_000)).toEqual({ mode: 'full' });
    expect(defaultBinaryReduction(2_000_000)).toEqual({ mode: 'full' });
    expect(defaultBinaryReduction(10_000_000)).toEqual({ mode: 'full' });
    expect(defaultBinaryReduction(25_000_000)).toEqual({ mode: 'decimate', factor: 13 });
    expect(defaultBinaryReduction(60_000_000)).toEqual({ mode: 'decimate', factor: 30 });
  });

  it('decodes all samples in full mode with uniform X spacing', () => {
    const res = reduceBinarySeries({
      count: 5,
      xStart: -1,
      dt: 0.25,
      readY: (i) => i * 2,
      reduction: { mode: 'full' },
    });
    expect(res.envelopeOf).toBeUndefined();
    expect(res.decimationNote).toBeNull();
    expect(res.isUniform).toBe(true);
    expect(res.points).toEqual([
      { freq: -1, amp: 0 },
      { freq: -0.75, amp: 2 },
      { freq: -0.5, amp: 4 },
      { freq: -0.25, amp: 6 },
      { freq: 0, amp: 8 },
    ]);
  });

  it('boxcar-decimates N->1 with exact block averages and uniform dt * N even with partial tail', () => {
    const ys = [1, 3, 5, 7, 9];
    const res = reduceBinarySeries({
      count: ys.length,
      xStart: 10,
      dt: 0.5,
      readY: (i) => ys[i] ?? 0,
      reduction: { mode: 'decimate', factor: 2 },
    });
    expect(res.envelopeOf).toBeUndefined();
    expect(res.isUniform).toBe(true);
    expect(res.points).toEqual([
      { freq: 10, amp: 2 },
      { freq: 11, amp: 6 },
      { freq: 12, amp: 9 },
    ]);
    expect(isUniformDataPoints(res.points)).toBe(true);
    expect(res.decimationNote).toContain('Boxcar decimated 2');

    // IEEE-754 floating-point origin and non-divisible length remain strictly uniform within 0.001 tolerance.
    const deep = reduceBinarySeries({
      count: 1003,
      xStart: -0.001234567,
      dt: 1e-9,
      readY: (i) => Math.sin(i * 0.01),
      reduction: { mode: 'decimate', factor: 7 },
    });
    expect(deep.points).toHaveLength(Math.ceil(1003 / 7));
    expect(deep.isUniform).toBe(true);
    expect(isUniformDataPoints(deep.points)).toBe(true);
  });

  it('produces min-max display envelopes with <= targetPoints and explicit envelopeOf count', () => {
    const ys = Array.from({ length: 1000 }, (_, i) => (i === 412 ? 99 : i === 413 ? -55 : 0));
    const res = reduceBinarySeries({
      count: ys.length,
      xStart: 0,
      dt: 1e-6,
      readY: (i) => ys[i] ?? 0,
      reduction: { mode: 'envelope', targetPoints: 100 },
    });
    expect(res.points.length).toBeLessThanOrEqual(100);
    expect(res.isUniform).toBe(false);
    expect(res.envelopeOf).toBe(1000);
    expect(res.decimationNote).toContain('Min-max reduced');
    expect(res.points.some((p) => p.amp === 99)).toBe(true);
    expect(res.points.some((p) => p.amp === -55)).toBe(true);

    // Envelope below targetPoints returns full samples without envelopeOf marker.
    const small = reduceBinarySeries({
      count: 50,
      xStart: 0,
      dt: 1e-6,
      readY: (i) => i,
      reduction: { mode: 'envelope', targetPoints: 100 },
    });
    expect(small.points).toHaveLength(50);
    expect(small.envelopeOf).toBeUndefined();
    expect(small.isUniform).toBe(true);
  });

  it('supports array helpers boxcarDecimatePoints and envelopeMinMaxPoints', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ freq: i * 10, amp: i }));
    const boxcar = boxcarDecimatePoints(pts, 4);
    expect(boxcar.points).toEqual([
      { freq: 0, amp: 1.5 },
      { freq: 40, amp: 5.5 },
      { freq: 80, amp: 9.5 },
      { freq: 120, amp: 13.5 },
      { freq: 160, amp: 17.5 },
    ]);
    expect(boxcar.isUniform).toBe(true);
    expect(boxcar.envelopeOf).toBeUndefined();

    const env = envelopeMinMaxPoints(pts, 8);
    expect(env.points.length).toBeLessThanOrEqual(8);
    expect(env.envelopeOf).toBe(20);
    expect(env.isUniform).toBe(false);
  });
});
