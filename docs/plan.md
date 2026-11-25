# Roadmap

What is planned for Mergen Scope. Done work is not listed here; see the release notes. Items are grouped by theme and are not promised for any date.

## Views and pane types

The empty-pane picker already shows Polar and Spectrogram as greyed tiles ("later" or "needs data").

- [ ] Polar pane (parked on purpose; registry entry exists, renderer not built)
- [ ] Spectrogram / waterfall pane, with its "spectrum series" data kind (parked on purpose)
- [ ] IQ spectrum view
- [ ] IQ time view (magnitude over time)
- [ ] IQ constellation view (covers the Constellation pane)
- [ ] Eye diagram: an Analysis tool that owns its Eye pane, so it never shows in the picker. Designed 24 Nov; the guide is [design/eye-diagram.md](design/eye-diagram.md). Build in three steps:
  - [ ] First version: card and Eye pane, Levels Auto / NRZ / PAM4, Auto and Manual bit timing with the bit lines in the source pane, Clock, UI shown, Range, Trace hue and Grey shading, Amplitude / Timing / ISI and equalization results, opening and crossing overlays, card messages, v5 workspace migration
  - [ ] Next: all six shadings, PAM3 and PAM-N, masks (Custom, Import, sourced presets) with hits and margin, created traces (TIE, pulse response, jitter histogram and spectrum, level histogram), "UI" as an X unit, search shortcut
  - [ ] Later: Statistics (RJ / DJ, TJ and width at BER), bathtub with a Log Y scale, BER contour, then an Equalizer Math card (CTLE / FFE)

## Smith chart

- [ ] Marker right-click menu
- [ ] Saved zoom
- [ ] Thinning of very large traces
- [ ] Start/end labels avoid grid labels

## Markers, tables and analysis

- [ ] Marker tags avoid each other in narrow panes (touches `ChartPane.tsx`: run the chart e2e specs after the change)
- [ ] Marker right-click menu: Add Δ, Move to peak, Delete (Help must list it once it works)
- [ ] Expression card in Analysis
- [ ] Analysis card reorder
- [ ] Table "Near cursor" and "Follow" were removed; decide whether they come back
- [ ] Replace file (built but hidden; decide when to show it)

## File import and export

- [ ] Binary-file import path in the wizard
- [ ] WAV/MP3 import with FFT
- [ ] Audio metrics
- [ ] IQ import (cf32, cs16, cu8)
- [ ] SigMF support
- [ ] Mixed-mode S-parameters
- [ ] Saved import-wizard layouts ("format profiles"; design first)
- [ ] More instrument file formats, as people send samples
- [ ] Vector PDF export in the app's own fonts (parked on purpose)

## Live data

- [ ] Live data source interface
- [ ] Fake signal generator
- [ ] Canvas-based live renderer
- [ ] Stream format spec
- [ ] Python reference bridge

## Optional

- [ ] Spec masks
- [ ] Touchstone de-embedding

## Design and accessibility (design first, then port)

- [ ] Neutral tints (Slate, Stone, Zinc) as theme choices
- [ ] High-contrast theme
- [ ] Colour-blind safe palette for the tool-group chips, not just the traces. Decided direction (Okabe–Ito style): Markers vermillion/orange, Search blue, Lines yellow, Pane sky blue, Analysis reddish purple, Export bluish green. Danger stays red and always appears with its icon and text. Markers and Search then differ in both hue and lightness.
- [ ] Icon pass: replace the × ▾ ‹ › ✓ text characters with drawn icons

## Known limits that may become work

- FFT, Waveform and Harmonics run on the main thread, so very large captures are slow.
- Network analysis is Touchstone only; stability and reciprocity are two-port only.
- No PWA install.
