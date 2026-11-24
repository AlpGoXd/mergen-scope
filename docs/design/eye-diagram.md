# Eye diagram: design guide (24 Nov 2026)

Status: **designed, not built.** This guide is the written source for the eye diagram. It replaces the Eye section of the "P8 — Planned panes" board in [design-review.html](design-review.html) wherever the two differ, and it follows every rule in [design-decisions-2026-11-10.md](design-decisions-2026-11-10.md) unless it says otherwise.

The mockups live in a Claude Design canvas, "Mergen Scope — Eye diagram (P8 update)", with six boards: Main (the app with the card and the Eye pane), States, Shadings, Gallery (twelve kinds of signal), Measurements, and the Create trace flow. The canvas uses simulated 10 Gb/s NRZ data; its typed numbers are examples, not measurements.

## 1. What it is

An eye diagram cuts a time-domain capture into pieces one bit (one **unit interval**, UI) long and draws them on top of each other. A good link looks like an open eye; noise, jitter and inter-symbol interference (ISI) close it. Mergen Scope builds it from a trace the user already has open (a CSV capture or a binary scope file), measures it, and shows it as an intensity-shaded picture.

## 2. Where it lives

- **An Analysis tool, with a pane it owns.** "+ Add analysis › Eye diagram" on a time-domain trace adds the **Eye diagram card** and opens an **Eye pane** for it. The card holds the settings and results; the pane is the picture.
- **The Eye pane is never chosen by the user.** It is not a tile in the empty-pane picker and not in the "Show Pane N as" popover (as today: `source: 'analysis'` in the pane-type registry). Chart, Table, Smith and Polar are picked; Eye is only opened by its card.
- **One card, one pane, one trace.** An Eye pane shows exactly one trace's eye. Traces cannot be dropped on it (the drop shows the reason before release). To compare CH1 and CH2, add two cards: two Eye panes.
- **Why a pane at all:** the card is 320 px wide. The shading, axes, zoom, cursor readout and image export need pane room and the pane machinery that already exists.
- **Locked type.** The pane header's type button reads `Eye · CH1` with a small lock. Clicking it opens a popover instead of the type tiles: "Pane 2 is an Eye pane. It shows the eye from Eye diagram on CH1, so it can't become another type. Traces can't be dropped on it." with **Go to the card** and **Close eye**.
- **Pane limit.** Eye panes count toward `MAX_PANES` (4, or 8 with the experimental setting). When all panes are in use, the card says so (info message) and offers "Show in [Pane N · Chart · 1 trace → P3 ▾] [Show eye]": the chosen pane's traces move to the nearest compatible pane, as one Undo step.
- **Closing the Eye pane** keeps the card and its results; its output row reads "→ Not shown · [Show in a pane ▾]". **× on the card** removes the card and its pane together, with Undo.
- **The source trace's row** in the Traces list shows the Eye pane as a tinted, non-removable badge (eye glyph + `P2`, Analysis tint). Tooltip: "Pane 2 is the Eye pane of the Eye diagram card on CH1. Close it from the card."
- **Name.** The tool stays "Eye diagram" in "+ Add analysis" (the term people search for). Its search also matches "eye analysis", "jitter", "mask", "bathtub" and the names of its created traces (section 7).

## 3. The card

A normal Analysis card (AC-3): neutral, 26–30 px header band in the faint Analysis tint, kind icon (Measure), title "Eye diagram", the source trace's swatch and short name, ⋯ and ×. **No show/hide eye button**: the pane is the picture; Close eye is in ⋯ and in pane settings.

### 3.1 Settings (above the hairline)

