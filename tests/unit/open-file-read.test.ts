import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyReadBinary, classifyReadFile, maxTraceSerial, workspaceCounts } from '../../src/domain/open-file-read';
import { initialWorkspaceState, snapshotFromWorkspace, workspaceReducer } from '../../src/stores/aggregate-workspace-store';

describe('classifyReadFile', () => {
  it.each(['session.json', 'session.txt'])('opens a v5 workspace envelope in %s', fileName => {
    const snapshot = snapshotFromWorkspace(initialWorkspaceState());
    const text = JSON.stringify({ kind: 'mergen-scope-workspace', version: 5, snapshot });

    expect(classifyReadFile(fileName, text, false, 'import-1')).toEqual({
      kind: 'workspace', snapshot, legacy: false,
    });
  });

  it('migrates a bare v4 body and flags it as legacy', () => {
    const text = readFileSync('tests/fixtures/phase3-preservation/workspace-v4-eight-pane-extension.json', 'utf8');

    expect(classifyReadFile('legacy.json', text, false, 'import-1')).toMatchObject({
      kind: 'workspace', snapshot: { version: 5 }, legacy: true,
    });
  });

  it.each([['session.JSON', false], ['session', true]])('rejects invalid JSON in %s (workspace route: %s)', (fileName, workspaceRoute) => {
    expect(classifyReadFile(fileName, '{broken', workspaceRoute, 'import-1')).toEqual({
      kind: 'invalid-workspace', name: fileName,
    });
  });

  it('rejects valid JSON with an invalid workspace snapshot', () => {
    const text = JSON.stringify({ kind: 'mergen-scope-workspace', snapshot: null });
    expect(classifyReadFile('session.txt', text, false, 'import-1')).toEqual({
      kind: 'invalid-workspace', name: 'session.txt',
    });
  });

  it.each([
    ['brace.csv', '  {Time},Voltage\n0,1\n1,2'],
    ['plain.csv', 'Time,Voltage\n0,1\n1,2'],
  ])('sends %s to the import wizard', (fileName, text) => {
    expect(classifyReadFile(fileName, text, false, 'import-1')).toMatchObject({
      kind: 'data', input: { id: 'import-1', name: fileName, text, parsed: { format: 'needs-import-wizard', fileName, text } },
    });
  });

  it('rejects NUL-byte data with the binary-file message', () => {
    const text = 'Time,Voltage\n0,\0';
    expect(classifyReadFile('binary.csv', text, false, 'import-1')).toEqual({
      kind: 'data', input: { id: 'import-1', name: 'binary.csv', text, parsed: null, error: 'Binary files cannot be opened as measurement data.' },
    });
  });
});

describe('workspaceCounts', () => {
  it('returns null for an empty workspace with the default pane', () => {
    expect(workspaceCounts(initialWorkspaceState())).toBeNull();
  });

  it('counts additional panes as work even when all panes are empty', () => {
    const state = workspaceReducer(initialWorkspaceState(), { slice: 'panes', limit: 4, action: { type: 'SET_PANE_COUNT', payload: 2 } });

    expect(workspaceCounts(state)).toEqual({ files: 0, createdTraces: 0, markers: 0, lines: 0, panes: 2 });
  });
});

describe('maxTraceSerial', () => {
  it('uses the largest finite underscore-delimited numeric suffix', () => {
    const traces = ['trace', 'trace_009', 'trace_27', 'trace_3', 'trace_99_extra', 'trace42', 'trace_-8', `trace_${'9'.repeat(309)}`]
      .map(name => ({ name }));

    expect(maxTraceSerial(traces)).toBe(27);
  });

  it('returns zero when there are no traces', () => {
    expect(maxTraceSerial([])).toBe(0);
  });
});

function buildLeCroyInt8Buffer(sampleCount: number): ArrayBuffer {
  const descLen = 346;
  const buf = new ArrayBuffer(descLen + sampleCount);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, 'WAVEDESC');
  writeAscii(16, 'LECROY_2_3');
  view.setInt16(32, 0, true); // Int8
  view.setInt16(34, 1, true); // LOFIRST (LE)
  view.setInt32(36, descLen, true);
  view.setInt32(60, sampleCount, true);
  view.setInt32(116, sampleCount, true);
  view.setFloat32(156, 1, true);
  view.setFloat32(160, 0, true);
  view.setFloat32(176, 1e-6, true);
  view.setFloat64(180, 0, true);
  writeAscii(196, 'V');
  writeAscii(244, 's');
  return buf;
}

describe('classifyReadBinary auto-open guard', () => {
  it('auto-opens scope captures within SOFT_POINT_LIMIT without routing to the wizard', () => {
    const buf = buildLeCroyInt8Buffer(64);
    const read = classifyReadBinary('small.trc', buf, 'trc-small');
    expect(read.kind).toBe('data');
    if (read.kind !== 'data') return;
    expect(read.input.parsed?.format).toBe('lecroy-trc');
    expect(read.input.parsed?.traces[0]?.data).toHaveLength(64);
    expect(read.input.binaryConfig?.mode).toBe('auto-scope');
  });

  it('routes scope captures above SOFT_POINT_LIMIT to the binary wizard with defaultBinaryReduction', () => {
    const largeBuf = buildLeCroyInt8Buffer(2_500_000);
    const largeRead = classifyReadBinary('large.trc', largeBuf, 'trc-large');
    expect(largeRead.kind).toBe('data');
    if (largeRead.kind !== 'data') return;
    expect(largeRead.input.parsed?.format).toBe('needs-binary-wizard');
    expect(largeRead.input.rawBinary).toBe(largeBuf);
    expect(largeRead.input.binaryConfig).toMatchObject({
      mode: 'auto-scope',
      reduction: { mode: 'full' },
    });

    const veryLargeBuf = buildLeCroyInt8Buffer(11_000_000);
    const veryLargeRead = classifyReadBinary('very-large.trc', veryLargeBuf, 'trc-vl');
    expect(veryLargeRead.kind).toBe('data');
    if (veryLargeRead.kind !== 'data') return;
    expect(veryLargeRead.input.parsed?.format).toBe('needs-binary-wizard');
    expect(veryLargeRead.input.binaryConfig).toMatchObject({
      mode: 'auto-scope',
      reduction: { mode: 'decimate', factor: 6 },
    });
  });
});
