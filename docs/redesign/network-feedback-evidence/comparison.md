# Network feedback comparison

Captured at 1440 × 900 in Chromium with `cascaded chain.s2p`, using the default open Matrix, against `../referance/42-L1-left-panel.png`. [Light](light.png) and [dark](dark.png) use the same file and state; the reference is a design board rather than the same dataset.

- **Fixed in both themes:** the family row, including ABCD, is visible immediately after import. S11 and S21 are selected, and there is no network Restore control. The board also depicts the matrix expanded when one file has just opened.
- **Deferred, Phase 4 continuation / Phase 8 audit:** the Matrix and Info controls sit on a second row, file summary text is absent, controls and cells are taller, Plot as wraps More onto a separate line, and trace rows use legacy names and taller cards. The board's compact row and typography remain the target. These differences appear in both captures and are already tracked in `deferred.md`.
- **Deferred, Phase 5:** the dark target-pane header remains nearly white; chart styling and content do not match the illustrative board state. Existing ledger item V01 tracks the header.
- **Deferred, Phase 7E:** the top bar and strip differ, and the sidebar Open control is disabled. Existing Phase 7A and Phase 4 continuation entries track integration. The captures do not cover populated markers, lines, multiple panes or narrow width.
- **Intentional:** this capture shows two default traces from a different file, not the board's sample file and created trace. The written spec governs any conflict with the board.

Reproduce captures with `npx playwright test --config=docs/redesign/network-feedback-evidence/capture.config.ts` (port 5184 must be free).
