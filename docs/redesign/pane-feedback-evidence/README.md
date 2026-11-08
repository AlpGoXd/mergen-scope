# Pane feedback evidence

Captured at 1440 × 900 in Chromium on 8 November 2026 with one voltage CSV copied to four row-layout panes. Light and dark captures are `four-pane-light.png` and `four-pane-dark.png`. Reproduce with `$env:PANE_FEEDBACK_CAPTURE='1'; npx playwright test pane-axis-feedback.spec.ts --config docs/redesign/pane-feedback-evidence/playwright.config.ts --workers=1`; port 5183 must be free. The three CSV cases also cover very large and very small values at 1024 × 640, 1440 × 900 and 1024 × 720. They assert nonempty axis titles and title/tick bounds against each chart area. At 1440 × 900 they require the full `Amplitude (V)` title.

Before the fix the full title extended approximately 11 px above the chart area and was clipped, reproducible with the voltage fixture at 1440 × 900. Its default SVG text anchor placed the rotated title above its intended center. Centering the text anchor keeps it in the chart in the tested cases. This is not proof for every unit, font, zoom level or pane arrangement; abbreviated and absent labels remain possible in smaller plots by the existing fitting rule.

Compared against `referance/00-final-product.png` (light and dark) and `referance/32-P3-pane-header-and-settings.png` (detailed light header; README says newer 00 wins):

- **Fixed:** dark target header is now dark-tinted instead of nearly white; both themes retain the visible target edge. The axis title is centered and fully visible in these captures.
- **Deferred, Phase 5A:** reference uses Pane-hue target tint/edge, trace count, X-link chip and compact name; current target uses accent-blue tint/edge, uppercase name and Target text. The reference header has a settings slider and overflow menu; current header retains Fit, Move Here, Set Target and gear controls. Current header is taller and division readouts use separate X/Y labels. Header redesign and settings interactions remain Phase 5A.
- **Deferred, Phase 5D:** reference illustrates mixed pane types and a 2×2 arrangement; captures use four same-trace row panes because the requested reproduction targets current four-pane behavior. Smith/Table and layout controls remain later pane work.
- **Deferred, Phase 7:** surrounding top/toolbar, right panel and footer differ in controls and composition. The captures intentionally use a simple voltage fixture rather than the reference's network and waveform data, markers and analysis cards.

No full checkpoint or independent ChartPane review is claimed by this worker.
