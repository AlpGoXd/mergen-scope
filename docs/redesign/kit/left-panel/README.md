# Left panel presentation kit (Files · Traces · Markers · Lines)

Exact presentation of boards L1 and C01–C05, as React 19 + TypeScript (strict) components and plain CSS, light and dark. It is **presentation only**: no stores, no undo, no parsing. Every component takes plain props and callbacks, so Phase 4 maps the app's state onto them. `demo/Demo.tsx` renders every state with **sample data** for screenshot comparison (`demo.png` is its output at 2×, light left, dark right).

Checked with the repo's compiler settings (`strict`, `noUncheckedIndexedAccess`, `noUnused*`, `verbatimModuleSyntax`): `tsc` passes. No dependencies beyond React.

## Files

| File | What |
|---|---|
| `tokens.css` | The colour tokens it uses (spec-v3 §4). If `src/index.css` already defines them under the same names, delete the duplicates and keep only the ones marked "kit". Dark = `.theme-dark` on an ancestor; change that selector to the app's theme class if it differs. |
| `left-panel.css` | All kit styles, prefixed `lp-`. Sizes follow Tokens/Details: rows 26 px, marker/line rows 28 px, controls 18–20 px, radius 6 (card) / 5 (rows) / 4 (controls) / 3 (badges), one menu shadow. |
| `types.ts` | Presentational props for every component. |
| `LeftPanel.tsx` | `LeftPanel` (the scroll container), `Section` (sticky header with ▾, title, count, optional action, ⋯; collapsed and empty states), `OpenButton`, `DropZone` (no file open), `EMPTY_TEXT`. |
| `FileRow.tsx` | `FileRow` (C03: ready / parsing / error / trace-removed, Matrix and Columns toggles, ⋯, ×), `Matrix` (C04: family, Plot as, More ▾, quick picks for 3+ ports, list mode for > 8 ports, index labels, plotted / elsewhere / diagonal cells), `Info` (C05: Table / Raw, Copy, ×). |
| `Rows.tsx` | `TraceColumnsHeader`, `TraceRow` (C02: checkbox, swatch, ƒ for created traces, child indent, interpolation chip, pane badges, unplaced state), `MarkerItem` (C01: normal / delta with "from M1 ▾", selected, related highlight, invalid input), `LineRow` (dashed label, link icon on / off / not allowed, summary + List…). |
| `Menu.tsx` | `Menu` surface (items, notes, aside text, checklist ✓, danger item, disabled with reason, separator, footer), `fileMenuEntries()` for the file ⋯ menu, `INTERP_ENTRIES` for the interpolation menu. |
| `icons.tsx` | `IconOpen`, `IconLink` (24-unit grid, stroke 1.75). |

## Trace colours

Set the hue, not the colour: `style={{ '--h': 270 }}` on a row or cell (the components do this from the `hue` prop). The CSS derives:

- source traces: light `oklch(0.58 0.16 h)`, dark `oklch(0.75 0.13 h)`;
- created traces (`is-created`): light `oklch(0.36 0.10 h)`, dark `oklch(0.88 0.045 h)`;
- tags: light fill `oklch(0.50 0.13 h)` with white text, dark = the trace colour with dark text;
- tints (plotted matrix cell, delta marker): 12 % of the trace colour over `--raised`.

The browser clamps chroma to the screen gamut. If the app's shared colour resolver (Phase 4 deferred item) produces exact gamut-clamped values, pass them as `--trace` / `--tag-bg` instead and drop the `--h` rules.

## What the app still provides (not in the kit)

- **Popover positioning, focus, Escape, outside click:** use the Phase 2 shared popover; render `Menu` inside it, anchored to the element passed to `onMenu` / `onInterp` / `onPanes` / `onMore` / `onChangeRef`.
- **Data and actions:** names, summaries (`formatEng` for "2.437 00 GHz", en dash ranges), pane badges in layout order, matrix cell state for the target pane, tooltips, and every callback (with Undo where the spec asks).
- **Input parsing:** `MarkerItem` / `LineRow` call `onX` / `onValue` with the typed text on Enter; parse with the Phase 2 parser and set `invalid` when it fails.
- **Drag and drop** of trace rows and files (P6 rules); the kit only has the drop-zone look (`DropZone over`).
- **Matrix keyboard navigation** (arrow keys between cells, Enter/Space toggles): add it in the app; cells are already buttons with `aria-pressed`.
- **Collapse state persistence** (a preference) and the section ⋯ menus' actions (Close all files… with Undo, Show all / Hide all, Remove all).

## Placeholders in the demo

Everything in `demo/` is sample data (file names, values, hues). Callbacks are no-ops. Remove `demo/` when integrating or keep it as a visual test page.
