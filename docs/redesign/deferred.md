# Deferred redesign work

This ledger tracks findings that remain open after the Phase 1 foundation and Phase 2 shared-piece work. Those scoped implementations passed their checks; the overall findings below remain open until the remaining work lands in its target phase and is verified. This ledger does not authorize starting another phase.

| ID | Exact remaining work | Target phase | Current status |
| --- | --- | --- | --- |
| 01 | Migrate frame and strip callers to explicit action, toggle, selected-choice and armed roles instead of legacy active-prop compatibility. | Phase 7 | Done: Phase 1 base contrast and Phase 2 shared button roles. Deferred: remaining frame/strip adoption. |
| 03 | Replace remaining white-based color mixes in `ChartPane` pane headers, pane body and hover crosshair with semantic theme tokens. Migrate the remaining right-panel white mixes when its frame is updated. `TopBar` white mix is fixed. | Phase 5 (`ChartPane`); Phase 7 (right panel) | Partial: TopBar fixed; chart and right-panel consumers remain. |
| 05 | Replace remaining hard-coded UI and trace colors: Sidebar/shared trace-family color assignment; ChartPane marker outline and reference-line colors; ToolbarStrip group colors; right-panel tab colors. Phase 1 tokens and TopBar colors are migrated. | Phase 4 (Sidebar/shared trace colors); Phase 5 (ChartPane); Phase 7 (ToolbarStrip/right panel) | Partial: tokens and TopBar fixed; listed component consumers remain. |
| 06 | Adopt the canonical formatter in Sidebar readouts, chart axes with shared visible-range context, and footer/wizard displays. The scalar prefix policy alone does not supply shared axis context. | Phase 4 (Sidebar); Phase 5 (axis); Phase 7 (footer/wizard) | Done: Phase 2 formatter/parser API and Sidebar parser extraction. Deferred: listed display callers. |
| 07 | The token correction currently routes `--dim` through `--text-muted`; replace remaining consumers and remove the compatibility alias only after a repository search confirms there are no consumers. Audit measured text contrast against the 4.5:1 requirement in Phase 8. | Phase 8, after component migrations | Partial: token correction through alias is in place; the measured contrast audit remains for Phase 8. |
| 11 | Replace the strip's remaining explicit 11 px / 13 px select and label sizing through shared-control adoption. | Phase 7 | Done: Phase 1 base sizing and Phase 2 shared select. Deferred: strip adoption and sizing. |
| Ã¢â‚¬â€ | Preserve legacy `glass` theme data when reading v4 workspaces, complete the Phase 3 workspace migration, then remove obsolete compatibility strings only when migration and a no-consumer search show they are safe to remove. | Phase 3 (legacy read/migration); Phase 8 (compatibility removal) | Deferred: compatibility is retained for v4 reads; migration and eventual removal remain. |
| Ã¢â‚¬â€ | Remove legacy palette aliases after component migrations. Search the repository (including CSS and components) to prove each alias has no consumer before deleting it. | Phase 8 | Deferred: aliases remain while consumers migrate. |
| Ã¢â‚¬â€ | Migrate remaining component-specific font overrides and complete the type consistency audit across screens and states. | Phases 4, 5 and 7; final audit in Phase 8 | Done: Phase 1 tokens/fonts and Phase 2 shared controls. Deferred: remaining component adoption and full audit. |
| Ã¢â‚¬â€ | Add the user-facing Settings sheet and Appearance controls. The theme API already separates the `system` / `light` / `dark` preference from resolved appearance and supports manual preference; expose it through the specified settings UI. | Phase 7 | Deferred: API behavior is implemented; Settings UI remains. |

## Reference comparison follow-up (8 November)

See [Phase 1Ã¢â‚¬â€œ2 comparison](phase1-2-reference-comparison.md) and [side-by-side images](phase1-2-reference-comparison.html) for evidence and the complete difference register. Every UI phase must repeat this comparison in both themes, using the matching boards and classifying differences as fixed / deferred (phase) / intentional; written v3 wins.

