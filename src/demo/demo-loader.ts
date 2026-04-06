// ============================================================================
// Mergen Scope — Demo Loader
// ============================================================================
// Fetch-based preset loader for demo data files.
// ============================================================================

import { parseMeasurementFile } from "../domain/parsers/parse-file.ts";
import type { ParsedFile } from "../types/file.ts";

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
