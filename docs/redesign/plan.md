# Mergen Scope redesign execution plan

Planning date: 2026-11-08. Repository: `ts_refactor`, HEAD `31724ef` (`before redesign`); working tree clean before these planning documents were added.

Source of product requirements: [spec-v2.md](spec-v2.md), copied verbatim from the user's 7 Nov orchestrator prompt. This plan decomposes that specification; it does not replace its visual details. Landing page, logo, Polar/IQ work and command palette remain out of scope.

Status: Phase 1 complete at an uncommitted checkpoint. Independent main verification passed all five gates; see [phase1.md](phase1.md) and the [verification log](phase1-verification-artifacts/independent-main-gates-2026-11-08.md). Phase 0 baseline evidence and its checksums remain pinned to c030; this plan status update changes only the plan document.

## Decisions and working rules

- Root Sol orchestrates, integrates, and reviews code without product implementation. Terra handles complex implementation and review; Luna handles bounded tasks and tests. Select the intended model explicitly. Report the model that actually ran; disclose any substitution instead of silently falling back.
- User approved **committed offline font files with licence notices**, without new font npm dependencies. Phase 1 acquires IBM Plex Sans 400/600/700 and JetBrains Mono 400 from their upstream distributions and verifies licensing. Verify fonts are embedded into the production app rather than fetched at runtime. A paper serif font remains a separate export decision.
- User correction after the initial plan: **rewrite the Smith renderer rather than preserve its current visual implementation**. The existing renderer is not the quality baseline. Retain pure RF/coordinate calculations only where independently validated; rebuild presentation and interaction to the specification. This is an update to the implementation plan, not a start of implementation.
- Follow `CLAUDE.md`: strict TypeScript, no `any`, relative imports, React-free domain/types, existing reducer/provider architecture, no dependency without approval. The supplied redesign specification supersedes its older restriction on Codex visual implementation.
- Never push or deploy. Commit only when the user explicitly asks. At each completed phase, report evidence and ask whether to commit, as the supplied prompt requests. Do not auto-advance through the phase checkpoint.
- Each coding agent works in its own `../mergen-scope-codex-<task>` worktree on `codex/<task>`, with that worktree as its working directory. Read-only planning/review may use the integration tree. Exactly one writer owns each file, including shared types, tests, styles and package files.
- The coordinator reviews a task's diff and assigns an independent Terra or Luna verifier to rerun required checks on the integrated result, then reviews the evidence. Agent test reports alone do not pass a gate.
- Local integration must work without assuming permission to commit: transfer a reviewed, binary-safe snapshot with an explicit allowlisted manifest covering tracked changes, untracked additions, binary assets and deletions. Plain `git diff` is insufficient. Record file hashes and compare the post-task tree against the seeded baseline; do not stage user files or sweep secret/ignored files into the snapshot. If previous phases are uncommitted, seed new worktrees with this accepted integration snapshot before the task starts and return only the task delta. Do not assume a new worktree based on HEAD includes accepted uncommitted work.
- Preserve user changes. Build output in tracked `dist/` must be recorded but never hand-edited, staged or committed without the user's instruction. Never inspect `.env*`, auth files or tokens.

## Findings that change the task breakdown

1. Phase 3 is not safely parallelizable by store. `PaneStoreProvider` consumes TraceStore and cleans RefLineStore; `src/hooks/use-workspace.ts` restores multiple stores. `App.tsx`, chart, analysis and trace hooks assume scalar assignments with a fallback to `pane-1`. Widening one map type without changing reconciliation and consumers would silently replace intentionally unplaced traces.
2. Reuse the existing analysis math, `domain/analysis/registry.ts`, `domain/format.ts` and file classification where suitable. Smith is a deliberate exception: replace its renderer/grid and adapt its pane wrapper rather than incrementally preserving its visuals. Current `SmithChart.tsx` hard-codes a 100-unit viewBox, clips all series to the unit circle, uses index-based colors and draws endpoint indicators only for the first trace; `SmithGrid.tsx` has no numerical labels and hard-coded RGBA styles. Existing `domain/smith-coords.ts` is a small fixed mapping, not a complete reusable interactive rendering model. Validate useful pure math independently and replace unsuitable helpers with viewport-aware equivalents.
3. `Sidebar.tsx` contains live local row implementations as well as similarly named files in `components/sidebar/`. Establish actual import/use paths before assigning work; filename similarity does not establish ownership or reuse.
4. `tests/unit/pane-count.test.ts` explicitly expects the wrong cross-domain fallback. Replace that expectation with the new preservation rule; do not retain it as desired behavior.
5. Some source-prompt bug descriptions are stale: the outer Mergen wordmark still uses `--tr0` while Scope already uses `--accent`, and `buildReimportConfig` does not exist. Edit columns requires a real persisted wizard-settings path, not a patch to the named nonexistent function.
6. Export currently has basic CSV helpers and Smith DOM serialization. Target-size rendering, multi-pane composition and physical print sizing require a deliberate shared rendering seam before Phase 6.

