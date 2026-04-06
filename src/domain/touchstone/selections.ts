import type { RawFileRecord } from "../../types/file.ts";
import type { RawTrace, Trace } from "../../types/trace.ts";
import type { 
  TouchstoneSelectionState, 
  TouchstoneFamily,
  TouchstoneView,
  NetworkSource
} from "../../types/touchstone.ts";
import { 
  convertSMatrixToYMatrix, 
  convertSMatrixToZMatrix, 
  computeTwoPortStability 
} from "../touchstone-math.ts";
import { 
  makeTraceId, 
  makeTouchstoneTraceName, 
  makeTouchstoneTraceLabel 
} from "../trace-model.ts";
import { normalizeTraceData } from "../trace-math.ts";

/** Default selection state for a new Touchstone file. */
export function makeDefaultTouchstoneState(file: RawFileRecord): TouchstoneSelectionState {
  const portCount = file.touchstoneNetwork?.portCount ?? 0;
  const selectedCellsByFamily: Record<TouchstoneFamily, Record<string, TouchstoneView[]>> = { 
    S: {}, Y: {}, Z: {} 
  };
  
  if (portCount === 1) {
    selectedCellsByFamily.S["1:1"] = ["dB"];
  } else if (portCount === 2) {
    selectedCellsByFamily.S["1:1"] = ["dB"];
    selectedCellsByFamily.S["2:1"] = ["dB"];
  } else if (portCount > 2) {
    for (let i = 1; i <= portCount; i++) {
      selectedCellsByFamily.S[`${i}:${i}`] = ["dB"];
    }
  }

  return {
    activeFamily: "S",
    isExpanded: true,
    activeViewByFamily: { S: "dB", Y: "Mag", Z: "Mag" },
    selectedCellsByFamily
  };
}

/** Clone a Touchstone selection state object. */
export function cloneTouchstoneSelectionState(state: TouchstoneSelectionState): TouchstoneSelectionState {
  const next = { ...state };
  
  function cloneFamilySelections(source: Record<string, TouchstoneView[]>): Record<string, TouchstoneView[]> {
    const result: Record<string, TouchstoneView[]> = {};
    Object.keys(source || {}).forEach(key => {
      result[key] = [...(source[key] || [])];
    });
    return result;
  }

  next.activeViewByFamily = { ...next.activeViewByFamily };
  next.selectedCellsByFamily = {
    S: cloneFamilySelections(state.selectedCellsByFamily.S),
    Y: cloneFamilySelections(state.selectedCellsByFamily.Y),
    Z: cloneFamilySelections(state.selectedCellsByFamily.Z),
  };
  return next;
}

/** Build a network source metadata object for a trace. */
function buildTouchstoneTraceNetworkSource(
  file: RawFileRecord, 
  family: string, 
  row: number | null, 
  col: number | null, 
  view: string,
  metric: string | null = null
): NetworkSource {
  const network = file.touchstoneNetwork;
  return {
    parentFileId: file.id,
    family: family.toUpperCase(),
    view,
    row,
    col,
    metric: metric || undefined,
    fileName: file.fileName,
    portCount: network?.portCount,
    parameterType: network?.parameterType,
    referenceOhms: network?.referenceOhms ? [...network.referenceOhms] : undefined,
    freqUnit: network?.freqUnit,
    dataFormat: network?.dataFormat
  };
}

/** 
 * Create or update a Trace object from specific Touchstone cell selections.
 * Ported from app-hooks.js.
 */
export function materializeTouchstoneTrace(
  file: RawFileRecord, 
  family: string, 
  row: number, 
  col: number, 
  view: string,
  existingTrace?: Trace | null
): RawTrace | null {
  const network = file.touchstoneNetwork;
  if (!network || !network.samples) return null;

  const rowIndex = row - 1;
  const colIndex = col - 1;
  const fam = family.toUpperCase();

  const data = network.samples.map(sample => {
    let matrix = sample.sMatrix;
    if (fam === "Y") matrix = convertSMatrixToYMatrix(sample.sMatrix, network.referenceOhms || 50) as any;
    else if (fam === "Z") matrix = convertSMatrixToZMatrix(sample.sMatrix, network.referenceOhms || 50) as any;
    
    const rowObj = matrix?.[rowIndex];
    const cell = rowObj?.[colIndex];
    if (!cell) return null;

    let amp = 0;
    const mag = Math.hypot(cell.re, cell.im);
    
    if (view === "Phase") amp = Math.atan2(cell.im, cell.re) * 180 / Math.PI;
    else if (view === "Real") amp = cell.re;
    else if (view === "Imag") amp = cell.im;
    else if (view === "Mag") amp = mag;
    else if (view === "dB") amp = mag > 0 ? 20 * Math.log10(mag) : -300;
    else amp = mag;

    return { freq: sample.freq, amp };
  }).filter((p): p is { freq: number; amp: number } => p !== null && isFinite(p.freq) && isFinite(p.amp));

  if (!data.length) return null;

  const yUnit = view === "Phase" ? "deg" : (fam === "S" ? (view === "dB" ? "dB" : "") : (fam === "Y" ? "S" : "Ohm"));

  const id = existingTrace?.id || makeTraceId();
  return {
    id,
    kind: "raw",
    sourceTraceIds: [id],
    operationType: null,
    parameters: null,
    paneId: existingTrace?.paneId ?? null,
    mode: existingTrace?.mode ?? "",
    detector: existingTrace?.detector ?? "",
    file: file.fileName,
    fileName: file.fileName,
    fileId: file.id,
    domain: "frequency",
    units: { x: network.freqUnit || "Hz", y: yUnit },
    name: makeTouchstoneTraceName(file.fileName, fam, row, col, view),
    dn: makeTouchstoneTraceLabel(file.fileName, fam, row, col, view),
    data: normalizeTraceData(data),
    networkSource: buildTouchstoneTraceNetworkSource(file, fam, row, col, view)
  };
}

