# Analysis panel (kit), B2 evidence (10 November)

Captured with `ANALYSIS_CAPTURE=1 npx playwright test tests/e2e/analysis-evidence.spec.ts` (2x, light and dark; writes only when the variable is set). `*-empty.png` (panel just opened), `*-app.png` (whole app with Bandwidth, Range Statistics collapsed, Smooth, Threshold crossings and a line's V1 crossings), `*-panel.png`, `*-add-menu.png`.

The kit files `Analysis.tsx`, `types.ts`, `icons.tsx` and `analysis.css` are in `src/components/analysis/kit/`, byte-identical to `docs/redesign/kit/analysis/` (checked with `cmp`). No kit image was opened; the difference list below comes from the kit's README, types and CSS.

| Difference | Class | Target |
| --- | --- | --- |
| Panel header, count, "+ Add analysis" menu (search, All / Math / Measure, Recent, A to Z, reasons for greyed tools, check for added tools, Up / Down / Enter / Esc), AC-3 cards that collapse by header click or Enter with a summary, key/value rows, headline result, generated parameter form, crossings grouped by pane showing only the changing value, Live / Freeze output row, card menu in the shared popover | Fixed | - |
| `--bar-height` (panel header) is mapped to the app's bar size token in `src/index.css`, so the header follows Compact / Comfortable / Large instead of the kit's 32 px fallback | Intentional | - |
| Card menu has only Copy results and Remove; "Create trace" (curve outputs such as the noise PSD overlay) is not there | Deferred | Phase 7C follow-up |
| The `current` crossing row is marked in the list but not highlighted on the chart yet | Deferred | B3 |
| Output row hue: the trace's custom colour when set, else a fixed hue; the family colour resolver is not used | Deferred | B3 |
| The kit builds parameter input ids as `an-param-<field>`, so two cards of one tool repeat the same DOM id (labels still work by nesting order) | Kit issue to report | kit owner |
| Peak Table rows are shown as key/value rows ("#1 · 1.420 45 GHz" and its level); the kit has no table component | Intentional | - |
| A Math output keeps the name it got at creation (for example "offset 0 scale 1") when its parameters change, while its samples follow | Deferred | B3 |
| Trace names in crossing rows are cut with an ellipsis at 320 px (the kit asks for short names; the app passes the display name) | Deferred | B3 |