## Proposed interpretations to ratify before affected tasks

These are planning recommendations, not additional approved product requirements. Put the relevant choice in each task brief before implementation.

| Conflict or gap | Proposed interpretation / decision point |
| --- | --- |
| General rule says only dashed grid/reference lines, while specific features add grid choices, ghosts, delta brackets, Smith Y grid, dashed unplaced rows and optional trace styles | Solid source/derived traces and `3 3` grid are defaults. Permit only explicitly specified feature exceptions and user-selected accessibility styles. Print dash patterns apply only to export. |
| Global pane min height 160 versus layout minimum 160 × 120 | Use 160 px minimum height and 160 px minimum width as the conservative planning assumption; resolve the 120 px height discrepancy before layout work. Do not invent an emergency floor. |
| General pane-removal confirmation versus §5.4 automatic relocation | Specific removal rule wins: no dialog for an empty pane or complete compatible relocation; a partial/unplaced outcome gets a preview dialog. Preserve all traces and markers; Undo is one action. |
| Smith says Sii only in drop text, but explicitly accepts converted Z11/Y11 | Use the detailed capability rule: Sii plus the specified valid Z11/Y11 conversions using file Z0; reject transmission/non-complex data with a reason. |
| Workspace has 5–8 panes while local experimental preference is off | Preserve all loaded panes and keep the local preference unchanged. Proposed behavior: show the existing panes, explain the limit and disable further additions until the user enables the preference or reduces the count. Never truncate a workspace. |
| Pane names follow position, but rename exists | Stable internal pane IDs; positional P# badges follow layout order, custom titles remain attached to the pane. Default titles regenerate from position. |
| Pane removal signature does not expose membership/type context | Keep one pure planner, but define typed input records containing membership, pane type and X unit. Deterministic nearest order follows visual pane order, preferring the previous compatible pane before the next. |
| Recognized numeric CSV may bypass wizard, but the high-confidence examples only name R&S/Touchstone | Reuse and test content classification; only a validated unambiguous layout bypasses the wizard, with up to eight numeric Y columns. All ambiguous inputs use the wizard. |
| Analysis registry includes `view`, but Analysis menu excludes views | Registry capability may describe views; Analysis menu enumerates only Math/Measure. Matrix owns network views; Smith is a pane type. |
| Paper default is serif, but specified offline fonts are sans/mono | Choose a licensed committed serif font before paper export is called complete. Do not claim embedded-font fidelity using an unspecified system font. |
| TikZ offers zipped `.dat` files while no export dependency is assumed | Confirm a small dependency-free ZIP approach is acceptable and practical. Otherwise request dependency approval or record that packaging option as pending; inline TikZ remains independently deliverable. |
| Vector PDF requires a new dependency | Prepare a concrete dependency/size/licence/vector-font feasibility proposal in Phase 6, then request approval before installation. PDF stays pending until approved and verified. |

## Delivery sequence

Keep the source's Phase 0–8 order. Lettered tasks are integration gates within a phase, not permission to skip ahead. Each brief embeds the exact applicable specification excerpt and an explicit allowlist of files.

### Phase 0 — baseline and traceability (coordinator)

