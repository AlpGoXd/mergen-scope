import { useCallback } from 'react';
import { useAggregateWorkspace, snapshotFromWorkspace } from '../stores/aggregate-workspace-store';
import { useFileImport } from './use-file-import';
import { syncParserFileCounter } from '../domain/parsers/rs-dat';
import { syncTraceIdCounter } from '../domain/trace-model';
import type { WorkspaceSnapshotV5 } from '../types/workspace-v5';

/** Portable workspace operations backed by the aggregate transaction reducer. */
export function useWorkspaceV5() {
  const {state,dispatch} = useAggregateWorkspace(); const importFiles = useFileImport();
  const getSnapshot = useCallback(() => snapshotFromWorkspace(state),[state]);
  const restore = useCallback((snapshot: WorkspaceSnapshotV5, legacy = false) => {
    const traces = [...snapshot.files.flatMap(file => file.traces),...snapshot.derivedTraces];
    syncTraceIdCounter(traces);
    syncParserFileCounter(traces.reduce((max,trace) => {const suffix=Number(/_(\d+)$/.exec(trace.name)?.[1]);return Number.isFinite(suffix) ? Math.max(max,suffix) : max},0));
    dispatch({slice:'load',snapshot,legacy});
  },[dispatch]);
  const downloadWorkspace = useCallback((name?: string) => {
    const snapshot=getSnapshot(); if (!snapshot) return;
    const json=JSON.stringify({kind:'mergen-scope-workspace',version:5,app:'mergen-scope',exportedAt:new Date().toISOString(),snapshot});
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const anchor=document.createElement('a'); anchor.href=url; anchor.download=`${name || 'mergen-workspace'}.json`; anchor.click(); URL.revokeObjectURL(url);
  },[getSnapshot]);
  const loadFromFile = useCallback((file: File) => importFiles([file], undefined, true), [importFiles]);
  return {getSnapshot,restore,downloadWorkspace,loadFromFile};
}
