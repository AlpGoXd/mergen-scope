import { afterEach, vi } from "vitest";

// Tests run in node by default; a test file that needs the DOM opts in with "// @vitest-environment jsdom".
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });

  window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
globalThis.URL.createObjectURL ??= vi.fn(() => "blob:mock-url");
globalThis.URL.revokeObjectURL ??= vi.fn();
