// ============================================================================
// Mergen Scope — OWON Binary Waveform Parser (.bin / SPBXDS)
// ============================================================================
// Parses OWON XDS/SDS/TAO .bin captures structured as:
//   [6B "SPBXDS"] [4B uint32 jsonLen] [UTF-8 JSON header] [channel blocks...]
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

const MAX_JSON_HEADER_BYTES = 1024 * 1024;
const DEFAULT_CODES_PER_DIV_8 = 25;
const DEFAULT_CODES_PER_DIV_16 = 6400; // 25 * 256 for 12/14-bit left-aligned Int16 on XDS

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse OWON engineering strings like "500mV", "2.00V", "100uS", "1.00kHz", "250MSa/s". */
function parseScaledString(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : Number.NaN;
  if (typeof raw !== "string") return Number.NaN;
  const match = raw.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([pnumkMGTµμ]?)/i);
  if (!match) return Number.NaN;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return Number.NaN;
  const prefix = match[2] ?? "";
  const mult: Record<string, number> = {
    p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3,
    "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12,
  };
  return value * (mult[prefix] ?? 1);
}

interface OwonChannelBlock {
  readonly ch: Record<string, unknown>;
  readonly label: string;
  readonly bytesPerPoint: 1 | 2;
  readonly dataOffset: number;
  readonly sampleCount: number;
}

interface OwonInspectedHeader {
  readonly view: DataView;
  readonly header: Record<string, unknown>;
  readonly jsonText: string;
  readonly sampleRateFromHeader: number;
  readonly timebaseScale: number;
  readonly hOffset: number;
  readonly channels: readonly OwonChannelBlock[];
}

function inspectOwonBin(buffer: ArrayBuffer): { readonly ok: true; readonly info: OwonInspectedHeader } | { readonly ok: false; readonly error: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 12) {
    return { ok: false, error: "OWON .bin file is truncated." };
  }
  const magic = new TextDecoder("ascii").decode(bytes.subarray(0, 6));
  if (magic !== "SPBXDS") {
    return { ok: false, error: "Unrecognized OWON binary header (expected SPBXDS)." };
  }

  const view = new DataView(buffer);
  const jsonLen = view.getUint32(6, true);
  if (jsonLen === 0 || jsonLen > MAX_JSON_HEADER_BYTES || 10 + jsonLen > buffer.byteLength) {
    return { ok: false, error: `Invalid OWON JSON header length (${jsonLen} bytes).` };
  }

  const jsonText = new TextDecoder("utf-8").decode(bytes.subarray(10, 10 + jsonLen));
  let header: unknown;
  try {
    header = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "OWON .bin embedded JSON header is malformed." };
  }
  if (!isRecord(header)) {
    return { ok: false, error: "OWON .bin header must be a JSON object." };
  }

  const channelsRaw = Array.isArray(header["CHANNEL"]) ? header["CHANNEL"] : [];
  const enabledChannels = channelsRaw.filter(
    (entry): entry is Record<string, unknown> => isRecord(entry) && String(entry["DISPLAY"] ?? "ON").toUpperCase() !== "OFF",
  );
  if (enabledChannels.length === 0) {
    return { ok: false, error: "No enabled channels were found in this OWON .bin file." };
  }

  const sampleObj = isRecord(header["SAMPLE"]) ? header["SAMPLE"] : {};
  const timebaseObj = isRecord(header["TIMEBASE"]) ? header["TIMEBASE"] : {};
  const rawGlobalLen = Number(sampleObj["DATALEN"] ?? sampleObj["FULLSCREEN"] ?? 0);
  const globalLen = Number.isFinite(rawGlobalLen) && rawGlobalLen > 0 ? Math.floor(rawGlobalLen) : 0;
  const sampleRateFromHeader = parseScaledString(sampleObj["SAMPLERATE"]);
  const timebaseScale = parseScaledString(timebaseObj["SCALE"]);
  const hOffset = Number(timebaseObj["HOFFSET"] ?? 0);

  let cursor = 10 + jsonLen;
  const channels: OwonChannelBlock[] = [];

  for (const [chIdx, ch] of enabledChannels.entries()) {
    const label = String(ch["NAME"] ?? `CH${chIdx + 1}`).trim() || `CH${chIdx + 1}`;
    const dataBits = Number(ch["DATABIT"] ?? ch["BIT"] ?? sampleObj["DATABIT"] ?? 16);
    const bytesPerPoint: 1 | 2 = dataBits <= 8 ? 1 : 2;
    const rawChLen = Number(ch["DATALEN"] ?? globalLen);
    const chLen = Number.isFinite(rawChLen) && rawChLen > 0 ? Math.floor(rawChLen) : 0;

    // OWON XDS files precede each channel payload with a 4-byte uint32 byte length.
    // When DATALEN is known, consume a matching 4-byte prefix unconditionally before bounds checking
    // so a 1-3 byte EOF truncation cannot skip the prefix and decode it as waveform samples.
    let payloadBytes = chLen > 0 ? chLen * bytesPerPoint : 0;
    if (cursor + 4 <= buffer.byteLength) {
      const prefixedLen = view.getUint32(cursor, true);
      if (payloadBytes > 0) {
        if (prefixedLen === payloadBytes) {
          cursor += 4;
        }
      } else if (prefixedLen > 0 && cursor + 4 + prefixedLen <= buffer.byteLength) {
        payloadBytes = prefixedLen;
        cursor += 4;
      }
    }
    if (!Number.isFinite(payloadBytes) || payloadBytes <= 0 || cursor + payloadBytes > buffer.byteLength) {
      if (channels.length > 0) break;
      return { ok: false, error: `OWON channel ${label} sample buffer exceeds file bounds.` };
    }

    const sampleCount = Math.floor(payloadBytes / bytesPerPoint);
    const dataOffset = cursor;
    cursor += payloadBytes;
    if (sampleCount < 2) continue;

    channels.push({ ch, label, bytesPerPoint, dataOffset, sampleCount });
  }

  if (channels.length === 0) {
    return { ok: false, error: "No readable analog channels were found in this OWON .bin file." };
  }

  return {
    ok: true,
    info: {
      view,
      header,
      jsonText,
      sampleRateFromHeader,
      timebaseScale,
      hOffset,
      channels,
    },
  };
}

