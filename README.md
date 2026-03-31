# Mergen Scope

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://alpgoxd.github.io/mergen-scope/)
[![License: GPL-3.0-only](https://img.shields.io/badge/License-GPL--3.0--only-blue.svg)](LICENSE)

Browser-based viewer for RF spectrum analyzer .dat files — markers, Noise PSD, and IP3 built in.

[**Open the viewer**](https://alpgoxd.github.io/mergen-scope/)

---

## Features

- Multi-trace support — load and compare multiple measurements
- Interactive markers — place markers, search for peaks and minima, track frequency points
- Noise PSD panel — visualize noise power spectral density across the spectrum
- IP3/TOI measurement tool — marker-driven intermodulation point calculation
- Zoom and pan — navigate large frequency ranges with oscilloscope-style division readout
- Import/export — save marked measurements and analysis results
- No installation required — runs in any modern browser
- No CDN dependencies — all libraries vendored locally, works offline

---

## Supported File Formats

| Format | Instruments | Notes |
|--------|-------------|-------|
| R&S semicolon-delimited `.dat` | ZNB8 and compatible | Tested |
| Amplitude-only `.dat` | R&S instruments | Frequency reconstructed from metadata |
| Keysight / HP Agilent | Network analyzers | Compatible format |

---

## Getting Started

### Local Use

```bash
git clone https://github.com/AlpGoXd/mergen-scope.git
```

Open `mergen_scope.html` directly in a modern browser. No build step, no install.

### GitHub Pages Deployment

Push to `main`. GitHub Actions deploys automatically via `.github/workflows/deploy-pages.yml`.

---

## Usage

### Loading a File

Click **Load File** and select a `.dat` export from your spectrum analyzer. Use **Append** to add a second trace on top.

### Markers and Peak Search

Click the chart to place a marker. Select a marker to make it active, then use **Peak**, **Next Peak**, **Min**, or **Next Min** to move it to signal features.

### Noise PSD

Open the **Noise PSD** panel, set the resolution bandwidth, and the tool computes noise power spectral density from the selected trace.

### IP3 / TOI Measurement

Assign marker roles (F1, F2, IM3L, IM3U) using the marker panel, then run **Calculate IP3**. The tool computes third-order intercept from the marked points.

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

Single HTML file. No build step. React 18, React DOM, PropTypes, and Recharts are vendored locally under `vendor/` — no CDN calls at runtime. The app runs entirely from files served by GitHub Pages.

---

## Roadmap

- Raw vs derived trace model
- Trace math (A - B)
- Offset / amplitude correction
- Smoothing / averaging
- Multi-pane layout
- Synchronized pane cursor
- OBW / THD analysis functions
- Chart export (PNG / SVG)
- Session persistence / workspace JSON

---

## Known Limitations

- Only tested with R&S `.dat` exports — other formats may need parser adjustments
- Single HTML file architecture is intentional but not modular
- No PWA / offline install support
- Large trace files (>10k points) may affect chart performance

---

## Why I Built This

I'm an EE engineer. Like most of us, I don't have time to go deep into React or the rest of the web stack — that's not what I do. But when I went looking for something simple to visualize spectrum analyzer exports and other waveform files in the browser, I couldn't find anything that fit. So I vibecoded this into existence.

Right now it's only been tested with Rohde & Schwarz `.dat` files, but the goal is to eventually open any type of waveform or instrument export file, online, with no software to install.

Feel free to open issues, suggest changes, and help make this tool better. The aim is to keep it as dependency-free as possible and useful for day-to-day measurement work.

---

## Contributing

Open an issue or submit a pull request. When testing changes, verify against the regression checklist in the HTML comment at the top of `mergen_scope.html`.

---

## License

GNU GPL-3.0-only. See [LICENSE](LICENSE).

---

## Contact

**Alp Gökalp** — RF/Microwave Engineering, Analog IC Design

[GitHub](https://github.com/alpgoxd) · [alpgokalp@hotmail.com.tr](mailto:alpgokalp@hotmail.com.tr)
