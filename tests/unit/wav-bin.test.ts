import { describe, expect, it } from "vitest";
import { parseWavBin, probeWavBinPoints } from "../../src/domain/parsers/wav-bin.ts";
import { resetParserFileCounter } from "../../src/domain/parsers/rs-dat.ts";

interface ChunkSpec {
  readonly id: string;
  readonly payload: Uint8Array;
}

function writeFourCC(target: Uint8Array, offset: number, fourcc: string): void {
  for (let i = 0; i < 4; i++) {
    target[offset + i] = fourcc.charCodeAt(i);
  }
}

function buildRiffWave(chunks: readonly ChunkSpec[]): ArrayBuffer {
  let bodySize = 4; // "WAVE"
  for (const chunk of chunks) {
    const pad = chunk.payload.byteLength % 2;
    bodySize += 8 + chunk.payload.byteLength + pad;
  }

  const out = new Uint8Array(8 + bodySize);
  const view = new DataView(out.buffer);
  writeFourCC(out, 0, "RIFF");
  view.setUint32(4, bodySize, true);
  writeFourCC(out, 8, "WAVE");

  let cursor = 12;
  for (const chunk of chunks) {
    writeFourCC(out, cursor, chunk.id);
    view.setUint32(cursor + 4, chunk.payload.byteLength, true);
    out.set(chunk.payload, cursor + 8);
    const pad = chunk.payload.byteLength % 2;
    cursor += 8 + chunk.payload.byteLength + pad;
  }
  return out.buffer;
}

function buildFmtPayload(opts: {
  readonly audioFormat: number;
  readonly numChannels: number;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly blockAlign?: number;
  readonly extensibleSubFormat?: number;
  readonly totalSize?: number;
}): Uint8Array {
  const bytesPerSample = Math.max(1, Math.floor(opts.bitsPerSample / 8));
  const blockAlign = opts.blockAlign ?? opts.numChannels * bytesPerSample;
  const size = opts.totalSize ?? (opts.audioFormat === 0xfffe ? 40 : 16);
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  view.setUint16(0, opts.audioFormat, true);
  view.setUint16(2, opts.numChannels, true);
  view.setUint32(4, opts.sampleRate, true);
  view.setUint32(8, opts.sampleRate * blockAlign, true);
  view.setUint16(12, blockAlign, true);
  view.setUint16(14, opts.bitsPerSample, true);
  if (size >= 40 && opts.extensibleSubFormat !== undefined) {
    view.setUint16(16, 22, true); // cbSize
    view.setUint16(18, opts.bitsPerSample, true); // validBitsPerSample
    view.setUint32(20, 0, true); // dwChannelMask
    view.setUint16(24, opts.extensibleSubFormat, true);
  }
  return buf;
}

function encodeSamples(
  frames: readonly (readonly number[])[],
  encoding: "pcm" | "float",
  bitsPerSample: number,
): Uint8Array {
  const numChannels = frames[0]?.length ?? 1;
  const bytesPerSample = bitsPerSample / 8;
  const out = new Uint8Array(frames.length * numChannels * bytesPerSample);
  const view = new DataView(out.buffer);

  let cursor = 0;
  for (const frame of frames) {
    for (let ch = 0; ch < numChannels; ch++) {
      const val = frame[ch] ?? 0;
      if (encoding === "float") {
        if (bitsPerSample === 64) {
          view.setFloat64(cursor, val, true);
        } else {
          view.setFloat32(cursor, val, true);
        }
      } else if (bitsPerSample === 8) {
        view.setUint8(cursor, val);
      } else if (bitsPerSample === 16) {
        view.setInt16(cursor, val, true);
      } else if (bitsPerSample === 24) {
        const masked = val & 0xffffff;
        view.setUint8(cursor, masked & 0xff);
        view.setUint8(cursor + 1, (masked >> 8) & 0xff);
        view.setUint8(cursor + 2, (masked >> 16) & 0xff);
      } else if (bitsPerSample === 32) {
        view.setInt32(cursor, val, true);
      }
      cursor += bytesPerSample;
    }
  }
  return out;
}