1. Record branch, HEAD, status, worktrees, Node/npm and installed Playwright browser versions. Check that ports 5173/4173 refer to this checkout; configs reuse servers locally, so avoid testing a stale server.
2. Run and log `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`, then `npm run build` followed by `npm run test:static`. Record exit codes, output, durations and the pre/post build status. Continue collecting independent baseline results after a failure where meaningful; static tests require a successful build.
3. Capture current demo light/dark screenshots at 1440 × 900 and 1024 × 640, plus empty-app screenshots. Use `app.html`; keep the landing page out of redesign scope.
4. Verify the static bug ledger below against runtime behavior, and identify the existing regression expectations that must change.
5. Store command logs, screenshot paths and known failures in `docs/redesign/baseline.md` or linked artifacts. Record failure causes separately from harness/port issues. Do not label a failure pre-existing without executing the baseline.

Exit: baseline report with evidence, no redesign changes, phase checkpoint.

### Phase 1 — tokens, type and offline fonts

- **1A, one style owner:** `src/index.css`, font assets/notices and any required build asset wiring. Implement exact light/dark OKLCH tokens, semantic roles, spacing/density, type scale, focus, reduced motion and global sizing. Keep temporary compatibility aliases for old consumers; remove them as consumers migrate.
- **1B, sequential theme integration:** `src/hooks/use-theme.ts`, relevant theme/UI contracts and minimal consumers. Distinguish preference `system/light/dark` from resolved light/dark appearance; OS changes must not overwrite a manual override. Remove glass UI while maintaining legacy workspace-read compatibility until Phase 3 migration removes obsolete serialized preferences.
- Keep layout unchanged. Move component-specific visual corrections to explicit small owner patches in this phase if required by the source; run e2e immediately for each `ChartPane.tsx` edit. Do not promise all hard-coded component colors are gone from CSS changes alone.
- Recharts Line/Tooltip already disable animation: retain and audit all paths rather than blindly rewriting them.

Exit: exact tokens/fonts work in the built offline app; light/dark screenshots; typecheck, unit, e2e, build/static. No new npm dependency.

### Phase 2 — shared controls, feedback and units

- **2A:** `components/shared/*` and the smallest supporting UI code: five button roles, chip, segmented control, select, split button, menu/popover, tooltip, dialog and line icons. Disabled native controls need a focusable/hoverable wrapper so a reason remains accessible. Dialog Enter behavior respects focused controls and one primary action.
- **2B, parallel pure-domain owner:** `domain/units.ts`, `domain/format.ts` and formatting tests. Consolidate existing engineering formatting and Sidebar's input parser into one implementation; cover accepted unit syntax, malformed/nonfinite inputs, minus/grouping, step precision and prefix boundaries. Caller adaptations have a separate owner.
- **2C, Terra integration owner under coordinator review:** dark toasts, pause-on-hover, persistent errors, message bars and typed Undo callback. Feedback infrastructure lands now; cross-store transactions arrive in Phase 3. Avoid a second history mechanism.

Exit: controls support keyboard/focus/reduced motion, disabled reasons are available, numerical examples pass, feedback follows the source. Typecheck/unit/e2e and screenshots; build/static if asset wiring changes.

### Phase 3 — contracts, placement, history and workspace v5

This is the critical path. Freeze shared contracts first; do not dispatch seven independent store rewrites.

