import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BINARY_SNIFF_BYTES, classifyBinaryConfidence, detectBinarySignature, scopeFormatLabel } from '../../src/domain/parsers/binary-detect';
import { parseTekWfm, probeTekWfmPoints, tekWfmLayout } from '../../src/domain/parsers/tek-wfm';
import type { TekWfmVersion } from '../../src/domain/parsers/tek-wfm';
import { defaultBinaryConfig, parseBinarySettings, parseBinaryWithConfig, previewBinaryImport } from '../../src/domain/parsers/raw-binary';
import { classifyReadBinary } from '../../src/domain/open-file-read';
import { resetParserFileCounter } from '../../src/domain/parsers/rs-dat';

function readArrayBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const fixture = (name: string): ArrayBuffer => readArrayBuffer(`tests/fixtures/tek-wfm/${name}.wfm`);
const sniff = (ab: ArrayBuffer): Uint8Array => new Uint8Array(ab, 0, Math.min(ab.byteLength, BINARY_SNIFF_BYTES));

/** Indexed read that fails the test instead of silencing `noUncheckedIndexedAccess` with `!`. */
function at(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`no value at index ${index} (length ${values.length})`);
  return value;
}

function mustParse(ab: ArrayBuffer, name = 'x.wfm', options?: Parameters<typeof parseTekWfm>[2]) {
  resetParserFileCounter();
  const res = parseTekWfm(ab, name, options);
  if (!res.ok) throw new Error(`expected ok parse, got: ${res.error}`);
  const trace = res.parsed.traces[0];
  if (!trace) throw new Error('no trace');
  return { res, trace, amps: trace.data.map(p => p.amp), xs: trace.data.map(p => p.freq) };
}

function stats(values: readonly number[]) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / values.length };
}

function expectCloseList(actual: readonly number[], expected: readonly number[], digits = 12): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
}

// ---------------------------------------------------------------------------
// Synthetic WFM builder (independent of the decoder: absolute offsets come from the spec table)
// ---------------------------------------------------------------------------

type Kind = 'int16' | 'int32' | 'uint32' | 'fp32' | 'fp64' | 'uint8' | 'int8';
const KIND_BYTES: Record<Kind, number> = { int16: 2, int32: 4, uint32: 4, fp32: 4, fp64: 8, uint8: 1, int8: 1 };
const KIND_CODE_V12: Partial<Record<Kind, number>> = { int16: 0, int32: 1, uint32: 2, fp32: 4, fp64: 5 };
const KIND_CODE_V3: Record<Kind, number> = { int16: 0, int32: 1, uint32: 2, fp32: 4, fp64: 5, uint8: 6, int8: 7 };

/** Absolute header offsets from the Tektronix manual (v1 table, shifted +2 in v2 and by the wider user views in v3). */
const SPEC_OFFSETS: Record<TekWfmVersion, { exp: number; imp: number; upd: number; cur: number; end: number }> = {
  1: { exp: 0x0a6, imp: 0x1de, upd: 0x2fe, cur: 0x316, end: 0x334 },
  2: { exp: 0x0a8, imp: 0x1e0, upd: 0x300, cur: 0x318, end: 0x336 },
  3: { exp: 0x0a8, imp: 0x1e8, upd: 0x310, cur: 0x328, end: 0x346 },
};

function writeRaw(view: DataView, pos: number, kind: Kind, le: boolean, value: number): void {
  switch (kind) {
    case 'int8': view.setInt8(pos, value); break;
    case 'uint8': view.setUint8(pos, value); break;
    case 'int16': view.setInt16(pos, value, le); break;
    case 'int32': view.setInt32(pos, value, le); break;
    case 'uint32': view.setUint32(pos, value, le); break;
    case 'fp32': view.setFloat32(pos, value, le); break;
    case 'fp64': view.setFloat64(pos, value, le); break;
  }
}

interface BuildOptions {
  readonly version?: TekWfmVersion;
  readonly le?: boolean;
  readonly kind?: Kind;
  /** Override the explicit-dim format code (for invalid / unsupported codes). */
  readonly formatCode?: number;
  readonly values?: readonly number[];
  readonly pre?: number;
  readonly post?: number;
  readonly yScale?: number;
  readonly yOffset?: number;
  readonly yUnit?: string;
  readonly xScale?: number;
  readonly xOffset?: number;
  readonly xUnit?: string;
  readonly tt?: number;
  readonly nValue?: number;
  readonly overRange?: number;
  readonly underRange?: number;
  readonly extraFrames?: number;
  readonly dataType?: number;
  readonly storage?: number;
  readonly label?: string;
  readonly summaryFrame?: number;
  readonly trailing?: number;
}

