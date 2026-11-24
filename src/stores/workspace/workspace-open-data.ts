import { uiReducer } from '../ui-store';
import { adaptDisplayTracesToLegacyTraces } from '../../domain/display-trace-adapter';
import { canPlaceMembership, canRenderInPane, planEmptyPaneType } from '../../domain/pane-placement';
import { createPaneTypeRegistry, paneTypeOfMode } from '../../domain/pane-type-registry';
import type { PlacementTrace } from '../../domain/pane-placement';
import type { OpenData, OpenMember } from '../../types/open-files-plan';
import { planOpenFiles } from '../../domain/open-files-plan';
import { prepareOpenInput } from '../../domain/prepare-open-input';
import { placeMarker } from '../../domain/markers';
import type { WorkspaceState, WorkspaceAction } from './workspace-state';
import { traceView } from '../../domain/workspace/workspace-trace-view';
import { workspaceFromSnapshot } from './workspace-snapshot';

/** Plan against the reducer's current revision, after all asynchronous reads have finished. */
export function openData(
  state: WorkspaceState,
  command: Extract<WorkspaceAction, { slice: 'open-data' }>,
  workspaceReducer: (state: WorkspaceState, command: WorkspaceAction) => WorkspaceState,
): WorkspaceState {
  const prepared = new Map<string, ReturnType<typeof prepareOpenInput>>();
  const oldView = traceView(state.files, state.traces);
  const oldById = new Map(oldView.allKnownTraces.map(trace => [trace.id, trace]));
  const matchingKeys = new Map<string, string>();
  const isWizardFormat = (format: string | undefined) => format === 'needs-import-wizard' || format === 'needs-binary-wizard';
  const pendingWizards = command.inputs.filter(input => isWizardFormat(input.parsed?.format));
  if (pendingWizards.length && !command.resolveBatchId) {
    const batch = {
      id: command.inputs[0]?.id ?? '',
      inputs: command.inputs,
      targetPaneId: command.targetPaneId,
      workspace: command.workspace,
      ...(command.drop ? { drop: true } : {}),
    };
    const entries = pendingWizards.map(input => ({
      id: input.id,
      fileName: input.name,
      rawText: input.text,
      previewLines: input.parsed?.previewLines ?? [],
      suggestedConfig: input.parsed?.suggestedConfig,
      ...(input.rawBinary ? { rawBinary: input.rawBinary } : {}),
      ...(input.binaryConfig ? { binaryConfig: input.binaryConfig } : {}),
      ...(input.binaryWarning ? { binaryWarning: input.binaryWarning } : {}),
      targetPaneId: command.targetPaneId,
      duplicateChoice: input.choice,
      pendingBatch: batch,
    }));
    return { ...state, files: { ...state.files, wizardQueue: [...state.files.wizardQueue, ...entries] }, revision: state.revision + 1 };
  }
  if (command.workspace) {
    const work = state.files.files.length > 0
      || state.traces.derivedTraces.length > 0
      || state.markers.markers.length > 0
      || state.lines.refLines.length > 0
      || state.panes.panes.length > 1;
    if (command.workspace.choice === 'cancel') return state;
    if (work && command.workspace.choice !== 'replace') return {
      ...state,
      ui: uiReducer(state.ui, {
        type: 'SET',
        payload: {
          key: 'paneAssignmentWarning',
          value: { message: 'Opening the workspace requires a replacement decision.', paneId: null, traceName: null },
        },
      }),
      revision: state.revision + 1,
    };
    if (!workspaceFromSnapshot(state, command.workspace.snapshot, command.workspace.legacy, command.limit)) return {
      ...state,
      ui: uiReducer(state.ui, {
        type: 'SET',
        payload: {
          key: 'paneAssignmentWarning',
          value: { message: 'Workspace has incompatible pane memberships; it was not loaded.', paneId: null, traceName: null },
        },
      }),
      revision: state.revision + 1,
    };
    const loaded = workspaceReducer(state, {
      slice: 'load',
      snapshot: command.workspace.snapshot,
      legacy: command.workspace.legacy,
      limit: command.limit,
    });
    const opened = openData(loaded, { ...command, workspace: undefined, targetPaneId: undefined }, workspaceReducer);
    if (opened.ui.paneAssignmentWarning !== loaded.ui.paneAssignmentWarning && opened.ui.paneAssignmentWarning) return {
      ...state,
      ui: { ...state.ui, paneAssignmentWarning: opened.ui.paneAssignmentWarning },
      revision: state.revision + 1,
    };
    return opened;
  }
  const descriptors: OpenData[] = command.inputs.filter(input => !isWizardFormat(input.parsed?.format)).map(input => {
    const prior = input.choice === 'replace' ? state.files.files.find(file => file.fileName === input.name) : undefined;
    if (input.choice === 'replace' && input.expectedFileId && String(prior?.id) !== input.expectedFileId) return {
      kind: 'data',
      inputId: input.id,
      name: input.name,
      result: { ok: false, fileId: input.id, reason: 'The file selected for replacement changed; choose again.' },
    };
    const adapted = prior?.datasets && prior.displayTraces
      ? adaptDisplayTracesToLegacyTraces(prior.datasets, prior.displayTraces, prior)
      : prior?.traces;
    const validPrior = !prior?.displayTraces
      || (adapted?.length === prior.displayTraces.length
        && new Set(adapted.map(trace => trace.id)).size === adapted.length
        && new Set(adapted.map(trace => trace.name)).size === adapted.length);
    const canonicalPrior = prior && adapted && validPrior ? { ...prior, traces: adapted } : prior;
    const allPriorHidden = Boolean(prior?.displayTraces?.length && prior.displayTraces.every(display => display.hidden));
    const unhideMatched = Boolean(command.resolveWizardId) || allPriorHidden;
    const result = !validPrior
      ? { ok: false as const, reason: 'The existing file has invalid projection references.' }
      : input.parsed
        ? prepareOpenInput({
          parsed: input.parsed,
          rawText: input.text,
          fileId: input.id,
          fileName: input.name,
          prior: canonicalPrior,
          priorRawText: prior ? state.files.rawFileData[String(prior.id)] : undefined,
          wizardConfig: input.wizardConfig,
          recognizedColumns: !input.wizardConfig,
          unhideMatched,
        })
        : { ok: false as const, reason: input.error ?? 'Could not read this file.' };
    prepared.set(input.id, result);
    if (!result.ok) return {
      kind: 'data',
      inputId: input.id,
      name: input.name,
      result: { ok: false, fileId: input.id, reason: result.reason },
    };
    for (const match of result.replacementMatches) matchingKeys.set(match.id, match.key);
    return {
      kind: 'data',
      inputId: input.id,
      name: input.name,
      result: { ok: true, fileId: input.id, selection: result.selection, replacementMatches: result.replacementMatches },
    };
  });
  const fileMembers = state.files.files.map(file => {
    const known = traceView({ ...state.files, files: [file] }, { derivedTraces: [], vis: state.traces.vis }).allKnownTraces;
    return {
      id: String(file.id),
      name: file.fileName,
      members: known.map(trace => ({
        trace: { id: trace.id, key: matchingKeys.get(trace.id) ?? `existing:${trace.id}` },
        paneIds: state.panes.tracePaneMap[trace.name] ?? [],
      })),
    };
  });
  const members: OpenMember[] = oldView.allKnownTraces.map(trace => ({
    trace: { id: trace.id, key: matchingKeys.get(trace.id) ?? `existing:${trace.id}` },
    paneIds: state.panes.tracePaneMap[trace.name] ?? [],
  }));
  const tracesById = new Map(oldById);
  const displays = [...oldView.allDisplayTraces];
  for (const result of prepared.values()) if (result.ok) {
    const view = traceView({ ...state.files, files: [result.file] }, { derivedTraces: [], vis: state.traces.vis });
    for (const trace of view.allKnownTraces) tracesById.set(trace.id, trace);
    displays.unshift(...view.allDisplayTraces);
  }
  const paneById = new Map(state.panes.panes.map(pane => [pane.id, pane]));
  const choices = Object.fromEntries(command.inputs.map(input => [input.id, input.choice]));
  const plan = planOpenFiles(descriptors, {
    revision: state.revision,
    paneLimit: command.limit,
    issuedPaneIds: state.panes.issuedPaneIds,
    explicitPaneId: command.targetPaneId,
    duplicateChoices: choices,
    state: {
      hasWork: state.files.files.length > 0,
      files: fileMembers,
      panes: state.panes.panes,
      members,
      targetPaneId: state.panes.activePaneId,
    },
    canPlace: (trace, pane, provisional) => {
      const actual = tracesById.get(trace.id);
      const target = paneById.get(pane.id);
      if (!actual || !target) return { allowed: false, reason: 'The trace or target pane is no longer available.' };
      const entries: PlacementTrace[] = provisional.flatMap(member => {
        const item = tracesById.get(member.trace.id);
        return item ? [{
          trace: item,
          paneIds: member.paneIds,
          displayTrace: displays.find(display => display.id === item.id || item.parameters?.displayTraceId === display.id),
        }] : [];
      });
      const entry = {
        trace: actual,
        paneIds: [],
        displayTrace: displays.find(display => display.id === actual.id || actual.parameters?.displayTraceId === display.id),
      };
      let candidate = target;
      const registry = createPaneTypeRegistry({ smithCapability: () => canRenderInPane(entry, { ...target, renderMode: 'smith' }) });
      const acceptsCurrent = target.renderMode === 'smith' || target.renderMode === 'smith-inverted'
        ? canRenderInPane(entry, target)
        : registry[paneTypeOfMode(target.renderMode)].appliesTo(actual);
      if (!target.typed && !entries.some(member => member.paneIds.includes(target.id)) && !acceptsCurrent.allowed) {
        const choice = planEmptyPaneType(registry, target, actual, true);
        if (!choice.mode) return { allowed: false, reason: choice.reason ?? acceptsCurrent.reason };
        candidate = { ...target, renderMode: choice.mode, typed: true };
      }
      const result = canPlaceMembership(
        entry,
        pane.id,
        [...paneById.values()].map(item => item.id === pane.id ? candidate : item),
        entries
      );
      if (result.allowed) paneById.set(pane.id, candidate);
      return result;
    },
    // A copied frequency range may belong to a different file.
    newPane: (_trace, _panes, issued) => {
      const source = state.panes.panes.find(pane => pane.id === state.panes.activePaneId) ?? state.panes.panes[0];
      if (!source) return null;
      let n = 1;
      while (issued.includes(`pane-${n}`)) n++;
      const pane = {
        ...source,
        id: `pane-${n}`,
        title: '',
        renderMode: 'cartesian' as const,
        typed: false,
        settings: { ...source.settings, table: undefined, smith: { ...source.settings.smith, range: null } },
      };
      paneById.set(pane.id, pane);
      return pane;
    },
  });
  // A refused open still ends the wizard that asked for it; the warning explains why nothing opened.
  const resolvedQueue = command.resolveWizardId || command.resolveBatchId
    ? state.files.wizardQueue.filter(entry => entry.id !== command.resolveWizardId
      && (!command.resolveBatchId || entry.pendingBatch?.id !== command.resolveBatchId))
    : state.files.wizardQueue;
  if (!plan.ok) return {
    ...state,
    files: resolvedQueue === state.files.wizardQueue ? state.files : { ...state.files, wizardQueue: resolvedQueue },
    ui: uiReducer(state.ui, {
      type: 'SET',
      payload: {
        key: 'paneAssignmentWarning',
        value: {
          message: plan.reason,
          paneId: command.targetPaneId ?? state.panes.activePaneId,
          traceName: null,
          ...(command.drop ? { source: 'drop' as const } : {}),
        },
      },
    }),
    revision: state.revision + 1,
  };
  const replacedTraceNames = new Set<string>();
  let files = [...state.files.files];
  const raw = { ...state.files.rawFileData };
  const rawBin = { ...(state.files.rawBinaryData ?? {}) };
  const binConfigs = { ...(state.files.binaryConfigByFileId ?? {}) };
  const inputById = new Map(command.inputs.map(input => [input.id, input]));
  const memberships = { ...state.panes.tracePaneMap };
  const panes = state.panes.panes.map(pane => paneById.get(pane.id) ?? pane);
  const issued = [...state.panes.issuedPaneIds];
  const errors: { fileName: string; message: string }[] = [];
  for (const step of plan.steps) {
    if (step.kind === 'new-pane') {
      const pane = paneById.get(step.pane.id);
      if (pane) {
        panes.push(pane);
        issued.push(pane.id);
      }
      continue;
    }
    if (step.kind === 'error') {
      errors.push({ fileName: step.name, message: step.reason });
      if (!step.replaceFileId) files.push({
        id: step.fileId,
        fileName: step.name,
        meta: {},
        traces: [],
        format: 'unknown',
        error: step.reason,
      });
      continue;
    }
    if (step.kind !== 'file') continue;
    const item = prepared.get(step.inputId);
    if (!item?.ok) continue;
    if (step.replaceFileId) {
      files = files.filter(file => String(file.id) !== step.replaceFileId);
      delete raw[step.replaceFileId];
      delete rawBin[step.replaceFileId];
      delete binConfigs[step.replaceFileId];
    }
    files.push({ ...item.file, fileName: step.name, matrixOpen: step.matrixOpen });
    raw[step.fileId] = item.rawText;
    const sourceInput = inputById.get(step.inputId);
    if (sourceInput?.rawBinary) rawBin[step.fileId] = sourceInput.rawBinary;
    if (sourceInput?.binaryConfig) binConfigs[step.fileId] = sourceInput.binaryConfig;
    for (const entry of step.traces) {
      const trace = tracesById.get(entry.trace.id);
      if (trace) {
        memberships[trace.name] = [...entry.paneIds];
        if (entry.preserveFrom) replacedTraceNames.add(trace.name);
      }
    }
  }
  const wizardQueue = state.files.wizardQueue.filter(entry => entry.id !== command.resolveWizardId
    && (!command.resolveBatchId || entry.pendingBatch?.id !== command.resolveBatchId));
  const fileState = { ...state.files, files, rawFileData: raw, rawBinaryData: rawBin, binaryConfigByFileId: binConfigs, wizardQueue };
  const paneState = { ...state.panes, panes, issuedPaneIds: issued, tracePaneMap: memberships };
  let next = workspaceReducer(state, {
    slice: 'transaction',
    actions: [
      { slice: 'files', action: { type: 'RESTORE_FILES', payload: fileState } },
      { slice: 'panes', limit: command.limit, action: { type: 'RESTORE', payload: paneState } },
      { slice: 'panes', limit: command.limit, action: { type: 'RECONCILE', payload: traceView(fileState, state.traces).allKnownTraces } },
    ],
  });
  if (replacedTraceNames.size) {
    const updated = new Map(traceView(next.files, next.traces).allKnownTraces.filter(trace => replacedTraceNames.has(trace.name))
      .map(trace => [trace.name, trace]));
    next = {
      ...next,
      markers: {
        ...next.markers,
        markers: next.markers.markers.map(marker => {
          const trace = updated.get(marker.trace);
          if (!trace) return marker;
          const placement = placeMarker(trace, marker.requestedFreq ?? marker.freq);
          return { ...marker, ...placement };
        }),
      },
    };
  }
  for (const error of errors) next = workspaceReducer(next, { slice: 'files', action: { type: 'REPORT_IMPORT_ERROR', payload: error } });
  return next;
}
