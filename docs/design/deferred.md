# Deferred redesign work

This ledger tracks findings that remain open after the Phase 1 foundation and Phase 2 shared-piece work. The 13 November cleanup audit reviewed each remaining item against code, tests and history; visual, numerical-edge and independent-review requirements remain open where completion could not be established. Those scoped implementations passed their checks; the overall findings below remain open until the remaining work lands in its target phase and is verified. This ledger does not authorize starting another phase.

| ID | Exact remaining work | Target phase | Current status |
| --- | --- | --- | --- |
| 01 | Migrate frame and strip callers to explicit action, toggle, selected-choice and armed roles instead of legacy active-prop compatibility. | Phase 7 | Done: Phase 1 base contrast and Phase 2 shared button roles. Deferred: remaining frame/strip adoption. |
| 03 | Replace remaining white-based color mixes with semantic theme tokens. | Phase 5 / 7 | Pane chrome is updated; ChartPane crosshair and tooltip still mix with white. |
| 05 | Replace remaining hard-coded UI and trace colors. | Phase 4 / 5 / 7 | Chart and Sidebar share the trace resolver; ChartPane marker outlines and reference-line fallbacks still use hard-coded colors. |
| 06 | Verify canonical formatter use in Sidebar readouts, chart axes and footer/wizard displays. | Phase 4/5/7 | Partial: chart axes use a visible-range formatter; footer cursor integration and remaining callers still need verification. |
| 07 | The token correction currently routes `--dim` through `--text-muted`; replace remaining consumers and remove the compatibility alias only after a repository search confirms there are no consumers. Audit measured text contrast against the 4.5:1 requirement in Phase 8. | Phase 8, after component migrations | Partial: token correction through alias is in place; the measured contrast audit remains for Phase 8. |
| 11 | Verify strip typography and sizing against the shared controls and size settings. | Phase 7 | Partial: the strip uses shared controls and size tokens; full typography review is unverified. |
| — | Preserve legacy `glass` theme data when reading v4 workspaces, complete the Phase 3 workspace migration, then remove obsolete compatibility strings only when migration and a no-consumer search show they are safe to remove. | Phase 3 (legacy read/migration); Phase 8 (compatibility removal) | Deferred: compatibility is retained for v4 reads; migration and eventual removal remain. |
| — | Remove legacy palette aliases after component migrations. Search the repository (including CSS and components) to prove each alias has no consumer before deleting it. | Phase 8 | Deferred: aliases remain while consumers migrate. |
| — | Migrate remaining component-specific font overrides and complete the type consistency audit across screens and states. | Phases 4, 5 and 7; final audit in Phase 8 | Done: Phase 1 tokens/fonts and Phase 2 shared controls. Deferred: remaining component adoption and full audit. |

## Reference comparison follow-up (8 November)

See Phase 1–2 comparison and side-by-side images for evidence and the complete difference register. Every UI phase must repeat this comparison in both themes, using the matching boards and classifying differences as fixed / deferred (phase) / intentional; the current decisions file wins.

| ID | Remaining visual work or evidence | Target phase | Status |
| --- | --- | --- | --- |
| V01 | Verify pane-tint target header, 3 px pane edge and chart body against the reference. | Phase 5 | Pane chrome implementation landed in c500ef5; fresh integrated reference comparison remains open. |
| V02 | Replace legacy top-bar/strip mixtures with explicit chip/Slate roles and semantic tint tokens; remove hard-coded direction colour. | Phase 7 | Deferred; shared primitives alone do not migrate these callers. |
| V03 | Verify the final integrated Sidebar palette and remaining contrast against the reference. | Phase 8 | Partial: the kit and identity-aware trace resolver are adopted; integrated-tree contrast audit remains. |
| V04 | Compare the AC-3 Analysis card presentation in both themes against the reference. | Phase 7 | The kit-based AC-3 analysis panel landed in 5c56fb4; fresh both-theme comparison remains open. |
| V05 | Capture all four message-status primitives in light/dark, then compare actual refusing-drop/wizard/settings messages where adopted. | Phase 2 evidence; Phases 5/7 adoption | Deferred; current gallery demonstrates warning only. |
| V06 | Validate/document dark solid C .1136 vs nominal .12, light secondary fill .0241 vs .03, dark secondary ink .0596 vs .07; hue recipe gamut clamping is already intentional. | Phase 8 | Deferred literal-token audit; do not label exact equality. |

