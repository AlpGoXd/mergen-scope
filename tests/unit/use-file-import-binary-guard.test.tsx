// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { useFileImport } from '../../src/hooks/use-file-import';
import { useFileState } from '../../src/stores/file-store';
import { REFUSE_BYTES, WARN_BYTES, refuseLargeFileMessage } from '../../src/domain/file-size-policy';
import { warnLargeFileText } from '../../src/domain/confirm-text';

function harness() {
  return {
    open: useFileImport(),
    files: useFileState(),
  };
}

function makeMockBinaryFile(name: string, size: number, bytes?: ArrayBuffer) {
  const payload = bytes ?? new ArrayBuffer(64);
  const slice = vi.fn((start?: number, end?: number) => {
    const sliced = payload.slice(start ?? 0, end ?? payload.byteLength);
    return {
      arrayBuffer: vi.fn(async () => sliced),
    } as unknown as Blob;
  });
  const arrayBuffer = vi.fn(async () => payload);
  const text = vi.fn(async () => '');
  const file = {
    name,
    size,
    type: 'application/octet-stream',
    slice,
    arrayBuffer,
    text,
  } as unknown as File;
  return { file, slice, arrayBuffer, text };
}

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreRoot>{children}</StoreRoot>;

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useFileImport binary file-size guard (R6)', () => {
  it('refuses binary files over 500 MB without calling slice, arrayBuffer, or text', async () => {
    const { result } = renderHook(harness, { wrapper });
    const size = REFUSE_BYTES + 1;
    const mock = makeMockBinaryFile('huge_capture.cf32', size);

    await act(async () => {
      await result.current.open([mock.file]);
    });

    expect(mock.slice).not.toHaveBeenCalled();
    expect(mock.arrayBuffer).not.toHaveBeenCalled();
    expect(mock.text).not.toHaveBeenCalled();
    expect(result.current.files.wizardQueue).toHaveLength(0);
    expect(result.current.files.files).toHaveLength(0);
    expect(result.current.files.importErrors).toMatchObject([
      { fileName: 'huge_capture.cf32', message: refuseLargeFileMessage(size) },
    ]);
  });

  it('prompts on binary files over 50 MB and skips all reads when cancelled', async () => {
    const { result } = renderHook(harness, { wrapper });
    const size = WARN_BYTES + 1;
    const mock = makeMockBinaryFile('capture_60mb.trc', size);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.open([mock.file]);
    });

    const expectedWarn = warnLargeFileText('capture_60mb.trc', size);
    expect(await screen.findByRole('dialog', { name: expectedWarn.title })).toBeInTheDocument();
    expect(screen.getByTestId('app-dialog-body')).toHaveTextContent(expectedWarn.message);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await pending;
    });

    expect(mock.slice).not.toHaveBeenCalled();
    expect(mock.arrayBuffer).not.toHaveBeenCalled();
    expect(mock.text).not.toHaveBeenCalled();
    expect(result.current.files.wizardQueue).toHaveLength(0);
    expect(result.current.files.files).toHaveLength(0);
  });

  it('reads and queues binary wizard when >50 MB warning is confirmed', async () => {
    const { result } = renderHook(harness, { wrapper });
    const size = WARN_BYTES + 1;
    const cf32 = new ArrayBuffer(64);
    const mock = makeMockBinaryFile('capture_warn.cf32', size, cf32);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.open([mock.file]);
    });

    const expectedWarn = warnLargeFileText('capture_warn.cf32', size);
    expect(await screen.findByRole('dialog', { name: expectedWarn.title })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: expectedWarn.confirmLabel }));
      await pending;
    });

    expect(mock.slice).toHaveBeenCalledTimes(1);
    expect(mock.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(mock.text).not.toHaveBeenCalled();
    expect(result.current.files.wizardQueue).toHaveLength(1);
    expect(result.current.files.wizardQueue[0]?.fileName).toBe('capture_warn.cf32');
    expect(result.current.files.wizardQueue[0]?.rawBinary).toBe(cf32);
  });

  it('retains import error for refused binary file in a mixed batch while still queueing valid binary file', async () => {
    const { result } = renderHook(harness, { wrapper });
    const refusedSize = REFUSE_BYTES + 1024;
    const refused = makeMockBinaryFile('refused.bin', refusedSize);
    const valid = makeMockBinaryFile('valid.cf32', 64, new ArrayBuffer(64));

    await act(async () => {
      await result.current.open([refused.file, valid.file]);
    });

    expect(refused.slice).not.toHaveBeenCalled();
    expect(refused.arrayBuffer).not.toHaveBeenCalled();
    expect(refused.text).not.toHaveBeenCalled();
    expect(valid.slice).toHaveBeenCalledTimes(1);
    expect(valid.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(result.current.files.importErrors).toMatchObject([
      { fileName: 'refused.bin', message: refuseLargeFileMessage(refusedSize) },
    ]);
    expect(result.current.files.wizardQueue).toHaveLength(1);
    expect(result.current.files.wizardQueue[0]?.fileName).toBe('valid.cf32');
  });
});
