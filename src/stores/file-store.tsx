import React, { createContext, useContext, useReducer } from 'react';
import type { RawFileRecord, WizardConfig, ParsedFile } from '../types/file';
import { parseMeasurementFile } from '../domain/parsers/parse-file';
import { classify } from '../domain/parsers/classifier';
import { parseTabularFile } from '../domain/parsers/tabular';
import { adaptDisplayTracesToLegacyTraces } from '../domain/display-trace-adapter';

export interface WizardEntry {
  id: string;
  fileName: string;
  rawText: string;
  previewLines: readonly string[];
  suggestedConfig?: WizardConfig;
}

export interface FileState {
  files: RawFileRecord[];
  rawFileData: Record<string, string>;
  vis: Record<string, boolean>; // trace name -> visible boolean
  wizardQueue: WizardEntry[];
}

export type FileAction =
  | { type: 'QUEUE_WIZARD'; payload: { fileName: string; rawText: string; id: string } }
  | { type: 'RESOLVE_WIZARD'; payload: { id: string; config: WizardConfig } }
  | { type: 'RERUN_WIZARD'; payload: { fileId: string; fileName: string; previousConfig: WizardConfig } }
  | { type: 'SKIP_WIZARD'; payload: { id: string } }
  | { type: 'REMOVE_FILE'; payload: { fileId: string } }
  | { type: 'SET_DISPLAY_TRACE_HIDDEN'; payload: { fileId: string; displayTraceId: string; hidden: boolean } }
  | { type: 'SHOW_ALL_DISPLAY_TRACES'; payload: { fileId: string } }
  | { type: 'SET_VISIBILITY'; payload: { traceName: string; visible: boolean } }
  | { type: 'RESTORE_FILES'; payload: FileState }
  | { type: 'ADD_PARSED_FILE'; payload: { id: string; fileName: string; parsed: ParsedFile; text: string } };

const defaultState: FileState = {
  files: [],
  rawFileData: {},
  vis: {},
  wizardQueue: [],
};

const FileStateContext = createContext<FileState | null>(null);
const FileDispatchContext = createContext<React.Dispatch<FileAction> | null>(null);

function fileReducer(state: FileState, action: FileAction): FileState {
  switch (action.type) {
    case 'QUEUE_WIZARD': {
      const { id, fileName, rawText } = action.payload;
      
      const profile = classify(rawText, fileName);
      const parsed = parseMeasurementFile(rawText, fileName, profile);

      if (parsed.format === 'needs-import-wizard') {
        const wizardEntry: WizardEntry = {
          id,
          fileName,
          rawText,
          previewLines: parsed.previewLines ?? [],
          suggestedConfig: parsed.suggestedConfig,
        };
        return {
          ...state,
          wizardQueue: [...state.wizardQueue, wizardEntry],
        };
      } else {
        // It parsed smoothly right away
        const newRecord: RawFileRecord = {
          id,
          fileName,
          meta: parsed.meta,
          traces: parsed.traces,
          datasets: parsed.datasets,
          displayTraces: parsed.displayTraces,
          format: parsed.format,
          touchstoneNetwork: parsed.touchstoneNetwork,
        };
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
      const parsed = parseTabularFile(entry.rawText, entry.fileName, config);

      const newRecord: RawFileRecord = {
        id,
        fileName: entry.fileName,
        meta: parsed.meta,
        traces: parsed.traces,
        datasets: parsed.datasets,
        displayTraces: parsed.displayTraces,
        format: parsed.format,
        touchstoneNetwork: undefined, // Tabular doesn't have it
      };

      const newVis = { ...state.vis };
      parsed.traces.forEach(t => { newVis[t.name] = true; });

      const newQueue = [...state.wizardQueue];
      newQueue.splice(entryIdx, 1);

      return {
        ...state,
        files: [...state.files, newRecord],
        rawFileData: { ...state.rawFileData, [id]: entry.rawText },
        wizardQueue: newQueue,
        vis: newVis,
      };
    }
    case 'RERUN_WIZARD': {
      const { fileId, fileName, previousConfig } = action.payload;
      const text = state.rawFileData[fileId];
      if (!text) return state; // can't rerun without text

      const profile = classify(text, fileName);
      const testParse = parseMeasurementFile(text, fileName, profile);
      
      const newEntry: WizardEntry = {
        id: fileId,
        fileName,
        rawText: text,
        previewLines: testParse.previewLines ?? [],
        suggestedConfig: previousConfig || testParse.suggestedConfig,
      };

      // Also remove it from existing files
      const newFiles = state.files.filter(f => f.id !== fileId);

      return {
        ...state,
        files: newFiles,
        wizardQueue: [...state.wizardQueue, newEntry]
      };
    }
    case 'SKIP_WIZARD': {
      const newQueue = state.wizardQueue.filter(e => e.id !== action.payload.id);
      return { ...state, wizardQueue: newQueue };
    }
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
      const newRecord: RawFileRecord = {
        id,
        fileName,
        meta: parsed.meta,
        traces: parsed.traces,
        datasets: parsed.datasets,
        displayTraces: parsed.displayTraces,
        format: parsed.format,
        touchstoneNetwork: parsed.touchstoneNetwork,
      };
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
      return action.payload;
    }
    default:
      return state;
  }
}

export function FileStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(fileReducer, defaultState);

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