## Phase 3 checkpoint follow-up

| ID | Exact remaining work | Target phase | Status |
| --- | --- | --- | --- |
| E2E-07 | Stabilize `long menus stay visible and track their anchor on resize and scroll` (`tests/e2e/shared-controls.spec.ts:25`): first of three full runs failed because the menu x-position was 31.8 px from its anchor (expected <2 px); the next two runs passed. Diagnose timing/position update and make the assertion deterministic without hiding a real anchoring defect. | Phase 7 | Deferred; intermittent in one full-suite run, not reproduced in two subsequent runs. |

## Phase 1 evidence and scope

Phase 1 implemented the base tokens, offline fonts, type foundation, focus and reduced-motion styles, retained existing Recharts animation-off settings, and provider-owned theme preference API. The light/dark theme API and user-facing Settings UI are implemented; preference integrations and the remaining verification are tracked below. The base fixes for findings 01, 03, 05, 07 and 11 do not close the later component work listed above.

Keep the Phase 8 gate open until every applicable ledger item is closed and verified. Phase 8 must also complete the specified screen/state review and contrast checks (including text contrast of at least 4.5:1), confirm no component hex colors or emoji remain where prohibited, and use repository searches to prove compatibility aliases and legacy theme handling have no remaining consumers before removal. Record any item that is still open; do not report the redesign as complete while this ledger has open work.

## Phase 7A integration follow-up

| Remaining work | Target | Status |
| --- | --- | --- |
| Wire the top-bar Open action to the unified data/workspace opening path; the temporary fallback loads workspace JSON only. Remove the transitional Right and Clear All controls once their replacement workflows are wired. | Phase 7E | Deferred; the fallback preserves existing workflows until integration. |
| Verify the export and layout preset controls against the intended full workflows. | Phase 7E | Visible CSV export landed in 5c56fb4 and layout presets in 1d15f66; full export workflow and reference verification remain open. |
| Verify strip wrapping at 1024 px and on both sides of 1280 px, including populated and armed states, against 40-T1. Align the delta armed sentence with its marker/reference identity and the footer, and verify the chart ghost and target-pane behavior. | Phase 7E | Partial: marker and line hint slots now size to their longest current sentences; 1440 px light/dark tests cover stable positions and Escape from toolbar buttons. Delta wording, ghost and responsive evidence remain outstanding. |
| Complete the empty-app, pane and footer integration visible in the 40-T1 comparison, and compare light/dark populated and armed states at both sides of the 1280 px breakpoint. | Phase 7E (footer component in 7B) | Partial: marker-toolbar evidence now covers empty, populated and normal-marker armed states in both themes at 1440 px; responsive and delta-armed comparisons remain outstanding. |

The historical Phase 7A screenshots and side-by-side comparisons were removed during the documentation cleanup. The 32 px top and strip rows intentionally follow the written specification over the taller reference drawing.

## Phase 7B footer and app settings follow-up

