# design-sync notes — mergen-scope

## Repo shape mismatch (read this before re-running)

mergen-scope is a browser **app** (Vite + `viteSingleFile`, bundled to a single
`dist/app.html`), not a publishable component-library package:

- `package.json` has no `main`/`module`/`exports`/`types` — there is no importable
  entry point at all.
- `dist/` only ever contains the bundled app HTML, never a JS module with named
  exports.
- To get the package-shape converter to run in synth-entry mode at all, this repo
  had to be **self-symlinked into its own `node_modules`**
  (`node_modules/mergen-scope` → repo root, junction) so `lib/dts.mjs`'s
  `node_modules/<pkg>/package.json` resolution succeeds. Without that symlink the
  build hard-fails with `ENOENT ... node_modules/mergen-scope/package.json`, and
  even with a fake `node_modules/mergen-scope/package.json` alone (no src/) it
  fails with `[NO_DIST] ... no src/ to synthesize from`. **The symlink is required
  input, not a workaround to remove** — document it in `buildCmd`/setup for any
  future sync, and recreate it on a fresh clone before building.
- `cfg.srcDir` is set to `src/components` so the scan doesn't pull in stores/hooks/
  domain logic as "components".

## Provider/context problem (the real blocker)

Of the 47 `.tsx` files under `src/components`, **26 directly call one of the app's
context hooks** (`usePaneState`, `useMarkerState`, `useRefLineState`, `useUiState`,
`useFileDispatch`, `useTraceState`, `useTheme`, etc. — 6 separate store providers
defined in `src/stores/*.tsx`). These components (ChartPane, Sidebar, ToolbarStrip,
TopBar, FooterBar, ImportExportPanel, and everything under `panels/`/`layout/`)
were built to run inside the app's full provider tree with real loaded trace data —
they are not standalone/presentational components and will render empty or throw
"no context" errors as design-sync preview cards without either:

1. wiring `cfg.provider` as a 6-level nested chain (`inner`) through every store
   provider, AND
2. seeding each store with realistic mock trace/pane/marker data (none of the
   providers default to anything visually meaningful — an empty pane, no traces,
   no markers), which is composition work far beyond a normal design-sync preview
   (`.tsx`) — closer to hand-building a mock app harness per component.

**The 21 components that do NOT touch app context** (genuine candidates for a
"shared primitives" design-system sync) are:
`AnalysisFeatureCard, AnalysisMenuCard, GroupDelayCard, ReciprocityIsolationCard,
ReturnLossCard, StabilityCard, VSWRCard, CartesianPane, SmithPane, SidebarPanel,
Btn, MR, PretextLabel, Sec, MarkerItem, RefLineItem, TouchstoneMatrixPicker,
TraceRow, WizardColumnConfig, WizardDomainPicker, WizardPreviewTable`.
(Note: `MarkerItem`/`RefLineItem` here are the *standalone* files under
`src/components/sidebar/` — separate from Sidebar.tsx's own inline duplicate
implementations; see the unrelated code-review finding from earlier in this
session about that duplication.)

## Decision: scope narrowed to the 21 context-free components

After the above was written, the user was walked through the tradeoff (option 1:
sync only the 21 standalone components now, vs. option 2: build a 6-level mock
provider chain + fake trace/pane/marker data to also cover the 26 app-coupled
ones). They chose **option 1**, explicitly because the app is headed toward a
heavily modular architecture (a universal waveform/file viewer) — the 26
excluded components are coupled to the current monolithic store tree for the
*same reason* they'd resist becoming modular, so syncing them now (with fake
mock data papering over that coupling) would just document the pre-refactor
shape and go stale. Revisit each one as it's pulled apart into a real
standalone, prop-driven component during that refactor — `componentSrcMap`'s
`null` entries for it should come out at that point so the next sync picks it
up automatically.

The 26 are excluded via `cfg.componentSrcMap: {"<Name>": null, ...}` — see
`config.json`. Excluded names: `AnalysisPanelStack`, `ThresholdCrossingsCard`,
`BandwidthHelperCard`, `ChannelPowerCard`, `IP3Card`, `NoisePSDCard`,
`OccupiedBandwidthCard`, `PeakTableCard`, `RangeStatsCard`, `RippleCard`,
`TraceOpsCard`, `ChartPane`, `ChartWorkspace`, `EmptyChartPane`,
`PaneSettingsPopover`, `SmithChart`, `SmithGrid`, `FooterBar`,
`RightPanelStack`, `Sidebar`, `StatusBar`, `ToolbarStrip`, `TopBar`,
`DataTablePanel`, `ImportExportPanel`, `ImportWizardModal`.