function buildWfm(opts: BuildOptions = {}): ArrayBuffer {
  const version = opts.version ?? 3;
  const le = opts.le ?? true;
  const kind = opts.kind ?? 'int16';
  const bpp = KIND_BYTES[kind];
  const values = opts.values ?? [1, 2, 3, 4, 5, 6, 7, 8];
  const pre = opts.pre ?? 0;
  const post = opts.post ?? 0;
  const extra = opts.extraFrames ?? 0;
  const o = SPEC_OFFSETS[version];
  const curveOffset = o.end + extra * 54;
  const curveBytes = (pre + values.length + post) * bpp;
  const total = curveOffset + curveBytes + 8 + (opts.trailing ?? 0);
  const ab = new ArrayBuffer(total);
  const view = new DataView(ab);
  const u8 = new Uint8Array(ab);
  const ascii = (pos: number, text: string) => { for (let i = 0; i < text.length; i++) u8[pos + i] = text.charCodeAt(i); };

  u8[0] = le ? 0x0f : 0xf0;
  u8[1] = le ? 0x0f : 0xf0;
  ascii(2, `:WFM#00${version}`);
  u8[0x0f] = bpp;
  view.setInt32(0x10, curveOffset, le);
  ascii(0x28, opts.label ?? '');
  view.setUint32(0x48, extra, le);
  view.setUint16(0x4c, 512, le);
  view.setInt32(0x4e, extra > 0 ? 1 : 0, le);
  view.setUint32(0x72, 1, le);
  view.setUint32(0x76, 1, le);
  view.setInt32(0x7a, opts.dataType ?? 2, le);
  if (version >= 2) view.setUint16(0x9a, opts.summaryFrame ?? 0, le);

  view.setFloat64(o.exp, opts.yScale ?? 1, le);
  view.setFloat64(o.exp + 8, opts.yOffset ?? 0, le);
  ascii(o.exp + 20, opts.yUnit ?? 'V');
  const code = opts.formatCode ?? (version >= 3 ? KIND_CODE_V3[kind] : KIND_CODE_V12[kind]);
  if (code === undefined) throw new Error(`kind ${kind} does not exist in WFM#00${version}`);
  view.setInt32(o.exp + 72, code, le);
  view.setInt32(o.exp + 76, opts.storage ?? 0, le);
  if (opts.nValue !== undefined) writeRaw(view, o.exp + 80, kind, le, opts.nValue);
  if (opts.overRange !== undefined) writeRaw(view, o.exp + 84, kind, le, opts.overRange);
  if (opts.underRange !== undefined) writeRaw(view, o.exp + 88, kind, le, opts.underRange);

  view.setFloat64(o.imp, opts.xScale ?? 1e-3, le);
  view.setFloat64(o.imp + 8, opts.xOffset ?? 0, le);
  view.setUint32(o.imp + 16, values.length, le);
  ascii(o.imp + 20, opts.xUnit ?? 's');

  view.setFloat64(o.upd + 4, opts.tt ?? 0, le);
  view.setUint32(o.cur + 10, 0, le);
  view.setUint32(o.cur + 14, pre * bpp, le);
  view.setUint32(o.cur + 18, (pre + values.length) * bpp, le);
  view.setUint32(o.cur + 22, (pre + values.length + post) * bpp, le);
  view.setUint32(o.cur + 26, (pre + values.length + post) * bpp, le);

  // Padding samples are a distinctive value that must never reach the trace.
  for (let i = 0; i < pre; i++) writeRaw(view, curveOffset + i * bpp, kind, le, 99);
  values.forEach((v, i) => writeRaw(view, curveOffset + (pre + i) * bpp, kind, le, v));
  for (let i = 0; i < post; i++) writeRaw(view, curveOffset + (pre + values.length + i) * bpp, kind, le, 99);
  return ab;
}

/** Copy `ab` and apply `patch` to the copy. */
function mutate(ab: ArrayBuffer, patch: (view: DataView, u8: Uint8Array) => void): ArrayBuffer {
  const copy = ab.slice(0);
  patch(new DataView(copy), new Uint8Array(copy));
  return copy;
}

const ramp = (n: number, from = 0): number[] => Array.from({ length: n }, (_, i) => from + i);

// ---------------------------------------------------------------------------

describe('Tektronix .wfm: header layout', () => {
  it('walks the per-version structure sizes to the documented absolute offsets', () => {
    for (const version of [1, 2, 3] as const) {
      const spec = SPEC_OFFSETS[version];
      expect(tekWfmLayout(version)).toEqual({
        expDim1: spec.exp,
        impDim1: spec.imp,
        updateSpec1: spec.upd,
        curveObject1: spec.cur,
        headerEnd: spec.end,
      });
    }
    // Verified on real WFM#003 files.
    expect(tekWfmLayout(3)).toEqual({ expDim1: 0x0a8, impDim1: 0x1e8, updateSpec1: 0x310, curveObject1: 0x328, headerEnd: 838 });
  });

  it('places the FastFrame curve buffer after the 54-byte-per-frame tables', () => {
    const ab = fixture('FF5MhzX100From5Series');
    const view = new DataView(ab);
    expect(view.getUint32(0x48, true)).toBe(99);
    expect(view.getInt32(0x10, true)).toBe(838 + 99 * 54);
    expect(view.getInt32(0x10, true)).toBe(6184);
  });
});

describe('Tektronix .wfm: detection', () => {
  it('detects both byte orders and keeps ISF and other formats separate', () => {
    expect(detectBinarySignature(sniff(buildWfm({ le: true })))).toBe('tek-wfm');
    expect(detectBinarySignature(sniff(buildWfm({ le: false })))).toBe('tek-wfm');
    expect(detectBinarySignature(sniff(readArrayBuffer('test files/tektronix_sample.isf')))).toBe('tek-isf');

    const marker = (b0: number, b1: number, tag: string) => {
      const bytes = new Uint8Array(16);
      bytes[0] = b0;
      bytes[1] = b1;
      for (let i = 0; i < tag.length; i++) bytes[2 + i] = tag.charCodeAt(i);
      return bytes;
    };
    expect(detectBinarySignature(marker(0x0f, 0x0f, ':WFM#003'))).toBe('tek-wfm');
    expect(detectBinarySignature(marker(0xf0, 0xf0, ':WFM#001'))).toBe('tek-wfm');
    expect(detectBinarySignature(marker(0x0f, 0xf0, ':WFM#003'))).toBeNull();
    expect(detectBinarySignature(marker(0x12, 0x12, ':WFM#003'))).toBeNull();
    expect(detectBinarySignature(marker(0x0f, 0x0f, 'XWFM#003'))).toBeNull();
    expect(detectBinarySignature(new Uint8Array([0x0f, 0x0f, 0x3a, 0x57, 0x46, 0x4d, 0x23]))).toBeNull();
  });

  it('labels the format and scores a forced parser override like the other scope formats', () => {
    expect(scopeFormatLabel('tek-wfm')).toBe('Tektronix (.wfm)');
    const confidence = classifyBinaryConfidence({ mode: 'auto-scope', detectedScope: 'tek-wfm', fileName: 'a.wfm' });
    expect(confidence.level).toBe('high');
    expect(confidence.label).toBe('Tektronix (.wfm)');
  });
});

