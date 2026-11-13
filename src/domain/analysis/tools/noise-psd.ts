import type { AnalysisTool } from '../../../types/registry-contract';
import { noisePSD } from '../noise-psd';
import { computeRangeStats } from '../range-stats';
import { allowed, denied } from './shared';

const params = { filter: { kind: 'choice', title: 'Filter', defaultValue: 'gaussian', options: ['gaussian', 'flattop', 'fivepole'] } } as const;
export const noisePsdTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'noise-psd', title: 'Noise PSD', description: 'Estimate noise spectral density.' }, params,
  outputs: [{ type: 'numbers' }, { type: 'overlay' }], appliesTo: trace => trace.family === 'spectrum' ? allowed : denied('Select a spectrum trace.'),
  compute: ({ traces }, p) => {
    const data = traces[0]?.data ?? [];
    const deltas = data.slice(1).map((point, i) => point.freq - (data[i]?.freq ?? point.freq)).filter(d => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
    const rbw = deltas[Math.floor(deltas.length / 2)] ?? 1;
    const density = noisePSD(data, rbw, p.filter);
    const stats = computeRangeStats(density);
    return stats ? [{ type: 'numbers', values: { peak: stats.max.amp, avg: stats.average, min: stats.min.amp, rbw } }, { type: 'overlay', points: density.map(point => ({ x: point.freq, y: point.amp })) }] : [];
  },
};
