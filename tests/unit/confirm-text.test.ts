import { describe, expect, it } from 'vitest';
import { closePaneText, removeFileText, removeTraceText, replaceWorkspaceText, sameNameText } from '../../src/domain/confirm-text';

describe('confirmation wording', () => {
  it('replacing the workspace names what closes', () => {
    const text = replaceWorkspaceText({ files: 3, markers: 2, lines: 1, panes: 4, createdTraces: 0 }, 'demo.json');
    expect(text.title).toBe('Replace the current workspace?');
    expect(text.message).toBe("Opening demo.json closes the 3 open files and their traces, 2 markers, 1 line and the 4-pane layout. Anything you haven't saved is lost.");
    expect(text.confirmLabel).toBe('Replace');
    expect(replaceWorkspaceText({ files: 1, markers: 0, lines: 0, panes: 1, createdTraces: 0 }).message).toBe("Opening this workspace closes the open file and its traces. Anything you haven't saved is lost.");
  });
  it('a same-name file offers Replace and Add as a new file', () => {
    const text = sameNameText('lna_board_rev3.s2p', 'lna_board_rev3.s2p (2)');
    expect(text.title).toBe('lna_board_rev3.s2p is already open.');
    expect(text.confirmLabel).toBe('Replace');
    expect(text.secondaryLabel).toBe('Add as a new file');
    expect(text.message).toContain('markers on anything it no longer has are removed');
    expect(text.message).toContain('lna_board_rev3.s2p (2)');
  });
  it('removing a file or trace counts what goes with it', () => {
    expect(removeFileText('a.s2p', 3, 2).message).toBe('Its 3 traces and 2 markers are removed with it. You can undo this.');
    expect(removeFileText('a.dat', 1, 1).message).toBe('Its 1 trace and 1 marker are removed with it. You can undo this.');
    expect(removeFileText('a.dat', 0, 1).message).toBe('Its 1 marker is removed with it. You can undo this.');
    expect(removeFileText('a.dat', 1, 0).danger).toBe(true);
    expect(removeTraceText('S21 · dB', 2).message).toBe('Its 2 markers are removed with it. You can undo this.');
    expect(removeTraceText('S21 · dB', 1).title).toBe('Remove S21 · dB?');
  });
  it('closing a pane says nothing is deleted and what is hidden', () => {
    const text = closePaneText('Pane 2', ['S21 -> not in a pane'], 1, 3);
    expect(text.title).toBe('Close Pane 2?');
    expect(text.message).toBe('Nothing is deleted. 1 trace will not be in a pane until you place it again; its 3 markers stay hidden until then.');
    expect(text.details).toEqual(['S21 -> not in a pane']);
    expect(closePaneText('Pane 4', [], 2, 0, true).title).toBe('Remove the last pane (Pane 4)?');
    expect(closePaneText('Pane 4', [], 0, 0).message).toBe('Nothing is deleted. Some lines will not be in a pane until you place them again.');
  });
});
