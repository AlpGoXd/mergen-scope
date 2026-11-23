# Mergen Scope 1.0.0-beta.3: release notes

Beta 3 adds two things you can see straight away, logarithmic axes and Polar panes, plus an antenna far-field analysis, drag and drop for traces and analysis cards, and a long list of fixes. Changes are listed against 1.0.0-beta.2 (21 November 2026).

**Your files never leave the browser.** Mergen Scope reads every file on your own computer. Nothing is uploaded, there are no cookies, and the only network requests are for the app itself and the demo files.

[Try the demo](https://mergenscope.com/app.html?demo=1) · [Open the app](https://mergenscope.com/app.html) · [User guide](docs/guide/README.md)

## What's new

### Panes

- **Logarithmic axes.** A chart pane can show its X or Y axis on a log scale, set in the pane's settings button. Reference lines, markers and pointer readouts follow the scale.
- **Polar panes.** Magnitude against angle, for example an antenna gain cut. Navigation and hit testing work in polar coordinates.
- **Drag and drop.** Drag a trace onto a pane to show it there, and reorder traces and analysis cards by dragging.
- Sample dots now appear when you have zoomed in far enough to tell the samples apart, instead of always or never.

### Analysis

- **Antenna far-field card.** On a gain cut it reports beamwidth, peak bearing, front-to-back ratio and secondary lobes. A horn-antenna sample file is in `test files/`.
- IP3 works per trace: each pane can have its own F1, F2, IM3L and IM3U markers and its own result. Auto-place markers only replaces the markers of the card's own trace.
- dBV is treated as a log level in trace math.

### Import

- **Large-file guard.** A file above 50 MB asks "Open anyway?" before it is read, and a file above 500 MB is refused with a message. This covers the file input, drops on the app or a pane, and loading a workspace. Other files in the same drop still open.
- Blank cells and non-finite values (empty, `Infinity`, `-Infinity`, `NaN`, `1e999`) in CSV, TSV and R&S `.DAT` files are no longer read as 0. A bad X skips that row and a bad Y skips only that trace's point.
- The import wizard says what a generic table import cannot do.

### App

- **Colours.** New high-contrast preference and a set of neutral tints, with the decided palette applied across the app. The export dialog remembers its theme.
- The App settings panel was rebuilt, and the footer settings and help sheets were restored.
- The user guide moved into the repository as Markdown, including trace math and the analysis tools. The site gained public guide pages for oscilloscope CSV, Touchstone and Smith charts, and R&S `.DAT`, plus `llms.txt`.

## Fixes

- Marker tags on the chart follow the theme. They were white in the dark theme.
- Clear workspace also removes derived traces and analysis cards.
- Horizontal reference lines can be grabbed when the Y axis is on auto, and the first wheel zoom step stays anchored under the cursor.
- The close-pane dialog names traces instead of internal ids.
- Landing-page assets and LP5 exports are current again.

## Under the hood

Chart, workspace store and import logic were split into smaller modules, non-null assertions were removed from the domain code, unit tests now run in node by default (about twice as fast), and CI runs the unit, browser and static tests on every push.

## Known limitations

Limitations from beta 2 that still apply are listed in the [beta 2 notes](release-notes-beta-2.md). Polar panes and dragging analysis cards are no longer on that list.

- Spectrogram and constellation panes, and the eye diagram, are still planned.
- Automated tests run in Chromium only. Other browsers should work but are less tested.

## Feedback

[Open an issue](https://github.com/AlpGoXd/mergen-scope/issues/new/choose) for a bug, a file that will not open or a missing measurement, an example file helps most. For questions, use [Discussions](https://github.com/AlpGoXd/mergen-scope/discussions), or the [feedback form](https://tally.so/r/jeoN9x?src=readme) if you have no GitHub account.
