# Design reference images

Rendered from the Claude Design canvas "Mergen Scope Design Review" on 8 Nov 2026, at 1× (boards 1440 px wide; 00 and 01 are 1600 px wide with the app at its real size, 1440 × 900).

## How to use them

- **The written spec wins.** `spec-v3.md` (the orchestrator prompt) is the source of truth. These images show what the spec looks like; where an image and the spec disagree, follow the spec and note the difference in the phase report.
- **Newer boards win over older ones.** 00–03 are the latest and already apply every decision. The component (20–25) and pane (30–36) boards are older and were patched, but some drawings still show earlier details (listed below).
- **Every UI phase ends with a comparison:** take the phase's screenshots in light and dark, put them next to the matching image here, and list every visible difference (colour, size, spacing, wording, missing state) as fixed / deferred (with phase) / intentional.

## Files

| File | What it shows | Phase |
|---|---|---|
| 00-final-product.png | The whole app in light and dark, then 8 features in action (armed delta, file drop, toast, Add analysis, export dialog, settings, "?" sheet, empty app) | all |
| 01-full-screen-everything-open.png | The app at 1440 × 900 with every panel open, light and dark, with notes | all |
| 02-shared-rules-and-consistency-check.png | The shared rules (look, behaviour, one home per action, privacy) and the 19 resolved clashes | all |
| 03-armed-messages-analysis-cards.png | Armed state (AR-1), message bars (SC-3), Analysis cards (AC-3), target-pane edge | 2, 5, 7 |
| 10-tokens.png | Colour, type, size and button-role tokens | 1 |
| 11-foundation-details.png | Control states, status colours, chart styling, numbers, layout sizes, motion | 1, 2 |
| 12-colours.png | Trace colours light / dark, created traces, colour-blind order, tag fills (final values are in 10) | 1, 4, 5 |
| 20–25 | Components: marker item, trace row, file card, Touchstone matrix, info panel, column wizard | 4, 7 |
| 30–36 | Panes: chart canvas, markers and lines, pane header and settings, linking, Smith chart, layouts and drops, export | 5, 6 |
| 40-T1-top-bar-and-strip.png | Top bar and tool strip, delta-marker creation, small windows | 7 |
| 41-F1-footer.png | Footer, "?" sheet, Feedback menu | 7 |
| 42-L1-left-panel.png | Left panel assembled, matrix behaviour, one trace in several panes, line rows | 4 |
| 43-D1-opening-files.png | Opening files: the path and the six decisions | 3, 7 |
| 44-S1-app-settings.png | App settings sheet, incl. the Experimental "more than 4 panes" switch | 7 |
| 45-R1-analysis-panel.png | Analysis module contract, Add analysis menu, where results show | 3, 7 |
| 46-R8-app-layout.png | Right panel role, Table pane, where export lives | 5, 6, 7 |

## Known stale details in older drawings (follow the spec instead)

- **31-P2:** the chart still draws a ΔX bracket between V1 and V2. Line pairs were removed; delta markers do that job.
- **34-P5:** says Smith becomes a view in the matrix. Smith is only a pane type; a trace can be in a chart and a Smith pane at once.
- **35-P6:** the Layout popover with a pane-count stepper is replaced by Layout ▾ previews, + Pane and the pane ⋯ menu (T1). Pane count is 4 by default, up to 8 only with the experimental setting.
- **44-S1, 46-R8 and some pane mock-ups:** the footer text "Mode: Marker · Target: Pane 1" and the older top bars are placeholders. The footer is 41-F1 and the top bar is 40-T1.
- **40-T1:** the mock-ups draw the top row at 40 px and the strip at 36 px; build both at 32 px (Details). The minimum window is 1024 × 640.
- **45-R1:** cards drawn without the tinted header band; build them as AC-3 (03).
- **12-colours:** shows options that were considered; the final values are the ones in 10-tokens and the spec.
- **36-P7:** paper text is serif; the chosen serif is IBM Plex Serif (committed OFL font files).
- Sample file names in some boards mention a specific analyser brand; the app and the landing page say "spectrum analyser" in general.

Not included: the landing page and logo boards (out of scope for now).
