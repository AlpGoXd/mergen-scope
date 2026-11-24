import { describe, expect, it } from 'vitest';
import { parseNpyBin, probeNpyBinPoints } from '../../src/domain/parsers/npy-bin';
import { resetParserFileCounter } from '../../src/domain/parsers/rs-dat';

interface BuildNpyOptions {
  readonly version?: 1 | 2 | 3;
  readonly headerDict?: string;
  readonly descr?: string;
  readonly fortranOrder?: boolean;
  readonly shapeText?: string;
  readonly payloadBytes?: number;
  readonly writePayload?: (view: DataView, offset: number) => void;
}

function buildNpyBuffer(opts: BuildNpyOptions): ArrayBuffer {
  const version = opts.version ?? 1;
  const descr = opts.descr ?? '<f4';
  const fortran = opts.fortranOrder ? 'True' : 'False';
  const shapeText = opts.shapeText ?? '(4,)';
  const dictText = opts.headerDict ?? `{'descr': '${descr}', 'fortran_order': ${fortran}, 'shape': ${shapeText}, }`;

  const prefixLen = version === 1 ? 10 : 12;
  const encoder = new TextEncoder();
  const rawHeader = encoder.encode(dictText);
  // Pad with spaces + '\n' to 64-byte alignment (as NumPy does)
  const unaligned = prefixLen + rawHeader.length + 1;
  const padLen = (64 - (unaligned % 64)) % 64;
  const headerLen = rawHeader.length + padLen + 1;

  const payloadLen = opts.payloadBytes ?? 0;
  const totalLen = prefixLen + headerLen + payloadLen;
  const buf = new ArrayBuffer(totalLen);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);

  bytes.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59], 0);
  view.setUint8(6, version);
  view.setUint8(7, 0);
  if (version === 1) {
    view.setUint16(8, headerLen, true);
  } else {
    view.setUint32(8, headerLen, true);
  }

  bytes.set(rawHeader, prefixLen);
  for (let i = 0; i < padLen; i++) {
    bytes[prefixLen + rawHeader.length + i] = 0x20;
  }
  bytes[prefixLen + headerLen - 1] = 0x0a;

  if (opts.writePayload) {
    opts.writePayload(view, prefixLen + headerLen);
  }
  return buf;
}

