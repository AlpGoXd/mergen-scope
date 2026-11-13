## Mergen Scope UI conventions

This is a **partial** design system: only the 20 standalone, prop-driven pieces
under `src/components` are synced here (`Btn`, `Sec`, `MarkerItem`,
`RefLineItem`, `SidebarPanel`, `TraceRow`, `CartesianPane`, `SmithPane`,
`TouchstoneMatrixPicker`, the wizard-step components, and 7 analysis-result
cards). The rest of the app (chart canvas, sidebar shell, toolbar, top/footer
bars) reads from six global React contexts and isn't synced yet — treat this
library as low-level building blocks, not a full app shell.

**No wrapper/provider needed.** None of the synced components read from React
context — they're plain prop-in, JSX-out. Import and use directly, no root
wrapper required.

**Styling: CSS custom properties, not classes.** There is no utility-class
system. Every color, spacing-adjacent font size, and line-height is a
`var(--token-name)` read directly in inline `style` objects (this DS styles
via inline `style={{ color: 'var(--text)', ... }}`, not `className`). Real
token names, defined in `styles.css`:

- Surfaces/text: `--bg`, `--card`, `--border`, `--text`, `--muted`, `--dim`, `--accent`, `--grid`
- Trace colors (cycled per raw trace, 6-color palette): `--tr0`…`--tr5`
- Derived-trace colors: `--dr0`…`--dr5`
- Marker colors: `--mn` (normal), `--md` (delta), `--mp` (peak)
- Reference-line colors: `--refV` (vertical), `--refH` (horizontal)
- Type scale: `--font-caption`, `--font-label`, `--font-body`, `--font-emphasis`, `--font-title`, `--font-display`, plus matching `--lh-*` line-heights
- Monospace stack: `--font-mono` (`"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace` — falls back to system monospace; the family isn't shipped as a webfont by the app itself)
- Body font is `'Inter', -apple-system, system-ui, sans-serif` — same fallback situation, not shipped as a webfont

**Theming: a class on `<html>`, not a provider.** Light is the default
`:root` token set. Dark and glass are opt-in via
`document.documentElement.classList.add('theme-dark')` /
`.add('theme-glass')` (mutually exclusive — the app removes the others
first). There is no `ThemeProvider` component — tokens above simply resolve
differently under each class. `.theme-dark` and `.theme-glass` overrides are
both defined in `styles.css`.

**Where the truth lives.** Read `styles.css` (root) for the full token set —
it `@import`s `_ds_bundle.css`, which is the real compiled component CSS
(minimal here: the app styles almost everything inline via `var(--*)`, so
`_ds_bundle.css` mostly just carries the `:root` token block and theme-class
overrides). Per-component `.prompt.md` files carry the prop contracts.

**Idiomatic composition example** (from the verified `Sec` preview — a
sidebar section label, styled purely via tokens, no children required beyond
text):

```tsx
import { Sec } from 'mergen-scope';

<div style={{ display: 'grid', gap: '10px' }}>
  <Sec first>Trace Data</Sec>
  <div style={{ color: 'var(--text)', fontSize: 'var(--font-label)' }}>
    Section content goes here.
  </div>
  <Sec>Markers</Sec>
</div>
```
