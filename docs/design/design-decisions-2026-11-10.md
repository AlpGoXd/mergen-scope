# Design decisions, 9–10 Nov 2026

This file is the written design source of truth. Newer decisions in the sections above take precedence over the detailed requirements below wherever they overlap.

## Look

- **Buttons.**
  - Neutral = an action.
  - Tinted chip in the group hue = on/off.
  - Slate = the selected option in a choice.
  - **An armed tool fills in its group colour**, not Slate.
  - Solid = the one confirm in a dialog.
- **Sizes.** Settings › Appearance › Size: **Compact · Comfortable (default) · Large**.

  | | Compact | Comfortable | Large |
  |---|---|---|---|
  | Buttons | 24 | 28 | 32 |
  | Small controls | 20 | 22 | 24 |
  | Rows | 26 | 30 | 34 |
  | Bars | 32 | 36 | 40 |
  | Footer | 24 | 26 | 28 |
  | Body text | 12 | 13 | 14 |

  Narrow pane headers drop the scale text first, then the trace count, and never wrap.
- **Text roles.** Seven roles and nothing else. No font sizes typed in components, no bold JetBrains Mono (only weight 400 ships).

  | Role | Size / weight |
  |---|---|
  | Title | 14 / 600 |
  | Section header | 12 / 700 |
  | Card or row title | 12 / 600 |
  | Label | 12 / 400 |
  | Value | 12 / 600, Plex Sans, tabular digits |
  | Caption | 11 / 400, muted |
  | Readout | 11 / 400, Mono |

  Comfortable adds 1 px to each.
- **Lines.**
  - Grid dashed "3 3".
  - Reference lines dashed "6 4".
  - **Traces are never dashed:** sources 1.5 px, created traces 2 px.

## Trace colours

- **Source traces:** 8 hues, used in the order 270 · 0 · 90 · 180 · 315 · 45 · 135 · 225.
  - A new trace takes the first hue not on screen.
  - A trace keeps its colour once it has one.
  - A hue freed by removing a trace is reused first.
  - This is the same for every file type (S2P, S4P, S8P, CSV, DAT).
  - Tone: light L 0.58 / C 0.16, dark L 0.75 / C 0.13, clamped to the sRGB gamut.
- **Created traces (ƒ):** their own palette, the 8 hues between the source hues (22.5°, 67.5° … 337.5°), in the created tone (light L 0.46 / C 0.15, dark L 0.84 / C 0.10, clamped).
  - Order, starting at the parent's hue: one step forward, one step back, then onward forward, skipping created hues already on screen.
  - Example, parent 90°: ƒ1 112.5°, ƒ2 67.5°, ƒ3 157.5°, ƒ4 202.5°…
  - A created trace sits indented under its first source in the Traces list, with ƒ.
  - **In colour-blind mode** created traces use the colour-blind set in the created tone, 2 px, ordered from the parent's colour in the colour-blind order (+1, −1, then forward, skipping colours in use).
- **Symbols:** Settings › Colours › **Trace symbols: Off · When colours repeat (default) · Always**.
  - Graph export defaults to Always.
  - When a colour repeats (9th source, 9th created trace), the trace gets a hollow symbol every ~90 px, in this order: ○ □ △ ◇ ▽ + × ☆.
  - The same symbol shows in its row swatch and in exports.
  - **Row swatch with a symbol:** it becomes a 16 × 12 px line sample: the line in the trace colour and width, the symbol centred on it and filled with the row background, never clipped.
- **Sample dots and symbols together:** dots are filled, radius 2, on every sample; symbols are hollow, radius 3.6, every ~90 px. Symbols never hide data: no sample dot is ever removed. With Samples on, each symbol snaps to the real sample nearest its ~90 px position and is drawn hollow with no fill (stroke only), so that sample's dot shows in its centre. With Samples off, symbols stay every ~90 px along the path with the background fill.
- **Colour-blind palette** swaps the 8 source hues for the colour-blind set; all rules stay the same.

## Behaviour

- **Armed tools:** one at a time; arming another releases the first. The armed button fills in its group colour, a hint follows right after the strip, and the footer says the same. Esc cancels. Right-click on an empty chart also cancels.
- **Selection:** one selected item in the whole left panel (marker, line or trace); selecting one clears the other; one frame style.
- **Toasts:**
  - **Only** for delete, closing a file, Apply to all, moved traces and opened files.
  - **Never** for placing or moving markers and lines, toggles, Undo/Redo, or history housekeeping. A full Undo history drops its oldest step silently.
  - One at a time: a new toast replaces the old one.
- **Rename in place, no popup:**
  - Double-click the trace name, F2 or ⋯ › Rename turns the name into a text field in the row.
  - Enter or blur saves, Esc cancels, an empty name restores the original.
  - One Undo step, no toast. The new name is used everywhere (chart legend, cursor card, markers, analysis, export).
  - ⋯ › "Reset name" for renamed traces.
  - The Analysis card's output name (Math cards) is editable in place the same way, synced with the Traces list. A renamed output keeps its name when settings change; "Reset name" restores the automatic one.
