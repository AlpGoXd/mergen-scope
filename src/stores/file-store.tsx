import React, { createContext, useContext, useReducer } from 'react';
import type { RawFileRecord, WizardConfig, ParsedFile } from '../types/file';
import type { OpenChoice } from '../types/open-files-plan';
import type { WorkspaceSnapshotV5 } from '../types/workspace-v5';
import type { TouchstoneFamily, TouchstoneView, TouchstoneSelectionState } from '../types/touchstone';
import { makeDefaultTouchstoneState, touchstoneStateFromFile, reconcileTouchstoneFileSelections, appendTouchstoneDisplayTrace } from '../domain/touchstone/selections';
import type { InterpolationStrategy } from '../types/interpolation';
import { parseMeasurementFile } from '../domain/parsers/parse-file';
import { classify } from '../domain/parsers/classifier';
import { parseTabularFile } from '../domain/parsers/tabular';
import { adaptDisplayTracesToLegacyTraces } from '../domain/display-trace-adapter';
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace, buildNetworkDatasetFromTouchstone } from '../domain/dataset-builders';

export interface PendingOpenInput { readonly id:string; readonly name:string; readonly text:string; readonly parsed:ParsedFile | null; readonly error?:string; readonly choice?:OpenChoice; readonly expectedFileId?:string; readonly wizardConfig?:WizardConfig }
export interface PendingOpenBatch { readonly id:string; readonly inputs:readonly PendingOpenInput[]; readonly targetPaneId?:string; readonly workspace?:{readonly snapshot:WorkspaceSnapshotV5;readonly legacy:boolean;readonly choice?:'replace'|'cancel'} }
export interface WizardEntry {
  id: string;
  fileName: string;
  rawText: string;
  previewLines: readonly string[];
  suggestedConfig?: WizardConfig;
  targetPaneId?: string;
  duplicateChoice?: OpenChoice;
  pendingBatch?: PendingOpenBatch;
}

export interface ImportError {
  id: string;
  fileName: string;
  message: string;
}

export interface FileState {
  files: RawFileRecord[];
  rawFileData: Record<string, string>;
  vis: Record<string, boolean>; // trace name -> visible boolean
  wizardQueue: WizardEntry[];
  importErrors: ImportError[];
}

export type FileAction =
  | { type: 'QUEUE_WIZARD'; payload: { fileName: string; rawText: string; id: string; targetPaneId?: string } }
  | { type: 'RESOLVE_WIZARD'; payload: { id: string; config: WizardConfig; decisions?:Readonly<Record<string,{choice:OpenChoice;expectedFileId?:string}>>; workspaceChoice?:'replace'|'cancel' } }
  | { type: 'RERUN_WIZARD'; payload: { fileId: string; fileName: string } }
  | { type: 'SKIP_WIZARD'; payload: { id: string } }
  | { type: 'SKIP_ALL_WIZARD' }
  | { type: 'REPORT_IMPORT_ERROR'; payload: { fileName: string; message: string } }
  | { type: 'DISMISS_IMPORT_ERROR'; payload: { id: string } }
  | { type: 'REMOVE_FILE'; payload: { fileId: string } }
  | { type: 'SET_TOUCHSTONE_CONTROLS'; payload: { fileId: string; controls: Pick<TouchstoneSelectionState, 'activeFamily' | 'activeViewByFamily'> } }
  | { type: 'APPEND_TOUCHSTONE_VIEW'; payload: { fileId: string; family: TouchstoneFamily; row: number; col: number; view: TouchstoneView } }
  | { type: 'DELETE_RAW_TRACE'; payload: { fileId: string; traceId: string } }
  | { type: 'DELETE_DISPLAY_TRACE'; payload: { fileId: string; displayTraceId: string } }
  | { type: 'SET_DISPLAY_TRACE_HIDDEN'; payload: { fileId: string; displayTraceId: string; hidden: boolean } }
  | { type: 'SET_DISPLAY_TRACE_INTERPOLATION'; payload: { fileId: string; displayTraceId: string; interpolation: InterpolationStrategy } }
  | { type: 'SHOW_ALL_DISPLAY_TRACES'; payload: { fileId: string } }
  | { type: 'SET_VISIBILITY'; payload: { traceName: string; visible: boolean } }
  // importErrors are UI feedback, not file data: restores keep the current ones.
  | { type: 'RESTORE_FILES'; payload: Omit<FileState, 'importErrors'> }
  | { type: 'ADD_PARSED_FILE'; payload: { id: string; fileName: string; parsed: ParsedFile; text: string } };