- **3A, contract owner:** agree trace identity versus display name, pane identity/order/type, membership arrays (empty means intentionally unplaced), target pane, unit/link groups, pane-limit preference, typed placement/removal plans, analysis schema and transaction boundaries. Inventory all scalar-map and `pane-1` fallbacks using `rg` before changing types. Preserve existing dataset/display-trace modeling; do not add IQ/Polar scope.
- **3B, pane-model owner:** `types/pane.ts`, `domain/pane-math.ts`, `stores/pane-store.tsx` and coordinated consumer adaptations. Implement multi-pane membership and `planPaneRemoval`; remove reconciliation's automatic cross-domain fallback. Addition, membership toggle, moving one copy and deleting a trace are distinct actions. Stable IDs must survive resize, swap, removal and undo; RefLine cleanup must stop assuming sequential IDs.
- **3C, marker/line owner after 3A/3B contract:** marker/ref-line types, reducers and interaction hook. Markers belong to traces, appear in all memberships, preserve absolute position on delta-reference changes and convert to normal on reference deletion. Replace persistent delta mode with explicit armed action. H lines cannot link; V lines use X-unit groups.
- **3D, domain tasks parallel only on disjoint files:** opening planner and data-kind/pane/analysis registry contracts. File planner tests cover defaults, explicit pane drops, target/compatible/new/unplaced destinations, failures, same-name replacement/copies and workspace-plus-data ordering. Reuse classifier and analysis math; do not migrate every card yet.
- **3E, history/integration owner:** coordinate files, traces, panes, markers and lines through one logical transaction per user action. Use in-memory mementos or typed reversible commands within the existing store/hook pattern. Current portable workspace snapshots omit state such as raw file data and saved analysis state; they are not a lossless undo representation. Restore stores without reconciliation/cleanup effects clobbering the restored state; clear redo after a new action and set a documented bounded memory policy. Drag gestures coalesce to one entry; transient hover/armed UI is not history.
- **3F, migration owner, sequential with shared consumers:** preserve existing legacy normalization in `workspace-migrate-v4.ts`, add explicit v4 → v5 conversion, then update `types/workspace.ts`, `workspace-serialize.ts`, `use-workspace.ts`, fixtures and App integration atomically. Scalar assignments become singleton arrays; explicit empty membership stays empty; invalid pane references are filtered without silently inventing a different-unit destination. Copy global dots to per-pane Sample dots, add settings/type/layout state, matrix-open state and actual wizard settings. App preferences move to browser storage and are excluded from new workspace files; loading legacy workspaces must not overwrite the user's app preferences. Handle obsolete glass/theme fields deliberately.

Required evidence: older supported snapshot fixtures, v5 round-trip, malformed/future-version handling; mixed-unit removal and type-switch matrix; replicated/unplaced traces; delta deletion; settings inheritance; 4/8-pane behavior; composite undo/redo including file source data. Run typecheck/unit/e2e and independent Terra review of migration, placement and history.

### Phase 4 — left panel

- **4A, single Sidebar owner:** ordered sticky Files/Traces/Markers/Lines sections, remembered collapse, empty states and source wording. Consolidate live local rows and extracted components deliberately.
- **4B:** file rows, simultaneous Matrix/Info expansion, matrix keyboard behavior/views/capability reasons, large-port picker and file metadata. Persist actual wizard configuration through Phase 3 file contracts.
- **4C:** trace Show in checklist, pane badges, deterministic shared trace-family color resolver, derived nesting, marker/delta-reference edits, line rows and Threshold crossings entry point. Close-all/remove/replace consume Phase 3 transactions.
- Replace/Edit columns must invoke the shared file pipeline. Establish typed callbacks now; the full wizard/frame integration completes in Phase 7 and remains tracked as pending until exercised end to end.

Exit: trace copies and unplaced states are visible/editable; destructive behavior preserves Undo; panels match light/dark spec. Typecheck/unit/e2e and screenshots.

### Phase 5 — panes, shared rendering and interactions

