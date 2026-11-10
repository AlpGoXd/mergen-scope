# Redesign run state

Updated 2026-11-09 (Step 0). A fresh session resumes from this file plus `CLAUDE.md`, `spec-v3.md`, `plan.md`, `CHECKPOINT.md`, `deferred.md` and `referance/README.md` (spelling kept; boards 00–03 win over older boards; the written spec wins over any board).

## Roles, models and rules (updated 10 November)

Claude usage is scarce (user is on the $20 plan); Codex should be used fully.

| Role | Who | Use for |
|---|---|---|
| Orchestrator | Claude session | Planning, reviewing diffs, merging, CSS and presentational components from the boards, **running every gate** |
| Hard step | `opus` subagent | Only `ChartPane.tsx`, Smith rendering, workspace serialization, or a bug the orchestrator failed once; state why |
| Scout | `haiku` subagent | Finding files and call sites, read-only |
| Codex tasks | **`gpt-6.1-terra`** (effort medium by default, high for hard logic) | All Codex implementation, tests written from a spec, independent reviews |
| Tiny edits | `gpt-6-luna` | Only tiny, exact edits (a few lines, exact file and text given). Luna stalled twice and clobbered a file on this repo |

Codex rules:
- **Codex never runs tests** (the Windows Codex sandbox gives `spawn EPERM`). Codex may write test files; **Claude runs every gate** (typecheck, unit, e2e, build, static) in the worktree and on the integrated tree. "Tests pass" from Codex is never evidence.
- **Codex edits files in place and never rewrites a whole file** (no Set-Content / Out-File / full-file Write on an existing file; small targeted edits only). **Before accepting a Codex diff, check line counts** (`git diff --stat`, `wc -l` before/after): an unexpected large deletion means reject that file. Beware PowerShell encoding traps (never re-save a file through Get-Content/Set-Content).
- Pass briefs with `--prompt-file` (inline multi-line prompts get mangled). Include: goal, exact spec excerpt, board file, file allowlist, tests to write, "do not run tests", "do not restyle outside the allowlist".
- One writer per file; at most three Codex writers at once, in separate worktrees with non-overlapping allowlists; merge one branch at a time and run typecheck + unit after each merge. `ChartPane.tsx`, `Sidebar.tsx`, `App.tsx`, `index.css`, shared types and workspace serialization have one owner per step.
- When the main tree has uncommitted work, seed the worktree: create it from HEAD, apply the uncommitted diff, commit that seed on the worktree branch, and merge back only Terra's delta.
- Remove worktrees after merging: remove the `node_modules` junction with `rmdir` first, never recursively.

Budget rules: no Fable; at most one Claude subagent at a time; read only the files a step needs; reports at most 15 lines; one step per session, then write the next step here; on "usage is low", finish the step, update this file, stop. CSS and presentational components stay with Claude. UI method: presentation first (tokens, prop-only components, pattern `src/components/left-panel/`), then wiring as a separate task, then light/dark 2x screenshots beside the board with every difference fixed / deferred / intentional.

Ask the user before: adding a dependency (vector PDF needs a package/size/licence/font proposal), a product decision the spec does not answer, continuing after a gate fails twice, starting the next phase. Never push or deploy. Don't touch `.git` internals, `.claude/`, `.agents/` or the push-protection hook. Don't commit e2e-rewritten evidence under `docs/redesign/*-evidence/` or `dist/` unless the step means to.

## Durable facts kept from the earlier run state

- Dataset identity is independent of sample arrays (future live sources may update samples without replacing identity). This redesign adds no live-source behaviour.
- Push protections: `.claude/settings.local.json` denies push; the shared pre-push hook refuses without `ALLOW_PUSH=1`.
- Backups: `../mergen-scope-before-phase3.bundle` (history through Phase 2) and `../mergen-scope-before-phase3-docs.zip`.
- The user earlier reserved an independent top-model review for the Phase 5 Smith implementation; the current prompt assigns it to Codex `gpt-6.1-terra` against numerical fixtures.
- `ImportWizardModal.tsx` redesign belongs to Phase 7D.
- Many old worktrees exist (`git worktree list`); leave them unless the user asks for cleanup.

