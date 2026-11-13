import { describe, expect, it } from 'vitest';
import {
  createTransactionHistory,
  estimateRetainedHistoryBytes,
  recordTransaction,
  redoTransaction,
  undoTransaction,
} from '../../src/domain/transaction-history';

const strictEqual = <T,>(a: T, b: T) => Object.is(a, b);

describe('bounded transaction history', () => {
  it('keeps immutable memento references through record, undo, and redo', () => {
    const samples = [1, 2, 3];
    const before = { files: [{ rawFileData: samples }] };
    const after = { files: [{ rawFileData: samples }], selected: 'trace-a' };
    const recorded = recordTransaction(createTransactionHistory(), before, after, strictEqual);

    expect(recorded.history.past[0]).toEqual({ before, after });
    expect(recorded.history.past[0]?.before).toBe(before);
    expect(recorded.history.past[0]?.after.files[0]?.rawFileData).toBe(samples);
    const undone = undoTransaction(recorded.history, after);
    expect(undone.state).toBe(before);
    expect(undone.history.future[0]?.after).toBe(after);
    const redone = redoTransaction(undone.history, before);
    expect(redone.state).toBe(after);
    expect(redone.history.past[0]?.before).toBe(before);
  });

  it('counts cycles and shared object identities once', () => {
    const shared = { label: 'ab' }; // 64 + (16 property + 4 string) = 84 bytes
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic; // 64 + 16 = 80 bytes
    const entries = [
      { before: shared, after: shared },
      { before: cyclic, after: cyclic },
    ];
    // Two entry records at 96 bytes each, plus each unique graph once.
    expect(estimateRetainedHistoryBytes(entries)).toBe(2 * 96 + 84 + 80);
  });

  it('excludes a shared large sample graph from a tiny edit history entry', () => {
    const samples = Array.from({ length: 20_000 }, (_, index) => index);
    const before = { label: 'before', samples };
    const after = { label: 'after', samples };
    const history = createTransactionHistory({ maxBytes: 2_000 });
    const result = recordTransaction(history, before, after, () => false);

    expect(result.outcome).toBe('recorded');
    expect(result.history.past).toHaveLength(1);
    expect(result.retainedBytes).toBeLessThan(2_000);
    expect(result.history.liveGraphCache.has(samples)).toBe(true);
  });

  it('reuses a live sample summary and accounts for a replaced sample array', () => {
    const shared = Array.from({ length: 1_500 }, (_, index) => ({ freq: index, amp: index / 3 }));
    const before = { label: 'before', samples: shared };
    const after = { label: 'after', samples: shared };
    const first = recordTransaction(createTransactionHistory(), before, after, () => false);
    const warmHistory = first.history;
    const cache = warmHistory.liveGraphCache;
    const nextState = { label: 'next', samples: shared };
    const second = recordTransaction(warmHistory, after, nextState, () => false);

    expect(second.history.liveGraphCache).toBe(cache);
    expect(cache.has(shared)).toBe(true);

    const replacement = Array.from({ length: 1_500 }, (_, index) => ({ freq: index, amp: index / 5 }));
    const imported = { label: 'imported', samples: replacement };
    const changed = recordTransaction(second.history, nextState, imported, () => false);
    expect(cache.has(replacement)).toBe(true);
    expect(changed.retainedBytes).toBeGreaterThan(second.retainedBytes);
  });

  it('excludes live array descendants and their strings across changed wrappers', () => {
    const sharedChild = { rawText: 'shared-source' };
    const samples = Array.from({ length: 1_024 }, (_, index) =>
      index === 0 ? sharedChild : { rawText: `sample-${index}` },
    );
    const before = { wrapper: { child: sharedChild, rawText: 'sample-1' }, samples };
    const after = { wrapper: { label: 'new' }, samples };
    const result = recordTransaction(createTransactionHistory(), before, after, () => false);
    expect(result.retainedBytes).toBe(96 + 64 + 2 * 16 + 64 + 2 * 16);
    expect(undoTransaction(result.history, after).retainedBytes)
      .toBe(estimateRetainedHistoryBytes([], result.history.past, before));
  });

  it('prunes an undo entry when redo makes its old graph history-only', () => {
    const before = { samples: Array.from({ length: 2_000 }, (_, index) => index) };
    const after = { label: 'small' };
    const initial = createTransactionHistory({ maxBytes: 100_000 });
    const recorded = recordTransaction(initial, before, after, () => false);
    const undone = undoTransaction(recorded.history, after);
    const limited = { ...undone.history, limits: { maxEntries: 50, maxBytes: 1_000 } };
    const redone = redoTransaction(limited, before);
    expect(redone.state).toBe(after);
    expect(redone.outcome).toBe('moved-pruned');
    expect(redone.prunedPast).toBe(1);
    expect(redone.history.past).toHaveLength(0);
    expect(redone.retainedBytes).toBe(0);
  });

  it('excludes identical live raw-source strings across changed wrapper objects', () => {
    const rawText = 'x'.repeat(250_000);
    const before = { file: { rawText, label: 'old' } };
    const after = { file: { rawText, label: 'new' } };
    const result = recordTransaction(createTransactionHistory({ maxBytes: 1_000 }), before, after, () => false);

    expect(result.outcome).toBe('recorded');
    expect(result.history.past).toHaveLength(1);
    expect(result.retainedBytes).toBeLessThan(1_000);
  });

  it('counts an old-only raw-source string when it differs from the live source', () => {
    const before = { file: { rawText: 'old-source-'.repeat(250), label: 'old' } };
    const after = { file: { rawText: 'new-source', label: 'new' } };
    const result = recordTransaction(createTransactionHistory({ maxBytes: 1_000 }), before, after, () => false);

    expect(result.outcome).toBe('oversized');
    expect(result.history.past).toHaveLength(0);
    expect(result.retainedBytes).toBe(0);
  });

  it('reaccounts as undo and redo change which data graph is live', () => {
    const oldSamples = Array.from({ length: 2_000 }, (_, index) => index);
    const newSamples = [7, 8, 9];
    const before = { label: 'old', samples: oldSamples };
    const after = { label: 'new', samples: newSamples };
    const recorded = recordTransaction(createTransactionHistory(), before, after, () => false);
    const bytesWithNewLive = estimateRetainedHistoryBytes(recorded.history.past, recorded.history.future, after);

    const undone = undoTransaction(recorded.history, after);
    expect(undone.state).toBe(before);
    expect(undone.outcome).toBe('moved');
    expect(undone.retainedBytes).toBeLessThan(bytesWithNewLive);

    const redone = redoTransaction(undone.history, before);
    expect(redone.state).toBe(after);
    expect(redone.outcome).toBe('moved');
    expect(redone.retainedBytes).toBe(bytesWithNewLive);
  });

  it('prunes a redo entry if undo makes its formerly live large graph history-only', () => {
    const before = { label: 'small' };
    const after = { samples: Array.from({ length: 2_000 }, (_, index) => index) };
    const recorded = recordTransaction(createTransactionHistory({ maxBytes: 1_000 }), before, after, () => false);
    expect(recorded.outcome).toBe('recorded');

    const undone = undoTransaction(recorded.history, after);
    expect(undone.state).toBe(before);
    expect(undone.outcome).toBe('moved-pruned');
    expect(undone.history.future).toHaveLength(0);
    expect(undone.prunedFuture).toBe(1);
    expect(undone.retainedBytes).toBe(0);
  });

  it('prunes the oldest past entries at the exact entry-count limit', () => {
    let history = createTransactionHistory<string>({ maxEntries: 2, maxBytes: 10_000 });
    let result = recordTransaction(history, 's0', 's1', strictEqual);
    history = result.history;
    result = recordTransaction(history, 's1', 's2', strictEqual);
    history = result.history;
    result = recordTransaction(history, 's2', 's3', strictEqual);

    expect(result.outcome).toBe('recorded');
    expect(result.prunedPast).toBe(1);
    expect(result.history.past.map(entry => [entry.before, entry.after])).toEqual([['s1', 's2'], ['s2', 's3']]);
  });

  it('prunes oldest entries when the retained-byte limit is crossed', () => {
    // When the live root advances, the former live after string becomes retained.
    let history = createTransactionHistory<string>({ maxEntries: 50, maxBytes: 208 });
    history = recordTransaction(history, 'a', 'b', strictEqual).history; // 98 bytes
    history = recordTransaction(history, 'c', 'd', strictEqual).history; // 198 bytes
    const result = recordTransaction(history, 'e', 'f', strictEqual); // would be 298 bytes

    expect(result.outcome).toBe('recorded');
    expect(result.prunedPast).toBe(1);
    expect(result.retainedBytes).toBe(198);
    expect(result.history.past.map(entry => entry.before)).toEqual(['c', 'e']);
  });

  it('clears expired entries and reports an oversized newest action without fake undo', () => {
    const history = recordTransaction(createTransactionHistory<string>(), 'a', 'b', strictEqual).history;
    const limited = { ...history, limits: { maxEntries: 50, maxBytes: 100 } };
    const result = recordTransaction(limited, 'x'.repeat(10), 'y'.repeat(10), strictEqual);

    expect(result.outcome).toBe('oversized');
    expect(result.history.past).toHaveLength(0);
    expect(result.history.future).toHaveLength(0);
    expect(result.prunedPast).toBe(1);
    expect(result.retainedBytes).toBe(0);
    expect(undoTransaction(result.history, 'y'.repeat(10)).changed).toBe(false);
  });

  it('preserves redo on a semantic no-op and clears redo on a new action', () => {
    let history = recordTransaction(createTransactionHistory<number>(), 0, 1, Object.is).history;
    history = undoTransaction(history, 1).history;
    expect(history.future).toHaveLength(1);

    const noop = recordTransaction(history, 0, 0, (a, b) => a === b);
    expect(noop.outcome).toBe('noop');
    expect(noop.history).toBe(history);
    expect(noop.history.future).toHaveLength(1);

    const committed = recordTransaction(history, 0, 2, Object.is);
    expect(committed.outcome).toBe('recorded');
    expect(committed.history.future).toHaveLength(0);
  });
});