export const defaultFileState: FileState = {
  files: [],
  rawFileData: {},
  vis: {},
  wizardQueue: [],
  importErrors: [],
};

let importErrorCounter = 0;

function withImportError(state: FileState, fileName: string, message: string): FileState {
  importErrorCounter += 1;
  return {
    ...state,
    importErrors: [...state.importErrors, { id: `import-error-${importErrorCounter}`, fileName, message }],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

// Touchstone files get their traces later (selection reconcile), so a network alone counts as data.
function hasImportedData(parsed: ParsedFile): boolean {
  return parsed.traces.length > 0 || (parsed.displayTraces?.length ?? 0) > 0 || Boolean(parsed.touchstoneNetwork);
}

function nonEmptyPreviewLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 100);
}

function initializeNetworkFile(file: RawFileRecord): RawFileRecord {
  if (!file.touchstoneNetwork || (file.displayTraces?.length ?? 0) > 0) return file;
  const source = buildNetworkDatasetFromTouchstone(file.touchstoneNetwork,file.fileName,file.id);
  const identified = {...file,datasets:[source]};
  const selection = makeDefaultTouchstoneState(identified);
  const initialized = reconcileTouchstoneFileSelections(identified, selection);
  return {...initialized, matrixOpen:file.touchstoneNetwork.portCount >= 3, touchstoneControls:{activeFamily:selection.activeFamily,activeViewByFamily:selection.activeViewByFamily}};
}

export const FileStateContext = createContext<FileState | null>(null);
export const FileDispatchContext = createContext<React.Dispatch<FileAction> | null>(null);