- **5A:** header, target state and per-pane settings. One `ChartPane.tsx` writer; small reversible changes with e2e after every edit. No hidden global Sample dots or nonfunctional minor-grid setting.
- **5B, rendering feasibility gate:** first prototype extracting the existing Recharts subtree into a presentational Cartesian plot with explicit dimensions, data, domains/ticks and presentation options, keeping stores/pointer interactions in the container. Candidate approach: live panes and export render this same plot tree; export mounts it at requested dimensions, awaits layout/fonts, serializes the resulting SVG and unmounts. This approach is provisional until standalone resolved colors/fonts, unique clip IDs, physical sizing, target-resolution data/decimation and transient-overlay exclusion pass. Do not clone the visible chart DOM or implement a second plotting algorithm. If this candidate fails, resolve the rendering design before expanding export UI, preserving Recharts Cartesian and the same-renderer requirement unless the user explicitly changes the spec.
- **5C:** marker/line glyphs/tags, cursor card, short-name rules, axis formatting, hover state, linked X zoom and independent Y behavior. Carry pane/trace selections through the shared contracts. Test zoom/pan and marker placement after each small chart change.
- **5D:** `ChartWorkspace.tsx`, layout helpers and divider/swap/drop UI. Rows/Columns/2×2/1+side, compatible preset reasons, per-layout sizes, stable identities and deterministic pane order. Table pane shares membership and cursor contracts. Layout owner does not concurrently edit ChartPane.
- **5E1, Smith contracts and numerical foundation:** a Terra owner defines a dimensioned, store-independent Smith plot and interaction contract, sharing trace identity/colors, frequency markers and export options with the pane model. Test Γ/Z/Y and correct per-port Z0 conversion, matched/open/short loads, inductive/capacitive sign conventions, singular/nonfinite cases and viewport transforms against analytical values. Define undefined/singular VSWR, return loss and equivalent L/C behavior for active loads and DC explicitly; do not fabricate finite readouts through clamping. Retain existing pure helpers only when these independent tests validate them; do not inherit the fixed 100-unit mapping as a design constraint.
- **5E2, new SVG renderer/grid:** rewrite `SmithChart.tsx` and `SmithGrid.tsx` or replace them with appropriately scoped equivalents, adapting `SmithPane.tsx`. Build a responsive circular viewport with non-scaling strokes, token colors, readable haloed labels, adaptive resistance/reactance lines and label collision handling. Z/Y/Z+Y affects the grid, never Γ trace positions. Draw |Γ| > 1 rather than clipping it to the unit circle, with the specified warning region and edge. Support all visible traces with stable shared colors and per-trace direction cues. No new Smith library, no parallel legacy renderer left active after integration.
- **5E3, interactions and readout:** add cursor-centered zoom, pan/fit, nearest sample in screen pixels, frequency-based normal/delta markers, full configured readout and marker stepping, linked-frequency band emphasis and bidirectional ghost feedback. Reject unsupported transmission/non-complex drops before release. Keep this renderer shared by screen and target-size export, excluding transient interactions in exports.
- **5E4, numerical and visual acceptance:** compare to the written Smith specification rather than old screenshots. Verify label legibility/collisions at small/large panes and zoom levels, circular geometry after resize, Γ unchanged when switching grid, multiple-trace direction cues, visible nonpassive samples, frequency-marker accuracy, light/dark appearance and standalone target-size SVG. Run interaction e2e and independent Terra review before integration; any `ChartPane.tsx` integration edit still gets its immediate e2e gate.

Exit: chart interaction suite after every ChartPane change, independent Terra reviews for chart and Smith, numerical Smith fixtures, both themes/screenshots. Shared target-size SVG proof passes before Phase 6.

### Phase 6 — export

- **6A:** reuse shared sized plots to compose one/all/picked panes with layout proportions, one title/legend and explicit decoration choices; add quick image copy/download and per-format remembered options. Exclude crosshair, selection, cursor cards and controls.
- **6B, disjoint domain files:** CSV escaping/range/visibility/markers; TikZ styles/pins/width/wrapping/point options and inline data. Explicitly verify data-file ZIP packaging feasibility before committing to its implementation.
- **6C:** live export preview, print-white/dark/app themes, screen/slide/custom sizes and physical paper presets. Use the exact specified 88.9/181.9 mm values until the user requests a standards change. Verify 8/9/10 pt text, line widths, 600 dpi PNG dimensions, print dash/symbol patterns and standalone font embedding. Select the offline serif with the user.
- **6D, approval gate:** present concrete vector-PDF dependency and font-embedding proposal before adding a package; then implement and verify vectors/fonts if approved. Other formats can be reviewed independently, but report Phase 6 partial while a required format or packaging option is deferred.

Exit: standalone exported files visually inspected at screen/custom/paper sizes, multi-pane composition correct, copy/download fallbacks handled; typecheck/unit/e2e/build/static plus independent Terra export review.

### Phase 7 — frame, analysis and unified opening UX

Parallelize only the disjoint frame components. `App.tsx`, shared hooks/contracts and `index.css` remain single-owner integration files.

