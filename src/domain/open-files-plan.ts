import type { OpenData, OpenMember, OpenPane, OpenPlanContext, OpenPlanResult, OpenStep, OpenTrace } from '../types/open-files-plan';

function selectTraces(selection: Extract<OpenData['result'], { ok: true }>['selection']): { traces: readonly OpenTrace[]; matrixOpen: boolean } | null {
  if (selection.kind === 'single') return { traces: [selection.trace], matrixOpen: false };
  if (selection.kind === 'columns') return selection.selected.length ? { traces: selection.recognized ? selection.selected.slice(0, 8) : selection.selected, matrixOpen: false } : null;
  if (!Number.isInteger(selection.ports) || selection.ports < 1) return null;
  if (selection.ports >= 3) return { traces: [], matrixOpen: true };
  if (!selection.s11 || (selection.ports === 2 && !selection.s21)) return null;
  return { traces: selection.ports === 1 ? [selection.s11] : [selection.s21 as OpenTrace, selection.s11], matrixOpen: true };
}

function copyName(name: string, used: ReadonlySet<string>): string {
  let n = 2;
  while (used.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

/** Plan from parsed descriptors only; the caller revalidates revision before atomic application. */
export function planOpenFiles(inputs: readonly import('../types/open-files-plan').OpenInput[], context: OpenPlanContext): OpenPlanResult {
  const refused = (reason: string, inputId?: string): OpenPlanResult => ({ ok: false, kind: 'refused', reason, inputId });
  if (inputs.some(input => !input.inputId.trim()) || new Set(inputs.map(input => input.inputId)).size !== inputs.length) return refused('Input identifiers must be nonempty and unique.');
  const workspaces = inputs.filter(input => input.kind === 'workspace');
  if (workspaces.length > 1) return refused('Only one workspace can be opened at a time.');
  const workspace = workspaces[0];
  // A drop target belongs to the old workspace; after replacement it is never reused,
  // even if the new workspace happens to contain the same opaque pane ID.
  const explicitPaneId = workspace ? undefined : context.explicitPaneId;
  let state = context.state;
  const steps: OpenStep[] = [];
  if (workspace && workspace.kind === 'workspace') {
    if (!workspace.result.ok) return refused(workspace.result.reason, workspace.inputId);
    if (state.hasWork && !context.workspaceChoice) return { ok: false, kind: 'decision', inputId: workspace.inputId, reason: 'Opening this workspace replaces the current workspace.' };
    if (context.workspaceChoice === 'cancel') return { ok: false, kind: 'cancelled', inputId: workspace.inputId, reason: 'Workspace opening cancelled.' };
    state = workspace.result.state;
    steps.push({ kind: 'workspace', inputId: workspace.inputId });
  }
  let files = [...state.files];
  const names = new Set(files.map(file => file.name));
  const panes: OpenPane[] = [...state.panes];
  const issued = new Set([...context.issuedPaneIds, ...panes.map(pane => pane.id)]);
  let members: OpenMember[] = state.members.map(member => ({ trace: member.trace, paneIds: [...member.paneIds] }));
  for (const input of inputs) {
    if (input.kind !== 'data') continue;
    const existing = files.find(file => file.name === input.name);
    const choice = existing ? context.duplicateChoices[input.inputId] : undefined;
    if (existing && !choice) return { ok: false, kind: 'decision', inputId: input.inputId, reason: 'A file with this name is already open.' };
    if (choice === 'cancel') return { ok: false, kind: 'cancelled', inputId: input.inputId, reason: 'File opening cancelled.' };
    if (!input.result.ok) {
      // A failed replacement is reported without removing the previous file.
      const name = existing && choice === 'copy' ? copyName(input.name, names) : input.name;
      if (!(existing && choice === 'replace') && (!input.result.fileId.trim() || files.some(file => file.id === input.result.fileId))) return refused('The new file identifier is empty or already in use.', input.inputId);
      steps.push({ kind: 'error', inputId: input.inputId, fileId: input.result.fileId, name, reason: input.result.reason, ...(existing && choice === 'replace' ? { replaceFileId: existing.id } : {}) });
      if (!(existing && choice === 'replace')) { names.add(name); files.push({ id: input.result.fileId, name, members: [] }); }
      continue;
    }
    const selection = selectTraces(input.result.selection);
    if (!selection) return refused('The file has invalid default trace selections.', input.inputId);
    if (selection.traces.some(trace => !trace.id.trim() || !trace.key.trim()) || new Set(selection.traces.map(trace => trace.key)).size !== selection.traces.length) return refused('The file has empty or duplicate trace identities.', input.inputId);
    const fileId = input.result.fileId;
    if (!fileId.trim() || files.some(file => file.id === fileId)) return refused('The new file identifier is empty or already in use.', input.inputId);
    const replacing = existing && choice === 'replace' ? existing : undefined;
    const name = existing && choice === 'copy' ? copyName(input.name, names) : input.name;
    let selectedTraces = [...selection.traces];
    if (replacing) {
      const matches = input.result.replacementMatches;
      if (!matches) return refused('Complete replacement trace matches are required.', input.inputId);
      const oldKeys = new Set(replacing.members.map(member => member.trace.key));
      if (oldKeys.size !== replacing.members.length || new Set(matches.map(trace => trace.key)).size !== matches.length || matches.some(trace => !oldKeys.has(trace.key) || !trace.key.trim() || !trace.id.trim())) return refused('Replacement trace matches are invalid.', input.inputId);
      const byKey = new Map(selectedTraces.map(trace => [trace.key, trace]));
      for (const match of matches) {
        const selected = byKey.get(match.key);
        if (selected && selected.id !== match.id) return refused('Replacement trace identities conflict.', input.inputId);
        if (!selected) { selectedTraces.push(match); byKey.set(match.key, match); }
      }
      const oldIds = new Set(replacing.members.map(member => member.trace.id));
      members = members.filter(member => !oldIds.has(member.trace.id));
      files = files.filter(file => file.id !== replacing.id);
    }
    const fileMembers: OpenMember[] = [];
    const planned: Extract<OpenStep, { kind: 'file' }>['traces'][number][] = [];
    for (const trace of selectedTraces) {
      if (members.some(member => member.trace.id === trace.id) || fileMembers.some(member => member.trace.id === trace.id)) return refused('The new trace identifier is already in use.', input.inputId);
      const previous = replacing?.members.find(member => member.trace.key === trace.key);
      let paneIds: string[] = previous ? [...previous.paneIds] : [];
      let unplacedReason: string | undefined;
      if (previous) {
        for (const paneId of paneIds) {
          const pane = panes.find(item => item.id === paneId);
          if (!pane) return refused('A preserved destination pane no longer exists.', input.inputId);
          const check = context.canPlace(trace, pane, members);
          if (!check.allowed) return refused(check.reason, input.inputId);
        }
      }
      if (!previous) {
        if (explicitPaneId !== undefined) {
          const pane = panes.find(item => item.id === explicitPaneId);
          if (!pane) return refused('The destination pane no longer exists.', input.inputId);
          const check = context.canPlace(trace, pane, members);
          if (!check.allowed) return refused(check.reason, input.inputId);
          paneIds = [pane.id];
        } else {
          const target = panes.find(pane => pane.id === state.targetPaneId);
          const destination = (target && context.canPlace(trace, target, members).allowed ? target : undefined)
            ?? panes.find(pane => context.canPlace(trace, pane, members).allowed);
          if (destination) paneIds = [destination.id];
          else if (panes.length < context.paneLimit) {
            const created = context.newPane(trace, panes, [...issued]);
            if (created && (!created.id.trim() || issued.has(created.id))) return refused('The planned pane identifier is empty or was already issued.', input.inputId);
            if (created && context.canPlace(trace, created, members).allowed) {
              issued.add(created.id); panes.push(created); steps.push({ kind: 'new-pane', pane: created }); paneIds = [created.id];
            } else unplacedReason = 'No compatible pane could be created.';
          } else unplacedReason = 'No compatible pane is available within the pane limit.';
        }
      }
      const member = { trace, paneIds }; members.push(member); fileMembers.push(member);
      planned.push({ trace, paneIds, ...(previous ? { preserveFrom: previous.trace } : {}), ...(unplacedReason ? { unplacedReason } : {}) });
    }
    files.push({ id: fileId, name, members: fileMembers });
    names.add(name);
    steps.push({ kind: 'file', inputId: input.inputId, fileId, name, ...(replacing ? { replaceFileId: replacing.id } : {}), matrixOpen: selection.matrixOpen, traces: planned });
  }
  return { ok: true, revision: context.revision, steps };
}
