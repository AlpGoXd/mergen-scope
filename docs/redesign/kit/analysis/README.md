# Analysis panel presentation kit (AC-3)

The exact presentation of the right-hand Analysis panel: boards R1, R8, X1 (AC-3, decided) and P4c step 06 ("V1 crossings"). React 19 + TypeScript (strict) components and plain CSS. Like the left-panel kit, it is **presentation only**: no stores, no maths, no number formatting. Every component takes plain props and callbacks.

`demo/Demo.tsx` renders every state with **sample data**. `demo.png` is its output at 2×:
- top row: Compact; bottom row: Comfortable;
- left half: light; right half: dark.

Checked with the repo's compiler settings (`strict`, `noUncheckedIndexedAccess`, `noUnused*`, `verbatimModuleSyntax`): `tsc` passes. No dependencies beyond React.

## Use the CSS as it is

`analysis.css` uses only the app's tokens from `src/index.css`:
- colours: `--raised`, `--panel`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--accent`, `--slate-*`;
- groups: `--analysis-tint/-fill/-line/-ink`, `--warning-*`, `--danger-*`, `--info-*`, `--pane-fill/-ink`;
- type and fonts: `--font-caption/-body/-title`, `--font-sans/-mono`;
- sizes: `--row-height`, `--control-height`, `--control-sm-height`, `--panel-padding`, `--radius-*`.

So light/dark (`.theme-dark`) and the Size setting (`.density-comfortable`, and later `.density-large`) work with no extra rules. Don't restyle it; if something looks wrong in the app, report the difference instead.

Two kit-only names have fallbacks: `--bar-height` (panel header, 32 px) and `--menu-shadow`.

## Files

| File | What |
|---|---|
| `analysis.css` | All styles, prefixed `an-`. |
| `types.ts` | Props for every component. |
| `Analysis.tsx` | The components listed below. |
| `icons.tsx` | Ruler, search, warning; ƒ glyph. |

Components in `Analysis.tsx`:
- `AnalysisPanel`: 32 px header with "Analysis", the count and "+ Add analysis"; scrolling body.
- `AnalysisEmpty`: the panel with no analyses.
- `AnalysisCard`: AC-3. A neutral card with a header band in the Analysis tint, holding:
  - the kind icon (ƒ Math / ruler Measure);
  - title, source, ⋯, ×.

  Click or Enter on the header collapses the card, and then the result shows in the header (`summary`). `selected` marks the card whose output or overlay is highlighted.
- `KeyValues`: muted 11 px labels; values 12 px semibold, full ink.
- `Result`: the headline value with a muted unit and an optional note line.
- `Params`: the generated form. Number (with unit; `invalid` gives the danger tint), select (the app opens its listbox popover from `onOpen`), segmented.
- `CardMsg`: an SC-3 message inside a card. Neutral background, thin status outline, coloured icon, optional action ("Pick a trace").
- `Busy`: computing or waiting text.
- `OutputRow`: a Math tool's created trace: swatch, name, pane badges, Live / Freeze.
- `CrossingsList`: crossings grouped by pane (a group header only when there's more than one pane).
  - Each row: swatch · trace · **the one value that changes** (y for a V line, x for an H line or a threshold level). The constant goes in the card's source line ("V1 · 3.653 32 GHz"), never in every row. No bold: the value is regular Mono in full ink.
  - The `current` row is the one highlighted on the chart.
  - The footer has a cap note and "Copy as CSV".
  - Used by Threshold crossings (manual level) and by a line's **List…** ("V1 crossings", P4c).
- `AddAnalysisMenu`: search, All / ƒ Math / Measure filter, an optional Recent group, then A–Z.
  - Items have a lead glyph, title and note.
  - A greyed item shows its reason instead of the note and can't be picked.
  - ✓ marks tools already in the panel.

## Decision built into the kit: emphasised numbers

Emphasised values (key/value values, the result, the collapsed summary) use **IBM Plex Sans 600 with tabular digits**. Plain readouts (crossing x / y, notes, units) stay in JetBrains Mono 400.

The reason: the app ships JetBrains Mono only in weight 400, so `font-weight: 600` on Mono makes the browser fake the bold, which smears. If you'd rather keep Mono for everything, add JetBrains Mono 600 as a font file (about 90 KB, no npm package). That needs the user's approval.

## What the app still provides

- **Data and formatting:** every string is preformatted (`formatEng`, real minus "−", units, en-dash ranges). Source text is "S21 · file · Pane 1".
  - In `CrossingsList`, pass short trace names ("S21") when the card's source already names the file. The panel is narrow.
- **The registry** (spec-v3 §R5): `kind`, `meta`, `appliesTo`, `params`, `compute`, `outputs`. `Params` renders `params`; `appliesTo` reasons become `AddMenuItem.disabledReason` or a `CardMsg`.
- **Popovers:** the card ⋯ menu, the select listbox and the Add menu use the Phase 2 shared popover (positioning, focus, Escape, outside click). Render `AddAnalysisMenu` inside it.
- **Keyboard:**
  - Add menu: ↑ / ↓ move `activeId`, Enter picks, Esc closes.
  - Crossings list: ↑ / ↓ move between rows.
- **Behaviour and Undo:** remove (toast with Undo), collapse state (a preference), Live / Freeze, highlighting the chart point for `current`, and copying CSV.

## Replaces

- `src/components/analysis/AnalysisFeatureCard.tsx`: its gradient background, 12 px radius and side bar. Every card moves to `AnalysisCard`.
- `src/components/analysis/AnalysisMenuCard.tsx`: replaced by `AddAnalysisMenu`.
- `src/components/analysis/TraceOpsCard.tsx` and the other hand-written cards: each becomes a registry tool rendered with these components (the Phase 7C plan decides the mapping).
- The placeholder Threshold crossings line view: replaced by `CrossingsList`.

Everything in `demo/` is sample data; remove it when integrating, or keep it as a visual test page.