/** Reconcile traces for a Touchstone file based on selections. */
export function reconcileTouchstoneFileSelections(
  file: RawFileRecord, 
  selectionState: TouchstoneSelectionState
): RawFileRecord {
  const nextTraces: Trace[] = [];
  const existingTraces = file.traces || [];
  
  // Keep non-touchstone traces or stability traces if they exist
  const otherTraces = existingTraces.filter(tr => {
    const src = (tr as RawTrace).networkSource;
    return !src || src.parentFileId !== file.id || src.metric;
  });
  nextTraces.push(...otherTraces);

  const families: TouchstoneFamily[] = ["S", "Y", "Z"];
  families.forEach(fam => {
    const familyCells = selectionState.selectedCellsByFamily[fam] || {};
    Object.keys(familyCells).forEach(key => {
      const [rStr, cStr] = key.split(":");
      const row = parseInt(rStr || "1");
      const col = parseInt(cStr || "1");
      const views = familyCells[key] || [];
      
      views.forEach((view: TouchstoneView) => {
        const existing = existingTraces.find(tr => {
          const src = (tr as RawTrace).networkSource;
          return src && src.family === fam && src.row === row && src.col === col && src.view === view;
        });
        const materialized = materializeTouchstoneTrace(file, fam, row, col, view, existing);
        if (materialized) nextTraces.push(materialized);
      });
    });
  });

  return {
    ...file,
    traces: nextTraces
  };
}

/** Build a stability factor trace (K, mu1, mu2, etc.). */
export function buildTouchstoneStabilityTrace(
  file: RawFileRecord, 
  metric: string, 
  existingTrace?: Trace | null
): RawTrace | null {
  const network = file.touchstoneNetwork;
  if (!network || network.portCount !== 2 || !network.samples) return null;

  const data = network.samples.map(sample => {
    const result = computeTwoPortStability(sample.sMatrix);
    if (!result) return null;
    
    let amp = 0;
    if (metric === "k") amp = result.kFactor;
    else if (metric === "mu1") amp = result.mu1;
    else if (metric === "mu2") amp = result.mu2;
    else if (metric === "deltaMag") amp = result.deltaAbs;
    else return null;

    return { freq: sample.freq, amp };
  }).filter((p): p is { freq: number; amp: number } => p !== null && isFinite(p.freq) && isFinite(p.amp));

  if (!data.length) return null;

  const id = existingTrace?.id || makeTraceId();
  const labels: Record<string, string> = { k: "K", mu1: "mu1", mu2: "mu2", deltaMag: "|delta|" };
  
  return {
    id,
    kind: "raw",
    sourceTraceIds: [id],
    operationType: null, // "touchstone-stability" as OperationType in future?
    parameters: { metric },
    paneId: existingTrace?.paneId ?? null,
    mode: "",
    detector: "",
    file: file.fileName,
    fileName: file.fileName,
    fileId: file.id,
    domain: "frequency",
    units: { x: network.freqUnit || "Hz", y: "" },
    name: makeTouchstoneTraceName(file.fileName, "STAB", 0, 0, metric),
    dn: `${getFileBaseName(file.fileName)} ${labels[metric] || metric}`,
    data: normalizeTraceData(data),
    networkSource: buildTouchstoneTraceNetworkSource(file, "stability", null, null, metric, metric)
  };
}

// Helper to match JS implementation
function getFileBaseName(fileName: string | null | undefined): string {
  const name = String(fileName ?? "").replace(/^.*[\\/]/, "");
  return name.replace(/\.[^.]+$/, "") || name || "touchstone";
}
