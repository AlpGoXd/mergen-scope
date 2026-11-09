# Redesign run state

Updated 2026-11-09 (Step 0). A fresh session resumes from this file plus `CLAUDE.md`, `spec-v3.md`, `plan.md`, `CHECKPOINT.md`, `deferred.md` and `referance/README.md` (spelling kept; boards 00–03 win over older boards; the written spec wins over any board).

## Roles, models and rules (updated 10 November)

Claude usage is scarce (user is on the $20 plan); Codex should be used fully.

| Role | Who | Use for |
|---|---|---|
| Orchestrator | Claude session | Planning, reviewing diffs, merging, CSS and presentational components from the boards, **running every gate** |
| Hard step | `opus` subagent | Only `ChartPane.tsx`, Smith rendering, workspace serialization, or a bug the orchestrator failed once; state why |
| Scout | `haiku` subagent | Finding files and call sites, read-only |
| Codex tasks | **`gpt-6.1-terra`** (effort medium by default, high for hard logic) | All Codex implementation, tests written from a spec, independent reviews |
| Tiny edits | `gpt-6-luna` | Only tiny, exact edits (a few lines, exact file and text given). Luna stalled twice and clobbered a file on this repo |

Codex rules:
- **Codex never runs tests** (the Windows Codex sandbox gives `spawn EPERM`). Codex may write test files; **Claude runs every gate** (typecheck, unit, e2e, build, static) in the worktree and on the integrated tree. "Tests pass" from Codex is never evidence.
- **Codex edits files in place and never rewrites a whole file** (no Set-Content / Out-File / full-file Write on an existing file; small targeted edits only). **Before accepting a Codex diff, check line counts** (`git diff --stat`, `wc -l` before/after): an unexpected large deletion means reject that file. Beware PowerShell encoding traps (never re-save a file through Get-Content/Set-Content).
- Pass briefs with `--prompt-file` (inline multi-line prompts get mangled). Include: goal, exact spec excerpt, board file, file allowlist, tests to write, "do not run tests", "do not restyle outside the allowlist".
- One writer per file; at most three Codex writers at once, in separate worktrees with non-overlapping allowlists; merge one branch at a time and run typecheck + unit after each merge. `ChartPane.tsx`, `Sidebar.tsx`, `App.tsx`, `index.css`, shared types and workspace serialization have one owner per step.
- When the main tree has uncommitted work, seed the worktree: create it from HEAD, apply the uncommitted diff, commit that seed on the worktree branch, and merge back only Terra's delta.
- Remove worktrees after merging: remove the `node_modules` junction with `rmdir` first, never recursively.

Budget rules: no Fable; at most one Claude subagent at a time; read only the files a step needs; reports at most 15 lines; one step per session, then write the next step here; on "usage is low", finish the step, update this file, stop. CSS and presentational components stay with Claude. UI method: presentation first (tokens, prop-only components, pattern `src/components/left-panel/`), then wiring as a separate task, then light/dark 2x screenshots beside the board with every difference fixed / deferred / intentional.

Ask the user before: adding a dependency (vector PDF needs a package/size/licence/font proposal), a product decision the spec does not answer, continuing after a gate fails twice, starting the next phase. Never push or deploy. Don't touch `.git` internals, `.claude/`, `.agents/` or the push-protection hook. Don't commit e2e-rewritten evidence under `docs/redesign/*-evidence/` or `dist/` unless the step means to.

## Durable facts kept from the earlier run state

- Dataset identity is independent of sample arrays (future live sources may update samples without replacing identity). This redesign adds no live-source behaviour.
- Push protections: `.claude/settings.local.json` denies push; the shared pre-push hook refuses without `ALLOW_PUSH=1`.
- Backups: `../mergen-scope-before-phase3.bundle` (history through Phase 2) and `../mergen-scope-before-phase3-docs.zip`.
- The user earlier reserved an independent top-model review for the Phase 5 Smith implementation; the current prompt assigns it to Codex `gpt-6.1-terra` against numerical fixtures.
- `ImportWizardModal.tsx` redesign belongs to Phase 7D.
- Many old worktrees exist (`git worktree list`); leave them unless the user asks for cleanup.

## Checkpoint (HEAD `3233771` = `origin/ts_refactor`, 2026-11-09)

The user pushed the merges of `codex/toolbar-pane-feedback`, `codex/line-crossings-fix` and `codex/phase5a-dots` plus the Ctrl+Z/Ctrl+Y-with-focus fix (`src/hooks/use-keyboard.ts`). Do not re-merge those branches. (The user quoted `39bdf58`; that object does not exist locally or on origin. `3233771` matches origin and the quoted counts.)

Gates on HEAD: typecheck pass; unit 277 passed + 4 todo (51 files); e2e 59 passed. Build/static not rerun on this head yet (run at the Step 1 checkpoint).

## Phase task status (HEAD `3233771`)

