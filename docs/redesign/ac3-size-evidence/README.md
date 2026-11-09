# AC-3 cards, row spacing and Size setting: evidence (10 November)

Captured with `AC3_CAPTURE=1 npx playwright test tests/e2e/ac3-size-evidence.spec.ts` (writes only when the variable is set). Light and dark, 2x: `*-app.png` (full window, Comfortable), `*-left.png` / `*-left-network.png` (left panel: file card summary, trace, marker and line second lines), `*-card-range.png`, `*-card-ripple.png`, `*-panel-header.png`, `*-app-compact.png` / `*-app-large.png`, `*-narrow-1024.png` (1024 x 640). Crossings cards: `../line-crossings-evidence/*-line.png` and `*-manual.png`.

Boards used: 03 (X1, right column AC-3) and 42-L1 / 42b. Boards Z1, A1 and S2 are named in the request and the spec source list, but no such files exist in `referance/`; the written numbers in the request were followed instead.

| Difference against board / request | Class | Target |
| --- | --- | --- |
| File summary line: no negative top margin, 1 px under the name row, 6 px below; marker, trace and line second lines the same | Fixed | - |
| Card: 1 px border, radius 6, raised background, no side stripe; 26 px header band in the Analysis tint (hue 310) with 1 px bottom border; kind icon, bold title, muted source, kebab, close; body padding 6 x 8 | Fixed | - |
| Key/value rows (`MR`): label caption size muted, value body size, weight 600, full ink; result mono, body + 3 px, weight 600, unit muted | Fixed (11 / 12 / 15 px at Compact; +1 / +2 px at Comfortable / Large) | - |
| Threshold crossings line view: header "V1 crossings", one list item per crossing (trace, pane, x, y through `formatEng` with units), shared `Btn` instead of a raw button | Fixed | - |
| Panel header 32 px (bar token): Analysis, count, + Add analysis | Fixed | - |
| "+ Add analysis" collapses or expands the existing chooser; it is not the searchable Add analysis menu (search, Recent, All/Math/Measure chips, capability reasons) | Deferred | Phase 7C |
| Kebab menu holds only Remove; Create trace and Copy results are missing | Deferred | Phase 7C |
| Math/Measure kind icon: ruler for every tool except Trace Ops (f); no per-tool kinds from the registry | Deferred | Phase 7C |
| Header source is cut ("cascade_i...") at 320 px; the short-name rule is not implemented. Source shown only on Range Statistics, Ripple and Bandwidth Helper | Deferred | Phase 7C |
| Cards cannot collapse to one summary row or be reordered by dragging; Peak Table, Noise PSD, IP3 and Trace Ops bodies keep their legacy forms and tables | Deferred | Phase 7C |
| The right panel frame (Tools title, Analysis / Trace Ops chips) is the old frame, not R1 / R8 | Deferred | Phase 7C |
| Size: tokens change bars, footer, rows, buttons and small controls, input height, gap, padding and text sizes. Components with hard-coded px fonts or heights (top bar and strip buttons, chart overlays, many inline-styled cards) do not follow yet; at Large the strip rows are taller than their buttons | Deferred | Phase 8 audit (7A/7B adoption) |
| Strip wraps onto three rows at 1024 x 640 in Comfortable | Deferred (already tracked) | Phase 7E |
| Pane header at narrow width: scale text hides first (container under 520 px), then the trace count (under 400 px), no wrapping. The trace count chip is new (board P3); the Hz chip is not shown | Fixed (count chip), Hz chip deferred | Phase 5C |
| Comfortable is the default. Stored `density` values are ignored, so everyone starts at Comfortable | Intentional (spec change requested) | - |
