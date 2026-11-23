import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyReadFile, maxTraceSerial, workspaceCounts } from '../../src/domain/open-file-read';
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
