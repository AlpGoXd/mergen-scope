import { describe, expect, it } from 'vitest';
import { getOpenProjectionKey, prepareOpenInput } from '../../src/domain/prepare-open-input';
import { parseTouchstoneFile } from '../../src/domain/parsers/touchstone';
import { parseRSDat } from '../../src/domain/parsers/rs-dat';
import { adaptDisplayTraceToLegacyTrace } from '../../src/domain/display-trace-adapter';
import { parseTabularFile } from '../../src/domain/parsers/tabular';
import { appendTouchstoneDisplayTrace, makeDefaultTouchstoneState } from '../../src/domain/touchstone/selections';
import type { WizardConfig } from '../../src/types/file';

function network(ports: number, value = 0.2) {
  const row = Array.from({ length: ports * ports }, () => `${value} 0`).join(' ');
  return parseTouchstoneFile(`# Hz S RI R 50\n1 ${row}\n2 ${row}\n`, `n.s${ports}p`);
}
const prepare = (ports: number, prior?: Parameters<typeof prepareOpenInput>[0]['prior'], value = 0.2) => prepareOpenInput({ parsed: network(ports, value), rawText: 'raw', fileId: `new-${ports}`, fileName: `n.s${ports}p`, prior });
const config: WizardConfig = { delimiter: ',', skipRows: 1, xCol: 0, yCols: [1, 2], xMult: 1, yMult: 1, domain: 'time', confidence: 1, headers: ['time', 'a', 'b'] };
const csv = (text: string) => parseTabularFile(text, 'x.csv', config);

