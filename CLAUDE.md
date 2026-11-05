# Mergen Scope — Claude Code instructions

Browser RF/signal analysis app (R&S `.dat`, CSV/TSV, Touchstone `.sNp`). React 19 + TypeScript 6 strict + Vite 7 (single-file build) + Recharts. Architecture, source layout, store order and parser pipeline are in `README.md` → "Architecture"; read it instead of re-deriving.

## Layout and boundaries

- `src/domain/` — pure logic (parsers, trace math, analysis, workspace serialize/migrate). No React imports; keep it that way so it stays unit-testable.
- `src/types/` — shared contracts, also React-free.
- `src/stores/` — context + reducer stores composed in `StoreRoot.tsx`. No global singletons.
- `src/hooks/` — bridge between stores/domain and components.
- `src/components/` — UI only; put math in `domain/`, not in components.
- `app.html` = SPA shell, `index.html` = static landing page. `dist/` is build output: never hand-edit it.
- **Fragile:** `src/components/chart/ChartPane.tsx` (marker placement, drag zoom/pan, Y zoom, crosshair). Small, reversible steps; run e2e after every change there.
- Workspace snapshots are versioned (v4). Changing the saved shape needs a migration in `workspace-migrate-v4.ts` and a test in `tests/unit/workspace.test.ts`.

## TypeScript conventions

- `strict`, `noUncheckedIndexedAccess`, `noUnused*`, `verbatimModuleSyntax` are on: use `import type` for type-only imports and handle `undefined` from indexing; don't silence it with `!`.
- Imports are relative (`../domain/...`). The `@/` alias exists but is unused; don't mix styles.
- No `any`. No new abstraction layers; follow the existing store/hook/domain pattern.

## Commands (verify before calling work done)

| Purpose | Command |
|---|---|
| Dev server (port 5173) | `npm run dev` |
| Type-check | `npm run typecheck` |
| Unit tests (Vitest, jsdom, `tests/unit/`) | `npm run test:unit` |
| Browser smoke (Playwright, `tests/e2e/`, starts dev server) | `npm run test:e2e` |
| Build (`tsc` + Vite → `dist/`) | `npm run build` |
| Built-bundle smoke (`tests/static/`, port 4173) | `npm run build && npm run test:static` |

There is no linter; `typecheck` is the static gate. Minimum for any code change is `typecheck` + `test:unit`. Add `test:e2e` for UI/chart/interaction changes, and `build` + `test:static` for build or asset changes. CI (`.github/workflows/deploy-pages.yml`) runs all of these on push to `main`.

## Dependencies

npm with a committed `package-lock.json`. Ask before adding a dependency, and never add one for a few lines of code. Keep runtime deps minimal: the build inlines everything into a single HTML file.

## Git

- Work happens on `ts_refactor`; `main` deploys.
- **Never `git push`** (blocked by a deny rule in `.claude/settings.local.json`). Commit only when the user asks; the user pushes. Worktree branches never need pushing: merge them locally.
- Commit style: short imperative subject, optional scope prefix (`refactor(ts): …`, `design-sync: …`).
- `dist/*` is tracked although `.gitignore` lists `dist/` (open decision); don't stage `dist/` changes unless asked.

## Security

- Never read, print or commit `.env*`, `~/.codex/auth.json`, or any token. Don't paste secrets into Codex prompts.
- Deploys (`npx wrangler deploy`, Pages) are the user's call; don't run them.
- Parsers handle untrusted user files: keep input validation and bounds checks when editing `src/domain/parsers/`.

## Visual design work

- Explore look and feel (palette, toolbar styling, layout mockups) in Claude Design first; once the user picks a direction, port the tokens/styles into `src/index.css` and the components.
- The design canvas only renders standalone components: most layout/chart components depend on store providers (see `.design-sync/NOTES.md`). Judge chart panes, sidebar and top bar in the real app (`npm run dev`), not on the canvas.
- Use the `frontend-design` plugin for UI changes. Visual changes still need `test:e2e`, since styling can break chart interaction.
- Codex is not the tool for visual taste; use it for review of interaction/logic changes only.

## Working with Codex

Claude is the coordinator: it plans, decides, integrates, and does the final verification. Codex (OpenAI Codex CLI via the `codex@openai-codex` plugin, ChatGPT login) is an independent collaborator. Claude stays accountable for everything Codex produces.

### Models (verified 2026-11-06 with live runs)

| Model ID | Use for |
|---|---|
| `gpt-6.1-terra` | Complex implementation, hard debugging, architecture, independent code review |
| `gpt-6-luna` | Small fixes, writing tests, straightforward coding, focused analysis |

Always pass `--model` explicitly; the Codex default (`gpt-6-sol` in `~/.codex/config.toml`) is not what we want. The plugin's `--effort` accepts only `none|minimal|low|medium|high|xhigh` (not `max`/`ultra`). If a model is rejected, say so and name the model that actually ran. Don't claim the preferred one was used.

### How to invoke

The `/codex:review`, `/codex:adversarial-review`, `/codex:status`, `/codex:result` slash commands are user-only (Claude can't invoke them). Claude calls the companion script directly with the Bash tool:

```bash
CODEX="$(ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | tail -1)"

# Read-only review of uncommitted work (or --base main --scope branch)
node "$CODEX" review --model gpt-6.1-terra --scope working-tree
node "$CODEX" adversarial-review --model gpt-6.1-terra --scope working-tree "focus text"

# Investigation, read-only (default sandbox)
node "$CODEX" task --fresh --model gpt-6.1-terra --effort high "<prompt>"

# Implementation, can write files: only in an isolated worktree
node "$CODEX" task --fresh --write --cwd <worktree-path> --model gpt-6-luna "<prompt>"
```

For long runs use the Bash tool's `run_in_background` and wait for the notification instead of polling. `node "$CODEX" status` / `result <job-id>` read job state. The `codex:codex-rescue` agent is an alternative for tasks: put `--model …` in its prompt, since it otherwise leaves the model unset and **defaults to `--write` in the current tree**.

### When to delegate

Delegate when it clearly helps:
- **Second-opinion review** of a non-trivial diff before telling the user it's done (terra, `review` or `adversarial-review`). Especially for `ChartPane.tsx`, parsers, workspace migration, analysis math.
- **Stuck bug:** after one solid attempt fails, have Codex investigate independently (terra, read-only) and compare root causes.
- **Independent tests:** Codex writes tests from the spec/types, not from Claude's implementation (luna, worktree).
- **Parallel work:** a large task with separable parts (e.g. a new analysis card in `domain/analysis/` + its card component), one part per agent, each in its own worktree.
- **Alternative design** for an architectural choice (terra, read-only, no writes).

Don't delegate trivial edits, one-file fixes Claude can verify in a minute, or anything needing the conversation's context that's costly to explain.

### Rules

- **One writer per file.** Never let Claude and Codex (or two Codex jobs) edit the same files at the same time. Write-capable Codex runs go in a git worktree (`git worktree add ../mergen-scope-codex-<task> -b codex/<task>`), passed via `--cwd`. Read-only runs may use the main tree.
- Give Codex a self-contained prompt: goal, files involved, constraints from this file, and the verification command to run.
- Treat Codex output as a proposal. Claude reads the diff, rejects what doesn't fit, merges the rest, then runs the verification commands above itself. Codex reporting "tests pass" is not enough.
- Tell the user which model did what and what was accepted or rejected. Remove worktrees/branches once merged or abandoned.