| ID | Remaining visual work or evidence | Target phase | Status |
| --- | --- | --- | --- |
| V01 | Replace the nearly white dark target header and Accent edge with Pane tint / Pane-hue 3 px edge; remove white chart-body gradient. | Phase 5 | Deferred; visible in both Phase 1 and Phase 2 evidence. |
| V02 | Replace legacy top-bar/strip mixtures with explicit chip/Slate roles and semantic tint tokens; remove hard-coded direction colour. | Phase 7 | Deferred; shared primitives alone do not migrate these callers. |
| V03 | Verify the final integrated Sidebar palette and remaining contrast against the reference. | Phase 8 | Partial: the kit and identity-aware trace resolver are adopted; integrated-tree contrast audit remains. |
| V04 | Implement AC-3 faint Analysis header bands, neutral bodies and no coloured stripes; capture open cards in both themes. | Phase 7 | Deferred; current app captures have Analysis closed. |
| V05 | Capture all four message-status primitives in light/dark, then compare actual refusing-drop/wizard/settings messages where adopted. | Phase 2 evidence; Phases 5/7 adoption | Deferred; current gallery demonstrates warning only. |
| V06 | Validate/document dark solid C .1136 vs nominal .12, light secondary fill .0241 vs .03, dark secondary ink .0596 vs .07; hue recipe gamut clamping is already intentional. | Phase 8 | Deferred literal-token audit; do not label exact equality. |

## Phase 3 checkpoint follow-up

| ID | Exact remaining work | Target phase | Status |
| --- | --- | --- | --- |
| E2E-07 | Stabilize `long menus stay visible and track their anchor on resize and scroll` (`tests/e2e/shared-controls.spec.ts:25`): first of three full runs failed because the menu x-position was 31.8 px from its anchor (expected <2 px); the next two runs passed. Diagnose timing/position update and make the assertion deterministic without hiding a real anchoring defect. | Phase 7 | Deferred; intermittent in one full-suite run, not reproduced in two subsequent runs. |

## Phase 1 evidence and scope

Phase 1 implemented the base tokens, offline fonts, type foundation, focus and reduced-motion styles, retained existing Recharts animation-off settings, and provider-owned theme preference API. The light/dark theme API was verified, but the user-facing Settings UI is still Phase 7 work. The base fixes for findings 01, 03, 05, 07 and 11 do not close the later component work listed above.

Keep the Phase 8 gate open until every applicable ledger item is closed and verified. Phase 8 must also complete the specified screen/state review and contrast checks (including text contrast of at least 4.5:1), confirm no component hex colors or emoji remain where prohibited, and use repository searches to prove compatibility aliases and legacy theme handling have no remaining consumers before removal. Record any item that is still open; do not report the redesign as complete while this ledger has open work.

## Phase 7A integration follow-up

| Remaining work | Target | Status |
| --- | --- | --- |
| Wire the top-bar Open action to the unified data/workspace opening path; the temporary fallback loads workspace JSON only. Remove the transitional Right and Clear All controls once their replacement workflows are wired. | Phase 7E | Deferred; the fallback preserves existing workflows until integration. |
| Wire the top-bar Export action and implement the Layout preset previews and selection; both controls are currently disabled with reasons. | Phase 7E | Deferred. |
| Verify strip wrapping at 1024 px and on both sides of 1280 px, including populated and armed states, against 40-T1. Align the delta armed sentence with its marker/reference identity and the footer, and verify the chart ghost and target-pane behavior. | Phase 7E | Partial: marker and line hint slots now size to their longest current sentences; 1440 px light/dark tests cover stable positions and Escape from toolbar buttons. Delta wording, ghost and responsive evidence remain outstanding. |
| Complete the empty-app, pane and footer integration visible in the 40-T1 comparison, and compare light/dark populated and armed states at both sides of the 1280 px breakpoint. | Phase 7E (footer component in 7B) | Partial: marker-toolbar evidence now covers empty, populated and normal-marker armed states in both themes at 1440 px; responsive and delta-armed comparisons remain outstanding. |

Phase 7A screenshots and side-by-side comparisons are in [phase7a-evidence](phase7a-evidence/comparison.md). The 32 px top and strip rows intentionally follow the written specification over the taller reference drawing.