- **7A:** `TopBar.tsx` and `ToolbarStrip.tsx`: exact group order, whole-group wrapping, five button roles, stable armed hint space, no obsolete View/mode/palette controls.
- **7B:** `FooterBar.tsx`, keyboard map, help/settings sheets: always-visible footer including empty app, responsive hints, one shortcut definition list, context/input guards, Local only, feedback links carrying only app version and browser/OS. Remove unused `StatusBar.tsx`. App settings persist only preferences; manual theme choice survives OS changes.
- **7C:** right panel, Add analysis search/filter/recent/capability reasons and generated cards. Port tools individually to the Phase 3 registry with independent arithmetic/unit checks; preserve existing math, density-unit guard and derived lineage/live/freeze behavior. Views stay in the matrix. Integrate Threshold crossings links and curve-to-trace creation.
- **7D:** `App.tsx`, `use-file-import.ts` and wizard components: one open path, content-confidence behavior, per-pane pre-release feedback, replacement/save-first dialogs, mixed workspace/data sequencing, batch summary/Undo, persistent failed-file rows, column roles/units/preview and real previous settings on Edit columns. No full-window dark drop overlay. Handle keyboard/file dialogs through the same planner.
- **7E, integration:** wire Phase 4 callbacks and Phase 6 pane/top-bar actions, close deferred end-to-end gaps, empty-app demo/drop state and responsive overlay panels.

Exit: complete workflows verified rather than isolated screenshots: open → matrix → multiple panes → markers → analysis → save/reload → export → undo/redo. Typecheck/unit/e2e; build/static for production wiring; screenshots and independent review of parser/analysis changes.

### Phase 8 — final consistency and adversarial review

- Matrix: Light/Dark × Compact/Comfortable × 1440 × 900 / 1024 × 640. Add checks on both sides of the 1280 px panel breakpoint. Exercise empty, frequency, time, mixed-unit, Smith, Table, multi-copy, unplaced and 8-pane workspaces.
- Walk the source's shared rules: role colors, disabled reasons, destruction/Undo policy, no component hex/emoji/side stripes, no obsolete Import wording, correct armed state, formatting, footer, keyboard/focus and reduced motion. Scan findings are candidates for review, not blind edits of raw data or fixtures.
- Measure text contrast against actual composited backgrounds in both themes; target 4.5:1. Verify status messages use borders/icons and only the specified error-file row uses a status fill.
- Built-app privacy/offline checks: inventory initial asset loading, then capture and assert every attempted runtime request's method, origin, path and payload, including same-origin requests; only explicitly requested same-origin demo GETs are allowed. Blocking forbidden requests alone does not pass this gate. Separately verify offline reload/open/export, no cookies, browser storage contains preferences rather than measurement/workspace content, feedback URL has no file/workspace data, fonts render offline, and exported files are self-contained.
- Run all five gates on the integrated tree. Independent Terra adversarial review covers the complete redesign delta, including tracked changes, untracked additions and binary assets in the allowlisted manifest, not just the last uncommitted patch; compare against starting HEAD `31724ef` even if phase commits were requested. A plain branch diff cannot account for untracked work.
- Resolve findings, rerun affected gates and report remaining approved deferrals explicitly. No claim of complete redesign while a required feature remains unimplemented.

## Verification and evidence policy

Every code change: `npm run typecheck` and `npm run test:unit`. Every UI/chart/interaction change: additionally `npm run test:e2e`. Build/asset/export-production changes: additionally `npm run build` then `npm run test:static`. All gates at Phase 0 and final acceptance. Domain-only work receives behavioral tests rather than screenshot-only proof.

Screenshots of each changed UI are required in light/dark; the full density/viewport matrix belongs to Phase 8. Current tests use Chromium only; do not imply multi-browser coverage unless deliberately added and run. New tests target behavior/contracts and data preservation, not copies of implementation details.

Current coverage gaps to fill in the relevant phase: older-version golden workspaces, multi-membership/unplaced traces, transactional undo, 8 panes, meaningful Smith numeric/interaction cases, paper/standalone exports and production privacy assertions. Existing static smoke only verifies basic shell/assets.

Each phase report includes accepted/rejected work, actual agent models, exact command outcomes, screenshots/artifact locations, baseline failures versus new failures, unresolved decisions and the source-requested commit question. A deferred cross-phase UI wiring item must remain explicit until integrated.

## Bug traceability from source §6

