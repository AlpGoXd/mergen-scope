# Pane-types kit (design board P9)

Drop-in code for the empty-pane picker, the header "pane type" chip and the pane-type popover.
It replaces the step-1 versions. **Use these files as they are**: the look is decided, so don't restyle them.
The only changes allowed are the wiring (props, registry mapping, where the components are mounted).
`preview/pane-types-preview.html` is the reference picture: open it in Playwright next to the app and compare.

## Files

| File | What it is |
|---|---|
| `src/components/panes/pane-type-icons.tsx` | `PaneTypeIcon`, the seven icons (24 viewBox, 1.6 stroke) |
| `src/components/panes/pane-picker-layout.ts` | `pickerLayout(w, h)`, pure size-step rule |
| `src/components/panes/PaneTypePicker.tsx` | the empty-pane picker; `PICKER_TILES` default copy |
| `src/components/panes/PaneTypeChip.tsx` | the header control: icon + type name, opens the popover |
| `src/components/panes/PaneTypeMenu.tsx` | popover content: type tiles, or the inline confirm |
| `src/components/panes/pane-types.css` | all styles; app tokens and text-role classes only |
| `tests/unit/pane-picker-layout.test.ts` | thresholds of `pickerLayout` |
| `preview/pane-types-preview.html` | static reference, light and dark, every state |

Import `pane-types.css` once in `main.tsx`, after `text-roles.css`.

## What is wrong in the step-1 build (from the screenshot), and the fix

1. **Header text "PANE 1 · TARGET" is upper-case, accent-coloured and says "TARGET".** Fix: "Pane 1" in `t-card-title`, normal case, `--text` colour. The target pane is shown by the existing target tint and left edge only; never by the word.
2. **The lone type icon at the top left.** Fix: `PaneTypeChip` right after the pane name: an icon and the type's name ("Chart"), as a neutral small control with no ▾. aria-label "Pane type: Chart". It opens the popover; while open it uses the Slate style.
3. **An empty pane shows Fit ▾, Move here, Samples and ⚙.** Fix: an empty pane's header shows only "Pane N", the caption "Empty" and the close ×. (Move here may still appear during a move, as it does today.)
4. **Tiles are centred, stretched across the whole pane, with the icon inline before the name.** Fix: the grid has a maximum width (L 720 px, M 440, S 420). Text is left-aligned. In L and M the icon sits on its own line above the name; in S it is to the left; in I it is alone.
5. **"?" instead of "…" and "›".** That's a file-encoding problem. Fix: the kit writes them as `…` and `›`. Save every edited file as UTF-8 and grep the built app for `file?` and `Analysis ?`.
6. **The descriptions are developer text** ("Cartesian plot of supported scalar traces.", "Smith: planned (separate build)"). Fix: use the copy in `PICKER_TILES`. Keep the registry's `description` for code; the UI uses the tile copy.
7. **Headings don't use text roles.** Fix: L uses `t-title` + `t-caption`, M uses `t-card-title`, S uses `t-caption`. No typed font sizes outside `pane-types.css`.
8. **Chart is shown as selected in the empty picker.** Fix: nothing is pre-selected. The tiles are actions.

## Behaviour

**Empty pane** (a pane with no type and no traces) renders `<PaneTypePicker onPick onOpenFile tiles />` as the pane body.
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
| w ≥ 640 and h ≥ 400 | L | large tiles, description line, heading + sub line, footer line about Eye |
| w ≥ 360 and h ≥ 300 | M | icon above name, heading, footer line |
| w ≥ 300 and h ≥ 150 | S | 34 px buttons, icon left of the name, short lead line |
| smaller | I | 34 × 30 icon buttons, names in tooltips |
| w < 300 and h ≥ 300 | S, 2 columns × 3 rows | |

Otherwise always 3 columns × 2 rows. Order: Chart, Table, Smith / Polar, Spectrogram, Open file….

**Header chip**: the header order is `Pane N` · chip · trace count · (spacer) · scale text · Samples · ⚙ · ⋯.
- When the header gets narrow, the scale text goes first, then the trace count, then the chip's name (`compact`, icon only).
- Samples, ⚙ and ⋯ always stay. The header never wraps.
- An Eye pane's chip reads "Eye · CH1" with the eye icon. Its popover shows only `lockedNote`: "This pane belongs to the Eye diagram card on CH1." (Eye is planned; just keep the path open.)

**Popover**: render `PaneTypeMenu` inside the existing `PopoverAt` from `components/shared/Controls.tsx`, anchored to the chip button (`label="Pane type"`). That gives the shared popover layer, outside-click, Escape and repositioning for free.
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
  - an empty pane shows 6 tiles in 3 × 2 and no Eye;
  - with 4 panes, all tiles are visible without scrolling;
  - the chip opens the popover above the neighbouring pane and Escape closes it;
  - choosing a type that leaves traces shows the inline confirm, and Cancel changes nothing.
- Visual check: screenshot an empty pane at 1440 × 900 with 1, 2 and 4 panes, light and dark. Compare with `preview/pane-types-preview.html` and report any difference.