## Phase 7B footer and app settings follow-up

The candidate comparison is in [phase7b-evidence/comparison.html](phase7b-evidence/comparison.html), with light and dark screenshots of the empty footer, help and settings sheets. Screenshots were captured at 1440 Ãƒâ€” 900 on the 7B worktree before integration; they do not establish integrated behavior.

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Connect density, palette, line-style and export-theme preferences to their consumers, with live updates and persistence checks. Theme and the experimental pane limit use existing providers; the remaining preferences have an exported contract but do not yet affect the app. | 7E | Deferred; no end-to-end test covers these preference consumers. |
| Supply target pane type, free cursor coordinates in axis units (Smith Z and ÃŽâ€œ), exact armed sentence and active trace/file short name to the footer; verify responsive hiding and context-sensitive hints. | 7E | Partial footer implementation; empty-state captures only. No integrated nonempty, armed or Smith state evidence yet. |
| Capture and compare the feedback menu and nonempty, armed and Smith footer states in light and dark against 41-F1. Verify the two issue links contain only the intended template, app version and browser/OS. | 7E | Deferred; help and empty footer are captured, but these states and privacy behavior lack dedicated evidence. |
| Refine settings label/control alignment, switch and icon shapes and spacing against 44-S1; verify token colors against reference values. Verify help keycap treatment and footer link wording against 41-F1. | 7E | Palette swatches and themed controls are present; reference color measurements and remaining visual differences are documented in the comparison. |
| Verify keyboard guards, sheet focus and Escape behavior, preference reset, and the experimental switch including an existing workspace with more than four panes. Remove unused StatusBar when the integration owner can safely update its file. | 7E | Deferred; existing suite does not specifically cover these behaviors. |

## Phase 4 continuation follow-up

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Adopt the same trace-family color resolver in chart rendering and verify matching colors for source and created traces in both themes. Resolver allocation is recomputed from surviving traces; deleting an earlier source or sibling can shift later colors. Preserve allocation in a workspace-compatible identity contract if colors must remain fixed across deletion and reload. | Phase 5 | Sidebar adopts the resolver; chart adoption and persistent allocation remain open. |
| Connect sidebar Drop, Load demo, Replace, Edit columns, and file Rename callbacks to shared workflows; verify empty sidebar and replacement end to end. | Phase 7D / 7E | Open is wired in App; the other callbacks remain unwired. Trace-label rename is separately implemented with Undo. |
| Complete large-port plotted chips across views, grid popover dismissal/focus, and verify all-panes/unplaced and marker/line states against board 42-L1. Replace heuristic raw-header extraction with retained parsed header boundaries. | Phase 7E / final visual audit | Current chips cover the selected view in the target pane; additional states and exact header fidelity remain open. |
| Verify trace nesting, visual sizing and Undo failure paths against integrated application states. | Phase 8 audit | Phase 4 kit work adds file-based row names, the seven interpolation choices, atomic apply-to-file and Undo; focused interpolation and rename tests pass. Complete action/failure-path coverage remains open. |


## Sidebar completion comparison follow-up

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Complete the integrated-tree narrow 220 px visual audit and verify remaining kit state variants. | Phase 8 visual audit | The kit is integrated; populated normal/delta markers and linked/unlinked lines are captured at 2x in both themes in [left-kit evidence](left-kit-evidence/comparison.md). Narrow matrix containment is covered by e2e; full narrow-panel visual comparison remains open. |
| Provide matrix cell tooltips describing the target-pane add/remove action and existing placements. | Phase 8 | The current tooltip identifies the parameter and view but does not describe the action or pane placement. |

## File-card visual correction follow-up

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Expose actual parsing progress in the file-import state and render the specified percentage and 2 px accent bar on the file row while parsing. | Phase 7D / 7E | Deferred: the current file record has no progress field, so this state cannot be displayed or captured faithfully. |
| Wire the error row Fix action to the shared wizard or replacement pipeline, then verify recovery end to end. | Phase 7D / 7E | Partial: the error row is tinted and exposes its reason; Fix is disabled when the parent does not supply the relevant callback. |
| Show the current view and existing pane placements in each matrix cell tooltip, including whether clicking adds to or removes from the target pane. | Phase 7E; verify in Phase 8 | Deferred: the current tooltip shows the parameter and view only. |
| Finish the greater-than-eight-port picker: compare its row/column selectors, removable plotted chips and full-grid popover against board 23-C04, and complete cross-view chips plus popover focus and dismissal. | Phase 7E; visual audit in Phase 8 | Partial: the list picker and grid exist; the visual treatment and cross-view/focus behavior remain incomplete. |