| Setting | Control | Default | Notes |
|---|---|---|---|
| Trace | trace picker | the selected trace | Time-domain traces only; others greyed with the reason. |
| Levels | menu | Auto | Auto · NRZ (2) · PAM3 · PAM4 · PAM6 · PAM8 · Custom… (2–8 levels with the user's own voltages). Auto reads the level histogram and says what it found ("Found 2 levels → NRZ"). Each row names where it is used (PAM3: USB4 v2, GDDR7, 100BASE‑T1, MLT‑3 looks alike; PAM4: PCIe 6, 200G–800G Ethernet, GDDR6X; PAM6/8: rare). With N levels the card measures N − 1 eyes. |
| Bit timing | Auto · Manual | Auto | See 3.2. |
| Offset | number, ps | found | Start of bit 1, measured from the start of the capture. Disabled (45 %) in Auto, showing the found value. |
| Bit length | number, ps | found | Shown with the bit rate it implies ("= 10.000 Gb/s"). Disabled in Auto. |
| Clock | Constant · PLL | PLL | PLL shows its loop bandwidth (default bit rate ÷ 1667, e.g. 6.0 MHz at 10 Gb/s). One line explains it: "Slow wander is followed, not counted as jitter." Jitter, eye width and TIE all depend on this, so it is explicit. |
| UI shown | number field | 2 | 1 – 8. More UI shows pattern effects. |
| Range | Whole trace · Pane N view | Whole trace | "Pane N view" uses only the samples visible in the source pane. |
| Mask | searchable menu + TX / RX | None | See 3.3. |
| Shading | menu with a ramp swatch | Trace hue | The same setting as the Eye pane's Display › Shading (section 5). |

### 3.2 Bit timing and the bit lines

- In **Manual**, the user types Offset and Bit length, or drags two vertical lines in the **source pane**: the left line is the start of bit 1 (offset), the right line is its end (offset + bit length). Every later bit repeats it.
- The lines are solid, 1.5 px, in the **Analysis ink** (not the trace colour, not dashed: dashes mean reference lines), with a light Analysis-tint band between them, an 8 × 14 px grip at the top of each line (`ew-resize` cursor), a tag above the band ("Bit 1 · 100 ps") and each line's time as a tag on the X axis ("70 ps", "170 ps").
- Later bit boundaries show as faint ticks (Analysis ink, 50 %) along the top and bottom edges of the plot, so the user can check the timing still lines up far into the capture.
- In **Auto**, the same lines show the found timing, thinner (1 px, 70 %). Dragging one switches the card to Manual. The note under the fields says "Found from 642 edges. Drag a line in Pane 1 to switch to Manual."
- The lines are drawn only while the card exists and only in panes that show the source trace. They are outlines of the tool, never markers (Measure rule).

### 3.3 Mask presets

- A searchable menu grouped by standard: **None** · USB (2.0 High-speed, 3.2 Gen 1, 3.2 Gen 2) · PCI Express (1.x, 2.0, 3.0, 4.0) · Display (HDMI 1.4 TMDS, DisplayPort HBR2 / HBR3) · Storage, Ethernet, telecom (SATA 3, 10GBASE‑SR optical, STM‑16 / OC‑48) · **Custom…** (draw or type corners) · **Import mask…** (CSV of polygons).
- Each preset shows its rate. A mask scales to the bit rate; **TX / RX** picks the test point where the standard defines both.
- **Mask geometry must come from each standard's specification.** Some are paywalled; a preset is added only when its values are sourced and recorded with a reference. Until then the menu shows only sourced presets plus Custom and Import.

### 3.4 Results (below the hairline)

Results are grouped. Each group header is a 26 px button (▾ open, › closed) with a one-line summary on the right, so a closed group still shows its key number. Open state is remembered per card. ⋯ › "Expand all groups". Values use the Value role (Plex Sans 600, tabular digits); secondary parts are muted. Definitions are in section 6.

- **Amplitude** (summary "H 0.64 V · Q 16.4")
- **Timing** ("W 0.79 UI")
- **ISI and equalization** ("Under · −0.9 dB")
- **Mask** ("PCIe 3 · 0 hits · 22 %", or "no mask")
- **Statistics**, tagged *estimated* ("TJ 51 ps")
- **Eyes** and **PAM4** (or PAM-N) groups replace parts of Amplitude and Timing when Levels is not NRZ: one row per eye (height, width, Q) plus level spacing.

Below the results: the **Create trace** section (section 7) and the output row "→ Shown in [P2] Eye pane · 2 UI" with **Copy results**.

### 3.5 Card messages

Neutral, thin status border, coloured icon (SC-3). Results never guess: when a value can't be measured it shows "—".

- Too little data: warning, "Only 38 UI in the Pane 1 view. An eye needs at least 100 UI: pick Whole trace or zoom Pane 1 out."
- No pane free: info, as in section 2.
- Closed eye: the Opening result reads "none found" with a Danger outline; height and width show "—".
- Statistics on a short capture: info, "From 1 284 UI and 642 edges. Below 10 000 UI these are rough; open a longer capture for firmer numbers."

## 4. The Eye pane

- **Header** (the normal pane header): `Pane 2` · locked type button `Eye · CH1` · "1 284 UI folded" · (spacer) · scale "X 0.25 UI/div · Y 200 mV/div" · settings (sliders). No Samples toggle, no X-link chip (UI is not linked to other panes). Narrow headers drop the scale, then the UI count; the type button becomes icon-only; settings never hides.
- **Plot:** X in UI (ticks every 0.5 UI, unit at the end of the axis), Y in the trace's unit (unit above the ticks). Grid dashed "3 3". Default range −0.5 … UI shown − 0.5 UI.
- **Shading:** a 2-D histogram of how often the signal passed through each point, drawn with the chosen colour map (section 5). Density scale **Log** by default (pane setting: Log · Linear). Legend at the bottom right: "rare [ramp] often".
- **Overlays** (pane setting Overlay › Show: Opening · Crossings · Mask · Legend, all on):
  - **Opening:** a vertical bar at the eye centre between the inner rail edges (eye height) and a horizontal bar at the crossing level between the crossings (eye width), each with end ticks. Solid, 1.5 px, in the **trace colour** with a 1.5 px halo in the plot background, plus tags `H 0.64 V` and `W 0.79 UI`. Never a diamond: a diamond reads as a mask.
  - **Crossings:** hollow dots in the trace colour at each crossing point.
  - **Mask:** regions dashed "6 4" like reference lines, Danger ink stroke, faint Danger tint fill, with a tag "PCIe 3 · 0 hits". Hits are hollow Danger dots.
  - On a dark plot (section 5) the trace colour uses its light tone.
- **Cursor:** crosshair, the X value as a tag on the X axis ("1.22 UI · 122 ps"), and the cursor card: swatch, value with unit, short trace name, and "214 passes here". The card flips left near the right edge (K-B2).
- **Zoom and pan:** as on Cartesian charts (scroll Y scale, Ctrl+scroll UI zoom around the cursor, Ctrl+drag / middle-drag pan, double-click or Space fits). Footer hints in an Eye pane: "Scroll Y scale · Ctrl+scroll UI zoom · Ctrl+drag pan · Double-click fit".
- **Markers and lines:** not in the first version (the eye is a density, not a trace). The cursor card is the readout.
- **Pane settings (sliders):** title "Pane 2 · Eye". Display: Shading (same as the card, with the note "Same as the Eye diagram card"), Density (Log · Linear), X axis (UI · Time). Overlay: the four chips above. Range: Y from / to with Fit. Actions: Copy image · Download image · **Close eye** (Danger ink). Display only; what is measured lives in the card.
- **Export:** Copy image / Download image and the Export dialog work as for other panes; the shading is rendered again at the target size.

## 5. Shading

One setting, two places: the card's **Shading** and the Eye pane's **Display › Shading** always show the same value; changing either changes both as one Undo step. Six colour maps:

| Map | Plot background | Character | Ramp (OKLCH, rare → often) |
|---|---|---|---|
| **Trace hue** (default) | chart background, follows Light/Dark | the trace's own colour | light: L 0.90 → 0.40, C 0.035 → 0.165, h = trace hue; dark: L 0.36 → 0.90, C 0.06 → 0.14 |
| **Viridis** | dark (`oklch(0.18 0.02 265)`) in both themes | even steps, colour-blind safe | L 0.30 → 0.92, C 0.09 → 0.17, h 295 → 100 |
| **Inferno** | dark | most contrast for rare paths | L 0.16 → 0.96; h 300 → 30 → 100; C peaks near 0.22 |
| **Cividis** | dark | safest for colour-blind viewers | L 0.30 → 0.90, h 255 → 95, low chroma in the middle |
| **Grey** | chart background, follows Light/Dark | for print and reports | light: L 0.90 → 0.28; dark: L 0.35 → 0.95; C 0 |
| **Scope** | dark | classic persistence rainbow | L 0.50 → 0.82, C 0.16, h 265 → 20; **uneven steps, not colour-blind safe**, and its hint says so |

Rules:

- Every map except Scope gets steadily lighter (dark plot) or darker (light plot) with density, so the eye still reads in grey and on paper.
- Overlays never change with the map (section 4).
- Colour-blind palette on: Trace hue uses the trace's Palette A colour. Scope stays available.
- The picker shows each map as a 48 × 10 px ramp swatch with its name and a one-line hint; the selected one in Slate with ✓.

## 6. Measurements

All of these work from one capture, in the browser. Time values are shown in UI and ps.

**Amplitude**
- Eye height: the inner distance between the one and zero rails at the eye centre (after noise).
- Eye amplitude: mean one level − mean zero level. One / zero levels.
- Rail noise: rms of each rail at the eye centre.
- Q factor = (μ1 − μ0) / (σ1 + σ0); SNR in dB.
- Crossing: crossing level as a percentage of the eye amplitude.
- Overshoot / undershoot and settling time (how long until the rail stays inside its band).
- Optical captures: extinction ratio.

**Timing**
- Eye width: the horizontal opening at the crossing level, between the crossing distributions.
- Jitter at the crossing: rms and peak-to-peak.
- DCD (duty-cycle distortion): the time between the rising-edge and falling-edge crossing means.
- Rise / fall time (20–80 % or 10–90 %, a setting) and slew rate.

**ISI and equalization**
- **Equalization check:** every bit is sorted by what came before it: right after a transition (T) or inside a run of equal bits (R). Their mean levels at the eye centre give the ratio 20·log10(T / R) in dB. Below −0.4 dB: **Under** (classic ISI: the rails split inward). Above +0.4 dB: **Over** (too much pre-emphasis or CTLE: a bump after every edge, rails split outward). In between: **Balanced**. Shown as a chip with a Warning (Under / Over) or Success (Balanced) outline, plus "Transition / run 0.352 / 0.388 V".
- ISI jitter (DDJ): how much the crossing time depends on the preceding bit pattern.

**Mask**
- Mask hits (count) and mask margin (how far the mask can grow, in %, before the first hit).

**Statistics (estimated)**
- Random jitter (RJ, rms) and deterministic jitter (DJ, peak-to-peak) from a dual-Dirac fit of the crossing histogram tails.
- TJ at a target BER (default 1e‑12) = DJ + 2 · Q(BER) · RJ, and eye width at that BER.
- Always tagged *estimated*; a capture needs at least 100 UI for an eye and is called rough below 10 000 UI.

**PAM-N**
- Per-eye height, width and Q; level spacing (RLM); the measured levels; eye skew.

## 7. Created traces

The outputs are **buttons inside the card**, in a "Create trace" section: **Bathtub · Pulse response · TIE · Jitter histogram · Jitter spectrum · Level histogram**. The same list is in the card's ⋯ › Create trace ▸. They are not separate analyses.

- **Click:** a live created trace (ƒ) appears nested under the source trace ("ƒ bathtub · CH1"), in a pane that fits its units; a new pane if none does. One toast: "Bathtub · CH1 added to new Pane 3 · Undo". In the card the button turns into **✓ Bathtub** (Slate) and an output row appears: ƒ · swatch · name · pane badge · ×.
- **One live output of each kind per card.** Its data comes entirely from the card's settings, so a second live copy would always be identical. Clicking ✓ Bathtub again (or choosing it from ⋯ or search) **selects the existing trace** and makes its pane the target. No second trace, no toast.
- **More panes:** the trace's pane badges (Show in), like any trace.
- **A snapshot to compare:** the trace's ⋯ › **Freeze as a copy**, then change the card; the frozen copy (its own created colour, "frozen copy · no longer follows the card") stays. Settings that should run side by side all the time (PLL vs constant clock, CH1 vs CH2) are **two Eye cards**, each with its own outputs.
- **Live:** changing the card's settings updates its outputs. Removing the card keeps them as frozen traces, with Undo (Math card rules).
- **Difference from the Touchstone matrix:** a matrix cell makes plain traces from file data, so "S11 · dB" can be added again into another pane. Eye outputs belong to their card, like a Math card's output.
- **Search shortcut:** typing an output name in "+ Add analysis" shows "Eye diagram › Bathtub" per trace. On a trace with an Eye card it selects or creates that output; on another trace it adds an Eye card there and creates it.

**Units and placement.** The X unit decides where a created trace can go; it never enters a pane with another X unit (the existing rule).

| Output | X axis | Y axis | Goes to |
|---|---|---|---|
| Bathtub | UI (0 – 1) | BER, log | a pane in UI with a log Y, else a new pane |
| Pulse response | UI | V | a pane in UI and V, else a new pane |
| TIE | s | s (ps) | a new pane, X-linked to the source pane |
| Jitter histogram | s (ps) | count | a new pane |
| Jitter spectrum | Hz | s rms (ps) | a Hz pane with the same Y unit, else a new pane |
| Level histogram | V | count | a new pane |

Placement order: a pane with the same X and Y unit → a new pane → "Not in a pane" with the reason when the pane limit is reached.

- **Bathtub:** BER against the sampling position across one UI. Near the crossings almost every bit would be read wrong (the walls); in the middle almost none (the floor). The floor's width at 1e‑12 is the eye width you can count on. The chart shows a dashed reference line at 1e‑12, hollow dots where the curve crosses it and a tag "W @ 1e‑12 0.49 UI". Random jitter makes the walls slope; pattern jitter pushes them inward.
- **Pulse response:** the averaged response to a lone 1 (0 1 0), with the cursors h−1, h0, h+1, h+2 as hollow dots; side cursors labelled as a percentage of h0.
- **TIE:** each edge's time error against the recovered clock, over the capture.

## 8. Chart additions this needs

- **"UI" as an X unit**, switchable to ps because the bit length is known.
- **Log Y scale** next to Linear and dB, for BER.
- Created-trace colours and nesting as for Math outputs.
- **Workspace:** the Eye card, its settings, its Eye pane and its created traces are new saved state. This needs a migration in `workspace-migrate-v5.ts` and a test in `tests/unit/workspace-v5.test.ts` (CLAUDE.md rule).
- Computation belongs in `src/domain/` (pure, unit-tested), following the analysis-tool contract (`appliesTo`, `params`, `compute`, `outputs`: numbers, overlay and traces). Large captures should fold and bin in a worker.

## 9. Build order

1. **First version:** the card and the Eye pane; Levels Auto / NRZ / PAM4; Auto and Manual bit timing with the bit lines; Clock; UI shown; Range; Trace hue and Grey shading; Amplitude, Timing, ISI and equalization results; opening and crossing overlays; the states in section 3.5; workspace migration.
2. **Next:** all six shadings; PAM3 / PAM-N and the per-eye groups; masks (Custom, Import, and sourced presets) with hits and margin; created traces TIE, pulse response, jitter histogram and spectrum, level histogram; "UI" X unit; the search shortcut.
3. **Later:** Statistics (RJ / DJ, TJ, width at BER), the bathtub (needs the Log Y scale) and a BER contour on the eye; then an **Equalizer** Math card (CTLE / FFE) whose output trace gets its own Eye card, to see under- and over-equalization change live.

## 10. Open questions

- Which mask presets to ship first, and where their geometry is sourced from.
- PLL model details (order, peaking) and whether to offer a "golden PLL" per standard.
- Whether markers make sense in an Eye pane (a marker at a time and level reading the density there).
- Performance limits for very long captures before the worker is needed.
