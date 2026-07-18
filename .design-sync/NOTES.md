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

## Styling

`cfg.cssEntry` set to `src/index.css` (CSS custom-property tokens: `--bg`, `--text`,
`--accent`, etc., used pervasively via `var(--*)`). First build run (before this was
set) produced `[CSS_RUNTIME]` with an empty self-styling stub — expected, not yet
re-verified with `cssEntry` wired.

## Status at handoff

- `npm ci` done.
- `.ds-sync/` staged, converter deps (`esbuild`, `ts-morph`, `@types/react`)
  installed.
- One successful synth-entry build: 46 components discovered under
  `src/components` (whole-tree scope, as the user chose), 0 docs matched, 0
  previews authored yet (none of §4 has started).
- `cssEntry` just added to config; **not yet rebuilt/reverified with it.**
- No `cfg.provider` chain configured yet — render check has not been run
  (`package-validate.mjs` not yet invoked), so no confirmed count of components
  that fail to render.
- Nothing uploaded. `finalize_plan` never called. No approval prompt shown yet.

## Re-sync risks

- The `node_modules/mergen-scope` self-symlink is gitignored (`node_modules/`) —
  it must be recreated on every fresh clone before the converter can run at all.
  This is unusual enough to call out explicitly in any re-sync instructions.
- If the user narrows scope to the 21 context-free components, `componentSrcMap`
  should be used to exclude the other 26 (`{"ChartPane": null, "Sidebar": null,
  ...}`) rather than leaving them in and fighting the provider chain per-component.
- `cssEntry` was set from a single guess (`src/index.css`) — confirm it's actually
  the file that defines the `--*` custom properties referenced everywhere before
  trusting renders.