Light and dark populated network, CSV and error captures and comparisons are in [file-card visual evidence](file-card-visual-evidence/README.md). The More control now uses the kit menu in the shared popover; complete the integrated-tree comparison against boards 00 and 01 in the Phase 8 visual audit.

## File-card 2x follow-up

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Wire Replace and Rename to their real workflows and verify their data preservation and undo behavior. | Phase 7D / 7E | Disabled with explanations; no placeholder behavior. |
| Compare menu and card proportions in both themes against complete dark closeups; adjust as needed. | Phase 8 | Card and menu evidence remains in [file-card evidence](file-card-2x-evidence/comparison.md). The dark Matrix comparison is complete in [Matrix 2x evidence](dark-matrix-2x-evidence/comparison.md). |


## Left-panel kit integration follow-up

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Capture real parsing-progress and recoverable-error rows in light and dark at 2x, and compare with the supplied kit and C03 board. | Phase 7D / 7E | Not captured: import records do not expose progress and error recovery depends on App workflow wiring. Existing populated network, normal/delta marker and linked-line captures are in [left-kit evidence](left-kit-evidence/comparison.md). |
| Wire sidebar file Drop, Load demo, Replace, Edit columns, and file Rename through App and verify recovery and Undo. | Phase 7D / 7E | Sidebar accepts callbacks; App supplies Open and Threshold crossings. Do not treat placeholder callbacks as connected. |
| Complete matrix cell placement/action tooltips, greater-than-eight-port cross-view chips, grid focus and outside dismissal, and verify full narrow-panel and unusual states. | Phase 7E / Phase 8 | Matrix keyboard navigation and target-pane batch Undo are covered; tooltip, list and visual details remain open. |
| Audit shared popover focus and keyboard behavior for kit menus and verify all marker/line edit invalid and cancellation paths. | Phase 8 | Shared popover and kit menu are connected; focused coverage does not establish every keyboard and invalid-input path. |

## Smith numerical foundation follow-up

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Connect the pure plot contract and G/Z/Y calculations to pane traces, per-port impedances, marker identities, settings and export. | 5E2�5E3 | Foundation only; legacy renderer remains active. |
| Build and validate responsive grid, active-load display, interactions, linked frequency and readout; compare light and dark with the written specification and supplied reference. | 5E2�5E4 | No visual changes in 5E1; 2x reference pending. |
| Handle the explicit ambiguous-boundary and singular numerical results in presentation, including series L/C and DC. | 5E3�5E4 | Numerical status is explicit; presentation and end-to-end behavior remain open. |

## Show in checklist follow-up

| Remaining work | Target phase | Status |
| --- | --- | --- |

## Toolbar pane feedback follow-up

| Remaining work | Target | Status |
| --- | --- | --- |
| Compare toolbar zones and the consolidated hint position to the requested 2x toolbar reference; review bound pane removal, line migration, and history. | Current feedback review | Pending reference and independent history/migration review. |

## Line crossings follow-up

| Remaining work | Target | Status |
| --- | --- | --- |
| Compare the Threshold Crossings line-list card in light and dark with the requested 2x analysis-card reference. | Phase 7C / reference delivery | Light and dark captures are in line-crossings-evidence; the requested reference was not supplied, so visual differences cannot yet be classified. |

## Threshold crossings AC-3 follow-up (Step 1, 9 November)

Evidence: [line-crossings-evidence](line-crossings-evidence/README.md), light and dark at 2x, line list and manual threshold. Compared with board 03 AC-3 (the 45-R1 board predates the band).

