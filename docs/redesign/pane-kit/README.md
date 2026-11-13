# Pane-types kit (design board P9) · v2, 11 Nov

Drop-in code for the empty-pane picker, the header **Chart type** control, the Chart type popover and the Chart type section of Pane settings.
It replaces the step-1 versions. **Use these files as they are**: the look is decided, so don't restyle them.
The only changes allowed are the wiring (props, registry mapping, where the components are mounted).
`preview/pane-types-preview.html` is the reference picture: open it in Playwright next to the app and compare.

## Files

| File | What it is |
|---|---|
| `src/components/panes/pane-type-icons.tsx` | `PaneTypeIcon`, the seven icons (24 viewBox, 1.6 stroke) |
| `src/components/panes/pane-picker-layout.ts` | `pickerLayout(w, h)`, pure size-step rule |
| `src/components/panes/PaneTypePicker.tsx` | the empty-pane picker; `PICKER_TILES` default copy |
| `src/components/panes/PaneTypeChip.tsx` | the header control: [Chart type │ icon Chart], opens the popover |
| `src/components/panes/PaneTypeMenu.tsx` | `ChartTypeMenu` popover content (tiles or the inline confirm) and `ChartTypeTiles` for Pane settings |
| `src/components/panes/pane-types.css` | all styles; app tokens and text-role classes only |
| `tests/unit/pane-picker-layout.test.ts` | thresholds of `pickerLayout` |
| `preview/pane-types-preview.html` | static reference, light and dark, every state |

Import `pane-types.css` once in `main.tsx`, after `text-roles.css`.

## v2 fixes (from the 11 Nov screenshot of the wired build)

1. **Tiles had different widths** (disabled tiles shrank to their text). Cause: the Tooltip wrapper `<span class="ui-tooltip-anchor">` around disabled tiles didn't stretch. Fixed in `pane-types.css` (`.ptp-cell > .ui-tooltip-anchor { flex: 1 }` and the same for the popover tiles). Every cell must be the same width.
2. **"Eye diagrams open from Analysis › Eye diagram." removed.** No footer line under the picker.
3. **A pane that has a type but no traces couldn't change its type.** The rule:
   - **untyped pane** = a new pane that never had a type. It shows the picker and the short "Pane N · Empty ×" header.
   - **typed pane** = it has a type, with or without traces. It always shows the full header with the Chart type control (and Samples, ⚙, ⋯). With no traces it shows its type's empty state ("Empty chart" …).
