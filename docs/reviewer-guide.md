# Reviewer guide: Mergen Scope 1.0.0-beta.2

Thank you for reviewing. Mergen Scope is a browser app for RF and signal data: Rohde & Schwarz `.dat` spectra, CSV/TSV tables (scope captures, for example) and Touchstone `.s1p`–`.sNp` network files. Your files never leave the browser: nothing is uploaded.

Use a desktop browser at least 1280 × 800 (Chrome or Edge are the most tested). Open the beta link you were given (the app page, `app.html`). Or run it locally from the `beta-2` branch with `npm ci` and `npm run dev`, then open `http://localhost:5173/app.html`.

What changed since beta 1, and what is not finished yet, is in [release-notes-beta-2.md](release-notes-beta-2.md). Please don't report the known limitations listed there, unless one gets in your way more than the notes suggest.

## The 10-minute tour

### 1. Open the demo (1 min)

Click **Load demo** in the Files panel on the left. You get four panes in a 2 × 2 layout: *S21 Gain | 3 dB BW*, *S11 Match | Smith*, *Scope | 1 kHz + 5 kHz* and *Two-Tone | IP3*. The left panel lists Files, Traces, Markers and Lines; the Analysis panel on the right holds the demo's analysis cards.

Click a pane to make it the **target**: its header tints, and the footer shows "Target" with its name. New markers, the Search tools and most shortcuts act on the target pane.

### 2. Markers (2 min)

- Press **N** (or **+ Marker** in the Markers group), then click a trace in *S21 Gain*. A marker appears in the chart and in the Markers list.
- Drag the marker along the trace. Press **←** / **→** to step it one sample.
- Press **Shift+N** and click again to place a delta marker from the selected one. The ▾ next to + Marker does the same from any named marker.
- In the Search group, **Peak** and **Next peak** move the selected marker. **Dir L → R** flips the search direction.
- In the Markers list, click a marker's X value to type a new one. **Delete** or the row's × removes the selected marker. **Ctrl+Z** undoes any of this.

### 3. Chart type (1 min)

In the *Scope* pane header, click the chart-type button (it reads **Chart**). Choose **Table**: the same traces become columns, one row per X value. Switch back to **Chart**. The same choice is at the top of the pane's settings (the **sliders** button at the right of the header).

### 4. Layouts and linking (2 min)

- Open the **Pane** group in the top bar and choose a layout from **Layout: 2 × 2 ▾** (Rows, Columns, 2 × 2, 1 + side). Layouts that don't fit the pane count are greyed with the reason.
- Drag the gap between two panes to resize them; double-click the gap to make them equal. Drag a pane by its header onto another pane to swap them.
- The link chip in a pane header (link icon and unit, e.g. **Hz**) links the X axes of panes with the same unit. Link *S21 Gain* with *S11 Match | Smith*, then right-drag an X range in *S21 Gain*: the linked panes follow.

### 5. Smith range (1 min)

In *S11 Match | Smith*, use the **Range** bar under the chart: drag either handle, or click a frequency and type one (e.g. `1.2 GHz`). Only that part of S11 is drawn. **Full range** resets it. While the pane is X-linked to a chart, the range follows the chart's zoom and the controls are locked; unlink to set it by hand. Hover the trace to read Z, Γ and VSWR in the strip and the footer.

### 6. FFT (1 min)

In the Traces list, click *waveform_sinc_test.csv signal_1khz*. In the Analysis panel, click **+ Add analysis**, choose **FFT**, then **Create trace**. Try another window, Averages or Scale; the created "FFT · signal_1kHz" trace follows the card. The spectrum appears straight away. The demo already has four panes, so it joins *S21 Gain*, the nearest frequency pane, and that pane zooms to 0–50 kHz. Double-click *S21 Gain* to see the whole sweep again.

### 7. Export as image, SVG and LaTeX (1 min)

- **Ctrl+Shift+C** copies the target pane as an image; **Ctrl+Shift+S** downloads it.
- **Export…** in the top bar (Ctrl+Shift+E) opens the export dialog. Pick **All panes**, then **PNG** and **SVG**, and compare the live preview with the app.
- Choose **TikZ** and **Paper 1-col**, open the **Code** tab, and click **Copy LaTeX**. Or, in a pane's sliders menu, click **Copy as LaTeX** for that pane alone. The figure needs `pgfplots` (and `groupplots` for several panes).

### 8. Save and reopen a workspace (1 min)

Click **Save** in the top bar (Ctrl+S). A `.json` workspace file downloads: files, traces, markers, lines, panes and layout. Then click **Open** in the top bar, choose that file and confirm the replace. Everything comes back as it was. You can also drop the `.json` onto the window.

If you have time, open your own files: drop them anywhere on the window, or press **Ctrl+O**.

## What kind of feedback helps

Most useful:

- **Something wrong**: a wrong number, a trace in the wrong place, a marker that lands off the trace, a file that fails to open or opens wrongly. Say what you did, what you saw and what you expected.
- **Something confusing**: a label you misread, a control you couldn't find, a step where you didn't know what to do next.
- **Something missing for your work**: a measurement, file format or export option you'd need before you could use this on real data.
- **Visual problems**: overlapping or cut-off text, unreadable colours (please say whether you used Light or Dark), a dialog that opens off-centre.

Helpful details: your browser and OS, the window size, Light or Dark, and the Size setting (App settings › Size). A screenshot helps a lot. If a file fails to open, describe it (instrument, format, number of points) or share a cut-down copy you are free to share.

Less useful right now: anything listed under "Known limitations" in the release notes, and colour or spacing preferences without a concrete problem behind them.

## How to send it

Click **Feedback** in the footer (bottom right). It opens a small menu:

- **Report a problem ↗** opens a GitHub issue form.
- **Suggest an idea ↗** opens GitHub Discussions.
- **Feedback without a GitHub account ↗** opens a short web form.

Each link opens in a new browser tab. **Nothing is attached automatically**: the app sends no files, no data and no workspace. Add only what you choose to include. If you want to share a file, attach it yourself, and only if you are allowed to share it.