export function fileReducer(state: FileState, action: FileAction): FileState {
  switch (action.type) {
    case 'QUEUE_WIZARD': {
      const { id, fileName, rawText, targetPaneId } = action.payload;

      let parsed: ParsedFile;
      try {
        parsed = parseMeasurementFile(rawText, fileName, classify(rawText, fileName));
      } catch (error) {
        return withImportError(state, fileName, errorMessage(error));
      }

      if (parsed.format === 'needs-import-wizard') {
        const wizardEntry: WizardEntry = {
          id,
          fileName,
          rawText,
          previewLines: parsed.previewLines ?? [],
          suggestedConfig: parsed.suggestedConfig,
          targetPaneId,
        };
        return {
          ...state,
          wizardQueue: [...state.wizardQueue, wizardEntry],
        };
      } else {
        if (!hasImportedData(parsed)) {
          return withImportError(state, fileName, 'No data found in this file.');
        }
        const newRecord: RawFileRecord = initializeNetworkFile({
          id,
          fileName,
          meta: parsed.meta,
          traces: parsed.traces,
          datasets: parsed.datasets,
          displayTraces: parsed.displayTraces,
          columnIdentities: parsed.columnIdentities,
          wizardConfig: parsed.suggestedConfig,
          format: parsed.format,
          touchstoneNetwork: parsed.touchstoneNetwork,
          targetPaneId,
        });
        const newVis = { ...state.vis };
        parsed.traces.forEach(t => { newVis[t.name] = true; });

        return {
          ...state,
          files: [...state.files, newRecord],
          rawFileData: { ...state.rawFileData, [id]: rawText },
          vis: newVis
        };
      }
    }
    case 'RESOLVE_WIZARD': {
      const { id, config } = action.payload;
      const entryIdx = state.wizardQueue.findIndex(e => e.id === id);
      if (entryIdx === -1) return state;

      const entry = state.wizardQueue[entryIdx]!;
      const newQueue = [...state.wizardQueue];
      newQueue.splice(entryIdx, 1);

      let parsed: ParsedFile;
      try {
        parsed = parseTabularFile(entry.rawText, entry.fileName, config);
      } catch (error) {
        return withImportError({ ...state, wizardQueue: newQueue }, entry.fileName, errorMessage(error));
      }
      if (!hasImportedData(parsed)) {
        return withImportError(
          { ...state, wizardQueue: newQueue },
          entry.fileName,
          'No data rows matched these settings. Check the delimiter, start row and columns.',
        );
      }

      // A re-import reuses the file id: replace the old record only now, so Skip keeps it.
      const previous = state.files.find((file) => String(file.id) === String(id));
      // Display traces remain available when a series is hidden, while file.traces
      // may have been rebuilt from only the visible projections.
      const previousTraces = previous?.datasets && previous.displayTraces
        ? adaptDisplayTracesToLegacyTraces(previous.datasets, previous.displayTraces, previous).map((trace) => {
            const original = previous.traces.find((item) => item.name === trace.name);
            const id = trace.id.startsWith('display-') ? trace.id.slice('display-'.length) : (original?.id ?? trace.id);
            return { ...trace, id };
          })
        : [...(previous?.traces ?? [])];
      const remaining = [...previousTraces];
      const traces = parsed.traces.map((trace) => {
        const index = remaining.findIndex((old) => old.dn === trace.dn);
        if (index < 0) return trace;
        const old = remaining.splice(index, 1)[0];
        return old ? { ...trace, id: old.id, name: old.name, sourceTraceIds: [old.id] } : trace;
      });
      const datasets = traces.map((trace) => buildSeriesDatasetFromTrace(trace, config.domain === 'time' ? 'waveform' : 'spectrum'));
      const displayTraces = datasets.flatMap((dataset, index) => {
        const trace = traces[index];
        const series = dataset.series[0];
        if (!trace || !series) return [];
        const display = buildScalarDisplayTraceFromSeriesDataset(dataset, series, trace);
        const old = previous?.displayTraces?.find((item) => item.id === display.id);
        return [{ ...display, hidden: old?.hidden, interpolation: old?.interpolation }];
      });
      const newVis = { ...state.vis };
      remaining.forEach((trace) => { delete newVis[trace.name]; });
      traces.forEach((trace) => { if (newVis[trace.name] === undefined) newVis[trace.name] = true; });

      const newRecord: RawFileRecord = {
        id,
        fileName: entry.fileName,
        meta: parsed.meta,
        traces,
        datasets,
        displayTraces,
        columnIdentities: parsed.columnIdentities,
        format: parsed.format,
        touchstoneNetwork: undefined,
        targetPaneId: entry.targetPaneId,
        wizardConfig: config,
      };

      return {
        ...state,
        files: previous
          ? state.files.map((file) => (file === previous ? newRecord : file))
          : [...state.files, newRecord],
        rawFileData: { ...state.rawFileData, [id]: entry.rawText },
        wizardQueue: newQueue,
        vis: newVis,
      };
    }
    case 'RERUN_WIZARD': {
      const { fileId, fileName } = action.payload;
      const text = state.rawFileData[fileId];
      if (!text) return state; // can't rerun without text
      if (state.wizardQueue.some((entry) => entry.id === fileId)) return state;

      let suggestedConfig: WizardConfig | undefined = state.files.find(file => String(file.id) === fileId)?.wizardConfig;
      try {
        // Prefer the actual previous choice; fall back to parser inference for older files.
        suggestedConfig ??= parseTabularFile(text, fileName, null).suggestedConfig;
      } catch {
        suggestedConfig = undefined;
      }

      const newEntry: WizardEntry = {
        id: fileId,
        fileName,
        rawText: text,
        previewLines: nonEmptyPreviewLines(text),
        suggestedConfig,
        targetPaneId: state.files.find((file) => String(file.id) === fileId)?.targetPaneId,
      };

      return {
        ...state,
        wizardQueue: [...state.wizardQueue, newEntry]
      };
    }
    case 'SKIP_WIZARD': {
      const newQueue = state.wizardQueue.filter(e => e.id !== action.payload.id);
      return { ...state, wizardQueue: newQueue };
    }
    case 'SKIP_ALL_WIZARD':
      return { ...state, wizardQueue: [] };
    case 'REPORT_IMPORT_ERROR':
      return withImportError(state, action.payload.fileName, action.payload.message);
    case 'DISMISS_IMPORT_ERROR':
      return { ...state, importErrors: state.importErrors.filter((error) => error.id !== action.payload.id) };
    case 'REMOVE_FILE': {
      const fileId = action.payload.fileId;
      const newFiles = state.files.filter(f => String(f.id) !== String(fileId));
      
      const newRawFileData = { ...state.rawFileData };
      delete newRawFileData[fileId];

      // Remove from visibility dict? We can leave them to allow garbage collection, 
      // or optionally clean up `vis` for those traceNames.
      const tracesToRemove = state.files.find(f => String(f.id) === String(fileId))?.traces ?? [];
      const newVis = { ...state.vis };
      tracesToRemove.forEach(tr => { delete newVis[tr.name]; });

      return {
        ...state,
        files: newFiles,
        rawFileData: newRawFileData,
        vis: newVis
      };
    }
    case 'SET_TOUCHSTONE_CONTROLS': {
      const file = state.files.find(item => String(item.id) === action.payload.fileId);
      if (!file?.touchstoneNetwork) return state;
      return {...state,files:state.files.map(item => item === file ? {...file,touchstoneControls:action.payload.controls} : item)};
    }
    case 'APPEND_TOUCHSTONE_VIEW': {
      const {fileId,family,row,col,view} = action.payload;
      const file = state.files.find(item => String(item.id) === fileId);
      if (!file?.touchstoneNetwork) return state;
      const selection = touchstoneStateFromFile(file);
      const nextFile = appendTouchstoneDisplayTrace(file, selection, family, row, col, view);
      if (nextFile === file) return state;
      const activeViewByFamily = {...selection.activeViewByFamily,[family]:view};
      return {...state,files:state.files.map(item => item === file ? {...nextFile,touchstoneControls:{activeFamily:family,activeViewByFamily}} : item)};
    }
    case 'DELETE_RAW_TRACE': {
      const {fileId,traceId} = action.payload;
      const file = state.files.find(item => String(item.id) === fileId);
      const trace = file?.traces.find(item => item.id === traceId);
      if (!file || !trace || (file.datasets?.length ?? 0) > 0) return state;
      const vis = {...state.vis}; delete vis[trace.name];
      return {...state, files:state.files.map(item => item === file ? {...file,traces:file.traces.filter(t => t.id !== traceId)} : item),vis};
    }
    case 'DELETE_DISPLAY_TRACE': {
      const {fileId, displayTraceId} = action.payload;
      const file = state.files.find(item => String(item.id) === fileId);
      const display = file?.displayTraces?.find(item => item.id === displayTraceId);
      if (!file || !display || !file.datasets) return state;
      const displayTraces = (file.displayTraces ?? []).filter(item => item.id !== displayTraceId);
      const columnIdentities = file.columnIdentities?.filter((_, index) => file.displayTraces?.[index]?.id !== displayTraceId);
      const nextFile = {...file, displayTraces, columnIdentities, traces:adaptDisplayTracesToLegacyTraces(file.datasets, displayTraces.filter(item => !item.hidden), file)};
      const vis = {...state.vis}; delete vis[display.compat?.legacyTraceName ?? display.id];
      return {...state, files:state.files.map(item => item === file ? nextFile : item), vis};
    }
    case 'SET_DISPLAY_TRACE_HIDDEN': {
      const { fileId, displayTraceId, hidden } = action.payload;
      const targetFile = state.files.find((file) => String(file.id) === String(fileId));
      if (!targetFile?.displayTraces || !targetFile.datasets) {
        return state;
      }

      const nextDisplayTraces = targetFile.displayTraces.map((displayTrace) =>
        displayTrace.id === displayTraceId ? { ...displayTrace, hidden } : displayTrace,
      );
      const visibleDisplayTraces = nextDisplayTraces.filter((displayTrace) => !displayTrace.hidden);
      const nextFile: RawFileRecord = {
        ...targetFile,
        displayTraces: nextDisplayTraces,
        traces: adaptDisplayTracesToLegacyTraces(targetFile.datasets, visibleDisplayTraces, targetFile),
      };
      const nextVis = { ...state.vis };
      const toggledTrace = targetFile.displayTraces.find((displayTrace) => displayTrace.id === displayTraceId) ?? null;
      const legacyTraceName = toggledTrace?.compat?.legacyTraceName ?? toggledTrace?.id ?? null;
      if (legacyTraceName) {
        if (hidden) {
          delete nextVis[legacyTraceName];
        } else {
          nextVis[legacyTraceName] = true;
        }
      }

      return {
        ...state,
        files: state.files.map((file) => (String(file.id) === String(fileId) ? nextFile : file)),
        vis: nextVis,
      };
    }
    case 'SET_DISPLAY_TRACE_INTERPOLATION': {
      const { fileId, displayTraceId, interpolation } = action.payload;
      const targetFile = state.files.find((file) => String(file.id) === String(fileId));
      if (!targetFile?.displayTraces || !targetFile.datasets) {
        return state;
      }

      const nextDisplayTraces = targetFile.displayTraces.map((displayTrace) =>
        displayTrace.id === displayTraceId ? { ...displayTrace, interpolation } : displayTrace,
      );
      const visibleDisplayTraces = nextDisplayTraces.filter((displayTrace) => !displayTrace.hidden);
      const nextFile: RawFileRecord = {
        ...targetFile,
        displayTraces: nextDisplayTraces,
        traces: adaptDisplayTracesToLegacyTraces(targetFile.datasets, visibleDisplayTraces, targetFile),
      };

      return {
        ...state,
        files: state.files.map((file) => (String(file.id) === String(fileId) ? nextFile : file)),
      };
    }
    case 'SHOW_ALL_DISPLAY_TRACES': {
      const { fileId } = action.payload;
      const targetFile = state.files.find((file) => String(file.id) === String(fileId));
      if (!targetFile?.displayTraces || !targetFile.datasets) {
        return state;
      }

      const nextDisplayTraces = targetFile.displayTraces.map((displayTrace) => ({ ...displayTrace, hidden: false }));
      const nextFile: RawFileRecord = {
        ...targetFile,
        displayTraces: nextDisplayTraces,
        traces: adaptDisplayTracesToLegacyTraces(targetFile.datasets, nextDisplayTraces, targetFile),
      };
      const nextVis = { ...state.vis };
      nextDisplayTraces.forEach((displayTrace) => {
        const legacyTraceName = displayTrace.compat?.legacyTraceName ?? displayTrace.id;
        nextVis[legacyTraceName] = true;
      });

      return {
        ...state,
        files: state.files.map((file) => (String(file.id) === String(fileId) ? nextFile : file)),
        vis: nextVis,
      };
    }
    case 'SET_VISIBILITY': {
      const { traceName, visible } = action.payload;
      return {
        ...state,
        vis: { ...state.vis, [traceName]: visible }
      };
    }
    case 'ADD_PARSED_FILE': {
      // Direct insertion of a known parsed file layout
      const { id, fileName, parsed, text } = action.payload;
      const newRecord: RawFileRecord = initializeNetworkFile({
        id,
        fileName,
        meta: parsed.meta,
        traces: parsed.traces,
        datasets: parsed.datasets,
        displayTraces: parsed.displayTraces,
        columnIdentities: parsed.columnIdentities,
        wizardConfig: parsed.suggestedConfig,
        format: parsed.format,
        touchstoneNetwork: parsed.touchstoneNetwork,
      });
      const newVis = { ...state.vis };
      parsed.traces.forEach(t => { newVis[t.name] = true; });

      return {
        ...state,
        files: [...state.files, newRecord],
        rawFileData: { ...state.rawFileData, [id]: text },
        vis: newVis,
      };
    }
    case 'RESTORE_FILES': {
      return { ...action.payload, importErrors: state.importErrors };
    }
    default:
      return state;
  }
}

export function FileStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(fileReducer, defaultFileState);

  return (
    <FileDispatchContext.Provider value={dispatch}>
      <FileStateContext.Provider value={state}>
        {children}
      </FileStateContext.Provider>
    </FileDispatchContext.Provider>
  );
}

export function useFileState(): FileState {
  const context = useContext(FileStateContext);
  if (!context) {
    throw new Error('useFileState must be used within a FileStoreProvider');
  }
  return context;
}

export function useFileDispatch(): React.Dispatch<FileAction> {
  const context = useContext(FileDispatchContext);
  if (!context) {
    throw new Error('useFileDispatch must be used within a FileStoreProvider');
  }
  return context;
}
