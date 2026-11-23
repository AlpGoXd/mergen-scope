import type { OpenDataCommand, WorkspaceState } from '../stores/workspace/workspace-state';
import type { WorkspaceSnapshotV5 } from '../types/workspace-v5';
import type { WorkspaceCounts } from './confirm-text';
import { parseForImport } from './parsers/parse-file';
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
