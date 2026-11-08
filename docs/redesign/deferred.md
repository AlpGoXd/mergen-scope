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
| V03 | Replace Sidebar white gradients, pale controls and hard-coded removal/border colours. Expose all eight trace palette slots through the shared resolver. | Phase 4 | Deferred. |
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
| Refine reserved armed-hint space so controls remain stationary without causing the strip groups to wrap earlier than board 40-T1. Verify marker and line armed hints against the footer and target-pane behavior. | Phase 7E | Deferred; the empty-workspace captures do not show armed states. |
| Complete the empty-app, pane and footer integration visible in the 40-T1 comparison, and compare light/dark populated and armed states at both sides of the 1280 px breakpoint. | Phase 7E (footer component in 7B) | Deferred; Phase 7A evidence covers light/dark empty workspace at 1440 x 900 only. |

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
| Connect sidebar Open, Drop, Load demo, Replace, Edit columns, Rename and Threshold crossings callbacks to their shared workflows; verify the empty sidebar and file replacement end to end. | Phase 7E | Typed callbacks exist; App wiring remains open. |
| Complete large-port plotted chips across views, grid popover dismissal/focus, and verify all-panes/unplaced and marker/line states against board 42-L1. Replace heuristic raw-header extraction with retained parsed header boundaries. | Phase 7E / final visual audit | Current chips cover the selected view in the target pane; additional states and exact header fidelity remain open. |
| Finish trace row naming, interpolation choices, nesting and visual sizing; verify Undo for all individual edits and failure paths. | Phase 4 continuation / Phase 8 audit | Partial implementation and focused tests exist; board fidelity and complete action coverage remain open. |


## Sidebar completion comparison follow-up

| Remaining work | Target phase | Status and evidence |
| --- | --- | --- |
| Match compact control, cell and trace-row sizing and trace naming against board 42-L1; capture and compare the narrow 220 px sidebar and populated marker/line states in both themes. | Phase 8 visual audit | The 1440 px light/dark comparison in [sidebar completion evidence](sidebar-completion-evidence/comparison.md) fixes the file summary and matrix alignment, but those states and sizing remain open. |
| Provide matrix cell tooltips describing the target-pane add/remove action and existing placements. | Phase 8 | The current tooltip identifies the parameter and view but does not describe the action or pane placement. |