describe('Tektronix .wfm: real instrument files', () => {
  it('golden_analog: 6 int16 points, sample 0 shifted by the trigger fraction', () => {
    const ab = fixture('golden_analog');
    expect(detectBinarySignature(sniff(ab))).toBe('tek-wfm');
    expect(probeTekWfmPoints(ab)).toEqual({ ok: true, totalPoints: 6 });

    const { res, trace, amps, xs } = mustParse(ab, 'golden_analog.wfm');
    expect(res.parsed.format).toBe('tek-wfm');
    expect(trace.data).toHaveLength(6);
    expect(trace.units).toEqual({ x: 's', y: 'V' });
    expect(trace.domain).toBe('time');
    // tm_data_types puts x[0] at -3.0 (ignores tt); the instrument convention adds tt (0.5) * dt.
    expect(xs[0]).toBeCloseTo(-2.5, 14);
    expect(at(xs, 5) - at(xs, 0)).toBeCloseTo(5, 14);
    expectCloseList(amps.slice(0, 5), [0.0003051850947599719, 0.0003357036042359691, 0.0003662221137119663, 0.9833674123355816, 0.9833979308450576]);
    expect(amps[5]).toBeCloseTo(0.9834284493545336, 12);
    const s = stats(amps);
    expect(s.min).toBeCloseTo(0.0003051850947599719, 12);
    expect(s.max).toBeCloseTo(0.9834284493545336, 12);
    expect(s.mean).toBeCloseTo(0.49186681722464676, 12);
    expect(res.parsed.meta['Sample Rate']).toEqual({ value: 1, unit: 'Hz' });
  });

  it('data_test_waveform: 1000 points, dt 40 ps', () => {
    const ab = fixture('data_test_waveform');
    expect(probeTekWfmPoints(ab)).toEqual({ ok: true, totalPoints: 1000 });
    const { trace, amps, xs } = mustParse(ab, 'data_test_waveform.wfm');
    const tt = new DataView(ab).getFloat64(0x314, true);
    expect(trace.data).toHaveLength(1000);
    expect(trace.units).toEqual({ x: 's', y: 'V' });
    expect(Math.abs(at(xs, 0) - (-2e-8 + tt * 4e-11))).toBeLessThan(1e-15);
    expect(Math.abs(at(xs, 999) - (-2e-8 + (999 + tt) * 4e-11))).toBeLessThan(1e-15);
    expect(at(xs, 1) - at(xs, 0)).toBeCloseTo(4e-11, 20);
    expectCloseList(amps.slice(0, 5), [-0.004, -0.004, -0.004, 0, 0]);
    expectCloseList(amps.slice(-5), [-0.012, -0.012, -0.008, -0.008, -0.008]);
    const s = stats(amps);
    expect(s.min).toBeCloseTo(-0.252, 12);
    expect(s.max).toBeCloseTo(0.244, 12);
    expect(s.mean).toBeCloseTo(-0.002752, 10);
  });

  it('analog_waveform: 50000 points; pre/postcharge padding excluded; x matches the MSO64 CSV export', () => {
    const ab = fixture('analog_waveform');
    expect(probeTekWfmPoints(ab)).toEqual({ ok: true, totalPoints: 50000 });
    const { res, trace, amps, xs } = mustParse(ab, 'analog_waveform.wfm');
    expect(trace.data).toHaveLength(50000);
    expect(trace.units).toEqual({ x: 's', y: 'V' });
    // Instrument CSV rows (9 significant digits).
    const csv: readonly [number, number, number][] = [[0, -9.99966406e-07, -0.148], [1, -9.99926406e-07, -0.148], [2, -9.99886406e-07, -0.152], [49999, 9.99993594e-07, 0.144]];
    for (const [index, x, y] of csv) {
      expect(Math.abs(at(xs, index) - x)).toBeLessThan(1e-15);
      expect(amps[index]).toBeCloseTo(y, 12);
    }
    expectCloseList(amps.slice(0, 5), [-0.148, -0.148, -0.152, -0.152, -0.152]);
    expectCloseList(amps.slice(-5), [0.144, 0.144, 0.144, 0.144, 0.144]);
    const s = stats(amps);
    expect(s.min).toBeCloseTo(-0.152, 12);
    expect(s.max).toBeCloseTo(0.144, 12);
    expect(s.mean).toBeCloseTo(-0.0029832, 9);
    expect(res.parsed.meta['Points']).toBe('50000');
    expect(res.parsed.meta['Encoding']).toBe('Int16 (LE)');
    expect(res.parsed.meta['Frames']).toBeUndefined();
  });

  it('FastFrame set: imports frame 1 only and says so', () => {
    const ab = fixture('FF5MhzX100From5Series');
    expect(probeTekWfmPoints(ab)).toEqual({ ok: true, totalPoints: 2500 });
    const { res, trace, amps, xs } = mustParse(ab, 'FF5MhzX100From5Series.wfm');
    expect(trace.data).toHaveLength(2500);
    expect(Math.abs(at(xs, 0) - (-1.9984e-07))).toBeLessThan(1e-15);
    expect(at(xs, 1) - at(xs, 0)).toBeCloseTo(1.6e-10, 20);
    expectCloseList(amps.slice(0, 5), [0, 0.004, 0.008, 0.008, 0.012]);
    expectCloseList(amps.slice(-5), [-0.004, -0.004, -0.004, 0, 0]);
    const s = stats(amps);
    expect(s.min).toBeCloseTo(-0.268, 12);
    expect(s.max).toBeCloseTo(0.264, 12);
    expect(s.mean).toBeCloseTo(-0.0014832, 10);
    expect(res.summaryText).toMatch(/frame 1 of 100/);
    expect(res.parsed.meta['Frames']).toBe('100');
    expect(res.parsed.meta['Frame Imported']).toBe('frame 1 of 100');
    expect(trace.dn).toContain('frame 1 of 100');
    expect(res.parsed.meta['Encoding']).toBe('Int8 (LE)');
  });

  it('opens the real files through classifyReadBinary as one trace with the raw buffer kept', () => {
    for (const name of ['golden_analog', 'data_test_waveform', 'analog_waveform', 'FF5MhzX100From5Series']) {
      const ab = fixture(name);
      const read = classifyReadBinary(`${name}.wfm`, ab, `id-${name}`);
      expect(read.kind).toBe('data');
      if (read.kind !== 'data' || !read.input.parsed) throw new Error(`no parse for ${name}`);
      expect(read.input.parsed.format).toBe('tek-wfm');
      expect(read.input.parsed.traces).toHaveLength(1);
      expect(read.input.parsed.displayTraces).toHaveLength(1);
      expect(read.input.rawBinary).toBe(ab);
      expect(read.input.binaryConfig?.mode).toBe('auto-scope');
    }
  });

  it('rejects digital (MSO) and I/Q-or-min/max waveforms with specific messages and routes them to the binary wizard', () => {
    const digital = fixture('digital_waveform');
    const iq = fixture('iq_waveform');
    const digitalRes = parseTekWfm(digital, 'digital_waveform.wfm');
    const iqRes = parseTekWfm(iq, 'iq_waveform.wfm');
    expect(digitalRes.ok).toBe(false);
    expect(iqRes.ok).toBe(false);
    if (digitalRes.ok || iqRes.ok) return;
    expect(digitalRes.error).toMatch(/digital/i);
    expect(iqRes.error).toMatch(/I\/Q/);
    expect(iqRes.error).toMatch(/min\/max/);
    expect(probeTekWfmPoints(digital).ok).toBe(false);
    expect(probeTekWfmPoints(iq).ok).toBe(false);

    for (const [name, ab, message] of [['digital_waveform', digital, digitalRes.error], ['iq_waveform', iq, iqRes.error]] as const) {
      const read = classifyReadBinary(`${name}.wfm`, ab, `id-${name}`);
      expect(read.kind).toBe('data');
      if (read.kind !== 'data') return;
      expect(read.input.parsed?.format).toBe('needs-binary-wizard');
      expect(read.input.binaryWarning).toBe(message);
      expect(read.input.rawBinary).toBe(ab);
    }
  });
});

