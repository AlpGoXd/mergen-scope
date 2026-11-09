# Lines presentation: evidence (10 November)

Captured with `LINES_CAPTURE=1 npx playwright test tests/e2e/lines-evidence.spec.ts` (2x, light and dark; writes only when the variable is set). Files: `*-app-hover-row.png` (whole app, row hovered), `*-left.png` (left panel), `*-pane-1.png` / `*-pane-2.png` (copies of V1 in two panes, H1 in pane 1, hollow crossing dots), `*-show-in.png` (badge menu), `*-context-menu.png` (right-click), `*-pane-edge-tag.png` (X zoomed: V1 and H1 edge tags), `*-row-h.png` (H row, one badge).

Compared at the end with `docs/redesign/kit/lines/demo.png` and `docs/redesign/referance/37-P4c-lines-like-traces.png`. The kit files `Lines.tsx`, `types.ts`, `lines.css` are in `src/components/lines/` byte-identical to the kit (checked with `cmp`); nothing in them was restyled.

| Difference | Class | Target |
| --- | --- | --- |
| Row, badges, "Shown in P1, P2 · 2 crossings · List…", lit accent frame, H row with one badge, Show in checklist, context menu, "V1 · 2" label chip, hollow crossing dots, edge tags (`‹ V1 1.420 09 GHz`, `^ H1 -23.1762 dBm`) match the kit | Fixed | - |
| The pane frame around the plots (header, axes, grid, tick labels) is the app's own chart, not the kit demo's mock-up frame (the demo pane header shows the range "2.00–3.00 GHz") | Intentional: the kit covers lines only | Phase 5C |
| Close V lines no longer stack their labels (the old per-line vertical offset is gone; the kit puts every V label at the top, centred on its line), so labels of two nearby lines can overlap | Deferred (kit has no stacking rule) | Phase 5C |
| The kit has no "line labels off" switch; the pane setting is honoured with an app rule that hides `.ln-label` (`[data-line-labels="off"]` in `index.css`) | Intentional | - |
| Crossing dots take the trace's OKLCH hue from the trace colour and the kit's lightness and chroma, so a dot is close to but not the exact trace colour | Intentional (kit design: coloured by hue) | - |
| ΔX / ΔY delta brackets between lines are still drawn the old way (board 37 notes line pairs were removed; delta markers replace them) | Deferred | Phase 5C |
| "Edit value…" in the right-click menu focuses the row's value field, so it does nothing while the left panel is hidden | Deferred | Phase 5C |
| Show in and Remove from pane report through Undo toasts ("V1 also shown in Pane 2", "Removed V1 from Pane 1", "Deleted V1 from 2 panes"); the add and remove paths are covered by `line-rows.spec.ts` and `line-chart.spec.ts` | Fixed | - |
| "V1 crossings" card is not grouped by pane yet (it lists crossings with their pane) and the current-row `CrossingDot` highlight is not used | Deferred | Phase 7C |
| The not-in-a-pane row state (dotted label, dashed "—" badge, "Not in a pane: choose one from the badge") comes from the kit but has no screenshot | Deferred | Phase 8 audit |
