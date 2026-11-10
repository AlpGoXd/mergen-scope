# Starter pack (10 Nov)

Unzip into the repo root: every file goes to the same path. All new files; nothing existing is overwritten. Checked against `ts_refactor` at `b7e90e9`: typecheck passes, and the 37 new unit tests pass.

| File | What it is | Wire it into |
|---|---|---|
| `docs/redesign/design-decisions-2026-11-10.md` | Every decision from 9–10 Nov as text. Wins over older boards and `spec-v3.md`. | Update `spec-v3.md` / `plan.md` from it. |
| `docs/redesign/smith-brief.md` | The full brief for the separate Fable 5.2 Smith session. | Run it as its own session. |
| `src/domain/trace-palette.ts` | Trace colours: 8 source hues next-free and stable; created traces in their own 8 hues (+1, −1, then forward from the parent); rounds and the symbols setting; gamut-clamped colour strings; widths (1.5 / 2 px). | Replace the colour logic in `src/domain/trace-colors.ts` / `makeTraceColorResolver`. Keep the previous `Map` in a store, so colours stay stable. Remove every dash on traces. |
| `src/domain/trace-symbols.ts` | Symbol SVG paths and their positions every 90 px along a trace. | Chart and Smith renderers, row swatches, export. |
| `src/domain/trace-math-units.ts` | Result unit of A ± × ÷ B, with warnings and no blocking. | The trace-math tool (replaces the `areUnitsCompatible` use there); show `warning` as a warning message in the card. |
| `src/text-roles.css` | The seven text roles as classes (`t-title`, `t-section`, `t-card-title`, `t-label`, `t-value`, `t-caption`, `t-readout`), on the existing size tokens. | `import './text-roles.css'` after `index.css` in `main.tsx`; the text-roles pass replaces typed font sizes and weights with these classes. |
| `tests/unit/trace-*.test.ts` | Tests for the three domain files. | Run with `npm run test:unit`. |