describe('Tektronix .wfm: synthetic files (per-version offsets, byte order, curve formats)', () => {
  const cases = ([1, 2, 3] as const).flatMap((version) => [true, false].map((le) => [version, le] as const));

  it.each(cases)('WFM#00%i little-endian=%s: header fields land at the right offsets', (version, le) => {
    const values = [-3, -2, -1, 0, 1, 2, 3, 4];
    const ab = buildWfm({ version, le, values, pre: 3, post: 2, yScale: 0.5, yOffset: 1, xScale: 1e-3, xOffset: -0.01, tt: 0.25, label: 'CH7', yUnit: 'A', xUnit: 's' });
    expect(detectBinarySignature(sniff(ab))).toBe('tek-wfm');
    expect(probeTekWfmPoints(ab)).toEqual({ ok: true, totalPoints: 8 });
    const { res, trace, amps, xs } = mustParse(ab, 'syn.wfm');
    expectCloseList(amps, values.map(v => v * 0.5 + 1));
    xs.forEach((x, i) => expect(Math.abs(x - (-0.01 + (i + 0.25) * 1e-3))).toBeLessThan(1e-15));
    expect(trace.units).toEqual({ x: 's', y: 'A' });
    expect(trace.dn).toBe('syn.wfm CH7');
    expect(res.parsed.meta['Format']).toContain(`WFM#00${version}`);
    expect(res.parsed.meta['Encoding']).toBe(`Int16 (${le ? 'LE' : 'BE'})`);
    expect(res.parsed.meta['Points']).toBe('8');
  });

  it('ignores a trailing tekmeta/marks block and extra bytes after the checksum', () => {
    const ab = buildWfm({ values: ramp(10), trailing: 500 });
    expect(mustParse(ab).trace.data).toHaveLength(10);
  });

  it('defaults the label and keeps an empty Y unit unitless', () => {
    const { trace } = mustParse(buildWfm({ yUnit: '' }), 'a.wfm');
    expect(trace.dn).toBe('a.wfm CH1');
    expect(trace.units.y).toBeNull();
  });

  it('reports Hz-based waveforms as frequency-domain spectra', () => {
    const { trace, res } = mustParse(buildWfm({ xUnit: 'Hz', xScale: 1000, xOffset: 0, yUnit: 'dBm' }));
    expect(trace.domain).toBe('frequency');
    expect(trace.family).toBe('spectrum');
    expect(res.parsed.meta['Sample Rate']).toBeUndefined();
  });

  it('records a summary-frame type in WFM#002/#003 only', () => {
    expect(mustParse(buildWfm({ version: 3, summaryFrame: 1 })).res.parsed.meta['Summary Frame']).toBe('Average');
    expect(mustParse(buildWfm({ version: 2, summaryFrame: 2 })).res.parsed.meta['Summary Frame']).toBe('Envelope');
    expect(mustParse(buildWfm({ version: 1 })).res.parsed.meta['Summary Frame']).toBeUndefined();
  });

  const formatCases: readonly [Kind, number[]][] = [
    ['int8', [-128, -1, 0, 127]],
    ['uint8', [0, 1, 128, 255]],
    ['int16', [-32768, -1, 0, 32767]],
    ['int32', [-2147483648, -1, 0, 2147483647]],
    ['uint32', [0, 1, 2147483648, 4294967295]],
    ['fp32', [-1.5, 0, 2.25, 1000]],
    ['fp64', [-1.5, 0, 2.25, 1e300]],
  ];

  it.each(formatCases)('decodes %s samples in WFM#003, little- and big-endian', (kind, values) => {
    for (const le of [true, false]) {
      const { amps, res } = mustParse(buildWfm({ kind, le, values, pre: 1, post: 1 }));
      expect(amps).toEqual(values);
      expect(res.parsed.meta['Encoding']).toBe(`${{ int8: 'Int8', uint8: 'Uint8', int16: 'Int16', int32: 'Int32', uint32: 'Uint32', fp32: 'Float32', fp64: 'Float64' }[kind]} (${le ? 'LE' : 'BE'})`);
    }
  });

  it('decodes 32-bit and float formats in WFM#001 and WFM#002 too', () => {
    for (const version of [1, 2] as const) {
      expect(mustParse(buildWfm({ version, kind: 'fp32', values: [0.5, 1.5, 2.5, 3.5] })).amps).toEqual([0.5, 1.5, 2.5, 3.5]);
      expect(mustParse(buildWfm({ version, kind: 'int32', le: false, values: [7, -8, 9, -10] })).amps).toEqual([7, -8, 9, -10]);
    }
  });

  it('treats format code 6 as invalid in WFM#001/#002 (it is UINT8 only in WFM#003)', () => {
    for (const version of [1, 2] as const) {
      const ab = buildWfm({ version, kind: 'uint8', formatCode: 6 });
      const res = parseTekWfm(ab, 'v.wfm');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/invalid curve format/i);
      expect(probeTekWfmPoints(ab).ok).toBe(false);
    }
    const v3 = parseTekWfm(buildWfm({ version: 3, kind: 'uint8', values: [1, 2, 3, 4] }), 'v.wfm');
    expect(v3.ok).toBe(true);
    // Code 7 (INT8) and 8 (invalid) only exist in WFM#003.
    const v2Code7 = parseTekWfm(buildWfm({ version: 2, kind: 'uint8', formatCode: 7 }), 'v.wfm');
    expect(v2Code7.ok).toBe(false);
    const v3Code8 = parseTekWfm(buildWfm({ version: 3, kind: 'uint8', formatCode: 8 }), 'v.wfm');
    expect(v3Code8.ok).toBe(false);
    if (!v3Code8.ok) expect(v3Code8.error).toMatch(/invalid curve format/i);
  });
});

