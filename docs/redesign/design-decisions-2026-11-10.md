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
  - exact CSS in `docs/redesign/kit/analysis/`.
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
