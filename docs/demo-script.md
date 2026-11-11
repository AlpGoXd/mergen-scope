# Mergen Scope: live demo script (about 5 minutes)

Open the built site (or `npm run build && npx vite preview`), light theme first. Window at 1440 × 900 or larger.
The demo workspace holds `cascaded chain.s2p` (an R&S VNA capture of a three-stage amplifier and filter chain, S11 / S21) and `waveform_sinc_test.csv` (a scope capture). Nothing is uploaded: everything runs in the browser.

## Steps

1. **Open the demo (20 s).** On the landing page click **or open the demo** (or go to `app.html?demo=1`). Three panes appear in the **1 + side** layout: S21 and S11 on the left, a Smith chart top right, the scope capture bottom right. The address bar drops `?demo=1`. Say: "a saved workspace, opened exactly like a file."
2. **Markers on pane 1 (40 s).** In the left panel, **Markers** shows M1 and a delta marker DM1. M1 sits on the S21 peak (about 1.275 GHz, 40 dB). Click the M1 row: its tag grows on the chart. Click **Next peak** in the strip to walk the peak; click **Peak** to come back. Click the DM1 row: the Δ readout shows the difference from M1.
3. **Place a marker yourself (20 s).** Press **N** (the **+ New** button fills in the Markers colour, the footer says what to click), click on the S21 trace. Press **Esc** to cancel the armed tool.
4. **Reference line (20 s).** Click **V line**, click the chart: V2 appears in the **Lines** list with its pane badges. Remove it again with the row's ×; **Ctrl+Z** brings it back.
5. **Smith pane (60 s).** Hover the S11 trace in pane 2: the readout card shows frequency, Z and |Γ|, and the resistance circle and reactance arc through the point light up. With a marker armed (**N**) click the trace: the strip shows **Z, Γ, VSWR, return loss**. Scroll to zoom around the cursor, **double-click** to fit. Look at the **range bar** under the plot: it reads "1.200 → 1.600 GHz of 10 kHz–8.5 GHz" around the passband. Drag a handle, or click a value and type `1.3 GHz`; **Full range** resets. Open the pane's ⚙ (Pane settings) › Display › **Outside range: Faint** to show the rest of the trace faint.
6. **Layouts (40 s).** In the Pane group click **Layout: 1 + side ▾**: four small previews; unavailable ones are dashed with the reason. Choose **Rows**, then drag the gap between two panes (the divider turns blue and shows "64% · 36%"); **double-click** the divider for equal sizes. Choose **1 + side** again. Drag a pane's header onto another pane: the target says **⇄ Swap with Pane 3**; release, then **Ctrl+Z**.
7. **Chart type (20 s).** The header chip **[Chart type | Chart]** on pane 1 opens the type popover; Smith is available, Table, Polar and Spectrogram are greyed "later". Press **Esc**. Toggle **Samples** in a pane header to show the measured points.
8. **Analysis (60 s).** Click **Analysis** (top right). The **Bandwidth** card reports the 3 dB bandwidth of S21 and its eye draws a band with edge ticks on the chart; toggle the eye. The **Smooth** card feeds a created trace nested under S21 with ƒ. Change the window setting: the created trace follows. Double-click the output name (or press **F2** on the row) to rename it in place; **⋯ › Reset name** restores the automatic name. Add **Peak Table** from **+ Add analysis**: numbered hollow triangles on the chart, **+ Marker** per row.
9. **Save and reopen (30 s).** Click **Save**: a workspace JSON downloads. Reload the page, click **Open**, choose that file: panes, layout, markers, Smith range and analysis cards come back.
10. **Export (15 s).** **Export…** downloads the visible traces as CSV. (LaTeX / image export is not built yet: do not promise it.)

## Do not click during the demo

- **Table, Polar, Spectrogram** tiles/entries: greyed "later" (Table is the next step, the others are planned).
- **Export as LaTeX / TikZ / image / PDF:** not built yet (only the CSV export exists).
- **Right-click a marker or drag a marker on the Smith chart:** not implemented (the marker menu and Smith marker dragging are listed in `docs/redesign/deferred.md`).
- **Removing a pane that holds traces** can show the browser's own confirm dialog (not styled yet), and **Clear All** wipes the whole workspace (Undo is in the toast): avoid both on stage.
- **The colour swatch in a trace row:** it opens the browser colour picker, which starts black (the app's colours are OKLCH values the picker cannot read); changing a colour works.
- **The 8-pane setting** (Settings › Experimental) and **narrow windows below 1024 px**.
- **Linking panes' X zoom:** there is no per-pane link control yet, so do not explain "link/unlink".
- **2 × 2 layout:** it is only offered with exactly four panes (add one with **+ Pane** first).
- Opening a second file while the demo is loaded asks about replacing only when the name is the same; use a different file or avoid it.

## If something goes wrong

- The demo does not load: the red bar says "The demo could not be loaded. Open the app from the website, or open demo.json from the demo-assets folder." Open **Open…** and choose `demo-assets/demo.json`.
- Anything odd: **Ctrl+Z** undoes the last change; reloading `app.html?demo=1` restores the demo.
