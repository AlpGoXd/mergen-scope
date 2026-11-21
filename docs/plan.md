# Backlog after the interview

| # | Item | Status |
|---|---|---|
| 1 | Table pane (kit in table-kit/). | |
| 2 | App settings sheet and footer "Local only". | |
| 3 | Text-roles pass. | ✓ Done. Every font size, weight and line height in `src/` comes from the role classes, the size variables or the weight tokens (`--fw-*` in `text-roles.css`); no bold Mono. Exceptions (in-plot SVG labels, the hide-the-label trick, export rendering, the landing page) are listed in the commit message; `tests/e2e/text-roles.spec.ts` guards it at Compact, Comfortable and Large. |
| 4 | Finish export (P7). | Implemented. The centred export dialog includes per-pane titles and legends, editable Paper dimensions, image and CSV controls, vector PDF and TikZ groupplots. Table and Smith panes export as images. See `docs/design/deferred.md` for standalone-file PDF and Smith in TikZ groupplots. |
| 5 | Open flows (D1). | |
| 6 | Landing redesign. | |
| 7 | Cloudflare hosting. | |

## Later (after beta-2 feedback)

| # | Item | Notes |
|---|---|---|
| L1 | Marker tags avoid each other in narrow panes, and Smith start/end labels avoid grid labels. | `src/components/chart/ChartPane.tsx` (fragile: small steps, e2e after each) and `SmithPane.tsx`; plan and implement with Opus at high effort. The beta-2 demo only avoids the collisions through its layout, zoom and marker positions. |
| L2 | Marker right-click menu: Add Δ, Move to peak, Delete. | On the chart and in the Markers list, as the decisions file describes. Help must list it once it works. |
| L3 | Icon pass: replace the × ▾ ‹ › ✓ text characters with drawn icons. | Design first (Claude Design), then port; the decisions file names these characters today. |
