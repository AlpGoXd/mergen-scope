# Smith pane: integration notes

Branch `smith/renderer` (from `ts_refactor` at `8cb9b4e`). It only adds files; nothing existing was edited. This list is what the orchestrator wires after the Table step merges.

## What is on the branch

| Path | What |
|---|---|
| `src/domain/smith/grid.ts` | r / x circles and arcs clipped to the unit circle, the Y grid (rotated 180°), zoom levels, the circle and arc through a point |
| `src/domain/smith/labels.ts` | grid label text (normalised, Ω, mS) and positions with overlap removal |
| `src/domain/smith/hit.ts` | nearest sample, nearest point on the line, frequency at a point, Γ at a frequency |
| `src/domain/smith/band.ts` | split a trace into in-band and out-of-band runs; trace path data |
| `src/domain/smith/trace-decor.ts` | direction chevrons, start and end samples |
| `src/domain/smith/readout.ts` | `smithReadout` (Z, Y, \|Γ\|, ∠Γ, VSWR, RL, L or C), `renormalizeGamma`, text formatting |
| `src/components/smith/SmithPane.tsx`, `smith-pane.css` | the renderer; props only, no store |
| `src/components/smith/demo/` | dev-only demo page and the synthetic LNA model (not in the build) |
| `tests/unit/smith-*.test.ts` | 5 files, 46 tests |
| `docs/redesign/smith-evidence/` | screenshots and `capture.cjs` |

`src/domain/smith/numerics.ts` and `viewport.ts` (already in the tree) are used as they are.

## 1. A container that feeds `SmithPane`

`SmithPane` reads no store. Add a small container (suggested: `src/components/smith/SmithPaneContainer.tsx`, signature `{ paneId: string }` like the other renderers) that builds these props:

| Prop | Source |
|---|---|
| `traces: SmithPaneTrace[]` | The pane's traces that pass `canRenderInPane`. For each: `traceId = trace.id`, `name = trace.name` (markers match on it), `shortName` = the parameter ("S11"), `color` from `useTraceColors()`, `created` = the trace is a created (ƒ) trace (`traceWidth(assignment) === 2`), `z0` from `portZ0(network.referenceOhms, row)`, `samples` = `network.samples.map(s => ({ frequencyHz: s.freq, gamma: s.sMatrix[row][col] }))`. |
| | For Z11 / Y11 files convert each sample with `impedanceToGamma` / `admittanceToGamma` and the file's Z0. If traces in one pane have different Z0, bring them to one with `renormalizeGamma(gamma, fromZ0, toZ0)`; the grid labels use the first trace's `z0`. |
| `markers: Marker[]` | `markerState.markers`, unfiltered. The pane shows only markers whose `trace` equals one of its trace names, and names them `M{n}` / `DM{n}` from their position in this array, the same rule as `ChartPane`. Pass `markerNames` only if naming changes. |
| `selectedMarkerId` | `markers[selectedMkrIdx]?.id ?? null` |
| `onSelectMarker(id)` | dispatch `SET_SELECTED_IDX` with the index of that id (and clear the selected line, as the chart does) |
| `onTraceClick({ traceId, frequencyHz, sampleFrequencyHz })` | When the marker tool is armed: place a marker on that trace at `sampleFrequencyHz` (snap) or `frequencyHz` (interpolated), following the pane's interpolation setting. `Marker.amp` has no meaning on Smith; store the trace's own value at that frequency so Cartesian panes stay right. |
| `band: { minHz, maxHz } \| null` | The visible X range of the pane's Hz link group (`sharedZoom` when `zoomAll`, else that group's zoom). `null` when the linked pane shows everything or the Smith pane is unlinked. |
| `cursorFrequencyHz` / `onHoverFrequency` | The shared cursor: pass the hovered frequency of the linked Hz panes in, and publish this pane's hover out so they draw their ghost crosshair. Today `useSharedCursor` is local state per caller; it needs to be shared per link group for this. |
| `grid`, `labels`, `direction`, `readout` | Pane settings, see section 3. |
| `showMarkers`, `showMarkerTags` | `settings.showMarkers`, `settings.showMarkerLabels` |
| `fitRequest: number` | A counter the container increments when the app's Fit runs for this pane (header Fit button, Space / F from `use-keyboard`). |

Zoom and pan are kept inside `SmithPane` on purpose (they never move another pane). They are not saved in the workspace; if they should be, lift the `{ center, zoom }` state to a prop pair first.

## 2. Registry and renderer

- `src/domain/pane-type-registry.ts`, the `smith` entry: `status: 'available'`, drop `laterReason`, set a real description ("Reflections (S11, S22 …) as impedance."), and `settings: ['display', 'smith']` (add `'smith'` to the settings-section union in `src/types/registry-contract.ts` if it is not there).
- `src/components/chart/pane-renderers.tsx`: `smith: SmithPaneContainer`, and an `emptyStateFor('smith')` entry: "Empty Smith chart" / "Add reflection traces (S11, S22 …) from the matrix or the Traces list." `SmithPane` itself shows a one-line caption when it gets no traces.
- `src/components/panes/PaneTypePicker.tsx`: the Smith tile's `state: 'later'` and its reason go away; update the picker and type-menu tests that expect Smith to be `aria-disabled` (`tests/e2e/pane-type-picker.spec.ts` lines 21, 74, 86–87 and the unit tests for the registry and picker).
- `src/components/chart/ChartPane.tsx` still renders the old `chart/SmithPane` when `isSmith` (lines 56, 130, 1247). Once the registry routes Smith panes to the new renderer, remove that branch and delete `src/components/chart/SmithPane.tsx`, `SmithChart.tsx`, `SmithGrid.tsx` and `src/domain/smith-coords.ts` (check for other importers first).
- `smith-pane.css` is imported by `SmithPane.tsx`; nothing to add to `main.tsx`.
- `renderMode: 'smith-inverted'` (the old Y chart) maps to `grid: 'y'` and `readout` starting with `'y'`; a workspace migration can then fold it into `'smith'`.

