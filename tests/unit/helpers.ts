import type { Trace } from "../../src/types/trace";

export function makeTestTrace(overrides: Partial<Trace> = {}): Trace {
  const name = overrides.name ?? overrides.id ?? "trace-a";
  return {
    id: name,
    kind: "raw",
    sourceTraceIds: [name],
    operationType: null,
    parameters: null,
    units: { x: "Hz", y: "dBm" },
    paneId: null,
    name,
    mode: "",
    detector: "",
    family: "spectrum",
    domain: "frequency",
    data: [
      { freq: 0, amp: 0 },
      { freq: 10, amp: 10 },
      { freq: 20, amp: 0 },
    ],
    file: "fixture.dat",
    dn: name,
    isUniform: true,
    ...overrides,
  } as Trace;
}
