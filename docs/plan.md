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
