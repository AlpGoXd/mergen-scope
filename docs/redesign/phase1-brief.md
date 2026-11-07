# Phase 1 brief

Start: c030a5a8706ad602d5933d8d7804810cc75ee442. Owner: Terra. No commits, deployment, dependencies, layout redesign or dist edits. Fonts supplied separately after root approval.

Allowed: src/index.css, src/hooks/use-theme.ts, src/stores/ui-store.tsx, src/types/theme.ts, src/types/workspace.ts only if necessary without wire changes, src/hooks/use-workspace.ts, minimal src/App.tsx, src/components/layout/TopBar.tsx, src/components/chart/SmithGrid.tsx and src/components/analysis/spectrum/IP3Card.tsx; focused theme/workspace tests and theme preference helper; task artifacts. ChartPane, Sidebar, ToolbarStrip, package files and landing page excluded.

Verify typecheck, unit, e2e, build, static and loaded light/dark screenshots; compare baseline. Maintain v4 snapshot shape and legacy reading.

## 3 · Shared rules (check every diff against these)

**Look**
- Buttons have five roles. **Neutral** = an action (Peak, Fit). **Tinted chip** in a group hue = on/off. **Slate** = the selected option in a choice, and also "armed". **Solid** = the one confirm button in a dialog (max one per view, Enter triggers it, flat), plus solid danger for destructive confirms. **Secondary** (accent tint) = at most one action next to a solid button. Danger colour only for destructive actions and messages, never on chips or toggles.
- Sizes: control 24, control-sm 20 (only in 28 px headers, chips and the strip, always ≥ 4 px apart), rows 26, bars 32, footer 24.
- Lines: grid dashed `3 3` in `--border-strong` plus a solid 0 line; reference lines neutral (`--text-muted`), 1 px, dashed `6 4`; traces always solid (sources 1.5 px, created 2 px). No other dashes on screen.
- Colour: OKLCH tokens only. **No hex colours in components.** No coloured side stripes on cards (the target pane's 3 px edge is the only edge marker, and it marks a state).
- Fonts: IBM Plex Sans (ss02) for words, JetBrains Mono (tabular) for numbers. Line icons, 16 px, stroke 1.75. **No emoji anywhere** (today: the 🔒 on locked lines).

**Behaviour**
- **Target pane:** new things go to the target pane (markers, opened files, + Pane, matrix clicks, Fit, Layout). Clicking a pane makes it the target. It shows a 3 px Pane-hue left edge and a tinted header.
- **Armed** (a tool waiting for your click): the button looks pressed in Slate with a short hint after it, the footer says the same sentence, the chart shows a dashed ghost of what will be placed. Esc cancels. Nothing in the strip moves or jumps.
- **Can't do it:** greyed with the reason in a tooltip, never hidden. A drop that can't work says why on the pane before you release.
- **Undo first, confirm rarely:** if it can be undone, do it and show a toast with Undo. Ask first only when work the user made would be lost (a file with markers, a pane with traces, replacing a workspace).
- **Toasts:** bottom centre above the footer, 5 s, paused on hover; errors stay until dismissed; one toast per action, counting what happened ("Opened 3 files · 5 traces in Pane 1 · Undo"). Toasts are dark.
- **Messages** (inline: a refused drop, wizard errors, settings notes, hints): a neutral bar with a thin 1 px border in the status colour and a coloured status icon. Status colours never fill a bar (they would look like tool zones). Exception: an unreadable file's row in the file list keeps its Danger tint.
- **Motion:** menus and panels 120 ms, toasts 150 ms slide-in, charts never animate (Recharts animation off), everything off under `prefers-reduced-motion`.
- **Words:** Open · Save (a workspace) · Export… · Remove (in lists) · "Add N traces" (wizard) · Replace file… · Edit columns…. One action, one name. "Import" disappears from the UI.

**One home per action**
- Markers and lines are created from the tool strip (and N, Shift+N, right-click). The left panel lists, edits and removes them; it never creates them.
- Opening files: top bar **Open…**, Files header **Open…** and dropping a file are the same action.
- Export: the pane ⋯ menu (one pane, quick paths) and top bar **Export…** (all panes). Save is separate.
- Settings: pane sliders popover = how this one chart is drawn (saved in the workspace). Footer gear = the whole app for this user (saved in this browser). No setting lives in both.
- Analysis (Math, Measure) in the right panel; views of a network (dB … Group delay) in the matrix; Smith is only a pane type; the full list of line crossings is a Threshold crossings Measure.
- One list of keys, shown in the footer "?" sheet and in Settings › Keyboard shortcuts.

**Privacy**
- No cookies. `localStorage` only for preferences (App settings, collapsed sections, dialog choices). Fonts bundled with the app. No network requests except the demo files from the same site. Files are read in the browser and never uploaded. The footer's "Local only" badge promises exactly this, so it must stay true. The Feedback button only opens a GitHub link in a new tab; it sends nothing by itself.

## 4 · Design tokens (Phase 1 puts these in `src/index.css`)

Every colour is `oklch(L C H)`. Neutral hue and chroma are two variables (a neutral switcher may come later).

**Neutrals (Slate, h 255)**

| Token | Light | Dark |
|---|---|---|
| `--bg` | 0.985 0.006 | 0.17 0.016 |
| `--panel` | 0.965 0.010 | 0.20 0.016 |
| `--raised` | 0.997 0.003 | 0.24 0.016 |
| `--border` | 0.90 0.010 | 0.31 0.016 |
| `--border-strong` | 0.78 0.010 | 0.42 0.016 |
| `--text-muted` | 0.50 0.010 | 0.72 0.016 |
| `--text` | 0.22 0.015 | 0.93 0.010 |

- Accent (links, focus ring, selection): light `0.50 0.14 255`, dark `0.78 0.113 255`.
- Slate "selected / armed": light fill `0.92 0.03 255`, ink `0.32 0.06 255`, line `0.80 0.045 255`; dark fill `0.34 0.045 255`, ink `0.93 0.03 255`, line `0.50 0.06 255`.
- Solid: light `0.50 0.14 255` with white text (hover L 0.45); dark `0.78 0.12 255` with near-black text. Solid danger: light `0.52 0.17 25`, dark `0.72 0.15 25`.
- Secondary: light fill `0.95 0.03 255`, line `0.80 0.06 255`, ink `0.45 0.13 255`; dark fill `0.30 0.05 255`, line `0.45 0.08 255`, ink `0.88 0.07 255`.

**UI hues (tinted chip v2).** Marker 20 · Lines 80 · Search 140 · Export 160 · Pane 200 · Left 230 · Analysis 310 · Data 350 · Danger 25. (35° and 285° are retired.) For hue h: light fill `0.95 0.03 h`, line `0.86 0.05 h`, ink `0.45 0.12 h`; dark fill `0.33 0.07 h`, line `0.50 0.10 h`, ink `0.90 0.09 h`. Group background tint: light `0.975 0.01 h`, dark `0.24 0.02 h`. Clamp chroma to sRGB per hue (some hues get less).

**Status (messages only):** danger 25 · warning 85 · success 150 · info 245, using the same fill / line / ink recipe for icons and borders (see the Messages rule: no fills).

**Trace colours**
- Sources: hues `0° + 45°·n`, light L 0.58 with chroma up to 0.16 within gamut, dark L 0.75.
- Assignment order: 270, 0, 90, 180, 315, 45, 135, 225. Colour-blind mode (App settings): 270, 135, 0, 315, 180, 225, 45, 90.
- Created traces: light L 0.36 with chroma up to 0.10 (as much as sRGB allows), dark L 0.88 / C 0.045. They take family slots: parent ±22.5°, then ±67.5°; a two-trace op takes the free slot nearest the A–B midpoint.
- Marker and axis tags: light fill = trace hue at L 0.50 (chroma clamped) with white text; dark = the trace colour with dark text.

**Type:** title 14/600 · body 12/400 · label 12/700 · readout 11/400 mono. IBM Plex Sans 400/600/700 with `font-feature-settings: "ss02"`; JetBrains Mono 400 tabular. Comfortable density: +1 px on every size.

**Space and shape:** spacing 4 · 8 · 12 · 16 · 24. Compact (default): control 24, row 26, gap 4, panel padding 8, input 22, control-sm 20. Comfortable: control 28, row 30, gap 6, padding 12, input 24. Radius: control 6, card 8, input 5, badge 4. Borders 1 px. Elevation: none, except popovers and menus. Focus: 2 px accent outline, 2 px offset. Disabled: 45 % opacity, no hover, `not-allowed` cursor, tooltip with the reason. Invalid input: Danger tint.

**Layout:** top row 32, tool strip rows 32 each (wraps, never scrolls), pane header 28, footer 24, left panel 280 (drag 220–420), right panel 320 (drag 260–560), pane min height 160, minimum window 1024 × 640. Below 1280 px wide the side panels slide over the panes instead of pushing them.

**Chart:** crosshair 1 px accent at 60 %; zoom box accent 8 % fill with a 50 % outline; readout card raised, strong border, the only shadow on the chart.

**Numbers:** engineering prefixes chosen from the visible span ("500 MHz/div", never "0.5G/div"); decimals follow the zoom step, no trailing ".0"; real minus (U+2212); a space before the unit; long frequencies grouped in threes ("1.420 350 GHz"). Inputs accept "1.42035 GHz", "1420.35M", "1.42035e9", "-12.4" and reformat on Enter. One `formatEng(value, unit, step)` in `domain/units.ts`.

Remove the glass theme. Themes: Light and Dark, default follows the OS, manual override in Settings.


**Phase 1 · Tokens and base styles** (terra, or luna): all tokens of section 4 as CSS variables for light and dark in `src/index.css`; remove the glass theme; type scale; focus ring; reduced motion; Recharts animation off. Fonts: see section 9 (ask the user first). Fixes 01 (styles part), 03, 05 (colour part), 07, 11. No layout changes yet.

