import { fileReducer } from '../file-store';
import { traceReducer } from '../trace-store';
import { paneReducer } from '../pane-store';
import { markerReducer } from '../marker-store';
import { refLineReducer } from '../ref-line-store';
import { analysisReducer } from '../analysis-store';
import { uiReducer } from '../ui-store';
import { normalizeXLinks, paneXUnits } from '../../domain/x-link';
import { canPlaceMembership, planPaneRemoval, planPaneTypeChange, traceXGroup } from '../../domain/pane-placement';
import { refusalGuidance, traceAlreadyInPane } from '../../domain/pane-drop-hints';
import { parseTabularFile } from '../../domain/parsers/tabular';
import { parseBinaryWithConfig } from '../../domain/parsers/raw-binary';
import { autoOutputName, makeAnalysisOutput, recomputeOutputs, visibleOutputSourceChanged } from '../../domain/analysis/instances';
import { getAnalysisTool } from '../../domain/analysis/tool-registry';
import {
  defaultTitle,
  equalSizes,
  fallbackPreset,
  flattenLayoutSizes,
  presetFits,
  renumberTitles,
} from '../../domain/pane-layout';
import type { WorkspaceState, WorkspaceAction } from './workspace-state';
import { traceView } from '../../domain/workspace/workspace-trace-view';
import { workspaceFromSnapshot } from './workspace-snapshot';
import { planLastPaneRemoval, planLastPaneLines } from '../../domain/workspace/workspace-pane-removal';
import { openData } from './workspace-open-data';
import { analysisView, placeOnOwnAxis } from './workspace-analysis';

