import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BINARY_SNIFF_BYTES, detectBinarySignature, scopeFormatLabel } from '../../src/domain/parsers/binary-detect';
import { parseSiglentBin, probeSiglentBinPoints } from '../../src/domain/parsers/siglent-bin';
import { defaultBinaryConfig, parseBinarySettings, parseBinaryWithConfig, previewBinaryImport } from '../../src/domain/parsers/raw-binary';
import { classifyReadBinary } from '../../src/domain/open-file-read';
import { resetParserFileCounter } from '../../src/domain/parsers/rs-dat';

function readArrayBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const fixture = (name: string): ArrayBuffer => readArrayBuffer(`tests/fixtures/siglent-sds/SDS814X-${name}.bin`);
const sniff = (ab: ArrayBuffer): Uint8Array => new Uint8Array(ab, 0, Math.min(ab.byteLength, BINARY_SNIFF_BYTES));

/** Indexed read that fails the test instead of silencing `noUncheckedIndexedAccess` with `!`. */
function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`no value at index ${index} (length ${values.length})`);
  return value;
}

type Parsed = ReturnType<typeof parseSiglentBin>;

function mustParse(ab: ArrayBuffer, name = 'x.bin', options?: Parameters<typeof parseSiglentBin>[2]) {
  resetParserFileCounter();
  const res = parseSiglentBin(ab, name, options);
  if (!res.ok) throw new Error(`expected ok parse, got: ${res.error}`);
  return res;
}