describe('Tektronix .wfm: gaps', () => {
  it('turns NULL / over-range / under-range samples into gaps instead of zeros (little- and big-endian)', () => {
    for (const le of [true, false]) {
      const values = [1, 1234, 3, 32767, 5, -32768, 7, 8];
      const { amps, xs, trace } = mustParse(buildWfm({ le, values, nValue: 1234, overRange: 32767, underRange: -32768, xScale: 1, xOffset: 0, tt: 0 }));
      expect(amps).toEqual([1, 3, 5, 7, 8]);
      expect(xs).toEqual([0, 2, 4, 6, 7]);
      expect(trace.isUniform).toBe(false);
      expect(amps).not.toContain(0);
    }
  });

  it('applies the markers in the curve format (uint32, int8) and when the sample sits at the file end', () => {
    expect(mustParse(buildWfm({ kind: 'uint32', values: [1, 4000000000, 3, 4], nValue: 4000000000 })).amps).toEqual([1, 3, 4]);
    expect(mustParse(buildWfm({ kind: 'int8', values: [1, 2, 3, 127], overRange: 127 })).amps).toEqual([1, 2, 3]);
    expect(mustParse(buildWfm({ values: [1, 2, 3, 99], pre: 0, post: 0, nValue: 99 })).amps).toEqual([1, 2, 3]);
  });

  it('does not treat unused markers (all 0x00 or all 0xFF) as gaps: 0 and -1 are real samples', () => {
    const unused = mustParse(buildWfm({ values: [0, -1, 0, 5, -1], nValue: 0, overRange: -1, underRange: 0 }));
    expect(unused.amps).toEqual([0, -1, 0, 5, -1]);
    const int8 = mustParse(buildWfm({ kind: 'int8', values: [0, -1, 0, -1], nValue: 0, overRange: -1, underRange: 0 }));
    expect(int8.amps).toEqual([0, -1, 0, -1]);
  });

  it('drops non-finite float samples', () => {
    const { amps } = mustParse(buildWfm({ kind: 'fp32', values: [1, Number.NaN, Number.POSITIVE_INFINITY, 2, Number.NEGATIVE_INFINITY, 3] }));
    expect(amps).toEqual([1, 2, 3]);
    const f64 = mustParse(buildWfm({ kind: 'fp64', values: [1, Number.NaN, 2, 3] }));
    expect(f64.amps).toEqual([1, 2, 3]);
  });

  it('keeps gaps out of decimated blocks and rejects an all-gap record', () => {
    const decimated = mustParse(buildWfm({ values: [10, 99, 30, 40, 99, 99, 70, 80], nValue: 99, xScale: 1 }), 'g.wfm', { reduction: { mode: 'decimate', factor: 2 } });
    expect(decimated.amps).toEqual([10, 35, 75]);
    const allGap = parseTekWfm(buildWfm({ values: [99, 99, 99, 99], nValue: 99 }), 'g.wfm');
    expect(allGap.ok).toBe(false);
  });
});