## 3. Pane settings when Type = Smith

A "Smith" section replaces Grid in `PaneSettingsPopover`. The saved shape already exists (`WorkspacePaneSettingsV5.smith`):

| Setting | Options | Prop |
|---|---|---|
| Grid | Z · Y · Z + Y (in Z + Y the impedance grid is red and the admittance grid blue, both translucent, as on the classic combined chart; Y alone is dashed) | `grid: 'z' \| 'y' \| 'both'` |
| Labels | Normalised · Ohms | `labels: 'normalised' \| 'ohms' \| 'off'` |
| Direction | Chevrons + ends · Ends · Off | `direction: 'chevrons' \| 'ends' \| 'off'` |
| Readout | Z · Y · \|Γ\|∠ · VSWR · RL | `readout: ('z' \| 'y' \| 'gamma' \| 'vswr' \| 'return-loss')[]` |

One mismatch to settle: the saved `smith.labels` is a `boolean`, while the board has Normalised / Ohms. Either map `true → 'normalised'`, `false → 'off'` and add the ohms choice later, or change the saved field to the three-way value with a migration in `workspace-migrate-v5.ts` and a test.

Defaults in the component: `grid 'z'`, `labels 'normalised'`, `direction 'chevrons'`, `readout ['z', 'gamma', 'vswr']`. The equivalent L or C is shown whenever Z is.

## 4. Matrix rule: only Sii cells on a Smith target

The rule is already coded and needs no new logic, only a check once a Smith pane can be reached:

- `planMatrixAdd` (`src/domain/matrix-add.ts:18-19`) refuses a non-reflection cell with "Smith panes show reflection (Sii) only", using `smithParameterCapability` (`src/domain/pane-placement.ts:34`).
- `Sidebar.tsx` (lines 167–322) already ignores Plot as, greys the cells with that reason, and limits the batch pick to "All Sii" when the target pane's `renderMode` is `smith` or `smith-inverted`.
- `smithParameterCapability` also lets Z11 and Y11 through (they are converted to Γ). The container in section 1 must do that conversion, or the rule should be narrowed to Sii until it does.
- Dragging a trace onto a Smith pane uses the registry's `appliesTo` (`canRenderInPane`), which already returns the reason.
- Add the e2e from the brief when Smith is available: open `test files/cascaded chain.s2p`, set a pane to Smith, S11 draws, S21 is refused with the reason, hover lights the r and x circles, a marker's readout shows Z and VSWR, scroll zooms around the cursor. Useful hooks: `data-testid` `smith-pane`, `smith-plot`, `smith-trace-<id>`, `smith-grid-z`, `smith-grid-y`, `smith-hover-grid`, `smith-hover-card`, `smith-marker-<id>`, `smith-readout` (fields carry `data-field`), `smith-ghost`, `smith-active-area`.

## 5. Keys, gestures and text elsewhere

- In the pane: scroll zooms around the pointer; Ctrl+left-drag or middle-drag pans; double-click fits; with the plot focused, Space or F fits and + / − zoom. These match `FooterBar`'s existing Smith hint and `help/shortcuts.ts` ("Scroll … (Smith: zoom both)").
- The global Space / F ("Fit all") should also bump `fitRequest` for Smith panes.
- ← / → (move the selected marker one point) and Delete act on the marker store and need no Smith code. Tab / Shift+Tab stepping from the brief is not bound inside the pane (see below); the ‹ › buttons in the strip do it.
- Right-click on a marker (Add Δ, Delete…) is not handled in `SmithPane`: add an `onMarkerContextMenu` prop when the marker menu is wired.

## Left out on purpose

- **Tab / Shift+Tab to step markers.** Binding Tab inside the plot traps keyboard focus. The ‹ › buttons step markers; bind the keys globally if wanted.
- **Trace symbols** (`trace-symbols.ts`, for repeated colours) and **sample dots** on Smith traces.
- **Dragging a marker** along a trace, and the marker context menu.
- **Labels for the Y grid in Z + Y mode**: only the Z grid is labelled there, to keep the rim readable.
- **Decimation**: every sample is drawn. Fine for typical sweeps (a few thousand points per trace); add min/max thinning if 20k-point traces show up on Smith.
- **Saved zoom**: the Smith view resets to fit when the pane remounts.
- **e2e spec**: Smith cannot be reached in the app until the registry entry is switched on, so the browser check is the demo page plus screenshots.

## How to look at it

```bash
npm run dev            # then open /src/components/smith/demo/index.html
# screenshots (dev server on 5183):
npx vite --port 5183 --strictPort
node docs/redesign/smith-evidence/capture.cjs
```

Demo URL options: `theme`, `size`, `grid`, `labels`, `direction`, `band=1`, `active=1`, `bare=1`.
