import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BINARY_SNIFF_BYTES, classifyBinaryConfidence, detectBinarySignature } from '../../src/domain/parsers/binary-detect';
import { parseLeCroyTrc } from '../../src/domain/parsers/lecroy-trc';
import { parseTekIsf } from '../../src/domain/parsers/tek-isf';
import { parseOwonBin, probeOwonBinPoints } from '../../src/domain/parsers/owon-bin';
import { defaultBinaryConfig, detectBinaryDataStart, findBinaryDataStart, parseBinarySettings, parseBinaryWithConfig, previewBinaryImport, serializeBinarySettings } from '../../src/domain/parsers/raw-binary';
import { classifyReadBinary } from '../../src/domain/open-file-read';
import { resetParserFileCounter } from '../../src/domain/parsers/rs-dat';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';

function readArrayBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('Phase 2 binary oscilloscope formats (.trc, .isf, OWON .bin) + shipped fixtures', () => {
  it('sniffs and parses all five generated oscilloscope fixtures in test files/', () => {
    resetParserFileCounter();
    const fixtures: readonly [string, string, number][] = [
      ['test files/keysight_dsox_sample.bin', 'wavebin', 2],
      ['test files/rigol_dho804_sample.bin', 'wavebin', 2],
      ['test files/lecroy_sample.trc', 'lecroy-trc', 1],
      ['test files/tektronix_sample.isf', 'tek-isf', 1],
      ['test files/owon_sample.bin', 'owon-bin', 1],
    ];

    for (const [path, expectedFormat, expectedTraces] of fixtures) {
      const ab = readArrayBuffer(path);
      const head = new Uint8Array(ab, 0, Math.min(ab.byteLength, BINARY_SNIFF_BYTES));
      expect(detectBinarySignature(head)).toBe(expectedFormat);

      const fileName = path.split('/').pop() ?? path;
      const read = classifyReadBinary(fileName, ab, `id-${fileName}`);
      expect(read.kind).toBe('data');
      if (read.kind !== 'data' || !read.input.parsed) throw new Error(`Failed to parse ${path}: ${read.kind === 'data' ? read.input.error : read.kind}`);
      expect(read.input.parsed.format).toBe(expectedFormat);
      expect(read.input.parsed.traces).toHaveLength(expectedTraces);
      expect(read.input.parsed.traces[0]?.domain).toBe('time');
      expect(read.input.parsed.traces[0]?.units).toEqual({ x: 's', y: 'V' });
      expect(read.input.parsed.traces[0]?.data.length).toBeGreaterThan(100);
    }
  });

  it('parses LeCroy .trc with SCPI #9 prefix and Big-Endian Int8 encoding', () => {
    resetParserFileCounter();
    const prefix = Buffer.from('#9000000350', 'ascii');
    const descLen = 346;
    const count = 4;
    const payload = Buffer.alloc(prefix.length + descLen + count);
    prefix.copy(payload, 0);
    const base = prefix.length;
    payload.write('WAVEDESC', base, 'ascii');
    payload.write('LECROY_2_3', base + 16, 'ascii');
    payload.writeInt16BE(0, base + 32); // byte (Int8)
    payload.writeInt16BE(0, base + 34); // HIFIRST (BE)
    payload.writeInt32BE(descLen, base + 36);
    payload.writeInt32BE(count, base + 60);
    payload.write('WR640Zi', base + 76, 'ascii');
    payload.writeInt32BE(count, base + 116);
    payload.writeFloatBE(0.5, base + 156); // gain
    payload.writeFloatBE(0.25, base + 160); // offset
    payload.writeFloatBE(1e-6, base + 176); // dt
    payload.writeDoubleBE(0, base + 180); // t0
    payload.write('V', base + 196, 'ascii');
    payload.write('s', base + 244, 'ascii');
    payload.writeInt16BE(1, base + 344); // C2
    payload.writeInt8(2, base + descLen);
    payload.writeInt8(4, base + descLen + 1);
    payload.writeInt8(-2, base + descLen + 2);
    payload.writeInt8(0, base + descLen + 3);

    const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    expect(detectBinarySignature(new Uint8Array(ab, 0, BINARY_SNIFF_BYTES))).toBe('lecroy-trc');
    const res = parseLeCroyTrc(ab, 'scpi.trc');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.parsed.meta['Instrument']).toBe('WR640Zi');
    expect(res.parsed.meta['Byte Order']).toBe('Big-Endian');
    expect(res.parsed.traces[0]?.dn).toBe('scpi.trc C2');
    expect(res.parsed.traces[0]?.data.map(p => p.amp)).toEqual([0.75, 1.75, -1.25, -0.25]);
  });

  it('parses Tektronix .isf with Big-Endian unsigned 8-bit samples and rejects truncated payloads', () => {
    resetParserFileCounter();
    const head = Buffer.from(':WFMP:BYT_N 1;BN_F RP;BY_O MSB;NR_P 3;XIN 1E-3;XZE 0;PT_O 1;YMU 0.1;YOF 128;YZE 0;XUN "s";YUN "V";:CURVE #13', 'latin1');
    const data = Buffer.from([128, 138, 118]);
    const full = Buffer.concat([head, data]);
    const ab = full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength);
    const res = parseTekIsf(ab, 'tek.isf');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.parsed.traces[0]?.data[0]?.freq).toBeCloseTo(-1e-3, 9);
    expect(res.parsed.traces[0]?.data[1]?.amp).toBeCloseTo(1.0, 5);
    expect(res.parsed.traces[0]?.data[2]?.amp).toBeCloseTo(-1.0, 5);

    // Truncated payload rejected safely.
    const truncated = ab.slice(0, ab.byteLength - 1);
    expect(parseTekIsf(truncated, 'bad.isf').ok).toBe(false);
  });

  it('rejects malformed OWON SPBXDS headers and out-of-bounds payloads safely', () => {
    const badJson = Buffer.from('SPBXDS\x05\x00\x00\x00{bad!');
    expect(parseOwonBin(badJson.buffer.slice(badJson.byteOffset, badJson.byteOffset + badJson.byteLength), 'bad.bin').ok).toBe(false);

    const overflow = Buffer.alloc(20);
    overflow.write('SPBXDS', 0, 'ascii');
    overflow.writeUInt32LE(999999, 6);
    expect(parseOwonBin(overflow.buffer.slice(overflow.byteOffset, overflow.byteOffset + overflow.byteLength), 'evil.bin').ok).toBe(false);
  });

  it('parses multi-channel OWON SPBXDS with DISPLAY: OFF filtering, prefixed 16-bit and fallback 8-bit channels, and second-channel truncation recovery', () => {
    resetParserFileCounter();
    const owonJson = JSON.stringify({
      MODEL: 'XDS3104',
      SAMPLE: { SAMPLERATE: '1MSa/s' },
      CHANNEL: [
        { NAME: 'CH_OFF', DISPLAY: 'OFF', DATALEN: 4, DATABIT: 8, SCALE: '1V' },
        { NAME: 'CH1_SIG', DISPLAY: 'ON', DATALEN: 4, DATABIT: 16, SCALE: '1V' },
        { DISPLAY: 'ON', DATALEN: 3, DATABIT: 8, SCALE: '500mV' },
      ],
    });
    const jsonBytes = Buffer.byteLength(owonJson, 'utf8');
    // CH1: 4B uint32 payload length prefix (8) + 4 Int16 LE samples; CH2: 3 Int8 samples.
    const buf = Buffer.alloc(10 + jsonBytes + 4 + 8 + 3);
    buf.write('SPBXDS', 0, 'ascii');
    buf.writeUInt32LE(jsonBytes, 6);
    buf.write(owonJson, 10, 'utf8');

    let offset = 10 + jsonBytes;
    buf.writeUInt32LE(8, offset);
    offset += 4;
    const ch1Samples = [0, 6400, -6400, 3200];
    for (const sample of ch1Samples) {
      buf.writeInt16LE(sample, offset);
      offset += 2;
    }
    const ch2Samples = [0, 25, -25];
    for (const sample of ch2Samples) {
      buf.writeInt8(sample, offset);
      offset += 1;
    }

    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    expect(probeOwonBinPoints(ab)).toEqual({ ok: true, totalPoints: 7 });

    const parsed = parseOwonBin(ab, 'multi.bin');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.parsed.traces).toHaveLength(2);
    expect(parsed.parsed.traces[0]?.dn).toBe('multi.bin CH1_SIG');
    expect(parsed.parsed.traces[0]?.data.map(p => p.amp)).toEqual([0, 1, -1, 0.5]);
    expect(parsed.parsed.traces[1]?.dn).toBe('multi.bin CH2');
    expect(parsed.parsed.traces[1]?.data.map(p => p.amp)).toEqual([0, 0.5, -0.5]);

    // Truncating the second channel recovers channel 1 safely without out-of-bounds reads.
    const truncatedAb = ab.slice(0, ab.byteLength - 1);
    expect(probeOwonBinPoints(truncatedAb)).toEqual({ ok: true, totalPoints: 4 });
    const truncated = parseOwonBin(truncatedAb, 'multi-trunc.bin');
    expect(truncated.ok).toBe(true);
    if (!truncated.ok) return;
    expect(truncated.parsed.traces).toHaveLength(1);
    expect(truncated.parsed.traces[0]?.dn).toBe('multi-trunc.bin CH1_SIG');
    expect(truncated.parsed.traces[0]?.data.map(p => p.amp)).toEqual([0, 1, -1, 0.5]);
  });

  it('detects 1-2 byte EOF truncation on 4-byte-prefixed OWON channels with DATALEN > 0 without decoding the prefix as samples', () => {
    resetParserFileCounter();
    // 2-channel prefixed SPBXDS with explicit DATALEN > 0 on both channels.
    const twoChJson = JSON.stringify({
      MODEL: 'XDS3104',
      SAMPLE: { SAMPLERATE: '1MSa/s' },
      CHANNEL: [
        { NAME: 'C1', DISPLAY: 'ON', DATALEN: 4, DATABIT: 16, SCALE: '1V' },
        { NAME: 'C2', DISPLAY: 'ON', DATALEN: 4, DATABIT: 16, SCALE: '1V' },
      ],
    });
    const twoJsonBytes = Buffer.byteLength(twoChJson, 'utf8');
    const twoBuf = Buffer.alloc(10 + twoJsonBytes + (4 + 8) * 2);
    twoBuf.write('SPBXDS', 0, 'ascii');
    twoBuf.writeUInt32LE(twoJsonBytes, 6);
    twoBuf.write(twoChJson, 10, 'utf8');
    let off = 10 + twoJsonBytes;
    const ch1 = [0, 6400, -6400, 3200];
    const ch2 = [6400, 0, -6400, 3200];
    twoBuf.writeUInt32LE(8, off);
    off += 4;
    for (const s of ch1) { twoBuf.writeInt16LE(s, off); off += 2; }
    twoBuf.writeUInt32LE(8, off);
    off += 4;
    for (const s of ch2) { twoBuf.writeInt16LE(s, off); off += 2; }

    const twoFullAb = twoBuf.buffer.slice(twoBuf.byteOffset, twoBuf.byteOffset + twoBuf.byteLength);
    expect(probeOwonBinPoints(twoFullAb)).toEqual({ ok: true, totalPoints: 8 });
    const twoFull = parseOwonBin(twoFullAb, 'prefixed2.bin');
    expect(twoFull.ok).toBe(true);
    if (twoFull.ok) expect(twoFull.parsed.traces).toHaveLength(2);

    for (const cut of [1, 2]) {
      const trunc2 = twoFullAb.slice(0, twoFullAb.byteLength - cut);
      expect(probeOwonBinPoints(trunc2)).toEqual({ ok: true, totalPoints: 4 });
      const parsed2 = parseOwonBin(trunc2, 'prefixed2-trunc.bin');
      expect(parsed2.ok).toBe(true);
      if (!parsed2.ok) return;
      expect(parsed2.parsed.traces).toHaveLength(1);
      expect(parsed2.parsed.traces[0]?.dn).toBe('prefixed2-trunc.bin C1');
      expect(parsed2.parsed.traces[0]?.data.map(p => p.amp)).toEqual([0, 1, -1, 0.5]);
    }

    // 1-channel prefixed SPBXDS with DATALEN > 0 truncated by 1 byte must fail cleanly.
    const oneChJson = JSON.stringify({
      MODEL: 'XDS3104',
      SAMPLE: { SAMPLERATE: '1MSa/s' },
      CHANNEL: [
        { NAME: 'C1', DISPLAY: 'ON', DATALEN: 4, DATABIT: 16, SCALE: '1V' },
      ],
    });
    const oneJsonBytes = Buffer.byteLength(oneChJson, 'utf8');
    const oneBuf = Buffer.alloc(10 + oneJsonBytes + 4 + 8);
    oneBuf.write('SPBXDS', 0, 'ascii');
    oneBuf.writeUInt32LE(oneJsonBytes, 6);
    oneBuf.write(oneChJson, 10, 'utf8');
    let oneOff = 10 + oneJsonBytes;
    oneBuf.writeUInt32LE(8, oneOff);
    oneOff += 4;
    for (const s of ch1) { oneBuf.writeInt16LE(s, oneOff); oneOff += 2; }

    const oneTruncAb = oneBuf.buffer.slice(oneBuf.byteOffset, oneBuf.byteOffset + oneBuf.byteLength - 1);
    expect(probeOwonBinPoints(oneTruncAb).ok).toBe(false);
    expect(parseOwonBin(oneTruncAb, 'prefixed1-trunc.bin').ok).toBe(false);
  });

  it('routes headerless GNU Radio .cf32 IQ files to the binary wizard and parses I/Q traces with overrides', () => {
    resetParserFileCounter();
    // 8 complex Float32 IQ samples (I0, Q0, I1, Q1, ...) = 64 bytes.
    const iq = Buffer.alloc(64);
    for (let i = 0; i < 8; i++) {
      iq.writeFloatLE(Math.cos((i * Math.PI) / 4), i * 8);
      iq.writeFloatLE(Math.sin((i * Math.PI) / 4), i * 8 + 4);
    }
    const ab = iq.buffer.slice(iq.byteOffset, iq.byteOffset + iq.byteLength);
    const read = classifyReadBinary('capture.cf32', ab, 'iq-1');
    expect(read.kind).toBe('data');
    if (read.kind !== 'data') return;
    expect(read.input.parsed?.format).toBe('needs-binary-wizard');
    expect(read.input.binaryConfig).toMatchObject({ mode: 'raw', sampleType: 'float32', endian: 'le', layout: 'iq' });

    const cfg = defaultBinaryConfig('capture.cf32', ab.byteLength, null);
    const parsed = parseBinaryWithConfig(ab, 'capture.cf32', { ...cfg, sampleRateHz: 1e6, yMult: 2, yUnit: 'V' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.parsed.traces.map(t => t.dn)).toEqual(['capture.cf32 I', 'capture.cf32 Q']);
    expect(parsed.parsed.traces[0]?.data[0]?.amp).toBeCloseTo(2, 5);
    expect(parsed.parsed.traces[1]?.data[2]?.amp).toBeCloseTo(2, 5);

    const preview = previewBinaryImport(ab, 'capture.cf32', cfg);
    expect(preview.error).toBeNull();
    expect(preview.channels).toHaveLength(2);
    expect(preview.hexDump).toContain('0000');
  });

  it('allows re-running an opened scope .bin file through RERUN_WIZARD -> RESOLVE_BINARY_WIZARD with scale override and undo', () => {
    resetParserFileCounter();
    const ab = readArrayBuffer('test files/keysight_dsox_sample.bin');
    const read = classifyReadBinary('keysight_dsox_sample.bin', ab, 'ks-1');
    if (read.kind !== 'data') throw new Error('expected data');

    let engine = workspaceEngineReducer(initialWorkspaceEngine(), {
      type: 'change',
      command: { slice: 'open-data', inputs: [read.input], limit: 4 },
    });
    expect(engine.present.files.files).toHaveLength(1);
    const fileId = String(engine.present.files.files[0]?.id);
    const origMax = Math.max(...(engine.present.files.files[0]?.traces[0]?.data.map(p => p.amp) ?? [0]));

    // Trigger Import settings… (RERUN_WIZARD) on the binary file.
    engine = workspaceEngineReducer(engine, {
      type: 'change',
      command: { slice: 'files', action: { type: 'RERUN_WIZARD', payload: { fileId, fileName: 'keysight_dsox_sample.bin' } } },
    });
    const entry = engine.present.files.wizardQueue[0];
    expect(entry?.mode).toBe('edit');
    expect(entry?.rawBinary).toBe(ab);

    // Apply 10x probe multiplier and keep only CH1.
    engine = workspaceEngineReducer(engine, {
      type: 'change',
      command: {
        slice: 'files',
        limit: 4,
        action: {
          type: 'RESOLVE_BINARY_WIZARD',
          payload: {
            id: fileId,
            binaryConfig: { ...(entry?.binaryConfig ?? defaultBinaryConfig('keysight_dsox_sample.bin', ab.byteLength, 'wavebin')), yMult: 10, selectedChannels: [0] },
          },
        },
      },
    });
    expect(engine.present.files.wizardQueue).toHaveLength(0);
    expect(engine.present.files.files[0]?.traces).toHaveLength(1);
    const scaledMax = Math.max(...(engine.present.files.files[0]?.traces[0]?.data.map(p => p.amp) ?? [0]));
    expect(scaledMax).toBeCloseTo(origMax * 10, 3);

    // Undo restores both channels and original scale.
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.files.files[0]?.traces).toHaveLength(2);
  });

  it('supports per-channel probe/unit overrides, true pre-decimation slicing, planar/int32/swapIQ raw layouts, and SWITCH_WIZARD_TO_TEXT', () => {
    resetParserFileCounter();
    const ab = readArrayBuffer('test files/keysight_dsox_sample.bin');
    const baseCfg = defaultBinaryConfig('keysight_dsox_sample.bin', ab.byteLength, 'wavebin');

    // Per-channel override: CH1 = 10x V probe, CH2 = 1x A current probe with +0.5 offset.
    const perCh = parseBinaryWithConfig(ab, 'keysight_dsox_sample.bin', {
      ...baseCfg,
      channelOverrides: {
        0: { enabled: true, yMult: 10, yUnit: 'V' },
        1: { enabled: true, yMult: 1, yOffset: 0.5, yUnit: 'A' },
      },
      xOffset: 1e-3,
    });
    expect(perCh.ok).toBe(true);
    if (!perCh.ok) return;
    expect(perCh.parsed.traces[0]?.units.y).toBe('V');
    expect(perCh.parsed.traces[1]?.units.y).toBe('A');
    expect(perCh.parsed.traces[0]?.data[0]?.freq).toBeGreaterThan(0);

    // Pre-reduction slicing: keysight fixture has 2000 pts; with envelope targetPoints=100, slicing 50 pts stays exact while 500 pts becomes an envelope.
    const sliced = parseBinaryWithConfig(ab, 'keysight_dsox_sample.bin', {
      ...baseCfg,
      startSample: 500,
      sampleCount: 50,
      reduction: { mode: 'envelope', targetPoints: 100 },
    });
    expect(sliced.ok).toBe(true);
    if (!sliced.ok) return;
    expect(sliced.parsed.traces[0]?.data).toHaveLength(50);
    expect(sliced.parsed.traces[0]?.envelopeOf).toBeUndefined();

    const envSliced = parseBinaryWithConfig(ab, 'keysight_dsox_sample.bin', {
      ...baseCfg,
      startSample: 500,
      sampleCount: 500,
      reduction: { mode: 'envelope', targetPoints: 100 },
    });
    expect(envSliced.ok).toBe(true);
    if (!envSliced.ok) return;
    expect(envSliced.parsed.traces[0]?.data.length).toBeLessThanOrEqual(100);
    expect(envSliced.parsed.traces[0]?.envelopeOf).toBe(500);
    expect(envSliced.parsed.traces[0]?.isUniform).toBe(false);

    // Raw planar int32 layout: 4 samples of CH1 [10, 20, 30, 40] followed by 4 samples of CH2 [100, 200, 300, 400] after 8-byte header.
    const planar = Buffer.alloc(8 + 8 * 4);
    [10, 20, 30, 40, 100, 200, 300, 400].forEach((v, i) => planar.writeInt32LE(v, 8 + i * 4));
    const planarAb = planar.buffer.slice(planar.byteOffset, planar.byteOffset + planar.byteLength);
    const planarCfg = {
      ...defaultBinaryConfig('daq.bin', planarAb.byteLength, null),
      sampleType: 'int32' as const,
      layout: 'planar' as const,
      channelCount: 2,
      headerBytes: 8,
      sampleRateHz: 1000,
    };
    const planarParsed = parseBinaryWithConfig(planarAb, 'daq.bin', planarCfg);
    expect(planarParsed.ok).toBe(true);
    if (!planarParsed.ok) return;
    expect(planarParsed.parsed.traces[0]?.data.map(p => p.amp)).toEqual([10, 20, 30, 40]);
    expect(planarParsed.parsed.traces[1]?.data.map(p => p.amp)).toEqual([100, 200, 300, 400]);

    // Hex inspector follows headerBytes offset.
    const planarPrev = previewBinaryImport(planarAb, 'daq.bin', planarCfg);
    expect(planarPrev.hexOffset).toBe(8);
    expect(planarPrev.hexDump.startsWith('0008')).toBe(true);

    // Swap I/Q reverses I and Q channels cleanly.
    const iq = Buffer.alloc(16);
    iq.writeFloatLE(1, 0); iq.writeFloatLE(9, 4);
    iq.writeFloatLE(2, 8); iq.writeFloatLE(8, 12);
    const iqAb = iq.buffer.slice(iq.byteOffset, iq.byteOffset + iq.byteLength);
    const swapped = parseBinaryWithConfig(iqAb, 'swap.cf32', {
      ...defaultBinaryConfig('swap.cf32', iqAb.byteLength, null),
      swapIQ: true,
    });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.parsed.traces[0]?.data.map(p => p.amp)).toEqual([9, 8]);
    expect(swapped.parsed.traces[1]?.data.map(p => p.amp)).toEqual([1, 2]);

    // SWITCH_WIZARD_TO_TEXT converts a misclassified ASCII .bin buffer into a tabular wizard entry.
    const asciiBuf = Buffer.from('time,v\n0,1\n1,2\n2,3\n', 'utf-8');
    const asciiAb = asciiBuf.buffer.slice(asciiBuf.byteOffset, asciiBuf.byteOffset + asciiBuf.byteLength);
    const readAscii = classifyReadBinary('notes.bin', asciiAb, 'txt-1');
    if (readAscii.kind !== 'data') throw new Error('expected data');
    let engine = workspaceEngineReducer(initialWorkspaceEngine(), {
      type: 'change',
      command: { slice: 'open-data', inputs: [readAscii.input], limit: 4 },
    });
    expect(engine.present.files.wizardQueue[0]?.rawBinary).toBe(asciiAb);
    engine = workspaceEngineReducer(engine, {
      type: 'change',
      command: { slice: 'files', action: { type: 'SWITCH_WIZARD_TO_TEXT', payload: { id: 'txt-1' } } },
    });
    expect(engine.present.files.wizardQueue[0]?.rawBinary).toBeUndefined();
    expect(engine.present.files.wizardQueue[0]?.rawText).toContain('time,v');
    expect(engine.present.files.wizardQueue[0]?.previewLines.length).toBeGreaterThan(2);
  });

  it('defaults raw sampleCount to 0 even above 65,536 frames and exposes sampleRateHz/dtSeconds in previewBinaryImport', () => {
    const hugeCfg = defaultBinaryConfig('huge.cf32', 2_000_000, null);
    expect(hugeCfg.sampleCount).toBe(0);

    const raw = Buffer.alloc(64);
    for (let i = 0; i < 8; i++) {
      raw.writeFloatLE(i, i * 8);
      raw.writeFloatLE(-i, i * 8 + 4);
    }
    const rawAb = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const rawPrev = previewBinaryImport(rawAb, 'huge.cf32', { ...defaultBinaryConfig('huge.cf32', rawAb.byteLength, null), sampleRateHz: 2e6, xMult: 0.5 });
    expect(rawPrev.sampleRateHz).toBeCloseTo(4e6, 3);
    expect(rawPrev.dtSeconds).toBeCloseTo(2.5e-7, 12);

    const unitlessPrev = previewBinaryImport(rawAb, 'huge.cf32', { ...defaultBinaryConfig('huge.cf32', rawAb.byteLength, null), sampleRateHz: 0 });
    expect(unitlessPrev.sampleRateHz).toBeNull();
    expect(unitlessPrev.dtSeconds).toBeNull();

    const scopeAb = readArrayBuffer('test files/keysight_dsox_sample.bin');
    const scopeCfg = defaultBinaryConfig('keysight_dsox_sample.bin', scopeAb.byteLength, 'wavebin');
    const scopePrev = previewBinaryImport(scopeAb, 'keysight_dsox_sample.bin', scopeCfg);
    expect(scopePrev.sampleRateHz).toBeGreaterThan(0);
    expect(scopePrev.dtSeconds).toBeGreaterThan(0);
    expect(scopePrev.channels[0]?.points).toBe(2048);
    expect(scopePrev.allScopeChannels[0]?.points).toBe(2048);

    // A >16k raw capture still reports true sample count in preview channels despite 16k envelope preview.
    const raw20k = Buffer.alloc(20_000 * 4);
    const raw20kAb = raw20k.buffer.slice(raw20k.byteOffset, raw20k.byteOffset + raw20k.byteLength);
    const raw20kPrev = previewBinaryImport(raw20kAb, 'deep.f32', defaultBinaryConfig('deep.f32', raw20kAb.byteLength, null));
    expect(raw20kPrev.channels[0]?.points).toBe(20_000);
    expect(raw20kPrev.totalAvailableSamples).toBe(20_000);
  });

  it('clamps or rejects oversized header point counts across LeCroy .trc, Tektronix .isf, and OWON .bin', () => {
    resetParserFileCounter();
    // LeCroy: waveArrayCount=2_000_000_000 clamped to waveArray1Len (4 bytes), and waveArray1Len=2_000_000_000 rejected.
    const descLen = 346;
    const count = 4;
    const trc = Buffer.alloc(descLen + count);
    trc.write('WAVEDESC', 0, 'ascii');
    trc.write('LECROY_2_3', 16, 'ascii');
    trc.writeInt16LE(0, 32);
    trc.writeInt16LE(1, 34);
    trc.writeInt32LE(descLen, 36);
    trc.writeInt32LE(count, 60);
    trc.writeInt32LE(2_000_000_000, 116);
    trc.writeFloatLE(1, 156);
    trc.writeFloatLE(0, 160);
    trc.writeFloatLE(1e-6, 176);
    trc.writeDoubleLE(0, 180);
    trc.write('V', 196, 'ascii');
    trc.write('s', 244, 'ascii');
    const trcAb = trc.buffer.slice(trc.byteOffset, trc.byteOffset + trc.byteLength);
    const trcClamped = parseLeCroyTrc(trcAb, 'clamped.trc');
    expect(trcClamped.ok).toBe(true);
    if (trcClamped.ok) expect(trcClamped.parsed.traces[0]?.data).toHaveLength(4);

    trc.writeInt32LE(2_000_000_000, 60);
    const trcBadAb = trc.buffer.slice(trc.byteOffset, trc.byteOffset + trc.byteLength);
    expect(parseLeCroyTrc(trcBadAb, 'huge.trc').ok).toBe(false);

    // Tektronix .isf: NR_PT 2000000000 clamped to :CURVE payload, huge :CURVE length rejected, whitespace length rejected.
    const tekHead = Buffer.from(':WFMP:BYT_N 1;BN_F RP;BY_O MSB;NR_P 2000000000;XIN 1E-3;XZE 0;PT_O 0;YMU 1;YOF 0;YZE 0;XUN "s";YUN "V";:CURVE #14', 'latin1');
    const tekFull = Buffer.concat([tekHead, Buffer.from([1, 2, 3, 4])]);
    const tekRes = parseTekIsf(tekFull.buffer.slice(tekFull.byteOffset, tekFull.byteOffset + tekFull.byteLength), 'clamped.isf');
    expect(tekRes.ok).toBe(true);
    if (tekRes.ok) expect(tekRes.parsed.traces[0]?.data).toHaveLength(4);

    const tekHugeCurve = Buffer.from(':WFMP:BYT_N 1;BN_F RP;BY_O MSB;NR_P 4;XIN 1E-3;YMU 1;:CURVE #92000000000\x01\x02\x03\x04', 'latin1');
    expect(parseTekIsf(tekHugeCurve.buffer.slice(tekHugeCurve.byteOffset, tekHugeCurve.byteOffset + tekHugeCurve.byteLength), 'huge.isf').ok).toBe(false);

    const tekSpaceLen = Buffer.from(':WFMP:BYT_N 1;BN_F RP;BY_O MSB;NR_P 4;XIN 1E-3;YMU 1;:CURVE #2 4\x01\x02\x03\x04', 'latin1');
    expect(parseTekIsf(tekSpaceLen.buffer.slice(tekSpaceLen.byteOffset, tekSpaceLen.byteOffset + tekSpaceLen.byteLength), 'space.isf').ok).toBe(false);

    // OWON .bin: DATALEN: 2000000000 exceeding file size rejected.
    const owonJson = JSON.stringify({
      CHANNEL: [{ NAME: 'CH1', DISPLAY: 'ON', DATALEN: 2_000_000_000, DATABIT: 8 }],
      SAMPLE: { DATALEN: 2_000_000_000, SAMPLERATE: '1MSa/s' },
    });
    const owonBuf = Buffer.alloc(10 + Buffer.byteLength(owonJson, 'utf8') + 8);
    owonBuf.write('SPBXDS', 0, 'ascii');
    owonBuf.writeUInt32LE(Buffer.byteLength(owonJson, 'utf8'), 6);
    owonBuf.write(owonJson, 10, 'utf8');
    expect(parseOwonBin(owonBuf.buffer.slice(owonBuf.byteOffset, owonBuf.byteOffset + owonBuf.byteLength), 'huge-owon.bin').ok).toBe(false);
  });

  it('scores binary import detection confidence across auto-scope, overrides, warnings, and raw modes', () => {
    expect(classifyBinaryConfidence({
      mode: 'auto-scope',
      detectedScope: 'wavebin',
      parserOverride: 'auto',
      fileName: 'scope.bin',
    })).toMatchObject({ level: 'high', score: 1, reasons: [] });

    expect(classifyBinaryConfidence({
      mode: 'auto-scope',
      detectedScope: 'wavebin',
      parserOverride: 'lecroy-trc',
      fileName: 'scope.bin',
    })).toMatchObject({ level: 'medium', score: 0.68 });

    expect(classifyBinaryConfidence({
      mode: 'raw',
      detectedScope: null,
      fileName: 'capture.cf32',
    })).toMatchObject({ level: 'medium', score: 0.65 });

    expect(classifyBinaryConfidence({
      mode: 'raw',
      detectedScope: null,
      fileName: 'unknown.bin',
    })).toMatchObject({ level: 'low', score: 0.25 });

    expect(classifyBinaryConfidence({
      mode: 'raw',
      detectedScope: 'wavebin',
      fileName: 'broken.bin',
      warning: 'Header truncated',
    })).toMatchObject({
      level: 'low',
      score: 0.3,
      reasons: ['Header truncated', 'Verify parser format or adjust raw binary settings'],
    });
  });

  it('supports framePadBytes, footerBytes, findBinaryDataStart, expanded hexView, and repopulating traces after all traces are hidden or deleted', () => {
    resetParserFileCounter();
    // 3 frames of [int16 CH1][int16 CH2][2B status pad] + 4B EOF footer = 22 bytes.
    const framed = Buffer.alloc(3 * 6 + 4);
    for (let i = 0; i < 3; i++) {
      framed.writeInt16LE((i + 1) * 10, i * 6);
      framed.writeInt16LE((i + 1) * 100, i * 6 + 2);
      framed.writeUInt16LE(0xbeef, i * 6 + 4);
    }
    framed.writeUInt32LE(0xdeadcafe, 18);
    const framedAb = framed.buffer.slice(framed.byteOffset, framed.byteOffset + framed.byteLength);
    const parsedFramed = parseBinaryWithConfig(framedAb, 'struct.dat', {
      ...defaultBinaryConfig('struct.dat', framedAb.byteLength, null),
      sampleType: 'int16',
      layout: 'interleaved',
      channelCount: 2,
      framePadBytes: 2,
      footerBytes: 4,
      sampleRateHz: 1000,
    });
    expect(parsedFramed.ok).toBe(true);
    if (!parsedFramed.ok) return;
    expect(parsedFramed.parsed.traces[0]?.data.map(p => p.amp)).toEqual([10, 20, 30]);
    expect(parsedFramed.parsed.traces[1]?.data.map(p => p.amp)).toEqual([100, 200, 300]);

    // findBinaryDataStart locates RIFF/WAVE data chunk and ASCII preamble end.
    const wav = Buffer.alloc(60);
    wav.write('RIFF', 0, 'ascii');
    wav.writeUInt32LE(52, 4);
    wav.write('WAVEfmt ', 8, 'ascii');
    wav.writeUInt32LE(16, 16);
    wav.write('data', 36, 'ascii');
    wav.writeUInt32LE(16, 40);
    expect(findBinaryDataStart(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength))).toBe(44);

    const asciiHead = Buffer.concat([Buffer.from('HEADER=1\nRATE=1000\n', 'ascii'), Buffer.from([0, 0, 0x80, 0x3f, 0, 0])]);
    expect(findBinaryDataStart(asciiHead.buffer.slice(asciiHead.byteOffset, asciiHead.byteOffset + asciiHead.byteLength))).toBe(21);

    // previewBinaryImport supports custom hexView offset & size > 64 B.
    const big = new ArrayBuffer(512);
    const prev256 = previewBinaryImport(big, 'big.bin', defaultBinaryConfig('big.bin', 512, null), { offset: 128, maxBytes: 256 });
    expect(prev256.hexOffset).toBe(128);
    expect(prev256.hexDump.startsWith('0080')).toBe(true);
    expect(prev256.hexDump.split('\n')).toHaveLength(16);

    // Repopulating traces after all traces of a binary file are hidden OR deleted.
    const ksAb = readArrayBuffer('test files/keysight_dsox_sample.bin');
    const readKs = classifyReadBinary('keysight_dsox_sample.bin', ksAb, 'ks-repop');
    if (readKs.kind !== 'data') throw new Error('expected data');
    let engine = workspaceEngineReducer(initialWorkspaceEngine(), {
      type: 'change',
      command: { slice: 'open-data', inputs: [readKs.input], limit: 4 },
    });
    const file = engine.present.files.files[0];
    if (!file) throw new Error('expected file');
    const fileId = String(file.id);

    // Hide every trace on the file (same as clicking "Hide view" × on every trace row).
    for (const display of file.displayTraces ?? []) {
      engine = workspaceEngineReducer(engine, {
        type: 'change',
        command: { slice: 'files', action: { type: 'SET_DISPLAY_TRACE_HIDDEN', payload: { fileId, displayTraceId: display.id, hidden: true } } },
      });
    }
    expect(engine.present.files.files[0]?.traces).toHaveLength(0);

    // Re-run Import settings… -> Apply: both traces must reappear visibly and be placed in a pane.
    engine = workspaceEngineReducer(engine, {
      type: 'change',
      command: { slice: 'files', action: { type: 'RERUN_WIZARD', payload: { fileId, fileName: 'keysight_dsox_sample.bin' } } },
    });
    engine = workspaceEngineReducer(engine, {
      type: 'change',
      command: {
        slice: 'files',
        limit: 4,
        action: {
          type: 'RESOLVE_BINARY_WIZARD',
          payload: { id: fileId, binaryConfig: defaultBinaryConfig('keysight_dsox_sample.bin', ksAb.byteLength, 'wavebin') },
        },
      },
    });
    expect(engine.present.files.files[0]?.traces).toHaveLength(2);
    expect(engine.present.files.files[0]?.displayTraces?.every(d => !d.hidden)).toBe(true);
    for (const tr of engine.present.files.files[0]?.traces ?? []) {
      expect((engine.present.panes.tracePaneMap[tr.name] ?? []).length).toBeGreaterThan(0);
    }

    // Delete every trace on the file (priorColumns becomes empty) -> re-importing via Import settings… still repopulates.
    const afterFile = engine.present.files.files[0];
    if (!afterFile) throw new Error('expected file');
    const afterId = String(afterFile.id);
    for (const display of afterFile.displayTraces ?? []) {
      engine = workspaceEngineReducer(engine, {
        type: 'change',
        command: { slice: 'files', action: { type: 'DELETE_DISPLAY_TRACE', payload: { fileId: afterId, displayTraceId: display.id } } },
      });
    }
    expect(engine.present.files.files[0]?.traces).toHaveLength(0);
    expect(engine.present.files.files[0]?.displayTraces).toHaveLength(0);

    engine = workspaceEngineReducer(engine, {
      type: 'change',
      command: { slice: 'files', action: { type: 'RERUN_WIZARD', payload: { fileId: afterId, fileName: 'keysight_dsox_sample.bin' } } },
    });
    engine = workspaceEngineReducer(engine, {
      type: 'change',
      command: {
        slice: 'files',
        limit: 4,
        action: {
          type: 'RESOLVE_BINARY_WIZARD',
          payload: { id: afterId, binaryConfig: defaultBinaryConfig('keysight_dsox_sample.bin', ksAb.byteLength, 'wavebin') },
        },
      },
    });
    expect(engine.present.files.files[0]?.traces).toHaveLength(2);

    // Binary settings JSON export / import round-trip & malformed input rejection.
    const customCfg = {
      ...defaultBinaryConfig('daq.dat', 1024, null),
      sampleType: 'int16' as const,
      endian: 'be' as const,
      layout: 'interleaved' as const,
      channelCount: 4,
      headerBytes: 128,
      framePadBytes: 2,
      footerBytes: 8,
      sampleRateHz: 250_000,
      yUnit: 'mV',
      yMult: 0.5,
      yOffset: -1.25,
      xMult: 2,
      xOffset: -1e-3,
    };
    const json = serializeBinarySettings(customCfg);
    const loaded = parseBinarySettings(json, defaultBinaryConfig('other.bin', 1024, null));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.config).toMatchObject({
      mode: 'raw',
      sampleType: 'int16',
      endian: 'be',
      layout: 'interleaved',
      channelCount: 4,
      headerBytes: 128,
      framePadBytes: 2,
      footerBytes: 8,
      sampleRateHz: 250_000,
      yUnit: 'mV',
      yMult: 0.5,
      yOffset: -1.25,
      xMult: 2,
      xOffset: -1e-3,
    });
    expect(parseBinarySettings('{not json', customCfg).ok).toBe(false);
  });

  it('detectBinaryDataStart locates WAV, NumPy .npy, scope headers, IEEE 488.2 blocks, and ASCII preambles', () => {
    // 1. All 5 shipped oscilloscope fixtures report positive payload offsets in Custom mode.
    const ks = detectBinaryDataStart(readArrayBuffer('test files/keysight_dsox_sample.bin'));
    expect(ks.detected).toBe(true);
    expect(ks.offset).toBe(164); // 12 + 140 + 12
    expect(ks.reason).toContain('Keysight');

    const rg = detectBinaryDataStart(readArrayBuffer('test files/rigol_dho804_sample.bin'));
    expect(rg.detected).toBe(true);
    expect(rg.offset).toBe(172); // 16 + 140 + 16
    expect(rg.reason).toContain('Rigol');

    const lc = detectBinaryDataStart(readArrayBuffer('test files/lecroy_sample.trc'));
    expect(lc.detected).toBe(true);
    expect(lc.offset).toBeGreaterThanOrEqual(346);
    expect(lc.reason).toContain('LeCroy');

    const tek = detectBinaryDataStart(readArrayBuffer('test files/tektronix_sample.isf'));
    expect(tek.detected).toBe(true);
    expect(tek.offset).toBeGreaterThan(50);
    expect(tek.reason).toContain('IEEE 488.2');

    const ow = detectBinaryDataStart(readArrayBuffer('test files/owon_sample.bin'));
    expect(ow.detected).toBe(true);
    expect(ow.offset).toBeGreaterThan(20);
    expect(ow.reason).toContain('OWON');

    // 2. NumPy .npy v1.0 header ("\x93NUMPY" + v1.0 + 2B len=118 -> data at 128).
    const npy = Buffer.alloc(128 + 32);
    npy[0] = 0x93;
    npy.write('NUMPY', 1, 'ascii');
    npy[6] = 1; npy[7] = 0;
    npy.writeUInt16LE(118, 8);
    const npyRes = detectBinaryDataStart(npy.buffer.slice(npy.byteOffset, npy.byteOffset + npy.byteLength));
    expect(npyRes).toEqual({ offset: 128, reason: 'NumPy .npy header', detected: true });

    // 3. Headerless Float32 stream returns detected=false, offset=0.
    const raw = Buffer.alloc(64);
    for (let i = 0; i < 16; i++) raw.writeFloatLE(Math.sin(i / 3), i * 4);
    const rawRes = detectBinaryDataStart(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    expect(rawRes.detected).toBe(false);
    expect(rawRes.offset).toBe(0);
    expect(findBinaryDataStart(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))).toBe(0);
  });
});