describe('prepareOpenInput', () => {
  it('refuses replacement with a different file kind', () => {
    const first = prepare(2); if (!first.ok) throw Error(first.reason);
    const result = prepareOpenInput({ parsed: csv('time,a,b\n0,1,2\n1,3,4\n'), rawText: '', fileId: 'csv', fileName: 'x.csv', prior: first.file, wizardConfig: config });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('file kinds differ') });
  });
  it('prepares real parsed network defaults for one, two and three ports', () => {
    for (const ports of [1, 2, 3]) {
      const result = prepare(ports); expect(result.ok).toBe(true); if (!result.ok) continue;
      expect(result.selection.kind).toBe('network');
      expect(result.file.traces).toHaveLength(ports === 3 ? 0 : ports);
      expect(result.file.matrixOpen).toBe(true);
      expect(result.file.datasets?.[0]?.fileId).toBe(`new-${ports}`);
    }
  });
  it('preserves a closed matrix when replacing a network file', () => {
    const first = prepare(2); if (!first.ok) throw Error(first.reason);
    const next = prepare(2, { ...first.file, matrixOpen: false });
    if (!next.ok) throw Error(next.reason);
    expect(next.file.matrixOpen).toBe(false);
  });
  it('regenerates nondefault hidden and unplaced views, preserving identities after rename', () => {
    const first = prepare(2); if (!first.ok) throw Error(first.reason);
    let prior = appendTouchstoneDisplayTrace(first.file, makeDefaultTouchstoneState(first.file), 'S', 1, 2, 'Phase');
    const last = prior.displayTraces?.at(-1); if (!last) throw Error('missing view');
    prior = { ...prior, displayTraces: prior.displayTraces?.map(d => d.id === last.id ? { ...d, hidden: true } : d), traces: prior.traces.map(t => t.id === last.id ? { ...t, dn: 'renamed', paneId: null } : t) };
    const next = prepare(2, prior, 0.7); if (!next.ok) throw Error(next.reason);
    const view = next.file.displayTraces?.find(d => d.id === last.id);
    expect(view?.hidden).toBe(true); expect(next.file.traces.find(t => t.id === last.id)?.dn).toBe('renamed');
    expect(next.file.traces.find(t => t.id === last.id)?.name).toBe(prior.traces.find(t => t.id === last.id)?.name);
    expect(next.replacementMatches).toHaveLength(3); expect(next.file.traces[0]?.data[0]?.amp).not.toBe(first.file.traces[0]?.data[0]?.amp);
    expect(next.file.traces.find(t => t.id === last.id)?.fileId).toBe('new-2');
  });
  it('reports parameters removed by a reduced port count', () => {
    const first = prepare(2); if (!first.ok) throw Error(first.reason);
    const next = prepare(1, first.file); if (!next.ok) throw Error(next.reason);
    expect(next.removedKeys).toHaveLength(1); expect(next.replacementMatches).toHaveLength(1);
  });
  it('uses actual CSV output columns and rejects missing or duplicate mappings', () => {
    const parsed = csv('time,a,b\n0,1,2\n1,3,4\n');
    const first = prepareOpenInput({ parsed, rawText: '', fileId: 'a', fileName: 'x.csv', wizardConfig: config });
    if (!first.ok) throw Error(first.reason);
    const renamed = { ...first.file, traces: first.file.traces.map(t => ({ ...t, dn: 'same name' })) };
    const next = prepareOpenInput({ parsed, rawText: '', fileId: 'b', fileName: 'x.csv', prior: renamed, wizardConfig: config });
    if (!next.ok) throw Error(next.reason);
    expect(next.file.traces.map(t => t.id)).toEqual(renamed.traces.map(t => t.id));
    expect(prepareOpenInput({ parsed, rawText: '', fileId: 'b', fileName: 'x.csv', prior: { ...renamed, columnIdentities: undefined } }).ok).toBe(false);
    expect(prepareOpenInput({ parsed: { ...parsed, columnIdentities: [{ index: 1 }, { index: 1 }] }, rawText: '', fileId: 'b', fileName: 'x.csv' }).ok).toBe(false);
  });
  it('matches unique real headers through reorder and removes a changed header', () => {
    const firstParsed = csv('time,a,b\n0,1,2\n1,3,4\n');
    const first = prepareOpenInput({ parsed: firstParsed, rawText: '', fileId: 'a', fileName: 'x.csv', wizardConfig: config });
    if (!first.ok) throw Error(first.reason);
    const reorderedConfig = { ...config, headers: ['time', 'b', 'a'] };
    const reordered = parseTabularFile('time,b,a\n0,2,1\n1,4,3\n', 'x.csv', reorderedConfig);
    const next = prepareOpenInput({ parsed: reordered, rawText: '', fileId: 'b', fileName: 'x.csv', prior: first.file, wizardConfig: reorderedConfig });
    if (!next.ok) throw Error(next.reason);
    expect(next.file.traces.map(t => t.id)).toEqual([...first.file.traces].reverse().map(t => t.id));
    expect(next.file.displayTraces?.map((_, i) => getOpenProjectionKey(next.file, i))).toEqual(next.selection.kind === 'columns' ? next.selection.selected.map(t => t.key) : []);
    const changedConfig = { ...config, headers: ['time', 'other', 'b'] };
    const changed = prepareOpenInput({ parsed: parseTabularFile('time,other,b\n0,1,2\n1,3,4\n', 'x.csv', changedConfig), rawText: '', fileId: 'c', fileName: 'x.csv', prior: first.file, wizardConfig: changedConfig });
    if (!changed.ok) throw Error(changed.reason);
    expect(changed.removedKeys).toHaveLength(1);
    expect(changed.file.traces[0]?.id).not.toBe(first.file.traces[0]?.id);
    expect(changed.file.traces[1]?.id).toBe(first.file.traces[1]?.id);
    const duplicate = { ...config, headers: ['time', 'a', 'a'] };
    expect(prepareOpenInput({ parsed: parseTabularFile('time,a,a\n0,1,2\n1,3,4\n', 'x.csv', duplicate), rawText: '', fileId: 'd', fileName: 'x.csv', prior: first.file }).ok).toBe(false);
  });
  it('replaces genuine legacy CSV records without discarding their trace identities', () => {
    const originalParsed = csv('time,a,b\n0,1,2\n1,3,4\n');
    const original = prepareOpenInput({ parsed: originalParsed, rawText: '', fileId: 'legacy', fileName: 'x.csv', wizardConfig: config });
    if (!original.ok) throw Error(original.reason);
    const legacy = {...original.file, datasets:undefined, displayTraces:undefined, columnIdentities:undefined};
    const changed = csv('time,b,a\n0,20,10\n1,40,30\n');
    const replaced = prepareOpenInput({ parsed:changed, rawText:'new', fileId:'replacement', fileName:'x.csv', prior:legacy, priorRawText:'time,a,b\n0,1,2\n1,3,4\n', wizardConfig:config });
    if (!replaced.ok) throw Error(replaced.reason);
    expect(replaced.file.traces.map(trace=>trace.id)).toEqual([...legacy.traces].reverse().map(trace=>trace.id));
    expect(new Set(replaced.replacementMatches.map(trace=>trace.id))).toEqual(new Set(legacy.traces.map(trace=>trace.id)));
  });
  it('opens every new multi-trace DAT series and refuses ambiguous replacement', () => {
    const parsed = parseRSDat('Trace;1\nValues\n1;2\n2;3\n\nTrace;2\nValues\n1;4\n2;5\n', 'x.dat');
    expect(parsed.traces).toHaveLength(2);
    const result = prepareOpenInput({ parsed, rawText: '', fileId: 'd', fileName: 'x.dat' });
    if (!result.ok) throw Error(result.reason);
    expect(result.selection.kind).toBe('columns');
    if (result.selection.kind === 'columns') expect(result.selection.selected).toHaveLength(2);
    expect(new Set(result.file.traces.map(t => t.id)).size).toBe(2);
    expect(prepareOpenInput({ parsed, rawText: '', fileId: 'e', fileName: 'x.dat', prior: result.file }).ok).toBe(false);
  });
  it('rejects contradictory trace/display IDs and returns canonically adapted IDs', () => {
    const first = prepare(1); if (!first.ok) throw Error(first.reason);
    const inconsistent = { ...first.file, traces: first.file.traces.map(t => ({ ...t, id: 'different' })) };
    expect(prepare(1, inconsistent).ok).toBe(false);
    const next = prepare(1, first.file); if (!next.ok) throw Error(next.reason);
    for (const display of next.file.displayTraces ?? []) {
      expect(adaptDisplayTraceToLegacyTrace(next.file.datasets ?? [], display, next.file)?.id).toBe(next.file.traces.find(t => t.id === display.id)?.id);
    }
  });

});