The historical Phase 7B comparison and screenshots were removed during the documentation cleanup. Screenshots were captured at 1440 Ã— 900 on the 7B worktree before integration; they do not establish integrated behavior.

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Verify live preference integration and persistence for size, palette, trace symbols and export theme. | 7E | Size and palette have consumers; export-theme consumer and complete end-to-end persistence verification remain open. |
| Supply target pane type, free cursor coordinates in axis units (Smith Z and Î“), exact armed sentence and active trace/file short name to the footer; verify responsive hiding and context-sensitive hints. | 7E | Partial footer implementation; empty-state captures only. No integrated nonempty, armed or Smith state evidence yet. |
| Capture and compare the feedback menu and nonempty, armed and Smith footer states in light and dark against 41-F1. Verify the two issue links contain only the intended template, app version and browser/OS. | 7E | Deferred; help and empty footer are captured, but these states and privacy behavior lack dedicated evidence. |
| Refine settings label/control alignment, switch and icon shapes and spacing against 44-S1; verify token colors against reference values. Verify help keycap treatment and footer link wording against 41-F1. | 7E | Palette swatches and themed controls are present; reference color measurements and remaining visual differences are documented in the comparison. |
| Verify keyboard guards, sheet focus and Escape behavior, preference reset, and the experimental switch including an existing workspace with more than four panes. | 7E | Deferred; existing suite does not specifically cover these behaviors. |

## Phase 4 continuation follow-up

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Verify matching trace-family colors for source and created traces in both themes, and verify stable allocation across deletion and workspace reload. | Phase 5 | Sidebar and ChartPane use the shared resolver and traceHueSlots (ceb6cf0); cross-theme and persistence verification remain open. |
| Connect sidebar Drop, Replace and file Rename callbacks to shared workflows; verify empty sidebar, import settings and replacement end to end. | Phase 7D / 7E | Open and Load demo are wired in App; tabular Import settings uses RERUN_WIZARD. Replace and file Rename callbacks remain unwired. Trace-label rename is separately implemented with Undo. |
| Complete large-port plotted chips across views, grid popover dismissal/focus, and verify all-panes/unplaced and marker/line states against board 42-L1. Replace heuristic raw-header extraction with retained parsed header boundaries. | Phase 7E / final visual audit | Current chips cover the selected view in the target pane; additional states and exact header fidelity remain open. |
| Verify trace nesting, visual sizing and Undo failure paths against integrated application states. | Phase 8 audit | Phase 4 kit work adds file-based row names, the seven interpolation choices, atomic apply-to-file and Undo; focused interpolation and rename tests pass. Complete action/failure-path coverage remains open. |


## Sidebar completion comparison follow-up

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Complete the integrated-tree narrow 220 px visual audit and verify remaining kit state variants. | Phase 8 visual audit | The kit is integrated; populated normal/delta markers and linked/unlinked lines are captured at 2x in both themes in left-kit evidence. Narrow matrix containment is covered by e2e; full narrow-panel visual comparison remains open. |
| Verify matrix cell tooltip wording against the current add/show behavior and target-pane contract. | Phase 8 | TouchstoneMatrixPicker now describes the add/show action and lists existing pane placements; the older add/remove wording requires reconciliation with current behavior. |

## File-card visual correction follow-up

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Expose actual parsing progress in the file-import state and render the specified percentage and 2 px accent bar on the file row while parsing. | Phase 7D / 7E | Deferred: the current file record has no progress field, so this state cannot be displayed or captured faithfully. |
| Wire the error row Fix action to the shared wizard or replacement pipeline, then verify recovery end to end. | Phase 7D / 7E | Partial: the error row is tinted and exposes its reason; Fix is disabled when the parent does not supply the relevant callback. |
| Verify matrix tooltip behavior against the current add/show contract. | Phase 7E; verify in Phase 8 | The picker lists the current view and existing placements and describes add/show; the older add/remove wording needs reconciliation. |
| Finish the greater-than-eight-port picker: compare its row/column selectors, removable plotted chips and full-grid popover against board 23-C04, and complete cross-view chips plus popover focus and dismissal. | Phase 7E; visual audit in Phase 8 | Partial: the list picker and grid exist; the visual treatment and cross-view/focus behavior remain incomplete. |

Light and dark populated network, CSV and error captures and comparisons are in file-card visual evidence. The More control now uses the kit menu in the shared popover; complete the integrated-tree comparison against boards 00 and 01 in the Phase 8 visual audit.

