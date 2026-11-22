// Wording of the app's confirmation dialogs (stores/dialog-store.tsx). Pure: each says what will be lost.

import { formatFileSize } from './file-size-policy';

export interface ConfirmText {
  readonly title: string;
  readonly message: string;
  readonly details?: readonly string[];
  readonly confirmLabel: string;
  readonly secondaryLabel?: string;
  readonly danger?: boolean;
}

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
/** "3 traces, 2 markers and 1 line"; empty parts are left out. */
function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export interface WorkspaceCounts { readonly files: number; readonly markers: number; readonly lines: number; readonly panes: number; readonly createdTraces: number }

export function warnLargeFileText(fileName: string, bytes: number): ConfirmText {
  return {
    title: 'Open large file?',
    message: `${fileName} is ${formatFileSize(bytes)}. Large files can make the app slow. Open it anyway?`,
    confirmLabel: 'Open anyway',
  };
}

/** Opening a saved workspace over open work. */
export function replaceWorkspaceText(counts: WorkspaceCounts, workspaceName?: string): ConfirmText {
  const lost = list([
    counts.files === 1 ? 'the open file and its traces' : counts.files ? `the ${counts.files} open files and their traces` : '',
    counts.createdTraces ? count(counts.createdTraces, 'created trace') : '',
    counts.markers ? count(counts.markers, 'marker') : '',
    counts.lines ? count(counts.lines, 'line') : '',
    counts.panes > 1 ? `the ${counts.panes}-pane layout` : '',
  ].filter(Boolean));
  return {
    title: 'Replace the current workspace?',
    message: `${workspaceName ? `Opening ${workspaceName}` : 'Opening this workspace'} closes ${lost || 'the current workspace'}. Anything you haven't saved is lost.`,
    confirmLabel: 'Replace',
  };
}

/** A data file whose name is already open. */
export function sameNameText(fileName: string, copyName: string): ConfirmText {
  return {
    title: `${fileName} is already open.`,
    message: `Replace swaps in the new copy: its traces keep their colour, panes and markers where the new file has the same parameter or column, and markers on anything it no longer has are removed. Add as a new file keeps both and names the new one ${copyName}.`,
    confirmLabel: 'Replace',
    secondaryLabel: 'Add as a new file',
  };
}

/** Removing a file that made several traces or carries markers. */
export function removeFileText(fileName: string, traces: number, markers: number): ConfirmText {
  const lost = list([traces ? count(traces, 'trace') : '', markers ? count(markers, 'marker') : ''].filter(Boolean));
  return {
    title: `Remove ${fileName}?`,
    message: `${lost ? `Its ${lost} ${traces + markers === 1 ? 'is' : 'are'} removed with it.` : 'It is removed.'} You can undo this.`,
    confirmLabel: 'Remove file',
    danger: true,
  };
}

/** Removing a trace that has markers. */
export function removeTraceText(traceName: string, markers: number): ConfirmText {
  return {
    title: `Remove ${traceName}?`,
    message: `Its ${count(markers, 'marker')} ${markers === 1 ? 'is' : 'are'} removed with it. You can undo this.`,
    confirmLabel: 'Remove trace',
    danger: true,
  };
}

/** Closing a pane when traces or lines would be left without a pane. `markers` counts markers that would be hidden. */
export function closePaneText(paneName: string, moves: readonly string[], unplaced: number, markers: number, last = false): ConfirmText {
  const hidden = unplaced
    ? `${count(unplaced, 'trace')} will not be in a pane until you place ${unplaced === 1 ? 'it' : 'them'} again${markers ? `; ${unplaced === 1 ? 'its' : 'their'} ${count(markers, 'marker')} stay hidden until then` : ''}.`
    : 'Some lines will not be in a pane until you place them again.';
  return {
    title: last ? `Remove the last pane (${paneName})?` : `Close ${paneName}?`,
    message: `Nothing is deleted. ${hidden}`,
    details: moves,
    confirmLabel: last ? 'Remove pane' : 'Close pane',
  };
}