- **Popovers:** pane settings and every other popover or menu render in the shared popover layer above all panes, never behind a neighbouring pane.
- **Defaults with nothing selected:** new Analysis cards, + New marker and trace pickers use the selected trace, else the first visible trace in the target pane.
- **Messages:** a neutral bar with a thin status-colour border and a coloured icon; status colours never fill a bar.

## Lines (shown in panes like traces)

- A line goes **only into the pane you click**: never added automatically to X-linked panes or to new panes.
- More panes come from the row's pane badges ("Show in", the same checklist as traces); panes with another X unit are greyed with the reason. H lines belong to one pane.
- **On the chart:**
  - copies are labelled "V1", or "V1 · 2" when shown in two panes;
  - hovering one lights all copies and the row;
  - dragging any copy moves the line;
  - when the value is outside a pane's range, an edge tag "V1 2.400 GHz ›" appears, and clicking it pans the pane there.
- **Right-click** on a line: Show in ▸ · Edit value… · List crossings · Remove from Pane N · Delete. H lines get Edit value…, List crossings and Delete only.
- **Closing a pane** moves its lines and traces to the nearest compatible pane; they show "Not in a pane" only if there's none.

## Analysis

- **Cards:**
  - a neutral card with a header band in the faint Analysis tint and the target trace's swatch in the header;
  - settings above a hairline, results below;
  - exact CSS in `src/components/analysis/kit/analysis.css`.
- **Math cards:**
  - Adding one creates nothing; "Create trace" makes it, into the source trace's panes, nested under the source.
  - The trace then follows its inputs and settings. There's no Live/Freeze toggle; ⋯ › "Freeze as a copy" makes an independent trace.
  - Removing the card keeps the trace as a frozen trace.
- **Trace math lining-up:**
  - Same X points: computed point by point, nothing shown.
  - Different points: show "Stimulus mismatch" with both point counts and ranges, and require the user to choose **Points** (A's · B's · Both) and **Fill gaps** (Linear · Cubic · Nearest · Previous · Next · Sinc). There's no default; Create trace stays disabled until chosen.
  - Compute only where both traces exist; never extrapolate. Touchstone: fill on the complex data, then convert.
  - Hz vs s, or no overlap: Create trace disabled, with the reason.
- **Trace math units:**
  - dBm+dB=dBm, dB+dB=dB, dBm−dB=dBm, dBm−dBm=dB, dB−dB=dB;
  - V±V=V, V×V=V², V÷V=unitless.
  - Anything else is allowed but shows a warning in the card, and the output has no unit.
  - Implemented only by `src/domain/trace-math-units.ts`; the trace-math tool uses nothing else. `units.ts` stays for parsing and formatting.
- **Measure tools draw outlines, never markers:**
  - hollow shapes in the trace colour, shown while the card is open and its eye is on;
  - Peak table: numbered hollow triangles, row ↔ triangle highlight, "+ Marker" per row, ⋯ › "Add all as markers" (with an Undo toast);
  - Bandwidth: a band plus edge ticks at the level;
  - Ripple, OBW, Channel power: a light band;
  - Crossings: hollow dots.
- **Crossings lists** show only the value that changes (y for a V line, x for an H line or a threshold); the constant goes in the card header.

## Touchstone matrix

- **The matrix only adds.** Pick Plot as, click a cell: a new trace "S11 · dB" goes into the target pane. Another view adds another trace.
- A small number on a cell counts traces made from it; hovering lists them with their panes.
- An exact duplicate in the target pane highlights the existing trace instead of adding one.
- On a Smith target, Plot as is ignored and only Sii cells can be added (the others are greyed with the reason).
- **The Traces list shows and removes traces.** No dots, no "plotted" fill.

## Panes

