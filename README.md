# Mergen Scope

<p>
  <img src="landing-assets/brand/logo-mark.svg" alt="Mergen Scope" width="72">
</p>

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

**A browser workspace for spectrum analyzer, scope and S-parameter files. Your files stay in your browser.**

[**Try the demo**](https://mergenscope.com/app.html?demo=1) · [**Open the app**](https://mergenscope.com/app.html) · [User guide](docs/guide/README.md) · [Design docs](docs/design/README.md) · [Sample files](test%20files/) · [Feedback](https://github.com/AlpGoXd/mergen-scope/discussions)

![Mergen Scope workspace with a four-pane layout showing gain, Smith chart, waveforms, and two-tone IP3 analysis](docs/images/mergen-scope-workspace.png)

## Try it in 30 seconds

1. Download a file from [`test files/`](test%20files/), for example `cascaded chain.s2p` or `scope_1khz_sine_100ksps.csv`.
2. [Open the app](https://mergenscope.com/app.html).
3. Drop the file into the workspace and place a marker on the trace.

No file at hand? [Load the demo workspace](https://mergenscope.com/app.html?demo=1).

## Supported files

| Format | What you get | Tested with |
| --- | --- | --- |
| R&S `.dat` | Spectrum traces with span, RBW and detector metadata. Amplitude-only exports rebuild the X axis from Start/Stop. | R&S FSVA3044 exports (`cascade_ip3_*.DAT`) |
| `.csv`, `.tsv`, `.txt`, tabular `.dat` | Time or frequency traces. An import wizard maps delimiter, header rows, X/Y columns, multipliers and units. | Oscilloscope CSVs (`scope_1khz_sine_100ksps.csv`) |
| Touchstone `.s1p` to `.s16p` (1.x and 2.0) | S-parameter networks in RI, MA or dB/angle form, with S, Y, Z and (two-port) ABCD views, VSWR, return loss, group delay and a Smith chart. | `cascaded chain.s2p` |
| Workspace `.json` | A saved session: data, panes, markers, lines and analyses. | Round trip in the unit tests |

R&S `.dat` is the primary tested instrument path. Generic tables may need manual column and unit mapping.

## Features

One rule runs through the app: when something can't be done, it says why, instead of failing silently or producing a wrong number.

### Four pane types

- **Chart:** traces against frequency or time on linear or logarithmic axes. Right-drag to zoom, Ctrl+drag to pan, scroll to zoom the Y axis, double-click to fit. The measured sample dots appear once you zoom in far enough to tell them apart.
- **Smith chart:** reflections (S11, S22, ...) as impedance or admittance, with a frequency range bar and Z, Γ and VSWR readouts under the pointer.
- **Polar:** magnitude against angle, for example an antenna gain cut.
- **Table:** every sample of a pane's traces as rows.

Up to four panes (an experimental eight-pane layout too). Drag traces onto panes, and reorder traces and analysis cards by dragging.

**Linked X axes:** link panes from the link chip in a pane's header. Zooming one moves every linked pane, fitting shows the X range of the whole group, and a pane with an incompatible unit (time against frequency) is greyed out with the reason.

### Unit-aware trace math

- **A + B, A − B, A × B, A ÷ B**, with the result unit worked out from the inputs: dBm + dB gives dBm, dBm − dBm gives dB, V × V gives V².
- It **warns, never blocks**, on mistakes such as adding two dBm levels (convert to watts first to add powers).
- Traces on different X points: you choose whose points to use (A's, B's or both) and how to fill the gaps (linear, cubic, nearest, previous, next or sinc). Nothing is extrapolated, and a time trace is never combined with a frequency trace.
- Touchstone traces are interpolated on their complex values before converting to dB or phase.
- A math trace follows its inputs; freeze a copy to keep it fixed. More in the [trace math guide](docs/guide/trace-math.md).

### Import wizard

- Detects the delimiter (comma, semicolon or tab) and the header rows, with a live table and plot preview.
- Pick the X column and one or more Y columns, set units and multipliers, and choose the time or frequency domain.
- Blank or non-numeric cells are skipped instead of becoming zeros, binary files are refused, files over 50 MB ask first and files over 500 MB are refused. More in the [CSV guide](docs/guide/oscilloscope-csv.md).

### Markers and lines

- Normal and delta markers, peak and minimum search, next peak in either direction, and tone roles for IP3. Markers interpolate between samples and snap to sparse ones.
- Vertical and horizontal reference lines that list their intersections with traces. Dragging a marker or a line is one undo step.
- **Interpolation per trace:** choose how values between samples are read (auto, exact, linear, cubic, nearest, previous, next or sinc, where the sampling allows it) from the trace row. Markers and the pointer readouts use it, and **Apply to all traces from this file** sets a whole file in one undo step.

### Analysis

- **Spectrum and RF:** harmonics (THD, SFDR), IP3, noise PSD, occupied bandwidth and channel power.
- **Time domain:** frequency, period, levels, RMS, rise/fall time, overshoot and duty cycle; resample; FFT with windows, averaging and max hold.
- **Networks:** VSWR, return loss and group delay views; two-port stability (K and μ) and reciprocity/isolation.
- **Antennas:** an antenna far-field card for beamwidth, peak bearing, front-to-back ratio and secondary lobes on a gain cut.
- **Trace tools:** offset/scale, smoothing (moving average, median, Savitzky-Golay), peak table, range statistics, bandwidth, ripple and threshold or line crossings.

Measure cards draw their result on the chart while they are open, for example the bandwidth band, and the card's eye button shows or hides it. They never place markers on their own.

A typical chain: `Time capture -> Resample if needed -> FFT -> Harmonics / Peak Table / Channel power`.

Each tool states when it cannot use the selected data. FFT needs evenly spaced time samples, Channel power needs density units such as `dBm/Hz`, and the network cards need a two-port. SNR, SINAD, ENOB and THD+N need the window and noise-bandwidth information that only the app's own FFT spectra carry, so they are not reported for ordinary analyzer traces. Every tool is described in [Analysis tools](docs/guide/analysis-tools.md).

### Export

- PNG, SVG, PDF and LaTeX (pgfplots/TikZ) figures, plus CSV data. Paper sizes match the text size of a paper, for example one IEEE column at 300 dpi.
- Copy an image or the LaTeX code straight to the clipboard.

### Runs anywhere

The build is a single self-contained `app.html` plus static files: no server, no CDN, nothing to install. A copy opened straight from disk works offline, demo included; only PDF export needs a web server.

### Look and workspace

- Light and dark themes, eight neutral tints, a high-contrast mode and a colour-blind trace palette, with trace symbols to tell traces apart without colour.
- Undo and redo for every change, workspaces saved and restored as JSON (older formats are migrated), a demo workspace and a keyboard shortcut reference.

## Design

The whole design is specified in one detailed page: the rules every screen follows, colours and themes, every panel and pane type, the toolbar, the import flows and the landing page.

- **[Design review](docs/design/design-review.html)**: download it (Raw → save) and open it in any browser. It is not hosted on the site.
- Notes in [`docs/design/README.md`](docs/design/README.md) and exact colour values in [`docs/design/colour-values.md`](docs/design/colour-values.md).

## Privacy

Files are read and processed in your browser. Nothing is uploaded, and there is no account.
Appearance preferences stay in the browser; a workspace is only saved when you download it.
Anything you attach to a GitHub issue is public, so share only data you are allowed to share.

## Feedback

- **Bug, file that will not open, missing measurement, or feature request:** [open an issue](https://github.com/AlpGoXd/mergen-scope/issues/new/choose) and pick the matching form. An example file or reproduction steps help most.
- **Questions and general feedback:** [Discussions](https://github.com/AlpGoXd/mergen-scope/discussions).
- **No GitHub account?** [Use the feedback form](https://tally.so/r/jeoN9x?src=readme).
- Attachments on GitHub issues are public.

## Why I built this

Mergen Scope started as the data viewer for [Mergen-21](https://github.com/AlpGoXd/mergen-21), my graduation project: a low-cost 21 cm hydrogen-line radio telescope that made its first on-sky H I detection in April 2026. I wanted one place to open spectrum analyzer sweeps, scope captures and VNA files from the bench without installing anything or moving data off my machine. It grew into a general RF measurement workspace.

<details>
<summary><strong>Development</strong></summary>

### Setup

Use Node.js 22.13+ on the 22.x line, or Node.js 24+, with npm. In a fresh clone:

```bash
git clone https://github.com/AlpGoXd/mergen-scope.git
cd mergen-scope
npm ci
npm run dev
```

Open **http://localhost:5173/app.html** for the app. The root URL serves the landing page; `app.html?demo=1` loads the demo session. Run `npm ci` only in a fresh checkout without `node_modules`. Install the Playwright browser once with `npx playwright install chromium`.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run typecheck` | Check the strict TypeScript source |
| `npm run test:unit` | Run Vitest unit and component tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run Playwright tests against the development app |
| `npm run build` | Typecheck and build the production site into `dist/` |
| `npm run test:static` | Test the built site using Vite preview; run after building |
| `npm run preview` | Serve the production build locally |

The production build bundles scripts and styles into `dist/app.html`, next to the static landing page, fonts, demo data and images. Nothing is loaded from a CDN.

### Codebase

React 19, TypeScript 6 (strict), Vite 7 and Recharts 2. Tests use Vitest, Testing Library and Playwright.

```text
index.html                  Static landing page
app.html                    Application entry page
docs/guide/                 User guide (Markdown, read it on GitHub)
llms.txt                    Plain-text summary for AI crawlers
src/
  App.tsx                   Application shell and panel wiring
  components/
    layout/                 Top bar, tool groups, side panels, and footer
    chart/                  Cartesian plots, pane layouts, and settings
    smith/                  Smith pane and frequency-range controls
    sidebar/                Trace, marker, line, and network controls
    analysis/               Analysis cards and shared panel UI
    wizard/                 Tabular import configuration and preview
    settings/               Browser-local appearance preferences
    help/                   Help and shortcut reference
  domain/
    parsers/                Format detection, R&S, tabular, and Touchstone parsing
    analysis/               Measurement functions and analysis tool registry
    chart/                  Pixel/axis mapping, zoom and pan, marker hit testing, drag state machine
    smith/                  Smith geometry, hit testing, and readouts
    touchstone/             Network selections and ABCD conversion
    workspace/              React-free workspace helpers (trace view, pane-removal plans)
    workspace-migrate-*     Workspace migrations (v1-v4 -> v5)
    open-file-read.ts       Classifying opened files (data, workspace, invalid, binary)
    file-size-policy.ts     Large-file warn and refuse limits
    transaction-history.ts  Undo/redo history
  hooks/                    UI and domain integration
  stores/                   React store adapters; aggregate-workspace-store.tsx is the provider
    workspace/              Aggregate workspace reducer, undo engine, snapshots, open-data
  types/                    Shared TypeScript data contracts
  demo/                     Demo workspace loading
tests/
  unit/                     Domain, state, and component tests
  e2e/                      Browser interaction and workflow tests
  static/                   Built-site checks
```

The aggregate workspace provider coordinates changes across files, traces, panes, markers, lines and analyses so related edits undo together. Domain functions handle parsing, calculations, trace alignment and workspace migration separately from the UI. Saved workspaces are version 5; older formats are migrated on load.

### Current scope

- Chart, Table, Smith and Polar panes exist. Constellation and spectrogram panes and the eye diagram are planned; see [docs/plan.md](docs/plan.md).
- Network input is S-parameter Touchstone data. Stability and reciprocity/isolation are two-port only.
- FFT, Waveform and Harmonics run on the main thread, so very large captures can be slow. Files over 50 MB ask before
  opening, and files over 500 MB are refused.
- Live instrument connections and PWA installation are not implemented.

### Contributing

Issues and pull requests are welcome. Before opening a PR, run typecheck, unit tests, browser tests, build and static tests in that order, and add focused coverage when changing parsers, calculations, workspace persistence or history. Follow [AGENTS.md](AGENTS.md); the design requirements are in [design decisions](docs/design/design-decisions-2026-11-10.md) and the remaining work is in [the plan](docs/plan.md).

</details>

## License and contact

[Apache-2.0](LICENSE).

**Alp Gokalp**, RF/Microwave Engineering, Analog IC Design<br>
Made With Love &lt;3<br>
[GitHub](https://github.com/alpgoxd) · [alpgokalp@hotmail.com.tr](mailto:alpgokalp@hotmail.com.tr)
