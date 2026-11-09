import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';

const legacyFixture = (): Record<string, unknown> => JSON.parse(
  readFileSync('tests/fixtures/phase3-preservation/workspace-v4-legacy-golden.json', 'utf8'),
) as Record<string, unknown>;

const oldLine = (id: number, paneId: string | null, groupId: string | null = null) => ({
  id, type: 'v', value: 42, paneId, groupId, label: 'V1',
});

describe('reference line membership migration', () => {
  it('merges the linked lines in the real v4 golden fixture', () => {
    const result = migrateWorkspaceV5(legacyFixture());
    expect(result?.refLines).toHaveLength(1);
    expect(result?.refLines[0]).toMatchObject({ paneIds: ['pane-a', 'pane-k'] });
    expect(result?.refLines[0]).not.toHaveProperty('groupId');
    expect(result?.refLines[0]).not.toHaveProperty('paneId');
  });

  it('merges groups in pane order, retaining the lowest id and first value', () => {
    const source = legacyFixture();
    const lines = [
      { ...oldLine(9, 'pane-k', 'two'), value: 11 },
      { ...oldLine(2, 'pane-a', 'two'), value: 99 },
      oldLine(8, 'pane-k', 'three'), oldLine(6, 'pane-z', 'three'), oldLine(4, 'pane-a', 'three'),
      { ...oldLine(12, 'pane-z'), label: 'V3' },
    ];
    const result = migrateWorkspaceV5({ ...source, refLines: lines });
    expect(result?.refLines).toHaveLength(3);
    expect(result?.refLines.find(line => line.id === 2)).toMatchObject({ value: 11, paneIds: ['pane-a', 'pane-k'] });
    expect(result?.refLines.find(line => line.id === 4)).toMatchObject({ paneIds: ['pane-a', 'pane-k', 'pane-z'] });
    expect(result?.refLines.find(line => line.id === 12)).toMatchObject({ paneIds: ['pane-z'] });
  });

  it('never leaves a delta partner pointing at its own merged line', () => {
    const source = legacyFixture();
    const result = migrateWorkspaceV5({ ...source, refLines: [
      { ...oldLine(3, 'pane-a', 'g'), deltaPartnerId: 7 },
      oldLine(7, 'pane-k', 'g'),
      { ...oldLine(11, 'pane-z'), label: 'V2', deltaPartnerId: 7 },
    ] });
    const merged = result?.refLines.find(line => line.id === 3);
    expect(merged?.paneIds).toEqual(['pane-a', 'pane-k']);
    expect(merged).not.toHaveProperty('deltaPartnerId');
    expect(result?.refLines.find(line => line.id === 11)).toMatchObject({ deltaPartnerId: 3 });
  });

  it('preserves paneless units, global lines and a horizontal line', () => {
    const source = legacyFixture();
    const result = migrateWorkspaceV5({ ...source, refLines: [
      { ...oldLine(1, null), paneless: true, axisUnit: 'Hz' },
      { ...oldLine(2, null), label: 'V2' },
      { ...oldLine(3, 'pane-a'), type: 'h', label: 'H1' },
    ] });
    expect(result?.refLines.find(line => line.id === 1)).toMatchObject({ paneIds: [], axisUnit: 'Hz' });
    expect(result?.refLines.find(line => line.id === 2)).toMatchObject({ paneIds: ['pane-a', 'pane-k', 'pane-z'] });
    expect(result?.refLines.find(line => line.id === 3)).toMatchObject({ paneIds: ['pane-a'] });
  });

  it('remaps a delta partner pointing at a merged group member', () => {
    const source = legacyFixture();
    const ui = source.ui as Record<string, unknown>;
    const result = migrateWorkspaceV5({ ...source, ui: { ...ui, selectedRefLineId: 7 }, refLines: [
      oldLine(3, 'pane-a', 'g'), oldLine(7, 'pane-k', 'g'),
      { ...oldLine(10, 'pane-a'), label: 'V2', deltaPartnerId: 7 },
    ] });
    expect(result?.refLines.find(line => line.id === 10)?.deltaPartnerId).toBe(3);
    expect(result?.ui).toMatchObject({ selectedRefLineId: 3 });
  });

  it('round trips the new shape and rejects malformed v5 memberships', () => {
    const base = migrateWorkspaceV5({ ...legacyFixture(), refLines: [] });
    if (!base) throw new Error('fixture migration failed');
    const line = { id: 1, type: 'v', value: 42, label: 'V1', paneIds: ['pane-a', 'pane-k'] };
    const snapshot = { ...base, refLines: [line] };
    expect(migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)))?.refLines).toEqual([line]);
    for (const paneIds of ['pane-a', ['pane-a', 1], ['pane-a', 'pane-a'], ['missing']]) {
      expect(migrateWorkspaceV5({ ...base, refLines: [{ ...line, paneIds }] })).toBeNull();
    }
    expect(migrateWorkspaceV5({ ...base, refLines: [{ ...line, type: 'h' }] })).toBeNull();
  });
});
