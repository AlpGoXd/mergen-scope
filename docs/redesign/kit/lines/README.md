# Lines presentation kit (P4c · LL-2: a line works like a trace)

The exact presentation of reference lines in the left panel and on the charts (board P4c, reference `37-P4c-lines-like-traces.png`). React 19 + TypeScript (strict) components and plain CSS. Like the other kits it is **presentation only**: no stores, no pixel maths, no drag logic, no number formatting.

`demo/Demo.tsx` renders every state with **sample data**; `demo.png` is its output at 2×, light on the left and dark on the right. `tsc` passes with the repo's compiler settings. No dependencies beyond React.

## Where it goes

Put `Lines.tsx`, `types.ts` and `lines.css` in `src/components/lines/`.
- `Lines.tsx` imports the `MenuEntry` type from `../left-panel/Menu`.
- The line row reuses the left panel's classes (`lp-row`, `lp-tag--line`, `lp-input`, `lp-panes`, `lp-pane`, `lp-icon-btn`, `lp-sub`, `lp-link`). It looks exactly like a trace row, so load `left-panel.css` before `lines.css`.

Don't restyle anything; report differences instead. Remove `demo/` when integrating: its `vendor/` folder holds copies of the repo's own `left-panel.css` and `Menu.tsx` so the demo could run.

## Components

| Export | Where | What |
|---|---|---|
| `LineRow` | Lines section | Dashed label · value input · pane badges · ×. Line 2 comes from `lineSummary()`. |
| `lineSummary(p)` | | The text of line 2, e.g. "Shown in P1, P2 · off view in P1 · 3 crossings". |
| `lineShowInEntries(panes, onToggle)` | badge click, or "Show in ▸" | Entries for the existing left-panel `Menu` with `checklist`, the same as a trace's Show in. |
| `lineContextEntries(opts)` | right-click on a line or its label | Show in ▸ · Edit value… · List crossings · Remove from Pane N · Delete V1. |
| `ChartLine` | each pane's SVG plot layer | One copy of a line. |
| `CrossingDot` | plot layer | A hollow crossing dot in the trace colour. |
| `EdgeTag` | HTML overlay inside the pane body | Shown when the value is outside the pane's range. |

More detail:
- **`LineRow` states:**
  - `lit` when any copy is hovered or selected;
  - not in a pane (dashed "—" badge; the summary says how to choose a pane);
  - off view;
  - `invalid` (danger tint).

  H lines have one badge with the tooltip "H lines belong to one pane" and no menu.
- **`lineShowInEntries`:** greyed panes need `disabledReason`, plus a short `aside` ("s ≠ Hz", "no X axis").
- **`lineContextEntries`:** H lines get no Show in and no Remove-from-pane. Show in opens the Show in menu as a second popover from the same anchor.
- **`ChartLine`:** draws the dashed line ("6 4", 1.25 px), a 9 px invisible hit area (ew/ns-resize cursor) and a label chip. The label says "V1", or "V1 · 2" when the line is shown in 2 panes.
  - V labels sit at the top, centred on the line and kept inside the plot. H labels sit at the right end.
  - `lit` gives the accent colour at 2 px; `selected` gives ink at 1.5 px.
- **`CrossingDot`:** hollow, so it never looks like a filled marker. `current` makes it slightly larger: the row picked in "V1 crossings".
- **`EdgeTag`:** "V1 2.400 GHz ›" on the nearest edge: right/left for V lines, top/bottom for H lines. Click pans the pane to the line; it also lights all copies on hover.

## What the app still provides

- **Data:** `paneIds[]` (done in the data step), pane badges in layout order, the crossing count per pane, `offView` (value outside that pane's current X range, or Y range for H lines), and every string formatted with `formatEng`.
- **Pixels:**
  - `at` and `plot` come from the pane's Recharts scales. Render `ChartLine` and `CrossingDot` in a `<Customized>` layer, or wherever lines are drawn now.
  - Position `EdgeTag` inside the pane body with `offset` = the vertical centre of the plot (V lines) or its horizontal centre (H lines).
- **Lighting, all from one piece of state (the hovered or selected line id):**
  - hovering the row, any chart copy or an edge tag sets it;
  - every copy in every pane, its edge tags and its row then get `lit`.
- **Interaction:** dragging any copy moves the one line (all copies follow). Right-click opens `lineContextEntries` in the shared popover. Enter in the row commits the value; parse it, and set `invalid` when parsing fails.
- **Undo** for Show in changes, remove-from-pane and delete (the toasts "V1 also shown in Pane 2", "Deleted V1 from 2 panes").
- **List…** opens "V1 crossings" in Analysis (Analysis kit `CrossingsList`, grouped by pane).

## Replaces

- The old `LineRow` with its link icon (left-panel kit), and the link-icon branches in `Sidebar.tsx`.
- The current line labels and crossing markers drawn in `ChartPane.tsx`. Change that file in small steps and run e2e after each.