| Task | Status | Covering tests / note |
|---|---|---|
| 0 baseline | done | `baseline.md` evidence (no test) |
| 1A tokens, fonts | done | `theme.test.tsx`, static `cloudflare-pages.spec.ts`; contrast audit in 8 |
| 1B theme preference | done | `theme.test.tsx`, `aggregate-theme.test.tsx` |
| 2A shared controls | done | `shared-controls.test.tsx`, `shared-controls.spec.ts` (E2E-07 flaky, deferred) |
| 2B units/format | done | `engineering-units.test.ts`, `format-axis.test.ts`; callers deferred 4/5/7 |
| 2C toasts/messages | done | `shared-controls.test.tsx` (toast), `history-warning.test.ts` / `.spec.ts` |
| 3A contracts | done | `registry-contract.test.ts`, `domain.test.ts` |
| 3B pane model | done | `pane-placement`, `pane-membership` (+mounted), `pane-count`, `pane-limit` |
| 3C markers/lines | done | `marker-identity`, `left-kit-delta`, `aggregate-line-groups`, `ref-line-link` |
| 3D opening planner/registry | done | `open-files-plan`, `prepare-open-input`, `aggregate-opening` |
| 3E transaction history | done | `transaction-history`, `aggregate-workspace` (+mounted), `aggregate-wizard-history`, `opening-controller-mounted` |
| 3F workspace v5 | done | `workspace-v5.test.ts`, `workspace.test.ts`, e2e `workflows` save/reload |
| 4A sidebar sections | done | `phase4-sidebar.test.tsx` / `.spec.ts`, `sidebar-completion.spec.ts` |
| 4B file rows, matrix | partly (7D/7E/8) | `phase4-network`, `dark-matrix-2x`, `file-card-*`; tooltips, >8-port picker, progress, Fix open |
| 4C traces, colours, lines, crossings entry | mostly | `pane-menu-kit.spec`, `phase4-colors`, `left-kit-*`, `line-crossings.*`, `line-membership.*`; lines are single records with `paneIds[]` (LL-2); Show-in badges for lines wait for the lines kit; Replace/Edit columns/Rename/Drop/Demo unwired (7D/7E); chart colour adoption (5) |
| 5A header, target, per-pane settings | mostly | `pane-axis-feedback.spec` (header tint), `phase5a-dots.spec` (per-pane Sample dots in Show in menu); minor-grid toggle still shown (bug 15) |
| 5B shared rendering seam | not done | no test |
| 5C chart markers/lines/axes/cursor | not done | `format-axis` covers the formatter only |
| 5D layouts, dividers, drops | partly | pane removal keeps reference lines paneless, 8-pane experimental limit: `toolbar-pane-removal(.mounted).test`, `toolbar-pane-feedback.spec`; layout presets, dividers, swap, drop UI not done |
| 5E1 Smith numerical foundation | done | `phase5-smith-foundation.test.ts` |
| 5E2–5E4 Smith renderer, interactions, acceptance | not done | no test; legacy renderer active |
| 6A–6D export | not done | basic CSV export only (`workflows`, `gui-smoke`) |
| 7A top bar, strip | partly (7E) | `marker-toolbar-visual.spec.ts`; Open/Export/Layout wiring and responsive evidence open |
| 7B footer, help, settings | partly (7E) | no dedicated test; preference consumers, states, privacy open |
| 7C right panel, Analysis cards | not done | `analysis-more.test.ts` (math only) |
| 7D unified opening UI, wizard | partly | controller: `opening-controller-mounted`, `gui-smoke` wizard; UI not done |
| 7E integration | not done | no test |
| 8 consistency, adversarial review | not done | no test |

`deferred.md` has mojibake (em dashes, multiplication sign); fix it with a UTF-8-safe edit when it is next touched.

## Next step

Step 5 (bug and rule fixes found in testing) is done in the main tree, uncommitted, on top of Step 4 (lines presentation, also uncommitted). The three earlier commits (design fixes `4bc4179`, Size setting `5b3bf2b`, lines data model `2019cec`) already exist; nothing was pushed. Gates: typecheck pass; unit 311 passed + 4 todo (58 files); e2e 83 passed; build pass; static 1 passed.

Fixes: line placement only in the clicked pane (rule removed from code, `spec-v3.md`, `plan.md`, tests); cursor placement via the real plot geometry (`plotGeometry()` in `ChartPane.tsx`; `LinesLayer` publishes `data-plot`, `data-x-domain`, `data-y-domain` for tests); right-click behaviour (pane-level `onContextMenu`); toast policy (`ToastKind` gate in the engine, one toast at a time in `toast-store.tsx`, no history notices). No Codex work this step (all small, interdependent edits in `ChartPane.tsx`/store/tests).

Awaiting the user's OK to commit Steps 4 and 5 (suggested: one commit for the lines presentation, one for these fixes), then Phase 5.