/** Header-only probe returning total analog sample points across channels without allocating sample arrays. */
export function probeOwonBinPoints(buffer: ArrayBuffer): ScopeProbeResult {
  const inspected = inspectOwonBin(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  const totalPoints = inspected.info.channels.reduce((sum, ch) => sum + ch.sampleCount, 0);
  return { ok: true, totalPoints };
}

/** Parse an OWON SPBXDS binary oscilloscope (.bin) capture. */
export function parseOwonBin(
  buffer: ArrayBuffer,
  fileName: string,
  options: BinaryParseOptions = {},
): BinaryParseResult {
  const inspected = inspectOwonBin(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  const info = inspected.info;

  const fileSerial = incrementFileCounter();
  const prefix = `${fileName.replace(/\.[^.]+$/, "")} `;
  const traces: RawTrace[] = [];
  const columnIdentities: ColumnIdentity[] = [];
  let maxRawPoints = 0;
  let decimatedNote: string | null = null;

  for (const block of info.channels) {
    const { ch, label, bytesPerPoint, dataOffset, sampleCount } = block;
    if (sampleCount > maxRawPoints) maxRawPoints = sampleCount;

    const voltsPerDiv = parseScaledString(ch["SCALE"]);
    const probe = parseScaledString(ch["PROBE"]);
    const probeMult = Number.isFinite(probe) && probe > 0 ? probe : 1;
    const scaleDiv = Number.isFinite(voltsPerDiv) && voltsPerDiv > 0 ? voltsPerDiv * probeMult : 1;
    const codesPerDiv = bytesPerPoint === 1 ? DEFAULT_CODES_PER_DIV_8 : DEFAULT_CODES_PER_DIV_16;
    const offsetDiv = Number(ch["OFFSET"] ?? 0);
    const verticalOffset = Number.isFinite(offsetDiv) ? offsetDiv * scaleDiv : 0;

    const rawSampleRate = Number.isFinite(info.sampleRateFromHeader) && info.sampleRateFromHeader > 0
      ? info.sampleRateFromHeader
      : Number.isFinite(info.timebaseScale) && info.timebaseScale > 0
        ? sampleCount / (10 * info.timebaseScale)
        : 1;
    const sampleRate = Number.isFinite(rawSampleRate) && rawSampleRate > 0 ? rawSampleRate : 1;
    const rawDt = 1 / sampleRate;
    const dt = Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 1;
    const xOrigin = Number.isFinite(info.hOffset) ? -info.hOffset * dt : 0;

    const readSample = (index: number): number => {
      const raw = bytesPerPoint === 1
        ? info.view.getInt8(dataOffset + index)
        : info.view.getInt16(dataOffset + index * 2, true);
      return (raw / codesPerDiv) * scaleDiv - verticalOffset;
    };

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
      xStart: xOrigin + sliceStart * dt,
      dt,
      readY: (i) => readSample(sliceStart + i),
      reduction: options.reduction,
    });
    if (reduced.decimationNote) {
      decimatedNote = `${reduced.decimationNote} (per ch)`;
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
      units: { x: "s", y: "V" },
      data: normalized,
    });
    columnIdentities.push({ index: traces.length - 1, header: label });
  }

  if (traces.length === 0) {
    return { ok: false, error: "No readable analog channels were found in this OWON .bin file." };
  }

  const meta: Record<string, MetadataEntry> = {
    Format: "OWON Binary (SPBXDS)",
    Channels: String(traces.length),
    Points: String(maxRawPoints),
  };
  if (typeof info.header["MODEL"] === "string" && info.header["MODEL"].trim()) meta["Instrument"] = info.header["MODEL"].trim();
  if (Number.isFinite(info.sampleRateFromHeader) && info.sampleRateFromHeader > 0) {
    meta["Sample Rate"] = { value: info.sampleRateFromHeader, unit: "Hz" };
  }
  if (decimatedNote) meta["Decimation"] = decimatedNote;

  const datasets = traces.map((trace) => buildSeriesDatasetFromTrace(trace, "waveform"));
  const displayTraces: ScalarDisplayTrace[] = [];
  for (const [index, trace] of traces.entries()) {
    const dataset = datasets[index];
    const firstSeries = dataset?.series[0];
    if (!dataset || !firstSeries) continue;
    displayTraces.push(buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace));
  }

  const parsed: ParsedFile = {
    format: "owon-bin",
    meta: meta as FileMetadata,
    traces,
    datasets,
    displayTraces,
    columnIdentities,
    rawText: info.jsonText,
  };
  return { ok: true, parsed, summaryText: info.jsonText };
}
