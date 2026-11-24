import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_OVERHEAD_FACTOR,
  BYTES_PER_POINT,
  LARGE_POINT_LIMIT,
  SOFT_POINT_LIMIT,
  TAB_HEAP_BYTES,
  formatBytes,
  pointBudget,
  recommendedDecimateFactor,
} from '../../src/domain/point-budget';

describe('point-budget', () => {
  it('exposes the required constants', () => {
    expect(SOFT_POINT_LIMIT).toBe(2_000_000);
    expect(LARGE_POINT_LIMIT).toBe(10_000_000);
    expect(BYTES_PER_POINT).toBe(48);
    expect(ANALYSIS_OVERHEAD_FACTOR).toBe(1.5);
    expect(TAB_HEAP_BYTES).toBe(4 * 1024 ** 3);
  });

  it('classifies point budget levels and exact boundaries', () => {
    expect(pointBudget(0)).toEqual({ totalPoints: 0, estimatedBytes: 0, level: 'ok' });
    expect(pointBudget(-10)).toEqual({ totalPoints: 0, estimatedBytes: 0, level: 'ok' });
    expect(pointBudget(Number.NaN)).toEqual({ totalPoints: 0, estimatedBytes: 0, level: 'ok' });
    expect(pointBudget(Number.POSITIVE_INFINITY)).toEqual({
      totalPoints: Number.POSITIVE_INFINITY,
      estimatedBytes: Number.POSITIVE_INFINITY,
      level: 'exceeds-tab',
    });

    expect(pointBudget(2_000_000)).toEqual({
      totalPoints: 2_000_000,
      estimatedBytes: Math.round(2_000_000 * 48 * 1.5),
      level: 'ok',
    });
    expect(pointBudget(2_000_000.9)).toEqual({
      totalPoints: 2_000_000,
      estimatedBytes: Math.round(2_000_000 * 48 * 1.5),
      level: 'ok',
    });
    expect(pointBudget(2_000_001).level).toBe('large');
    expect(pointBudget(10_000_000).level).toBe('large');
    expect(pointBudget(10_000_001).level).toBe('very-large');
    expect(pointBudget(59_652_323)).toEqual({
      totalPoints: 59_652_323,
      estimatedBytes: 4_294_967_256,
      level: 'very-large',
    });
    expect(pointBudget(59_652_324)).toEqual({
      totalPoints: 59_652_324,
      estimatedBytes: 4_294_967_328,
      level: 'exceeds-tab',
    });
  });

  it('formats byte counts cleanly with 1024-based units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 2)).toBe('1 MB');
    expect(formatBytes(144_000_000)).toBe('137.3 MB');
    expect(formatBytes(4 * 1024 ** 3)).toBe('4 GB');
    expect(formatBytes(1_800_000_000)).toBe('1.7 GB');
  });

  it('computes the smallest integer decimate factor keeping ceil(N / factor) <= limit', () => {
    expect(recommendedDecimateFactor(0)).toBe(1);
    expect(recommendedDecimateFactor(-5)).toBe(1);
    expect(recommendedDecimateFactor(Number.NaN)).toBe(1);
    expect(recommendedDecimateFactor(Number.POSITIVE_INFINITY)).toBe(1);
    expect(recommendedDecimateFactor(2_000_000)).toBe(1);
    expect(recommendedDecimateFactor(2_000_001)).toBe(2);
    expect(recommendedDecimateFactor(4_000_000)).toBe(2);
    expect(recommendedDecimateFactor(4_000_001)).toBe(3);
    expect(recommendedDecimateFactor(25_000_000)).toBe(13);
    expect(Math.ceil(25_000_000 / 13)).toBeLessThanOrEqual(SOFT_POINT_LIMIT);
    expect(Math.ceil(25_000_000 / 12)).toBeGreaterThan(SOFT_POINT_LIMIT);
    expect(recommendedDecimateFactor(105, 10)).toBe(11);
  });
});
