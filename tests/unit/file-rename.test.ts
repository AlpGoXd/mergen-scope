import { expect, it } from 'vitest';
import { prepareOpenInput } from '../../src/domain/prepare-open-input';
import { parseTouchstoneFile } from '../../src/domain/parsers/touchstone';
import { defaultFileState, fileReducer } from '../../src/stores/file-store';

it('renames automatic file labels while retaining manually renamed traces', () => {
  const parsed = parseTouchstoneFile('# Hz S RI R 50\n1 0.1 0 0.2 0 0.3 0 0.4 0\n2 0.1 0 0.2 0 0.3 0 0.4 0\n', 'old.s2p');
  const prepared = prepareOpenInput({ parsed, rawText: '', fileId: 'file', fileName: 'old.s2p' });
  if (!prepared.ok) throw Error(prepared.reason);
  let state = { ...defaultFileState, files: [prepared.file] };
  const first = prepared.file.displayTraces![0]!;
  state = fileReducer(state, { type: 'RENAME_DISPLAY_TRACE', payload: { fileId: 'file', displayTraceId: first.id, label: 'Custom' } });
  state = fileReducer(state, { type: 'RENAME_FILE', payload: { fileId: 'file', name: 'new.s2p' } });
  expect(state.files[0]?.fileName).toBe('new.s2p');
  expect(state.files[0]?.displayTraces?.[0]?.compat?.legacyDisplayName).toBe('Custom');
  expect(state.files[0]?.displayTraces?.[1]?.compat?.legacyDisplayName).toContain('new.s2p');
});
