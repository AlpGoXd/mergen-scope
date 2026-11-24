import type { OpenDataCommand, WorkspaceState } from '../stores/workspace/workspace-state';
import type { WorkspaceSnapshotV5 } from '../types/workspace-v5';
import type { WorkspaceCounts } from './confirm-text';
import { BINARY_SNIFF_BYTES, detectBinarySignature } from './parsers/binary-detect';
import { parseForImport } from './parsers/parse-file';
import { parseWavebin, probeWavebinPoints } from './parsers/wavebin';
import { parseLeCroyTrc, probeLeCroyTrcPoints } from './parsers/lecroy-trc';
import { parseTekIsf, probeTekIsfPoints } from './parsers/tek-isf';
import { parseOwonBin, probeOwonBinPoints } from './parsers/owon-bin';
import { defaultBinaryConfig, isBinaryFileExtension } from './parsers/raw-binary';
import { defaultBinaryReduction } from './parsers/binary-reduce';
import { pointBudget } from './point-budget';
import { migrateWorkspaceV5 } from './workspace-migrate-v5';

export type ReadFileResult =
  | { kind: 'invalid-workspace'; name: string }
  | { kind: 'workspace'; snapshot: WorkspaceSnapshotV5; legacy: boolean }
  | { kind: 'data'; input: OpenDataCommand };

export function classifyReadFile(fileName: string, text: string, workspaceRoute: boolean, id: string): ReadFileResult {
  const extensionSuggestsWorkspace = /\.json$/i.test(fileName);
  let raw: unknown;
  let isWorkspaceEnvelope = false;
  if (extensionSuggestsWorkspace || workspaceRoute || text.trimStart().startsWith('{')) {
    try {
      raw = JSON.parse(text);
      isWorkspaceEnvelope = !!raw && typeof raw === 'object' && !Array.isArray(raw)
        && 'kind' in raw && raw.kind === 'mergen-scope-workspace';
    } catch {
      if (extensionSuggestsWorkspace || workspaceRoute) return { kind: 'invalid-workspace', name: fileName };
    }
  }
  if (extensionSuggestsWorkspace || workspaceRoute || isWorkspaceEnvelope) {
    const snapshot = migrateWorkspaceV5(raw);
    if (!snapshot) return { kind: 'invalid-workspace', name: fileName };
    const body = raw && typeof raw === 'object' && 'kind' in raw && raw.kind === 'mergen-scope-workspace' && 'snapshot' in raw
      ? raw.snapshot : raw;
    const legacy = !(body && typeof body === 'object' && 'version' in body && body.version === 5);
    return { kind: 'workspace', snapshot, legacy };
  }
  if (text.includes(String.fromCharCode(0))) {
    return { kind: 'data', input: { id, name: fileName, text, parsed: null, error: 'Binary files cannot be opened as measurement data.' } };
  }
  return { kind: 'data', input: { id, name: fileName, text, parsed: parseForImport(text, fileName) } };
}

/**
 * Parse a binary measurement file:
 * - Recognized oscilloscope formats (Keysight AG / Rigol RG .bin, LeCroy .trc, Tektronix .isf, OWON .bin)
 *   import directly while retaining their raw buffer so users can re-run Import settings… anytime.
 * - Unrecognized or headerless binary/SDR files (.bin, .cfile, .cf32, .sc16, .cu8, .iq, etc.) — or a
 *   recognized scope header that failed auto-parse — route into the Binary Import Wizard.
 */
export function classifyReadBinary(fileName: string, buffer: ArrayBuffer, id: string): ReadFileResult {
  const signature = detectBinarySignature(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, BINARY_SNIFF_BYTES)));
  let binaryWarning: string | undefined;

  if (signature !== null) {
    const probe = signature === 'wavebin' ? probeWavebinPoints(buffer)
      : signature === 'lecroy-trc' ? probeLeCroyTrcPoints(buffer)
      : signature === 'tek-isf' ? probeTekIsfPoints(buffer)
      : probeOwonBinPoints(buffer);

    if (probe.ok) {
      const budget = pointBudget(probe.totalPoints);
      if (budget.level !== 'ok') {
        const baseConfig = defaultBinaryConfig(fileName, buffer.byteLength, signature);
        return {
          kind: 'data',
          input: {
            id,
            name: fileName,
            text: '',
            parsed: {
              format: 'needs-binary-wizard',
              fileName,
              meta: {},
              traces: [],
            },
            rawBinary: buffer,
            binaryConfig: {
              ...baseConfig,
              reduction: defaultBinaryReduction(probe.totalPoints),
            },
          },
        };
      }

      const result = signature === 'wavebin' ? parseWavebin(buffer, fileName)
        : signature === 'lecroy-trc' ? parseLeCroyTrc(buffer, fileName)
        : signature === 'tek-isf' ? parseTekIsf(buffer, fileName)
        : parseOwonBin(buffer, fileName);

      if (result.ok) {
        return {
          kind: 'data',
          input: {
            id,
            name: fileName,
            text: result.summaryText,
            parsed: result.parsed,
            rawBinary: buffer,
            binaryConfig: defaultBinaryConfig(fileName, buffer.byteLength, signature),
          },
        };
      }
      binaryWarning = result.error;
    } else {
      binaryWarning = probe.error;
    }
  }

  // Fallback to Binary Import Wizard if a scope header failed auto-parse, the extension is binary/SDR,
  // or the file starts with binary bytes (e.g. headerless raw binary .dat / .raw / .wfm / .pcm).
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, BINARY_SNIFF_BYTES));
  const hasBinaryBytes = head.some(byte => byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d));
  if (signature !== null || isBinaryFileExtension(fileName) || hasBinaryBytes) {
    const suggestedBinary = defaultBinaryConfig(fileName, buffer.byteLength, null);
    return {
      kind: 'data',
      input: {
        id,
        name: fileName,
        text: '',
        parsed: {
          format: 'needs-binary-wizard',
          fileName,
          meta: {},
          traces: [],
        },
        rawBinary: buffer,
        binaryConfig: suggestedBinary,
        ...(binaryWarning ? { binaryWarning } : {}),
      },
    };
  }

  return { kind: 'data', input: { id, name: fileName, text: '', parsed: null, error: 'Binary files cannot be opened as measurement data.' } };
}

/** What opening a workspace would close; null when nothing is open (no question needed). */
export function workspaceCounts(state: WorkspaceState): WorkspaceCounts | null {
  const counts = {
    files: state.files.files.length,
    createdTraces: state.traces.derivedTraces.length,
    markers: state.markers.markers.length,
    lines: state.lines.refLines.length,
    panes: state.panes.panes.length,
  };
  return counts.files || counts.createdTraces || counts.markers || counts.lines || counts.panes > 1 ? counts : null;
}

export function maxTraceSerial(traces: readonly { name: string }[]): number {
  return traces.reduce((max, trace) => {
    const serial = Number(/_(\d+)$/.exec(trace.name)?.[1]);
    return Number.isFinite(serial) ? Math.max(max, serial) : max;
  }, 0);
}