Of the 21 originally-scoped names, `MR` (`src/components/shared/MR.tsx` —
a simple label/value metric-readout row, genuinely a component) is dropped by
`lib/dts.mjs`'s `isComponentName` heuristic: `!/^[A-Z][A-Z0-9_]+$/.test(n)`
treats any all-caps-after-first-letter name as a constant/enum, and "MR"
matches that pattern. **Tried and reverted**: pinning
`componentSrcMap.MR = "src/components/shared/MR.tsx"` does NOT work around
this — a non-null `componentSrcMap` entry switches the whole scan into
"only build the pinned set" mode (dropped the other 19 down to a 1-component
build), and even alone in that mode `MR` still failed the same
`isComponentName` filter (`excluded 1 enum/type/context/hook exports; 0
components`). Getting `MR` synced would require forking `lib/dts.mjs`
(`libOverrides`) to special-case this name — not worth it for one component;
left excluded. If this bugs you, either rename the export to something
longer (`MetricRow`?) or fork `dts.mjs`.
20 components shipped, not 21.

## Styling

`cfg.cssEntry` set to `src/index.css` — confirmed correct: build reported
`css: ... src/index.css (5 KB, copied)` and the compiled `_ds_bundle.css`
defines every token referenced in `conventions.md` (verified by grep against
the built output, not just assumed).

## Known render warns

- `[FONT_MISSING]`: "Inter" and "IBM Plex Mono" (`--font-mono`) are referenced
  by the CSS but never shipped as `@font-face`/webfont anywhere in the repo —
  confirmed by grep, this is not a design-sync scrape miss. The real app
  itself relies on the OS having "Inter" installed and falls back to
  `system-ui`/monospace otherwise. Accepted as-is (matches real app behavior);
  not wired via `extraFonts`/`runtimeFontPrefixes`. A future re-sync should
  NOT chase this warn — it's expected.

## Status at handoff (sync complete)

- `npm ci` done; `.ds-sync/` staged with converter deps installed.
- Chromium installed for the render check (user approved the ~200MB download).
- Final build: 20 components under the narrowed scope. `cssEntry` verified.
  Render check: 20/20 clean, 0 bad. 2 components authored
  (`Sec`: Default/StandaloneLabels; `TouchstoneMatrixPicker`: TwoPort/FourPort),
  both graded `good` on the absolute rubric and carried-forward-confirmed on
  re-capture. The other 18 ship as floor cards (unauthored, not failures) —
  standing offer to author more on any future re-sync.
- `readmeHeader` set to `.design-sync/conventions.md`; validated every named
  token/class/component against the actual built artifacts before shipping
  (`grep`'d `_ds_bundle.css` for all 24 CSS custom properties named, confirmed
  `Sec`/`TouchstoneMatrixPicker` dirs exist in `ds-bundle/components/`).
- `report_validate` called with `{total:20, bad:0, thin:0, variantsIdentical:0,
  iterations:2}`.
- **Uploaded** via the incremental path: `finalize_plan` approved by the user,
  sentinel → 88 files (bundle + styles + vendor + previews + all 20 component
  dirs) → sentinel re-arm → `_ds_sync.json` last. Post-upload `list_files`
  confirmed exact match, no orphans, nothing to delete.
- Project: `https://claude.ai/design/p/e32656e0-f5ff-4b04-810e-4af5a3e53112`

## Re-sync risks

- The `node_modules/mergen-scope` self-symlink is gitignored (`node_modules/`) —
  it must be recreated on every fresh clone before the converter can run at all:
  `node -e "require('fs').symlinkSync(process.cwd(), 'node_modules/mergen-scope', 'junction')"`
  (Windows junction; a plain symlink on POSIX). This is unusual enough to call
  out explicitly — a re-sync that skips it fails at `[NO_DIST] ... no src/ to
  synthesize from` or an `ENOENT` on `node_modules/mergen-scope/package.json`.
- No real `dist/` build was ever used — every sync so far has been synth-entry
  mode from `src/`, which the converter itself flags as weaker `.d.ts`
  contracts than a real build would give. If this repo ever gains a real
  library-mode build (vite `build.lib` + `.d.ts` emission) for a components
  package, prefer pointing `--entry` at that over continuing synth-entry mode.
- The 26 excluded components are a moving target — as the app modularizes,
  some will stop reading global context and become syncable. Check
  `componentSrcMap` against `src/components` on each future sync, not just
  trust the current exclusion list.
