/**
 * Pure bounded history for immutable before/after mementos.
 *
 * The byte figure is a conservative retained-history estimate, not a heap
 * measurement. It accounts only for retained entry graphs (never a separate
 * current-state root), and counts shared object identities once.
 */

export interface TransactionHistoryLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export const DEFAULT_TRANSACTION_HISTORY_LIMITS: Readonly<TransactionHistoryLimits> = {
  maxEntries: 50,
  maxBytes: 128 * 1024 * 1024,
};

export interface TransactionHistoryEntry<T> {
  readonly before: T;
  readonly after: T;
}

interface LiveGraphSummary {
  readonly objects: ReadonlySet<object>;
  readonly strings: ReadonlySet<string>;
}

export interface TransactionHistory<T> {
  /** Oldest to newest; undo consumes from the end. */
  readonly past: readonly TransactionHistoryEntry<T>[];
  /** Nearest redo first; pruning removes farthest redo actions from the end. */
  readonly future: readonly TransactionHistoryEntry<T>[];
  readonly limits: Readonly<TransactionHistoryLimits>;
  /** Weak, history-owned summaries for large immutable arrays in live mementos. */
  readonly liveGraphCache: WeakMap<object, LiveGraphSummary>;
}

export interface RecordTransactionResult<T> {
  readonly history: TransactionHistory<T>;
  readonly outcome: 'recorded' | 'noop' | 'oversized';
  readonly prunedPast: number;
  readonly prunedFuture: number;
  readonly retainedBytes: number;
}

export interface HistoryMoveResult<T> {
  readonly history: TransactionHistory<T>;
  /** Restored memento, undefined when there was no action to move. */
  readonly state: T | undefined;
  readonly changed: boolean;
  readonly prunedPast: number;
  readonly prunedFuture: number;
  readonly retainedBytes: number;
  readonly outcome: 'unchanged' | 'moved' | 'moved-pruned';
}

const ENTRY_OVERHEAD_BYTES = 64;
const PROPERTY_OR_SLOT_BYTES = 16;
const NUMBER_BYTES = 8;
const STRING_CODE_UNIT_BYTES = 2;

function checkedLimits(limits: Partial<TransactionHistoryLimits> = {}): Readonly<TransactionHistoryLimits> {
  const result = { ...DEFAULT_TRANSACTION_HISTORY_LIMITS, ...limits };
  if (!Number.isSafeInteger(result.maxEntries) || result.maxEntries < 1) {
    throw new RangeError('maxEntries must be a positive safe integer');
  }
  if (!Number.isSafeInteger(result.maxBytes) || result.maxBytes < 1) {
    throw new RangeError('maxBytes must be a positive safe integer');
  }
  return Object.freeze(result);
}

export function createTransactionHistory<T>(
  limits: Partial<TransactionHistoryLimits> = {},
): TransactionHistory<T> {
  return { past: [], future: [], limits: checkedLimits(limits), liveGraphCache: new WeakMap() };
}

type WorkItem = { readonly kind: 'value'; readonly value: unknown };
interface LiveGraph {
  readonly objects: ReadonlySet<object>;
  readonly strings: ReadonlySet<string>;
  readonly buckets: readonly LiveGraphSummary[];
}

const CACHED_ARRAY_MIN_LENGTH = 1_024;

/**
 * Estimate bytes retained by entry records and their reachable object graphs,
 * excluding every object reachable from `liveState`. This is an estimate of
 * history-only retention, not real heap use: values reachable from live state
 * remain available to the application and are not charged to history.
 * Each entry has 64 bytes of overhead plus two 16-byte reference slots. Each
 * object/array adds 64 bytes and 16 bytes per own property/slot. Primitive
 * numeric values add 8 bytes, and string values add 2 bytes per UTF-16 code
 * unit. Object identities, including cycles and shared subgraphs, count once.
 */
export function estimateRetainedHistoryBytes<T>(
  past: readonly TransactionHistoryEntry<T>[],
  future: readonly TransactionHistoryEntry<T>[] = [],
  liveState?: unknown,
): number {
  return estimateWithExcluded(past, future, collectLiveGraph(liveState, new WeakMap()));
}

