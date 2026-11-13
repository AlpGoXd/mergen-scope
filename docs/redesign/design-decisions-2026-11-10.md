# Design decisions, 9–10 Nov 2026

Put this file in `docs/redesign/`. It sits next to `spec-v3.md`: where they disagree, this file wins until `spec-v3.md` is updated to match. These decisions replace older ones in the boards and in `spec-v3.md`.

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
