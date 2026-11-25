// ============================================================================
// Mergen Scope — Keysight / Agilent ("AG") & Rigol ("RG") Binary Waveform Parser
// ============================================================================
// Parses multi-channel binary oscilloscope captures (.bin) compatible with
// Keysight InfiniiVision/Infiniium ("AG") and Rigol MSO5000/DHO800/DHO1000/
// DS70000 ("RG") — the same formats supported by sam210723/wavebin.
//
// Pure domain module (no React, no DOM) with strict untrusted-input bounds checks.
// ============================================================================

import type { RawTrace, TraceDomain } from "../../types/trace.ts";
import type { ColumnIdentity, FileMetadata, MetadataEntry, ParsedFile } from "../../types/file.ts";
import type { ScalarDisplayTrace } from "../../types/display.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { reduceBinarySeries } from "./binary-reduce.ts";
import type { BinaryParseOptions, ScopeProbeResult } from "./binary-reduce.ts";

/** Hard safety cap on waveform headers parsed from one untrusted file. */
const MAX_WAVEFORMS = 512;
const MAX_BUFFERS_PER_WAVEFORM = 16;
const MIN_WAVEFORM_HEADER_SIZE = 140;
const MAX_WAVEFORM_HEADER_SIZE = 4096;
const MIN_DATA_HEADER_SIZE = 12;
const MAX_DATA_HEADER_SIZE = 256;
/** Keysight/Agilent writes 9.9e37 as an unacquired/clipped hole sentinel in Float32 buffers. */
const HOLE_SENTINEL = 9.0e37;

export type WavebinVendor = "Keysight / Agilent" | "Rigol";

export type WavebinParseResult =
  | { readonly ok: true; readonly parsed: ParsedFile; readonly summaryText: string }
  | { readonly ok: false; readonly error: string };

interface FileHeaderInfo {
  readonly vendor: WavebinVendor;
  readonly cookie: "AG" | "RG";
  readonly version: string;
  readonly fileSize: number;
  readonly nWaveforms: number;
  readonly headerBytes: number;
}

interface WaveformHeaderInfo {
  readonly headerSize: number;
  readonly waveformType: number;
  readonly nWaveformBuffers: number;
  readonly points: number;
  readonly count: number;
  readonly xDisplayRange: number;
  readonly xDisplayOrigin: number;
  readonly xIncrement: number;
  readonly xOrigin: number;
  readonly xUnits: number;
  readonly yUnits: number;
  readonly date: string;
  readonly time: string;
  readonly frameString: string;
  readonly waveformLabel: string;
  readonly timeTag: number;
  readonly segmentIndex: number;
}

interface DataHeaderInfo {
  readonly headerSize: number;
  readonly bufferType: number;
  readonly bytesPerPoint: number;
  readonly bufferSize: number;
}

/** Read a little-endian uint64 safely into a JS number (returns NaN if beyond MAX_SAFE_INTEGER). */
function readUint64LE(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  const value = hi * 4294967296 + lo;
  return Number.isSafeInteger(value) ? value : Number.NaN;
}