describe('NumPy .npy binary parser (npy-bin)', () => {
  it('parses v1.0 and v2.0 (and v3.0) headers with standard metadata and summaryText', () => {
    resetParserFileCounter();
    for (const version of [1, 2, 3] as const) {
      const ab = buildNpyBuffer({
        version,
        descr: '<f4',
        shapeText: '(4,)',
        payloadBytes: 4 * 4,
        writePayload: (view, off) => {
          [1.5, -2.25, 3.75, 4.0].forEach((v, i) => view.setFloat32(off + i * 4, v, true));
        },
      });
      const res = parseNpyBin(ab, `sig_v${version}.npy`);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.parsed.format).toBe('npy');
      expect(res.parsed.meta['Format']).toBe(`NumPy (.npy v${version}.0)`);
      expect(res.parsed.meta['Dtype']).toBe('<f4');
      expect(res.parsed.meta['Shape']).toBe('(4,)');
      expect(res.parsed.meta['Order']).toBe('C');
      expect(res.parsed.meta['Channels']).toBe('1');
      expect(res.parsed.meta['Points']).toBe('4');
      expect(res.summaryText).toContain("'descr': '<f4'");
      expect(res.parsed.traces).toHaveLength(1);

      const trace = res.parsed.traces[0];
      expect(trace?.domain).toBe('time');
      expect(trace?.family).toBe('waveform');
      expect(trace?.units).toEqual({ x: 'unitless', y: null });
      expect(trace?.data).toEqual([
        { freq: 0, amp: 1.5 },
        { freq: 1, amp: -2.25 },
        { freq: 2, amp: 3.75 },
        { freq: 3, amp: 4.0 },
      ]);
      expect(res.parsed.datasets).toHaveLength(1);
      expect(res.parsed.displayTraces).toHaveLength(1);
      expect(res.parsed.columnIdentities).toEqual([{ index: 0, header: 'CH1' }]);
    }
  });

  it('decodes 1D float dtypes: <f4, >f4, <f8, and <f2 (IEEE 754 binary16)', () => {
    resetParserFileCounter();

    // >f4 big-endian float32
    const beF4 = buildNpyBuffer({
      descr: '>f4',
      shapeText: '(3,)',
      payloadBytes: 12,
      writePayload: (view, off) => {
        [0.5, -1.25, 9.5].forEach((v, i) => view.setFloat32(off + i * 4, v, false));
      },
    });
    const resBeF4 = parseNpyBin(beF4, 'be_f4.npy');
    expect(resBeF4.ok).toBe(true);
    if (resBeF4.ok) {
      expect(resBeF4.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([0.5, -1.25, 9.5]);
    }

    // <f8 little-endian float64
    const leF8 = buildNpyBuffer({
      descr: '<f8',
      shapeText: '(3,)',
      payloadBytes: 24,
      writePayload: (view, off) => {
        [1e-9, -3.141592653589793, 1e12].forEach((v, i) => view.setFloat64(off + i * 8, v, true));
      },
    });
    const resLeF8 = parseNpyBin(leF8, 'le_f8.npy');
    expect(resLeF8.ok).toBe(true);
    if (resLeF8.ok) {
      expect(resLeF8.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([1e-9, -3.141592653589793, 1e12]);
    }

    // <f2 float16: 1.0 (0x3c00), -2.0 (0xc000), 0.0 (0x0000), smallest subnormal (0x0001), max finite (0x7bff)
    const leF2 = buildNpyBuffer({
      descr: '<f2',
      shapeText: '(5,)',
      payloadBytes: 10,
      writePayload: (view, off) => {
        [0x3c00, 0xc000, 0x0000, 0x0001, 0x7bff].forEach((bits, i) => view.setUint16(off + i * 2, bits, true));
      },
    });
    const resLeF2 = parseNpyBin(leF2, 'le_f2.npy');
    expect(resLeF2.ok).toBe(true);
    if (resLeF2.ok) {
      const amps = resLeF2.parsed.traces[0]?.data.map((p) => p.amp) ?? [];
      expect(amps[0]).toBe(1);
      expect(amps[1]).toBe(-2);
      expect(amps[2]).toBe(0);
      expect(amps[3]).toBeCloseTo(2 ** -24, 15);
      expect(amps[4]).toBe(65504);
    }
  });

  it('decodes 1D integer dtypes: |i1, |u1, <i2, >i2, <u2, <i4, <u4, <i8, <u8', () => {
    resetParserFileCounter();
    const cases: readonly {
      readonly descr: string;
      readonly bytesPerElem: number;
      readonly expected: readonly number[];
      readonly write: (view: DataView, off: number) => void;
    }[] = [
      {
        descr: '|i1',
        bytesPerElem: 1,
        expected: [-128, -1, 127],
        write: (v, o) => { v.setInt8(o, -128); v.setInt8(o + 1, -1); v.setInt8(o + 2, 127); },
      },
      {
        descr: '|u1',
        bytesPerElem: 1,
        expected: [0, 128, 255],
        write: (v, o) => { v.setUint8(o, 0); v.setUint8(o + 1, 128); v.setUint8(o + 2, 255); },
      },
      {
        descr: '<i2',
        bytesPerElem: 2,
        expected: [-32768, 0, 32767],
        write: (v, o) => { v.setInt16(o, -32768, true); v.setInt16(o + 2, 0, true); v.setInt16(o + 4, 32767, true); },
      },
      {
        descr: '>i2',
        bytesPerElem: 2,
        expected: [-1234, 42, 30000],
        write: (v, o) => { v.setInt16(o, -1234, false); v.setInt16(o + 2, 42, false); v.setInt16(o + 4, 30000, false); },
      },
      {
        descr: '<u2',
        bytesPerElem: 2,
        expected: [0, 1000, 65535],
        write: (v, o) => { v.setUint16(o, 0, true); v.setUint16(o + 2, 1000, true); v.setUint16(o + 4, 65535, true); },
      },
      {
        descr: '<i4',
        bytesPerElem: 4,
        expected: [-2147483648, 0, 2147483647],
        write: (v, o) => { v.setInt32(o, -2147483648, true); v.setInt32(o + 4, 0, true); v.setInt32(o + 8, 2147483647, true); },
      },
      {
        descr: '<u4',
        bytesPerElem: 4,
        expected: [0, 100000, 4294967295],
        write: (v, o) => { v.setUint32(o, 0, true); v.setUint32(o + 4, 100000, true); v.setUint32(o + 8, 4294967295, true); },
      },
      {
        descr: '<i8',
        bytesPerElem: 8,
        expected: [-5000000000, 0, 5000000000],
        write: (v, o) => {
          v.setBigInt64(o, -5000000000n, true);
          v.setBigInt64(o + 8, 0n, true);
          v.setBigInt64(o + 16, 5000000000n, true);
        },
      },
      {
        descr: '<u8',
        bytesPerElem: 8,
        expected: [0, 123, 9000000000],
        write: (v, o) => {
          v.setBigUint64(o, 0n, true);
          v.setBigUint64(o + 8, 123n, true);
          v.setBigUint64(o + 16, 9000000000n, true);
        },
      },
    ];

    for (const tc of cases) {
      const ab = buildNpyBuffer({
        descr: tc.descr,
        shapeText: '(3,)',
        payloadBytes: 3 * tc.bytesPerElem,
        writePayload: tc.write,
      });
      const res = parseNpyBin(ab, `${tc.descr}.npy`);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.parsed.traces[0]?.data.map((p) => p.amp)).toEqual(tc.expected);
    }
  });

  it('parses 2D (N, 2) arrays in both C-order (interleaved) and Fortran-order (planar)', () => {
    resetParserFileCounter();
    // 4 samples x 2 channels
    // CH1 = [10, 20, 30, 40], CH2 = [1, 2, 3, 4]
    const cOrder = buildNpyBuffer({
      descr: '<f4',
      fortranOrder: false,
      shapeText: '(4, 2)',
      payloadBytes: 8 * 4,
      writePayload: (view, off) => {
        const interleaved = [10, 1, 20, 2, 30, 3, 40, 4];
        interleaved.forEach((val, idx) => view.setFloat32(off + idx * 4, val, true));
      },
    });
    const resC = parseNpyBin(cOrder, 'c_order.npy');
    expect(resC.ok).toBe(true);
    if (resC.ok) {
      expect(resC.parsed.meta['Order']).toBe('C');
      expect(resC.parsed.meta['Shape']).toBe('(4, 2)');
      expect(resC.parsed.traces).toHaveLength(2);
      expect(resC.parsed.traces[0]?.dn).toBe('c_order.npy CH1');
      expect(resC.parsed.traces[1]?.dn).toBe('c_order.npy CH2');
      expect(resC.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([10, 20, 30, 40]);
      expect(resC.parsed.traces[1]?.data.map((p) => p.amp)).toEqual([1, 2, 3, 4]);
    }

    const fOrder = buildNpyBuffer({
      descr: '<f4',
      fortranOrder: true,
      shapeText: '(4, 2)',
      payloadBytes: 8 * 4,
      writePayload: (view, off) => {
        const planar = [10, 20, 30, 40, 1, 2, 3, 4];
        planar.forEach((val, idx) => view.setFloat32(off + idx * 4, val, true));
      },
    });
    const resF = parseNpyBin(fOrder, 'f_order.npy');
    expect(resF.ok).toBe(true);
    if (resF.ok) {
      expect(resF.parsed.meta['Order']).toBe('Fortran');
      expect(resF.parsed.traces).toHaveLength(2);
      expect(resF.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([10, 20, 30, 40]);
      expect(resF.parsed.traces[1]?.data.map((p) => p.amp)).toEqual([1, 2, 3, 4]);
    }
  });

  it('parses 2D (2, N) channel-first arrays (cols > 16) in C-order and Fortran-order', () => {
    resetParserFileCounter();
    const n = 20;
    const ch1 = Array.from({ length: n }, (_, i) => i * 2);
    const ch2 = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : -i));

    // C-order (2, 20): planar [ch1..., ch2...]
    const cPlanar = buildNpyBuffer({
      descr: '<i2',
      fortranOrder: false,
      shapeText: `(2, ${n})`,
      payloadBytes: 2 * n * 2,
      writePayload: (view, off) => {
        const flat = [...ch1, ...ch2];
        flat.forEach((val, idx) => view.setInt16(off + idx * 2, val, true));
      },
    });
    const resC = parseNpyBin(cPlanar, 'ch_first_c.npy');
    expect(resC.ok).toBe(true);
    if (resC.ok) {
      expect(resC.parsed.meta['Channels']).toBe('2');
      expect(resC.parsed.meta['Points']).toBe(String(n));
      expect(resC.parsed.traces[0]?.data.map((p) => p.amp)).toEqual(ch1);
      expect(resC.parsed.traces[1]?.data.map((p) => p.amp)).toEqual(ch2);
    }

    // Fortran-order (2, 20): interleaved [ch1[0], ch2[0], ch1[1], ch2[1], ...]
    const fInterleaved = buildNpyBuffer({
      descr: '<i2',
      fortranOrder: true,
      shapeText: `(2, ${n})`,
      payloadBytes: 2 * n * 2,
      writePayload: (view, off) => {
        for (let i = 0; i < n; i++) {
          view.setInt16(off + (i * 2) * 2, ch1[i] ?? 0, true);
          view.setInt16(off + (i * 2 + 1) * 2, ch2[i] ?? 0, true);
        }
      },
    });
    const resF = parseNpyBin(fInterleaved, 'ch_first_f.npy');
    expect(resF.ok).toBe(true);
    if (resF.ok) {
      expect(resF.parsed.traces[0]?.data.map((p) => p.amp)).toEqual(ch1);
      expect(resF.parsed.traces[1]?.data.map((p) => p.amp)).toEqual(ch2);
    }
  });

  it('splits complex <c8 and <c16 arrays into I and Q traces per channel', () => {
    resetParserFileCounter();

    // 1D <c8 -> I and Q
    const c8 = buildNpyBuffer({
      descr: '<c8',
      shapeText: '(3,)',
      payloadBytes: 3 * 8,
      writePayload: (view, off) => {
        const pairs: readonly [number, number][] = [[1, -1], [2, -2], [3, -3]];
        pairs.forEach(([re, im], i) => {
          view.setFloat32(off + i * 8, re, true);
          view.setFloat32(off + i * 8 + 4, im, true);
        });
      },
    });
    const probeC8 = probeNpyBinPoints(c8);
    expect(probeC8).toEqual({ ok: true, totalPoints: 6 });

    const resC8 = parseNpyBin(c8, 'iq_c8.npy');
    expect(resC8.ok).toBe(true);
    if (resC8.ok) {
      expect(resC8.parsed.traces).toHaveLength(2);
      expect(resC8.parsed.traces[0]?.dn).toBe('iq_c8.npy I');
      expect(resC8.parsed.traces[1]?.dn).toBe('iq_c8.npy Q');
      expect(resC8.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([1, 2, 3]);
      expect(resC8.parsed.traces[1]?.data.map((p) => p.amp)).toEqual([-1, -2, -3]);
    }

    // 2D (3, 2) <c16 -> CH1 I, CH1 Q, CH2 I, CH2 Q
    const c16 = buildNpyBuffer({
      descr: '<c16',
      shapeText: '(3, 2)',
      payloadBytes: 6 * 16,
      writePayload: (view, off) => {
        const pairs: readonly [number, number][] = [
          [10, 100], [20, 200],
          [11, 101], [21, 201],
          [12, 102], [22, 202],
        ];
        pairs.forEach(([re, im], idx) => {
          view.setFloat64(off + idx * 16, re, true);
          view.setFloat64(off + idx * 16 + 8, im, true);
        });
      },
    });
    expect(probeNpyBinPoints(c16)).toEqual({ ok: true, totalPoints: 12 });

    const resC16 = parseNpyBin(c16, 'iq_2ch.npy');
    expect(resC16.ok).toBe(true);
    if (resC16.ok) {
      expect(resC16.parsed.traces).toHaveLength(4);
      expect(resC16.parsed.columnIdentities?.map((c) => c.header)).toEqual(['CH1 I', 'CH1 Q', 'CH2 I', 'CH2 Q']);
      expect(resC16.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([10, 11, 12]);
      expect(resC16.parsed.traces[1]?.data.map((p) => p.amp)).toEqual([100, 101, 102]);
      expect(resC16.parsed.traces[2]?.data.map((p) => p.amp)).toEqual([20, 21, 22]);
      expect(resC16.parsed.traces[3]?.data.map((p) => p.amp)).toEqual([200, 201, 202]);
    }
  });

  it('probes point counts without allocating arrays and supports slice + reduction options', () => {
    resetParserFileCounter();
    const total = 100;
    const ab = buildNpyBuffer({
      descr: '<f4',
      shapeText: `(${total}, 2)`,
      payloadBytes: total * 2 * 4,
      writePayload: (view, off) => {
        for (let i = 0; i < total; i++) {
          view.setFloat32(off + (i * 2) * 4, i, true);
          view.setFloat32(off + (i * 2 + 1) * 4, i * 10, true);
        }
      },
    });

    expect(probeNpyBinPoints(ab)).toEqual({ ok: true, totalPoints: 200 });

    const sliced = parseNpyBin(ab, 'sliced.npy', {
      slice: { start: 10, count: 20 },
      reduction: { mode: 'decimate', factor: 4 },
    });
    expect(sliced.ok).toBe(true);
    if (sliced.ok) {
      expect(sliced.parsed.meta['Decimation']).toContain('Boxcar decimated 4×');
      expect(sliced.parsed.meta['Decimation']).toContain('(per ch)');
      expect(sliced.parsed.traces[0]?.data).toEqual([
        { freq: 10, amp: 11.5 },
        { freq: 14, amp: 15.5 },
        { freq: 18, amp: 19.5 },
        { freq: 22, amp: 23.5 },
        { freq: 26, amp: 27.5 },
      ]);
      expect(sliced.parsed.traces[1]?.data.map((p) => p.amp)).toEqual([115, 155, 195, 235, 275]);
    }
  });

  it('rejects malformed headers, unsupported dtypes, invalid shapes, and truncated payloads cleanly', () => {
    resetParserFileCounter();

    // Truncated < 10 bytes
    expect(parseNpyBin(new ArrayBuffer(5), 'tiny.npy').ok).toBe(false);
    expect(probeNpyBinPoints(new ArrayBuffer(5)).ok).toBe(false);

    // Wrong magic
    const badMagic = buildNpyBuffer({ descr: '<f4', shapeText: '(4,)', payloadBytes: 16 });
    new Uint8Array(badMagic)[0] = 0x00;
    expect(parseNpyBin(badMagic, 'bad_magic.npy').ok).toBe(false);

    // Unsupported version 4.0
    const badVer = buildNpyBuffer({ descr: '<f4', shapeText: '(4,)', payloadBytes: 16 });
    new Uint8Array(badVer)[6] = 4;
    const verRes = parseNpyBin(badVer, 'v4.npy');
    expect(verRes.ok).toBe(false);

    // Header length > 1MB
    const hugeHdr = new ArrayBuffer(64);
    const hugeBytes = new Uint8Array(hugeHdr);
    hugeBytes.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 2, 0], 0);
    new DataView(hugeHdr).setUint32(8, 2 * 1024 * 1024, true);
    expect(parseNpyBin(hugeHdr, 'huge_hdr.npy').ok).toBe(false);

    // Malformed Python header dict
    const badDict = buildNpyBuffer({ headerDict: "{'descr': '<f4', broken}", payloadBytes: 16 });
    expect(parseNpyBin(badDict, 'bad_dict.npy').ok).toBe(false);

    // Unsupported string dtype
    const strDtype = buildNpyBuffer({ descr: '<U8', shapeText: '(4,)', payloadBytes: 4 * 32 });
    const strRes = parseNpyBin(strDtype, 'str.npy');
    expect(strRes.ok).toBe(false);
    if (!strRes.ok) expect(strRes.error).toContain('<U8');

    // Structured dtype
    const structDtype = buildNpyBuffer({
      headerDict: "{'descr': [('x', '<f4'), ('y', '<f4')], 'fortran_order': False, 'shape': (4,)}",
      payloadBytes: 32,
    });
    const structRes = parseNpyBin(structDtype, 'struct.npy');
    expect(structRes.ok).toBe(false);

    // 0D scalar
    const scalar0D = buildNpyBuffer({ descr: '<f4', shapeText: '()', payloadBytes: 4 });
    expect(parseNpyBin(scalar0D, '0d.npy').ok).toBe(false);

    // 3D array
    const arr3D = buildNpyBuffer({ descr: '<f4', shapeText: '(2, 3, 4)', payloadBytes: 24 * 4 });
    expect(parseNpyBin(arr3D, '3d.npy').ok).toBe(false);

    // > 16 channels
    const tooManyCh = buildNpyBuffer({ descr: '<f4', shapeText: '(20, 17)', payloadBytes: 20 * 17 * 4 });
    expect(parseNpyBin(tooManyCh, '17ch.npy').ok).toBe(false);

    // < 2 samples
    const oneSample = buildNpyBuffer({ descr: '<f4', shapeText: '(1,)', payloadBytes: 4 });
    expect(parseNpyBin(oneSample, '1pt.npy').ok).toBe(false);

    // Truncated payload
    const truncated = buildNpyBuffer({ descr: '<f8', shapeText: '(10,)', payloadBytes: 40 });
    expect(parseNpyBin(truncated, 'trunc.npy').ok).toBe(false);
    expect(probeNpyBinPoints(truncated).ok).toBe(false);
  });
});
