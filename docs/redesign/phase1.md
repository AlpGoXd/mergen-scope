# Phase 1 report

Proposal based on c030a5a8706ad602d5933d8d7804810cc75ee442, isolated in `mergen-scope-codex-phase1-tokens-v2`. Root reviews and integrates; no commits or deployment. Native implementation used gpt-6.1-terra; font acquisition used gpt-6-luna. Independent CLI review requested gpt-6.1-terra, but its exact runtime variant was not exposed. Seven product files implement tokens, offline fonts, base controls and provider-owned light/dark preference. Settings UI remains Phase 7; manual selection is exercised through the theme API. Existing v4 theme field remains valid; preference never enters the workspace shape.

Independent review fixes: palette reads occur after the provider applies the root class; workspace restore preserves the current theme at reducer dispatch time; initial state resolves a stored manual preference before first render. Per-hue chroma is clamped to sRGB against the specified maxima. Nine focused theme tests cover system/manual persistence, blocked storage, shared listener, computed palette, first render, stale restore and legacy v4 themes.

Verification in this worktree after fixes:

- `npm run typecheck`: passed.
- `npm run test:unit`: 88 passed, 4 todo (baseline 79 passed, 4 todo).
- `npm run test:e2e`: 16 passed (baseline 16).
- `npm run build`: passed; generated `dist/app.html` is build output and excluded from handoff.
- `npm run test:static`: 1 passed (baseline 1).
- `node docs/redesign/phase1-screenshots.cjs`: baseline demo DAT loaded with one plotted line, both themes at 1440x900 and 1024x640; all four font faces loaded. Screenshots are listed in the manifest below.
- `node docs/redesign/phase1-production-check.cjs`: production app requested only same-origin app.html and icon; all four bundled font faces loaded. This is a font/initial-load check, not the full Phase 8 privacy audit.

Four font files and their two OFL licences and provenance README were reviewed by root. The palette keeps legacy aliases; trace family assignment, ChartPane white mixes and its renderer are deferred to later phases. Recharts Line and Tooltip already disable animation. Full shared controls, settings and layout remain later-phase work.

[Recovery incident](recovery.md) documents the recovered original commits and tracked source; ignored local tooling folders were not restored and main dependency repair completed additively; independent main verification passed all five gates. See the [main verification log](phase1-verification-artifacts/independent-main-gates-2026-11-08.md). Phase 1 is complete at an uncommitted checkpoint. The user-provided repository safety policy is in [AGENTS.md](../../AGENTS.md).

## Handoff manifest

SHA-256 for proposed source, fonts and evidence. Excludes generated dist, node_modules, copied AGENTS policy and the two earlier screenshots made with a different fixture. This report is excluded from its own hash list.

| File | SHA-256 |
| --- | --- |
| `src/App.tsx` | `a03ec621181ae3d2c4b1a56ae24783abad5ee7e6ccea886f6330d92a43366d1c` |
| `src/components/analysis/spectrum/IP3Card.tsx` | `f63aa4a8da69ab8e53cbaf3a2f9df39f5d684eadf39bc5b92548fea8d677a43e` |
| `src/components/chart/SmithGrid.tsx` | `78d5daa8c22c89b46f3418506b8d4aaf1766a850392e669c8ee462a6b0c8a0e6` |
| `src/components/layout/TopBar.tsx` | `aa859d6ff5578b6eb68f82464137b97cf77641c0de90c4ac3e2b29b6a5458afe` |
| `src/hooks/use-theme.ts` | `2277c642137a65fce2025ea84176a56c47ac1c5bb06da81d4ff234b7f2a627f7` |
| `src/index.css` | `2c3c99cea1ec8cf3a577a58d7547162d75b291bb251173a93d8cfe1369893199` |
| `src/stores/ui-store.tsx` | `9c065f5f2c894208d5fc054844377cad85fdf77b264aeb0e49b66aff14351c82` |
| `tests/unit/theme.test.tsx` | `cc4f6a7dc0b6a9467de31d0289ecb13d5396a7a89c41c4977759fc9c26ba5ae2` |
| `docs/redesign/phase1-brief.md` | `668e30190d39d0099746d545714a9484c25689397c66a4889896eeb46f2d2fdf` |
| `docs/redesign/recovery.md` | `ad841bd004d3983490f21e0d8bc9b608d93508649f6d5ba342f1c103f090ec3a` |
| `docs/redesign/phase1-production-check.cjs` | `a37600b679343fc5e858abc58c2340be78f76d8231c1ed631aa78153bea7c653` |
| `docs/redesign/phase1-screenshots.cjs` | `5bbd15e2516bfc82580f64955621add246d0f652c2918f67655f2288bc222999` |
| `docs/redesign/phase1-light-1440x900.png` | `5c57f782d968268f7a83e93de51f9bedd96b459b361a49a10069db6176528a27` |
| `docs/redesign/phase1-light-1024x640.png` | `9eeec6f5f3568a2c760c7ff561e2164e1d96b94093bb41764b51277c3156366c` |
| `docs/redesign/phase1-dark-1440x900.png` | `b10850526ac1349cd7ce58567bd17026f575d3387579effd4b220cb784330570` |
| `docs/redesign/phase1-dark-1024x640.png` | `d32d2c16a2c9e02f077ccc779219368f1a7b56d7f4e2d8751bbc75da1c0f2be5` |
| `src/assets/fonts/IBMPlexSans-Regular.woff2` | `ba711a3085ff9f27440b6b9c4550cfc47c97bf36591d5da958b975bb3add8c1a` |
| `src/assets/fonts/IBMPlexSans-SemiBold.woff2` | `f78048030eab62e860efa39a0df79e2e5581bf122eb95b9bc42c0b8a4988d205` |
| `src/assets/fonts/IBMPlexSans-Bold.woff2` | `fa7130d854a660b39a7fc9e6e0f2dc23dba5f1346e2adea3e1fe37b6d884133d` |
| `src/assets/fonts/JetBrainsMono-Regular.woff2` | `a9cb1cd82332b23a47e3a1239d25d13c86d16c4220695e34b243effa999f45f2` |
| `src/assets/fonts/IBM-Plex-OFL.txt` | `7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da` |
| `src/assets/fonts/JetBrains-Mono-OFL.txt` | `3d5fbb2d0e83919c8d9c6aa7a30e9554ef3448b0270f52a7520d49cc9ffa588f` |
| `src/assets/fonts/README.md` | `ef0c071bb2958b73673252ddeb82d09a96b8b995dd22dc0ecb972d6b6c63c09a` |