/** Decode a NUL-terminated fixed-width ASCII string cleanly. */
function readAsciiField(view: DataView, offset: number, length: number): string {
  const end = Math.min(view.byteLength, offset + length);
  let out = "";
  for (let i = offset; i < end; i++) {
    const code = view.getUint8(i);
    if (code === 0) break;
    if (code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
  }
  return out.trim();
}

function formatVersion(view: DataView): string {
  const b2 = view.getUint8(2);
  const b3 = view.getUint8(3);
  if (b2 >= 0x20 && b2 <= 0x7e && b3 >= 0x20 && b3 <= 0x7e) {
    return `${String.fromCharCode(b2)}${String.fromCharCode(b3)}`;
  }
  return `${b2}.${b3}`;
}

function isPlausibleWaveformHeaderSize(view: DataView, offset: number): boolean {
  if (offset + 4 > view.byteLength) return false;
  const size = view.getInt32(offset, true);
  return size >= MIN_WAVEFORM_HEADER_SIZE && size <= MAX_WAVEFORM_HEADER_SIZE && offset + size <= view.byteLength;
}

function parseFileHeader(view: DataView): FileHeaderInfo | { readonly error: string } {
  if (view.byteLength < 12) return { error: "Binary waveform file is truncated (header too short)." };
  const c0 = view.getUint8(0);
  const c1 = view.getUint8(1);
  const cookie = c0 === 0x41 && c1 === 0x47 ? "AG" : c0 === 0x52 && c1 === 0x47 ? "RG" : null;
  if (!cookie) return { error: "Unrecognized oscilloscope binary header (expected AG or RG)." };
  const vendor: WavebinVendor = cookie === "AG" ? "Keysight / Agilent" : "Rigol";
  const version = formatVersion(view);

  // Keysight "AG" uses a 12-byte file header (uint32 fileSize).
  // Modern Rigol "RG" (DHO800/900/1000, MSO5000, DS70000) uses a 16-byte header (uint64 fileSize),
  // while some older Rigol exports use the 12-byte Keysight layout.
  if (cookie === "RG" && view.byteLength >= 16) {
    const size64 = readUint64LE(view, 4);
    const nWfm16 = view.getUint32(12, true);
    const wfm16Valid = nWfm16 > 0 && nWfm16 <= MAX_WAVEFORMS && isPlausibleWaveformHeaderSize(view, 16);

    const size32 = view.getUint32(4, true);
    const nWfm12 = view.getUint32(8, true);
    const wfm12Valid = nWfm12 > 0 && nWfm12 <= MAX_WAVEFORMS && isPlausibleWaveformHeaderSize(view, 12);

    if (size64 === view.byteLength && wfm16Valid) {
      return { vendor, cookie, version, fileSize: size64, nWaveforms: nWfm16, headerBytes: 16 };
    }
    if (size32 === view.byteLength && wfm12Valid) {
      return { vendor, cookie, version, fileSize: size32, nWaveforms: nWfm12, headerBytes: 12 };
    }
    if (wfm16Valid && !wfm12Valid) {
      return { vendor, cookie, version, fileSize: Number.isFinite(size64) ? size64 : view.byteLength, nWaveforms: nWfm16, headerBytes: 16 };
    }
    if (wfm12Valid) {
      return { vendor, cookie, version, fileSize: size32, nWaveforms: nWfm12, headerBytes: 12 };
    }
    return { error: "Rigol binary waveform header is invalid or truncated." };
  }

  const fileSize = view.getUint32(4, true);
  const nWaveforms = view.getUint32(8, true);
  if (nWaveforms === 0 || nWaveforms > MAX_WAVEFORMS) {
    return { error: `Invalid waveform count (${nWaveforms}) in binary header.` };
  }
  return { vendor, cookie, version, fileSize, nWaveforms, headerBytes: 12 };
}

function parseWaveformHeader(view: DataView, offset: number): WaveformHeaderInfo | { readonly error: string } {
  if (offset + MIN_WAVEFORM_HEADER_SIZE > view.byteLength) {
    return { error: "Waveform header is truncated." };
  }
  const headerSize = view.getInt32(offset, true);
  if (headerSize < MIN_WAVEFORM_HEADER_SIZE || headerSize > MAX_WAVEFORM_HEADER_SIZE || offset + headerSize > view.byteLength) {
    return { error: `Invalid waveform header size (${headerSize} bytes).` };
  }
  return {
    headerSize,
    waveformType: view.getInt32(offset + 4, true),
    nWaveformBuffers: view.getInt32(offset + 8, true),
    points: view.getInt32(offset + 12, true),
    count: view.getInt32(offset + 16, true),
    xDisplayRange: view.getFloat32(offset + 20, true),
    xDisplayOrigin: view.getFloat64(offset + 24, true),
    xIncrement: view.getFloat64(offset + 32, true),
    xOrigin: view.getFloat64(offset + 40, true),
    xUnits: view.getInt32(offset + 48, true),
    yUnits: view.getInt32(offset + 52, true),
    date: readAsciiField(view, offset + 56, 16),
    time: readAsciiField(view, offset + 72, 16),
    frameString: readAsciiField(view, offset + 88, 24),
    waveformLabel: readAsciiField(view, offset + 112, 16),
    timeTag: view.getFloat64(offset + 128, true),
    segmentIndex: view.getUint32(offset + 136, true),
  };
}

function parseDataHeader(view: DataView, offset: number): DataHeaderInfo | { readonly error: string } {
  if (offset + MIN_DATA_HEADER_SIZE > view.byteLength) {
    return { error: "Waveform data header is truncated." };
  }
  const headerSize = view.getInt32(offset, true);
  if (headerSize < MIN_DATA_HEADER_SIZE || headerSize > MAX_DATA_HEADER_SIZE || offset + headerSize > view.byteLength) {
    return { error: `Invalid waveform data header size (${headerSize} bytes).` };
  }
  const bufferType = view.getInt16(offset + 4, true);
  const bytesPerPoint = view.getInt16(offset + 6, true);
  const bufferSize = headerSize >= 16 ? readUint64LE(view, offset + 8) : view.getUint32(offset + 8, true);
  if (!Number.isFinite(bufferSize) || bufferSize < 0 || offset + headerSize + bufferSize > view.byteLength) {
    return { error: "Waveform sample buffer exceeds file bounds." };
  }
  return { headerSize, bufferType, bytesPerPoint, bufferSize };
}

function mapXAxis(xUnits: number): { readonly domain: TraceDomain; readonly unit: string; readonly family: "waveform" | "spectrum" } {
  if (xUnits === 6) return { domain: "frequency", unit: "Hz", family: "spectrum" };
  if (xUnits === 3) return { domain: "frequency", unit: "unitless", family: "spectrum" };
  if (xUnits === 1) return { domain: "frequency", unit: "V", family: "spectrum" };
  if (xUnits === 4) return { domain: "frequency", unit: "A", family: "spectrum" };
  if (xUnits === 5) return { domain: "frequency", unit: "dB", family: "spectrum" };
  // 2 = Seconds; 0 = Unknown (standard oscilloscope captures are time-domain seconds).
  return { domain: "time", unit: "s", family: "waveform" };
}

function mapYUnit(yUnits: number): string | null {
  switch (yUnits) {
    case 1: return "V";
    case 2: return "s";
    case 3: return null;
    case 4: return "A";
    case 5: return "dB";
    case 6: return "Hz";
    default: return "V";
  }
}

function isUsableSample(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < HOLE_SENTINEL;
}

function uniqueLabel(base: string, segmentIndex: number, used: Set<string>): string {
  const clean = base.trim() || "CH";
  if (!used.has(clean)) { used.add(clean); return clean; }
  if (segmentIndex > 0) {
    const segName = `${clean} (seg ${segmentIndex})`;
    if (!used.has(segName)) { used.add(segName); return segName; }
  }
  let suffix = 2;
  while (used.has(`${clean} #${suffix}`)) suffix += 1;
  const candidate = `${clean} #${suffix}`;
  used.add(candidate);
  return candidate;
}

/** Header-only probe returning total analog sample points across channels without allocating sample arrays. */
export function probeWavebinPoints(buffer: ArrayBuffer): ScopeProbeResult {
  const view = new DataView(buffer);
  const fileHeader = parseFileHeader(view);
  if ("error" in fileHeader) return { ok: false, error: fileHeader.error };

  let cursor = fileHeader.headerBytes;
  let totalPoints = 0;
  let validBuffers = 0;
  let skippedLogicBuffers = 0;

  for (let w = 0; w < fileHeader.nWaveforms; w++) {
    const wfm = parseWaveformHeader(view, cursor);
    if ("error" in wfm) {
      if (validBuffers > 0) break;
      return { ok: false, error: wfm.error };
    }
    cursor += wfm.headerSize;

    if (wfm.nWaveformBuffers <= 0 || wfm.nWaveformBuffers > MAX_BUFFERS_PER_WAVEFORM) {
      return { ok: false, error: `Invalid buffer count (${wfm.nWaveformBuffers}) in waveform ${w + 1}.` };
    }

    const isLogicWaveform = wfm.waveformType === 6;
    for (let b = 0; b < wfm.nWaveformBuffers; b++) {
      const dataHeader = parseDataHeader(view, cursor);
      if ("error" in dataHeader) {
        if (validBuffers > 0) break;
        return { ok: false, error: dataHeader.error };
      }
      const dataOffset = cursor + dataHeader.headerSize;
      cursor = dataOffset + dataHeader.bufferSize;

      if (isLogicWaveform || dataHeader.bufferType === 6) {
        skippedLogicBuffers += 1;
        continue;
      }
      const isAnalogFloat = (dataHeader.bufferType === 1 || dataHeader.bufferType === 2 || dataHeader.bufferType === 3)
        && dataHeader.bytesPerPoint === 4;
      if (!isAnalogFloat || !Number.isFinite(wfm.xOrigin) || !Number.isFinite(wfm.xIncrement) || wfm.xIncrement === 0) {
        continue;
      }

      const maxCountInBuffer = Math.floor(dataHeader.bufferSize / 4);
      const sampleCount = Math.min(Math.max(0, wfm.points), maxCountInBuffer);
      if (sampleCount < 2) continue;

      totalPoints += sampleCount;
      validBuffers += 1;
    }
  }

  if (validBuffers === 0) {
    if (skippedLogicBuffers > 0) {
      return { ok: false, error: "This .bin file contains only digital logic channels, which are not yet supported." };
    }
    return { ok: false, error: "No readable analog waveforms were found in this .bin file." };
  }
  return { ok: true, totalPoints };
}

/** Parse a Keysight/Agilent ("AG") or Rigol ("RG") oscilloscope binary (.bin) file. */
export function parseWavebin(
  buffer: ArrayBuffer,
  fileName: string,
  options: BinaryParseOptions = {},
): WavebinParseResult {
  const view = new DataView(buffer);
  const fileHeader = parseFileHeader(view);
  if ("error" in fileHeader) return { ok: false, error: fileHeader.error };

  const fileSerial = incrementFileCounter();
  const prefix = `${fileName.replace(/\.[^.]+$/, "")} `;
  const usedLabels = new Set<string>();

  const traces: RawTrace[] = [];
  const columnIdentities: ColumnIdentity[] = [];
  const summaryLines: string[] = [
    `Format: ${fileHeader.vendor} Binary (${fileHeader.cookie} v${fileHeader.version})`,
    `File Size: ${buffer.byteLength} bytes`,
    `Waveforms Declared: ${fileHeader.nWaveforms}`,
  ];

  let cursor = fileHeader.headerBytes;
  let skippedLogicBuffers = 0;
  let skippedUnsupportedBuffers = 0;
  let instrument = "";
  let captureDate = "";
  let captureTime = "";
  let firstSampleRate: number | null = null;
  let maxRawPoints = 0;
  let decimatedNote: string | null = null;

  for (let w = 0; w < fileHeader.nWaveforms; w++) {
    const wfm = parseWaveformHeader(view, cursor);
    if ("error" in wfm) {
      if (traces.length > 0) break;
      return { ok: false, error: wfm.error };
    }
    cursor += wfm.headerSize;

    if (!instrument && wfm.frameString) instrument = wfm.frameString;
    if (!captureDate && wfm.date) captureDate = wfm.date;
    if (!captureTime && wfm.time) captureTime = wfm.time;
    if (firstSampleRate === null && Number.isFinite(wfm.xIncrement) && wfm.xIncrement > 0) {
      firstSampleRate = 1 / wfm.xIncrement;
    }

    if (wfm.nWaveformBuffers <= 0 || wfm.nWaveformBuffers > MAX_BUFFERS_PER_WAVEFORM) {
      return { ok: false, error: `Invalid buffer count (${wfm.nWaveformBuffers}) in waveform ${w + 1}.` };
    }

    const baseLabel = wfm.waveformLabel || `CH${w + 1}`;
    const xAxis = mapXAxis(wfm.xUnits);
    const yUnit = mapYUnit(wfm.yUnits);
    const isLogicWaveform = wfm.waveformType === 6;

    for (let b = 0; b < wfm.nWaveformBuffers; b++) {
      const dataHeader = parseDataHeader(view, cursor);
      if ("error" in dataHeader) {
        if (traces.length > 0) break;
        return { ok: false, error: dataHeader.error };
      }
      const dataOffset = cursor + dataHeader.headerSize;
      cursor = dataOffset + dataHeader.bufferSize;

      // Skip logic pods (bufferType 6) and non-analog buffers (time/counts/unknown) cleanly.
      if (isLogicWaveform || dataHeader.bufferType === 6) {
        skippedLogicBuffers += 1;
        continue;
      }
      const isAnalogFloat = (dataHeader.bufferType === 1 || dataHeader.bufferType === 2 || dataHeader.bufferType === 3)
        && dataHeader.bytesPerPoint === 4;
      if (!isAnalogFloat) {
        skippedUnsupportedBuffers += 1;
        continue;
      }
      if (!Number.isFinite(wfm.xOrigin) || !Number.isFinite(wfm.xIncrement) || wfm.xIncrement === 0) {
        skippedUnsupportedBuffers += 1;
        continue;
      }

      const maxCountInBuffer = Math.floor(dataHeader.bufferSize / 4);
      const sampleCount = Math.min(Math.max(0, wfm.points), maxCountInBuffer);
      if (sampleCount < 2) continue;
      if (sampleCount > maxRawPoints) maxRawPoints = sampleCount;

      const bufferSuffix = dataHeader.bufferType === 2 ? " (max)" : dataHeader.bufferType === 3 ? " (min)" : "";
      const label = uniqueLabel(`${baseLabel}${bufferSuffix}`, wfm.segmentIndex, usedLabels);
      const rawStart = options.slice?.start;
      const rawCount = options.slice?.count;
      const sliceStart = rawStart !== undefined && Number.isFinite(rawStart)
        ? Math.max(0, Math.min(sampleCount, Math.floor(rawStart)))
        : 0;
      const sliceCount = rawCount !== undefined && Number.isFinite(rawCount) && rawCount > 0
        ? Math.min(Math.floor(rawCount), sampleCount - sliceStart)
        : sampleCount - sliceStart;
      if (sliceCount < 2) continue;

      const reduced = reduceBinarySeries({
        count: sliceCount,
        xStart: wfm.xOrigin + sliceStart * wfm.xIncrement,
        dt: wfm.xIncrement,
        readY: (i) => view.getFloat32(dataOffset + (sliceStart + i) * 4, true),
        isUsable: isUsableSample,
        reduction: options.reduction,
      });
      if (reduced.decimationNote) {
        decimatedNote = `${reduced.decimationNote} (per ch)`;
      }

      const normalized = normalizeTraceData(reduced.points);
      if (normalized.length < 2) continue;

      const trace: RawTrace = {
        ...makeTrace(prefix, fileName, label, fileSerial),
        domain: xAxis.domain,
        family: xAxis.family,
        isUniform: reduced.isUniform,
        ...(reduced.envelopeOf !== undefined ? { envelopeOf: reduced.envelopeOf } : {}),
        dn: `${fileName} ${label}`,
        units: { x: xAxis.unit, y: yUnit },
        data: normalized,
      };
      traces.push(trace);
      columnIdentities.push({ index: traces.length - 1, header: label });
      summaryLines.push(
        `Waveform ${traces.length}: ${label} · ${sampleCount} pts · x0=${wfm.xOrigin} ${xAxis.unit} · dx=${wfm.xIncrement} ${xAxis.unit} · y=${yUnit ?? "unitless"}`,
      );
    }
  }

  if (traces.length === 0) {
    if (skippedLogicBuffers > 0) {
      return { ok: false, error: "This .bin file contains only digital logic channels, which are not yet supported." };
    }
    return { ok: false, error: "No readable analog waveforms were found in this .bin file." };
  }

  const meta: Record<string, MetadataEntry> = {
    Format: `${fileHeader.vendor} Binary (${fileHeader.cookie} v${fileHeader.version})`,
    Channels: String(traces.length),
    Points: String(maxRawPoints),
  };
  if (instrument) meta["Instrument"] = instrument;
  if (captureDate) meta["Date"] = captureDate;
  if (captureTime) meta["Time"] = captureTime;
  if (firstSampleRate !== null && Number.isFinite(firstSampleRate)) {
    meta["Sample Rate"] = { value: firstSampleRate, unit: "Hz" };
  }
  if (decimatedNote) meta["Decimation"] = decimatedNote;
  if (skippedLogicBuffers > 0) {
    meta["Skipped Logic Channels"] = String(skippedLogicBuffers);
  }
  if (skippedUnsupportedBuffers > 0) {
    meta["Skipped Buffers"] = String(skippedUnsupportedBuffers);
  }

  const datasets = traces.map((trace) => buildSeriesDatasetFromTrace(trace, trace.family === "spectrum" ? "spectrum" : "waveform"));
  const displayTraces: ScalarDisplayTrace[] = [];
  for (const [index, trace] of traces.entries()) {
    const dataset = datasets[index];
    const firstSeries = dataset?.series[0];
    if (!dataset || !firstSeries) continue;
    displayTraces.push(buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace));
  }

  const summaryText = summaryLines.join("\n");
  const parsed: ParsedFile = {
    format: "wavebin",
    meta: meta as FileMetadata,
    traces,
    datasets,
    displayTraces,
    columnIdentities,
    rawText: summaryText,
  };
  return { ok: true, parsed, summaryText };
}