## File-card 2x follow-up

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Wire Replace and Rename to their real workflows and verify their data preservation and undo behavior. | Phase 7D / 7E | Disabled with explanations; no placeholder behavior. |
| Compare menu and card proportions in both themes against complete dark closeups; adjust as needed. | Phase 8 | Card and menu evidence remains in file-card evidence. The dark Matrix comparison is complete in Matrix 2x evidence. |


## Left-panel kit integration follow-up

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Capture real parsing-progress and recoverable-error rows in light and dark at 2x, and compare with the supplied kit and C03 board. | Phase 7D / 7E | Not captured: import records do not expose progress and error recovery depends on App workflow wiring. Existing populated network, normal/delta marker and linked-line captures are in left-kit evidence. |
| Wire sidebar file Drop, Replace and file Rename through App; verify import settings, recovery and Undo. | Phase 7D / 7E | App supplies Open, Load demo and Threshold crossings; tabular Import settings uses RERUN_WIZARD. Replace and file Rename remain unwired. |
| Complete matrix cell placement/action tooltips, greater-than-eight-port cross-view chips, grid focus and outside dismissal, and verify full narrow-panel and unusual states. | Phase 7E / Phase 8 | Matrix keyboard navigation and target-pane batch Undo are covered; tooltip, list and visual details remain open. |
| Audit shared popover focus and keyboard behavior for kit menus and verify all marker/line edit invalid and cancellation paths. | Phase 8 | Shared popover and kit menu are connected; focused coverage does not establish every keyboard and invalid-input path. |

## Smith numerical foundation follow-up

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Complete Smith export and verify the wired plot, impedance and marker contracts end to end. | 5E2-5E3 | The Smith renderer and pane integration landed in bb4bb4d; export and remaining verification are open. |
| Validate the responsive grid, active-load display, interactions, linked frequency and readout; compare light and dark with the written specification and supplied reference. | 5E2-5E4 | Renderer and linked frequency landed in bb4bb4d and 8b99e80; full comparison and verification remain open. |
| Verify ambiguous-boundary and singular Smith numerical results in presentation, including series L/C and DC. | 5E3-5E4 | Readout formatting and series-equivalent rendering exist (ad79f66); presentation edge cases and end-to-end behavior remain to verify. |

## Toolbar pane feedback follow-up

| Remaining work | Target | Status |
| --- | --- | --- |
| Compare toolbar zones and the consolidated hint position to the requested 2x toolbar reference; review bound pane removal, line migration, and history. | Current feedback review | Pending reference and independent history/migration review. |

## Line crossings follow-up

| Remaining work | Target | Status |
| --- | --- | --- |
| Compare the Threshold Crossings line-list card in light and dark with the requested 2x analysis-card reference. | Phase 7C / reference delivery | Light and dark captures are in line-crossings-evidence; the requested reference was not supplied, so visual differences cannot yet be classified. |

## Threshold crossings AC-3 follow-up (Step 1, 9 November)

Evidence: line-crossings-evidence, light and dark at 2x, line list and manual threshold. Compared with board 03 AC-3 (the 45-R1 board predates the band).

| Difference | Class | Target |
| --- | --- | --- |
| Verify remaining card actions and implement drag reorder. | Deferred | Phase 7C; menu, Copy results, Remove and collapse exist (5c56fb4). |
| Verify tool-specific icon requirements. | Deferred | Phase 7C; Math/Measure kind icons exist (5c56fb4), but they are not unique to every tool. |
| Board 03 was only compared for header, result and body proportions; no pixel overlay was made | Deferred | Phase 8 visual audit |

## AC-3 cards, row spacing and Size setting follow-up (10 November)

