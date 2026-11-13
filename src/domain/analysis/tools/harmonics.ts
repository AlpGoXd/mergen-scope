import type { AnalysisTool, OverlayShape, ParameterValues } from '../../../types/registry-contract';
import type { Trace } from '../../../types/trace';
import { normalizeUnitName } from '../../units';
import { measureTones } from '../tone-metrics';
import type { ToneSpectrum } from '../tone-metrics';
import { allowed, denied } from './shared';

const params = {
  harmonics: { kind: 'choice', title: 'Harmonics', defaultValue: 'h5', options: ['h5', 'h10', 'all'] },
  fundamental: { kind: 'choice', title: 'Fundamental', defaultValue: 'auto', options: ['auto', 'near'] },
  fundamentalHz: { kind: 'number', title: 'Near', defaultValue: 0, min: 0, shownWhen: { key: 'fundamental', values: ['near'] } },
} as const;
export const HARMONICS_DEFAULTS: ParameterValues<typeof params> = { harmonics: 'h5', fundamental: 'auto', fundamentalHz: 0 };

type UnitKind = 'log' | 'volts' | 'watts';
/** How a y unit maps to power: dB units, volts (power ∝ V²) or watts; a density keeps its per-Hz suffix. */
export function spectrumUnit(unit: string | null | undefined): { kind: UnitKind; density: boolean; toneUnit: string } | null {
  const raw = String(unit ?? '').trim();
  const u = normalizeUnitName(raw);
  const density = /\/(hz|√hz|rthz|sqrt\(hz\))$/.test(u);
  const base = u.replace(/\/(hz|√hz|rthz|sqrt\(hz\))$/, '');
  const toneUnit = raw.replace(/\s*\/\s*(Hz|√Hz|rtHz|sqrt\(Hz\))$/i, '');
  if (base.startsWith('db')) return { kind: 'log', density, toneUnit };
  if (['v', 'mv', 'uv', 'µv', 'μv', 'kv'].includes(base)) return { kind: 'volts', density, toneUnit };
  if (['w', 'mw', 'uw', 'µw', 'μw'].includes(base)) return { kind: 'watts', density, toneUnit };
  return null;
}

const toPower = (kind: UnitKind, value: number) => kind === 'log' ? 10 ** (value / 10) : kind === 'volts' ? value * value : value;
const fromPower = (kind: UnitKind, power: number) => kind === 'log' ? 10 * Math.log10(Math.max(power, 1e-300)) : kind === 'volts' ? Math.sqrt(power) : power;

/** FFT window facts carried by a spectrum this app created, if any. */
function fftFacts(trace: Trace): ToneSpectrum['fft'] {
  const fft = trace.parameters?.['fft'];
  if (typeof fft !== 'object' || fft === null) return null;
  const { enbw, lobe, sampleRate, binHz } = fft as Record<string, unknown>;
  return [enbw, lobe, sampleRate, binHz].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)
    ? { enbw: enbw as number, lobe: lobe as number, sampleRate: sampleRate as number, binHz: binHz as number }
    : null;
}

const isSpectrum = (trace: Trace) => trace.domain === 'frequency' && trace.family === 'spectrum';

export const harmonicsTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'harmonics', title: 'Harmonics', description: 'Fundamental, harmonics, THD, THD+N, SNR, SINAD, ENOB and SFDR of one tone.' }, params,
  parameterUnits: { fundamentalHz: 'Hz' },
  outputs: [{ type: 'numbers' }, { type: 'shapes' }],
  appliesTo: trace => !isSpectrum(trace) ? denied('Select a spectrum trace.') : spectrumUnit(trace.units.y) ? allowed : denied('Select a spectrum in dB, V or W units.'),
  compute: ({ traces }, p) => {
    const trace = traces[0];
    const unit = trace ? spectrumUnit(trace.units.y) : null;
    if (!trace || !unit || trace.data.length < 3) return [];
    const fft = fftFacts(trace);
    // A density from an FFT goes back to power per bin (× ENBW·Δf) so tones and noise add up as in the FFT card.
    const perBin = unit.density && fft ? fft.enbw * fft.binHz : 1;
    const spec: ToneSpectrum = { freqs: trace.data.map(point => point.freq), power: trace.data.map(point => toPower(unit.kind, point.amp) * perBin), fft };
    const r = measureTones(spec, { harmonics: p.harmonics === 'all' ? 'all' : p.harmonics === 'h10' ? 10 : 5, nearHz: p.fundamental === 'near' ? p.fundamentalHz : null });
    if (!r) return [];
    const values: Record<string, number> = {
      f0: r.fundamental.freq, f0Level: fromPower(unit.kind, r.fundamental.power), count: r.harmonics.length,
      thd: r.thd, thdDb: r.thdDb, thdn: r.thdn ?? NaN, snr: r.snr ?? NaN, sinad: r.sinad ?? NaN, enob: r.enob ?? NaN,
      sfdr: r.sfdr, spurHz: r.spur?.freq ?? NaN,
      // The noise floor stays in the trace's own unit: per bin, or per Hz for a density.
      noiseFloor: fromPower(unit.kind, r.noiseFloor / perBin),
    };
    for (const h of r.harmonics) { values[`h${h.order}`] = h.dBc; values[`h${h.order}Hz`] = h.freq; values[`h${h.order}Aliased`] = h.aliased ? 1 : 0; }
    const at = (index: number) => trace.data[index];
    const shapes: OverlayShape[] = [];
    const f = at(r.fundamental.index);
    if (f) shapes.push({ kind: 'triangle', x: f.freq, y: f.amp, n: 1 });
    for (const h of r.harmonics) { const point = at(h.index); if (point) shapes.push({ kind: 'triangle', x: point.freq, y: point.amp, n: h.order }); }
    const spur = r.spur ? at(r.spur.index) : undefined;
    if (spur) shapes.push({ kind: 'dot', x: spur.freq, y: spur.amp });
    return [{ type: 'numbers', values }, ...(shapes.length ? [{ type: 'shapes' as const, shapes }] : [])];
  },
};