/** One reducer owns every workspace slice. Reconciliation runs inside the same transition. */
export function workspaceReducer(state: WorkspaceState, command: WorkspaceAction): WorkspaceState {
  if (command.slice === 'layout') {
    const action = command.action;
    if (action.type === 'SWAP_PANES') {
      const panes = [...state.panes.panes];
      const a = panes.findIndex(p => p.id === action.sourcePaneId);
      const b = panes.findIndex(p => p.id === action.targetPaneId);
      const first = panes[a];
      const second = panes[b];
      if (a === b || !first || !second) return state;
      panes[a] = second;
      panes[b] = first;
      const ordered = renumberTitles(panes);
      return {
        ...state,
        panes: { ...state.panes, panes: ordered },
        layout: { ...state.layout, paneOrder: ordered.map(p => p.id) },
        revision: state.revision + 1,
      };
    }
    if (action.type === 'SET_LAYOUT_PRESET') {
      const fit = presetFits(action.preset, state.panes.panes.length, action.limit);
      if (!fit.ok) return {
        ...state,
        ui: uiReducer(state.ui, {
          type: 'SET',
          payload: { key: 'paneAssignmentWarning', value: { message: fit.reason, paneId: null, traceName: null } },
        }),
        revision: state.revision + 1,
      };
      if (action.preset === state.layout.preset) return state;
      const prefix = action.preset === 'one-side' ? 'side:' : `${action.preset}:`;
      const sizes = Object.keys(state.layout.sizes).some(key => key.startsWith(prefix))
        ? state.layout.sizes
        : { ...state.layout.sizes, ...flattenLayoutSizes(equalSizes(action.preset, state.panes.panes.length)) };
      return { ...state, layout: { ...state.layout, preset: action.preset, sizes }, revision: state.revision + 1 };
    }
    if (action.type === 'SET_LAYOUT_SIZES') {
      if (Object.entries(action.sizes).some(([key, value]) => !/^(?:rows:\d+|columns:\d+|grid:[cr][01]|side:main|side:s\d+)$/.test(key)
        || !Number.isFinite(value)
        || value <= 0
        || value > 1e6)) return state;
      const prefixes = new Set(Object.keys(action.sizes).map(key => key.split(':')[0]));
      const previous = Object.fromEntries(Object.entries(state.layout.sizes).filter(([key]) => !prefixes.has(key.split(':')[0])));
      return { ...state, layout: { ...state.layout, sizes: { ...previous, ...action.sizes } }, revision: state.revision + 1 };
    }
    const index = state.panes.panes.findIndex(p => p.id === action.targetPaneId);
    if (index < 0) return state;
    const added = paneReducer(state.panes, { type: 'SET_PANE_COUNT', payload: state.panes.panes.length + 1, limit: action.limit });
    const created = added.panes.find(p => !state.panes.panes.some(old => old.id === p.id));
    if (!created) return state;
    const panes = [...state.panes.panes];
    panes.splice(index + 1, 0, { ...created, title: defaultTitle(index + 1) });
    const ordered = renumberTitles(panes);
    return {
      ...state,
      panes: { ...added, panes: ordered },
      layout: {
        ...state.layout,
        preset: fallbackPreset(state.layout.preset, ordered.length, action.limit),
        paneOrder: ordered.map(p => p.id),
      },
      revision: state.revision + 1,
    };
  }
  // 'remove-pane' closes any pane (Pane settings > Close pane); its traces and lines move by the closing-pane rule.
  if (command.slice === 'remove-last-pane' || command.slice === 'remove-empty-pane' || command.slice === 'remove-pane') {
    if (state.revision !== command.expectedRevision) return state;
    const view = traceView(state.files, state.traces);
    const entries = view.allKnownTraces.map(trace => ({
      trace,
      paneIds: state.panes.tracePaneMap[trace.name] ?? [],
      displayTrace: view.allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']),
    }));
    if (command.slice === 'remove-empty-pane'
      && (state.panes.panes.length <= 1 || entries.some(entry => entry.paneIds.includes(command.targetPaneId)))) return state;
    const result = command.slice === 'remove-last-pane'
      ? planLastPaneRemoval(state, command.targetPaneId)
      : planPaneRemoval(state.panes.panes, entries, [command.targetPaneId]);
    if (!result.ok || (result.plan.unplaced.length > 0 && !command.confirmed)) return state;
    const linePlan = planLastPaneLines(state, command.targetPaneId, result.plan.memberships);
    if (linePlan.length && !command.confirmed) return state;
    const byId = new Map(linePlan.map(item => [item.line.id, item]));
    const refLines = state.lines.refLines.map(line => {
      const move = byId.get(line.id);
      if (!move) return line;
      const remaining = line.paneIds.filter(id => id !== command.targetPaneId);
      const paneIds = remaining.length || !move.to ? remaining : [move.to];
      return { ...line, paneIds, axisUnit: move.axisUnit ?? line.axisUnit };
    });
    const prepared = { ...state, lines: { ...state.lines, refLines } };
    return workspaceReducer(prepared, {
      slice: 'panes',
      limit: command.limit,
      action: {
        type: 'SET_PANE_COUNT',
        payload: state.panes.panes.length - 1,
        limit: command.limit,
        confirmed: command.confirmed,
        targetPaneId: command.targetPaneId,
      },
    });
  }
  if (command.slice === 'open-data') return openData(state, command, workspaceReducer);
  if (command.slice === 'files' && command.action.type === 'RESOLVE_WIZARD') {
    const { id, config, decisions, workspaceChoice } = command.action.payload;
    const entry = state.files.wizardQueue.find(item => item.id === id);
    if (!entry) return state;
    const prior = state.files.files.find(file => String(file.id) === entry.id);
    try {
      const parsed = parseTabularFile(entry.rawText, entry.fileName, config);
      if (entry.pendingBatch) {
        const batch = {
          ...entry.pendingBatch,
          workspace: entry.pendingBatch.workspace && workspaceChoice
            ? { ...entry.pendingBatch.workspace, choice: workspaceChoice }
            : entry.pendingBatch.workspace,
          inputs: entry.pendingBatch.inputs.map(input => ({
            ...(input.id === entry.id ? { ...input, parsed, wizardConfig: config } : input),
            ...decisions?.[input.id],
          })),
        };
        const remaining = state.files.wizardQueue.filter(item => item.pendingBatch?.id === batch.id && item.id !== entry.id);
        if (remaining.length) return {
          ...state,
          files: {
            ...state.files,
            wizardQueue: state.files.wizardQueue.filter(item => item.id !== entry.id).map(item => item.pendingBatch?.id === batch.id
              ? { ...item, pendingBatch: batch }
              : item),
          },
          revision: state.revision + 1,
        };
        return openData(state, {
          slice: 'open-data',
          inputs: batch.inputs,
          targetPaneId: batch.targetPaneId,
          limit: command.limit ?? 4,
          resolveBatchId: batch.id,
          workspace: batch.workspace,
          drop: batch.drop,
        }, workspaceReducer);
      }
      return openData(state, {
        slice: 'open-data',
        inputs: [{
          id: prior ? `${entry.id}:reimport:${state.revision}` : entry.id,
          name: entry.fileName,
          text: entry.rawText,
          parsed,
          choice: prior ? 'replace' : entry.duplicateChoice,
          wizardConfig: config,
        }],
        targetPaneId: entry.targetPaneId,
        limit: command.limit ?? 4,
        resolveWizardId: entry.id,
      }, workspaceReducer);
    } catch (error) {
      const withoutFailedWizard = {
        ...state,
        files: { ...state.files, wizardQueue: state.files.wizardQueue.filter(item => item.id !== entry.id) },
      };
      return workspaceReducer(withoutFailedWizard, {
        slice: 'files',
        action: {
          type: 'REPORT_IMPORT_ERROR',
          payload: { fileName: entry.fileName, message: error instanceof Error ? error.message : String(error) },
        },
      });
    }
  }
  if (command.slice === 'files' && command.action.type === 'RESOLVE_BINARY_WIZARD') {
    const { id, binaryConfig, decisions, workspaceChoice } = command.action.payload;
    const entry = state.files.wizardQueue.find(item => item.id === id);
    if (!entry?.rawBinary) return state;
    const prior = state.files.files.find(file => String(file.id) === entry.id);
    const parsedResult = parseBinaryWithConfig(entry.rawBinary, entry.fileName, binaryConfig);
    if (!parsedResult.ok) {
      const withoutFailedWizard = {
        ...state,
        files: { ...state.files, wizardQueue: state.files.wizardQueue.filter(item => item.id !== entry.id) },
      };
      return workspaceReducer(withoutFailedWizard, {
        slice: 'files',
        action: { type: 'REPORT_IMPORT_ERROR', payload: { fileName: entry.fileName, message: parsedResult.error } },
      });
    }
    const { parsed, summaryText } = parsedResult;
    if (entry.pendingBatch) {
      const batch = {
        ...entry.pendingBatch,
        workspace: entry.pendingBatch.workspace && workspaceChoice
          ? { ...entry.pendingBatch.workspace, choice: workspaceChoice }
          : entry.pendingBatch.workspace,
        inputs: entry.pendingBatch.inputs.map(input => ({
          ...(input.id === entry.id ? { ...input, text: summaryText, parsed, rawBinary: entry.rawBinary, binaryConfig } : input),
          ...decisions?.[input.id],
        })),
      };
      const remaining = state.files.wizardQueue.filter(item => item.pendingBatch?.id === batch.id && item.id !== entry.id);
      if (remaining.length) return {
        ...state,
        files: {
          ...state.files,
          wizardQueue: state.files.wizardQueue.filter(item => item.id !== entry.id).map(item => item.pendingBatch?.id === batch.id
            ? { ...item, pendingBatch: batch }
            : item),
        },
        revision: state.revision + 1,
      };
      return openData(state, {
        slice: 'open-data',
        inputs: batch.inputs,
        targetPaneId: batch.targetPaneId,
        limit: command.limit ?? 4,
        resolveBatchId: batch.id,
        workspace: batch.workspace,
        drop: batch.drop,
      }, workspaceReducer);
    }
    return openData(state, {
      slice: 'open-data',
      inputs: [{
        id: prior ? `${entry.id}:reimport:${state.revision}` : entry.id,
        name: entry.fileName,
        text: summaryText,
        parsed,
        rawBinary: entry.rawBinary,
        binaryConfig,
        choice: prior ? 'replace' : entry.duplicateChoice,
      }],
      targetPaneId: entry.targetPaneId,
      limit: command.limit ?? 4,
      resolveWizardId: entry.id,
    }, workspaceReducer);
  }
  if (command.slice === 'files' && command.action.type === 'SKIP_WIZARD') {
    const id = command.action.payload.id;
    const batch = state.files.wizardQueue.find(entry => entry.id === id)?.pendingBatch;
    if (batch) {
      const inputs = batch.inputs.filter(input => input.id !== id);
      const wizardQueue = state.files.wizardQueue.filter(entry => entry.id !== id).map(entry => entry.pendingBatch?.id === batch.id
        ? { ...entry, pendingBatch: { ...batch, inputs } }
        : entry);
      return { ...state, files: { ...state.files, wizardQueue }, revision: state.revision + 1 };
    }
  }
  if (command.slice === 'transaction') {
    const result = command.actions.reduce(workspaceReducer, state);
    return result === state ? state : { ...result, revision: state.revision + 1 };
  }
  if (command.slice === 'load') {
    const candidate = workspaceFromSnapshot(state, command.snapshot, command.legacy, command.limit);
    if (!candidate) return {
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
    return workspaceReducer(state, { slice: 'restore', state: candidate });
  }
  if (command.slice === 'deleteTrace') {
    const trace = traceView(state.files, state.traces).allKnownTraces.find(item => item.id === command.traceId);
    if (!trace) return state;
    if (trace.kind === 'derived') return workspaceReducer(state, {
      slice: 'traces',
      action: { type: 'REMOVE_DERIVED', payload: trace.id },
    });
    const file = state.files.files.find(item => item.traces.some(t => t.id === trace.id || t.name === trace.name)
      || item.displayTraces?.some(display => display.id === trace.id || display.compat?.legacyTraceName === trace.name));
    if (!file) return state;
    const display = file.displayTraces?.find(item => item.id === trace.id || item.compat?.legacyTraceName === trace.name);
    return workspaceReducer(state, {
      slice: 'files',
      action: display
        ? { type: 'DELETE_DISPLAY_TRACE', payload: { fileId: String(file.id), displayTraceId: display.id } }
        : { type: 'DELETE_RAW_TRACE', payload: { fileId: String(file.id), traceId: trace.id } },
    });
  }
  if (command.slice === 'restore') return {
    ...command.state,
    panes: paneReducer(state.panes, { type: 'RESTORE', payload: command.state.panes }),
    markers: markerReducer(state.markers, { type: 'RESTORE', payload: command.state.markers }),
    analysis: analysisReducer(state.analysis, { type: 'RESTORE', payload: command.state.analysis }),
    ui: { ...command.state.ui, theme: state.ui.theme },
    revision: state.revision + 1,
  };
  if (command.slice === 'analysis'
    && (command.action.type === 'CREATE_ANALYSIS_OUTPUT' || command.action.type === 'FREEZE_ANALYSIS_COPY')) {
    const action = command.action;
    const instance = state.analysis.analyses.find(item => item.id === action.payload.id);
    if (!instance || getAnalysisTool(instance.toolId)?.kind !== 'math') return state;
    const all = traceView(state.files, state.traces).allKnownTraces;
    const source = all.find(trace => trace.id === instance.source.traceId);
    const existing = all.find(trace => trace.id === instance.outputTraceId && trace.kind === 'derived');
    if (action.type === 'CREATE_ANALYSIS_OUTPUT'
      && (instance.outputTraceId
        || !source
        || (instance.toolId === 'trace-math' && !all.some(trace => trace.id === instance.source.secondTraceId)))) return state;
    if (action.type === 'FREEZE_ANALYSIS_COPY' && !existing) return state;
    const base = `${instance.id}-output-${state.revision + 1}`;
    let id = base;
    let serial = 2;
    while (all.some(trace => trace.id === id || trace.name === id)) {
      id = `${base}-${serial}`;
      serial += 1;
    }
    const autoName = autoOutputName(instance, all);
    const created = action.type === 'CREATE_ANALYSIS_OUTPUT'
      ? makeAnalysisOutput(instance, { traces: all, ...analysisView(state) }, id, id)
      : null;
    const output = created ? { ...created, dn: autoName } : existing
      && existing.kind === 'derived'
      && action.type === 'FREEZE_ANALYSIS_COPY' ? (() => {
        const { analysisId: _analysisId, ...copy } = existing;
        return {
          ...copy,
          id,
          name: id,
          dn: `${existing.dn || existing.name} (copy)`,
          data: existing.data.map(point => ({ ...point })),
          parameters: { ...existing.parameters, analysisFrozen: true },
        };
      })() : null;
    if (!output) return state;
    const paneSource = created ? source : existing;
    const analyses = created
      ? state.analysis.analyses.map(item => item.id === instance.id ? { ...item, outputTraceId: id, autoName } : item)
      : state.analysis.analyses;
    // An output on another x axis (the FFT of a time trace) cannot join its source's panes.
    const otherAxis = paneSource !== undefined && traceXGroup(output) !== traceXGroup(paneSource);
    const added: WorkspaceState = {
      ...state,
      revision: state.revision + 1,
      analysis: { ...state.analysis, analyses },
      traces: { ...state.traces, derivedTraces: [...state.traces.derivedTraces, output], vis: { ...state.traces.vis, [id]: true } },
      panes: {
        ...state.panes,
        tracePaneMap: {
          ...state.panes.tracePaneMap,
          [id]: otherAxis ? [] : [...(paneSource ? state.panes.tracePaneMap[paneSource.name] ?? [] : [])],
        },
      },
    };
    return otherAxis
      ? placeOnOwnAxis(added, output, action.type === 'CREATE_ANALYSIS_OUTPUT' ? action.payload.paneLimit ?? 4 : 4, workspaceReducer)
      : added;
  }
  let next = state;
  switch (command.slice) {
    case 'files':
      next = { ...state, files: fileReducer(state.files, command.action) };
      break;
    case 'traces':
      next = { ...state, traces: traceReducer(state.traces, command.action) };
      break;
    case 'markers': {
      const markers = markerReducer(state.markers, command.action);
      const selects = ((command.action.type === 'PLACE_MARKER'
        || command.action.type === 'PLACE_MARKERS'
        || command.action.type === 'SET_ROLE_MARKERS')
        && markers !== state.markers)
        || (command.action.type === 'SET_SELECTED_IDX' && command.action.payload >= 0);
      next = {
        ...state,
        markers,
        lines: selects && markers.selectedMkrIdx >= 0 ? { ...state.lines, selectedRefLineId: null } : state.lines,
        ui: selects && markers.selectedMkrIdx >= 0 ? { ...state.ui, selectedTraceName: null } : state.ui,
      };
      break;
    }
    case 'lines': {
      const lines = refLineReducer(state.lines, command.action);
      const selects = (command.action.type === 'ADD_LINE' && lines !== state.lines)
        || (command.action.type === 'SET_SELECTED' && command.action.payload !== null);
      next = {
        ...state,
        lines,
        markers: selects && lines.selectedRefLineId !== null ? { ...state.markers, selectedMkrIdx: -1 } : state.markers,
        ui: selects && lines.selectedRefLineId !== null ? { ...state.ui, selectedTraceName: null } : state.ui,
      };
      break;
    }
    case 'analysis':
      next = { ...state, analysis: analysisReducer(state.analysis, command.action) };
      break;
    case 'ui': {
      const selects = command.action.type === 'SET'
        && command.action.payload.key === 'selectedTraceName'
        && typeof command.action.payload.value === 'string';
      next = {
        ...state,
        ui: uiReducer(state.ui, command.action),
        markers: selects ? { ...state.markers, selectedMkrIdx: -1 } : state.markers,
        lines: selects ? { ...state.lines, selectedRefLineId: null } : state.lines,
      };
      break;
    }
    case 'panes': {
      let action = command.action;
      if (![
        'SET_PANE_COUNT',
        'SET_RENDER_MODE',
        'CREATE_PANE_WITH_TRACE',
        'ASSIGN_TRACE_TO_PANE',
        'ADD_MEMBERSHIP',
        'MOVE_MEMBERSHIP',
      ].includes(action.type)) {
        next = { ...state, panes: paneReducer(state.panes, action) };
        break;
      }
      const view = traceView(state.files, state.traces);
      const entries = view.allKnownTraces.map(trace => ({
        trace,
        paneIds: state.panes.tracePaneMap[trace.name] ?? [],
        displayTrace: view.allDisplayTraces.find(display => display.id === trace.id
          || display.id === trace.parameters?.['displayTraceId']),
      }));
      const refusal = (message: string, paneId: string | null): WorkspaceState => ({
        ...state,
        ui: uiReducer(state.ui, { type: 'SET', payload: { key: 'paneAssignmentWarning', value: { message, paneId, traceName: null } } }),
        revision: state.revision + 1,
      });
      if ((action.type === 'ADD_MEMBERSHIP' || action.type === 'MOVE_MEMBERSHIP') && action.payload.drop) {
        const { trace, targetPaneId } = action.payload;
        if (traceAlreadyInPane(state.panes.tracePaneMap, trace.name, targetPaneId)) return state;
        const entry = entries.find(item => item.trace.id === trace.id && item.trace.name === trace.name);
        const result = entry
          ? canPlaceMembership(entry, targetPaneId, state.panes.panes, entries)
          : { allowed: false as const, reason: 'The trace is no longer available.' };
        if (!result.allowed) {
          const index = state.panes.panes.findIndex(pane => pane.id === targetPaneId);
          const message = refusalGuidance(
            result.reason,
            trace,
            `Pane ${index + 1}`,
            entries.filter(item => item.paneIds.includes(targetPaneId)).map(item => item.trace)
          );
          return {
            ...state,
            ui: uiReducer(state.ui, {
              type: 'SET',
              payload: { key: 'paneAssignmentWarning', value: { message, paneId: targetPaneId, traceName: trace.name, source: 'drop' } },
            }),
            revision: state.revision + 1,
          };
        }
      }
      if (action.type === 'SET_PANE_COUNT' && action.payload < state.panes.panes.length && !action.confirmed) {
        const plan = planPaneRemoval(
          state.panes.panes,
          entries,
          action.targetPaneId ? [action.targetPaneId] : state.panes.panes.slice(action.payload).map(pane => pane.id)
        );
        if (!plan.ok || plan.plan.unplaced.length) return refusal(
          plan.ok ? 'Removing these panes would leave traces unplaced; confirmation is required.' : plan.reason,
          state.panes.activePaneId
        );
      }
      if (action.type === 'SET_RENDER_MODE'
        && action.payload.confirmed
        && action.payload.expectedRevision !== undefined
        && action.payload.expectedRevision !== state.revision) return refusal(
          'The panes changed while you were confirming. Review the new plan.',
          action.payload.paneId
        );
      if (action.type === 'SET_RENDER_MODE' && !action.payload.confirmed) {
        const plan = planPaneTypeChange(state.panes.panes, entries, action.payload.paneId, action.payload.mode);
        if (!plan.ok || plan.plan.requiresConfirmation) return refusal(
          plan.ok ? 'Changing this pane would leave traces unplaced; confirmation is required.' : plan.reason,
          action.payload.paneId
        );
      }
      if (action.type === 'SET_PANE_COUNT') action = { ...action, limit: command.limit, traces: entries };
      else if (action.type === 'SET_RENDER_MODE') action = { ...action, payload: { ...action.payload, traces: entries } };
      if (action.type === 'CREATE_PANE_WITH_TRACE') {
        const trace = view.allKnownTraces.find(item => item.id === action.payload.trace.id && item.name === action.payload.trace.name);
        if (!trace) return state;
        next = {
          ...state,
          panes: paneReducer(state.panes, {
            type: 'CREATE_PANE_WITH_TRACE',
            limit: command.limit,
            payload: { trace, allTraces: view.allKnownTraces, displayTraces: view.allDisplayTraces },
          }),
        };
      } else if (action.type === 'ASSIGN_TRACE_TO_PANE') next = {
        ...state,
        panes: paneReducer(state.panes, {
          type: 'ASSIGN_TRACE_TO_PANE',
          payload: { ...action.payload, allTraces: view.allKnownTraces, displayTraces: view.allDisplayTraces },
        }),
      };
      else if (action.type === 'ADD_MEMBERSHIP') next = {
        ...state,
        panes: paneReducer(state.panes, {
          type: 'ADD_MEMBERSHIP',
          payload: { ...action.payload, allTraces: view.allKnownTraces, displayTraces: view.allDisplayTraces },
        }),
      };
      else if (action.type === 'MOVE_MEMBERSHIP') next = {
        ...state,
        panes: paneReducer(state.panes, {
          type: 'MOVE_MEMBERSHIP',
          payload: { ...action.payload, allTraces: view.allKnownTraces, displayTraces: view.allDisplayTraces },
        }),
      };
      else next = { ...state, panes: paneReducer(state.panes, action) };
      break;
    }
  }
  if (next.files === state.files
    && next.traces === state.traces
    && next.panes === state.panes
    && next.markers === state.markers
    && next.lines === state.lines
    && next.analysis === state.analysis
    && next.ui === state.ui) return state;
  if (command.slice === 'analysis' && command.action.type === 'REMOVE_ANALYSIS') {
    const removedId = command.action.payload.id;
    const removed = state.analysis.analyses.find(item => item.id === removedId);
    if (removed?.outputTraceId) next = {
      ...next,
      traces: {
        ...next.traces,
        derivedTraces: next.traces.derivedTraces.map(trace => {
          if (trace.kind !== 'derived' || trace.id !== removed.outputTraceId) return trace;
          const { analysisId: _analysisId, ...frozen } = trace;
          return { ...frozen, parameters: { ...trace.parameters, analysisFrozen: true } };
        }),
      },
    };
  }
  const analysisInputsChanged = next.analysis.analyses.length !== state.analysis.analyses.length || next.analysis.analyses.some(item => {
    const previous = state.analysis.analyses.find(old => old.id === item.id);
    return !previous
      || JSON.stringify(previous.params) !== JSON.stringify(item.params)
      || JSON.stringify(previous.source) !== JSON.stringify(item.source);
  });
  // An FFT with Range: Visible follows the pan and zoom of its source's pane.
  const viewChanged = (next.lines.paneViews !== state.lines.paneViews || next.panes.tracePaneMap !== state.panes.tracePaneMap)
    && visibleOutputSourceChanged(
      next.analysis.analyses,
      traceView(next.files, next.traces).allKnownTraces,
      state.panes.tracePaneMap,
      next.panes.tracePaneMap,
      state.lines.paneViews,
      next.lines.paneViews,
    );
  if (next.files !== state.files || next.traces !== state.traces || analysisInputsChanged || viewChanged) {
    const view = traceView(next.files, next.traces);
    const outputs = recomputeOutputs({
      analyses: next.analysis.analyses,
      traces: view.allKnownTraces.filter(trace => trace.kind !== 'derived'),
      derivedTraces: next.traces.derivedTraces,
      view: analysisView(next),
    });
    if (outputs.analyses.some((item, index) => item !== next.analysis.analyses[index])) next = {
      ...next,
      analysis: { ...next.analysis, analyses: outputs.analyses },
    };
    if (outputs.derivedTraces.some((item, index) => item !== next.traces.derivedTraces[index])) next = {
      ...next,
      traces: { ...next.traces, derivedTraces: outputs.derivedTraces },
    };
  }
  if (next.files !== state.files || next.traces !== state.traces) {
    const view = traceView(next.files, next.traces);
    const raw = view.allKnownTraces.filter(trace => trace.kind !== 'derived');
    // Analysis outputs remain ordinary frozen traces when their source or card is removed.
    const protectedTraces = next.traces.derivedTraces.filter(trace => trace.kind === 'derived'
      && (trace.analysisId !== undefined || trace.parameters?.['analysisFrozen'] === true));
    const legacyTraces = next.traces.derivedTraces.filter(trace => !(trace.kind === 'derived'
      && (trace.analysisId !== undefined || trace.parameters?.['analysisFrozen'] === true)));
    const legacy = traceReducer(
      { ...next.traces, derivedTraces: legacyTraces },
      { type: 'RECONCILE', payload: [...raw, ...protectedTraces] }
    );
    const kept = new Map([...legacy.derivedTraces, ...protectedTraces].map(trace => [trace.id, trace]));
    const ordered = next.traces.derivedTraces.flatMap(trace => {
      const item = kept.get(trace.id);
      return item ? [item] : [];
    });
    const reconciled = ordered.length === next.traces.derivedTraces.length
      && ordered.every((trace, index) => trace === next.traces.derivedTraces[index])
      ? next.traces
      : { ...legacy, derivedTraces: ordered };
    const vis = { ...reconciled.vis };
    let changed = false;
    for (const trace of view.allTraces) if (vis[trace.name] === undefined) {
      vis[trace.name] = true;
      changed = true;
    }
    next = { ...next, traces: changed ? { ...reconciled, vis } : reconciled };
    const afterLegacy = recomputeOutputs({
      analyses: next.analysis.analyses,
      traces: raw,
      derivedTraces: next.traces.derivedTraces,
      view: analysisView(next),
    });
    if (afterLegacy.analyses.some((item, index) => item !== next.analysis.analyses[index])) next = {
      ...next,
      analysis: { ...next.analysis, analyses: afterLegacy.analyses },
    };
    if (afterLegacy.derivedTraces.some((item, index) => item !== next.traces.derivedTraces[index])) next = {
      ...next,
      traces: { ...next.traces, derivedTraces: afterLegacy.derivedTraces },
    };
    const known = traceView(next.files, next.traces).allKnownTraces;
    const knownNames = new Set(known.map(trace => trace.name));
    const removed = traceView(state.files, state.traces).allKnownTraces.filter(trace => !knownNames.has(trace.name))
      .map(trace => trace.name);
    if (removed.length) {
      const visibility = { ...next.traces.vis };
      for (const name of removed) delete visibility[name];
      next = {
        ...next,
        traces: { ...next.traces, vis: visibility },
        markers: markerReducer(next.markers, { type: 'REMOVE_MARKERS_FOR_TRACES', payload: removed }),
        ui: {
          ...next.ui,
          selectedTraceName: next.ui.selectedTraceName && removed.includes(next.ui.selectedTraceName) ? null : next.ui.selectedTraceName,
          markerTrace: removed.includes(next.ui.markerTrace) ? '__auto__' : next.ui.markerTrace,
        },
      };
    }
    next = { ...next, panes: paneReducer(next.panes, { type: 'RECONCILE', payload: known }) };
    const visible = traceView(next.files, next.traces).allTraces;
    if (next.ui.selectedTraceName
      && !visible.some(trace => trace.name === next.ui.selectedTraceName
        && next.traces.vis[trace.name])) next = { ...next, ui: { ...next.ui, selectedTraceName: null } };
  }
  // X link groups hold panes of one X unit only; a pane whose unit changed leaves its group.
  if ((next.panes.panes !== state.panes.panes
    || next.panes.tracePaneMap !== state.panes.tracePaneMap
    || next.files !== state.files
    || next.traces !== state.traces)
    && next.panes.panes.some(pane => pane.xLinkGroup)) {
    const linked = normalizeXLinks(
      next.panes.panes,
      paneXUnits(next.panes.panes, traceView(next.files, next.traces).allKnownTraces, next.panes.tracePaneMap)
    );
    if (linked !== next.panes.panes) next = { ...next, panes: { ...next.panes, panes: [...linked] } };
  }
  if (next.panes.panes !== state.panes.panes) {
    const panes = renumberTitles(next.panes.panes.map((pane, index) => pane.title === '' ? { ...pane, title: defaultTitle(index) } : pane));
    next = {
      ...next,
      panes: { ...next.panes, panes },
      layout: {
        ...next.layout,
        paneOrder: panes.map(p => p.id),
        preset: fallbackPreset(next.layout.preset, panes.length, command.slice === 'panes' ? command.limit : 8),
      },
      lines: refLineReducer(next.lines, { type: 'CLEANUP_ORPHANED_LINES', payload: { paneIds: panes.map(p => p.id) } }),
    };
  }
  return { ...next, revision: state.revision + 1 };
}
