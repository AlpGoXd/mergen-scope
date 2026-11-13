import { expect, it } from 'vitest';
import { dropHint, refusalGuidance, traceAlreadyInPane } from '../../src/domain/pane-drop-hints';
import { buildPanes } from '../../src/domain/pane-math';
import { makeTestTrace } from './helpers';

it('describes trace, file and pane drops using placement rules', () => {
  const panes = buildPanes(3); const first = panes[0]; const second = panes[1]; const third = panes[2];
  if (!first || !second || !third) throw new Error('missing panes');
  const time = { ...makeTestTrace(), id: 'time', name: 'time', domain: 'time' as const, units: { x: 's', y: 'V' } };
  const frequency = { ...makeTestTrace(), id: 'freq', name: 'freq', domain: 'frequency' as const, units: { x: 'Hz', y: 'V' } };
  const input = { panes, traces: [time, frequency], memberships: { time: [first.id], freq: [second.id] }, displays: [] };
  expect(dropHint({ ...input, pane: first, drag: { kind: 'trace', traceName: 'time' } }).kind).toBe('already');
  expect(dropHint({ ...input, pane: second, drag: { kind: 'trace', traceName: 'time' } }).reason).toBe("It's a time capture and Pane 2 shows frequency. Drop it on a time pane, an empty pane or + New pane.");
  expect(refusalGuidance('Smith shows reflections.', time, 'Pane 2', [])).toBe('Smith shows reflections. Drop it on a compatible pane, an empty pane or + New pane.');
  expect(dropHint({ ...input, pane: third, drag: { kind: 'trace', traceName: 'time' } }).text).toContain('Chart');
  expect(dropHint({ ...input, pane: second, drag: { kind: 'trace', traceName: 'freq' }, memberships: { time: [first.id], freq: [third.id] } }).text).toBe('Drop to show it here as a Chart');
  expect(dropHint({ ...input, pane: first, drag: { kind: 'trace', traceName: 'freq' }, traces: [frequency, { ...frequency, name: 'other' }], memberships: { other: [first.id], freq: [second.id] } }).text).toBe('Move to Pane 1');
  expect(dropHint({ ...input, pane: second, drag: { kind: 'file' } }).text).toBe('Open in Pane 2');
  expect(dropHint({ ...input, pane: third, drag: { kind: 'pane', paneId: first.id } }).text).toBe('⇄ Swap with Pane 3');
  expect(dropHint({ ...input, pane: first, drag: { kind: 'pane', paneId: first.id } }).kind).toBe('none');
});

it('recognizes an existing copy even when the trace belongs to multiple panes', () => {
  const panes = buildPanes(2); const target = panes[1]; if (!target || !panes[0]) throw Error('panes');
  const trace = makeTestTrace({ id: 'shared', name: 'shared' });
  const memberships = { shared: [panes[0].id, target.id] };
  expect(traceAlreadyInPane(memberships, trace.name, target.id)).toBe(true);
  expect(dropHint({ drag: { kind: 'trace', traceName: trace.name }, pane: target, panes, traces: [trace], memberships, displays: [] }).kind).toBe('already');
});

it('includes hidden incompatible members in the refusal hint', () => {
  const panes = buildPanes(2); const target = panes[1]; if (!target || !panes[0]) throw Error('panes');
  const time = makeTestTrace({ id: 'time', name: 'time', domain: 'time', family: 'waveform', units: { x: 's', y: 'V' } });
  const hidden = makeTestTrace({ id: 'hidden', name: 'hidden', domain: 'frequency', units: { x: 'Hz', y: 'V' } });
  const hint = dropHint({ drag: { kind: 'trace', traceName: time.name }, pane: target, panes, traces: [time, hidden], memberships: { time: [panes[0].id], hidden: [target.id] }, displays: [] });
  expect(hint.kind).toBe('refused'); expect(hint.text).toContain('Pane 2 shows frequency');
});