describe('Tektronix .wfm: FastFrame (synthetic)', () => {
  it('imports frame 1 only after skipping the extra frame tables', () => {
    const ab = buildWfm({ extraFrames: 3, values: [5, 6, 7, 8], pre: 2, post: 2, label: 'Ch2' });
    expect(probeTekWfmPoints(ab)).toEqual({ ok: true, totalPoints: 4 });
    const { res, trace, amps } = mustParse(ab);
    expect(amps).toEqual([5, 6, 7, 8]);
    expect(res.summaryText).toMatch(/frame 1 of 4/);
    expect(res.summaryText).toMatch(/other 3 frames are not imported/);
    expect(res.parsed.meta['Frames']).toBe('4');
    expect(trace.dn).toBe('x.wfm Ch2 (frame 1 of 4)');
  });

  it('a single waveform does not claim to be a FastFrame set', () => {
    const { res, trace } = mustParse(buildWfm());
    expect(res.summaryText).not.toMatch(/frame/i);
    expect(trace.dn).toBe('x.wfm CH1');
  });
});

describe('Tektronix .wfm: slice and reduction options', () => {
  const big = () => buildWfm({ values: ramp(1000, -500), yScale: 0.5, xScale: 1, xOffset: 100, tt: 0.5, pre: 4, post: 4 });

  it('slices the user-visible points before decoding', () => {
    const { amps, xs, res } = mustParse(big(), 'b.wfm', { slice: { start: 10, count: 5 } });
    expect(amps).toEqual([-490, -489, -488, -487, -486].map(v => v * 0.5));
    expect(xs[0]).toBeCloseTo(100 + 10.5, 12);
    expect(xs[4]).toBeCloseTo(100 + 14.5, 12);
    expect(res.parsed.meta['Points']).toBe('1000');
  });

  it('clamps a slice running past the end and rejects windows with fewer than two samples', () => {
    expect(mustParse(big(), 'b.wfm', { slice: { start: 990, count: 100 } }).amps).toHaveLength(10);
    expect(parseTekWfm(big(), 'b.wfm', { slice: { start: 999, count: 5 } }).ok).toBe(false);
    expect(parseTekWfm(big(), 'b.wfm', { slice: { start: 5000, count: 5 } }).ok).toBe(false);
    expect(parseTekWfm(big(), 'b.wfm', { slice: { start: 0, count: 1 } }).ok).toBe(false);
  });

  it('decimates by boxcar averaging', () => {
    const { amps, xs, trace, res } = mustParse(big(), 'b.wfm', { reduction: { mode: 'decimate', factor: 4 } });
    expect(amps).toHaveLength(250);
    expect(amps[0]).toBeCloseTo(((-500 + -499 + -498 + -497) / 4) * 0.5, 12);
    expect(at(xs, 1) - at(xs, 0)).toBeCloseTo(4, 12);
    expect(trace.isUniform).toBe(true);
    expect(res.parsed.meta['Decimation']).toMatch(/Boxcar decimated 4/);
  });

  it('reduces to a min-max envelope', () => {
    const { trace, amps } = mustParse(big(), 'b.wfm', { reduction: { mode: 'envelope', targetPoints: 100 } });
    expect(trace.envelopeOf).toBe(1000);
    expect(amps.length).toBeLessThanOrEqual(100);
    expect(Math.min(...amps)).toBe(-250);
    expect(Math.max(...amps)).toBe(249.5);
  });

  it('applies slice and reduction to a real FastFrame file', () => {
    const ab = fixture('FF5MhzX100From5Series');
    const full = mustParse(ab).amps;
    const sliced = mustParse(ab, 'ff.wfm', { slice: { start: 100, count: 50 } });
    expect(sliced.amps).toEqual(full.slice(100, 150));
    expect(mustParse(ab, 'ff.wfm', { reduction: { mode: 'decimate', factor: 10 } }).amps).toHaveLength(250);
  });
});

describe('Tektronix .wfm: raw-binary parser override', () => {
  it('forcing tek-wfm through the import-settings path parses, slices and honours overrides', () => {
    resetParserFileCounter();
    const ab = fixture('analog_waveform');
    const base = defaultBinaryConfig('analog_waveform.wfm', ab.byteLength, 'tek-wfm');
    expect(base.mode).toBe('auto-scope');

    const forced = parseBinaryWithConfig(ab, 'analog_waveform.wfm', { ...base, parserOverride: 'tek-wfm', startSample: 10, sampleCount: 5 });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.parsed.format).toBe('tek-wfm');
    expect(forced.parsed.traces[0]?.data).toHaveLength(5);

    const scaled = parseBinaryWithConfig(ab, 'analog_waveform.wfm', { ...base, parserOverride: 'tek-wfm', startSample: 10, sampleCount: 5, yMult: 10 });
    expect(scaled.ok).toBe(true);
    if (!scaled.ok) return;
    expect(scaled.parsed.traces[0]?.data[0]?.amp).toBeCloseTo((forced.parsed.traces[0]?.data[0]?.amp ?? Number.NaN) * 10, 12);
  });

  it('a forced parser with no WFM header fails with a WFM message instead of silently falling back', () => {
    const isf = readArrayBuffer('test files/tektronix_sample.isf');
    const res = parseBinaryWithConfig(isf, 'tektronix_sample.isf', { ...defaultBinaryConfig('tektronix_sample.isf', isf.byteLength, 'tek-isf'), parserOverride: 'tek-wfm' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Tektronix/);
  });

  it('accepts tek-wfm as a saved parserOverride setting', () => {
    const fallback = defaultBinaryConfig('a.wfm', 100, null);
    const parsed = parseBinarySettings(JSON.stringify({ kind: 'mergen-binary-import-settings', version: 1, config: { parserOverride: 'tek-wfm' } }), fallback);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.config.parserOverride).toBe('tek-wfm');
  });

  it('previews a WFM through the wizard engine with its point count and header summary', () => {
    const ab = fixture('data_test_waveform');
    const cfg = { ...defaultBinaryConfig('data_test_waveform.wfm', ab.byteLength, 'tek-wfm'), parserOverride: 'tek-wfm' as const };
    const preview = previewBinaryImport(ab, 'data_test_waveform.wfm', cfg);
    expect(preview.totalAvailableSamples).toBe(1000);
    expect(preview.headerSummary).toBeTruthy();
  });
});

