# Mergen Scope: live demo script (about 6 minutes)

Open the built site (or `npm run build && npx vite preview`), light theme first. Window at 1440 × 900 or larger.
The demo workspace holds `cascaded chain.s2p` (an R&S VNA capture of a three-stage amplifier and filter chain, S11 / S21), `waveform_sinc_test.csv` (a scope capture) and `cascade_ip3_-12dBm.DAT` (a two-tone spectrum for the IP3 step). Nothing is uploaded: everything runs in the browser.

## Steps

1. **Open the demo (20 s).** On the landing page click **or open the demo** (or go to `app.html?demo=1`). Four named panes appear in the **2 x 2** layout: **S21 Gain | 3 dB BW** top left, **S11 Match | Smith** top right, **Scope | 1 kHz + 5 kHz** bottom left, **Two-Tone | IP3** bottom right. S21 is selected, with the transfer peak and bandwidth region in view. The address bar drops `?demo=1`. Say: "a saved workspace, opened exactly like a file."
2. **Markers on pane 1 (40 s).** In the left panel, **Markers** shows M1 and a delta marker DM1. M1 sits on the S21 peak (about 1.275 GHz, 40 dB). Click the M1 row: its tag grows on the chart. Click **Next peak** in the strip to walk the peak; click **Peak** to come back. Click the DM1 row: the Δ readout shows the difference from M1.
3. **Place a marker yourself (20 s).** Press **N** (the **+ New** button fills in the Markers colour, the footer says what to click), click on the S21 trace. Press **Esc** to cancel the armed tool.
4. **3 dB reference (20 s).** The S21 pane opens with H1 at 37.16 dB, three decibels below the measured 40.16 dB peak. Point out the threshold beside the bandwidth result. To demonstrate line editing, add a V line with **V line**, click the chart, then remove it with the row's delete button; **Ctrl+Z** restores it.
5. **Smith pane (60 s).** Hover the S11 trace in pane 2: the readout card shows frequency, Z and |Γ|, and the resistance circle and reactance arc through the point light up. With a marker armed (**N**) click the trace: the strip shows **Z, Γ, VSWR, return loss**. Scroll to zoom around the cursor, **double-click** to fit. Look at the **range bar** under the plot: it reads "1.200 → 1.600 GHz of 10 kHz–8.5 GHz" around the passband. Drag a handle, or click a value and type `1.3 GHz`; **Full range** resets. Open the pane's ⚙ (Pane settings) › Display › **Outside range: Faint** to show the rest of the trace faint.
6. **Layouts (40 s).** In the Pane group click **Layout: 2 × 2 ▾**: four small previews; unavailable ones are dashed with the reason. Choose **Rows**, then drag the gap between two panes (the divider turns blue and shows "64% · 36%"); **double-click** the divider for equal sizes. Choose **2 × 2** again. Drag a pane's header onto another pane: the target says **⇄ Swap with Pane 3**; release, then **Ctrl+Z**.
7. **Chart type (20 s).** The header chip **[Chart type | Chart]** on pane 1 opens the type popover; Smith is available, Table, Polar and Spectrogram are greyed "later". Press **Esc**. Toggle **Samples** in a pane header to show the measured points.
8. **IP3 (45 s).** Click the spectrum in pane 4, open **Analysis**: the **IP3** card shows the F1 / F2 / IM3L / IM3U markers and **OIP3** (about 29.5 dBm; markers F1, F2 at 1.42035 and 1.42045 GHz, products 100 kHz away). If you remove them, the card says "Place F1, F2, IM3L and IM3U markers" and offers **Auto-place markers** (also in the card's ⋯ menu). Any marker row has a **Role** menu to set or clear F1, F2, IM3L, IM3U by hand.
9. **Analysis (60 s).** Click **Analysis** (top right). The **Bandwidth** card reports the 3 dB bandwidth of S21 and its eye draws a band with edge ticks on the chart; toggle the eye. The **Smooth** card feeds a created trace nested under S21 with ƒ. Change the window setting: the created trace follows. Double-click the output name (or press **F2** on the row) to rename it in place; **⋯ › Reset name** restores the automatic name. Add **Peak Table** from **+ Add analysis**: numbered hollow triangles on the chart, **+ Marker** per row.
10. **Save and reopen (30 s).** Click **Save**: a workspace JSON downloads. Reload the page, click **Open**, choose that file: panes, layout, markers, Smith range and analysis cards come back.
11. **Export (15 s).** **Export…** downloads the visible traces as CSV. (LaTeX / image export is not built yet: do not promise it.)

## Do not click during the demo

- **Table, Polar, Spectrogram** tiles/entries: greyed "later" (Table is the next step, the others are planned).
- **Export as LaTeX / TikZ / image / PDF:** not built yet (only the CSV export exists).
- **Right-click a marker or drag a marker on the Smith chart:** not implemented (the marker menu and Smith marker dragging are listed in `docs/design/deferred.md`).
- **Removing a pane that holds traces** can show the browser's own confirm dialog (not styled yet), and **Clear All** wipes the whole workspace (Undo is in the toast): avoid both on stage.
- **The colour swatch in a trace row:** it opens the browser colour picker, which starts black (the app's colours are OKLCH values the picker cannot read); changing a colour works.
- **The 8-pane setting** (Settings › Experimental) and **narrow windows below 1024 px**.
- **Linking panes' X zoom:** there is no per-pane link control yet, so do not explain "link/unlink".
- **2 × 2 layout:** it is only offered with exactly four panes (the demo has four; with fewer panes it is dashed).
- Opening a second file while the demo is loaded asks about replacing only when the name is the same; use a different file or avoid it.

## If something goes wrong

- The demo does not load: the red bar says "The demo could not be loaded. Open the app from the website, or open demo.json from the demo-assets folder." Open **Open…** and choose `demo-assets/demo.json`.
- Anything odd: **Ctrl+Z** undoes the last change; reloading `app.html?demo=1` restores the demo.