4. **Removing all traces reset the type.** Never. The type is stored on the pane and survives having zero traces, Undo/Redo and save/load (it's part of the pane in the workspace). Only a new pane starts untyped. If the workspace version must change for this, add the migration and test as CLAUDE.md says.
5. **Changing the type wasn't obvious.** The header control now says what it is: `[Chart type │ (icon) Chart]`, with a muted "Chart type" prefix. Chart type can be changed in three places, all using the same tiles:
   - the header control (popover);
   - **Pane settings**: `ChartTypeTiles` is the first section again, headed "Chart type", above the existing sections;
   - **⋯ menu**: "Change chart type…" opens the same popover, anchored to the header control.
   All UI text says "Chart type" (not "Pane type").

## What was wrong in the step-1 build, and the fix

1. **Header text "PANE 1 · TARGET" is upper-case, accent-coloured and says "TARGET".** Fix: "Pane 1" in `t-card-title`, normal case, `--text` colour. The target pane is shown by the existing target tint and left edge only; never by the word.
2. **The lone type icon at the top left.** Fix: `PaneTypeChip` right after the pane name: `[Chart type │ (icon) Chart]`, one neutral small control with no ▾. aria-label "Chart type: Chart. Change chart type". It opens the popover; while open it uses the Slate style.
3. **An untyped pane shows Fit ▾, Move here, Samples and ⚙.** Fix: an *untyped* pane's header shows only "Pane N", the caption "Empty" and the close ×. (Move here may still appear during a move.) A *typed* pane with no traces keeps the full header.
4. **Tiles are centred, stretched across the whole pane, with the icon inline before the name.** Fix: the grid has a maximum width (L 720 px, M 440, S 420). Text is left-aligned. In L and M the icon sits on its own line above the name; in S it is to the left; in I it is alone.
5. **"?" instead of "…" and "›".** That's a file-encoding problem. Fix: the kit writes them as `…` and `›`. Save every edited file as UTF-8 and grep the built app for `file?` and `Analysis ?`.
6. **The descriptions are developer text** ("Cartesian plot of supported scalar traces.", "Smith: planned (separate build)"). Fix: use the copy in `PICKER_TILES`. Keep the registry's `description` for code; the UI uses the tile copy.
7. **Headings don't use text roles.** Fix: L uses `t-title` + `t-caption`, M uses `t-card-title`, S uses `t-caption`. No typed font sizes outside `pane-types.css`.
8. **Chart is shown as selected in the empty picker.** Fix: nothing is pre-selected. The tiles are actions.

## Behaviour

**Untyped pane** (a new pane that never had a type) renders `<PaneTypePicker onPick onOpenFile tiles />` as the pane body.
- `onPick(id)` sets the pane type and shows that type's empty state.
- `onOpenFile` opens the file dialog targeted at this pane.
- Dropping a file or trace on the pane still picks the type that fits (existing logic).
- Map the registry onto `tiles`:
  - available today: Chart (and Table once P2 lands);
  - "later": Smith (until the Smith step), Polar;
  - "needs data": Spectrogram, until a spectrum-series data kind exists.
  - Eye never appears: give it `source: 'analysis'` (or similar) in the registry, and filter it out.

**Size steps**: `pickerLayout` measures the picker's own box (ResizeObserver), not the window.

| Box | Size | Look |
|---|---|---|
| w ≥ 640 and h ≥ 400 | L | large tiles, description line, heading + sub line |
| w ≥ 360 and h ≥ 300 | M | icon above name, heading |
| w ≥ 300 and h ≥ 150 | S | 34 px buttons, icon left of the name, short lead line |
| smaller | I | 34 × 30 icon buttons, names in tooltips |
| w < 300 and h ≥ 300 | S, 2 columns × 3 rows | |

Otherwise always 3 columns × 2 rows. Order: Chart, Table, Smith / Polar, Spectrogram, Open file….

**Header Chart type control**: the header order is `Pane N` · Chart type control · trace count · (spacer) · scale text · Samples · ⚙ · ⋯.
- When the header gets narrow, the scale text goes first, then the trace count, then the "Chart type" prefix (`fit="value"`), then the type name (`fit="icon"`).
- Samples, ⚙ and ⋯ always stay. The header never wraps.
- An Eye pane's control reads "Eye · CH1" with the eye icon. Its popover shows only `lockedNote`: "This pane belongs to the Eye diagram card on CH1." (Eye is planned; just keep the path open.)

**Popover**: render `PaneTypeMenu` inside the existing `PopoverAt` from `components/shared/Controls.tsx`, anchored to the header control (`label="Chart type"`). The ⋯ item "Change chart type…" opens the same popover at the same anchor. Pane settings shows `ChartTypeTiles` under the heading "Chart type"; a choice there follows the same confirm rule (show the inline confirm inside the settings popover). That gives the shared popover layer, outside-click, Escape and repositioning for free.
- Clicking a different available type:
  - if every trace can stay, change the type immediately and close;
  - if some can't, set `pending` with a `TypeChangePlan` built by the same rule as closing a pane (nearest pane with the same X unit, else "Not in a pane"). The popover switches to the inline confirm: Cancel (neutral) and "Show as Smith" (solid).
- Confirm applies the type change and the moves as **one Undo step**. No toast.
- `note` under the tiles is optional, e.g. "Pane 1 shows 3 traces. Smith can only show S11 of them."
- This replaces `window.confirm` for type changes. Pane removal keeps its current confirm for now.

**Type empty states** (type chosen, no data): centred icon (28), name, one sentence, one action, with no illustrations.
- Chart: "Empty chart". "Drop a file here, or tick traces in the Traces list and use Show in › Pane N." Button: Open file….
- Table (P2): "Empty table". "Follow another pane's traces and cursor, or add traces of your own." Buttons: Follow Pane 1 and Add traces….

## Checks

- `npm run typecheck`, `npm run test:unit` (includes `pane-picker-layout.test.ts`).
- e2e tests:
  - an untyped pane shows 6 tiles in 3 × 2, all the same width, no Eye and no footer line;
  - choose Chart, add a trace, remove it again: the pane stays a Chart with the Chart type control, and the type can still be changed;
  - the type survives save and reopen of a workspace with an empty typed pane;
  - Pane settings shows the Chart type section first; ⋯ › Change chart type… opens the popover;
  - with 4 panes, all tiles are visible without scrolling;
  - the Chart type control opens the popover above the neighbouring pane and Escape closes it;
  - choosing a type that leaves traces shows the inline confirm, and Cancel changes nothing.
- Visual check: screenshot an empty pane at 1440 × 900 with 1, 2 and 4 panes, light and dark. Compare with `preview/pane-types-preview.html` and report any difference.