## Checkpoint (HEAD `3233771` = `origin/ts_refactor`, 2026-11-09)

The user pushed the merges of `codex/toolbar-pane-feedback`, `codex/line-crossings-fix` and `codex/phase5a-dots` plus the Ctrl+Z/Ctrl+Y-with-focus fix (`src/hooks/use-keyboard.ts`). Do not re-merge those branches. (The user quoted `39bdf58`; that object does not exist locally or on origin. `3233771` matches origin and the quoted counts.)

Gates on HEAD: typecheck pass; unit 277 passed + 4 todo (51 files); e2e 59 passed. Build/static not rerun on this head yet (run at the Step 1 checkpoint).

## Phase task status (HEAD `3233771`)

| Task | Status | Covering tests / note |
|---|---|---|
| 0 baseline | done | `baseline.md` evidence (no test) |
| 1A tokens, fonts | done | `theme.test.tsx`, static `cloudflare-pages.spec.ts`; contrast audit in 8 |
| 1B theme preference | done | `theme.test.tsx`, `aggregate-theme.test.tsx` |
| 2A shared controls | done | `shared-controls.test.tsx`, `shared-controls.spec.ts` (E2E-07 flaky, deferred) |
| 2B units/format | done | `engineering-units.test.ts`, `format-axis.test.ts`; callers deferred 4/5/7 |
| 2C toasts/messages | done | `shared-controls.test.tsx` (toast), `history-warning.test.ts` / `.spec.ts` |
| 3A contracts | done | `registry-contract.test.ts`, `domain.test.ts` |
| 3B pane model | done | `pane-placement`, `pane-membership` (+mounted), `pane-count`, `pane-limit` |
| 3C markers/lines | done | `marker-identity`, `left-kit-delta`, `aggregate-line-groups`, `ref-line-link` |
| 3D opening planner/registry | done | `open-files-plan`, `prepare-open-input`, `aggregate-opening` |
| 3E transaction history | done | `transaction-history`, `aggregate-workspace` (+mounted), `aggregate-wizard-history`, `opening-controller-mounted` |
| 3F workspace v5 | done | `workspace-v5.test.ts`, `workspace.test.ts`, e2e `workflows` save/reload |
| 4A sidebar sections | done | `phase4-sidebar.test.tsx` / `.spec.ts`, `sidebar-completion.spec.ts` |
| 4B file rows, matrix | partly (7D/7E/8) | `phase4-network`, `dark-matrix-2x`, `file-card-*`; tooltips, >8-port picker, progress, Fix open |
| 4C traces, colours, lines, crossings entry | mostly | `pane-menu-kit.spec`, `phase4-colors`, `left-kit-*`, `line-crossings.*`, `line-membership.*`; lines are single records with `paneIds[]` (LL-2); Show-in badges for lines wait for the lines kit; Replace/Edit columns/Rename/Drop/Demo unwired (7D/7E); chart colour adoption (5) |
| 5A header, target, per-pane settings | mostly | `pane-axis-feedback.spec` (header tint), `phase5a-dots.spec` (per-pane Sample dots in Show in menu); minor-grid toggle still shown (bug 15) |
| 5B shared rendering seam | not done | no test |
| 5C chart markers/lines/axes/cursor | not done | `format-axis` covers the formatter only |
| 5D layouts, dividers, drops | partly | pane removal keeps reference lines paneless, 8-pane experimental limit: `toolbar-pane-removal(.mounted).test`, `toolbar-pane-feedback.spec`; layout presets, dividers, swap, drop UI not done |
| 5E1 Smith numerical foundation | done | `phase5-smith-foundation.test.ts` |
| 5E2–5E4 Smith renderer, interactions, acceptance | not done | no test; legacy renderer active |
| 6A–6D export | not done | basic CSV export only (`workflows`, `gui-smoke`) |
| 7A top bar, strip | partly (7E) | `marker-toolbar-visual.spec.ts`; Open/Export/Layout wiring and responsive evidence open |
| 7B footer, help, settings | partly (7E) | no dedicated test; preference consumers, states, privacy open |
| 7C right panel, Analysis cards | not done | `analysis-more.test.ts` (math only) |
| 7D unified opening UI, wizard | partly | controller: `opening-controller-mounted`, `gui-smoke` wizard; UI not done |
| 7E integration | not done | no test |
| 8 consistency, adversarial review | not done | no test |

