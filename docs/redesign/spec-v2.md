# Mergen Scope redesign: orchestrator prompt

> Paste this into Claude Code (Claude Opus 5.5) at the root of the `mergen-scope` repo, branch `ts_refactor`.
> Draft v2 · 7 Nov 2026 · source: the Claude Design canvas "Mergen Scope Design Review" (boards Tokens, Details, Colours, C01–C06, P1–P7, S1, R1, R8, T1, F1, L1, D1, H1, X1, A1).
> Not in scope yet: the landing page (`index.html`) and the logo.

---

## 0 · Your role

You are the **orchestrator**. You plan, write task briefs, review, integrate and verify. **Codex is the coding agent**: it writes the code, phase by phase, from the briefs you give it. You stay accountable for everything it produces.

- Follow `CLAUDE.md` (it already describes how to call Codex: the companion script, models, worktrees, one writer per file). Where it says "Codex is not the tool for visual taste": the user has now chosen Codex as the coding agent for this redesign. That works because every visual decision is already made and written down below; Codex implements the spec, and **you** judge the visual result in the real app.
- Models (the user's choice, overrides the model notes in `CLAUDE.md`): **`gpt-6.1-terra` is the default for almost everything**, including all stores, ChartPane, the Smith renderer, export, migration and reviews. `gpt-6-luna` is fine for small, well-bounded tasks (simple components, writing tests). `gpt-6-sol` may also be used, for example if terra is unavailable or as a second opinion. Always pass `--model` explicitly and report which model actually ran.
- Every write-capable Codex run goes in its own git worktree (`git worktree add ../mergen-scope-codex-<task> -b codex/<task>`), passed with `--cwd`. Never two writers on the same file.
- Treat Codex output as a proposal. Read the diff, reject what doesn't match this spec, merge the rest locally, then run the checks yourself. "Codex says tests pass" is not verification.
- **Never `git push`.** Commit only when the user asks. At the end of each phase, stop, report, and ask the user whether to commit.
- Never read, print or commit `.env*`, `~/.codex/auth.json` or any token, and never put secrets into a Codex prompt.
- Ask the user before adding any dependency (see section 9 for the two known cases).

## 1 · How to work, every phase

1. Read the phase below and the files it names. Read `README.md` → Architecture once at the start.
2. Write a **Codex brief** using the template in section 8: goal, files, the exact spec excerpt from this prompt, constraints from `CLAUDE.md`, what not to touch, and the commands to run.
3. Split a phase into several Codex tasks when the parts touch different files (for example domain logic vs. its component); run them in parallel worktrees.
4. Review the diff against the spec and the shared rules (section 3). Ask for a fix or fix small things yourself.
5. Verify: `npm run typecheck` and `npm run test:unit` always; `npm run test:e2e` for anything UI, chart or interaction; `npm run build && npm run test:static` for build or asset changes. Run the app (`npm run dev`, port 5173) and take Playwright screenshots in light and dark of what changed; compare them with the spec.
6. For non-trivial diffs (ChartPane, parsers, migration, analysis maths, the Smith renderer) get an independent `review` or `adversarial-review` from Codex with `gpt-6.1-terra` before calling the phase done.
7. Report to the user: what changed, which model did what, what you rejected, check results with output, screenshots, open questions. Then ask about committing.

`src/components/chart/ChartPane.tsx` is fragile: small reversible steps, tests first, `test:e2e` after every change there.

## 2 · Context

- Stack: React 19, TypeScript strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vite 7 single-file build, Recharts for Cartesian charts. No linter; `typecheck` is the static gate.
- Layout: `src/domain/` pure logic (no React), `src/types/` contracts, `src/stores/` context + reducer stores composed in `StoreRoot.tsx`, `src/hooks/`, `src/components/` UI only. Imports are relative.
- `app.html` is the app; `index.html` is the landing page (out of scope). Never hand-edit `dist/`; don't stage it unless asked.
- Workspace snapshots are versioned (v4). Any change to the saved shape needs a migration (`workspace-migrate-*.ts`) and a test in `tests/unit/workspace.test.ts`.

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

## 5 · The screen, part by part

### 5.1 Top bar and tool strip (T1)
- **Row 1 (32 px):** wordmark "Mergen **Scope**" (plain text colour, "Scope" in accent; never a trace colour) · **Left** chip (Left hue 230, toggles the left panel) | **Open · Save · Export…** (neutral, icons + words; icon-only below 1280 px with the shortcut in the tooltip) | **Markers · Search · Lines · Pane** chips (each toggles its strip group; tinted chip in the group hue when on) ……… **Analysis** chip on the right (hue 310, toggles the right panel).
- **Tool strip:** shows only the groups that are on, in the same order, as colour zones (faint group tint, group name in its ink colour, then its controls at control-sm). When the open groups don't fit one row, a whole group moves to a second row; a group is never split. With no group on, the strip disappears.
  - **Markers:** `Trace: Auto ▾` (Auto = the trace nearest the click) · split button **+ New ▾**. The main part places a normal marker (N). The arrow menu: "+ Δ from M1", "+ Δ from M2", "+ Δ from selected" (Shift+N). Right-click a marker on the chart or in the list → "Add Δ from M1", "Move to peak", "Delete". **There is no Normal / Delta mode any more.**
  - **Search:** Peak · Next peak · Min · Next min (neutral actions; they move the selected marker, or place one if none) · `Dir L → R` (a dashed setting toggle for which way Next walks).
  - **Lines:** V line · H line · Link (locks the selected line across panes). No ΔX / ΔY line pairs (delta markers do that).
  - **Pane:** `Layout: Rows ▾` (opens numbered previews of the presets that fit the current count; others greyed with the reason) · + Pane · Fit all. Panes can also be dragged by their header onto another pane's edge.
- Armed state as in section 3 (AR-1): e.g. "+ New" pressed in Slate, then "click a trace to place D2 (Δ from M1)…" after it.
- No command palette / Ctrl+K "Actions" box (removed for now).

### 5.2 Footer (F1, 24 px, always visible, also with no file open)
Left to right: the **state sentence** ("Click: select · drag: move"; when armed, the armed sentence in the Slate look) · Target **Pane 1** · Trace **S21 · lna_board_rev3** (16-character short name) · X / Y of the mouse in axis units (mono; on a Smith pane Z and Γ) ……… 3–4 **mouse hints** that change with the pane type and the armed state ("Right-drag X zoom · Scroll Y scale · Ctrl+drag pan · Double-click fit") · **Local only** (shield icon; tooltip "Your files are read in this browser; nothing is uploaded") · **Feedback** (speech-bubble icon + word, quiet) · **Settings** (gear, neutral) · **?**.

**Feedback menu** (opens above the button): "Report a problem ↗" and "Suggest an idea ↗". Each opens `https://github.com/AlpGoXd/mergen-scope/issues/new` in a new tab with a pre-filled `title` and `body` (a short template: what happened / what you expected, or the idea; plus app version, browser and OS from `navigator.userAgent`). Never include file names, data or anything from the workspace. Footer note in the menu: "Needs a GitHub account. Adds the app version, browser and OS; never your files." GitHub only, no email. The app itself sends nothing (privacy rule): it only opens a link. The same two links appear in the "?" sheet footer and in Settings › About.
Small windows: hints hide first, then "Local only", "Feedback" and "Settings" become icons, then the trace name.

**"?" sheet** (opens above the button, or Shift+/; same list in Settings › Keyboard shortcuts):
- Mouse: right-drag X range zoom · scroll Y scale (Smith: zoom both) · Shift+scroll Y offset · Ctrl+scroll X zoom around the cursor · Ctrl+drag or middle-drag pan (X moves the linked group, Y only this pane) · double-click fit all · click a marker tag to select · right-click a marker for its menu.
- Keyboard: Ctrl+O open · Ctrl+S save workspace · Ctrl+Shift+E export… · Ctrl+Shift+C copy target pane as image · Ctrl+Shift+S download target pane as image · Ctrl+, settings · N new marker · Shift+N Δ from the selected marker · M / S / L / P toggle the four groups · [ / ] left / right panel · Space or F fit all · Backspace previous zoom · Esc cancel / close · Delete remove the selected marker or line · ← / → move the selected marker one point · Ctrl+Z undo · Ctrl+Y and Ctrl+Shift+Z redo.
- Footer line: "Mergen Scope · version · About · Feedback on GitHub ↗ · Your files never leave this browser."

### 5.3 Left panel (L1 + C01–C05)
- Four sections in this order: **Files → Traces → Markers → Lines**. One scroll for the whole panel; the header of the section you're in sticks to the top. Section header (26 px): ▾ name, count, ⋯ menu with the "all" actions (Files: Close all files… with Undo · Traces: Show all / Hide all · Markers: Remove all · Lines: Remove all). Click the header to collapse; remembered as a preference. Only Files has a button: **Open…**. An empty section shows one muted line saying where its items come from.
- No file open: the panel is one drop zone ("Drop files here", formats, Open… and Load demo, "Files are read in this browser; nothing is uploaded").
- **File row (C03):** 26 px; format badge (mono, neutral, 30 px) · name (shortened in the middle, full name and summary on hover) · for network files a **Matrix** toggle (▾ closed neutral, ▴ open in Slate; open state remembered per file, also in workspaces) · ⋯ · ×. Multi-column CSV: **Columns ▾** with a checklist. A single-trace file whose trace was deleted: dashed border and a **Plot** button. ⋯ menu: Info · Replace file… · Edit columns… (CSV only) · Rename · Show all / Hide all (multi-trace files) · Remove file… (danger text). Removing asks first only if the file made more than one trace or has markers. Parsing: 2 px accent bar along the bottom plus a percentage. Error: Danger tint, reason in the tooltip, "Fix…" opens the wizard or Replace file….
- **Matrix (C04):** under the file row. Family `S · Y · Z · ABCD` (ABCD only for 2-port files, otherwise greyed "2-port only"). **Plot as** for S: `dB · Mag · Phase · Re · Im`; Y, Z, ABCD have no dB (Mag default); **More ▾** holds VSWR, Return loss (both Sii only, greyed on Sij) and Group delay. **No Smith in Plot as** (Smith is a pane type). ≤ 8 ports: a labelled grid of tinted cells (label size follows the cell width, 12 → 9 px); > 8 ports: a list picker (row, column, + Plot; plotted parameters as removable chips; indices ≥ 10 written "S12,3") with "Grid…" opening the full grid in a popover. Quick picks for 3+ ports: All Sii · All Sij · Lower ◣ · Clear (danger ink). The grid shows one view at a time: a cell is filled when that parameter is plotted **in the target pane in this view**; a corner dot means it is shown elsewhere or in another view. Clicking adds it to the target pane, or removes it if it is already there. Tooltip says what a click will do ("S11 · dB is in Pane 1. Click to add it to Pane 2 (target)"). Keyboard: arrows move, Enter/Space toggles, `aria-pressed`.
- **Info (C05):** opens under the file row (with the Matrix if both open, Matrix first). Header "Info" with **Table / Raw** switch and Copy. Table: the fields exactly as parsed, no grouping, values formatted with the number rules. Raw: the header text as in the file. Copy puts "key: value" lines on the clipboard. No metadata: "No header fields in this file".
- **Trace row (C02):** a tiny title row (10 px, muted) "Name · Interp · Pane". Row: checkbox (show/hide) · swatch (hollow when hidden) · name (= the file name, shortened in the middle; double-click to rename) · interpolation chip (`Auto · Exact · Lin · Near · Prev · Next · Cub`, opens a menu with one-line explanations and "Apply to all traces from this file") · **pane badges** (P1, P2 …; click opens a "Show in" checklist of panes; same-unit panes only, others greyed with the reason) · ×. Second line (subtle) only when needed: "S21 · dB" for network traces, the column name for CSV. Created traces nest under their parent with └ and ƒ; their name is the operation ("smoothed · SG 7", "A − B"). Selected: 1.5 px border in the trace colour. Hover shows a drag handle; hidden traces grey out and hide their markers.
- **Marker item (C01):** 28 px line 1: label chip (normal = filled in the trace colour; delta = outlined, with a light tint of its trace hue) · editable X input (mono) · Y value · ×. Line 2: trace name (file · parameter; file shortens first), pane badge(s), "● snap" or "≈ interp". Deltas stay in creation order (no nesting); line 2 says "from **M1 ▾** · at 2.449 00 GHz" (the chip changes the reference; nothing moves). Hovering a delta highlights its reference row and the reverse. If the reference is deleted, the delta becomes a normal marker at its absolute position.
- **Line row (new):** like a marker item: dashed neutral label (V1, H1) · editable value · link icon (accent when linked) · ×. Line 2: one summary, never a list: "P1 + P2 (linked, Hz) · 4 crossings" plus **List…**, which adds a Threshold crossings card in Analysis. Only V lines can be linked (only X is ever linked); a linked V line shows in every pane of its X-unit group. H lines: link icon greyed with the reason.
- Links between lists: selecting a marker selects its trace row and pane; hiding a trace greys its markers; deleting a trace removes its markers after a confirm with Undo.

### 5.4 Panes
- **Pane header (P3, 28 px):** name (Pane 1; double-click to rename) · trace count (hover lists them) · link chip with the X group (Hz, s; click to unlink, then neutral with a crossed link) · div readout ("100 MHz/div · 10 dB/div", mono, muted) · **Fit ▾** (click = fit all; arrow: Fit X, Fit Y, Previous zoom ⌫) · sliders button (settings popover; Slate while open) · ⋯ (Rename, Duplicate pane, Add pane below; Copy as image, Download image, Copy as LaTeX (TikZ), Export…, Export data (CSV)…; Remove pane… in danger text). Target pane: tinted header + 3 px Pane-hue left edge; others neutral.
- **Settings popover (P3, S-A):** one card, everything visible, "Pane 1 · settings for this pane only". Type `Chart · Smith · Table` · X link · Grid (style Dashed / Dotted / Long / Solid / Off, opacity, thickness) · 0 line · Show chips (Markers, Marker tags, Ref lines, Line tags, Sample dots, Readout names) · Reset · Apply to all panes. Changes apply instantly (no OK). Hide "Minor grid" until it works. A new pane copies the target pane's settings. Apply to all is instant with an Undo toast.
- **Zoom and pan:** as in the "?" sheet. Cartesian: right-drag X range, scroll Y scale, Shift+scroll Y offset, Ctrl+scroll X zoom around the cursor, Ctrl+left-drag or middle-drag pan, double-click / Space / F / Fit = fit all, Backspace previous zoom.
- **Chart canvas (P1):** grid and 0 line as in section 3; ticks JetBrains Mono 11 px muted; precision follows the zoom step; unit written once (Y unit above the Y ticks, X unit at the end of the X axis); no axis titles unless a pane holds traces with different units (then Y titles appear). Selected trace +0.5 px. **Cursor card (K-B2):** follows the cursor, flips to the left near the right edge; one row per visible trace (swatch, value, unit, short name) in the same order as the dots; the X value as a tag on the X axis. **Short names (16 characters):** 1 a renamed file wins; 2 drop the extension; 3 drop the start all traces share (only at `_ - .` or space, keep ≥ 4 characters, show a leading "…"); 4 network traces keep their parameter ("amplifier…sweep · S21"), created traces show their operation ("ƒ smoothed"); 5 still too long: cut the middle, keep whole words from both ends.
- **Markers and lines on the chart (P2, M-D):** glyph 10 px in the trace colour with a 1.5 px halo in the chart background (● normal, ▲ peak, ◆ delta). Tags (mono 11): filled for normal, outlined for delta; 4 px above the glyph, flipping below near the top edge; if two tags would overlap the later moves a row. Unselected markers show only their name; the selected marker adds its Y to the tag, gets a solid 2 px ring, and its X becomes a tag on the X axis with one dotted guide. A selected delta shows its Δ ("D3 Δ −37.9 dB", axis "Δ −100.0 kHz") and a dashed L bracket from its reference. Reference lines: tags inside the plot (V along the top, H at the right edge); hollow dots in the trace colour where a line crosses a trace. Selection is shared with the marker list.
- **Linking (P4, L-A):** panes link X automatically by X unit (all Hz panes zoom together; a time pane is its own group). Only X is ever linked; Y stays per pane. In Rows layout only the bottom pane of a linked stack shows X tick labels. A Smith pane linked to a Hz group shows the visible band in full colour and the rest of its trace faint; Smith zoom/pan never changes other panes; hovering a Smith trace shows a ghost crosshair in the linked Hz panes and the reverse.
- **Smith pane (P5):** own SVG renderer (`SmithChart.tsx`, no library); Recharts stays for Cartesian.
  - Grid: resistance circles 0.2 / 0.5 / 1 / 2 / 5 and reactance arcs ±j0.2…±j5 in `--border`, outer circle and real axis in `--border-strong`. Labels mono 10 muted with a background halo, never rotated: resistance values on the real axis at the left edge of each circle; reactance outside the rim, +j top, −j bottom; 0 and ∞ at the axis ends. Zooming adds lines (0.1, 0.3, 0.7, 1.5, 3) to keep them 40–80 px apart; labels follow to where an arc leaves the view; if two labels overlap the smaller value goes first. Normalised by default ("+j0.5"), Ω optional (× Z0).
  - Grid setting `Z · Y · Z+Y`: Y = the same grid rotated 180°; the trace and markers never move (the point is Γ). Z+Y: Z solid, Y dashed and lighter.
  - Accepts reflection parameters only (Sii of any network file, also Z11 / Y11 converted with the file's Z0). Dragging a transmission parameter or a non-complex trace over a Smith pane dims it with the reason; releasing does nothing. |Γ| > 1 is shown: the view grows, the area outside the unit circle gets a light Warning tint and a dashed edge.
  - Direction (D-A, default): hollow dot at the start, filled dot at the end, each with its frequency, chevrons every 1/5 of the on-screen length toward higher frequency. Settings: Chevrons · Ends · Off.
  - Markers store a frequency, like Cartesian markers; clicking takes the nearest sample in screen pixels. **Readout strip** (30 px at the bottom of the pane): swatch, name, short trace name, then per the Readout setting `Z · Y · |Γ|∠ · VSWR / RL` (defaults follow the grid), plus the equivalent L or C; `‹ 2 / 3 ›` steps through the pane's markers (also Tab / Shift+Tab). Fields drop from the right in a narrow pane. A delta shows Δf and ΔRL plus its own Z. Hover: nearest point with the cursor card (f, Z, |Γ|) and the r-circle and x-arc through it lit in accent.
  - Zoom: scroll zooms both axes around the cursor; Ctrl+drag / middle-drag pans; Space or double-click fits. One transform on the SVG group; strokes use `vector-effect: non-scaling-stroke`. Settings: the Grid section of the popover is replaced by Smith (Grid, Labels, Direction, Readout); "Apply to all Smith panes".
- **Table pane (R8):** a pane type that lists the traces of its pane as columns (X, then each trace with its unit), following the cursor: the row nearest the cursor is highlighted in Slate.
- **Layouts (P6):** presets Rows (default) · Columns · 2 × 2 (exactly 4 panes) · 1 + side (main pane plus a stack on the right). Presets that don't fit the count are shown greyed with the reason. Resize by dragging the 8 px gap (divider turns accent, a tag shows "64 % · 36 %", other panes dim slightly; min 160 × 120; double-click = equal sizes; sizes remembered per layout). Drag a pane by its header onto another: "⇄ Swap with Pane 3". Names follow position (P1 is top-left) and P# badges update after a swap. Overlays fade in 120 ms; panes never animate their size.
- **Pane count:** 1–4 by default from one setting (`MAX_PANES`); nothing may assume 4. **Experimental:** App settings › Experimental › "Allow more than 4 panes (up to 8)", off by default, marked "not recommended". Above 4 panes only Rows and Columns are offered.
- **Drops on panes (P6 + D1):** dragging a trace row onto a pane **moves** it ("Move to Pane 2"); the source says "Already in Pane 1"; a pane of another X unit, or a Smith pane for a non-Sii trace, dims with a Warning message and the reason; a "+ New pane" strip appears under the panes while there are fewer than `MAX_PANES`. An empty pane: "Drop traces here", the first trace sets its unit.
- **One trace in several panes (T-B):** a trace can be shown in up to one copy per pane (so up to the pane count). Same colour, same markers (a marker belongs to the trace and shows in every pane the trace is in). Added from the matrix (to the target pane) or from the trace row's "Show in" checklist. The × on a pane badge removes it from that pane only; the row × deletes the trace.
- **Removing a pane (P6, planPaneRemoval):** one pure function `planPaneRemoval(panes, traces, removedPaneIds) → { moves, unplaced }`, used by remove pane, the layout change and the type switch, with unit tests for every case. A trace is **never** moved into a pane of another X type. A trace that is still in another pane just loses this pane. Empty pane: removed, no dialog. All traces fit another pane: they move to the nearest pane of the same X type (above first, then below), toast "2 traces moved to Pane 1 · Undo". Some don't fit: a dialog lists each trace and where it goes; the rest stay in the trace list **without a pane** (dashed row, "—" badge, "not in a pane, drag onto one"), markers kept but hidden. Nothing is deleted.

### 5.5 Right panel: Analysis (R1, R8)
- Holds only Analysis, closed by default. Adding an analysis or clicking the Analysis chip opens it; removing the last analysis or clicking the chip closes it. Header: "Analysis" (hue 310) · count · **+ Add analysis**.
- **Add analysis menu (A-1):** search box, Recent, then everything A–Z; the kind as the icon on each row (ƒ = Math, ruler = Measure); filter chips All · Math · Measure. Items that can't run on the target trace are greyed with the reason; open ones show ✓. Views (VSWR, return loss, group delay, phase) are not here; they are in the matrix.
- **Cards (AC-3):** a neutral card (1 px border, radius 6) with a **26 px header band in the faint Analysis tint**: kind icon · title · short source · ⋯ · ×. Body: source line (trace · file · pane), the generated settings form, results (big value in mono). No coloured left stripe. Measure cards: results, eye (show on chart), ⋯ = Create trace (if it has a curve), Copy results, Remove. Math cards: inputs, operation, the output trace ("→ smoothed · SG 7 · P1 · live") with **Freeze**. Cards collapse to one row with a summary and can be dragged to reorder.
- What a Measure draws on the chart uses the target trace's colour; a Math result is a normal derived trace (listed under its parent with ƒ, family colour, placed by the pane rules; a new X unit means a new pane).
- **Architecture (R5):** three registries: data kinds, pane types, analysis tools. Each analysis is one module + one registry line with this contract: `kind` (math · measure · view) · `meta` (id, title, one-line description) · `appliesTo(trace)` (ok, or the reason) · `params` (a small schema the form is generated from) · `compute(inputs, params)` (pure, unit-tested, may run in a worker) · `outputs` (numbers · table · overlay · trace). Replace today's switch of hand-written cards and their pastel hex colours with this. Existing tools to port: noise PSD, IP3 / TOI, occupied bandwidth, channel power (gated to density units), peak table, range statistics, 3 dB / 10 dB bandwidth, threshold crossings, ripple / flatness, reciprocity / isolation, 2-port stability (K, mu1, mu2, |delta|), smoothing, A ± B / × / ÷, offset · scale. VSWR, return loss and group delay become views in the matrix.

### 5.6 Opening files (D1)
- Every way in follows one path: drop on a pane · drop elsewhere · Open… (top bar or Files header) · the empty app.
- What is it? A saved workspace → if something is open, ask "Open workspace '…'? It replaces the N open files, their traces, markers and panes. You have unsaved changes." [Cancel] [Save first] (Secondary) [Replace] (solid). Data files dropped together with a workspace are added after it. No merging of workspaces.
- Data file: if the layout is recognised by content with high confidence (R&S header, valid Touchstone option line), read it directly; otherwise the column wizard (C06).
- **Which traces appear:** single trace (.dat, one-column CSV) → its trace · .s1p → S11 dB · .s2p → S21 and S11 dB · 3 ports or more → nothing plotted, the Matrix opens with "Choose what to plot" · CSV → what the wizard marked as Y, or all numeric columns up to 8 when recognised without the wizard.
- **Where they go:** dropped on a pane → that pane; if its X unit doesn't fit, the drop is refused before release with the reason and where it can go. Opened any other way → the target pane if the unit fits, else the first pane with that unit, else a new pane (if under `MAX_PANES`), else the trace list "not in a pane" with the reason in the toast.
- Same file name already open → dialog "lna_board_rev3.s2p is already open. Replace it with the new copy? Traces keep their colour, panes and markers where the parameter still exists." [Cancel] [Open as a second copy] (Secondary, the copy gets " (2)") [Replace] (solid).
- Unsupported file → refused on the drop with a Danger message ("Can't open report.pdf · Mergen Scope opens .sNp, .dat, .csv, .txt and saved workspaces").
- Drop feedback is local: only the pane under the cursor (or a slim banner over the panes) lights up. Remove today's full-window dark overlay.
- After: one toast for the whole drop with Undo; files that fail stay in the list with their error row and are counted ("2 opened · 1 couldn't be read").

### 5.7 Column wizard (C06, W-A)
One screen: settings on the left (delimiter `, ; Tab`, skip rows, domain Frequency / Time with "Detected: … (confidence)", units for X and Y as menus, not ×1000 multipliers), live preview on the right with a role chip (X · Y · —) in every column header. "Will create 2 traces: … · CH1 (V), · CH2 (V)". Several files: "File 1 of 3", "Use these settings for the other 2 files", Skip file. Buttons: Cancel · **Add N traces** (solid). Errors (no numeric column, no X) disable the confirm with the reason as a message. **Edit columns…** opens the same wizard pre-filled with the file's real previous settings (fixes bug 13) and says what will happen to existing traces ("CH2 is no longer a Y column: its trace and 1 marker will be removed").

### 5.8 Export (P7)
- Two quick paths, no dialog: **Copy as image** (Ctrl+Shift+C, clipboard) and **Download image** (Ctrl+Shift+S), both with the last-used options; the toast offers "Options…".
- **Export dialog** (pane ⋯ → Export…, or top bar Export… with What = All panes): What (This pane · All panes · Pick…) · Format (PNG · SVG · PDF · TikZ · CSV) · Size (Screen · Slide · Paper 1-col · Paper 2-col · Custom px with 1× / 2× / 3×) · Theme (Print white · Dark · As app; default from App settings) · Include (Title, Legend, Marker tags, Marker table, Ref lines, Date) · Title · Legend (Below (default) · Inside · Off) · Names (Full · Short 16) · file name pattern `{file}_{pane}_{date}`. Live preview. Buttons: Cancel · Copy (neutral) · **Save …** (solid). Remembers choices per format.
- The image is rendered again at the target size from the same SVG renderer (sharp at any size), never a screenshot. Never in the image: crosshair, selection rings, cursor card, header buttons, link chip. "All panes" keeps the layout and proportions with one title and one legend.
- **Paper presets (IEEE):** 1 column 88.9 mm (3.5 in), 2 columns 181.9 mm (7.16 in); text 8 pt (9, 10 one click away), serif default (Sans option), lines 0.5 / 0.75 / 1 pt, in mm and pt at final size. Axis titles on, pre-filled from units ("Frequency (GHz)", "Magnitude (dB)"). Print-safe lines: each trace its own dash and marker symbol (solid ○, dashed □, dotted △) plus colour at L 0.50. Paper look: white background, black frame, light grey grid, no UI colours or tints, marker tags as plain labels with a leader line. PNG fallback at 600 dpi. PDF with embedded fonts and SVG as vectors.
- **TikZ / PGFPlots:** ready-to-paste figure (axes, grid, legend below, print-safe styles, marker pins, trace colours as named `\definecolor`s); options: wrap (figure + caption · tikzpicture only), width (`\columnwidth` · `\linewidth` · fixed), data (inline · .dat files zipped), points (all · 300 per trace), colours (trace · grayscale). "Copy as LaTeX" in the pane ⋯ menu.
- **CSV:** visible X range or full data, all traces in the pane or visible only, include markers. Replaces today's "Export Visible CSV".

### 5.9 App settings (S1)
Footer gear (or Ctrl+,) opens a side sheet over the right panel (120 ms); charts stay visible and update live; Esc or × closes. Title "App settings · all panes, saved in this browser". Sections: **Appearance** (Theme Light · Dark · System; Density Compact · Comfortable; Neutral colour Slate, more later) · **Colours** (Palette Standard · Colour-blind safe = the reordered wheel; Line styles Off · Traces 5–8 · All) · **Export** (export theme) · **Experimental** ("Allow more than 4 panes (up to 8)", off, not recommended) · Keyboard shortcuts › · About › (version, licence Apache-2.0, GitHub link, the two feedback links) · Reset all to defaults. Ends with a hint that grid, markers, lines and Smith options are per pane (sliders icon). Saved in `localStorage`, never in workspace files.

### 5.10 Empty app (E1, app only)
After opening the app with nothing loaded: top bar with all groups off and no strip; left panel drop zone; one empty target pane as a large drop zone ("Drop measurement files here", formats, Open… and Load the demo, "Files are read in this browser; nothing is uploaded"); right panel closed; footer "No file open" with Settings and "?" reachable.

## 6 · Code bugs to fix (found in `ts_refactor`)

| # | Bug | Where |
|---|---|---|
| 01 | `.btn-active` puts `--bg` text on L 0.62 group colours (3.5:1). Replaced by tinted chips. | `src/index.css` · ToolbarStrip · Btn.tsx |
| 02 | Dead View button: `showViewTools` is set but never read. Remove View; Dots becomes per-pane "Sample dots" (workspace migration). | TopBar.tsx · ui-store |
| 03 | White leaks in dark: `color-mix(…, white)` in pane headers, pane body and TopBar groupStyle; hover crosshair mixes accent with white. | ChartPane.tsx ~1003–1006, 1128 · TopBar.tsx |
| 04 | Workbench order ≠ strip order. | TopBar.tsx · ToolbarStrip.tsx |
| 05 | Hard-coded colours: Left #6f8fd6, Right #d78a73, Dir #e8579c (always active), right-panel tabs #e48f77 #c786ec #71c59a #ee6faa, ref lines #d48a2b / #2b9ab7, marker outline #222 + white. | TopBar · ToolbarStrip · RightPanelStack · ChartPane |
| 06 | Readout format "500.0M/div", "10.00/div", ticks "0.500G". One `formatEng(value, unit, step)`. | ChartPane.tsx 129–162 · domain/units.ts |
| 07 | `--dim` used for text (2.1–2.9:1). Use `--text-muted`. | index.css · FooterBar |
| 08 | Wordmark uses `--tr0`; Compact is a solid accent button. | TopBar · Sidebar |
| 09 | Clear All has no confirm and no undo (becomes "Close all files…" with Undo). | TopBar |
| 10 | `StatusBar.tsx` duplicates FooterBar and is unused. Delete. | StatusBar.tsx |
| 11 | `.btn` and strip selects use 11 / 13 px instead of the type scale. | index.css |
| 12 | Created traces drawn dashed (`strokeDasharray "5 3"`); colour logic duplicated. | ChartPane.tsx:1126 · Sidebar.tsx:155 · ChartPane.tsx:736 |
| 13 | `buildReimportConfig` hard-codes delimiter ",", skipRows 1, xCol 0, yCols [1] instead of the previous WizardConfig. | Sidebar.tsx |
| 14 | Removing the only time-domain pane pushes its traces into a frequency pane. `planPaneRemoval()` + nullable pane. | pane-store · pane-math.ts |
| 15 | `gridMinor` exists but isn't supported; hide it. | PaneSettingsPopover.tsx · types/pane.ts |
| 16 | `MAX_PANES = 4` used directly; layouts must read one setting. | domain/pane-math.ts |
| 17 | Locked ref lines use "🔒" in the label; use the link icon. | ChartPane.tsx ~1240 |
| 18 | FooterBar returns null with no file open, which also hides the Settings gear. | FooterBar.tsx |
| 19 | `mkrMode "delta"` and the "Marker / Normal" text come from the old mode switch. | marker-store · FooterBar · ToolbarStrip |
| 20 | `tracePaneMap` maps a trace to one pane; T-B needs trace → list of panes. | pane-store · pane-math.ts |
| 21 | Any drop covers the app with a dark overlay and queues every file in the wizard; no destination. | App.tsx `handleDrop` · ImportWizardModal |
| 22 | "Import" wording in buttons, the wizard and messages. | Sidebar · ImportWizardModal · TopBar |

Line numbers are from the first review; confirm them before editing.

## 7 · Phases

Each phase ends with the checks in section 1, screenshots, a report and the commit question. Do them in order; inside a phase, parallelise across files.

**Phase 0 · Baseline (you, no Codex):** run `typecheck`, `test:unit`, `test:e2e`, `build && test:static`; record failures that already exist so they aren't blamed on the redesign. Screenshot the current app (light/dark, demo file loaded) for comparison. Confirm the bug locations in section 6.

**Phase 1 · Tokens and base styles** (terra, or luna): all tokens of section 4 as CSS variables for light and dark in `src/index.css`; remove the glass theme; type scale; focus ring; reduced motion; Recharts animation off. Fonts: see section 9 (ask the user first). Fixes 01 (styles part), 03, 05 (colour part), 07, 11. No layout changes yet.

**Phase 2 · Shared pieces** (terra; luna for the simplest pieces): buttons in the five roles; tinted chip toggle; Slate segmented control; select; split button; menu and popover (one shadow, 120 ms fade); tooltip (also on disabled items, with the reason); toast system (rule in section 3, with Undo); message bar (SC-3); dialog (one solid + one Secondary); icon set (line icons, no emoji); `formatEng` and the input parser (06). Unit tests for `formatEng` and parsing.

**Phase 3 · Model and store changes** (terra, one task per store; you review each): `MAX_PANES` setting incl. the experimental 8 (16); trace → list of panes (20) with `planPaneRemoval` (14) and tests for every case in 5.4; markers belong to traces and show in all their panes; delta creation API without `mkrMode` (19); delta reference change; undo / redo stack for markers, lines, traces, panes and files; per-pane settings incl. Sample dots and pane type (02, 15); analysis registry contract (R5); open-files pipeline (D1) as pure domain logic with tests (defaults per file kind, destination rules, same-name handling, workspace detection). **Workspace migration** v4 → v5 for every saved-shape change, with tests (CLAUDE.md rule).

**Phase 4 · Left panel** (terra): section 5.3 complete, incl. sticky headers, empty states, line row, "Show in" checklist, Replace file… / Edit columns… (13). Fixes 09, 12 (colour logic), 17 (list part), 22.

**Phase 5 · Panes** (terra; ChartPane in very small steps with e2e after each): header and settings popover (5.4); chart canvas, cursor card, short names; markers and lines on the chart; linking; layouts, resize, swap, drops; Table pane; the Smith renderer as a new component (no library). Fixes 03 (chart part), 06, 12 (dashes), 17.

**Phase 6 · Export** (terra): quick paths, dialog, paper presets, TikZ, CSV (5.8). Vector PDF needs a dependency (section 9): build PNG / SVG / TikZ / CSV first and ask before PDF.

**Phase 7 · Frame** (terra): top bar and strip with wrapping and armed states (5.1); footer and "?" sheet (5.2, fixes 10, 18, 19); App settings sheet (5.9); right panel and Add analysis menu with AC-3 cards, porting the existing analyses to modules (5.5, fix 05 for tabs); keyboard map; open-files UI and drop feedback (5.6, fix 21); column wizard (5.7); empty app (5.10). Fixes 04, 08.

**Phase 8 · Consistency pass (you + Codex review):** walk every screen in light and dark, Compact and Comfortable, at 1440 × 900 and 1024 × 640, against section 3. Check: no hex in components, no emoji, no coloured side stripes, every disabled control has a reason, every destructive action has Undo or a confirm, toasts and messages follow the rules, reduced motion stops all animation, contrast ≥ 4.5:1 for text. Run a final `adversarial-review` on the whole branch diff with terra. Report what is left.

## 8 · Codex brief template

```
Goal: <one sentence>.
Repo: mergen-scope, worktree <path>, based on ts_refactor.
Read first: CLAUDE.md, README.md → Architecture, <files>.
Spec (follow exactly; do not invent visuals): <paste the relevant part of this prompt>.
Shared rules that apply: <the bullets from section 3 that matter here>.
Files you may change: <list>. Do not touch: <list> (e.g. ChartPane.tsx unless named; dist/; package.json).
Constraints: TS strict, no `any`, `import type` for types, relative imports, no new dependency, no new abstraction layer, domain stays React-free, OKLCH tokens only (no hex), no emoji.
Tests: add/adjust <tests>. Workspace shape changed? add a migration + test.
Done when: npm run typecheck && npm run test:unit pass<, and npm run test:e2e>. Report the commands you ran and their output.
```

## 9 · Ask the user before

- **Fonts:** bundling IBM Plex Sans and JetBrains Mono offline (privacy rule) needs either the `@ibm/plex-sans` / `@fontsource` packages or font files committed to the repo. Ask which.
- **Vector PDF export:** needs a dependency (e.g. jsPDF + svg2pdf.js). Ask before adding; PNG, SVG, TikZ and CSV need none.
- Any other new dependency, any deploy, any push.

## 10 · Out of scope for now

The landing page (`index.html`) and its moving waveform hero · the logo (parked) · changing the blue accent (would be a token change) · the Ctrl+K Actions box · a Polar pane · IQ data and the rest of the roadmap.