Evidence and the full difference list are in ac3-size-evidence. Open items:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Finish analysis card actions and drag reorder; verify remaining card bodies and the right-panel frame against R1 / R8. | Phase 7C | Search, collapse, menu shell, Copy results, short source names and Math Create trace landed in 5c56fb4; drag reorder and remaining comparison are open. |
| Size setting: adopt the size tokens in components with hard-coded px (top bar and strip, chart overlays, inline-styled cards); check both 1280 px sides at Large | Phase 7A / 7B adoption; Phase 8 audit | Tokens, setting, persistence and default are done. |
| Pane header Hz chip and full P3 header | Phase 5C | Scale text and trace count hide in order without wrapping. |

## Lines like traces (LL-2, 10 November)

Board 37-P4c replaces line linking with "Show in". The link icon and the Lines strip's Link button are removed; the data model moves to `paneIds[]` (see plan 3C). Remaining presentation work after integration of the lines kit:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Verify line placement/deletion Undo toasts. | Phase 5C / 7C | Grouped crossings landed in 5c56fb4; toast behavior needs verification. |

### Lines like traces: data model done (10 November), review follow-ups

Done and verified: `RefLine.paneIds[]` replaces `paneId` / `paneless` / `groupId`; placing adds only the clicked pane; H lines keep one pane; new panes get nothing; crossings per pane; migration of every old link group into one line (snapshot stays v5, reader accepts both shapes, writer writes the new one); link icon and Link button removed. Tests: `line-membership.test.ts`, `line-membership-migration.test.ts`, `line-membership.spec.ts` plus updated older tests. Independent Terra review of the migration found no defect in ordinary V groups; open follow-ups (none blocks the data model, all are edge cases or product questions):

| Item | Class | Target |
| --- | --- | --- |
| Undo/Redo restores lines but not which line was selected (selection resets to none) | Deferred | Phase 5C |
| A v5 line carrying both old and new fields, or a crafted legacy horizontal group, or an old group member naming a removed pane, is rejected or only partly merged; labels of merged groups are not de-duplicated; `paneIds` order follows the `panes` array, not `layout.paneOrder`, and adding a pane appends | Edge cases, deferred | Phase 8 audit |
| The legacy `restoreSnapshot` helper (unused by the app) does not remap the selected line id | Deferred | Phase 8 audit |

## Lines presentation (kit/lines, 10 November)

Integrated: the kit's `LineRow` in the Lines section (`LiveLineRow`), Show in (shared checklist, `PopoverAt`), right-click menu on a line or its label, `ChartLine` / `CrossingDot` / `EdgeTag` in every pane (`LinesLayer.tsx`), one hovered-or-selected line id (`hoveredRefLineId`, transient, never undone or saved) that lights every copy, its edge tags and its row, drag of any copy, Undo toasts, per-pane visible ranges (`paneViews`) feeding "off view" text and edge tags. Differences against the kit demo and board 37-P4c are in lines-evidence. Open:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Avoid overlapping labels of close V lines and support Edit value when the left panel is hidden. | Phase 5C | Open; X/Y delta pair displays already exist (4d36551). |
| Highlight the current crossing row on the chart. | Phase 7C | Grouped rows and list selection landed in 5c56fb4; chart highlighting remains open. |
| Screenshot of the not-in-a-pane row state and the invalid-value tint | Phase 8 audit | Deferred |

## Bug and rule fixes after testing (10 November)

Done and covered by tests: a line is placed only in the clicked pane (no X-link rule, nothing added automatically, not even to new panes; `line-membership.spec.ts`, `line-membership.test.ts`); lines land at the cursor in any pane and view (`line-cursor.spec.ts`: V and H, pane 1 and 2, auto and zoomed). Root cause of the H-line miss: pixel to value maths in `ChartPane.tsx` used fixed layout constants (margins, a 35 px x-axis height) and, for auto scale, a padded estimate of the Y domain; it now uses the plot rectangle and scale domains the lines layer reports. Right-click: a line or its label opens its own menu, an empty chart cancels an armed tool, the browser menu never shows on a chart (`line-context-menu.spec.ts`). Toast policy (design decisions, Toasts): only delete, closing a file, Apply to all, moved traces and opened files; one toast at a time; no history notices (`toast-policy.test.tsx`, `toasts.spec.ts`). Open:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| A right-click that starts on a line after a drag (right-drag X zoom released over a line) would also open the line menu | Phase 5C | Deferred; not reproduced |
| `historyNotice` ('pruned', 'oversized') is still computed in the engine for tests but never shown; remove it when the history work is next touched | Phase 8 audit | Deferred |

