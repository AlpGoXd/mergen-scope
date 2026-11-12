# Landing page handoff (E2)

**Built** on branch `claude/landing-e2` (from `ts_refactor`): `index.html` (figures and bands inline),
`landing-assets/landing.css`, `landing-assets/landing.js`, `landing-assets/img/` (stand-in screenshots),
fonts reused from `landing-assets/fonts/`. What is left before launch: replace the stand-in data and
screenshots with real ones (see "Data honesty" and "Screenshots needed").

Design: boards `E2.dc.html` (desktop) and `E2Phone.dc.html` (360 px) on the canvas
*Mergen Scope Landing Directions*. The board is the reference for spacing and type; this note is the spec.
Three messages, in this order: **it opens and analyses any waveform or signal**, **a lot of analysis is built in (ask for a
missing one)**, **your files stay on your computer. Period.**

## Hard rules

- One static page: `index.html`, one CSS file, one small vanilla JS file. No framework, no build step.
- No third-party requests. Self-host IBM Plex Sans (400, 600) and JetBrains Mono (400) as woff2,
  `font-display: swap`; keep the OFL notices.
- Light and dark from `prefers-color-scheme`; no toggle. No horizontal scroll at 360 px (16 px gutters).
- One primary button, "Open the app". "Try the demo" and every other action are plain links.

## Tokens (OKLCH, from the app's Tokens and Colours boards)

| Token | Light | Dark |
|---|---|---|
| `--bg` | 0.985 0.006 255 | 0.17 0.016 255 |
| `--raised` (answer box) | 0.997 0.003 255 | 0.24 0.016 255 |
| `--line` / `--line2` | 0.90 0.010 255 / 0.78 0.010 255 | 0.31 0.016 255 / 0.42 0.016 255 |
| `--grid` (figure grid) | 0.86 0.010 255 | 0.30 0.016 255 |
| `--muted` / `--text2` / `--text` | 0.50 0.010 / 0.38 0.012 / 0.22 0.015 (h 255) | 0.72 0.016 / 0.82 0.012 / 0.93 0.010 |
| `--accent` (button, progress) | 0.50 0.14 255, white text | 0.78 0.113 255, text 0.17 0.016 255 |
| `--link` | 0.45 0.14 255 | 0.80 0.10 255 |
| traces a / b / c / d (hue 270 / 180 / 0 / 315) | 0.55 0.15 · 0.55 0.10 · 0.55 0.15 · 0.55 0.15 | 0.75 0.127 · 0.75 0.11 · 0.75 0.13 · 0.75 0.13 |
| marker tags a–d | same hues at L 0.50 (b: 0.47 0.09), white text | the trace colour, text 0.17 0.016 255 |

Type: Plex Sans, `font-feature-settings: "ss02"`. Body 17/1.6. H1 46/1.08 600 (34 under 640 px).
H2 24/1.25 600. Privacy statement 56/1.05 600, −0.02em (44 under 1024, 34 under 640).
Numbers, file names and figure labels in JetBrains Mono 400. Container 1280 px, 48 px side padding.

## Sections and exact copy

`<title>` Mergen Scope: open any measurement file in your browser
`<meta name="description">` Spectrum analyser sweeps, oscilloscope captures and Touchstone files, opened, marked and measured in your browser. Your files never leave your computer.

1. **Header** — icon 24 px + "Mergen Scope"; right: link "GitHub".
2. **Hero** — two columns (5fr / 7fr), stacked under 1024 px.
   - H1: Open and analyse any waveform or signal.
   - Lead: Spectrum analyser sweeps, oscilloscope captures, network analyser files from .s1p to .sNp, and anything else saved in columns. Open them in a browser tab, put markers on them and measure.
   - Button: Open the app. Link: Try the demo.
   - Small: Your files never leave your computer.
   - Under 640 px only: The app is made for a laptop or desktop screen, at least 1024 px wide.
   - Right: the **result rotator** (below).