describe('Binary format dispatch (regression after the exhaustive-switch refactor)', () => {
  function wavBuffer(): ArrayBuffer {
    const frames = 8;
    const ab = new ArrayBuffer(44 + frames * 2);
    const v = new DataView(ab);
    const text = (pos: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); };
    text(0, 'RIFF');
    v.setUint32(4, 36 + frames * 2, true);
    text(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    text(36, 'data');
    v.setUint32(40, frames * 2, true);
    for (let i = 0; i < frames; i++) v.setInt16(44 + i * 2, (i - 4) * 1000, true);
    return ab;
  }

  function npyBuffer(): ArrayBuffer {
    const dict = "{'descr': '<f4', 'fortran_order': False, 'shape': (8,), }";
    const headerLen = 118;
    const ab = new ArrayBuffer(10 + headerLen + 8 * 4);
    const bytes = new Uint8Array(ab);
    const v = new DataView(ab);
    bytes.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0], 0);
    v.setUint16(8, headerLen, true);
    bytes.fill(0x20, 10, 10 + headerLen);
    for (let i = 0; i < dict.length; i++) bytes[10 + i] = dict.charCodeAt(i);
    bytes[10 + headerLen - 1] = 0x0a;
    for (let i = 0; i < 8; i++) v.setFloat32(10 + headerLen + i * 4, i * 0.5, true);
    return ab;
  }

  const files: readonly [string, () => ArrayBuffer, 'wavebin' | 'lecroy-trc' | 'tek-isf' | 'tek-wfm' | 'owon-bin' | 'wav' | 'npy'][] = [
    ['keysight_dsox_sample.bin', () => readArrayBuffer('test files/keysight_dsox_sample.bin'), 'wavebin'],
    ['rigol_dho804_sample.bin', () => readArrayBuffer('test files/rigol_dho804_sample.bin'), 'wavebin'],
    ['lecroy_sample.trc', () => readArrayBuffer('test files/lecroy_sample.trc'), 'lecroy-trc'],
    ['tektronix_sample.isf', () => readArrayBuffer('test files/tektronix_sample.isf'), 'tek-isf'],
    ['owon_sample.bin', () => readArrayBuffer('test files/owon_sample.bin'), 'owon-bin'],
    ['syn_audio.wav', wavBuffer, 'wav'],
    ['syn_array.npy', npyBuffer, 'npy'],
    ['analog_waveform.wfm', () => fixture('analog_waveform'), 'tek-wfm'],
  ];

  it.each(files)('%s is detected, auto-opened and force-parsed as its own format', (fileName, load, format) => {
    resetParserFileCounter();
    const ab = load();
    expect(detectBinarySignature(sniff(ab))).toBe(format);

    const read = classifyReadBinary(fileName, ab, `id-${fileName}`);
    expect(read.kind).toBe('data');
    if (read.kind !== 'data' || !read.input.parsed) throw new Error(`no parse for ${fileName}`);
    expect(read.input.parsed.format).toBe(format);
    expect(read.input.parsed.traces.length).toBeGreaterThan(0);

    const forced = parseBinaryWithConfig(ab, fileName, { ...defaultBinaryConfig(fileName, ab.byteLength, format), parserOverride: format });
    expect(forced.ok).toBe(true);
    if (forced.ok) expect(forced.parsed.format).toBe(format);
  });
});

