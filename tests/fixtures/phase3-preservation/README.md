# Phase 3 preservation fixtures

These are synthetic, hand-authored JSON fixtures for review and later migration tests. They contain no customer or instrument data. The files are standalone inputs; no v5 expected-output fixture is included until the final v5 wire schema is implemented and reviewed.

## Files

- workspace-v4-legacy-golden.json is the supported-shape v4 preservation input. It has two imported files (one frequency file with two traces and one time file), nonsequential pane IDs (pane-a, pane-k, pane-z), scalar assignments for both domains plus a time trace pointing to a nonexistent pane, a normal marker and delta referring by legacy index, and a legacy grouped V line mirrored only across two Hz panes, global showDots, and legacy theme: glass.
- workspace-v4-live-legacy.json is a genuine v4 export saved through the pre-redesign application at commit `31724ef`. It was created from the repository's `cascaded chain.s2p` and `test_osc_waveform.csv` sample files and contains two imported files, frequency and time traces in two panes, two markers, and pane settings. It verifies migration from the old app's actual export envelope and generated IDs.
- workspace-v4-eight-pane-extension.json is a deliberately out-of-range v4 stress extension, not a claim that the old app supported eight panes. It keeps the v4-shaped envelope while setting eight raw pane records and paneMode: 8, exercising preservation before the old four-pane normalizer can clamp/truncate it.
- workspace-v4-malformed-shape.json is syntactically valid JSON with invalid v4 field shapes and invalid legacy references. It should be rejected before workspace mutation.
- workspace-future-version.json is a minimal syntactically valid future-version snapshot. It should be rejected before workspace mutation.

## Preservation expectations to assert

1. Migrate the golden v4 input to v5 without losing file, trace, raw measurement point, or pane identity; valid scalar assignments become singleton memberships, the invalid time-pane reference is filtered without cross-unit reassignment, and that trace remains explicitly unplaced even though a compatible time pane exists.
2. Keep pane-a, pane-k, and pane-z as stable IDs and preserve visual order; map marker index references to stable marker identity. The delta retains its own absolute requested/resolved coordinate through migration.
3. Copy the legacy global sample-dot setting into each migrated pane setting. Treat theme: glass as ignored legacy workspace appearance data; it must not override current browser theme preference.
4. Preserve the old grouped line's values and relationship while mapping its members to actual surviving pane IDs. The two Hz panes retain their V-line group; the separate time pane must not be linked into it.
5. The v4 files do not contain raw file text, a saved wizard configuration, or matrix-open state. Do not invent these fields as historically supported v4 data; test raw-source and actual wizard/matrix preservation separately using current runtime state and a real v5 fixture after its schema is finalized.
6. The eight-pane extension must be preserved without truncation when loaded under preference-off, while the local preference itself stays outside the workspace. Keep this distinct from the supported historical golden.
7. Reject malformed/future-version inputs atomically; leave an existing workspace untouched.