`deferred.md` has mojibake (em dashes, multiplication sign); fix it with a UTF-8-safe edit when it is next touched.

## Next step

Lines work is committed (`f11625a`, on top of `2019cec`, `5b3bf2b`, `4bc4179`; nothing pushed). **Analysis overhaul, Part A (plan only) is below; no code was changed.** The updated analysis kit (`docs/redesign/kit/analysis/`, modified, not committed) was read as text only; no image was opened. Awaiting the user's answers to "Decisions needed" and the OK to start Part B.

### Kit changes that matter (read from the updated README and types)

- Threshold crossings (manual level) and a line's "V1 crossings" share `CrossingsList`: grouped by pane (group header only with 2+ panes), each row = swatch · short trace name · **only the value that changes** (y for a V line; x for an H line or a threshold level). The constant goes in the card's source line ("V1 · 3.653 32 GHz"). Regular Mono, no bold. Footer: cap note and "Copy as CSV". The `current` row is highlighted on the chart.
- **A line's card has no "Manual threshold" button.** It is its own card instance (tool `crossings`, parameter `lineId`), separate from the manual Threshold crossings card (parameter `level`). The `LineCrossingsContext.lineId`, `setLineId` and the card's two-mode switch go away.
- Emphasised numbers use IBM Plex Sans 600 with tabular digits (JetBrains Mono ships only in 400 here); plain readouts stay Mono 400. Adding JetBrains Mono 600 (about 90 KB font file, no npm package) would need the user's approval; not needed with the kit as it is.
- The kit replaces `AnalysisFeatureCard`, `AnalysisMenuCard`, `MR`, the CSS in `analysis-card.css`, `CrossingsView`; it brings `AnalysisPanel`, `AnalysisEmpty`, `AnalysisCard` (collapse by header click or Enter, summary in the header when collapsed, `selected`), `KeyValues`, `Result`, `Params` (number with unit and `invalid`, select via `onOpen` popover, segmented), `CardMsg` (SC-3, optional action such as "Pick a trace"), `Busy`, `OutputRow` (swatch, name, pane badges, Live / Freeze), `CrossingsList`, `AddAnalysisMenu` (search, All / ƒ Math / Measure, Recent, A–Z, greyed items show their reason, ✓ for tools already open).

### 1. What the right panel holds today

Source: `src/components/layout/RightPanelStack.tsx`, `src/components/analysis/*`, `src/components/panels/*`, `src/stores/ui-store.tsx`, `src/stores/analysis-store.tsx`.

