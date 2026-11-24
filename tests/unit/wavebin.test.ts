import { describe, expect, it } from 'vitest';
import { detectBinarySignature } from '../../src/domain/parsers/binary-detect';
import { parseWavebin } from '../../src/domain/parsers/wavebin';
import { classifyReadBinary } from '../../src/domain/open-file-read';
import { prepareOpenInput } from '../../src/domain/prepare-open-input';
import { resetParserFileCounter } from '../../src/domain/parsers/rs-dat';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';
import { initialWorkspaceEngine, snapshotFromWorkspace, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';

interface SynthBuffer {
  readonly bufferType?: number;
  readonly bytesPerPoint?: number;
  readonly dataHeaderSize?: number;
  readonly samples?: readonly number[];
  readonly rawBytes?: Uint8Array;
}

interface SynthWaveform {
  readonly headerSize?: number;
  readonly waveformType?: number;
  readonly points?: number;
  readonly xOrigin?: number;
  readonly xIncrement?: number;
  readonly xUnits?: number;
  readonly yUnits?: number;
  readonly date?: string;
  readonly time?: string;
  readonly frameString?: string;
  readonly label?: string;
  readonly segmentIndex?: number;
  readonly buffers: readonly SynthBuffer[];
}

function writeAscii(bytes: Uint8Array, offset: number, maxLen: number, text: string): void {
  for (let i = 0; i < Math.min(maxLen - 1, text.length); i++) {
    bytes[offset + i] = text.charCodeAt(i) & 0x7f;
  }
}

/** Build a valid Keysight ("AG") or Rigol ("RG") binary .bin file buffer for testing. */
function buildWavebin(options: {
  cookie: 'AG' | 'RG';
  version?: string;
  fileHeaderBytes?: 12 | 16;
  waveforms: readonly SynthWaveform[];
}): ArrayBuffer {
  const fileHeaderBytes = options.fileHeaderBytes ?? (options.cookie === 'RG' ? 16 : 12);
  const version = options.version ?? (options.cookie === 'AG' ? '10' : '01');

  let totalBytes = fileHeaderBytes;
  for (const wfm of options.waveforms) {
    totalBytes += wfm.headerSize ?? 140;
    for (const buf of wfm.buffers) {
      const dhSize = buf.dataHeaderSize ?? (options.cookie === 'RG' && fileHeaderBytes === 16 ? 16 : 12);
      const payloadSize = buf.rawBytes ? buf.rawBytes.byteLength : (buf.samples?.length ?? 0) * (buf.bytesPerPoint ?? 4);
      totalBytes += dhSize + payloadSize;
    }
  }

  const ab = new ArrayBuffer(totalBytes);
  const view = new DataView(ab);
  const bytes = new Uint8Array(ab);

  bytes[0] = options.cookie.charCodeAt(0);
  bytes[1] = options.cookie.charCodeAt(1);
  bytes[2] = version.charCodeAt(0);
  bytes[3] = version.charCodeAt(1);
  if (fileHeaderBytes === 16) {
    view.setUint32(4, totalBytes >>> 0, true);
    view.setUint32(8, Math.floor(totalBytes / 4294967296), true);
    view.setUint32(12, options.waveforms.length, true);
  } else {
    view.setUint32(4, totalBytes, true);
    view.setUint32(8, options.waveforms.length, true);
  }

  let cursor = fileHeaderBytes;
  for (const wfm of options.waveforms) {
    const headerSize = wfm.headerSize ?? 140;
    const points = wfm.points ?? wfm.buffers[0]?.samples?.length ?? 0;
    view.setInt32(cursor, headerSize, true);
    view.setInt32(cursor + 4, wfm.waveformType ?? 1, true);
    view.setInt32(cursor + 8, wfm.buffers.length, true);
    view.setInt32(cursor + 12, points, true);
    view.setInt32(cursor + 16, 1, true);
    view.setFloat32(cursor + 20, points * (wfm.xIncrement ?? 1e-6), true);
    view.setFloat64(cursor + 24, wfm.xOrigin ?? 0, true);
    view.setFloat64(cursor + 32, wfm.xIncrement ?? 1e-6, true);
    view.setFloat64(cursor + 40, wfm.xOrigin ?? 0, true);
    view.setInt32(cursor + 48, wfm.xUnits ?? 2, true);
    view.setInt32(cursor + 52, wfm.yUnits ?? 1, true);
    writeAscii(bytes, cursor + 56, 16, wfm.date ?? '24 NOV 2026');
    writeAscii(bytes, cursor + 72, 16, wfm.time ?? '04:20:00');
    writeAscii(bytes, cursor + 88, 24, wfm.frameString ?? (options.cookie === 'AG' ? 'DSO-X 1102G:CN000001' : 'DHO804:DHO8A0001'));
    writeAscii(bytes, cursor + 112, 16, wfm.label ?? 'CH1');
    view.setFloat64(cursor + 128, 0, true);
    view.setUint32(cursor + 136, wfm.segmentIndex ?? 0, true);
    cursor += headerSize;

    for (const buf of wfm.buffers) {
      const dhSize = buf.dataHeaderSize ?? (options.cookie === 'RG' && fileHeaderBytes === 16 ? 16 : 12);
      const bpp = buf.bytesPerPoint ?? 4;
      const payloadSize = buf.rawBytes ? buf.rawBytes.byteLength : (buf.samples?.length ?? 0) * bpp;
      view.setInt32(cursor, dhSize, true);
      view.setInt16(cursor + 4, buf.bufferType ?? 1, true);
      view.setInt16(cursor + 6, bpp, true);
      if (dhSize >= 16) {
        view.setUint32(cursor + 8, payloadSize >>> 0, true);
        view.setUint32(cursor + 12, Math.floor(payloadSize / 4294967296), true);
      } else {
        view.setUint32(cursor + 8, payloadSize, true);
      }
      cursor += dhSize;

      if (buf.rawBytes) {
        bytes.set(buf.rawBytes, cursor);
      } else if (buf.samples) {
        for (let i = 0; i < buf.samples.length; i++) {
          view.setFloat32(cursor + i * 4, buf.samples[i] ?? 0, true);
        }
      }
      cursor += payloadSize;
    }
  }
  return ab;
}

describe('binary signature detection', () => {
  it('recognizes Keysight AG and Rigol RG binary headers regardless of filename', () => {
    const ag = buildWavebin({ cookie: 'AG', waveforms: [{ label: 'CH1', buffers: [{ samples: [0, 1, 2] }] }] });
    const rg = buildWavebin({ cookie: 'RG', waveforms: [{ label: 'CH1', buffers: [{ samples: [0, 1, 2] }] }] });
    expect(detectBinarySignature(new Uint8Array(ag, 0, 16))).toBe('wavebin');
    expect(detectBinarySignature(new Uint8Array(rg, 0, 16))).toBe('wavebin');
  });

  it('never false-positives on plain CSV or text starting with AG or RG', () => {
    const enc = new TextEncoder();
    expect(detectBinarySignature(enc.encode('AG,CH1,CH2\n0,1,2\n'))).toBeNull();
    expect(detectBinarySignature(enc.encode('RG01,100,200\n0,1,2\n'))).toBeNull();
    expect(detectBinarySignature(enc.encode('AG10,Voltage,Time\n'))).toBeNull();
    expect(detectBinarySignature(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});

describe('wavebin parser (Keysight AG & Rigol RG .bin)', () => {
  it('parses a multi-channel Keysight AG .bin capture with exact timing, voltages and metadata', () => {
    resetParserFileCounter();
    const buffer = buildWavebin({
      cookie: 'AG',
      version: '10',
      waveforms: [
        { label: 'CH1', xOrigin: -0.001, xIncrement: 1e-4, xUnits: 2, yUnits: 1, buffers: [{ samples: [0.5, 1.0, -0.5, 0.25] }] },
        { label: 'CH2', xOrigin: -0.001, xIncrement: 1e-4, xUnits: 2, yUnits: 4, buffers: [{ samples: [0.1, 0.2, 0.3, 0.4] }] },
      ],
    });

    const result = parseWavebin(buffer, 'scope_01.bin');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.format).toBe('wavebin');
    expect(result.parsed.traces).toHaveLength(2);
    expect(result.parsed.traces[0]).toMatchObject({
      domain: 'time',
      family: 'waveform',
      units: { x: 's', y: 'V' },
      dn: 'scope_01.bin CH1',
    });
    expect(result.parsed.traces[1]?.units).toEqual({ x: 's', y: 'A' });
    expect(result.parsed.traces[0]?.data[0]?.freq).toBeCloseTo(-0.001, 9);
    expect(result.parsed.traces[0]?.data[1]?.freq).toBeCloseTo(-0.0009, 9);
    expect(result.parsed.traces[0]?.data[1]?.amp).toBeCloseTo(1.0, 5);
    expect(result.parsed.meta).toMatchObject({
      Format: 'Keysight / Agilent Binary (AG v10)',
      Instrument: 'DSO-X 1102G:CN000001',
      Channels: '2',
      Points: '4',
      'Sample Rate': { value: 10000, unit: 'Hz' },
    });
    expect(result.parsed.columnIdentities).toEqual([
      { index: 0, header: 'CH1' },
      { index: 1, header: 'CH2' },
    ]);
    expect(result.parsed.datasets).toHaveLength(2);
    expect(result.parsed.displayTraces).toHaveLength(2);
  });

  it('parses Rigol RG 16-byte and 12-byte headers, plus 148-byte DS70000 waveform headers', () => {
    resetParserFileCounter();
    const rg16 = buildWavebin({
      cookie: 'RG',
      version: '03',
      fileHeaderBytes: 16,
      waveforms: [
        { headerSize: 148, label: 'CH1', xOrigin: 0, xIncrement: 2e-9, buffers: [{ dataHeaderSize: 16, samples: [1.5, -1.5, 0.5] }] },
      ],
    });
    const res16 = parseWavebin(rg16, 'dho804.bin');
    expect(res16.ok).toBe(true);
    if (!res16.ok) return;
    expect(res16.parsed.meta['Format']).toBe('Rigol Binary (RG v03)');
    expect(res16.parsed.traces[0]?.data).toHaveLength(3);
    expect(res16.parsed.traces[0]?.data[2]?.freq).toBeCloseTo(4e-9, 12);

    const rg12 = buildWavebin({
      cookie: 'RG',
      version: '01',
      fileHeaderBytes: 12,
      waveforms: [
        { headerSize: 140, label: 'CH1', xOrigin: 0, xIncrement: 1e-6, buffers: [{ dataHeaderSize: 12, samples: [0, 2, 4] }] },
      ],
    });
    const res12 = parseWavebin(rg12, 'mso5k.bin');
    expect(res12.ok).toBe(true);
    if (!res12.ok) return;
    expect(res12.parsed.traces[0]?.data[1]?.amp).toBeCloseTo(2, 5);
  });

  it('handles peak detect min/max buffers, FFT spectrum channels, logic skipping, hole sentinels, and segmented names', () => {
    resetParserFileCounter();
    const buffer = buildWavebin({
      cookie: 'AG',
      waveforms: [
        {
          label: 'CH1',
          waveformType: 2,
          buffers: [
            { bufferType: 2, samples: [1.0, 9.9e37, 2.0, 3.0] },
            { bufferType: 3, samples: [-1.0, -2.0, -3.0, -4.0] },
          ],
        },
        {
          label: 'FFT',
          xUnits: 6,
          yUnits: 5,
          xOrigin: 1e6,
          xIncrement: 1e5,
          buffers: [{ bufferType: 1, samples: [-40, -20, -60] }],
        },
        {
          label: 'D0-D7',
          waveformType: 6,
          buffers: [{ bufferType: 6, bytesPerPoint: 1, rawBytes: new Uint8Array([0, 1, 2, 3]) }],
        },
        {
          label: 'CH1 (max)',
          segmentIndex: 2,
          buffers: [{ bufferType: 1, samples: [0.1, 0.2, 0.3] }],
        },
      ],
    });

    const result = parseWavebin(buffer, 'mixed.bin');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.traces.map(t => t.dn)).toEqual([
      'mixed.bin CH1 (max)',
      'mixed.bin CH1 (min)',
      'mixed.bin FFT',
      'mixed.bin CH1 (max) (seg 2)',
    ]);
    // Keysight 9.9e37 hole sentinel was filtered out cleanly.
    expect(result.parsed.traces[0]?.data).toHaveLength(3);
    expect(result.parsed.traces[2]).toMatchObject({ domain: 'frequency', family: 'spectrum', units: { x: 'Hz', y: 'dB' } });
    expect(result.parsed.meta['Skipped Logic Channels']).toBe('1');
  });

  it('preserves narrow spikes when explicitly requesting envelope reduction and marks envelopeOf', () => {
    resetParserFileCounter();
    const samples = Array.from({ length: 1000 }, (_, i) => (i === 731 ? 42 : 0));
    const buffer = buildWavebin({
      cookie: 'AG',
      waveforms: [{ label: 'CH1', xOrigin: 0, xIncrement: 1e-6, buffers: [{ samples }] }],
    });

    const result = parseWavebin(buffer, 'deep.bin', { reduction: { mode: 'envelope', targetPoints: 100 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.traces[0]?.data.length).toBeLessThanOrEqual(100);
    expect(result.parsed.traces[0]?.data.some(pt => Math.abs(pt.amp - 42) < 1e-3)).toBe(true);
    expect(result.parsed.traces[0]?.envelopeOf).toBe(1000);
    expect(result.parsed.traces[0]?.isUniform).toBe(false);
    expect(result.parsed.datasets?.[0]?.envelopeOf).toBe(1000);
    expect(result.parsed.datasets?.[0]?.isUniform).toBe(false);
    expect(result.parsed.displayTraces?.[0]?.envelopeOf).toBe(1000);
    expect(result.parsed.displayTraces?.[0]?.isUniform).toBe(false);
    expect(String(result.parsed.meta['Decimation'])).toContain('Min-max reduced');
  });

  it('decodes over 500k samples completely in default full mode and supports boxcar decimation', () => {
    resetParserFileCounter();
    const count = 600_000;
    const samples = new Array<number>(count);
    for (let i = 0; i < count; i++) samples[i] = i % 10;
    const buffer = buildWavebin({
      cookie: 'AG',
      waveforms: [{ label: 'CH1', xOrigin: 0, xIncrement: 1e-6, buffers: [{ samples }] }],
    });

    const full = parseWavebin(buffer, 'deep600k.bin');
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.parsed.traces[0]?.data).toHaveLength(count);
    expect(full.parsed.traces[0]?.envelopeOf).toBeUndefined();
    expect(full.parsed.traces[0]?.isUniform).toBe(true);

    const decimated = parseWavebin(buffer, 'deep600k.bin', { reduction: { mode: 'decimate', factor: 4 } });
    expect(decimated.ok).toBe(true);
    if (!decimated.ok) return;
    expect(decimated.parsed.traces[0]?.data).toHaveLength(count / 4);
    expect(decimated.parsed.traces[0]?.envelopeOf).toBeUndefined();
    expect(decimated.parsed.traces[0]?.isUniform).toBe(true);
  });

  it('clamps oversized wfm.points to actual buffer bounds and rejects negative points safely', () => {
    resetParserFileCounter();
    const hugeHeader = buildWavebin({
      cookie: 'AG',
      waveforms: [{ label: 'CH1', points: 2_000_000_000, buffers: [{ samples: [1, 2, 3, 4] }] }],
    });
    const clamped = parseWavebin(hugeHeader, 'crafted.bin');
    expect(clamped.ok).toBe(true);
    if (!clamped.ok) return;
    expect(clamped.parsed.traces[0]?.data).toHaveLength(4);
    expect(clamped.parsed.meta['Points']).toBe('4');

    const negPoints = buildWavebin({
      cookie: 'AG',
      waveforms: [{ label: 'CH1', points: -5, buffers: [{ samples: [1, 2, 3, 4] }] }],
    });
    expect(parseWavebin(negPoints, 'neg.bin').ok).toBe(false);
  });

  it('rejects truncated, overflowed, and logic-only .bin files safely without throwing', () => {
    // Truncated header
    expect(parseWavebin(new ArrayBuffer(8), 'tiny.bin').ok).toBe(false);

    // Crafted file claiming 999999 waveforms
    const badCount = new ArrayBuffer(20);
    const bcv = new DataView(badCount);
    new Uint8Array(badCount).set([0x41, 0x47, 0x31, 0x30]);
    bcv.setUint32(4, 20, true);
    bcv.setUint32(8, 999999, true);
    expect(parseWavebin(badCount, 'evil.bin').ok).toBe(false);

    // Crafted file whose bufferSize overflows ArrayBuffer
    const valid = buildWavebin({ cookie: 'AG', waveforms: [{ label: 'CH1', buffers: [{ samples: [1, 2, 3] }] }] });
    new DataView(valid).setUint32(12 + 140 + 8, 2_000_000_000, true);
    expect(parseWavebin(valid, 'overflow.bin').ok).toBe(false);

    // Logic-only file reports a clear message
    const logicOnly = buildWavebin({
      cookie: 'RG',
      waveforms: [{ label: 'D0', waveformType: 6, buffers: [{ bufferType: 6, bytesPerPoint: 1, rawBytes: new Uint8Array([0, 1, 0, 1]) }] }],
    });
    const logicRes = parseWavebin(logicOnly, 'logic.bin');
    expect(logicRes.ok).toBe(false);
    if (!logicRes.ok) expect(logicRes.error).toMatch(/logic channels/i);
  });

  it('supports classifyReadBinary, multi-channel Replace File, and Workspace v5 round-trip', () => {
    resetParserFileCounter();
    const firstBuf = buildWavebin({
      cookie: 'AG',
      waveforms: [
        { label: 'CH1', buffers: [{ samples: [0, 1, 2] }] },
        { label: 'CH2', buffers: [{ samples: [3, 4, 5] }] },
      ],
    });
    const firstRead = classifyReadBinary('capture.bin', firstBuf, 'imp-1');
    expect(firstRead.kind).toBe('data');
    if (firstRead.kind !== 'data' || !firstRead.input.parsed) throw new Error('expected parsed wavebin');

    const prepared1 = prepareOpenInput({
      parsed: firstRead.input.parsed,
      rawText: firstRead.input.text,
      fileId: 'f-1',
      fileName: 'capture.bin',
    });
    expect(prepared1.ok).toBe(true);
    if (!prepared1.ok) return;

    // Replace with updated multi-channel capture: CH1 and CH2 match cleanly.
    const secondBuf = buildWavebin({
      cookie: 'AG',
      waveforms: [
        { label: 'CH1', buffers: [{ samples: [10, 11, 12] }] },
        { label: 'CH2', buffers: [{ samples: [13, 14, 15] }] },
      ],
    });
    const secondRead = classifyReadBinary('capture.bin', secondBuf, 'imp-2');
    if (secondRead.kind !== 'data' || !secondRead.input.parsed) throw new Error('expected second parsed wavebin');
    const prepared2 = prepareOpenInput({
      parsed: secondRead.input.parsed,
      rawText: secondRead.input.text,
      fileId: 'f-2',
      fileName: 'capture.bin',
      prior: prepared1.file,
    });
    expect(prepared2.ok).toBe(true);
    if (!prepared2.ok) return;
    expect(prepared2.replacementMatches).toHaveLength(2);
    expect(prepared2.removedKeys).toEqual([]);

    // Workspace v5 save & reload round-trip.
    const engine = workspaceEngineReducer(initialWorkspaceEngine(), {
      type: 'change',
      command: { slice: 'open-data', inputs: [firstRead.input], limit: 4 },
    });
    expect(engine.present.files.files).toHaveLength(1);
    expect(engine.present.files.wizardQueue).toHaveLength(0);
    const snapshot = snapshotFromWorkspace(engine.present);
    const restored = migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)));
    expect(restored?.files[0]?.traces).toHaveLength(2);
  });
});
