// ============================================================================
// Mergen Scope — RIFF/WAVE (.wav) Binary Waveform Parser
// ============================================================================
// Clean-room parser for uncompressed RIFF/WAVE audio/waveform captures:
//   - PCM (audioFormat = 1): 8-bit unsigned, 16/24/32-bit signed LE
//   - IEEE Float (audioFormat = 3): 32/64-bit LE
//   - WAVE_FORMAT_EXTENSIBLE (audioFormat = 0xFFFE): SubFormat 1 or 3
// Pure domain module with strict untrusted-input bounds checks.
// ============================================================================

import type { RawTrace } from "../../types/trace.ts";
import type { ColumnIdentity, FileMetadata, MetadataEntry, ParsedFile } from "../../types/file.ts";
import type { ScalarDisplayTrace } from "../../types/display.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { reduceBinarySeries } from "./binary-reduce.ts";
import type { BinaryParseOptions, ScopeProbeResult } from "./binary-reduce.ts";
import type { BinaryParseResult } from "./lecroy-trc.ts";

const MAX_WAV_CHANNELS = 32;
const WAVE_FORMAT_PCM = 0x0001;
const WAVE_FORMAT_IEEE_FLOAT = 0x0003;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

type WavSampleEncoding = "pcm" | "float";

interface WavFmtInfo {
  readonly encoding: WavSampleEncoding;
  readonly numChannels: number;
  readonly sampleRate: number;
  readonly blockAlign: number;
  readonly bitsPerSample: number;
  readonly bytesPerSample: number;
}