describe('Tektronix .wfm: hostile input', () => {
  const good = () => buildWfm({ values: ramp(16), pre: 2, post: 2 });
  const O = SPEC_OFFSETS[3];
  const goodLen = good().byteLength;
  const curveOffset = O.end;

  const cases: readonly [string, () => ArrayBuffer, RegExp][] = [
    ['empty file', () => new ArrayBuffer(0), /truncated/i],
    ['10 bytes', () => good().slice(0, 10), /truncated/i],
    ['truncated inside the static header', () => good().slice(0, 0x50), /truncated/i],
    ['truncated inside the dimension tables', () => good().slice(0, 0x300), /truncated/i],
    ['truncated one byte before the header end', () => good().slice(0, O.end - 1), /truncated/i],
    ['truncated curve buffer', () => good().slice(0, curveOffset + (2 + 16) * 2 - 2), /past the end/i],
    ['curve offset past EOF', () => mutate(good(), v => v.setInt32(0x10, goodLen + 100, true)), /outside the file/i],
    ['negative curve offset', () => mutate(good(), v => v.setInt32(0x10, -5, true)), /outside the file/i],
    ['curve offset inside the header', () => mutate(good(), v => v.setInt32(0x10, 100, true)), /outside the file/i],
    ['dataStart > postchargeStart', () => mutate(good(), v => v.setUint32(O.cur + 14, 200, true)), /out of order/i],
    ['precharge > dataStart', () => mutate(good(), v => v.setUint32(O.cur + 10, 40, true)), /out of order/i],
    ['postchargeStart > postchargeStop', () => mutate(good(), v => v.setUint32(O.cur + 22, 2, true)), /out of order/i],
    ['misaligned dataStart', () => mutate(good(), v => v.setUint32(O.cur + 14, 5, true)), /aligned/i],
    ['misaligned postchargeStart', () => mutate(good(), v => v.setUint32(O.cur + 18, 37, true)), /aligned/i],
    ['bytes-per-point mismatch', () => mutate(good(), (_v, u8) => { u8[0x0f] = 4; }), /bytes-per-point/i],
    ['huge FastFrame count', () => mutate(good(), v => v.setUint32(0x48, 0xffffffff, true)), /exceeds the file size/i],
    ['huge postcharge offsets', () => mutate(good(), v => { v.setUint32(O.cur + 18, 0xfffffff0, true); v.setUint32(O.cur + 22, 0xfffffff0, true); }), /past the end/i],
    ['huge curve offsets with u32 max', () => mutate(good(), v => { v.setUint32(O.cur + 14, 0xfffffffe, true); v.setUint32(O.cur + 18, 0xffffffff, true); v.setUint32(O.cur + 22, 0xffffffff, true); }), /aligned|past the end/i],
    ['fewer than two points', () => mutate(good(), v => { v.setUint32(O.cur + 18, 6, true); }), /fewer than two/i],
    ['unknown byte order', () => mutate(good(), (_v, u8) => { u8[0] = 0x12; u8[1] = 0x12; }), /byte-order/i],
    ['mixed byte-order bytes', () => mutate(good(), (_v, u8) => { u8[1] = 0xf0; }), /byte-order/i],
    ['unknown version', () => mutate(good(), (_v, u8) => { u8[9] = 0x34; }), /version/i],
    ['legacy LLWFM header', () => mutate(good(), (_v, u8) => { u8.set([0x4c, 0x4c, 0x57, 0x46, 0x4d, 0x20, 0x20, 0x20], 2); }), /version/i],
    ['uint64 curve format', () => mutate(good(), v => v.setInt32(O.exp + 72, 3, true)), /64-bit/i],
    ['invalid curve format', () => mutate(good(), v => v.setInt32(O.exp + 72, 8, true)), /invalid curve format/i],
    ['unknown curve format', () => mutate(good(), v => v.setInt32(O.exp + 72, 77, true)), /curve format code/i],
    ['min/max storage', () => mutate(good(), v => v.setInt32(O.exp + 76, 1, true)), /min\/max/i],
    ['histogram storage', () => mutate(good(), v => v.setInt32(O.exp + 76, 2, true)), /histogram/i],
    ['row-order storage', () => mutate(good(), v => v.setInt32(O.exp + 76, 4, true)), /row\/column/i],
    ['digital data type', () => mutate(good(), v => v.setInt32(0x7a, 6, true)), /digital/i],
    ['waveform database data type', () => mutate(good(), v => v.setInt32(0x7a, 5, true)), /database/i],
    ['scalar data type', () => mutate(good(), v => v.setInt32(0x7a, 0, true)), /scalar/i],
    ['unknown data type', () => mutate(good(), v => v.setInt32(0x7a, 99, true)), /data type/i],
    ['no explicit dimension', () => mutate(good(), v => v.setUint32(0x76, 0, true)), /dimension/i],
    ['no implicit dimension', () => mutate(good(), v => v.setUint32(0x72, 0, true)), /dimension/i],
    ['unknown set type', () => mutate(good(), v => v.setInt32(0x4e, 9, true)), /set type/i],
    ['zero sample interval', () => mutate(good(), v => v.setFloat64(O.imp, 0, true)), /sample interval/i],
    ['negative sample interval', () => mutate(good(), v => v.setFloat64(O.imp, -1e-9, true)), /sample interval/i],
    ['NaN sample interval', () => mutate(good(), v => v.setFloat64(O.imp, Number.NaN, true)), /sample interval/i],
    ['infinite sample interval', () => mutate(good(), v => v.setFloat64(O.imp, Number.POSITIVE_INFINITY, true)), /sample interval/i],
    ['NaN horizontal offset', () => mutate(good(), v => v.setFloat64(O.imp + 8, Number.NaN, true)), /offset/i],
    ['NaN vertical scale', () => mutate(good(), v => v.setFloat64(O.exp, Number.NaN, true)), /vertical/i],
    ['infinite vertical offset', () => mutate(good(), v => v.setFloat64(O.exp + 8, Number.POSITIVE_INFINITY, true)), /vertical/i],
  ];

  it.each(cases)('%s: no throw, ok=false with a readable message', (_name, make, message) => {
    const ab = make();
    const res = parseTekWfm(ab, 'bad.wfm');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.length).toBeGreaterThan(10);
      expect(res.error).toMatch(message);
    }
    const probe = probeTekWfmPoints(ab);
    expect(probe.ok).toBe(false);
    // Routing never throws either; a signature-bearing buffer lands in the binary wizard.
    const read = classifyReadBinary('bad.wfm', ab, 'bad');
    expect(read.kind).toBe('data');
  });

  it('routes a recognised-but-undecodable WFM to the binary wizard with a warning', () => {
    const ab = mutate(good(), v => v.setInt32(O.exp + 72, 3, true));
    const read = classifyReadBinary('bad.wfm', ab, 'bad');
    if (read.kind !== 'data') throw new Error('expected data');
    expect(read.input.parsed?.format).toBe('needs-binary-wizard');
    expect(read.input.binaryWarning).toMatch(/64-bit/);
  });

  it('survives hundreds of random single-byte corruptions and truncations of real files', () => {
    let seed = 0x2545f491;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (const name of ['golden_analog', 'data_test_waveform', 'FF5MhzX100From5Series']) {
      const original = fixture(name);
      const headerSpan = Math.min(original.byteLength, 6300);
      for (let round = 0; round < 300; round++) {
        const copy = original.slice(0);
        const u8 = new Uint8Array(copy);
        const flips = 1 + (next() % 3);
        for (let f = 0; f < flips; f++) u8[next() % headerSpan] = next() & 0xff;
        const input = round % 5 === 0 ? copy.slice(0, next() % copy.byteLength) : copy;
        const res = parseTekWfm(input, 'fuzz.wfm');
        const probe = probeTekWfmPoints(input);
        if (res.ok) {
          const data = res.parsed.traces[0]?.data ?? [];
          expect(data.length).toBeGreaterThanOrEqual(2);
          expect(data.every(p => Number.isFinite(p.freq) && Number.isFinite(p.amp))).toBe(true);
          expect(probe.ok).toBe(true);
        } else {
          expect(res.error.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
