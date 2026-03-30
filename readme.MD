# Mergen Scope

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://alpgoxd.github.io/mergen-scope/)
[![License: GPL-3.0-only](https://img.shields.io/badge/License-GPL--3.0--only-blue.svg)](LICENSE)

Mergen Scope is a fragile single-file browser app for viewing Rohde & Schwarz spectrum analyzer `.dat` exports. It runs without a build step and is designed to work directly from a GitHub Pages repo using only files hosted in the repository.

## Why I Built This

I am an electrical and electronics engineer, and like many EE people I do not have much time to learn a full frontend stack like React and the rest of the web ecosystem in depth just to inspect waveform and spectrum data.

When I looked for simple browser tools to visualize spectrum analyzer exports and other waveform-style files, I could not find something that matched what I wanted. So I vibecoded this project into existence.

Right now I have only tested it with Rohde & Schwarz spectrum analyzer `.dat` files, but the longer-term goal is bigger than that:

- make the tool genuinely useful for day-to-day measurement work
- keep it as dependency-light and vendor-free as possible
- support more waveform and instrument-export file types over time
- eventually make it useful as a general online waveform viewer

If you want to help shape it, feel free to open issues, suggest changes, and help make the tool cooler.

## Current Status

Phase 1 is feature-complete and in signoff testing. The app currently focuses on:

- stable single-file startup
- local vendored runtime dependencies
- conservative marker and chart interaction improvements
- marker-driven analysis workflows

## Runtime Model

- No build step
- No CDN runtime dependencies
- No `esm.sh`, `unpkg`, `jsdelivr`, or online import maps
- React 18, React DOM, PropTypes, and Recharts are vendored locally under `vendor/`
- Main app file: `mergen_scope.html`

## What The App Does

### Import and Trace Handling

- Import or append Rohde & Schwarz `.dat` exports
- Parse semicolon-delimited metadata and trace blocks
- Support amplitude-only traces when frequency can be reconstructed from metadata
- Normalize imported trace samples
- Sort X ascending
- Remove invalid rows
- Collapse duplicate X values
- Preserve unit metadata

### Chart Interaction

- Crosshair readout
- X zoom and X pan
- Y zoom and Y pan
- Manual reset of X and Y
- Oscilloscope-style division readout with `X/div` and `Y/div`
- Visible grid divisions with rounded tick spacing

### Markers

- Add markers
- Select one marker as the active marker
- Move selected marker by click or drag
- Create fresh markers with `New Marker`
- Edit marker frequency and amplitude from the sidebar
- Peak search
- Next Peak
- Min search
- Next Min
- Delta markers

### Reference Lines

- Vertical reference lines
- Horizontal reference lines
- Sidebar value editing
- Selection and drag movement

### Analysis

- Noise PSD
- Marker-driven IP3 / TOI workflow
- Saved Noise PSD results
- Saved IP3 results
- Normalized saved result structure for future analysis features

## Marker / Search Behavior

`Search Trace` has two modes:

- `Auto`
  - If a marker is selected, search prefers that marker's trace first.
  - For chart placement, auto tries to use the visible trace closest to the cursor position.
  - In multi-trace next-search cases, auto can step across visible traces when appropriate.
- Specific trace
  - Search and placement are forced to the chosen trace when possible.

## Files

- `mergen_scope.html`: full app
- `vendor/`: vendored browser runtime files
- `LICENSE`: GPL v3 license text

## Local Use

Clone the repo and open `mergen_scope.html` directly in a modern browser.

```bash
git clone https://github.com/AlpGoXd/mergen-scope.git
```

No install step is required.

## Supported File Shape

Typical Rohde & Schwarz semicolon-delimited export:

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

## Phase 1 Signoff Checklist

- Startup works from repo-hosted files only
- Single-trace import works
- Overlapping two-trace import works
- Non-overlapping two-trace import works
- Sparse vs dense traces behave correctly
- Marker add / select / move / edit works
- `Peak`, `Next Peak`, `Min`, `Next Min` behave correctly
- Vertical and horizontal reference lines place, edit, select, and move correctly
- Noise PSD saves and remains consistent after trace removal
- IP3 works from visible marker roles and saves normalized results
- Zoom, pan, crosshair, raw table, and saved panels still work after the above checks

## Roadmap After Phase 1

- Raw vs derived trace model
- Trace math
- Offset / amplitude correction
- Smoothing / averaging
- Multi-pane layout
- Synchronized pane cursor/readout
- OBW / THD and other future analysis functions
- Export and workspace/session features
- Performance cleanup and decimation

## License

This project is licensed under GNU GPL-3.0-only. See [LICENSE](LICENSE).
