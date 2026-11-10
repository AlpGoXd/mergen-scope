# Smith pane: brief for the dedicated Fable 5.2 session

This is the hardest part of the redesign, so it gets one focused session on **Fable 5.2, effort high**. Nothing else happens in that session. The orchestrator (Sonnet) does the wiring afterwards, and Codex Terra reviews the maths.

## What exists already (don't rewrite)

- `src/domain/smith/numerics.ts`: `portZ0`, `impedanceToGamma`, `admittanceToGamma`, `gammaToImpedance`, `gammaToAdmittance`, `passiveMetrics` (VSWR, return loss), `seriesEquivalent` (L or C at a frequency). All return `SmithResult<T>` with explicit failure states.
- `src/domain/smith/viewport.ts`: `gammaToPoint`, `pointToGamma`, `zoomAt`, `panBy`, `fitViewport`.
- `src/types/smith-plot.ts`: `SmithViewport`, `SmithSample`, `SmithTrace`, `SmithPlot`, `SmithPoint`, `SmithInteraction`.
- `src/domain/pane-type-registry.ts`: the `smith` entry with its `appliesTo` adapter.
- `tests/unit/phase5-smith-foundation.test.ts`.

## Scope of this session

1. **Pure geometry in `src/domain/smith/`, no React:**
   - `grid.ts`:
     - constant-resistance circles and constant-reactance arcs for the Z grid, as SVG path data in Γ space;
     - the Y grid (the same grid rotated 180°);
     - the Z + Y overlay;
     - a zoom-dependent set of values, so grid lines stay about 40–80 px apart;
     - full view: r = 0.2, 0.5, 1, 2, 5 and x = ±0.2 … ±5; zooming adds 0.1, 0.3, 0.7, 1.5, 3 and so on.
     - Resistance r: circle centred at (r/(1+r), 0), radius 1/(1+r).
     - Reactance x: circle centred at (1, 1/x), radius 1/|x|, clipped to the unit circle (and to the view when zoomed).
   - `labels.ts`: label positions and text.
     - Resistance values sit on the real axis, just above it, at each circle's left edge.
     - Reactance values sit outside the rim at the end of each arc: +j in the top half, −j in the bottom half; "0" and "∞" at the two ends of the axis.
     - When the rim is off screen, each reactance label moves to where its arc leaves the view.
     - Normalised by default ("0.5", "+j0.5", never "0.5j" or "i"). An ohms mode multiplies by Z0 ("25 Ω", "+j25 Ω"); the Y grid uses mS.
     - Overlap: the label for the smaller value is dropped first.
   - `trace-decor.ts`:
     - direction chevrons every 1/5 of the trace's on-screen length, rotated to the local tangent and pointing to higher frequency;
     - a hollow start dot and a filled end dot, each with its frequency;
     - setting: chevrons + ends (default) · ends only · off.
   - `hit.ts`:
     - the nearest sample to a screen point, in pixels, returning its frequency (markers store a frequency, exactly like Cartesian markers);
     - the resistance circle and reactance arc through a given Γ, for the hover highlight.
2. **The renderer, `src/components/chart/SmithChart.tsx`:** SVG, no new dependency, Recharts stays for Cartesian.
   - **Transform:** one scale + offset on a `<g>` for zoom; lines keep 1 px with `vector-effect: non-scaling-stroke`.
   - **Grid colours:** grid in `--border`; the outer circle and real axis in `--border-strong`. Labels in JetBrains Mono 10 px, muted, with a background-coloured halo; they never rotate.
   - **Traces:** in their trace colour from `src/domain/trace-palette.ts` (1.5 px for sources, 2 px for created traces, never dashed); symbols from `src/domain/trace-symbols.ts` when the setting asks.
   - **Markers:** same tags as Cartesian (name; the selected marker adds its frequency).
   - **Readout strip** at the bottom of the pane, for the selected marker only:
     - swatch, name, short trace name, then Z = Z0·(1+Γ)/(1−Γ) (or Y, |Γ|∠, VSWR = (1+|Γ|)/(1−|Γ|), RL = −20·log|Γ|, per the pane's Readout setting) and the equivalent L or C;
     - ‹ › step through markers (also Tab / Shift+Tab);
     - in a narrow pane, fields drop from the right (VSWR first);
     - for a delta marker: Δf and ΔRL only.
   - **Hover:** the nearest point on the trace with a card (frequency, Z, |Γ|); the resistance circle and reactance arc through it light up in the accent colour.
   - **|Γ| > 1** (active ports): the view grows to fit; the area outside the unit circle gets a light warning tint and a dashed edge; the readout shows the negative R. Nothing is clipped.
   - **Zoom and pan:**
     - scroll zooms X and Y together around the cursor (circles stay round);
     - Ctrl+left-drag or middle-drag pans;
     - Space or double-click fits.
   - **Linked zoom (band-follow):** when a linked Hz pane is zoomed to a band, the Smith pane shows that band in full colour and the rest of the trace faint. The Smith geometry itself doesn't zoom. Scrolling or panning inside the Smith pane never changes other panes. Hovering the Smith trace shows the ghost crosshair at that frequency in linked Hz panes, and the other way round.
3. **Pane settings when Type = Smith** (replaces the Grid section):
   - Grid: Z · Y · Z + Y (Z solid, Y dashed and lighter);
   - Labels: normalised · ohms;
   - Direction: chevrons + ends · ends · off;
   - Readout: Z · Y · |Γ|∠ · VSWR / RL (Y panes default to Y).

   Switching Z ↔ Y keeps markers and zoom exactly where they are: the point is Γ, and only how it's read changes.
4. **What a Smith pane accepts:**
   - reflection parameters only (Sii of any network file, including active ports), and Z or Y files converted to Γ with the file's Z0;
   - renormalise when Z0 differs: Γ′ = (Z − Z0′)/(Z + Z0′);
   - transmission parameters and non-complex traces are refused with the reason, both when dragging over the pane and in the matrix (greyed Sij cells on a Smith target).

## Tests (write them first)

- **Grid maths:** points on the r = 1 circle satisfy |Γ − 0.5| = 0.5; points on the x = 1 arc satisfy |Γ − (1 + j)| = 1; the Y grid is the Z grid rotated 180°.
- **Numerical fixtures** with known answers:
  - Z = 50 Ω → Γ = 0;
  - Z = 0 → Γ = −1;
  - open → Γ = 1;
  - 25 Ω → Γ = −1/3;
  - 50 + j50 Ω → Γ = 0.2 + 0.4j;
  - a series RLC at 2.45 GHz behind a short line (the P5 model);
  - an active port with |Γ| = 1.3.
- **Labels:** positions and the drop-smaller-value-first rule; label text in both modes ("+j0.5", "+j25 Ω", mS on Y).
- **Decor and hit testing:** chevron count and direction; the start/end dot frequencies; nearest-sample hit testing returns the right frequency.
- **Viewport:** zoom keeps circles round; fit includes |Γ| > 1.
- **Browser (e2e):** open `test files/cascaded chain.s2p`, set a pane to Smith, check S11 draws, S21 is refused with the reason, hover lights the r and x circles, a marker's readout shows Z and VSWR, and scroll zooms around the cursor.

## Rules for the session

- Follow `CLAUDE.md` (no push, no deploy, no new dependency).
- Don't touch `ChartPane.tsx`: Smith is its own component behind the pane-type registry.
- Report: what was built, test results (typecheck, unit, e2e), and anything left for the wiring step.
