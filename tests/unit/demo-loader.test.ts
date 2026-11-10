import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDemoWorkspace } from '../../src/demo/demo-loader';

afterEach(() => vi.unstubAllGlobals());
describe('loadDemoWorkspace', () => {
  it('returns the workspace text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '{"version":5}' });
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadDemoWorkspace()).resolves.toBe('{"version":5}');
    expect(fetchMock).toHaveBeenCalledWith('./demo-assets/demo.json');
  });
  it('rejects failed responses and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 404 }).mockRejectedValueOnce(new Error('offline')));
    await expect(loadDemoWorkspace()).rejects.toThrow();
    await expect(loadDemoWorkspace()).rejects.toThrow('offline');
  });
});