interface WavInspectedHeader extends WavFmtInfo {
  readonly view: DataView;
  readonly dataOffset: number;
  readonly dataChunkSize: number;
  readonly frameCount: number;
  readonly skippedChunks: readonly string[];
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function parseFmtChunk(
  view: DataView,
  fmtOffset: number,
  fmtSize: number,
): { readonly ok: true; readonly fmt: WavFmtInfo } | { readonly ok: false; readonly error: string } {
  if (fmtSize < 16 || fmtOffset + fmtSize > view.byteLength) {
    return { ok: false, error: "WAV 'fmt ' chunk is truncated or invalid." };
  }

  const audioFormat = view.getUint16(fmtOffset, true);
  const numChannels = view.getUint16(fmtOffset + 2, true);
  const sampleRate = view.getUint32(fmtOffset + 4, true);
  const blockAlign = view.getUint16(fmtOffset + 12, true);
  const bitsPerSample = view.getUint16(fmtOffset + 14, true);

  let encoding: WavSampleEncoding;
  if (audioFormat === WAVE_FORMAT_PCM) {
    encoding = "pcm";
  } else if (audioFormat === WAVE_FORMAT_IEEE_FLOAT) {
    encoding = "float";
  } else if (audioFormat === WAVE_FORMAT_EXTENSIBLE) {
    if (fmtSize < 40 || fmtOffset + 40 > view.byteLength) {
      return { ok: false, error: "WAV 'fmt ' chunk with WAVE_FORMAT_EXTENSIBLE (0xFFFE) must be at least 40 bytes." };
    }
    const subFormat = view.getUint16(fmtOffset + 24, true);
    if (subFormat === WAVE_FORMAT_PCM) {
      encoding = "pcm";
    } else if (subFormat === WAVE_FORMAT_IEEE_FLOAT) {
      encoding = "float";
    } else {
      return {
        ok: false,
        error: `Unsupported WAVE_FORMAT_EXTENSIBLE sub-format (0x${subFormat.toString(16).padStart(4, "0")}). Only uncompressed PCM and IEEE Float are supported.`,
      };
    }
  } else {
    return {
      ok: false,
      error: `Unsupported WAV audio format (0x${audioFormat.toString(16).padStart(4, "0")}). Compressed formats (e.g. ADPCM, MP3) are not supported; only PCM and IEEE Float are supported.`,
    };
  }

  if (numChannels < 1 || numChannels > MAX_WAV_CHANNELS) {
    return { ok: false, error: `Unsupported WAV channel count (${numChannels}). Expected 1..${MAX_WAV_CHANNELS} channels.` };
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { ok: false, error: `Invalid WAV sample rate (${sampleRate} Hz).` };
  }

  if (encoding === "pcm") {
    if (bitsPerSample !== 8 && bitsPerSample !== 16 && bitsPerSample !== 24 && bitsPerSample !== 32) {
      return { ok: false, error: `Unsupported PCM bit depth (${bitsPerSample}-bit). Expected 8, 16, 24, or 32.` };
    }
  } else if (bitsPerSample !== 32 && bitsPerSample !== 64) {
    return { ok: false, error: `Unsupported IEEE Float bit depth (${bitsPerSample}-bit). Expected 32 or 64.` };
  }

  const bytesPerSample = bitsPerSample / 8;
  const minBlockAlign = numChannels * bytesPerSample;
  if (blockAlign < minBlockAlign) {
    return {
      ok: false,
      error: `Invalid WAV blockAlign (${blockAlign}); expected at least ${minBlockAlign} bytes.`,
    };
  }

  return {
    ok: true,
    fmt: {
      encoding,
      numChannels,
      sampleRate,
      blockAlign,
      bitsPerSample,
      bytesPerSample,
    },
  };
}

function inspectWavBin(
  buffer: ArrayBuffer,
): { readonly ok: true; readonly info: WavInspectedHeader } | { readonly ok: false; readonly error: string } {
  if (buffer.byteLength < 12) {
    return { ok: false, error: "WAV file is truncated (shorter than 12-byte RIFF/WAVE header)." };
  }

  const view = new DataView(buffer);
  if (readFourCC(view, 0) !== "RIFF" || readFourCC(view, 8) !== "WAVE") {
    return { ok: false, error: "Unrecognized WAV header (expected RIFF/WAVE)." };
  }

  let fmt: WavFmtInfo | null = null;
  let dataChunk: { readonly offset: number; readonly size: number } | null = null;
  const skippedChunks: string[] = [];

  let cursor = 12;
  while (cursor + 8 <= buffer.byteLength) {
    const chunkId = readFourCC(view, cursor);
    const chunkSize = view.getUint32(cursor + 4, true);
    const chunkDataOffset = cursor + 8;

    // RIFF chunks are padded to an even byte boundary.
    const paddedSize = chunkSize + (chunkSize % 2);
    const nextCursor = chunkDataOffset + paddedSize;
    if (!Number.isSafeInteger(nextCursor) || nextCursor <= cursor) {
      return { ok: false, error: `Invalid WAV chunk size for '${chunkId}'.` };
    }

    if (chunkId === "fmt ") {
      if (!fmt) {
        const parsedFmt = parseFmtChunk(view, chunkDataOffset, chunkSize);
        if (!parsedFmt.ok) return { ok: false, error: parsedFmt.error };
        fmt = parsedFmt.fmt;
      }
    } else if (chunkId === "data") {
      if (!dataChunk) {
        dataChunk = { offset: chunkDataOffset, size: chunkSize };
      }
    } else {
      const label = chunkId.trim();
      if (label) skippedChunks.push(label);
    }

    if (nextCursor > buffer.byteLength) {
      break;
    }
    cursor = nextCursor;
  }

  if (!fmt) {
    return { ok: false, error: "WAV file is missing a 'fmt ' chunk." };
  }
  if (!dataChunk) {
    return { ok: false, error: "WAV file is missing a 'data' chunk." };
  }

  const availableBytes = Math.min(dataChunk.size, Math.max(0, buffer.byteLength - dataChunk.offset));
  const frameCount = Math.floor(availableBytes / fmt.blockAlign);
  if (frameCount < 2) {
    return { ok: false, error: "WAV file contains fewer than 2 sample frames." };
  }

  return {
    ok: true,
    info: {
      view,
      ...fmt,
      dataOffset: dataChunk.offset,
      dataChunkSize: dataChunk.size,
      frameCount,
      skippedChunks,
    },
  };
}

function decodeWavSample(
  view: DataView,
  offset: number,
  encoding: WavSampleEncoding,
  bitsPerSample: number,
): number {
  if (encoding === "float") {
    return bitsPerSample === 64
      ? view.getFloat64(offset, true)
      : view.getFloat32(offset, true);
  }
  switch (bitsPerSample) {
    case 8:
      return (view.getUint8(offset) - 128) / 128;
    case 16:
      return view.getInt16(offset, true) / 32768;
    case 24: {
      const b0 = view.getUint8(offset);
      const b1 = view.getUint8(offset + 1);
      const b2 = view.getUint8(offset + 2);
      const raw24 = b0 | (b1 << 8) | (b2 << 16);
      const signed24 = (raw24 << 8) >> 8;
      return signed24 / 8388608;
    }
    case 32:
      return view.getInt32(offset, true) / 2147483648;
    default:
      return Number.NaN;
  }
}

/** Header-only probe returning total sample points across all channels without allocating sample arrays. */
export function probeWavBinPoints(buffer: ArrayBuffer): ScopeProbeResult {
  const inspected = inspectWavBin(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  return { ok: true, totalPoints: inspected.info.frameCount * inspected.info.numChannels };
}

/** Parse a RIFF/WAVE (.wav) binary waveform capture. */
export function parseWavBin(
  buffer: ArrayBuffer,
  fileName: string,
  options: BinaryParseOptions = {},
): BinaryParseResult {
  const inspected = inspectWavBin(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  const info = inspected.info;

  const rawStart = options.slice?.start;
  const rawCount = options.slice?.count;
  const sliceStart = rawStart !== undefined && Number.isFinite(rawStart)
    ? Math.max(0, Math.min(info.frameCount, Math.floor(rawStart)))
    : 0;
  const sliceCount = rawCount !== undefined && Number.isFinite(rawCount) && rawCount > 0
    ? Math.min(Math.floor(rawCount), info.frameCount - sliceStart)
    : info.frameCount - sliceStart;
  if (sliceCount < 2) {
    return { ok: false, error: "Selected WAV slice contains fewer than 2 sample frames." };
  }

  const fileSerial = incrementFileCounter();
  const prefix = `${fileName.replace(/\.[^.]+$/, "")} `;
  const dt = 1 / info.sampleRate;
  const traces: RawTrace[] = [];
  const columnIdentities: ColumnIdentity[] = [];
  let decimatedNote: string | null = null;

  for (let chIdx = 0; chIdx < info.numChannels; chIdx++) {
    const label = `CH${chIdx + 1}`;
    const channelByteOffset = chIdx * info.bytesPerSample;

    const reduced = reduceBinarySeries({
      count: sliceCount,
      xStart: sliceStart * dt,
      dt,
      readY: (i) => {
        const offset = info.dataOffset + (sliceStart + i) * info.blockAlign + channelByteOffset;
        return decodeWavSample(info.view, offset, info.encoding, info.bitsPerSample);
      },
      reduction: options.reduction,
    });
    if (reduced.decimationNote) {
      decimatedNote = info.numChannels > 1 ? `${reduced.decimationNote} (per ch)` : reduced.decimationNote;
    }

    const normalized = normalizeTraceData(reduced.points);
    if (normalized.length < 2) continue;

    traces.push({
      ...makeTrace(prefix, fileName, label, fileSerial),
      domain: "time",
      family: "waveform",
      isUniform: reduced.isUniform,
      ...(reduced.envelopeOf !== undefined ? { envelopeOf: reduced.envelopeOf } : {}),
      dn: `${fileName} ${label}`,
      units: { x: "s", y: null },
      data: normalized,
    });
    columnIdentities.push({ index: traces.length - 1, header: label });
  }

  if (traces.length === 0) {
    return { ok: false, error: "WAV file contains no finite waveform data." };
  }

  const encodingLabel = info.encoding === "pcm" ? "PCM" : "IEEE Float";
  const formatLabel = `RIFF / WAV (${encodingLabel} ${info.bitsPerSample}-bit)`;
  const bitDepthLabel = `${info.bitsPerSample}-bit`;

  const meta: Record<string, MetadataEntry> = {
    Format: formatLabel,
    Channels: String(traces.length),
    Points: String(info.frameCount),
    "Sample Rate": { value: info.sampleRate, unit: "Hz" },
    "Bit Depth": bitDepthLabel,
  };
  if (decimatedNote) {
    meta["Decimation"] = decimatedNote;
  }

  const durationSec = info.frameCount / info.sampleRate;
  const summaryLines = [
    `Format: ${formatLabel}`,
    `Channels: ${info.numChannels}`,
    `Sample Rate: ${info.sampleRate} Hz`,
    `Bit Depth: ${bitDepthLabel}`,
    `Frames: ${info.frameCount} (${durationSec.toFixed(6)} s)`,
    `Block Align: ${info.blockAlign} bytes`,
  ];
  if (info.skippedChunks.length > 0) {
    summaryLines.push(`Skipped Chunks: ${info.skippedChunks.join(", ")}`);
  }
  const summaryText = summaryLines.join("\n");

  const datasets = traces.map((trace) => buildSeriesDatasetFromTrace(trace, "waveform"));
  const displayTraces: ScalarDisplayTrace[] = [];
  for (const [index, trace] of traces.entries()) {
    const dataset = datasets[index];
    const firstSeries = dataset?.series[0];
    if (!dataset || !firstSeries) continue;
    displayTraces.push(buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace));
  }

  const parsed: ParsedFile = {
    format: "wav",
    meta: meta as FileMetadata,
    traces,
    datasets,
    displayTraces,
    columnIdentities,
    rawText: summaryText,
  };
  return { ok: true, parsed, summaryText };
}
