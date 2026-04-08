# Mergen Scope

<p>
  <img src="mergen-scope-icon.svg" alt="Mergen Scope icon" width="72">
</p>

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://alpgoxd.github.io/mergen-scope/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

Mergen Scope is a free, open-source, browser-based viewer for Rohde & Schwarz spectrum analyzer `.dat` files and Touchstone `.sNp` files. Visualize RF spectrum data, network measurements, and spectral analysis online with no installation required.

[**Open the viewer**](https://alpgoxd.github.io/mergen-scope/)

![Mergen Scope preview](mergen-scope-preview.png)

---

## Features

- Multi-trace support: load and compare multiple measurements
- Interactive markers: place markers, search for peaks and minima, track frequency points
- Trace Ops panel: create derived traces without changing the raw source
- Multi-pane view: switch between 1 and 4 stacked panes with shared X navigation
- Offset and Scale: additive or multiplicative amplitude correction as derived traces
- Smoothing: None, Moving Average, Median Filter, and Savitzky-Golay
- Trace Math: `A + B`, `A - B`, `A * B`, `A / B` with overlap-only math on A's grid
- Interpolation control for trace math: Auto, Exact only, Linear, Nearest, Previous, Next, Cubic spline
- Trace Math warnings: short unit-aware warning notes for logarithmic and mixed-logarithmic math, with no blocking and no automatic unit conversion
- Noise PSD panel: visualize noise power spectral density across the spectrum
- IP3/TOI measurement tool: marker-driven intermodulation point calculation
- Expanded analysis toolkit: peak/spur table, marker delta table, range statistics, bandwidth helper, threshold crossings, ripple/flatness, occupied bandwidth, and guarded channel power
- Touchstone matrix picker: S/Y/Z family selection with per-cell trace generation
- Touchstone analysis toolkit: VSWR, Return Loss, Group Delay, Reciprocity/Isolation, and 2-port stability metrics
- Touchstone stability trace generation: create derived scalar traces for `K`, `mu1`, `mu2`, and `|delta|`
- Smith chart view for reflection parameters
- Zoom and pan: navigate large frequency ranges with oscilloscope-style division readout
- Saved results: keep Noise PSD and IP3 results inside the current workspace
- Workspace import/export: save and reopen complete sessions as portable JSON
- Data export: download raw traces, derived traces, current Noise PSD analysis trace, and saved analysis results as JSON
- Chart export: capture the current chart view as PNG or SVG
- No installation required: runs in any modern browser

---

## Supported File Formats

| Format | Instruments | Notes |
|--------|-------------|-------|
| R&S semicolon-delimited `.dat` | Rohde & Schwarz instruments | Tested |
| Amplitude-only `.dat` | R&S instruments | Frequency reconstructed from metadata |
| Touchstone `.s1p` to `.sNp` | RF network measurements | Supported for S/Y/Z trace workflows and Smith view |

---

## Known Issues

- Smith charts are currently a bit buggy in some workflows. They are complex to implement correctly, and improvements are planned for future updates.

---

## Getting Started

### Local Development

```bash
git clone https://github.com/AlpGoXd/mergen-scope.git
cd mergen-scope
npm install
npm run dev
```

Then open `http://localhost:5173/` in your browser. Click **Open Viewer** to launch the app.

### Build for Deployment

```bash
npm run build
```

Output goes to `dist/`. The build uses base path `/mergen-scope/` for GitHub Pages.

### GitHub Pages Deployment

Push to `main`. GitHub Actions builds and deploys automatically via `.github/workflows/deploy-pages.yml`.

---

## Usage

### Loading a File

Click **Load File** and select a `.dat` or `.sNp` export. Use **Append** to add more traces.

### Workspace Sessions

Use **Save Workspace** to export the current session as JSON, including imported files, derived traces, pane layout, zoom state, markers, reference lines, and saved analysis results.

Use **Open Workspace** to restore a previously exported session in one step.

### Data and Chart Export

Use **Export Data** to download the current traces as JSON, including raw traces, derived traces, the current Noise PSD analysis trace when available, and saved Noise/IP3 results.

Use **PNG** or **SVG** to export the current chart view as an image.

### Markers and Peak Search

Click the chart to place a marker. Select a marker to make it active, then use **Peak**, **Next Peak**, **Min**, or **Next Min** to move it to signal features.

### Trace Ops

Open **Trace Ops** to create derived traces from existing traces:

- **Offset** adds a constant value
- **Scale** multiplies by a constant factor
- **Smoothing** supports None, Moving Average, Median Filter, and Savitzky-Golay
- **Trace Math** supports `A + B`, `A - B`, `A * B`, `A / B`

Trace Math works over the overlapping X range only, uses A's grid, and offers interpolation control for mapping trace B onto A.

Trace Math also shows short warning-only notes when logarithmic units can make the result misleading. That includes same-unit logarithmic math such as `dBm + dBm`, `dB * dB`, and mixed logarithmic-unit math such as `dB * dBm`. These notes do not block the operation and do not change the math.

### Multi-Pane

Use the **Pane** controls to switch between:

- **1 Pane** for the current single-chart workflow
- up to **4 stacked panes** for shared-X comparison with independent Y scaling

In multi-pane mode you can:

- set the active pane
- add or remove panes
- move the selected trace to any pane
- drag a trace row from the sidebar and drop it onto a pane header or pane body
- fit the current pane
- fit all panes
- clear one pane by moving its traces back to another pane

Current first-release behavior:

- X zoom and pan are shared across panes
- Y zoom and fit are pane-local
- marker search follows the active pane and its selected trace
- reference lines are pane-local by default, with an optional lock mode to place linked lines across all panes

### Noise PSD

Open the **Noise PSD** panel, set the resolution bandwidth, and the tool computes noise power spectral density from the selected trace.

### IP3 / TOI Measurement

Assign marker roles (F1, F2, IM3L, IM3U) using the marker panel, then compute IP3 from the marked points.

### Analysis

Open **Analysis** to access pane-aware numeric tools that act on the selected trace in the active pane over the currently visible range:

- **Peak / Spur Table**
- **Marker Delta Table**
- **Range Statistics**
- **3 dB / 10 dB Bandwidth**
- **Threshold Crossings**
- **Ripple / Flatness**
- **Occupied Bandwidth**
- **Channel Power** with strict unit gating
- **VSWR** (Touchstone reflection traces)
- **Return Loss** (Touchstone reflection traces)
- **Group Delay** (Touchstone traces)
- **Reciprocity / Isolation** (Touchstone transmission traces)
- **Touchstone Stability** (2-port, K / mu1 / mu2 / |delta|)

Group Delay is computed from complex S-parameter data as $\tau_g(f)=-(1/(2\pi))\,d\phi/df$ using unwrapped phase from `atan2(im,re)`, frequency in Hz, central-difference derivatives for interior points, and forward/backward differences at the edges. Very low-magnitude regions are masked to avoid unstable phase-derivative spikes.

### Touchstone Stability Analysis

For 2-port Touchstone traces, the **Touchstone Stability** card computes stability metrics over the visible range and can generate scalar traces for:

- `K`
- `mu1`
- `mu2`
- `|delta|`

The card summarizes min/max ranges, center-point values, and whether visible points satisfy unconditional stability checks (`K > 1` and `|delta| < 1`).

---

## Supported File Shape

Typical R&S semicolon-delimited export:

```text
; R&S Export
Values;1001
StartXAxis;1000000;Hz
StopXAxis;3000000000;Hz
RBW;3000;Hz

Trace 1;
Trace Mode;CLR/WR
Detector;RMS
1000000;-80.5
1030000;-79.2
...
```

---

## Architecture

Built with TypeScript, React 19, Vite, and Recharts. All dependencies are installed via npm — no vendored CDN files.

**Entry points:**
- `index.html` — static landing page (no React)
- `app.html` — React application shell, mounts `<div id="root">`

**Source layout under `src/`:**
- `components/` — React UI components (layout, chart, analysis, sidebar, wizard, shared)
- `domain/` — business logic and calculations (parsers, trace math, analysis math, Touchstone)
- `hooks/` — React custom hooks
- `stores/` — Zustand stores (trace, pane, marker, analysis, ui, file, ref-line)
- `types/` — TypeScript interfaces

**State management:** Zustand stores, each owning a distinct slice (traces, panes, markers, analysis results, UI, file metadata, reference lines). `StoreRoot` wraps the app in all providers.

**Analysis framework:** Modular analysis cards in `components/analysis/`. Each card reads from the active pane/trace via `use-analysis-target` and calls pure domain functions for computation.

---

## Roadmap

Current status:

- Phase 3 is complete
- Phase 4 is complete
- Touchstone import support is complete
- Touchstone measurement tools are in active expansion
- TypeScript + Vite migration is complete

Roadmap in order:

1. First usable multi-pane release — completed
2. Expanded analysis toolkit — completed
3. Export and session portability — completed
4. Touchstone import support — completed
5. Touchstone measurement tools — in progress
6. Performance and scaling pass
7. Oscilloscope waveform support

Not planned right now:

- a permanent synchronized pane cursor
- an always-on shared pane guide line

---

## Known Limitations

- Only tested with R&S `.dat` exports. Other formats may need parser adjustments
- Multi-pane is currently limited to 1 to 4 stacked panes
- Touchstone stability in v1 is 2-port only
- Oscilloscope waveform support is intentionally deferred to a later format-expansion phase
- Pane synchronization does not use a permanent shared cursor line
- Channel power is intentionally gated unless the trace unit is explicit spectral power density such as dBm/Hz or dBW/Hz
- No PWA / offline install support
- Large trace files (>10k points) may affect chart performance

---

## Why I Built This

I'm an EE engineer. Like most of us, I don't have time to go deep into React or the rest of the web stack. That's not what I do. But when I went looking for something simple to visualize spectrum analyzer exports and other waveform files in the browser, I couldn't find anything that fit. So I vibecoded this into existence.

Right now it's only been tested with Rohde & Schwarz `.dat` files, but the goal is to eventually open any type of waveform or instrument export file, online, with no software to install.

Feel free to open issues, suggest changes, and help make this tool better.

---

## Contributing

Open an issue or submit a pull request. Run `npm run build` to verify the build passes before submitting.

---

## License

Apache-2.0. See [LICENSE](LICENSE).

---

## Contact

**Alp Gokalp** - RF/Microwave Engineering, Analog IC Design

[GitHub](https://github.com/alpgoxd) | [alpgokalp@hotmail.com.tr](mailto:alpgokalp@hotmail.com.tr)