3. **Waveform band** (spectrum sweep, see Bands).
4. **H2: If your instrument saved it, it opens.**
   Text: Spectrum, time domain or network: the contents of the file decide how it is read, not its extension. Open several at once, up to four panes side by side, and save the whole session as one workspace file.
   Two columns (8fr / 4fr; stacked under 1024 px). Left: the four kinds in a 2 × 2 grid (one column under 640),
   each a mono extension line, an H3 and one sentence. Right: the `pane-smith` screenshot (see Screenshots).
   Four kinds:
   - `.dat` · **Spectrum** · Spectrum and signal analyser exports. The header is read too: centre, span, RBW and detector.
   - `.csv · .txt` · **Time domain** · Oscilloscope captures and logs, each channel against time with real units.
   - `.s1p … .sNp` · **Network** · Any number of ports. S, Y, Z and ABCD; dB, magnitude and phase; a Smith chart for reflections.
   - `.tsv · anything` · **Any columns** · Commas, semicolons or tabs. A wizard asks which column is which when it is not obvious.
   - Smith caption: **Smith chart.** Reflections from a Touchstone file, here S11 of `lna_board_rev3.s2p`: at M1, 2.437 GHz, Z = 42.1 + j8.3 Ω and VSWR 1.27. (Take the numbers from the real capture's readout strip.)
5. **H2: A lot of analysis, built in.** (7fr text / 4fr image)
   - Text: Each analysis is a card beside the chart. It works on the trace you choose and updates as you zoom, and a maths result becomes a trace of its own.
   - Three lists (plain lines, no bullets or ticks): **Measure** Bandwidth · Ripple and flatness · IP3 / TOI · Channel power · Occupied bandwidth · Noise density · Peak table · Threshold crossings. **Transform and maths** FFT · A ± B, A × B, A ÷ B · Smooth · Offset and scale. **Network** VSWR · Return loss · Group delay · Stability K and μ · Reciprocity and isolation.
     Keep these in step with the app's analysis registry; drop any that are not built when the page ships.
   - Box (1 px `--line2` border, no fill): H3 "Missing one? Ask for it." Text: Open an issue on GitHub saying what you need to measure, and it will be added. Link: Ask for an analysis on GitHub → the repo's new-issue URL with the "idea" template.
   - Image: `panel-analysis` screenshot. Caption: Analysis cards for S21 of `lna_board_rev3.s2p`.
6. **Waveform band** (scope roll).
7. **Privacy** — H2: Your files stay on your computer. **Period.** ("Period." in `--muted`.) Three columns:
   - **No server** — The app runs in your browser and reads your files there. Nothing is uploaded, ever. There is nowhere to upload to.
   - **No cookies, no trackers, no account** — Settings such as the theme are kept in your browser. The only files the site sends you are its own, and the demo files if you ask for them.
   - **Check it yourself** — Open the Network tab in your browser's developer tools, then open a file in the app. No request is made.
8. **Footer** — "Mergen Scope · open source, Apache-2.0"; links Source on GitHub · Report a problem.

## The result rotator (hero, right column)

Three slides, each: a kind line ("**Spectrum analyser** · `file`"), a figure, a legend, four readings, and an
answer box (big result + how it was got). Above them, three step buttons with a 2 px track; the active
step's track fills over 7 s.

| Step | Kind line | Readings | Answer box |
|---|---|---|---|
| IP3 · Spectrum · .dat | Spectrum analyser · `demo_cascade_ip3_-12dBm.DAT` | M1 tone 1.420 355 GHz +7.53 dBm · M2 tone 1.420 455 GHz +7.56 dBm · M3 product 1.420 255 GHz −36.14 dBm · M4 product 1.420 555 GHz −36.80 dBm | **OIP3 +29.4 dBm** · IP3 card: M1 + (M1 − M3) / 2 · upper side +29.7 dBm |
| Bandwidth · Network · .s2p | Network analyser · `lna_board_rev3.s2p` | M1 S21 2.371 GHz −4.09 dB · M2 S21 2.509 GHz −4.09 dB · S21 peak 2.458 GHz −1.09 dB · S11 in band ≤ −14.7 dB | **Bandwidth 138.6 MHz** · Bandwidth card: −3 dB from the S21 peak · centre 2.440 GHz |
| Phase · Scope · .csv | Oscilloscope · `scope_capture_04.csv` | CH1 1.64 V p-p · CH2 0.94 V p-p · Frequency 400 kHz · D2 from M1 Δt +0.43 µs | **CH2 lags CH1 by 63°** · mean of three periods · CH2 / CH1 −4.8 dB |

**Data honesty.** The IP3 slide is computed from the real files in `demo-assets/` (peak samples, 0.01 dB).
The bandwidth and phase slides are measured from the stand-in data drawn on design board A1. Before
launch, replace both with real files (ideally ones shipped with the demo), recompute every number,
and redraw the figures from them. Never round or tidy a number to look better.

**Figures.** Inline SVG, `viewBox="0 0 640 304"`, plot area x 52–620, y 30–268. Dashed "3 3" grid in
`--grid`, solid 0 line, ticks in Mono 11 px `--muted`, unit once (Y unit above the axis, X unit after the
last tick). Traces 1.5 px solid in their trace colour. Markers: a 10 px triangle in the trace colour with
a 15 px tag above it ("M1"), filled with the tag colour; a delta marker (D2) has an outlined tag drawn
below the trace. Generate the SVG at build time (or by hand) from the data files; don't fetch data at
runtime. Each SVG gets `role="img"` and an `aria-label` describing it.

**Behaviour (JS, ~40 lines).**
- All three slides are in the DOM, stacked in one grid cell (`grid-area: 1/1`); inactive ones get
  `visibility: hidden; opacity: 0` and `aria-hidden="true"`, so the box always has the tallest slide's
  height and the page never jumps. Crossfade 150 ms.
- Advance every 7 s. Pause while the pointer is over the rotator or anything in it has focus; the
  track's CSS animation pauses with it (`animation-play-state`). Clicking a step shows that slide and
  restarts its 7 s.
- `prefers-reduced-motion: reduce`: no auto-advance, no track animation, no crossfade; steps still work.
- Step buttons are real `<button>`s with `aria-pressed`; the region has `aria-roledescription="carousel"`
  and an `aria-label`; slides have `aria-roledescription="slide"` and "n of 3: …" labels. Don't move focus
  on auto-advance.
- Without JS: show the IP3 slide and hide the step buttons.

## Waveform bands (CSS only)

Only time-domain captures, never spectra or sweeps. Two decorative bands, `aria-hidden="true"`,
32 px tall, each with a right-aligned label in Mono 12 px `--muted` and a 10 px swatch in the trace colour:
- **After the hero: "RF out (V) · tx_burst.csv"**, trace colour a (hue 270), **rolling.** The four-burst
  capture (from design board LP4) ends where it starts, so it tiles: an SVG `viewBox="0 0 2000 30"`
  made of two identical halves, inside a track `width: 200%` (400% under 640 px) animated
  `translateX(-50%)` over 40 s, linear, infinite, plus a dashed zero line.
- **Before the privacy section: "CH1 (V) · scope_capture_04.csv"**, trace colour b (hue 180), **drawn on
  like a scope acquisition.** Two lengths of the 10 µs capture (eight periods) in an SVG
  `viewBox="0 0 1000 30"`, `preserveAspectRatio="none"`, `vector-effect: non-scaling-stroke`, drawn
  twice: a ghost copy at 28 % opacity and a live copy animated with
  `@keyframes { 0% { clip-path: inset(0 100% 0 0) } 80%, 100% { clip-path: inset(0 0 0 0) } }`, 7 s linear, infinite.
- Both are stand-in data like the bandwidth and phase slides: replace them with real captures when
  they exist, and keep the labels in the app's trace-name form.
- `prefers-reduced-motion: reduce`: no animation, ghost hidden.

## Screenshots needed

Two, captured from the built app at 2×, WebP ~88, light and dark:
- `pane-smith-{light,dark}`: a Smith pane alone with S11, M1 selected and the readout strip visible. 814 × 786 px.
- `panel-analysis-{light,dark}`: the Analysis panel with Bandwidth, Ripple / flatness and Smooth cards for S21. 642 × 800 px. Use `<picture>` with a
`prefers-color-scheme: dark` source for each, `width`/`height` set, `loading="lazy"`.

## What not to bring back

Screenshot galleries as the whole story, HTML imitations of app panes, unlabelled or invented
waveforms, a formats table, repeated calls to action, pill badges, capitalised eyebrow labels,
icon-card grids, gradients or glow.
