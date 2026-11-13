// ============================================================================
// Mergen Scope — Demo Loader
// ============================================================================
// Fetch-based preset loader for demo data files.
// ============================================================================

import { parseMeasurementFile } from "../domain/parsers/parse-file.ts";
import type { ParsedFile } from "../types/file.ts";
import bundledDemoWorkspace from "../../demo-assets/demo.json?raw";

// ---------------------------------------------------------------------------
// Preset metadata
// ---------------------------------------------------------------------------

/** A demo data preset. */
export interface DemoPreset {
  /** Unique preset identifier. */
  readonly id: string;

  /** Display title. */
  readonly title: string;

  /** Description of what the file demonstrates. */
  readonly description: string;

  /** Relative URL to the data file (from public/). */
  readonly url: string;

  /** Expected file format hint. */
  readonly format: string;
}

// ---------------------------------------------------------------------------
// Fetch + parse
// ---------------------------------------------------------------------------

/** Fetch a demo file from a URL and parse it. */
export async function loadDemoPreset(preset: DemoPreset): Promise<ParsedFile> {
  const response = await fetch(preset.url);
  if (!response.ok) {
    throw new Error(`Failed to load demo file "${preset.title}": ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const fileName = preset.url.split("/").pop() ?? preset.id;

  return parseMeasurementFile(text, fileName);
}

/** Fetch and parse multiple demo presets. */
export async function loadDemoPresets(
  presets: readonly DemoPreset[],
): Promise<ParsedFile[]> {
  const results: ParsedFile[] = [];
  for (const preset of presets) {
    const parsed = await loadDemoPreset(preset);
    results.push(parsed);
  }
  return results;
}

/** Fetch the saved demo workspace for the normal workspace import path. */
export async function loadDemoWorkspace(): Promise<string> {
  // The built app is also supported from file://, where fetch cannot read local files.
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return bundledDemoWorkspace;
  }

  const response = await fetch('./demo-assets/demo.json');
  if (!response.ok) throw new Error(`Demo request failed: ${response.status}`);
  return response.text();
}