| Difference | Class | Target |
| --- | --- | --- |
| 26 px Analysis-tint header band, 1 px neutral border, radius 6, no side stripe, mono result, values through `formatEng` with units | Fixed | Step 1 |
| Header lacks the kebab menu (Create trace, Copy results, Remove), collapse-to-row summary and drag reorder | Deferred | Phase 7C |
| Header shows a generic ruler icon, not a per-tool kind icon | Deferred | Phase 7C |
| Other analysis cards keep the legacy stripe look (opt-in `variant="ac3"` on `AnalysisFeatureCard`) | Deferred | Phase 7C |
| Board shows a source line "trace - file - pane"; manual mode shows trace and file, line mode shows the line and its value | Intentional: the line is the source in line mode; pane is shown per row | - |
| No eye (show on chart) control for crossings | Deferred | Phase 7C |
| Board 03 was only compared for header, result and body proportions; no pixel overlay was made | Deferred | Phase 8 visual audit |

## AC-3 cards, row spacing and Size setting follow-up (10 November)

Evidence and the full difference list are in [ac3-size-evidence](ac3-size-evidence/README.md). Open items:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Searchable Add analysis menu, kebab items (Create trace, Copy results), per-tool kind icons, short-name source rule, collapse and drag reorder, restyle of Peak Table / Noise PSD / IP3 / Trace Ops bodies, R1 / R8 right-panel frame | Phase 7C | Cards share the AC-3 shell and key/value rows; the rest is open. |
| Size setting: adopt the size tokens in components with hard-coded px (top bar and strip, chart overlays, inline-styled cards); check both 1280 px sides at Large | Phase 7A / 7B adoption; Phase 8 audit | Tokens, setting, persistence and default are done. |
| Pane header Hz chip and full P3 header | Phase 5C | Scale text and trace count hide in order without wrapping. |

## Lines like traces (LL-2, 10 November)

Board [37-P4c](referance/37-P4c-lines-like-traces.png) replaces line linking with "Show in". The link icon and the Lines strip's Link button are removed; the data model moves to `paneIds[]` (see plan 3C). Open presentation work, waiting for the kit in `docs/redesign/kit/lines/`:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Line row with Show-in badges and the "Shown in P1, P2 · 3 crossings · List..." line, H-line tooltip, "not in a pane" state | Phase 4 / 5 (with the kit) | Waiting for the kit; the row keeps its current look without the link icon. |
| Chart: "V1 · 2" label, shared hover/selection highlight across copies, edge tag with click-to-pan, right-click menu (Show in, Edit value, List crossings, Remove from Pane N, Delete) | Phase 5C | Waiting for the kit; `ChartPane.tsx` changes in small steps with e2e. |
| "V1 crossings" card grouped by pane; toasts "V1 also shown in Pane 2" / "Deleted V1 from 2 panes" with Undo | Phase 5C / 7C | Data counts per pane are done; card grouping and toasts are not. |

### Lines like traces: data model done (10 November), review follow-ups

Done and verified: `RefLine.paneIds[]` replaces `paneId` / `paneless` / `groupId`; placing adds the clicked pane plus X-linked panes (V lines, same normalized X unit group with shared X zoom `zoomAll`); H lines keep one pane; new panes get nothing; crossings per pane; migration of every old link group into one line (snapshot stays v5, reader accepts both shapes, writer writes the new one); link icon and Link button removed. Tests: `line-membership.test.ts`, `line-membership-migration.test.ts`, `line-membership.spec.ts` plus updated older tests. Independent Terra review of the migration found no defect in ordinary V groups; open follow-ups (none blocks the data model, all are edge cases or product questions):