This is a static planning audit; runtime examples and contrast ratios remain to be measured in Phase 0. Line numbers are current audit hints, not stable edit instructions.

| ID | Finding | Main delivery |
| --- | --- | --- |
| 01 | Confirmed active text uses `--bg` (`index.css:137`); contrast unmeasured | 1 styles, 2 controls |
| 02 | View toggle has pressed appearance but no downstream strip effect (`TopBar:128`) | 3 per-pane dots, 7 removal |
| 03 | White mixes remain (`ChartPane:1077,1083,1199`, `TopBar:61`) | 1 small patches, 5/7 final consumers |
| 04 | Group orders differ (`TopBar:124`, `ToolbarStrip:121`) | 7 |
| 05 | Hard-coded UI/ref/marker colors remain | 1 tokens, 4/5/7 consumers |
| 06 | Existing formatter partly overlaps requested behavior (`domain/format.ts:116`) | 2 formatter, 5 callers |
| 07 | `--dim` remains text color (e.g. `WizardPreviewTable:31`); ratios unmeasured | 1 and consumer phases |
| 08 | Outer Mergen uses `--tr0`; nested Scope uses `--accent` (`TopBar`); Compact active styling remains (`Sidebar`) | 4/7 |
| 09 | Clear all directly clears state (`TopBar:53`) | 3 transactions, 4/7 action UI |
| 10 | `StatusBar.tsx` unused | 7 |
| 11 | Button/select sizes differ (`index.css:118,144`, `ToolbarStrip:104`) | 1/2/7 |
| 12 | Derived dashes confirmed (`ChartPane:1197`), color resolution duplicated | 4 shared color resolver, 5 traces |
| 13 | Named `buildReimportConfig` absent; no working Edit columns path found | 3 persist actual config, 4/7 implement path |
| 14 | Wrong fallback in `pane-math.ts:164`; test codifies it | 3, replace test expectation |
| 15 | Unsupported minor grid in type/popover | 3 contract, 5 UI |
| 16 | Hard-coded 4 in pane math and strip | 3 policy, 5/7 callers |
| 17 | Locked-line emoji remains (`ChartPane:1307`) | 4 list, 5 chart |
| 18 | Footer early returns with no data (`FooterBar:31,39`) | 7 |
| 19 | Old marker mode survives store/footer/strip | 3 API, 5/7 consumers |
| 20 | Scalar membership (`pane-store:17`) and default fallback (`App:91`) | 3 end-to-end contract change |
| 21 | Root overlay/generic drop confirmed; 'all files queued in wizard' overstates existing classifier | 3 planner, 5 pane feedback, 7 pipeline/UI |
| 22 | Import wording remains in wizard/panels | 4/6/7 consumer wording, 8 audit |

## Task brief and handoff checklist

Use the source's §8 brief template for every implementation task, adding: exact starting snapshot; actual model; file owner/allowlist; public contracts; explicit forbidden files; applicable decisions from this plan; meaningful tests; UI screenshot scenarios; and expected handoff patch/report. No overlapping writers for `ChartPane.tsx`, `Sidebar.tsx`, `App.tsx`, `index.css`, workspace serialization or shared types.

Planning reviewers used: `plan_state`, `plan_ui`, `plan_quality`, each explicitly configured as `gpt-6.1-terra`, read-only. Their proposals informed this document; none implemented product code or ran baseline checks.

### Phase 1 ownership clarification

Terra owns `src/index.css`, theme/hooks/contracts and the minimal root `App.tsx` font correction: its inline `system-ui` currently overrides the body font. Audit remaining component font overrides, including the generic monospace in `IP3Card.tsx`, within the implementation brief. Luna owns only the bounded acquisition of `src/assets/fonts` font binaries and licence notices. No new packages.

Baseline audit clarifications: #01 `.btn-active` uses `--bg` in its base rule; its hover rule mixes. #02 View state is read by the top-bar pressed state but has no downstream strip effect. #21 `App.tsx` renders an app-wide dashed drop overlay; the source prompt's claim of a dark background is stale.

Phase 0 roles: `baseline_run` (Terra) executed the baseline; `baseline_audit` (Luna) independently reviewed the report, six screenshots and manifest hashes. Root Sol reviewed and accepted the evidence.