## Analysis overhaul decisions (10 November)

| Remaining work | Target phase | Status |
| --- | --- | --- |
| **Data table:** the right panel's Data tab (a table of the active trace's samples: #, Freq, Amp) is removed in Analysis Part B2. Until the Table pane exists there is no sample table in the app. | Phase 5, first step (Table pane, shares membership and cursor contracts) | Decided: removal accepted; Table pane is the first step of Phase 5. |

## Analysis overhaul B2 follow-up (10 November)

Evidence and the difference list: analysis-evidence. Open:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Legacy analysis state still exists behind the new panel and is written to workspaces for the old reader: `analysisOpenState`, the six result maps, `savedNoise`, `savedIP3`, `ANALYSIS_ITEMS`, `use-analysis-target` registry parts, and ui fields `noiseFilter`, `noiseSource`, `ip3Gain`, `traceOpsOpenSections` | Analysis B3 | Deferred |
| Highlight the `current` crossing row on the chart; verify parameter-based Math output names and family colour for output hue. | Analysis B3 / 7C | Grouped crossing row state and Math Create trace landed in 5c56fb4; chart highlighting and remaining verification are open. |

## Smith pane wired in (11 Nov): left out on purpose, to do later

- **Marker dragging and right-click on Smith:** dragging along the trace with grouped Undo was implemented in b75376e; right-click actions and context-menu wiring remain open.
- **Trace symbols and sample dots on Smith:** rendering and sample-state wiring exist (`c500ef5`); verify the Samples control and symbol/dot behavior end to end on Smith panes.
- **Saved zoom:** the Smith view resets to fit when the pane remounts; lift `{ center, zoom }` into the pane settings if it should be saved.
- **Decimation:** every sample is drawn; add min/max thinning if 20k-point traces show up on Smith.
- **Z11 / Y11 on Smith:** greyed with "Smith shows reflections (S11, S22 …)" until a conversion to Γ exists (`impedanceToGamma`, `admittanceToGamma` are ready in `src/domain/smith/numerics.ts`).
- **Tab / Shift+Tab to step Smith markers** (traps keyboard focus); the ‹ › buttons do it.
- **Y-grid labels in Z + Y mode** (only the Z grid is labelled).
- **Hover-update test:** a unit test that a hover update does not recompute the converted Smith traces (spy on the converter).
- **X linking (11 Nov), left out:** the "panes start unlinked" decision text is not yet written into `design-decisions-2026-11-10.md`; "Previous zoom" (Backspace in the shortcut list) has no implementation, so there is nothing for a link group to share there.
- **Swap and drop hints (11 Nov):** a file-drop refusal is swallowed when the target pane is removed before the asynchronous file read finishes (fall back to the workspace-level banner Notice; test it); an "automatic title" flag in the saved pane shape, so a custom title such as "Pane 42" is not renumbered by a layout change or swap; keyboard alternative for swapping panes.
- **Trace colour input:** `<input type="color">` in the Traces list rows gets an `oklch(...)` value, which browsers reject (console warning, picker starts black): convert to `#rrggbb` for the input only (a small pure helper in `src/domain/`).
- **Export, still open after 6ee9a02 and the SVG / LaTeX commit:** the Export dialog (What · Format · Size · Theme · Include · live preview, All panes), PDF (needs a library proposal), TikZ options (wrap, width, data as zipped .dat, grayscale), Copy as LaTeX for Smith panes, and image export of Table panes. Copy image, Download image, Download SVG and Copy as LaTeX for chart panes are built.