function estimateWithExcluded<T>(
  past: readonly TransactionHistoryEntry<T>[],
  future: readonly TransactionHistoryEntry<T>[],
  excluded: LiveGraph,
): number {
  const seen = new Set<object>();
  const seenEntries = new Set<TransactionHistoryEntry<T>>();
  const stack: WorkItem[] = [];
  let bytes = 0;

  // Entry objects are internal retained records and are counted explicitly.
  for (const entry of [...past, ...future]) {
    if (seenEntries.has(entry)) continue;
    seenEntries.add(entry);
    bytes += ENTRY_OVERHEAD_BYTES + 2 * PROPERTY_OR_SLOT_BYTES;
    stack.push({ kind: 'value', value: entry.before }, { kind: 'value', value: entry.after });
  }

  while (stack.length) {
    const item = stack.pop()!;
    const value = item.value;
    if (typeof value === 'string') {
      if (!containsString(excluded, value)) bytes += value.length * STRING_CODE_UNIT_BYTES;
    } else if (typeof value === 'number') {
      bytes += NUMBER_BYTES;
    } else if (typeof value === 'bigint') {
      // BigInts have no fixed width; this digit-based estimate is deliberately
      // conservative for their printable magnitude.
      bytes += value.toString().length * STRING_CODE_UNIT_BYTES;
    } else if (value !== null && typeof value === 'object') {
      if (containsObject(excluded, value)) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      bytes += ENTRY_OVERHEAD_BYTES;

      if (Array.isArray(value)) {
        bytes += value.length * PROPERTY_OR_SLOT_BYTES;
        for (let i = 0; i < value.length; i++) {
          stack.push({ kind: 'value', value: value[i] });
        }
      } else {
        for (const key of Reflect.ownKeys(value)) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor) continue;
          bytes += PROPERTY_OR_SLOT_BYTES;
          if ('value' in descriptor) stack.push({ kind: 'value', value: descriptor.value });
        }
      }
    }
  }

  return bytes;
}

function containsObject(graph: LiveGraph, value: object): boolean {
  return graph.objects.has(value) || graph.buckets.some(bucket => bucket.objects.has(value));
}

function containsString(graph: LiveGraph, value: string): boolean {
  return graph.strings.has(value) || graph.buckets.some(bucket => bucket.strings.has(value));
}

/** Mark live identities and reuse separate cached buckets for large arrays. */
function collectLiveGraph(root: unknown, cache: WeakMap<object, LiveGraphSummary>): LiveGraph {
  const reachable = new Set<object>();
  const strings = new Set<string>();
  const buckets: LiveGraphSummary[] = [];
  const stack: unknown[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (typeof value === 'string') {
      strings.add(value);
      continue;
    }
    if (value === null || typeof value !== 'object' || containsObject({ objects: reachable, strings, buckets }, value)) continue;
    if (Array.isArray(value) && value.length >= CACHED_ARRAY_MIN_LENGTH) {
      let summary = cache.get(value);
      if (!summary) {
        summary = summarizeGraph(value);
        cache.set(value, summary);
      }
      buckets.push(summary);
      continue;
    }
    reachable.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const child = value[i];
        if ((child !== null && typeof child === 'object' && !reachable.has(child)) || typeof child === 'string') stack.push(child);
      }
      continue;
    }
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) continue;
      const child = descriptor.value;
      if ((child !== null && typeof child === 'object' && !reachable.has(child)) || typeof child === 'string') stack.push(child);
    }
  }
  return { objects: reachable, strings, buckets };
}

/**
 * Traverse a cold large array once. The summary can reference its key (and
 * descendants); WeakMap ephemeron semantics still allow the entire graph to
 * be collected once no other reachable root holds the array.
 */
function summarizeGraph(root: object): LiveGraphSummary {
  const objects = new Set<object>();
  const strings = new Set<string>();
  const stack: unknown[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (typeof value === 'string') {
      strings.add(value);
      continue;
    }
    if (value === null || typeof value !== 'object' || objects.has(value)) continue;
    objects.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) stack.push(value[i]);
    } else {
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor && 'value' in descriptor) stack.push(descriptor.value);
      }
    }
  }
  return { objects, strings };
}

function withinLimits<T>(
  past: readonly TransactionHistoryEntry<T>[],
  future: readonly TransactionHistoryEntry<T>[],
  excluded: LiveGraph,
  limits: Readonly<TransactionHistoryLimits>,
): { readonly ok: boolean; readonly bytes: number } {
  const bytes = estimateWithExcluded(past, future, excluded);
  return { ok: past.length + future.length <= limits.maxEntries && bytes <= limits.maxBytes, bytes };
}

/** Find the smallest number of oldest past entries to remove that fits. */
function fewestPastDrops<T>(
  past: readonly TransactionHistoryEntry<T>[],
  future: readonly TransactionHistoryEntry<T>[],
  excluded: LiveGraph,
  limits: Readonly<TransactionHistoryLimits>,
): number | null {
  let low = 0;
  let high = past.length;
  if (!withinLimits(past.slice(high), future, excluded, limits).ok) return null;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (withinLimits(past.slice(middle), future, excluded, limits).ok) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Remove the farthest redo entries (the tail) while preserving nearest redo. */
function fewestFutureTailDrops<T>(
  past: readonly TransactionHistoryEntry<T>[],
  future: readonly TransactionHistoryEntry<T>[],
  excluded: LiveGraph,
  limits: Readonly<TransactionHistoryLimits>,
): number | null {
  let low = 0;
  let high = future.length;
  if (!withinLimits(past, future.slice(0, 0), excluded, limits).ok) return null;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (withinLimits(past, future.slice(0, future.length - middle), excluded, limits).ok) high = middle;
    else low = middle + 1;
  }
  return low;
}

