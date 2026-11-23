# Mergen Scope 1.0.0-beta.4: release notes

Beta 4 is a polish release: better zooming, a smarter import wizard, tidier Smith charts, drawn icons instead of text characters, and a fix for LaTeX export. Changes are listed against 1.0.0-beta.3 (22 November 2026).

**Your files never leave the browser.** Mergen Scope reads every file on your own computer. Nothing is uploaded, there are no cookies, and the only network requests are for the app itself and the demo files.

[Try the demo](https://mergenscope.com/app.html?demo=1) · [Open the app](https://mergenscope.com/app.html) · [User guide](docs/guide/README.md)

## What's new

### Charts

- **Box zoom on both axes.** Drag a box to zoom X and Y together.
- **Editable axis ranges.** Type the minimum, maximum or per-division value for the X and Y axis of a pane.

### Smith chart

- **Z + Y hover.** With the Z + Y grid, hovering now highlights the constant-resistance circle and reactance arc and the constant-conductance circle and susceptance arc through the cursor. The Y pair is dashed.
- **Start and end labels** move to a free spot instead of covering grid labels.

### Import

- **Mixed separators.** The wizard detects files that mix separators and shows both so you can pick.
- **tinySA.** Packed tinySA traces are read correctly and gaps in the sweep are kept.

### App

- **Drawn icons.** The close, dropdown, previous, next and check marks are now drawn icons that follow the theme, including high contrast, instead of text characters.
- **Theme.** The neutral tints were renamed, and the Mist and high-contrast accents were refined. The settings layout was fixed.

## Fixes

- **LaTeX export:** unchecking Marker tags now removes only the tag labels. The marker symbols stay, as in the image and PDF exports. Before, they disappeared entirely.
- **Copy and Download LaTeX** now follow the pane's own Marker tags setting.

## Known limitations

Limitations from [beta 3](release-notes-beta-3.md) still apply.

- Export options are remembered per format, so unchecking Marker tags for PNG does not change PDF or LaTeX.
- Spectrogram and constellation panes, and the eye diagram, are still planned.
- Automated tests run in Chromium only. Other browsers should work but are less tested.

## Feedback

[Open an issue](https://github.com/AlpGoXd/mergen-scope/issues/new/choose) for a bug, a file that will not open or a missing measurement, an example file helps most. For questions, use [Discussions](https://github.com/AlpGoXd/mergen-scope/discussions), or the [feedback form](https://tally.so/r/jeoN9x?src=readme) if you have no GitHub account.