- **A pane-type registry**, like the analysis registry. Each type declares the data it accepts (with a reason when it can't), its settings and its renderer.
  - Build Chart and **Table** now, Smith next (a separate session).
  - **Polar**, Eye, Constellation and Spectrogram are planned entries, added when a data kind needs them. Polar is not built now.
- dB / linear is a Y-axis setting of a chart, not a pane type.
- **Empty-pane picker (board P9):** six tiles in 3 columns x 2 rows: Chart, Table, Smith / Polar, Spectrogram, Open file…. **Eye is not a tile**: it is an Analysis tool (Analysis › Eye diagram); in the registry it carries `source: 'analysis'` and never shows in the picker or the type popover. Nothing is pre-selected; the tiles are actions: clicking an available tile sets the pane type and shows that type's empty state; dropping a file or trace still picks the type that fits. Tile size follows the pane's content box (pure `pickerStep(w, h)`): L (w ≥ 640, h ≥ 400) icon 24, name, one-line description, heading "What should this pane show?"; M (w ≥ 360, h ≥ 300) icon 22 and name; S (w ≥ 300, h ≥ 150) 34 px buttons, icon 16; I (smaller) icon-only 34 × 30; narrower than 300 px but taller than 300 px: 2 × 3. Unavailable tiles are muted, `aria-disabled`, with a caption ("later", "needs data") and the full reason on hover (Polar "later"; Spectrogram "Needs a spectrum series file"; Smith "later" until its step; Table "later" until the Table step). Open file… has a dashed border and opens the file dialog into this pane. Arrow keys move between tiles.
- **Changing the type:** every pane header starts with a 24 × 22 type icon button (`Pane type: Chart. Change type`) that opens a popover in the shared popover layer: title "Show Pane N as", the five types as S tiles, the current one in Slate, unavailable ones greyed with the reason. Choosing a type that would leave traces unplaced asks inside the popover ("Show Pane 1 as Smith?", naming the traces and where they go; Cancel and the solid "Show as Smith"), with the closing-pane move rule, as one Undo step; the confirm is bound to the workspace revision it was built from. Narrow headers: the type icon never hides; the scale text goes first, then the trace count; Samples, settings and ⋯ stay.
- **Empty state after choosing a type:** centred type icon (28), a name, one sentence and one action. Chart: "Empty chart"; "Drop a file here, or tick traces in the Traces list and use Show in › Pane N."; Open file…. Table (P2): "Empty table"; "Follow another pane's traces and cursor, or add traces of your own."; Follow Pane 1 and Add traces….
- **Samples:** a small text toggle labelled "Samples" (no icon) in the pane header next to the sliders button; pressed = on, filled in the Pane hue, `aria-pressed`, tooltip "Show the measured sample points". The first section of pane settings is Display, with a "Samples" chip that always matches the header button. No item in the pane's ⋯ menu. Narrow pane headers keep this button (they drop the scale text and the trace count first). The minor-grid switch is gone.

## Still open

- **PDF export:** needs a new library; bring a proposal at the start of Phase 6.

## Additional shared requirements

- Target pane: new items and pane actions target the selected pane; clicking a pane selects it, with a tinted header and 3 px pane-colour edge. Disabled actions explain the reason; incompatible drops show their reason before release.
- Prefer Undo; confirm when user-created work would be lost. Toasts appear bottom centre for five seconds, pause on hover, and errors persist until dismissed.
- Menus and panels use 120 ms motion; toast entry uses 150 ms. Charts do not animate; respect reduced motion. Use line icons rather than emoji and semantic OKLCH colours rather than component hex values.
- The footer's Local only promise means files are read in the browser, never uploaded; no cookies, bundled fonts, and no network calls except same-site demo files. Feedback opens a GitHub link and does not itself send workspace data.
- Focus uses a 2 px accent outline and 2 px offset. Disabled controls use 45% opacity and a reason; invalid inputs use Danger tint. Use 4/8/12/16/24 spacing; control/card/input/badge radii are 6/8/5/4 px.
- Inputs use 22/24/26 px, gaps 4/6/8 px and panel padding 8/12/14 px across Compact/Comfortable/Large. The minimum window is 1024 x 640; below 1280 px side panels overlay panes.
- Format numbers from visible span and zoom step, use a real minus and a space before units, and accept engineering prefixes and exponent input.
- The footer remains visible without a file, provides settings and help, and uses context-sensitive pane, trace and cursor hints. Feedback links include version and browser/OS only, never file names or workspace data.
- A Table pane lists pane traces as columns after X and highlights the row nearest the cursor; it replaces the former Data tab.
- Workspace settings belong to panes; browser preferences belong to app settings. Panes support layouts, resizing and compatible trace moves with Undo, without losing traces when a pane is removed.

## Neutral and interface colour tokens

**Neutrals (Slate, h 255)**

| Token | Light | Dark |
|---|---|---|
| `--bg` | 0.985 0.006 | 0.17 0.016 |
| `--panel` | 0.965 0.010 | 0.20 0.016 |
| `--raised` | 0.997 0.003 | 0.24 0.016 |
| `--border` | 0.90 0.010 | 0.31 0.016 |
| `--border-strong` | 0.78 0.010 | 0.42 0.016 |
| `--text-muted` | 0.50 0.010 | 0.72 0.016 |
| `--text` | 0.22 0.015 | 0.93 0.010 |

- Accent (links, focus ring, selection): light `0.50 0.14 255`, dark `0.78 0.113 255`.
- Slate "selected choice": light fill `0.92 0.03 255`, ink `0.32 0.06 255`, line `0.80 0.045 255`; dark fill `0.34 0.045 255`, ink `0.93 0.03 255`, line `0.50 0.06 255`.
- Solid: light `0.50 0.14 255` with white text (hover L 0.45); dark `0.78 0.12 255` with near-black text. Solid danger: light `0.52 0.17 25`, dark `0.72 0.15 25`.
- Secondary: light fill `0.95 0.03 255`, line `0.80 0.06 255`, ink `0.45 0.13 255`; dark fill `0.30 0.05 255`, line `0.45 0.08 255`, ink `0.88 0.07 255`.

**UI hues (tinted chip v2).** Marker 20 · Lines 80 · Search 140 · Export 160 · Pane 200 · Left 230 · Analysis 310 · Data 350 · Danger 25. (35° and 285° are retired.) For hue h: light fill `0.95 0.03 h`, line `0.86 0.05 h`, ink `0.45 0.12 h`; dark fill `0.33 0.07 h`, line `0.50 0.10 h`, ink `0.90 0.09 h`. Group background tint: light `0.975 0.01 h`, dark `0.24 0.02 h`. Clamp chroma to sRGB per hue (some hues get less).

**Status (messages only):** danger 25 · warning 85 · success 150 · info 245, using the same fill / line / ink recipe for icons and borders (see the Messages rule: no fills).


## Additional component requirements

- Top bar: Left, Open, Save, Export, Markers, Search, Lines, Pane and Analysis; open tool groups wrap as whole groups. Search offers peak/min and direction; pane controls offer layouts, add pane and fit.
- The footer shows the interaction state, target, trace, cursor and relevant mouse hints; Settings and help remain available in an empty app. The help sheet lists keyboard and mouse commands and the feedback links.
- Left panel order is Files, Traces, Markers, Lines. Files expose matrix, info, replacement and import settings; trace rows provide interpolation and pane membership. The matrix supports S/Y/Z/ABCD, available views, keyboard navigation and port-specific restrictions.
- Chart readouts follow the cursor and flip at edges; tick precision follows zoom, and marker labels avoid overlap. Ref-line and marker selection is shared between the chart and the sidebar.
- Pane layouts include Rows, Columns, 2 x 2 and 1 + side when valid; resizing observes minimums and supports Undo. Default maximum is four panes, with an experimental eight-pane option. A trace retains its identity and markers across compatible panes.
- Smith uses a standalone SVG grid and accepts reflection data; its readout, range, zoom, direction, marker interactions and display settings are per-pane. Unimplemented edge cases and comparison work remain in the deferred ledger.

## Detailed component behavior

The current decisions above supersede any older detail below where they overlap.

- **Tool strip:** shows only the groups that are on, in the same order, as colour zones (faint group tint, group name in its ink colour, then its controls at control-sm). When the open groups don't fit one row, a whole group moves to a second row; a group is never split. With no group on, the strip disappears.
  - **Markers:** `Trace: Auto ▾` (Auto = the trace nearest the click) · split button **+ New ▾**. The main part places a normal marker (N). The arrow menu: "+ Δ from M1", "+ Δ from M2", "+ Δ from selected" (Shift+N). Right-click a marker on the chart or in the list → "Add Δ from M1", "Move to peak", "Delete". **There is no Normal / Delta mode any more.**
  - **Search:** Peak · Next peak · Min · Next min (neutral actions; they move the selected marker, or place one if none) · `Dir L → R` (a dashed setting toggle for which way Next walks).
  - **Pane:** `Layout: Rows ▾` (opens numbered previews of the presets that fit the current count; others greyed with the reason) · + Pane · Fit all. Panes can also be dragged by their header onto another pane's edge.

Left to right: the **state sentence** ("Click: select · drag: move"; when armed, the same sentence as the hint after the strip) · Target **Pane 1** · Trace **S21 · lna_board_rev3** (16-character short name) · X / Y of the mouse in axis units (mono; on a Smith pane Z and Γ) ……… 3–4 **mouse hints** that change with the pane type and the armed state ("Right-drag X zoom · Scroll Y scale · Ctrl+drag pan · Double-click fit") · **Local only** (shield icon; tooltip "Your files are read in this browser; nothing is uploaded") · **Feedback** (speech-bubble icon + word, quiet) · **Settings** (gear, neutral) · **?**.

**Feedback menu** (opens above the button): "Report a problem ↗" and "Suggest an idea ↗". Each opens `https://github.com/AlpGoXd/mergen-scope/issues/new` in a new tab with a pre-filled `title` and `body` (a short template: what happened / what you expected, or the idea; plus app version, browser and OS from `navigator.userAgent`). Never include file names, data or anything from the workspace. Footer note in the menu: "Needs a GitHub account. Adds the app version, browser and OS; never your files." GitHub only, no email. The app itself sends nothing (privacy rule): it only opens a link. The same two links appear in the "?" sheet footer and in Settings › About.
Small windows: hints hide first, then "Local only", "Feedback" and "Settings" become icons, then the trace name.

**"?" sheet** (opens above the button, or Shift+/; same list in Settings › Keyboard shortcuts):
- Mouse: right-drag X range zoom · scroll Y scale (Smith: zoom both) · Shift+scroll Y offset · Ctrl+scroll X zoom around the cursor · Ctrl+drag or middle-drag pan (X moves the linked group, Y only this pane) · double-click fit all · click a marker tag to select · right-click a marker for its menu.
- Keyboard: Ctrl+O open · Ctrl+S save workspace · Ctrl+Shift+E export… · Ctrl+Shift+C copy target pane as image · Ctrl+Shift+S download target pane as image · Ctrl+, settings · N new marker · Shift+N Δ from the selected marker · M / S / L / P toggle the four groups · [ / ] left / right panel · Space or F fit all · Backspace previous zoom · Esc cancel / close · Delete remove the selected marker or line · ← / → move the selected marker one point · Ctrl+Z undo · Ctrl+Y and Ctrl+Shift+Z redo.
- Footer line: "Mergen Scope · version · About · Feedback on GitHub ↗ · Your files never leave this browser."


- Four sections in this order: **Files → Traces → Markers → Lines**. One scroll for the whole panel; the header of the section you're in sticks to the top. Section header (26 px): ▾ name, count, ⋯ menu with the "all" actions (Files: Close all files… with Undo · Traces: Show all / Hide all · Markers: Remove all · Lines: Remove all). Click the header to collapse; remembered as a preference. Only Files has a button: **Open…**. An empty section shows one muted line saying where its items come from.
- No file open: the panel is one drop zone ("Drop files here", formats, Open… and Load demo, "Files are read in this browser; nothing is uploaded").
- **File row (C03):** 26 px; format badge (mono, neutral, 30 px) · name (shortened in the middle, full name and summary on hover) · for network files a **Matrix** toggle (▾ closed neutral, ▴ open in Slate; open state remembered per file, also in workspaces) · ⋯ · ×. Multi-column CSV: **Columns ▾** with a checklist. A single-trace file whose trace was deleted: dashed border and a **Plot** button. ⋯ menu: Info · Replace file… · Edit columns… (CSV only) · Rename · Show all / Hide all (multi-trace files) · Remove file… (danger text). Removing asks first only if the file made more than one trace or has markers. Parsing: 2 px accent bar along the bottom plus a percentage. Error: Danger tint, reason in the tooltip, "Fix…" opens the wizard or Replace file….
- **Matrix (C04):** under the file row. Family `S · Y · Z · ABCD` (ABCD only for 2-port files, otherwise greyed "2-port only"). **Plot as** for S: `dB · Mag · Phase · Re · Im`; Y, Z, ABCD have no dB (Mag default); **More ▾** holds VSWR, Return loss (both Sii only, greyed on Sij) and Group delay. **No Smith in Plot as** (Smith is a pane type). ≤ 8 ports: a labelled grid of tinted cells (label size follows the cell width, 12 → 9 px); > 8 ports: a list picker (row, column, + Plot; plotted parameters as removable chips; indices ≥ 10 written "S12,3") with "Grid…" opening the full grid in a popover. Quick picks for 3+ ports: All Sii · All Sij · Lower ◣ · Clear (danger ink). **The matrix only adds** (10 Nov): pick Plot as, click a cell, and a new trace "S11 · dB" goes into the target pane; another view adds another trace. A small number on a cell counts the traces made from it; hovering lists them with their panes. An exact duplicate in the target pane highlights the existing trace instead of adding one. On a Smith target, Plot as is ignored and only Sii cells can be added (the others are greyed with the reason). Tooltip says what a click will do ("Add S11 · dB to Pane 2 (target)"). Keyboard: arrows move, Enter/Space adds. **The Traces list shows and removes traces**: no dots, no "plotted" fill.
- **Info (C05):** opens under the file row (with the Matrix if both open, Matrix first). Header "Info" with **Table / Raw** switch and Copy. Table: the fields exactly as parsed, no grouping, values formatted with the number rules. Raw: the header text as in the file. Copy puts "key: value" lines on the clipboard. No metadata: "No header fields in this file".
- **Trace row (C02):** a tiny title row (10 px, muted) "Name · Interp · Pane". Row: checkbox (show/hide) · swatch (hollow when hidden; carries the trace's symbol when colours repeat) · name (= the file name, shortened in the middle; double-click to rename) · interpolation chip (`Auto · Exact · Lin · Near · Prev · Next · Cub`, opens a menu with one-line explanations and "Apply to all traces from this file") · **pane badges** (P1, P2 …; click opens a "Show in" checklist of panes; same-unit panes only, others greyed with the reason) · ×. Second line (subtle) only when needed: "S21 · dB" for network traces, the column name for CSV. Created traces nest under their parent with └ and ƒ; their name is the operation ("smoothed · SG 7", "A − B"). Selected: 1.5 px border in the trace colour. Hover shows a drag handle; hidden traces grey out and hide their markers.
- **Marker item (C01):** 28 px line 1: label chip (normal = filled in the trace colour; delta = outlined, with a light tint of its trace hue) · editable X input (mono) · Y value · ×. Line 2: trace name (file · parameter; file shortens first), pane badge(s), "● snap" or "≈ interp". Deltas stay in creation order (no nesting); line 2 says "from **M1 ▾** · at 2.449 00 GHz" (the chip changes the reference; nothing moves). Hovering a delta highlights its reference row and the reverse. If the reference is deleted, the delta becomes a normal marker at its absolute position.
- **Line row (LL-2, board 37-P4c; replaces line linking):** a reference line works like a trace: one line, one row, shown in one or more panes. Row: dashed neutral label (V1, H1) · editable value · pane badges (P1, P2; click opens the same "Show in" checklist as a trace row, panes with another X unit greyed with the reason, Undo on every change) · ×. Line 2: "Shown in P1, P2 · 3 crossings · List…" (List… adds a Threshold crossings card "V1 crossings" in Analysis, grouped by pane; each pane counts its own crossings and the row adds them up; "off view in P1" when a pane shows the unit but not the value). No link icon. A line shown in no pane stays in the list as "not in a pane" ("Pick a pane from the badges to show it"), like an unplaced trace. **Closing a pane** works like it does for traces: the line's copy in that pane is dropped, and if it was the line's only pane the line moves to the nearest compatible pane (same X unit for V lines, same Y unit for H lines; visual order, the previous pane first); only when no compatible pane exists does it become "not in a pane" (decided 10 November, board 37-P4c step 07). **Placing:** a V or H line is created in the clicked pane only, at the cursor (a V line at the cursor's X value, an H line at its Y value). Nothing is ever added automatically: not to panes whose X axis is linked, not to new panes. A line is shown in more panes only when the user ticks them in Show in. **H lines** belong to exactly one pane (Y is never shared); their single badge shows the tooltip "H lines belong to one pane" instead of a menu. **Chart:** a line shown in more than one pane is labelled "V1 · 2" (pane count); hovering or selecting one copy lights every copy in the accent colour, together with its row; dragging any copy or typing the value moves all copies; unticking a pane (or right-click "Remove from Pane 1") removes only that copy; × on the row, Delete or the context menu deletes the line everywhere, with Undo; right-click on a line or its label offers Show in ▸ · Edit value… · List crossings · Remove from Pane N · Delete V1. A pane that shows the line's unit but not its value shows an edge tag on the nearest edge ("V1 2.400 GHz ›"); clicking it pans that pane to the line.

- **Zoom and pan:** as in the "?" sheet. Cartesian: right-drag X range, scroll Y scale, Shift+scroll Y offset, Ctrl+scroll X zoom around the cursor, Ctrl+left-drag or middle-drag pan, double-click / Space / F / Fit = fit all, Backspace previous zoom.
- **Chart canvas (P1):** grid and 0 line as in section 3; ticks JetBrains Mono 11 px muted; precision follows the zoom step; unit written once (Y unit above the Y ticks, X unit at the end of the X axis); no axis titles unless a pane holds traces with different units (then Y titles appear). Selected trace +0.5 px. **Cursor card (K-B2):** follows the cursor, flips to the left near the right edge; one row per visible trace (swatch, value, unit, short name) in the same order as the dots; the X value as a tag on the X axis. **Short names (16 characters):** 1 a renamed file wins; 2 drop the extension; 3 drop the start all traces share (only at `_ - .` or space, keep ≥ 4 characters, show a leading "…"); 4 network traces keep their parameter ("amplifier…sweep · S21"), created traces show their operation ("ƒ smoothed"); 5 still too long: cut the middle, keep whole words from both ends.
- **Markers and lines on the chart (P2, M-D):** glyph 10 px in the trace colour with a 1.5 px halo in the chart background (● normal, ▲ peak, ◆ delta). Tags (mono 11): filled for normal, outlined for delta; 4 px above the glyph, flipping below near the top edge; if two tags would overlap the later moves a row. Unselected markers show only their name; the selected marker adds its Y to the tag, gets a solid 2 px ring, and its X becomes a tag on the X axis with one dotted guide. A selected delta shows its Δ ("D3 Δ −37.9 dB", axis "Δ −100.0 kHz") and a dashed L bracket from its reference. Reference lines: tags inside the plot (V along the top, H at the right edge); hollow dots in the trace colour where a line crosses a trace. Selection is shared with the marker list.
- **Smith pane (P5):** own SVG renderer (`SmithChart.tsx`, no library); Recharts stays for Cartesian.
  - Grid: resistance circles 0.2 / 0.5 / 1 / 2 / 5 and reactance arcs ±j0.2…±j5 in `--border`, outer circle and real axis in `--border-strong`. Labels mono 10 muted with a background halo, never rotated: resistance values on the real axis at the left edge of each circle; reactance outside the rim, +j top, −j bottom; 0 and ∞ at the axis ends. Zooming adds lines (0.1, 0.3, 0.7, 1.5, 3) to keep them 40–80 px apart; labels follow to where an arc leaves the view; if two labels overlap the smaller value goes first. Normalised by default ("+j0.5"), Ω optional (× Z0).
  - Grid setting `Z · Y · Z+Y`: Y = the same grid rotated 180°; the trace and markers never move (the point is Γ). Z+Y: Z solid, Y dashed and lighter.
  - Accepts reflection parameters only (Sii of any network file, also Z11 / Y11 converted with the file's Z0). Dragging a transmission parameter or a non-complex trace over a Smith pane dims it with the reason; releasing does nothing. |Γ| > 1 is shown: the view grows, the area outside the unit circle gets a light Warning tint and a dashed edge.
  - Direction (D-A, default): hollow dot at the start, filled dot at the end, each with its frequency, chevrons every 1/5 of the on-screen length toward higher frequency. Settings: Chevrons · Ends · Off.
  - Markers store a frequency, like Cartesian markers; clicking takes the nearest sample in screen pixels. **Readout strip** (30 px at the bottom of the pane): swatch, name, short trace name, then per the Readout setting `Z · Y · |Γ|∠ · VSWR / RL` (defaults follow the grid), plus the equivalent L or C; `‹ 2 / 3 ›` steps through the pane's markers (also Tab / Shift+Tab). Fields drop from the right in a narrow pane. A delta shows Δf and ΔRL plus its own Z. Hover: nearest point with the cursor card (f, Z, |Γ|) and the r-circle and x-arc through it lit in accent.
  - Zoom: scroll zooms both axes around the cursor; Ctrl+drag / middle-drag pans; Space or double-click fits. One transform on the SVG group; strokes use `vector-effect: non-scaling-stroke`. Settings: the Grid section of the popover is replaced by Smith (Grid, Labels, Direction, Readout); "Apply to all Smith panes".
- **Table pane (R8):** a pane type that lists the traces of its pane as columns (X, then each trace with its unit), following the cursor: the row nearest the cursor is highlighted in Slate. It replaces the old Data tab and is the first pane type built after the registry.
- **Layouts (P6):** presets Rows (default) · Columns · 2 × 2 (exactly 4 panes) · 1 + side (main pane plus a stack on the right). Presets that don't fit the count are shown greyed with the reason. Resize by dragging the 8 px gap (divider turns accent, a tag shows "64 % · 36 %", other panes dim slightly; min 160 × 120; double-click = equal sizes; sizes remembered per layout). Drag a pane by its header onto another: "⇄ Swap with Pane 3". Names follow position (P1 is top-left) and P# badges update after a swap. Overlays fade in 120 ms; panes never animate their size.
- **Pane count:** 1–4 by default from one setting (`MAX_PANES`); nothing may assume 4. **Experimental:** App settings › Experimental › "Allow more than 4 panes (up to 8)", off by default, marked "not recommended". Above 4 panes only Rows and Columns are offered.
- **Drops on panes (P6 + D1):** dragging a trace row onto a pane **moves** it ("Move to Pane 2"); the source says "Already in Pane 1"; a pane of another X unit, or a Smith pane for a non-Sii trace, dims with a Warning message and the reason; a "+ New pane" strip appears under the panes while there are fewer than `MAX_PANES`. A new empty pane shows the pane types as large icons (Chart and Table now, Smith when it is built); dropping a file or a trace picks the type that fits, and the first trace sets its unit.
- **One trace in several panes (T-B):** a trace can be shown in up to one copy per pane (so up to the pane count). Same colour, same markers (a marker belongs to the trace and shows in every pane the trace is in). Added from the matrix (to the target pane) or from the trace row's "Show in" checklist. The × on a pane badge removes it from that pane only; the row × deletes the trace.
- **Removing a pane (P6, planPaneRemoval):** one pure function `planPaneRemoval(panes, traces, removedPaneIds) → { moves, unplaced }`, used by remove pane, the layout change and the type switch, with unit tests for every case. A trace is **never** moved into a pane of another X type. A trace that is still in another pane just loses this pane. Empty pane: removed, no dialog. All traces fit another pane: they move to the nearest pane of the same X type (above first, then below), toast "2 traces moved to Pane 1 · Undo". Some don't fit: a dialog lists each trace and where it goes; the rest stay in the trace list **without a pane** (dashed row, "—" badge, "not in a pane, drag onto one"), markers kept but hidden. Nothing is deleted.

- Holds only Analysis, closed by default. Adding an analysis or clicking the Analysis chip opens it; removing the last analysis or clicking the chip closes it. Header: "Analysis" (hue 310) · count · **+ Add analysis**.
- **Add analysis menu (A-1):** search box, Recent, then everything A–Z; the kind as the icon on each row (ƒ = Math, ruler = Measure); filter chips All · Math · Measure. Items that can't run on the target trace are greyed with the reason; open ones show ✓. Views (VSWR, return loss, group delay, phase) are not here; they are in the matrix.
- **Cards (AC-3):** a neutral card (1 px border, radius 6) with a **26 px header band in the faint Analysis tint**: kind icon · title · short source · ⋯ · ×. Body: source line (trace · file · pane), the generated settings form, results (big value in mono). No coloured left stripe. Measure cards: results, eye (show on chart), ⋯ = Create trace (if it has a curve), Copy results, Remove. **Math cards (10 Nov): adding one creates nothing**; the card holds the settings and **Create trace**, which makes the trace in the source trace's panes, nested under the source. The trace then follows its inputs and settings. There is no Live / Freeze toggle: ⋯ › "Freeze as a copy" makes an independent trace; removing the card keeps the trace as a frozen trace. Cards collapse to one row with a summary and can be dragged to reorder.
- **Architecture (R5):** three registries: data kinds, pane types, analysis tools. Each analysis is one module + one registry line with this contract: `kind` (math · measure · view) · `meta` (id, title, one-line description) · `appliesTo(trace)` (ok, or the reason) · `params` (a small schema the form is generated from) · `compute(inputs, params)` (pure, unit-tested, may run in a worker) · `outputs` (numbers · table · overlay · trace). Replace today's switch of hand-written cards and their pastel hex colours with this. Existing tools to port: noise PSD, IP3 / TOI, occupied bandwidth, channel power (gated to density units), peak table, range statistics, 3 dB / 10 dB bandwidth, threshold crossings, ripple / flatness, reciprocity / isolation, 2-port stability (K, mu1, mu2, |delta|), smoothing, A ± B / × / ÷, offset · scale. VSWR, return loss and group delay become views in the matrix.

## Detailed open flows, export and settings

The following requirements supplement the newer decisions above. Where implementation has changed, verify it against the open items in `deferred.md` before treating a requirement as complete.

### 5.6 Opening files (D1)
- Every way in follows one path: drop on a pane · drop elsewhere · Open… (top bar or Files header) · the empty app.
- What is it? A saved workspace → if something is open, ask "Open workspace '…'? It replaces the N open files, their traces, markers and panes. You have unsaved changes." [Cancel] [Save first] (Secondary) [Replace] (solid). Data files dropped together with a workspace are added after it. No merging of workspaces.
- Data file: if the layout is recognised by content with high confidence (R&S header, valid Touchstone option line), read it directly; otherwise the column wizard (C06).
- **Which traces appear:** single trace (.dat, one-column CSV) → its trace · .s1p → S11 dB · .s2p → S21 and S11 dB · 3 ports or more → nothing plotted, the Matrix opens with "Choose what to plot" · CSV → what the wizard marked as Y, or all numeric columns up to 8 when recognised without the wizard.
- **Where they go:** dropped on a pane → that pane; if its X unit doesn't fit, the drop is refused before release with the reason and where it can go. Opened any other way → the target pane if the unit fits, else the first pane with that unit, else a new pane (if under `MAX_PANES`), else the trace list "not in a pane" with the reason in the toast.
- Same file name already open → dialog "lna_board_rev3.s2p is already open. Replace it with the new copy? Traces keep their colour, panes and markers where the parameter still exists." [Cancel] [Open as a second copy] (Secondary, the copy gets " (2)") [Replace] (solid).
- Unsupported file → refused on the drop with a Danger message ("Can't open report.pdf · Mergen Scope opens .sNp, .dat, .csv, .txt and saved workspaces").
- Drop feedback is local: only the pane under the cursor (or a slim banner over the panes) lights up. Remove today's full-window dark overlay.
- After: one toast for the whole drop with Undo; files that fail stay in the list with their error row and are counted ("2 opened · 1 couldn't be read").

### 5.7 Column wizard (C06, W-A)
One screen: settings on the left (delimiter `, ; Tab`, skip rows, domain Frequency / Time with "Detected: … (confidence)", units for X and Y as menus, not ×1000 multipliers), live preview on the right with a role chip (X · Y · —) in every column header. "Will create 2 traces: … · CH1 (V), · CH2 (V)". Several files: "File 1 of 3", "Use these settings for the other 2 files", Skip file. Buttons: Cancel · **Add N traces** (solid). Errors (no numeric column, no X) disable the confirm with the reason as a message. **Edit columns…** opens the same wizard pre-filled with the file's real previous settings (fixes bug 13) and says what will happen to existing traces ("CH2 is no longer a Y column: its trace and 1 marker will be removed").

### 5.8 Export (P7)
- Two quick paths, no dialog: **Copy as image** (Ctrl+Shift+C, clipboard) and **Download image** (Ctrl+Shift+S), both with the last-used options; the toast offers "Options…".
- **Export dialog** (pane ⋯ → Export…, or top bar Export… with What = All panes): What (This pane · All panes · Pick…) · Format (PNG · SVG · PDF · TikZ · CSV) · Size (Screen · Slide · Paper 1-col · Paper 2-col · Custom px with 1× / 2× / 3×) · Theme (Print white · Dark · As app; default from App settings) · Include (Title, Legend, Marker tags, Marker table, Ref lines, Date) · Title · Legend (Below (default) · Inside · Off) · Names (Full · Short 16) · file name pattern `{file}_{pane}_{date}`. Live preview. Buttons: Cancel · Copy (neutral) · **Save …** (solid). Remembers choices per format.
- The image is rendered again at the target size from the same SVG renderer (sharp at any size), never a screenshot. Never in the image: crosshair, selection rings, cursor card, header buttons, link chip. "All panes" keeps the layout and proportions with one title and one legend.
- **Paper presets (IEEE):** 1 column 88.9 mm (3.5 in), 2 columns 181.9 mm (7.16 in); text 8 pt (9, 10 one click away), serif default (Sans option), lines 0.5 / 0.75 / 1 pt, in mm and pt at final size. Axis titles on, pre-filled from units ("Frequency (GHz)", "Magnitude (dB)"). Print-safe lines: trace symbols default to **Always** in export (○ □ △ ◇ ▽ + × ☆, the same order as on screen), with dashes only here (solid ○, dashed □, dotted △), plus colour at L 0.50. Paper look: white background, black frame, light grey grid, no UI colours or tints, marker tags as plain labels with a leader line. PNG fallback at 600 dpi. PDF with embedded fonts and SVG as vectors.
- **TikZ / PGFPlots:** ready-to-paste figure (axes, grid, legend below, print-safe styles, marker pins, trace colours as named `\definecolor`s); options: wrap (figure + caption · tikzpicture only), width (`\columnwidth` · `\linewidth` · fixed), data (inline · .dat files zipped), points (all · 300 per trace), colours (trace · grayscale). "Copy as LaTeX" in the pane ⋯ menu.
- **CSV:** visible X range or full data, all traces in the pane or visible only, include markers. Replaces today's "Export Visible CSV".

### 5.9 App settings (S1)
Footer gear (or Ctrl+,) opens a side sheet over the right panel (120 ms); charts stay visible and update live; Esc or × closes. Title "App settings · all panes, saved in this browser". Sections: **Appearance** (Theme Light · Dark · System; Size Compact · Comfortable · Large (default Comfortable); Neutral colour Slate, more later) · **Colours** (Palette Standard · Colour-blind safe = the reordered wheel; **Trace symbols** Off · When colours repeat (default) · Always) · **Export** (export theme) · **Experimental** ("Allow more than 4 panes (up to 8)", off, not recommended) · Keyboard shortcuts › · About › (version, licence Apache-2.0, GitHub link, the two feedback links) · Reset all to defaults. Ends with a hint that grid, markers, lines and Smith options are per pane (sliders icon). Saved in `localStorage`, never in workspace files.
