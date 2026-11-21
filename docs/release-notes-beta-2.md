# Mergen Scope 1.0.0-beta.2: release notes

Beta 2 is for outside reviewers. It adds no new analysis tools; it finishes export, rebuilds the top bar, footer and settings, and hides features that are not built yet. Changes are listed against 1.0.0-beta.1 (13 November 2026).

**Your files never leave the browser.** Mergen Scope reads every file on your own computer. Nothing is uploaded, there are no cookies, and the only network requests are for the app itself and the demo files.

## What's new

### Panes

- Every pane has one settings button, the sliders icon at the right of its header. It holds the chart type, display options, axes and the pane's actions: Copy image, Download image, Download SVG, Copy as LaTeX, Export data (CSV)…, Export… and Close pane.
- The hover legend moves to the other top corner when the cursor comes near it, so it no longer hides the data you are pointing at.
- The top bar is one row. Markers, Search, Lines and Pane are groups that open to the right of their name; when they don't fit, a whole group moves to a second line.
- Markers has one "+ Marker ▾" button. The ▾ part places a delta marker from the selected marker or from any named marker.
- Clear workspace… has moved to the Files ⋯ menu. It can be undone.

### Smith

- Over a Smith pane the footer shows the impedance Z and the reflection coefficient Γ under the mouse.
- A Smith pane can be exported as PNG, SVG or PDF, alone or with the other panes. It can also be copied as LaTeX on its own.
- In narrow panes the readout hint now ends with "…" instead of being cut off mid-word.

### Analysis

- There are no new tools in this beta. FFT, the waveform measurements and the other tools from beta 1 work as before.
- Analysis cards now use the same text sizes as the rest of the app at every Size setting.

### Export

- Export… (Ctrl+Shift+E) opens a centred dialog with a live preview. It can export this pane, all panes or a chosen set, as PNG, SVG, PDF, TikZ or CSV.
- PNG and SVG offer Screen, Slide, Report, Custom and paper sizes, at 1×, 2× or 3× scale, in the app theme or a print or dark theme.
- Paper sizes follow IEEE column widths: 1 column (88.9 mm) or 2 columns (181.9 mm), with an editable height and 8, 9 or 10 pt text. PDF output is vector and uses standard Times and Courier fonts.
- TikZ exports a ready-to-paste PGFPlots figure, with Preview and Code tabs. Several chart panes become one groupplots figure. Traces are thinned to 2,000 points by default; choose All to keep every point. The data can stay inline or go in .dat files in a ZIP.
- You can include marker tags, a marker table, reference lines, the grid and the date. Axis titles are filled in from the units and can be edited per pane. Each pane gets its own legend.
- CSV covers all panes by default, with full data or the visible X range, visible or all traces, and optional markers.
- Copy image (Ctrl+Shift+C) and Download image (Ctrl+Shift+S) work on the target pane without opening the dialog.

### Import

- To rename a file, double-click its name in the Files list.
- Opening a CSV still goes through the column wizard. This beta doesn't change how files are read.

### App

- The footer shows what a click does now, the target pane, the active trace, and the mouse position in axis units. Mouse hints follow the pane type, and four quiet buttons sit at the right: Local only, Feedback, Settings and Help.
- **Feedback** in the footer opens a GitHub issue form or GitHub Discussions in a new tab. There is also a form for people without a GitHub account. Nothing is attached automatically, never your files.
- App settings (Ctrl+, or the footer gear) is a centred panel with Theme (Light, Dark, System), Size (Compact, Comfortable, Large), the colour-blind palette, trace symbols, the export theme and the experimental 8-pane option.
- Help (Shift+/ or the footer ?) lists every keyboard shortcut and mouse gesture that works. Help and About both show the version, 1.0.0-beta.2.
- All text uses the same seven text styles at every Size setting.
- Features that are not built yet are hidden instead of shown disabled: Replace file…, the Fix… button on a file that failed to open, and an old "All panes…" export item.
- The trace colour picker opens on the trace's own colour, not black.

## Known limitations

### Opening files

- Opening a file whose name is already open asks in a browser prompt (type "replace" or "copy"). Replacing the workspace and removing a file or pane that has markers also use plain browser dialogs. They will become in-app dialogs.
- Replace file… and changing a CSV's column settings after it is open are not available yet. Close the file and open it again.
- There is no progress bar while a large file is read.

### Panes and charts

- Polar and Spectrogram are planned chart types. They appear greyed out, labelled "later" or "needs data".
- When markers sit close together in a narrow pane, their tags can overlap. Labels of close vertical lines can overlap too.
- The FFT trace goes into the first pane with a frequency axis, even when that pane spans GHz, so it can be squeezed against 0 Hz. Hide the other traces in that pane and double-click to fit. A pane zoomed to a range with no samples says "No visible traces in this pane", even when a trace is ticked.
- Markers have no right-click menu yet. Use + Marker ▾ for a delta, Search › Peak to move a marker to the peak, and Delete or × to remove one.
- Ctrl+scroll does not zoom X. Right-drag zooms an X range instead (see Help).
- Four panes is the default limit. Up to eight is an experimental setting.

### Smith

- In a small Smith pane the start and end frequency labels can overlap the grid labels.
- Smith zoom resets when the pane is redrawn (for example after reopening a workspace).
- Z11 and Y11 cannot be shown on a Smith chart yet.

### Export

- An all-panes TikZ figure leaves out Smith panes and says so in the preview. Export Smith as an image, or use Copy as LaTeX on the Smith pane.
- The TikZ preview is approximate, and long labels can be clipped in it. LaTeX draws the final figure.
- PDF needs the app served from a website or local server. If you open the built `app.html` straight from disk, PNG, SVG, TikZ and CSV still work.

### General

- Undo and Redo restore lines but not which line was selected.
- Analysis cards cannot be reordered by dragging yet.
- Automated tests run in Chromium only. Other browsers should work but are less tested.
