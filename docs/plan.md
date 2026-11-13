# Backlog after the interview

| # | Item | Status |
|---|---|---|
| 1 | Table pane (kit in table-kit/). | |
| 2 | App settings sheet and footer "Local only". | |
| 3 | Text-roles pass. | ✓ Done. Every font size, weight and line height in `src/` comes from the role classes, the size variables or the weight tokens (`--fw-*` in `text-roles.css`); no bold Mono. Exceptions (in-plot SVG labels, the hide-the-label trick, export rendering, the landing page) are listed in the commit message; `tests/e2e/text-roles.spec.ts` guards it at Compact, Comfortable and Large. |
| 4 | Finish export (P7). | In progress. ✓ Image export (offscreen render, Copy / Download image, Options): 6ee9a02. ✓ Download SVG, Copy as LaTeX, top bar Export menu, paper-size marks, themed tokens from index.css: e9ae40d. Open: the Export dialog (All panes, live preview), PDF, TikZ options; see `docs/design/deferred.md`. |
| 5 | Open flows (D1). | |
| 6 | Landing redesign. | |
| 7 | Cloudflare hosting. | |