export function recordTransaction<T>(
  history: TransactionHistory<T>,
  before: T,
  after: T,
  semanticallyEqual: (before: T, after: T) => boolean,
): RecordTransactionResult<T> {
  if (semanticallyEqual(before, after)) {
    return {
      history,
      outcome: 'noop',
      prunedPast: 0,
      prunedFuture: 0,
      retainedBytes: estimateWithExcluded(history.past, history.future, collectLiveGraph(after, history.liveGraphCache)),
    };
  }

  const newEntry: TransactionHistoryEntry<T> = { before, after };
  const excluded = collectLiveGraph(after, history.liveGraphCache);
  const entryBytes = estimateWithExcluded([newEntry], [], excluded);
  if (entryBytes > history.limits.maxBytes) {
    const cleared = { ...history, past: [], future: [] };
    return { history: cleared, outcome: 'oversized', prunedPast: history.past.length, prunedFuture: history.future.length, retainedBytes: 0 };
  }

  let past = [...history.past, newEntry];
  const future: TransactionHistoryEntry<T>[] = [];
  let prunedPast = 0;
  const prunedFuture = history.future.length;
  let drops = fewestPastDrops(past, future, excluded, history.limits);
  if (drops === null) {
    // The single new entry fit above, so clearing expired history leaves a
    // usable undo entry and guarantees the bound.
    past = [newEntry];
    drops = 0;
  } else {
    prunedPast = drops;
    past = past.slice(drops);
  }
  const bytes = estimateWithExcluded(past, future, excluded);

  return {
    history: { ...history, past, future },
    outcome: 'recorded',
    prunedPast,
    prunedFuture,
    retainedBytes: bytes,
  };
}

export function undoTransaction<T>(history: TransactionHistory<T>, currentState: T): HistoryMoveResult<T> {
  const entry = history.past[history.past.length - 1];
  if (!entry) return { history, state: undefined, changed: false, prunedPast: 0, prunedFuture: 0, retainedBytes: estimateWithExcluded(history.past, history.future, collectLiveGraph(currentState, history.liveGraphCache)), outcome: 'unchanged' };
  const state = entry.before;
  const excluded = collectLiveGraph(state, history.liveGraphCache);
  let past = history.past.slice(0, -1);
  let future = [entry, ...history.future];
  let prunedPast = 0;
  let prunedFuture = 0;
  let drops = fewestPastDrops(past, future, excluded, history.limits);
  if (drops !== null) {
    prunedPast = drops;
    past = past.slice(drops);
  } else {
    past = [];
    drops = fewestFutureTailDrops(past, future, excluded, history.limits);
    if (drops !== null) {
      prunedPast = history.past.length - 1;
      prunedFuture = drops;
      future = future.slice(0, future.length - drops);
    } else {
      prunedPast = history.past.length - 1;
      prunedFuture = future.length;
      past = [];
      future = [];
    }
  }
  const retainedBytes = estimateWithExcluded(past, future, excluded);
  return {
    history: { ...history, past, future },
    state,
    changed: true,
    prunedPast,
    prunedFuture,
    retainedBytes,
    outcome: prunedPast || prunedFuture ? 'moved-pruned' : 'moved',
  };
}

export function redoTransaction<T>(history: TransactionHistory<T>, currentState: T): HistoryMoveResult<T> {
  const entry = history.future[0];
  if (!entry) return { history, state: undefined, changed: false, prunedPast: 0, prunedFuture: 0, retainedBytes: estimateWithExcluded(history.past, history.future, collectLiveGraph(currentState, history.liveGraphCache)), outcome: 'unchanged' };
  const state = entry.after;
  const excluded = collectLiveGraph(state, history.liveGraphCache);
  let past = [...history.past, entry];
  let future = history.future.slice(1);
  let prunedPast = 0;
  let prunedFuture = 0;
  let drops = fewestPastDrops(past, future, excluded, history.limits);
  if (drops !== null) {
    prunedPast = drops;
    past = past.slice(drops);
  } else {
    past = [];
    drops = fewestFutureTailDrops(past, future, excluded, history.limits);
    if (drops !== null) {
      prunedPast = history.past.length + 1;
      prunedFuture = drops;
      future = future.slice(0, future.length - drops);
    } else {
      prunedPast = history.past.length + 1;
      prunedFuture = future.length;
      past = [];
      future = [];
    }
  }
  const retainedBytes = estimateWithExcluded(past, future, excluded);
  return {
    history: { ...history, past, future },
    state,
    changed: true,
    prunedPast,
    prunedFuture,
    retainedBytes,
    outcome: prunedPast || prunedFuture ? 'moved-pruned' : 'moved',
  };
}
