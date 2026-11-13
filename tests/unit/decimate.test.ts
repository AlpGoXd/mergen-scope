import { describe, expect, it } from 'vitest';
import { decimateMinMax } from '../../src/domain/trace-math';
import { mergePaneData } from '../../src/domain/pane-data';
import type { DataPoint } from '../../src/types/trace';

describe('decimateMinMax', () => {
  const data: DataPoint[] = Array.from({ length: 100_000 }, (_, freq) => ({
    freq,
    amp: freq === 45_678 ? 1000 : freq === 54_321 ? -1000 : Math.sin(freq / 100),
  }));

  it('preserves spikes, visible endpoints, outside neighbors, order, and the size bound', () => {
    const buckets = 120;
    const result = decimateMinMax(data, 1000.5, 90000.5, buckets);
    expect(result).toContain(data[45_678]);
    expect(result).toContain(data[54_321]);
    expect(result).toContain(data[1000]);
    expect(result).toContain(data[1001]);
    expect(result).toContain(data[90000]);
    expect(result).toContain(data[90001]);
    expect(result.length).toBeLessThanOrEqual(2 * buckets + 4);
    expect(result.every((point, i) => i === 0 || point.freq >= (result[i - 1]?.freq ?? Infinity))).toBe(true);
  });

  it('returns small windows and their neighbors unchanged', () => {
    expect(decimateMinMax(data.slice(0, 10), 2, 5, 10)).toEqual(data.slice(1, 7));
    expect(decimateMinMax(data.slice(0, 10), 0, 9, 10)).toEqual(data.slice(0, 10));
  });

  it('handles empty data and invalid ranges', () => {
    expect(decimateMinMax([], 0, 1, 10)).toEqual([]);
    expect(decimateMinMax(data, 2, 1, 10)).toEqual([]);
    expect(decimateMinMax(data, NaN, 1, 10)).toEqual([]);
  });

  it('treats bucket counts below one as one', () => {
    expect(decimateMinMax(data, 0, 99999, 0).length).toBeLessThanOrEqual(6);
  });
});

describe('pane plot merge', () => {
  it('preserves full merge boundaries and extrema for two traces', () => {
    const traces = ['a', 'b'].map((name, traceIndex) => ({
      name,
      data: Array.from({ length: 10_000 }, (_, freq) => ({
        freq: freq + traceIndex * 0.25,
        amp: freq === 4000 ? -500 - traceIndex : freq === 6000 ? 500 + traceIndex : Math.sin(freq),
      })),
    }));
    const range = { left: 100.5, right: 9500.5 };
    const full = mergePaneData(traces, range, false);
    const plot = mergePaneData(traces, range, true);
    const amps = (rows: typeof full) => rows.flatMap(row => traces.flatMap(trace => {
      const amp = row[trace.name];
      return amp === undefined ? [] : [amp];
    }));
    expect(plot[0]?.fs).toBe(full[0]?.fs);
    expect(plot.at(-1)?.fs).toBe(full.at(-1)?.fs);
    expect(Math.min(...amps(plot))).toBe(Math.min(...amps(full)));
    expect(Math.max(...amps(plot))).toBe(Math.max(...amps(full)));
    expect(plot[0]?.a).toBe(full[0]?.a);
    expect(plot.at(-1)?.b).toBe(full.at(-1)?.b);
  });
});