| # | Item | Where | What it does today |
|---|---|---|---|
| F1 | Panel frame | `RightPanelStack.tsx` | Header "Tools / Contextual tools and numeric results", four hard-coded-colour tab buttons (Analysis `#e48f77`, Trace Ops `#c786ec`, Import/Export `#71c59a`, Data `#ee6faa`), a gradient background, a "Open one or more tool groups above" placeholder. Visibility: `showRightPanel`; sections: `showAnalysisPanel`, `showTraceOps`, `showImportExportPanel`, `showDT` (Data is exclusive) in `ui-store`. |
| F2 | Panel openers | `TopBar.tsx`, `App.tsx` | Top-bar "Analysis" chip (toggles `showRightPanel`), a transitional "Right" button, and `App.listCrossings(lineId)` (opens the panel, shows Analysis, enables the crossings card, sets `crossingsLineId`). `LineCrossingsContext` (lineId, setLineId, listCrossings). |
| A0 | Analysis chooser | `AnalysisMenuCard.tsx` (we restyled it to a 32 px header + chip list) | "Analysis" · count · "+ Add analysis" toggling an always-visible list of 14 chips (the registry items). |
| A1 | Noise PSD | `NoisePSDCard.tsx`, `use-noise-psd.ts`, `domain/analysis/noise-psd.ts` | Pick trace and filter (ui `noiseFilter`, `noiseSource`), Compute, shows peak/avg/min density and RBW (`MR` rows), "Save" keeps results (`noiseResults`, `savedNoise`), list of saved results with remove. |
| A2 | IP3 / TOI | `IP3Card.tsx`, `use-ip3.ts`, `domain/analysis/ip3.ts` | Reads placed markers with IP3 roles (F1, F2, IM3L, IM3U; menu or auto-pick), gain field (ui `ip3Gain`), shows OIP3 values (`MR`), "Save" (`ip3Results`, `savedIP3`). |
| A3 | Peak Table | `PeakTableCard.tsx`, `domain/analysis/range-stats.ts` (`buildPeakSpurTable`) | Trace select (panes' traces, "Other pane" ones too), min spacing, Find Peaks, ranked table (Rank, freq, amp). `peakResults`. |
| A4 | Range Statistics | `RangeStatsCard.tsx` | Trace select, Compute Stats: max/min with frequency, average, span, sample count. `rangeStatsResults`. |
| A5 | 3 dB / 10 dB BW | `BandwidthHelperCard.tsx`, `domain/analysis/bandwidth.ts` | Trace select, drop dB, Compute: bandwidth, centre, left/right edge, reference. `bandwidthResults`. |
| A6 | Threshold Crossings | `shared/ThresholdCrossingsCard.tsx`, `domain/analysis/threshold.ts`, `crossing-rows.ts` | Two modes in one card: manual level on the selected trace, or (via a line's List…) that line's crossings per pane with a "Manual threshold" button. Local state only (threshold text), no store entry; `formatEng` rows (we added). |
| A7 | Ripple / Flatness | `RippleCard.tsx`, `domain/analysis/ripple.ts` | Trace select, Compute: peak-to-peak ripple, max/min amp, span. `rippleResults`. |
| A8 | Occupied Bandwidth | `OccupiedBandwidthCard.tsx` | Percent field; result bandwidth or the reason "Select a trace with power units (dBm or dBW)". No store entry. |
| A9 | Channel Power | `ChannelPowerCard.tsx`, `domain/analysis/channel-power.ts` | Bandwidth field; result dBm or "Select a trace with spectral density units (dBm/Hz or dBW/Hz)". No store entry. |
| A10 | VSWR | `touchstone/VSWRCard.tsx`, `touchstone-math.ts` | Min/max/average VSWR of the active Sii trace. |
| A11 | Return Loss | `touchstone/ReturnLossCard.tsx` | Min/max/average RL. |
| A12 | Group Delay | `touchstone/GroupDelayCard.tsx` | Min/max/average group delay. |
| A13 | Reciprocity / Isolation | `touchstone/ReciprocityIsolationCard.tsx` | Worst and average reciprocity error, worst isolation (2-port). |
| A14 | Touchstone Stability | `touchstone/StabilityCard.tsx` | Min K, min mu1, min mu2, unstable-point count (2-port). |
| T1 | Trace Ops card | `TraceOpsCard.tsx`, `use-trace-ops.ts`, `domain/trace-ops.ts` | One card, four collapsible forms, each makes a **derived trace once** (`operationType`, no live link today): Offset (dB), Scale (x), Smoothing (method incl. Savitzky–Golay, window), Trace Math (A, B, operation add / subtract / multiply / divide). Collapse state in ui `traceOpsOpenSections`. |
| I1 | Import / Export card | `panels/ImportExportPanel.tsx` | Four buttons and two hidden file inputs: Import Data Files, Load Workspace, Save Workspace, Export Visible CSV. |
| D1 | Data table panel | `panels/DataTablePanel.tsx` (48 lines) | Exclusive full-panel table of the active trace's samples (#, Freq, Amp). There is no Table pane component yet. |

State that rides along: `analysis-store` (`analysisOpenState` map by id, six result maps, none of which is saved except through the workspace's `analysisOpenState`, `savedNoise`, `savedIP3`); `ui-store` flags above plus `noiseFilter`, `noiseSource`, `ip3Gain`, `traceOpsOpenSections`; the legacy v4 workspace `ui` type still lists the `show*` flags (v5 ignores them).

### 2. Mapping: every item to a registry tool, a matrix view, or removal

Registry contract (`types/registry-contract.ts`, `domain/analysis/tool-contract.ts`, spec-v3 R5): `kind` math · measure · view, `meta`, `appliesTo(trace) -> ok | reason`, `params` (schema from which `Params` is generated), `compute(inputs, params)` pure and unit-tested, `outputs` (numbers · table · overlay · trace). "View" tools are not in the Add menu (they live in the matrix).

| Item | Decision | Kind / outputs | appliesTo and notes |
|---|---|---|---|
| A1 Noise PSD | **Registry tool** `noise-psd` | Measure: numbers (peak, avg, min density, RBW); optional overlay; ⋯ "Create trace" | spectrum traces; params filter, RBW source. "Save" and the saved-results list become card instances plus Create trace; `savedNoise` migrates to instances. |
| A2 IP3 / TOI | **Registry tool** `ip3` | Measure: numbers (OIP3, per-tone) | needs 4 role markers: otherwise `CardMsg` "Place F1, F2, IM3L, IM3U" with action; param gain. `savedIP3` migrates to instances. |
| A3 Peak Table | **Registry tool** `peak-table` | Measure: table (rank, x, y) | any trace; params min spacing, count; rows later can place markers. |
| A4 Range Statistics | **Registry tool** `range-stats` | Measure: numbers | any trace; over the visible X range (today whole trace; spec says "range": use the pane's visible range, decide in B). |
| A5 3 dB / 10 dB BW | **Registry tool** `bandwidth` | Measure: numbers + overlay (edges) | params drop (3, 10, custom), peak reference; one tool, two presets. |
| A6 Threshold Crossings | **Two uses of one tool** `crossings` | Measure: table (`CrossingsList`) | (a) manual: param `level` (with unit); (b) line: param `lineId`, opened only by a line's **List…** / context menu, title "V1 crossings", no Manual threshold button. Both are separate instances in the panel. |
| A7 Ripple / Flatness | **Registry tool** `ripple` | Measure: numbers | any trace. |
| A8 Occupied Bandwidth | **Registry tool** `occupied-bandwidth` | Measure: numbers | greyed in Add menu with the reason when the target has no power units. |
| A9 Channel Power | **Registry tool** `channel-power` | Measure: numbers | greyed with "needs density units (dBm/Hz or dBW/Hz)". |
| A10 VSWR | **Matrix view** (already a view in the matrix "More" menu) | view | **Remove the card.** Its min/max/average is obtained by running Range Statistics on the VSWR trace. |
| A11 Return Loss | **Matrix view** (exists) | view | Remove the card; same reasoning. |
| A12 Group Delay | **Matrix view** (exists) | view | Remove the card; same reasoning. |
| A13 Reciprocity / Isolation | **Registry tool** `reciprocity-isolation` | Measure: numbers | appliesTo 2-port network, reason otherwise. |
| A14 Touchstone Stability | **Registry tool** `stability` ("2-port stability: K, mu1, mu2, abs delta") | Measure: numbers (min K, min mu1, min mu2, unstable points; **abs delta is new**) | 2-port network. The K and mu curves stay available as matrix views; the tool gives the numbers. |
| T1 Offset | **Registry tool** `offset-scale` (Math) | Math: output trace ("-> name · offset 3 dB · P1") | one tool with offset and scale parameters (spec: "offset · scale"); replaces the Offset and Scale forms. |
| T1 Smoothing | **Registry tool** `smooth` (Math) | Math: output trace | params method (moving average, Savitzky–Golay…), window. |
| T1 Trace Math | **Registry tool** `trace-math` (Math) | Math: output trace | A and B traces, operation + − × ÷; unit compatibility reasons come from `appliesTo` (today the card just allows anything). |
| T1 collapse state | **Remove** (`traceOpsOpenSections`) | | each card collapses itself (`AnalysisCard`), as a preference. |
| I1 Import Data Files | **Remove from the panel**: it is the top bar's Open (unified opening path) | | needs no new work; the two hidden inputs and the `import-export-*` test ids go. |
| I1 Load Workspace | **Remove**: top bar Open (workspace JSON path exists) | | |
| I1 Save Workspace | **Remove**: top bar Save | | |
| I1 Export Visible CSV | **Remove from the panel after it has a new home**: the top bar's Export… (Phase 6B CSV); see decision 1 | | today the only way to export CSV. |
| D1 Data table | **Remove from the panel**: becomes the Table pane type (Phase 5D, "Table pane shares membership and cursor contracts") | | there is no Table pane yet; see decision 2. |
| F1 Frame, tabs, placeholder | **Remove** | | Right panel holds only Analysis (spec 5.5): `AnalysisPanel` header (32 px) with count and "+ Add analysis"; closed by default; adding an analysis or clicking the Analysis chip opens it; removing the last analysis or clicking the chip closes it. |
| F2 Openers | **Replace** | | the top-bar Analysis chip stays (opens or closes by the rule above); remove the transitional "Right" button; `listCrossings` becomes "add a `crossings` instance with `lineId`" (and opens the panel); `LineCrossingsContext` is deleted. |
| A0 chooser chips | **Replace by `AddAnalysisMenu`** | | search, All / Math / Measure, Recent, A–Z, reasons for greyed items, ✓ for open ones; items come from the registry (`kind` measure / math only, never view). |
| ui flags `showAnalysisPanel`, `showTraceOps`, `showImportExportPanel`, `showDT` | **Remove** | | `showRightPanel` stays as the single flag (derived from "has analyses and chip on"). |

Counts: 14 chooser items become 12 registry tools (+ crossings used twice) after three go to the matrix; Trace Ops (4 forms) becomes 3 Math tools; 2 panel cards (Import/Export, Data) and the frame are removed; 4 `ui` flags are removed.

### 3. Target structure (what Part B builds)

- **Instances, not an open-state map.** `analysis-store` holds an ordered list of analysis instances `{ id, toolId, params, source: traceId | lineId | null, collapsed, ... }` (several instances of one tool are allowed, e.g. two Range Statistics on two traces); results are computed (pure `compute`) and never stored in the store. Replaces `analysisOpenState`, the six result maps, `savedNoise`, `savedIP3`.
- **Registry**: `domain/analysis/registry.ts` (`ANALYSIS_ITEMS`, scopes) is replaced by `domain/analysis/tools/*.ts` (one module per tool, one registry line each) over the existing `tool-contract.ts`; unit tests per tool with independent arithmetic (existing tests for noise, IP3, range stats, bandwidth, ripple, threshold, channel power, touchstone math are reused, not rewritten).
- **UI**: the kit copied unchanged into `src/components/analysis/` (like the lines kit); one generic card renderer that maps `params`/`outputs` to `Params`, `KeyValues`, `Result`, `CrossingsList`, `OutputRow`, `CardMsg`, `Busy`; `AddAnalysisMenu` in the shared popover; the card ⋯ menu (Create trace, Copy results, Remove) in the shared popover; remove with Undo toast ("delete" kind of the toast policy).
- **Workspace v5**: replace `analysisOpenState`, `savedNoise`, `savedIP3` with `analyses[]`; migration maps open ids to instances (default params, source = the trace that was selected when saved, else none), saved noise/IP3 rows to instances with their parameters, drops views (vswr, return-loss, group-delay) with a note; reader still accepts the old shape; tests in `workspace-v5.test.ts` / a new migration test.
- **Files that change or go**: `RightPanelStack.tsx`, `AnalysisPanelStack.tsx`, `AnalysisMenuCard.tsx`, `AnalysisFeatureCard.tsx`, `analysis-card.css`, all 14 card files + `TraceOpsCard.tsx`, `CrossingsView.tsx`, `ImportExportPanel.tsx`, `DataTablePanel.tsx`, `shared/MR.tsx`, hooks `use-noise-psd`, `use-ip3`, `use-trace-ops`, `use-analysis-registry`, `use-analysis-target`, `use-touchstone-state` (re-check), `LineCrossingsContext` users (`App.tsx`, `ChartPane.tsx`, `Sidebar.tsx`), ui-store flags, `TopBar.tsx` ("Right"), tests that open the panel through the old tab (`tests/e2e/workflows.spec.ts` helper `openRightPanelSection`, `line-crossings.spec.ts`, `toasts` unaffected).

### 4. Proposed split (one owner per file; Claude runs every gate)

1. **B1, domain (Codex Terra, worktree)**: tool modules + registry + `appliesTo` reasons + instance reducer in the store + workspace migration with tests; no UI. Review: independent Terra review of the migration (as for lines).
2. **B2, presentation (Claude)**: copy the kit unchanged, panel frame (`AnalysisPanel`, `AnalysisEmpty`, header chip behaviour), generic card renderer, Add menu and card menu wiring in the shared popover; remove the old cards, tabs and flags; light/dark 2x screenshots of the integrated panel, with the difference list written from the kit's README and CSS (the kit's demo image is compared only if the user allows it).
3. **B3, wiring and cleanup (Codex Terra for the non-visual parts, Claude for `App.tsx` / `TopBar.tsx` / `ChartPane.tsx` edits)**: `listCrossings` -> instance, crossing-row highlight on the chart (`current`), Copy as CSV, Undo toasts, remove Import/Export and Data panels once decisions 1 and 2 are settled, update e2e helpers.
4. Gates after every step: typecheck, unit, e2e (full), build, static; `ChartPane.tsx` edits in small steps with e2e after each.

### Decisions (answered by the user, 10 November)

1. **Export…** in the top bar becomes "export visible CSV" (same function as today's card button, no dialog) until Phase 6; the Import/Export card goes in B2.
2. **Data tab removed** in B2 and recorded in `deferred.md`; **the Table pane becomes the first step of Phase 5** (before 5A work resumes).
3. **Math outputs are Live by default, with Freeze.** Freeze = stop recomputing; removing a Math card keeps its trace as an ordinary frozen trace.
4. **Range Statistics:** visible X range by default, with a visible / all choice.
5. **Stability tool gains |delta|.**
6. **Emphasised numbers:** IBM Plex Sans 600, tabular digits, no font file.

### Part B progress

- Kit update `docs/redesign/kit/analysis/` was committed by the user in `b7e90e9`.
- **B1 (domain and migration) is done in the main tree, uncommitted.** Gates: typecheck pass; unit 338 passed + 4 todo (63 files); e2e 87 passed; build pass; static 1 passed. Codex Terra (worktree `codex/analysis-domain`, medium effort; it stopped early after small edits twice, so the work ran as four `--resume-last` passes plus one fresh fix pass); Claude fixed one type error (`old.kind === 'derived'` narrowing) and one wrong test assumption. Independent Terra read-only review (high effort) found 6 confirmed issues: 4 fixed (unsaveable Math instance, recompute on unrelated changes, stale metadata after recompute, partial RESTORE clearing instances; each with a test) and 2 deliberately left: (a) the old UI and the new `analyses` can disagree until B2 switches the UI to instances; (b) saved noise/IP3 result values are not persisted (the writer never persisted them; instances recompute from params and markers).
- What B1 added (all behind the old UI, which still runs on `analysisOpenState`): `src/domain/analysis/tools/*` (15 tool modules) and `tool-registry.ts` (`ANALYSIS_TOOLS`, `getAnalysisTool`, `listAddableTools`), `AnalysisInstance` type and `instances.ts` (`createInstance`, `updateParams`, `computeInstance`, `recomputeLiveOutputs`, Math output creation), the `analyses` slice and actions in `analysis-store.tsx` (id allocator survives Undo and loads), live recompute and Math-output creation inside the aggregate reducer (same history entry), the `analyses` wire field with strict validation and the legacy-to-instances reader in `workspace-migrate-v5.ts` (writer writes both shapes; the new one wins on read), `DerivedTrace.analysisId`, and stability |delta|. Tests: `analysis-tools`, `analysis-registry`, `analysis-instances`, `analysis-migration`.
- Known limitations carried into B2: tool compute for `channel-power` uses only samples inside the band (no edge interpolation); `ip3` and `noise-psd` parameters are the minimum the old cards used (extend in B2 if the generated form needs more).
- B1's worktree was removed (junction first); branch `codex/analysis-domain` is kept as a backup until the user commits.
- **B2 (panel and kit, Claude) is next**, then B3 (wiring and cleanup); stop after each with a report and a test list.
