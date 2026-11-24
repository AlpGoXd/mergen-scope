# Mergen Scope design

The design spec for Mergen Scope: how the app looks and behaves. The whole design review is one self-contained HTML file, [design-review.html](design-review.html). Download it and open it in any browser; no build or server needed.

**Rules win.** The first board holds the rules every screen follows. If any other board disagrees with them, the rules are right; please open an issue for that board.

## What's inside

The file shows 16 boards in seven rows, read top to bottom and left to right:

1. **Start here:** what the app is, how to read the boards, and the rules.
2. **Look:** Foundations (colour, type and size tokens, interface sizes, motion, toasts) · Colours and themes (trace colours, the colour-blind palette, neutral tints, high contrast, the logo).
3. **Left panel:** files, traces, markers and lines together, with the trace and marker rows · the file card, the Info panel and the Touchstone (S-parameter) matrix.
4. **Panes and charts:** chart type and the pane picker, the chart and its axes · markers and reference lines · layouts, drops and X linking · the Smith pane · planned panes (Polar, Eye diagram, Spectrogram) · export.
5. **App frame:** the one-row toolbar · the footer and App settings · the Analysis panel, armed tools and messages.
6. **Flows:** opening and dropping files, the import wizard.
7. **Landing page.**

Exact colour values (OKLCH) for every theme are in [colour-values.md](colour-values.md).

The eye diagram was designed after this export (24 Nov 2026). Its written guide is [eye-diagram.md](eye-diagram.md); where it differs from the Eye section of the planned-panes board, the guide is right.

## How to view

- It is not published on mergenscope.com.
- GitHub shows HTML files as source, so to read it offline, download `design-review.html` (Raw → save) or clone the repo, then open it in a browser.
- Fonts (IBM Plex Sans, JetBrains Mono) load from Google Fonts when you're online; offline, a system font is used.
- Interactive parts (the toolbar demo, the landing page) are saved in one state.

## What it is and isn't

- It shows the decided design. Anything still open or planned says so on its board.
- It is a picture of the design, not app code. The real tokens live in `src/index.css`, and the app is the final reference for behaviour.

## Changing the design

The review is made in a design canvas and exported here as one file. To propose a change, open an issue or a pull request that describes it in words (a screenshot helps). When a change is accepted, the canvas is updated, re-exported, and `design-review.html` is replaced.

## Licence

The design review is part of this repository and uses its licence. Fonts are linked from Google Fonts under the SIL Open Font License; no font files are included.