function traceOf(res: Extract<Parsed, { ok: true }>, index: number) {
  const trace = at(res.parsed.traces, index);
  return { trace, amps: trace.data.map(p => p.amp), xs: trace.data.map(p => p.freq) };
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

// ---------------------------------------------------------------------------
// Synthetic V4 builder (independent of the decoder: absolute offsets come from the app-note table)
// ---------------------------------------------------------------------------

const V_WORDS = [0, 1, 1, 0, 1, 0, 1] as const;
const A_WORDS = [0, 0, 1, 1, 1, 0, 1] as const;

interface DwuSpec {
  readonly value: number;
  readonly magnitude: number;
  readonly units?: readonly number[];
}

function putDwu(v: DataView, off: number, spec: DwuSpec): void {
  v.setFloat64(off, spec.value, true);
  v.setUint32(off + 8, spec.magnitude, true);
  const words = spec.units ?? V_WORDS;
  words.forEach((w, i) => v.setUint32(off + 12 + 4 * i, w, true));
}

interface SynthChannel {
  /** 0-based analog channel index (CH1 = 0 ... CH8 = 7). */
  readonly index: number;
  readonly codes: readonly number[];
  readonly vdiv?: DwuSpec;
  readonly offset?: DwuSpec;
  readonly probe?: number;
  readonly codesPerDiv?: number;
}

interface SynthMath {
  /** 0-based math index (F1 = 0). */
  readonly index: number;
  readonly codes: readonly number[];
  readonly vdiv?: DwuSpec;
  readonly position?: DwuSpec;
  readonly interval?: number;
}

interface SynthOptions {
  readonly bits?: 8 | 16;
  readonly bigEndian?: boolean;
  readonly channels: readonly SynthChannel[];
  readonly math?: readonly SynthMath[];
  readonly sampleRate?: DwuSpec;
  readonly timeDiv?: DwuSpec;
  readonly timeDelay?: DwuSpec;
  readonly horiDivs?: number;
  readonly digital?: { readonly channels: readonly number[]; readonly bytes: number };
  readonly zoom?: { readonly timeDiv: DwuSpec; readonly delay: DwuSpec };
}

function buildSiglent(opts: SynthOptions): ArrayBuffer {
  const bits = opts.bits ?? 16;
  const bps = bits === 16 ? 2 : 1;
  const waveLength = opts.channels[0]?.codes.length ?? 0;
  const mathBytes = (opts.math ?? []).reduce((s, m) => s + m.codes.length * bps, 0);
  const total = 0x1000 + opts.channels.reduce((s, c) => s + c.codes.length * bps, 0) + mathBytes + (opts.digital?.bytes ?? 0);
  const ab = new ArrayBuffer(total);
  const v = new DataView(ab);
  v.setUint32(0x000, 4, true);
  v.setUint32(0x004, 0x1000, true);
  putDwu(v, 0x19c, opts.timeDiv ?? { value: 1e-3, magnitude: 8 });
  putDwu(v, 0x1c4, opts.timeDelay ?? { value: 0, magnitude: 8 });
  v.setUint32(0x1ec, waveLength, true);
  putDwu(v, 0x1f0, opts.sampleRate ?? { value: 1e6, magnitude: 8, units: [0, 0, 0, 0, 0, 0, 0] });
  v.setUint8(0x264, bits === 16 ? 1 : 0);
  v.setUint8(0x265, opts.bigEndian ? 1 : 0);
  v.setInt32(0x26c, opts.horiDivs ?? 10, true);
  v.setInt32(0x400, bits === 16 ? 7680 : 30, true);
  // CH1..CH4 always carry a valid V/div record (the detector looks at CH1), whether enabled or not.
  putDwu(v, 0x018, { value: 1, magnitude: 8 });
  for (const c of opts.channels) {
    const upper = c.index >= 4;
    const slot = upper ? c.index - 4 : c.index;
    v.setInt32((upper ? 0x404 : 0x008) + 4 * slot, 1, true);
    putDwu(v, (upper ? 0x414 : 0x018) + 0x28 * slot, c.vdiv ?? { value: 1, magnitude: 8 });
    putDwu(v, (upper ? 0x4b4 : 0x0b8) + 0x28 * slot, c.offset ?? { value: 0, magnitude: 8 });
    v.setFloat64((upper ? 0x554 : 0x244) + 8 * slot, c.probe ?? 1, true);
    v.setInt32((upper ? 0x574 : 0x270) + 4 * slot, c.codesPerDiv ?? (bits === 16 ? 7680 : 30), true);
  }
  for (const m of opts.math ?? []) {
    v.setInt32(0x280 + 4 * m.index, 1, true);
    putDwu(v, 0x290 + 0x28 * m.index, m.vdiv ?? { value: 1, magnitude: 8 });
    putDwu(v, 0x330 + 0x28 * m.index, m.position ?? { value: 0, magnitude: 8 });
    v.setUint32(0x3d0 + 4 * m.index, m.codes.length, true);
    v.setFloat64(0x3e0 + 8 * m.index, m.interval ?? 0, true);
  }
  if (opts.digital) {
    v.setUint32(0x158, 1, true);
    for (const d of opts.digital.channels) v.setUint32(0x15c + 4 * d, 1, true);
  }
  if (opts.zoom) {
    v.setInt32(0xaf4, 1, true);
    putDwu(v, 0xaf8, opts.zoom.timeDiv);
    putDwu(v, 0xb20, opts.zoom.delay);
  }
  let pos = 0x1000;
  const write = (codes: readonly number[]): void => {
    for (const code of codes) {
      if (bits === 16) v.setUint16(pos, code, !opts.bigEndian);
      else v.setUint8(pos, code);
      pos += bps;
    }
  };
  for (const c of [...opts.channels].sort((a, b) => a.index - b.index)) write(c.codes);
  for (const m of [...(opts.math ?? [])].sort((a, b) => a.index - b.index)) write(m.codes);
  for (let i = 0; i < (opts.digital?.bytes ?? 0); i++) v.setUint8(pos + i, 0xa5);
  return ab;
}

function mutate(ab: ArrayBuffer, fn: (v: DataView) => void): ArrayBuffer {
  const copy = ab.slice(0);
  fn(new DataView(copy));
  return copy;
}

const RAMP = [32768, 32768 + 7680, 32768 - 3840, 32768 + 1920, 32768 - 7680];

// ---------------------------------------------------------------------------
// Real instrument files
// ---------------------------------------------------------------------------

interface Expected {
  readonly file: string;
  readonly name: string;
  readonly unit: string;
  readonly n: number;
  readonly t0: number;
  readonly dt: number;
  readonly first: readonly number[];
  readonly last: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

// Reference values: RigolWFM 1.6.0 (float32), an independent reader.
const EXPECTED: readonly Expected[] = [
  {
    file: '3v0-probe10x', name: 'CH1', unit: 'V', n: 2000, t0: -0.1, dt: 1e-4,
    first: [0.577083349228, 0.579166650772, 0.581250011921, 0.572916686535, 0.579166650772],
    last: [2.995833396912, 2.985416650772, 2.987499952316],
    min: 0.3916666507720947, max: 3.2041666507720947, mean: 2.2530124903768303,
  },
  {
    file: '3v0-probe1x', name: 'CH1', unit: 'V', n: 2000, t0: -0.1, dt: 1e-4,
    first: [0.26041662693, 0.258333295584, 0.26041662693, 0.26041662693, 0.258333295584],
    last: [3.002083301544, 3.0, 2.997916698456],
    min: 0.17499996721744537, max: 3.2124998569488525, mean: 2.1935968557298184,
  },
  {
    file: '4v5-dc', name: 'CH1', unit: 'V', n: 10000, t0: -0.002683431952662722, dt: 5e-7,
    first: [4.522500038147, 4.523749828339, 4.522500038147, 4.520416736603, 4.5233335495],
    last: [4.519999980927, 4.522916793823, 4.520833492279],
    min: 4.504583358764648, max: 4.5291666984558105, mean: 4.522127197551727,
  },
  {
    file: 'amps-300ma', name: 'CH1', unit: 'A', n: 2000, t0: -0.1, dt: 1e-4,
    first: [0.002500002971, 0.002291669603, 0.002083336236, 0.002291669603, 0.002291669603],
    last: [0.302291661501, 0.302500009537, 0.302291661501],
    min: 0.00041666964534670115, max: 0.32374998927116394, mean: 0.215430419123295,
  },
  {
    file: 'math-c1', name: 'CH1', unit: 'V', n: 10000, t0: -0.5, dt: 1e-4,
    first: [3.333750009537, 3.359999895096, 3.340312480927, 3.333750009537, 3.346874952316],
    last: [5.039999961853, 5.046562671661, 5.039999961853],
    min: 0.43968749046325684, max: 5.269687652587891, mean: 3.9415333466589453,
  },
  {
    file: 'math-f1', name: 'F1', unit: 'V', n: 10000, t0: -0.5, dt: 1e-4,
    first: [-6.66796875, -6.720052242279, -6.680989742279, -6.66796875, -6.694010257721],
    last: [-10.080729484558, -10.09375, -10.080729484558],
    min: -10.540364265441895, max: -0.8802083134651184, mean: -7.8837302085042,
  },
  {
    file: 'zoom-z1', name: 'CH1', unit: 'V', n: 200, t0: 0.005, dt: 1e-4,
    first: [3.090937614441, 3.1171875, 3.150000095367, 3.150000095367, 3.163125038147],
    last: [5.046562671661, 5.026875019073, 5.026875019073],
    min: 3.090937614440918, max: 5.269687652587891, mean: 4.613470298051834,
  },
];

describe('Siglent SDS .bin: real instrument files (SDS814X HD)', () => {
  it.each(EXPECTED)('$file decodes to the reference values', (e) => {
    const ab = fixture(e.file);
    expect(detectBinarySignature(sniff(ab))).toBe('siglent-bin');
    expect(probeSiglentBinPoints(ab)).toEqual({ ok: true, totalPoints: e.n });

    const res = mustParse(ab, `SDS814X-${e.file}.bin`);
    expect(res.parsed.format).toBe('siglent-bin');
    expect(res.parsed.traces).toHaveLength(1);
    expect(res.parsed.displayTraces).toHaveLength(1);
    expect(res.parsed.columnIdentities).toEqual([{ index: 0, header: e.name }]);
    const { trace, amps, xs } = traceOf(res, 0);
    expect(trace.units).toEqual({ x: 's', y: e.unit });
    expect(trace.domain).toBe('time');
    expect(amps).toHaveLength(e.n);

    e.first.forEach((v, i) => expect(at(amps, i)).toBeCloseTo(v, 6));
    e.last.forEach((v, i) => expect(at(amps, e.n - e.last.length + i)).toBeCloseTo(v, 6));
    const s = stats(amps);
    expect(s.min).toBeCloseTo(e.min, 6);
    expect(s.max).toBeCloseTo(e.max, 6);
    expect(s.mean).toBeCloseTo(e.mean, 6);

    expect(at(xs, 0)).toBeCloseTo(e.t0, 12);
    expect(at(xs, 1)).toBeCloseTo(e.t0 + e.dt, 12);
    expect(at(xs, e.n - 1)).toBeCloseTo(e.t0 + (e.n - 1) * e.dt, 12);
    expect(res.parsed.meta['Points']).toBe(String(e.n));
    expect(res.parsed.meta['Sample Rate']).toEqual({ value: expect.closeTo(1 / e.dt, 3), unit: 'Hz' });
  });

  it('reads the 1x and 10x probe captures as the same signal with the same displayed V/div', () => {
    const one = mustParse(fixture('3v0-probe1x'), 'a.bin');
    const ten = mustParse(fixture('3v0-probe10x'), 'b.bin');
    for (const res of [one, ten]) {
      const { amps } = traceOf(res, 0);
      expect(stats(amps).max).toBeGreaterThan(2.9);
      expect(stats(amps).max).toBeLessThan(3.3);
      expect(at(amps, 1999)).toBeCloseTo(3.0, 1);
      expect(res.summaryText).toMatch(/CH1: 2000 pts, 1 V\/div/);
    }
    expect(ten.summaryText).toMatch(/probe 10×/);
    expect(one.summaryText).toMatch(/probe 1×/);
    expect(ten.parsed.meta['CH1']).toMatch(/1 V\/div \(probe 10×\)/);
  });

  it('reads the DC capture near 4.5 V and the current capture in amps near 0.3 A', () => {
    const dc = traceOf(mustParse(fixture('4v5-dc'), 'dc.bin'), 0);
    expect(stats(dc.amps).mean).toBeCloseTo(4.5, 1);
    const amps = mustParse(fixture('amps-300ma'), 'a.bin');
    const a = traceOf(amps, 0);
    expect(a.trace.units.y).toBe('A');
    expect(stats(a.amps).max).toBeCloseTo(0.3, 1);
    expect(amps.summaryText).toMatch(/A\/div/);
  });

  it('decodes the math trace as -2 x C1 within the quantisation step, named F1', () => {
    const c1 = traceOf(mustParse(fixture('math-c1'), 'c1.bin'), 0);
    const f1 = traceOf(mustParse(fixture('math-f1'), 'f1.bin'), 0);
    expect(f1.trace.dn).toContain('F1');
    const tol = (2 * 10) / 7680;
    for (let i = 0; i < c1.amps.length; i += 97) {
      expect(Math.abs(at(f1.amps, i) + 2 * at(c1.amps, i))).toBeLessThan(tol);
    }
  });

  it('applies the zoom timebase (positive delay) and says so in the metadata', () => {
    const res = mustParse(fixture('zoom-z1'), 'z.bin');
    const { xs } = traceOf(res, 0);
    expect(at(xs, 0)).toBeCloseTo(0.005, 12);
    expect(at(xs, 199)).toBeCloseTo(0.005 + 199e-4, 12);
    expect(res.parsed.meta['Zoom']).toBeTruthy();
    expect(res.summaryText).toMatch(/Zoom/);
    const normal = mustParse(fixture('3v0-probe1x'), 'n.bin');
    expect(normal.parsed.meta['Zoom']).toBeUndefined();
  });

  it('records the header facts in the metadata', () => {
    const res = mustParse(fixture('4v5-dc'), 'dc.bin');
    expect(res.parsed.meta['Format']).toMatch(/Siglent SDS Binary V4\.0/);
    expect(res.parsed.meta['Data Width']).toBe('16-bit');
    expect(res.parsed.meta['Byte Order']).toMatch(/LSB first/);
    expect(res.parsed.meta['Channels']).toBe('1');
    expect(res.summaryText).toMatch(/7680 codes\/div/);
    expect(res.summaryText).toMatch(/Sample rate: 2 MSa\/s/);
    expect(scopeFormatLabel('siglent-bin')).toBe('Siglent SDS (.bin)');
  });
});

// ---------------------------------------------------------------------------
// Synthetic files
// ---------------------------------------------------------------------------

describe('Siglent SDS .bin: synthetic files', () => {
  it('decodes 16-bit LE with probe, offset and the +/-32768 centre', () => {
    const ab = buildSiglent({
      channels: [{ index: 0, codes: RAMP, vdiv: { value: 0.5, magnitude: 8 }, offset: { value: 0.1, magnitude: 8 }, probe: 10 }],
    });
    const res = mustParse(ab);
    const { amps } = traceOf(res, 0);
    const expected = RAMP.map(c => (c - 32768) * 0.5 * 10 / 7680 - 0.1 * 10);
    amps.forEach((v, i) => expect(v).toBeCloseTo(at(expected, i), 12));
  });

  it('decodes 8-bit samples around the centre 128', () => {
    const codes = [128, 128 + 30, 128 - 15, 255, 0];
    const ab = buildSiglent({ bits: 8, channels: [{ index: 0, codes, vdiv: { value: 2, magnitude: 8 }, codesPerDiv: 30 }] });
    const { amps } = traceOf(mustParse(ab), 0);
    const expected = codes.map(c => (c - 128) * 2 / 30);
    amps.forEach((v, i) => expect(v).toBeCloseTo(at(expected, i), 12));
    expect(mustParse(ab).parsed.meta['Data Width']).toBe('8-bit');
  });

  it('decodes big-endian (MSB-first) 16-bit samples', () => {
    const ab = buildSiglent({ bigEndian: true, channels: [{ index: 0, codes: RAMP }] });
    const res = mustParse(ab);
    const { amps } = traceOf(res, 0);
    amps.forEach((v, i) => expect(v).toBeCloseTo((at(RAMP, i) - 32768) / 7680, 12));
    expect(res.parsed.meta['Byte Order']).toMatch(/MSB first/);
  });

  it('lays out several analog channels, CH5-CH8 fields and a math trace in file order', () => {
    const ch1 = [32768, 32768 + 7680, 32768 + 15360];
    const ch3 = [32768 - 7680, 32768, 32768 + 7680];
    const ch6 = [32768 + 3840, 32768 + 3840, 32768 - 3840];
    const f2 = [32768 + 1000, 32768 + 2000, 32768 + 3000];
    const ab = buildSiglent({
      channels: [
        { index: 5, codes: ch6, vdiv: { value: 4, magnitude: 8 }, offset: { value: 1, magnitude: 8 }, probe: 2, codesPerDiv: 3840 },
        { index: 0, codes: ch1 },
        { index: 2, codes: ch3, vdiv: { value: 2, magnitude: 8 } },
      ],
      math: [{ index: 1, codes: f2, vdiv: { value: 5, magnitude: 8 }, position: { value: 0.25, magnitude: 8 }, interval: 2e-6 }],
      sampleRate: { value: 1e6, magnitude: 8 },
      timeDiv: { value: 1e-3, magnitude: 8 },
      timeDelay: { value: 0, magnitude: 8 },
    });
    expect(probeSiglentBinPoints(ab)).toEqual({ ok: true, totalPoints: 3 });
    const res = mustParse(ab);
    expect(res.parsed.columnIdentities?.map(c => c.header)).toEqual(['CH1', 'CH3', 'CH6', 'F2']);
    const exp = {
      CH1: ch1.map(c => (c - 32768) / 7680),
      CH3: ch3.map(c => (c - 32768) * 2 / 7680),
      CH6: ch6.map(c => (c - 32768) * 4 * 2 / 3840 - 1 * 2),
      F2: f2.map(c => (c - 32768) * 5 / 7680 - 0.25),
    };
    (['CH1', 'CH3', 'CH6', 'F2'] as const).forEach((name, i) => {
      const { amps } = traceOf(res, i);
      amps.forEach((v, k) => expect(v).toBeCloseTo(at(exp[name], k), 12));
    });
    // Analog traces use 1/sample_rate; the math trace uses its own interval.
    expect(at(traceOf(res, 0).xs, 1) - at(traceOf(res, 0).xs, 0)).toBeCloseTo(1e-6, 15);
    expect(at(traceOf(res, 3).xs, 1) - at(traceOf(res, 3).xs, 0)).toBeCloseTo(2e-6, 15);
    expect(at(traceOf(res, 0).xs, 0)).toBeCloseTo(-5e-3, 12);
  });

  it('falls back to 1/sample_rate for a math trace with no usable interval', () => {
    const ab = buildSiglent({
      channels: [{ index: 0, codes: RAMP }],
      math: [{ index: 0, codes: RAMP, interval: Number.NaN }],
      sampleRate: { value: 2e6, magnitude: 8 },
    });
    const xs = traceOf(mustParse(ab), 1).xs;
    expect(at(xs, 1) - at(xs, 0)).toBeCloseTo(5e-7, 15);
  });

  it('skips digital data after the analog blocks and notes it', () => {
    const ab = buildSiglent({ channels: [{ index: 0, codes: RAMP }], digital: { channels: [0, 3, 15], bytes: 64 } });
    const res = mustParse(ab);
    expect(res.parsed.traces).toHaveLength(1);
    expect(res.parsed.meta['Skipped Digital Channels']).toBe('3');
    expect(res.summaryText).toMatch(/Digital: 3 channel/);
    const { amps } = traceOf(res, 0);
    expect(amps).toHaveLength(RAMP.length);
    expect(at(amps, 1)).toBeCloseTo(1, 12);
  });

  it('scales non-unity magnitudes (mV/div, us/div, kSa/s, ms delay)', () => {
    const ab = buildSiglent({
      channels: [{ index: 0, codes: RAMP, vdiv: { value: 500, magnitude: 7 }, offset: { value: 20, magnitude: 7 } }],
      sampleRate: { value: 500, magnitude: 9 },
      timeDiv: { value: 2, magnitude: 6 },
      timeDelay: { value: 3, magnitude: 6 },
      horiDivs: 20,
    });
    const res = mustParse(ab);
    const { amps, xs } = traceOf(res, 0);
    amps.forEach((v, i) => expect(v).toBeCloseTo((at(RAMP, i) - 32768) * 0.5 / 7680 - 0.02, 12));
    expect(at(xs, 0)).toBeCloseTo(-2e-6 * 20 / 2 - 3e-6, 15);
    expect(at(xs, 1) - at(xs, 0)).toBeCloseTo(1 / 5e5, 15);
    expect(res.parsed.meta['Sample Rate']).toEqual({ value: 5e5, unit: 'Hz' });
    expect(res.summaryText).toMatch(/500 kSa\/s/);
    expect(res.summaryText).toMatch(/0\.5 V\/div/);
  });

  it('maps the vertical unit words (amps, composed volts, dBm) and falls back to V when none are recorded', () => {
    const amps = traceOf(mustParse(buildSiglent({ channels: [{ index: 0, codes: RAMP, vdiv: { value: 1, magnitude: 8, units: A_WORDS } }] })), 0);
    expect(amps.trace.units.y).toBe('A');
    const dbm = traceOf(mustParse(buildSiglent({ channels: [{ index: 0, codes: RAMP, vdiv: { value: 1, magnitude: 8, units: [6, 0, 0, 0, 0, 0, 0] } }] })), 0);
    expect(dbm.trace.units.y).toBe('dBm');
    const none = mustParse(buildSiglent({ channels: [{ index: 0, codes: RAMP, vdiv: { value: 1, magnitude: 8, units: [0, 0, 0, 0, 0, 0, 0] } }] }));
    expect(traceOf(none, 0).trace.units.y).toBe('V');
    expect(none.parsed.meta['Unit Note']).toMatch(/assumed V/);
  });

  it('applies the zoom delay with a plus sign', () => {
    const ab = buildSiglent({
      channels: [{ index: 0, codes: RAMP }],
      timeDelay: { value: 99, magnitude: 8 },
      zoom: { timeDiv: { value: 1e-3, magnitude: 8 }, delay: { value: 0.02, magnitude: 8 } },
    });
    expect(at(traceOf(mustParse(ab), 0).xs, 0)).toBeCloseTo(-5e-3 + 0.02, 12);
  });
});

// ---------------------------------------------------------------------------
// Hostile input
// ---------------------------------------------------------------------------

describe('Siglent SDS .bin: hostile input', () => {
  const good = (): ArrayBuffer => buildSiglent({ channels: [{ index: 0, codes: RAMP }] });

  const cases: readonly [string, () => ArrayBuffer, RegExp][] = [
    ['truncated header', () => good().slice(0, 0x800), /truncated/i],
    ['empty buffer', () => new ArrayBuffer(0), /truncated/i],
    ['version 3', () => mutate(good(), v => v.setUint32(0, 3, true)), /version 3/i],
    ['data offset past the end of the file', () => mutate(good(), v => v.setUint32(4, 0x100000, true)), /data offset/i],
    ['data offset inside the header', () => mutate(good(), v => v.setUint32(4, 0x800, true)), /data offset/i],
    ['samples cut off', () => good().slice(0, 0x1000 + 6), /does not fit/i],
    ['absurd wave length', () => mutate(good(), v => v.setUint32(0x1ec, 0xffffffff, true)), /does not fit/i],
    ['wave length 1', () => mutate(good(), v => v.setUint32(0x1ec, 1, true)), /fewer than two/i],
    ['wave length 0', () => mutate(good(), v => v.setUint32(0x1ec, 0, true)), /fewer than two/i],
    ['no channel enabled', () => mutate(good(), v => v.setInt32(0x008, 0, true)), /no enabled/i],
    ['codes per div 0', () => mutate(good(), v => v.setInt32(0x270, 0, true)), /codes per division/i],
    ['codes per div negative', () => mutate(good(), v => v.setInt32(0x270, -5, true)), /codes per division/i],
    ['V/div 0', () => mutate(good(), v => v.setFloat64(0x018, 0, true)), /volts\/div/i],
    ['V/div NaN', () => mutate(good(), v => v.setFloat64(0x018, Number.NaN, true)), /volts\/div/i],
    ['V/div negative', () => mutate(good(), v => v.setFloat64(0x018, -1, true)), /volts\/div/i],
    ['V/div magnitude 99', () => mutate(good(), v => v.setUint32(0x020, 99, true)), /volts\/div/i],
    ['offset infinite', () => mutate(good(), v => v.setFloat64(0x0b8, Number.POSITIVE_INFINITY, true)), /offset/i],
    ['probe 0', () => mutate(good(), v => v.setFloat64(0x244, 0, true)), /probe/i],
    ['probe NaN', () => mutate(good(), v => v.setFloat64(0x244, Number.NaN, true)), /probe/i],
    ['sample rate 0', () => mutate(good(), v => v.setFloat64(0x1f0, 0, true)), /sample rate/i],
    ['sample rate magnitude 99', () => mutate(good(), v => v.setUint32(0x1f8, 99, true)), /sample rate/i],
    ['time/div magnitude 99', () => mutate(good(), v => v.setUint32(0x1a4, 99, true)), /timebase/i],
    ['horizontal divisions 0', () => mutate(good(), v => v.setInt32(0x26c, 0, true)), /horizontal/i],
    ['data width 2', () => mutate(good(), v => v.setUint8(0x264, 2)), /data width/i],
    ['byte order 2', () => mutate(good(), v => v.setUint8(0x265, 2)), /byte order/i],
    ['channel flag 7', () => mutate(good(), v => v.setInt32(0x00c, 7, true)), /enable flag/i],
    ['math enabled with codes per div 0', () => mutate(buildSiglent({ channels: [{ index: 0, codes: RAMP }], math: [{ index: 0, codes: RAMP }] }), v => v.setInt32(0x400, 0, true)), /math codes/i],
    ['math block missing', () => buildSiglent({ channels: [{ index: 0, codes: RAMP }], math: [{ index: 0, codes: RAMP }] }).slice(0, 0x1000 + 14), /does not fit/i],
    ['math store length too large', () => mutate(buildSiglent({ channels: [{ index: 0, codes: RAMP }], math: [{ index: 0, codes: RAMP }] }), v => v.setUint32(0x3d0, 0x7fffffff, true)), /does not fit/i],
  ];

  it.each(cases)('%s: no throw, ok=false with a readable message', (_name, make, message) => {
    const ab = make();
    const res = parseSiglentBin(ab, 'bad.bin');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.length).toBeGreaterThan(10);
      expect(res.error).toMatch(message);
    }
    expect(probeSiglentBinPoints(ab).ok).toBe(false);
    expect(() => classifyReadBinary('bad.bin', ab, 'bad')).not.toThrow();
  });

  it('survives hundreds of single-byte corruptions and truncations of the real files', () => {
    let seed = 0x2545f491;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (const e of EXPECTED) {
      const original = fixture(e.file);
      for (let round = 0; round < 250; round++) {
        const copy = original.slice(0);
        const u8 = new Uint8Array(copy);
        const flips = 1 + (next() % 3);
        for (let f = 0; f < flips; f++) u8[next() % 0x1000] = next() & 0xff;
        const input = round % 5 === 0 ? copy.slice(0, next() % copy.byteLength) : copy;
        const res = parseSiglentBin(input, 'fuzz.bin');
        const probe = probeSiglentBinPoints(input);
        if (res.ok) {
          expect(probe.ok).toBe(true);
          expect(res.parsed.traces.length).toBeGreaterThan(0);
          for (const trace of res.parsed.traces) {
            expect(trace.data.length).toBeGreaterThanOrEqual(2);
            expect(trace.data.every(p => Number.isFinite(p.freq) && Number.isFinite(p.amp))).toBe(true);
          }
        } else {
          expect(res.error.length).toBeGreaterThan(0);
          expect(probe.ok).toBe(false);
        }
        expect(() => classifyReadBinary('fuzz.bin', input, 'fuzz')).not.toThrow();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

describe('Siglent SDS .bin: detection', () => {
  function headerless(kind: 'f32' | 'i16' | 'u4first'): ArrayBuffer {
    const ab = new ArrayBuffer(16384);
    const v = new DataView(ab);
    if (kind === 'f32') for (let i = 0; i < 4096; i++) v.setFloat32(4 * i, Math.sin(i / 7) * 0.9, true);
    else if (kind === 'i16') for (let i = 0; i < 8192; i++) v.setInt16(2 * i, Math.round(Math.sin(i / 11) * 12000), true);
    else {
      v.setUint32(0, 4, true);
      for (let i = 1; i < 4096; i++) v.setFloat32(4 * i, Math.cos(i / 5), true);
    }
    return ab;
  }

  it.each(['f32', 'i16', 'u4first'] as const)('does not claim a headerless %s dump', (kind) => {
    const ab = headerless(kind);
    expect(detectBinarySignature(sniff(ab))).toBeNull();
    const read = classifyReadBinary('dump.bin', ab, 'id');
    if (read.kind !== 'data') throw new Error('expected data');
    expect(read.input.parsed?.format).toBe('needs-binary-wizard');
    expect(read.input.binaryWarning).toBeUndefined();
  });

  it('does not claim an all-zero buffer, a version-3 header or a header with bad channel flags', () => {
    expect(detectBinarySignature(sniff(new ArrayBuffer(8192)))).toBeNull();
    expect(detectBinarySignature(sniff(mutate(fixture('4v5-dc'), v => v.setUint32(0, 3, true))))).toBeNull();
    expect(detectBinarySignature(sniff(mutate(fixture('4v5-dc'), v => v.setInt32(0x0c, 2, true))))).toBeNull();
    expect(detectBinarySignature(sniff(mutate(fixture('4v5-dc'), v => v.setUint32(0x04, 0x800, true))))).toBeNull();
    expect(detectBinarySignature(sniff(mutate(fixture('4v5-dc'), v => v.setUint32(0x20, 17, true))))).toBeNull();
    expect(detectBinarySignature(sniff(mutate(fixture('4v5-dc'), v => v.setUint32(0x24, 13, true))))).toBeNull();
    expect(detectBinarySignature(sniff(mutate(fixture('4v5-dc'), v => v.setFloat64(0x18, Number.NaN, true))))).toBeNull();
  });

  it('keeps detecting by content only, never by file name', () => {
    const ab = fixture('4v5-dc');
    for (const name of ['capture.bin', 'capture.dat', 'capture', 'capture.txt']) {
      const read = classifyReadBinary(name, ab, 'id');
      if (read.kind !== 'data' || !read.input.parsed) throw new Error('no parse');
      expect(read.input.parsed.format).toBe('siglent-bin');
    }
  });

  const shipped: readonly [string, () => ArrayBuffer, string][] = [
    ['keysight_dsox_sample.bin', () => readArrayBuffer('test files/keysight_dsox_sample.bin'), 'wavebin'],
    ['rigol_dho804_sample.bin', () => readArrayBuffer('test files/rigol_dho804_sample.bin'), 'wavebin'],
    ['lecroy_sample.trc', () => readArrayBuffer('test files/lecroy_sample.trc'), 'lecroy-trc'],
    ['tektronix_sample.isf', () => readArrayBuffer('test files/tektronix_sample.isf'), 'tek-isf'],
    ['tektronix_sample.wfm', () => readArrayBuffer('test files/tektronix_sample.wfm'), 'tek-wfm'],
    ['owon_sample.bin', () => readArrayBuffer('test files/owon_sample.bin'), 'owon-bin'],
    ['tek analog_waveform.wfm', () => readArrayBuffer('tests/fixtures/tek-wfm/analog_waveform.wfm'), 'tek-wfm'],
    ['tek golden_analog.wfm', () => readArrayBuffer('tests/fixtures/tek-wfm/golden_analog.wfm'), 'tek-wfm'],
    ['tek FF5MhzX100From5Series.wfm', () => readArrayBuffer('tests/fixtures/tek-wfm/FF5MhzX100From5Series.wfm'), 'tek-wfm'],
    ['tek iq_waveform.wfm', () => readArrayBuffer('tests/fixtures/tek-wfm/iq_waveform.wfm'), 'tek-wfm'],
    ['tek digital_waveform.wfm', () => readArrayBuffer('tests/fixtures/tek-wfm/digital_waveform.wfm'), 'tek-wfm'],
  ];

  it.each(shipped)('%s still detects as %s', (_name, load, format) => {
    expect(detectBinarySignature(sniff(load()))).toBe(format);
  });

  it('every real Siglent fixture opens through classifyReadBinary with the raw buffer kept', () => {
    for (const e of EXPECTED) {
      const ab = fixture(e.file);
      const read = classifyReadBinary(`SDS814X-${e.file}.bin`, ab, `id-${e.file}`);
      expect(read.kind).toBe('data');
      if (read.kind !== 'data' || !read.input.parsed) throw new Error(`no parse for ${e.file}`);
      expect(read.input.parsed.format).toBe('siglent-bin');
      expect(read.input.parsed.traces).toHaveLength(1);
      expect(read.input.parsed.displayTraces).toHaveLength(1);
      expect(read.input.rawBinary).toBe(ab);
      expect(read.input.binaryConfig?.mode).toBe('auto-scope');
      expect(read.input.binaryWarning).toBeUndefined();
    }
  });

  it('routes a recognised-but-undecodable file to the binary wizard with a warning', () => {
    const ab = mutate(fixture('4v5-dc'), v => v.setFloat64(0x244, 0, true));
    expect(detectBinarySignature(sniff(ab))).toBe('siglent-bin');
    const read = classifyReadBinary('bad.bin', ab, 'bad');
    if (read.kind !== 'data') throw new Error('expected data');
    expect(read.input.parsed?.format).toBe('needs-binary-wizard');
    expect(read.input.binaryWarning).toMatch(/probe/i);
    expect(read.input.rawBinary).toBe(ab);
  });

  it('routes a truncated-sample file to the wizard with the does-not-fit warning', () => {
    const ab = fixture('4v5-dc').slice(0, 0x1000 + 1000);
    const read = classifyReadBinary('cut.bin', ab, 'cut');
    if (read.kind !== 'data') throw new Error('expected data');
    expect(read.input.parsed?.format).toBe('needs-binary-wizard');
    expect(read.input.binaryWarning).toMatch(/does not fit/i);
  });
});

// ---------------------------------------------------------------------------
// Slice and reduction
// ---------------------------------------------------------------------------

describe('Siglent SDS .bin: slice and reduction options', () => {
  it('slices the samples and keeps the time axis aligned', () => {
    const full = traceOf(mustParse(fixture('4v5-dc')), 0);
    const sliced = traceOf(mustParse(fixture('4v5-dc'), 'dc.bin', { slice: { start: 100, count: 50 } }), 0);
    expect(sliced.amps).toEqual(full.amps.slice(100, 150));
    expect(at(sliced.xs, 0)).toBeCloseTo(at(full.xs, 100), 12);
    expect(at(sliced.xs, 49)).toBeCloseTo(at(full.xs, 149), 12);
  });

  it('clamps a window past the end and rejects windows with fewer than two samples', () => {
    expect(traceOf(mustParse(fixture('3v0-probe1x'), 'a.bin', { slice: { start: 1990, count: 100 } }), 0).amps).toHaveLength(10);
    expect(parseSiglentBin(fixture('3v0-probe1x'), 'a.bin', { slice: { start: 1999, count: 5 } }).ok).toBe(false);
    expect(parseSiglentBin(fixture('3v0-probe1x'), 'a.bin', { slice: { start: 99999, count: 5 } }).ok).toBe(false);
    expect(parseSiglentBin(fixture('3v0-probe1x'), 'a.bin', { slice: { start: 0, count: 1 } }).ok).toBe(false);
  });

  it('decimates by boxcar averaging', () => {
    const full = traceOf(mustParse(fixture('4v5-dc')), 0).amps;
    const res = mustParse(fixture('4v5-dc'), 'dc.bin', { reduction: { mode: 'decimate', factor: 10 } });
    const { amps, xs, trace } = traceOf(res, 0);
    expect(amps).toHaveLength(1000);
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += at(full, i);
    expect(at(amps, 0)).toBeCloseTo(sum / 10, 9);
    expect(at(xs, 1) - at(xs, 0)).toBeCloseTo(5e-6, 12);
    expect(trace.isUniform).toBe(true);
    expect(res.parsed.meta['Decimation']).toMatch(/Boxcar decimated 10/);
  });

  it('reduces to a min-max envelope that keeps the extremes', () => {
    const full = stats(traceOf(mustParse(fixture('4v5-dc')), 0).amps);
    const res = mustParse(fixture('4v5-dc'), 'dc.bin', { reduction: { mode: 'envelope', targetPoints: 200 } });
    const { trace, amps } = traceOf(res, 0);
    expect(trace.envelopeOf).toBe(10000);
    expect(amps.length).toBeLessThanOrEqual(200);
    expect(Math.min(...amps)).toBeCloseTo(full.min, 9);
    expect(Math.max(...amps)).toBeCloseTo(full.max, 9);
  });

  it('applies the same slice to every trace in a multi-trace file', () => {
    const ab = buildSiglent({ channels: [{ index: 0, codes: [...RAMP, ...RAMP] }, { index: 1, codes: [...RAMP, ...RAMP] }] });
    const res = mustParse(ab, 'm.bin', { slice: { start: 2, count: 4 } });
    expect(res.parsed.traces).toHaveLength(2);
    for (const i of [0, 1]) expect(traceOf(res, i).amps).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// raw-binary integration
// ---------------------------------------------------------------------------

describe('Siglent SDS .bin: raw-binary parser override', () => {
  it('forcing siglent-bin through the import-settings path parses, slices and honours overrides', () => {
    resetParserFileCounter();
    const ab = fixture('4v5-dc');
    const base = defaultBinaryConfig('SDS814X-4v5-dc.bin', ab.byteLength, 'siglent-bin');
    expect(base.mode).toBe('auto-scope');

    const forced = parseBinaryWithConfig(ab, 'SDS814X-4v5-dc.bin', { ...base, parserOverride: 'siglent-bin', startSample: 10, sampleCount: 5 });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.parsed.format).toBe('siglent-bin');
    expect(forced.parsed.traces[0]?.data).toHaveLength(5);

    const scaled = parseBinaryWithConfig(ab, 'SDS814X-4v5-dc.bin', { ...base, parserOverride: 'siglent-bin', startSample: 10, sampleCount: 5, yMult: 10 });
    expect(scaled.ok).toBe(true);
    if (!scaled.ok) return;
    expect(scaled.parsed.traces[0]?.data[0]?.amp).toBeCloseTo((forced.parsed.traces[0]?.data[0]?.amp ?? Number.NaN) * 10, 12);
  });

  it('forcing it on a non-Siglent buffer fails with a Siglent message instead of silently falling back', () => {
    const owon = readArrayBuffer('test files/owon_sample.bin');
    const res = parseBinaryWithConfig(owon, 'owon_sample.bin', { ...defaultBinaryConfig('owon_sample.bin', owon.byteLength, 'owon-bin'), parserOverride: 'siglent-bin' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Siglent/);
  });

  it('accepts siglent-bin as a saved parserOverride setting', () => {
    const fallback = defaultBinaryConfig('a.bin', 100, null);
    const parsed = parseBinarySettings(JSON.stringify({ kind: 'mergen-binary-import-settings', version: 1, config: { parserOverride: 'siglent-bin' } }), fallback);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.config.parserOverride).toBe('siglent-bin');
  });

  it('previews a multi-trace file through the wizard engine with its point count and header summary', () => {
    const ab = fixture('math-f1');
    const cfg = { ...defaultBinaryConfig('SDS814X-math-f1.bin', ab.byteLength, 'siglent-bin'), parserOverride: 'siglent-bin' as const };
    const preview = previewBinaryImport(ab, 'SDS814X-math-f1.bin', cfg);
    expect(preview.totalAvailableSamples).toBe(10000);
    expect(preview.headerSummary).toMatch(/Siglent/);
  });
});
