import type { PaneTypeChangePlan } from './pane-placement';

export function paneTypeCompatibilityNote(pane: string, type: string, total: number, accepted: readonly string[]): string | undefined {
  if (accepted.length >= total) return undefined;
  if (type === 'Smith') return 'Smith shows reflections (S11, S22 …)';
  const prefix = `${pane} shows ${total} ${total === 1 ? 'trace' : 'traces'}. ${type}`;
  if (accepted.length === 0) return `${prefix} cannot show any of them.`;
  const names = accepted.length <= 2 ? accepted.join(' and ') : String(accepted.length);
  return `${prefix} can only show ${names} of them.`;
}

/** Describe all traces leaving the source, including traces already assigned elsewhere. */
export function summarizePaneTypeChange(
  plan: PaneTypeChangePlan,
  leaving: readonly { readonly name: string; readonly displayName: string }[],
  paneName: (id: string) => string,
): { leaving: string[]; destination: string | null } {
  const destinations = [...new Set(leaving.flatMap(trace => plan.memberships[trace.name] ?? []))];
  const unplaced = leaving.some(trace => (plan.memberships[trace.name]?.length ?? 0) === 0);
  const labels = destinations.map(id => `${paneName(id)}, which has the same X unit`);
  if (unplaced && labels.length) labels.push('Not in a pane');
  return { leaving: leaving.map(trace => trace.displayName), destination: labels.length ? labels.join(' and ') : null };
}
