import { describe, expect, it } from 'vitest';
import { planOpenFiles } from '../../src/domain/open-files-plan';
import type { OpenData, OpenInput, OpenMember, OpenPlanContext, OpenState, OpenTrace } from '../../src/types/open-files-plan';

const trace = (id: string, key = id): OpenTrace => ({ id, key });
const data = (inputId: string, selection: Extract<OpenData['result'], { ok: true }>['selection'], name = inputId): OpenData => ({ kind: 'data', inputId, name, result: { ok: true, fileId: `file-${inputId}`, selection } });
const empty: OpenState = { hasWork: false, files: [], panes: [{ id: 'alpha' }], members: [], targetPaneId: 'alpha' };
const ctx = (state = empty): OpenPlanContext => ({ revision: 7, state, paneLimit: 4, issuedPaneIds: [], duplicateChoices: {}, canPlace: (t, p, members) => members.some(m => m.paneIds.includes(p.id) && m.trace.key.split(':')[0] !== t.key.split(':')[0]) ? { allowed: false, reason: 'incompatible' } : { allowed: true }, newPane: (_t, panes) => ({ id: `fresh-${panes.length}` }) });
const fileSteps = (result: ReturnType<typeof planOpenFiles>) => result.ok ? result.steps.filter(step => step.kind === 'file') : [];