describe("RIFF/WAVE (.wav) binary waveform parser", () => {
  it("decodes PCM 8-bit unsigned samples normalized to [-1, 1]", () => {
    resetParserFileCounter();
    const ab = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 1000, bitsPerSample: 8 }) },
      { id: "data", payload: encodeSamples([[0], [128], [255], [64]], "pcm", 8) },
    ]);

    const probe = probeWavBinPoints(ab);
    expect(probe).toEqual({ ok: true, totalPoints: 4 });

    const res = parseWavBin(ab, "pcm8.wav");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.parsed.format).toBe("wav");
    expect(res.parsed.meta["Format"]).toBe("RIFF / WAV (PCM 8-bit)");
    expect(res.parsed.meta["Channels"]).toBe("1");
    expect(res.parsed.meta["Points"]).toBe("4");
    expect(res.parsed.meta["Sample Rate"]).toEqual({ value: 1000, unit: "Hz" });
    expect(res.parsed.meta["Bit Depth"]).toBe("8-bit");
    expect(res.parsed.traces).toHaveLength(1);

    const trace = res.parsed.traces[0];
    expect(trace?.domain).toBe("time");
    expect(trace?.family).toBe("waveform");
    expect(trace?.units).toEqual({ x: "s", y: "" });
    expect(trace?.dn).toBe("pcm8.wav CH1");
    expect(trace?.data.map((p) => p.freq)).toEqual([0, 0.001, 0.002, 0.003]);
    expect(trace?.data.map((p) => p.amp)).toEqual([-1, 0, 127 / 128, -0.5]);
    expect(res.parsed.datasets).toHaveLength(1);
    expect(res.parsed.displayTraces).toHaveLength(1);
    expect(res.parsed.columnIdentities).toEqual([{ index: 0, header: "CH1" }]);
  });

  it("decodes PCM 16-bit, 24-bit, and 32-bit signed LE samples accurately", () => {
    resetParserFileCounter();
    // PCM 16-bit
    const ab16 = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 48000, bitsPerSample: 16 }) },
      { id: "data", payload: encodeSamples([[-32768], [0], [16384], [32767]], "pcm", 16) },
    ]);
    const res16 = parseWavBin(ab16, "pcm16.wav");
    expect(res16.ok).toBe(true);
    if (!res16.ok) return;
    expect(res16.parsed.meta["Format"]).toBe("RIFF / WAV (PCM 16-bit)");
    expect(res16.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([-1, 0, 0.5, 32767 / 32768]);

    // PCM 24-bit (test sign extension for negative values)
    const ab24 = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 96000, bitsPerSample: 24 }) },
      { id: "data", payload: encodeSamples([[-8388608], [-1], [0], [4194304], [8388607]], "pcm", 24) },
    ]);
    const res24 = parseWavBin(ab24, "pcm24.wav");
    expect(res24.ok).toBe(true);
    if (!res24.ok) return;
    expect(res24.parsed.meta["Format"]).toBe("RIFF / WAV (PCM 24-bit)");
    expect(res24.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([
      -1,
      -1 / 8388608,
      0,
      0.5,
      8388607 / 8388608,
    ]);

    // PCM 32-bit
    const ab32 = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 44100, bitsPerSample: 32 }) },
      { id: "data", payload: encodeSamples([[-2147483648], [0], [1073741824], [2147483647]], "pcm", 32) },
    ]);
    const res32 = parseWavBin(ab32, "pcm32.wav");
    expect(res32.ok).toBe(true);
    if (!res32.ok) return;
    expect(res32.parsed.meta["Format"]).toBe("RIFF / WAV (PCM 32-bit)");
    expect(res32.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([
      -1,
      0,
      0.5,
      2147483647 / 2147483648,
    ]);
  });

  it("decodes IEEE Float 32-bit and 64-bit LE samples without clamping", () => {
    resetParserFileCounter();
    const abF32 = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 3, numChannels: 1, sampleRate: 2000, bitsPerSample: 32 }) },
      { id: "data", payload: encodeSamples([[-1.5], [0.25], [2.75]], "float", 32) },
    ]);
    const resF32 = parseWavBin(abF32, "f32.wav");
    expect(resF32.ok).toBe(true);
    if (!resF32.ok) return;
    expect(resF32.parsed.meta["Format"]).toBe("RIFF / WAV (IEEE Float 32-bit)");
    expect(resF32.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([-1.5, 0.25, 2.75]);

    const abF64 = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 3, numChannels: 1, sampleRate: 10000, bitsPerSample: 64 }) },
      { id: "data", payload: encodeSamples([[-3.141592653589793], [0], [1e-9]], "float", 64) },
    ]);
    const resF64 = parseWavBin(abF64, "f64.wav");
    expect(resF64.ok).toBe(true);
    if (!resF64.ok) return;
    expect(resF64.parsed.meta["Format"]).toBe("RIFF / WAV (IEEE Float 64-bit)");
    expect(resF64.parsed.traces[0]?.data[0]?.amp).toBeCloseTo(-Math.PI, 12);
    expect(resF64.parsed.traces[0]?.data[2]?.amp).toBeCloseTo(1e-9, 15);
  });

  it("supports WAVE_FORMAT_EXTENSIBLE (0xFFFE) for PCM and IEEE Float SubFormats", () => {
    resetParserFileCounter();
    const abExtPcm = buildRiffWave([
      {
        id: "fmt ",
        payload: buildFmtPayload({
          audioFormat: 0xfffe,
          numChannels: 1,
          sampleRate: 48000,
          bitsPerSample: 24,
          extensibleSubFormat: 1,
        }),
      },
      { id: "data", payload: encodeSamples([[-8388608], [4194304]], "pcm", 24) },
    ]);
    const resExtPcm = parseWavBin(abExtPcm, "ext-pcm.wav");
    expect(resExtPcm.ok).toBe(true);
    if (!resExtPcm.ok) return;
    expect(resExtPcm.parsed.meta["Format"]).toBe("RIFF / WAV (PCM 24-bit)");
    expect(resExtPcm.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([-1, 0.5]);

    const abExtFloat = buildRiffWave([
      {
        id: "fmt ",
        payload: buildFmtPayload({
          audioFormat: 0xfffe,
          numChannels: 1,
          sampleRate: 96000,
          bitsPerSample: 32,
          extensibleSubFormat: 3,
        }),
      },
      { id: "data", payload: encodeSamples([[-0.5], [1.25]], "float", 32) },
    ]);
    const resExtFloat = parseWavBin(abExtFloat, "ext-f32.wav");
    expect(resExtFloat.ok).toBe(true);
    if (!resExtFloat.ok) return;
    expect(resExtFloat.parsed.meta["Format"]).toBe("RIFF / WAV (IEEE Float 32-bit)");
    expect(resExtFloat.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([-0.5, 1.25]);
  });

  it("parses stereo and 4-channel interleaved frames and labels CH1..CHn", () => {
    resetParserFileCounter();
    const ab4ch = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 4, sampleRate: 1000, bitsPerSample: 16 }) },
      {
        id: "data",
        payload: encodeSamples(
          [
            [16384, -16384, 8192, -8192],
            [0, 32767, -32768, 4096],
            [-16384, 0, 16384, -4096],
          ],
          "pcm",
          16,
        ),
      },
    ]);

    expect(probeWavBinPoints(ab4ch)).toEqual({ ok: true, totalPoints: 12 });

    const res = parseWavBin(ab4ch, "quad.wav");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.parsed.meta["Channels"]).toBe("4");
    expect(res.parsed.meta["Points"]).toBe("3");
    expect(res.parsed.traces).toHaveLength(4);
    expect(res.parsed.columnIdentities).toEqual([
      { index: 0, header: "CH1" },
      { index: 1, header: "CH2" },
      { index: 2, header: "CH3" },
      { index: 3, header: "CH4" },
    ]);
    expect(res.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([0.5, 0, -0.5]);
    expect(res.parsed.traces[1]?.data.map((p) => p.amp)).toEqual([-0.5, 32767 / 32768, 0]);
    expect(res.parsed.traces[2]?.data.map((p) => p.amp)).toEqual([0.25, -1, 0.5]);
    expect(res.parsed.traces[3]?.data.map((p) => p.amp)).toEqual([-0.25, 0.125, -0.125]);
  });

  it("skips JUNK, LIST, fact, bext, and odd-length chunks with RIFF word-alignment padding", () => {
    resetParserFileCounter();
    const oddJunk = new TextEncoder().encode("ODD"); // 3 bytes -> needs 1 pad byte
    const listPayload = new TextEncoder().encode("INFOINAMtest");
    const factPayload = new Uint8Array([3, 0, 0, 0]);
    const cuePayload = new Uint8Array([0, 0, 0, 0]);

    const ab = buildRiffWave([
      { id: "JUNK", payload: oddJunk },
      { id: "LIST", payload: listPayload },
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 2, sampleRate: 500, bitsPerSample: 16 }) },
      { id: "fact", payload: factPayload },
      { id: "data", payload: encodeSamples([[16384, -16384], [-16384, 16384], [0, 0]], "pcm", 16) },
      { id: "cue ", payload: cuePayload },
    ]);

    const res = parseWavBin(ab, "chunked.wav");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.parsed.traces).toHaveLength(2);
    expect(res.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([0.5, -0.5, 0]);
    expect(res.parsed.traces[1]?.data.map((p) => p.amp)).toEqual([-0.5, 0.5, 0]);
    expect(res.summaryText).toContain("Skipped Chunks: JUNK, LIST, fact, cue");
  });

  it("supports pre-reduction options.slice with decimate and envelope reductions", () => {
    resetParserFileCounter();
    const frames: [number, number][] = [];
    for (let i = 0; i < 20; i++) {
      // CH1: i * 0.05; CH2: alternating peak pattern
      frames.push([i * 0.05, i % 2 === 0 ? -1 : 1]);
    }
    const ab = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 3, numChannels: 2, sampleRate: 1000, bitsPerSample: 32 }) },
      { id: "data", payload: encodeSamples(frames, "float", 32) },
    ]);

    // Slice frames [4..15] (12 frames) then boxcar decimate by 3 -> 4 points
    const decRes = parseWavBin(ab, "sliced.wav", {
      slice: { start: 4, count: 12 },
      reduction: { mode: "decimate", factor: 3 },
    });
    expect(decRes.ok).toBe(true);
    if (!decRes.ok) return;
    expect(decRes.parsed.meta["Decimation"]).toContain("Boxcar decimated 3×");
    expect(decRes.parsed.meta["Decimation"]).toContain("(per ch)");
    const ch1Dec = decRes.parsed.traces[0];
    expect(ch1Dec?.isUniform).toBe(true);
    expect(ch1Dec?.data).toHaveLength(4);
    expect(ch1Dec?.data[0]?.freq).toBeCloseTo(0.004, 9);
    // Average of frames 4,5,6 => (0.20 + 0.25 + 0.30) / 3 = 0.25
    expect(ch1Dec?.data[0]?.amp).toBeCloseTo(0.25, 6);

    // Envelope reduction on full 20 frames targeting 8 points
    const envRes = parseWavBin(ab, "env.wav", {
      reduction: { mode: "envelope", targetPoints: 8 },
    });
    expect(envRes.ok).toBe(true);
    if (!envRes.ok) return;
    const ch2Env = envRes.parsed.traces[1];
    expect(ch2Env?.isUniform).toBe(false);
    expect(ch2Env?.envelopeOf).toBe(20);
    expect(ch2Env?.data.length).toBeLessThanOrEqual(8);
    expect(envRes.parsed.meta["Decimation"]).toContain("Min-max reduced");
  });

  it("handles truncated data chunk gracefully when >= 2 frames remain, and rejects when < 2", () => {
    resetParserFileCounter();
    const abFull = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 1000, bitsPerSample: 16 }) },
      { id: "data", payload: encodeSamples([[16384], [-16384], [8192], [-8192]], "pcm", 16) },
    ]);

    // Chop last 3 bytes -> 5 bytes remain in data => 2 complete 16-bit frames
    const truncatedTwoFrames = abFull.slice(0, abFull.byteLength - 3);
    expect(probeWavBinPoints(truncatedTwoFrames)).toEqual({ ok: true, totalPoints: 2 });
    const okRes = parseWavBin(truncatedTwoFrames, "trunc-ok.wav");
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.parsed.traces[0]?.data.map((p) => p.amp)).toEqual([0.5, -0.5]);
    }

    // Chop 5 bytes -> 3 bytes remain => only 1 complete frame -> rejected
    const truncatedOneFrame = abFull.slice(0, abFull.byteLength - 5);
    expect(probeWavBinPoints(truncatedOneFrame).ok).toBe(false);
    expect(parseWavBin(truncatedOneFrame, "trunc-bad.wav").ok).toBe(false);
  });

  it("rejects malformed, compressed, unsupported, and out-of-bounds WAV inputs safely", () => {
    // 1. Too short
    expect(parseWavBin(new ArrayBuffer(8), "tiny.wav").ok).toBe(false);

    // 2. Wrong RIFF/WAVE magic
    const badMagic = new Uint8Array(44);
    writeFourCC(badMagic, 0, "OggS");
    expect(parseWavBin(badMagic.buffer, "bad.wav").ok).toBe(false);

    // 3. Missing fmt chunk
    const noFmt = buildRiffWave([
      { id: "data", payload: encodeSamples([[0], [100]], "pcm", 16) },
    ]);
    expect(parseWavBin(noFmt, "nofmt.wav").ok).toBe(false);

    // 4. Missing data chunk
    const noData = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 1000, bitsPerSample: 16 }) },
    ]);
    expect(parseWavBin(noData, "nodata.wav").ok).toBe(false);

    // 5. Compressed formats (MS ADPCM = 0x0002, MP3 = 0x0055)
    const adpcm = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 0x0002, numChannels: 1, sampleRate: 8000, bitsPerSample: 4, blockAlign: 256 }) },
      { id: "data", payload: new Uint8Array(512) },
    ]);
    const adpcmRes = parseWavBin(adpcm, "adpcm.wav");
    expect(adpcmRes.ok).toBe(false);
    if (!adpcmRes.ok) expect(adpcmRes.error).toMatch(/compressed|unsupported/i);

    const mp3Wav = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 0x0055, numChannels: 2, sampleRate: 44100, bitsPerSample: 16 }) },
      { id: "data", payload: new Uint8Array(64) },
    ]);
    expect(parseWavBin(mp3Wav, "mp3.wav").ok).toBe(false);

    // 6. WAVE_FORMAT_EXTENSIBLE with fmt size < 40 or unsupported subformat
    const shortExt = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 0xfffe, numChannels: 1, sampleRate: 48000, bitsPerSample: 16, totalSize: 18 }) },
      { id: "data", payload: encodeSamples([[0], [1]], "pcm", 16) },
    ]);
    expect(parseWavBin(shortExt, "short-ext.wav").ok).toBe(false);

    const badSubExt = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 0xfffe, numChannels: 1, sampleRate: 48000, bitsPerSample: 16, extensibleSubFormat: 0x0006 }) },
      { id: "data", payload: encodeSamples([[0], [1]], "pcm", 16) },
    ]);
    expect(parseWavBin(badSubExt, "bad-sub.wav").ok).toBe(false);

    // 7. Invalid channel count / sample rate / bit depth / blockAlign
    const zeroCh = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 0, sampleRate: 48000, bitsPerSample: 16, blockAlign: 2 }) },
      { id: "data", payload: new Uint8Array(16) },
    ]);
    expect(parseWavBin(zeroCh, "zeroch.wav").ok).toBe(false);

    const tooManyCh = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 33, sampleRate: 48000, bitsPerSample: 16 }) },
      { id: "data", payload: new Uint8Array(256) },
    ]);
    expect(parseWavBin(tooManyCh, "33ch.wav").ok).toBe(false);

    const zeroRate = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 0, bitsPerSample: 16 }) },
      { id: "data", payload: new Uint8Array(16) },
    ]);
    expect(parseWavBin(zeroRate, "0hz.wav").ok).toBe(false);

    const badBits = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 48000, bitsPerSample: 12, blockAlign: 2 }) },
      { id: "data", payload: new Uint8Array(16) },
    ]);
    expect(parseWavBin(badBits, "12bit.wav").ok).toBe(false);

    const badBlockAlign = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 2, sampleRate: 48000, bitsPerSample: 16, blockAlign: 2 }) },
      { id: "data", payload: new Uint8Array(16) },
    ]);
    expect(parseWavBin(badBlockAlign, "bad-align.wav").ok).toBe(false);

    // 8. Corrupt chunk size (0xFFFFFFFF) before data chunk does not loop or crash
    const evilChunk = new Uint8Array(64);
    const evilView = new DataView(evilChunk.buffer);
    writeFourCC(evilChunk, 0, "RIFF");
    evilView.setUint32(4, 56, true);
    writeFourCC(evilChunk, 8, "WAVE");
    writeFourCC(evilChunk, 12, "fmt ");
    evilView.setUint32(16, 16, true);
    evilChunk.set(buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 1000, bitsPerSample: 16 }), 20);
    writeFourCC(evilChunk, 36, "JUNK");
    evilView.setUint32(40, 0xffffffff, true);
    expect(parseWavBin(evilChunk.buffer, "evil.wav").ok).toBe(false);

    // 9. Slice leaving fewer than 2 frames
    const validAb = buildRiffWave([
      { id: "fmt ", payload: buildFmtPayload({ audioFormat: 1, numChannels: 1, sampleRate: 1000, bitsPerSample: 16 }) },
      { id: "data", payload: encodeSamples([[0], [100], [200]], "pcm", 16) },
    ]);
    expect(parseWavBin(validAb, "slice1.wav", { slice: { start: 2, count: 1 } }).ok).toBe(false);
  });
});