| Item | Class | Target |
| --- | --- | --- |
| Closing a pane: **decided (10 November) — a line behaves like a trace.** Its copy in the closed pane is dropped; if that was its only pane, the line moves to the nearest compatible pane (same X unit for V lines, same Y unit for H lines; visual order, previous pane first) and is "Not in a pane" only when none exists. Board 37-P4c step 07 ("not in a pane" when its last pane is closed) is read as the no-compatible-pane case. Implemented in `planLastPaneLines` / `remove-last-pane`; covered by `toolbar-pane-removal` tests | Decided, done | Phase 3 data model |
| Undo/Redo restores lines but not which line was selected (selection resets to none) | Deferred | Phase 5C |
| A v5 line carrying both old and new fields, or a crafted legacy horizontal group, or an old group member naming a removed pane, is rejected or only partly merged; labels of merged groups are not de-duplicated; `paneIds` order follows the `panes` array, not `layout.paneOrder`, and adding a pane appends | Edge cases, deferred | Phase 8 audit |
| The legacy `restoreSnapshot` helper (unused by the app) does not remap the selected line id | Deferred | Phase 8 audit |
| `src/components/sidebar/RefLineItem.tsx` is dead code that still contains link UI strings; remove it with the line row kit | Cleanup | With the lines kit |
| Multi-pane Show-in editing UI (badges menu), removal of one copy, "V1 · 2" label, edge tag and right-click menu have no UI yet; the reducer actions `ADD_LINE_PANE`, `REMOVE_LINE_PANE`, `SET_LINE_PANES` exist and are unit-tested | Waiting for the kit | Phase 4 / 5C |

## Lines presentation (kit/lines, 10 November)

Integrated: the kit's `LineRow` in the Lines section (`LiveLineRow`), Show in (shared checklist, `PopoverAt`), right-click menu on a line or its label, `ChartLine` / `CrossingDot` / `EdgeTag` in every pane (`LinesLayer.tsx`), one hovered-or-selected line id (`hoveredRefLineId`, transient, never undone or saved) that lights every copy, its edge tags and its row, drag of any copy, Undo toasts, per-pane visible ranges (`paneViews`) feeding "off view" text and edge tags. Differences against the kit demo and board 37-P4c are in [lines-evidence](lines-evidence/README.md). Open:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| Stack or avoid overlapping labels of close V lines; ΔX / ΔY delta brackets between lines; "Edit value..." when the left panel is hidden | Phase 5C | Deferred |
| "V1 crossings" grouped by pane with the current-row dot highlight | Phase 7C | Deferred |
| Screenshot of the not-in-a-pane row state and the invalid-value tint | Phase 8 audit | Deferred |

## Bug and rule fixes after testing (10 November)

Done and covered by tests: a line is placed only in the clicked pane (no X-link rule, nothing added automatically, not even to new panes; `line-membership.spec.ts`, `line-membership.test.ts`); lines land at the cursor in any pane and view (`line-cursor.spec.ts`: V and H, pane 1 and 2, auto and zoomed). Root cause of the H-line miss: pixel to value maths in `ChartPane.tsx` used fixed layout constants (margins, a 35 px x-axis height) and, for auto scale, a padded estimate of the Y domain; it now uses the plot rectangle and scale domains the lines layer reports. Right-click: a line or its label opens its own menu, an empty chart cancels an armed tool, the browser menu never shows on a chart (`line-context-menu.spec.ts`). Toast policy (spec-v3, Toasts): only delete, closing a file, Apply to all, moved traces and opened files; one toast at a time; no history notices (`toast-policy.test.tsx`, `toasts.spec.ts`). Open:

| Remaining work | Target phase | Status |
| --- | --- | --- |
| A right-click that starts on a line after a drag (right-drag X zoom released over a line) would also open the line menu | Phase 5C | Deferred; not reproduced |
| `historyNotice` ('pruned', 'oversized') is still computed in the engine for tests but never shown; remove it when the history work is next touched | Phase 8 audit | Deferred |

## Analysis overhaul decisions (10 November)

| Remaining work | Target phase | Status |
| --- | --- | --- |
| **Data table:** the right panel's Data tab (a table of the active trace's samples: #, Freq, Amp) is removed in Analysis Part B2. Until the Table pane exists there is no sample table in the app. | Phase 5, first step (Table pane, shares membership and cursor contracts) | Decided: removal accepted; Table pane is the first step of Phase 5. |
| **Export:** until Phase 6 the top bar's Export… performs "export visible CSV" (no dialog); the Import/Export card is removed in B2. | Phase 6 | Decided. |
| **Views out of the panel:** VSWR, Return loss and Group delay cards are removed; the same values are matrix views (run Range Statistics on the view's trace for min / max / average). | Part B2 | Decided. |