describe('file opening plans', () => {
  it('chooses the required defaults, including an empty open matrix', () => {
    const s11 = trace('11', 'Hz:S11'); const s21 = trace('21', 'Hz:S21');
    const cases: [Extract<OpenData['result'], { ok: true }>['selection'], string[], boolean][] = [
      [{ kind: 'single', trace: s11 }, ['11'], false],
      [{ kind: 'network', ports: 1, s11 }, ['11'], true],
      [{ kind: 'network', ports: 2, s11, s21 }, ['21', '11'], true],
      [{ kind: 'network', ports: 3 }, [], true],
      [{ kind: 'columns', selected: Array.from({ length: 10 }, (_, i) => trace(`${i}`, `Hz:${i}`)), recognized: true }, ['0','1','2','3','4','5','6','7'], false],
      [{ kind: 'columns', selected: Array.from({ length: 10 }, (_, i) => trace(`${i}`, `Hz:${i}`)), recognized: false }, ['0','1','2','3','4','5','6','7','8','9'], false],
    ];
    for (const [selection, ids, matrixOpen] of cases) {
      const result = planOpenFiles([data('f', selection)], ctx()); const file = fileSteps(result)[0];
      expect(file?.traces.map(item => item.trace.id)).toEqual(ids); expect(file?.matrixOpen).toBe(matrixOpen);
    }
  });
  it('uses target, compatible pane, fresh pane, then unplaced; includes hidden memberships', () => {
    const hidden: OpenMember = { trace: trace('hidden', 'Hz'), paneIds: ['alpha'] };
    const state: OpenState = { ...empty, panes: [{ id: 'alpha' }, { id: 'beta' }], members: [hidden] };
    const result = planOpenFiles([data('t', { kind: 'single', trace: trace('time', 's') })], ctx(state));
    expect(fileSteps(result)[0]?.traces[0]?.paneIds).toEqual(['beta']);
    const busy = { ...state, members: [...state.members, { trace: trace('busy', 'Hz'), paneIds: ['beta'] }] };
    const created = planOpenFiles([data('t', { kind: 'single', trace: trace('time', 's') })], ctx(busy));
    expect(created.ok && created.steps.map(step => step.kind)).toEqual(['new-pane', 'file']);
    expect(fileSteps(created)[0]?.traces[0]?.paneIds).toEqual(['fresh-2']);
    const full = { ...busy, panes: [...busy.panes, { id: 'c' }, { id: 'd' }], members: [...busy.members, { trace: trace('busy2', 'Hz'), paneIds: ['c','d'] }] };
    const unplaced = fileSteps(planOpenFiles([data('t', { kind: 'single', trace: trace('time', 's') })], ctx(full)))[0]?.traces[0];
    expect(unplaced?.paneIds).toEqual([]); expect(unplaced?.unplacedReason).toBeTruthy();
  });
  it('refuses an incompatible explicit drop without partial plan', () => {
    const state = { ...empty, members: [{ trace: trace('old','Hz'), paneIds: ['alpha'] }] };
    const result = planOpenFiles([data('t', { kind: 'single', trace: trace('new','s') })], { ...ctx(state), explicitPaneId: 'alpha' });
    expect(result).toMatchObject({ ok: false, kind: 'refused', reason: 'incompatible' }); expect(state.members).toHaveLength(1);
  });
  it('applies workspace first, refuses invalid/multiple/cancelled workspace, and leaves input unchanged', () => {
    const workspaceState: OpenState = { ...empty, panes: [{ id: 'restored' }], targetPaneId: 'restored' };
    const workspace: OpenInput = { kind: 'workspace', inputId: 'w', name: 'ws', result: { ok: true, state: workspaceState } };
    const input = [data('d', { kind: 'single', trace: trace('t') }), workspace];
    const result = planOpenFiles(input, ctx());
    expect(result.ok && result.steps.map(step => step.kind)).toEqual(['workspace','file']);
    expect(fileSteps(result)[0]?.traces[0]?.paneIds).toEqual(['restored']);
    expect(planOpenFiles([workspace, workspace], ctx()).ok).toBe(false);
    expect(planOpenFiles([{ ...workspace, result: { ok: false, reason: 'bad workspace' } }], ctx())).toMatchObject({ ok: false, reason: 'bad workspace' });
    const occupied = { ...empty, hasWork: true, files: [{ id: 'x', name: 'x', members: [] }] };
    expect(planOpenFiles([workspace], ctx(occupied))).toMatchObject({ ok: false, kind: 'decision' });
    expect(planOpenFiles([workspace], { ...ctx(occupied), workspaceChoice: 'cancel' })).toMatchObject({ ok: false, kind: 'cancelled' });
    expect(workspaceState.panes).toEqual([{ id: 'restored' }]);
  });
  it('requires duplicate choice, allocates distinct copy name, and preserves matched replacement associations', () => {
    const old = { trace: trace('old','S11'), paneIds: ['alpha'] };
    const state: OpenState = { ...empty, files: [{ id: 'oldfile', name: 'same', members: [old] }, { id: 'copy', name: 'same (2)', members: [] }], members: [old] };
    const input = data('new', { kind: 'single', trace: trace('newtrace','S11') }, 'same');
    expect(planOpenFiles([input], ctx(state))).toMatchObject({ ok: false, kind: 'decision' });
    const copy = planOpenFiles([input], { ...ctx(state), duplicateChoices: { new: 'copy' } });
    expect(fileSteps(copy)[0]?.name).toBe('same (3)');
    expect(planOpenFiles([input], { ...ctx(state), duplicateChoices: { new: 'replace' } })).toMatchObject({ ok: false, reason: 'Complete replacement trace matches are required.' });
    const replacement: OpenData = { ...input, result: { ok: true, fileId: 'file-new', selection: { kind: 'single', trace: trace('newtrace','S11') }, replacementMatches: [trace('newtrace','S11')] } };
    const replace = planOpenFiles([replacement], { ...ctx(state), duplicateChoices: { new: 'replace' } });
    expect(fileSteps(replace)[0]).toMatchObject({ replaceFileId: 'oldfile', traces: [{ paneIds: ['alpha'], preserveFrom: old.trace }] });
    expect(planOpenFiles([input], { ...ctx(state), duplicateChoices: { new: 'cancel' } })).toMatchObject({ ok: false, kind: 'cancelled' });
  });
  it('keeps failed new files and failed replacements ordered alongside successful inputs', () => {
    const state: OpenState = { ...empty, files: [{ id: 'old', name: 'same', members: [] }] };
    const bad: OpenData = { kind: 'data', inputId: 'bad', name: 'bad', result: { ok: false, fileId: 'badfile', reason: 'unreadable' } };
    const badReplacement: OpenData = { ...bad, inputId: 'replace', name: 'same' };
    const result = planOpenFiles([bad, badReplacement, data('ok', { kind: 'single', trace: trace('t') })], { ...ctx(state), duplicateChoices: { replace: 'replace' } });
    expect(result.ok && result.steps.map(s => s.kind)).toEqual(['error','error','file']);
    expect(result.ok && result.steps[1]).toMatchObject({ replaceFileId: 'old', reason: 'unreadable' });
  });
  it('rejects reused issued pane identifiers and confirms work without files', () => {
    const occupied = { ...empty, members: [{ trace: trace('old','Hz'), paneIds: ['alpha'] }] };
    const input = data('time', { kind: 'single', trace: trace('time', 's') });
    expect(planOpenFiles([input], { ...ctx(occupied), issuedPaneIds: ['fresh-1'] })).toMatchObject({ ok: false, reason: 'The planned pane identifier is empty or was already issued.' });
    const workspace: OpenInput = { kind: 'workspace', inputId: 'w', name: 'w', result: { ok: true, state: empty } };
    expect(planOpenFiles([workspace], ctx({ ...empty, hasWork: true }))).toMatchObject({ ok: false, kind: 'decision' });
  });
  it('respects the experimental eight-pane limit', () => {
    const panes = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
    const state = { ...empty, panes, targetPaneId: 'p0', members: [{ trace: trace('old', 'Hz'), paneIds: panes.map(p => p.id) }] };
    const input = data('time', { kind: 'single', trace: trace('new', 's') });
    expect(fileSteps(planOpenFiles([input], ctx(state)))[0]?.traces[0]?.paneIds).toEqual([]);
    expect(fileSteps(planOpenFiles([input], { ...ctx(state), paneLimit: 8 }))[0]?.traces[0]?.paneIds).toEqual(['fresh-5']);
  });
  it('uses the loaded target after workspace replacement, even when an old pane ID coincides', () => {
    const input = data('d', { kind: 'single', trace: trace('t') });
    for (const panes of [[{ id: 'restored' }], [{ id: 'alpha' }, { id: 'restored' }]]) {
      const workspace: OpenInput = { kind: 'workspace', inputId: 'w', name: 'ws', result: { ok: true, state: { ...empty, panes, targetPaneId: 'restored' } } };
      const result = planOpenFiles([input, workspace], { ...ctx(), explicitPaneId: 'alpha' });
      expect(fileSteps(result)[0]?.traces[0]?.paneIds).toEqual(['restored']);
    }
  });
  it('rejects empty columns, input/file/trace IDs, duplicate trace IDs and invalid fresh pane IDs', () => {
    expect(planOpenFiles([data('f', { kind: 'columns', selected: [], recognized: true })], ctx()).ok).toBe(false);
    expect(planOpenFiles([data('', { kind: 'single', trace: trace('t') })], ctx()).ok).toBe(false);
    expect(planOpenFiles([{ ...data('f', { kind: 'single', trace: trace('t') }), result: { ok: true, fileId: '', selection: { kind: 'single', trace: trace('t') } } }], ctx()).ok).toBe(false);
    expect(planOpenFiles([data('f', { kind: 'single', trace: trace('') })], ctx()).ok).toBe(false);
    expect(planOpenFiles([data('f', { kind: 'columns', recognized: false, selected: [trace('x','a'), trace('x','b')] })], ctx()).ok).toBe(false);
    const occupied = { ...empty, members: [{ trace: trace('old','Hz'), paneIds: ['alpha'] }] };
    const result = planOpenFiles([data('f', { kind: 'single', trace: trace('new','s') })], { ...ctx(occupied), newPane: () => ({ id: '' }) });
    expect(result).toMatchObject({ ok: false, kind: 'refused' });
  });
  it('preserves replacement traces beyond defaults, including unplaced traces', () => {
    const oldDefault = { trace: trace('old-11', 'Hz:S11'), paneIds: ['alpha'] };
    const oldExtra = { trace: trace('old-22', 'Hz:S22'), paneIds: [] };
    const state: OpenState = { ...empty, files: [{ id: 'old', name: 'net', members: [oldDefault, oldExtra] }], members: [oldDefault, oldExtra] };
    const input: OpenData = { kind: 'data', inputId: 'new', name: 'net', result: { ok: true, fileId: 'newfile', selection: { kind: 'network', ports: 1, s11: trace('new-11', 'Hz:S11') }, replacementMatches: [trace('new-11', 'Hz:S11'), trace('new-22', 'Hz:S22')] } };
    const result = planOpenFiles([input], { ...ctx(state), duplicateChoices: { new: 'replace' } });
    expect(fileSteps(result)[0]?.traces).toMatchObject([{ preserveFrom: oldDefault.trace, paneIds: ['alpha'] }, { preserveFrom: oldExtra.trace, paneIds: [] }]);
    const bad: OpenData = { ...input, result: { ...input.result as Extract<OpenData['result'], { ok: true }>, replacementMatches: [trace('a','Hz:S22'), trace('b','Hz:S22')] } };
    expect(planOpenFiles([bad], { ...ctx(state), duplicateChoices: { new: 'replace' } }).ok).toBe(false);
  });
});
