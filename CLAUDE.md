# Mergen Scope — Claude Code instructions

> Translation of the human's usual prompt: "refactor everything to TS, make no mistakes." Below is the version with actual instructions.

Browser RF/signal analysis app (R&S `.dat`, CSV/TSV, Touchstone `.sNp`). React 19 + TypeScript 6 strict + Vite 7 (single-file build) + Recharts. Source layout and the main modules are in `README.md` → "Development" → "Codebase"; read it instead of re-deriving.

## Layout and boundaries

- `src/domain/` — pure logic (parsers, trace math, analysis, workspace serialize/migrate). No React imports; keep it that way so it stays unit-testable.
- `src/types/` — shared contracts, also React-free.
- `src/stores/` — context + reducer stores composed in `StoreRoot.tsx`. No global singletons.
- `src/hooks/` — bridge between stores/domain and components.
- `src/components/` — UI only; put math in `domain/`, not in components.
- `app.html` = SPA shell, `index.html` = static landing page. `dist/` is build output: never hand-edit it.
- `src/components/chart/ChartPane.tsx` (marker placement, drag zoom/pan, Y zoom, crosshair) is no longer treated as fragile (2026-11-23). Run the chart e2e specs that cover what you touched, like any other change.
- Workspace files are versioned: the app saves **v5** (`use-workspace-v5.ts`, `types/workspace-v5.ts`) and loads every older version through `workspace-migrate-v5.ts`, which calls `workspace-migrate-v4.ts` for v1–v4 files. Changing the saved shape needs a migration in `workspace-migrate-v5.ts` and a test in `tests/unit/workspace-v5.test.ts`. The v5 save path handles all new workspace exports.

## TypeScript conventions

- `strict`, `noUncheckedIndexedAccess`, `noUnused*`, `verbatimModuleSyntax` are on: use `import type` for type-only imports and handle `undefined` from indexing; don't silence it with `!`.
- Imports are relative (`../domain/...`). The `@/` alias exists but is unused; don't mix styles.
- No `any`. No new abstraction layers; follow the existing store/hook/domain pattern.

## Commands (verify before calling work done)

| Purpose | Command |
|---|---|
| Dev server (port 5173) | `npm run dev` |
| Type-check | `npm run typecheck` |
| Unit tests (Vitest, `tests/unit/`, node by default) | `npm run test:unit` |
| Only the unit tests related to changed files | `npx vitest related <file> [<file>…] --run` |
| Browser tests (Playwright, `tests/e2e/`, starts dev server) | `npm run test:e2e` |
| A few e2e specs | `npx playwright test tests/e2e/<a>.spec.ts tests/e2e/<b>.spec.ts` |
| Build (`tsc` + Vite → `dist/`) | `npm run build` |
| Built-bundle smoke (`tests/static/`, port 4173) | `npm run build && npm run test:static` |

There is no linter; `typecheck` is the static gate. Unit tests run in node; a test file that needs the DOM starts with `// @vitest-environment jsdom`. Locally both Vitest and Playwright use half the CPU cores (`maxWorkers` / `workers: "50%"`); CI uses all of them.

### When to run what

Run tests to catch a break right after the change that caused it, but scale the run to the change. The full e2e suite is about 280 browser tests; don't run it after every edit.

| When | Run |
|---|---|
| While iterating | `typecheck` + the related unit tests (`vitest related`) + the 1–3 e2e specs that cover what you touched |
| Before merging a branch into `dev`, or calling work done | `typecheck` + full `test:unit` + full `test:e2e`, **once**. Add `build` + `test:static` for build or asset changes |
| After merging into `dev` | `typecheck` + `test:unit` + the specs the branch touched. The full e2e suite only if the merge had conflicts or touched shared code beyond what the branch was verified with |
| Proving a flaky test is fixed | `--repeat-each=N` on that spec only, not repeated full runs |

Don't run full suites in a loop or several times "to be sure": that is what CI is for. CI (`.github/workflows/ci.yml`) runs typecheck, unit, e2e, build and static on every push and pull request to `main` and `dev`, with 2 e2e retries.

## Dependencies

npm with a committed `package-lock.json`. Ask before adding a dependency, and never add one for a few lines of code. Keep runtime deps minimal: the build inlines everything into a single HTML file.

## Git

- `main` is the released line and the only branch that deploys. Don't commit on it.
- Day-to-day work happens on the long-lived integration branch `dev`, in the single folder `gits/mergen-scope`. It is always branched from `main`; after a release, bring it back up to date with `git merge main`. Small changes are committed straight on `dev`; larger features get their own branch and are merged into it.
- Branch names are `type/kebab-slug`: `feat/` for features, `fix/` for bug fixes, `chore/` for housekeeping, `codex/` for Codex jobs.
- **Adding a feature:** branch from `dev` (`git switch -c feat/<slug> dev`), commit there, then merge it back with `git merge --no-ff feat/<slug>` and delete it with `git branch -d feat/<slug>`. Verify before and after the merge as in "When to run what".
- **Versioning (since 2026-11-25):** the product is "Mergen Scope 2.0"; the version number is separate. While in testing it is `0.MINOR.PATCH`: a feature release bumps MINOR (`0.5.0`), a hotfix bumps PATCH (`0.4.1`). The stable launch is `2.0.0`, after that `2.0.1` = hotfix, `2.1.0` = feature release. The old `v1.0.0-beta.1`–`4` tags are history; `0.4.0` is beta 4 relabelled. No `beta.N` counters any more.
- **Releasing:** bump the version in these places together: `package.json`, `package-lock.json` (two entries), `APP_VERSION` in `src/components/help/shortcuts.ts` (a unit test checks it equals `package.json`), the static copies in `index.html` (`softwareVersion` and the two `data-version` spans; the build rewrites the spans) and `CITATION.cff`. Merge `dev` into `main`, tag `v<version>` (for example `v0.5.0`). The user pushes.
- **One folder, no worktrees.** Do not create worktrees or extra copies of the repo under `gits/`. Switch branches in `gits/mergen-scope` instead, and keep the working tree clean before switching. Only one writer (Claude or a Codex job) edits the tree at a time. Create a worktree only if the user explicitly asks for parallel work, and remove it after the merge.
- **Parallel mode** (the user asked for it on 2026-11-22): each writer owns one folder. `gits/mergen-scope` belongs to the user's agent; Claude and its Codex jobs use `gits/_worktrees/claude-dev` (with its own `npm ci` install), which normally has `dev` checked out. Only Claude merges into `dev`, from that worktree. Never write in the other writer's folder. Playwright in the worktree always runs with `PW_PORT=5183` (and `test:static` with `PW_STATIC_PORT=4183`), because e2e reuses whatever dev server already runs on its port, and 5173 belongs to the main folder. Before every write job, run `ListAgents` and `git worktree list`; if another writer could be in the folder, ask the user first.
- **Writer lock** (`.githooks/pre-commit`): while a job runs, Claude writes `$(git rev-parse --git-dir)/mergen-writer.lock` in that folder (`owner=`, `branch=`, `paths=`). The hook then refuses commits on any other branch, or commits with staged files outside `paths`. Claude also runs a watcher that kills the job if the folder's branch changes. Remove the lock when the job ends. The hook is shared by all worktrees and is a no-op without a lock.
- **Codex in the worktree can't commit or run e2e.** Its sandbox only writes inside the folder, but a worktree's git data lives in `gits/mergen-scope/.git/worktrees/`, and it may not spawn the dev server (`spawn EPERM`). So the Codex prompt says: leave the changes uncommitted, run typecheck and unit tests, and skip e2e. Claude then reviews, runs the e2e specs and commits on the job branch.
- **No duplicate `node_modules`:** one install per folder: `gits/mergen-scope`, plus `gits/_worktrees/claude-dev` in parallel mode (its own `npm ci`). Never junctions or a shared install. There is no shared install in `gits/`: an old `gits/node_modules` from an earlier policy may still exist, and Node falls back to it from any folder under `gits/` that lacks its own install, so a worktree without `node_modules` silently gets the wrong packages. If a task changes `package-lock.json`, say so in the report.
- `AGENTS.md` holds the same rules for Codex and other agents. Keep the two files in agreement when either changes.
- **Never `git push`** (blocked by a deny rule in `.claude/settings.local.json`). Commit only when the user asks; the user pushes. Task branches never need pushing: merge them locally.
- Commit style: short imperative subject, optional scope prefix (`refactor(ts): …`, `design-sync: …`).
- `dist/` is build output and is not tracked (it is in `.gitignore`; CI and Cloudflare Pages build it from source). Never force-add it.

## Security

- Never read, print or commit `.env*`, `~/.codex/auth.json`, or any token. Don't paste secrets into Codex prompts.
- Deploys (`npx wrangler deploy`, Pages) are the user's call; don't run them.
- Parsers handle untrusted user files: keep input validation and bounds checks when editing `src/domain/parsers/`.

## Visual design work

- Explore look and feel (palette, toolbar styling, layout mockups) in Claude Design first; once the user picks a direction, port the tokens/styles into `src/index.css` and the components.
- Use the `frontend-design` plugin for UI changes. Visual changes still need the full `test:e2e` before merging, since styling can break chart interaction.
- Codex is not the tool for visual taste; use it for review of interaction/logic changes only.

## Working with Antigravity (`agy`, since 2026-11-23)

For the beta 4 work the user chose the Antigravity CLI (`agy`, on PATH, already signed in) as the implementation agent, in parallel. The Codex rules below (branch, lock, one writer per folder, Claude reviews and verifies) apply unchanged, with these differences:

- Models (`agy models`): `gemini-4-neon-{low,medium,high,xhigh}` and `gemini-4-argon-*` are the ones in use; Claude picks per job (neon-high for tracing/logic, neon-medium for small scoped work). Model IDs are passed with `--model`.
- Run it from inside the job's folder: `agy --model gemini-4-neon-high --mode accept-edits --print-timeout 40m -p "$(cat prompt.txt)"`, in the background. Do not use `--dangerously-skip-permissions`.
- Parallel jobs: one worktree and one branch per job under `gits/_worktrees/agy-<slug>` on `agy/<slug>`, each with its own `npm ci`, each with a writer lock. The user asked for this explicitly; remove the worktrees and branches after merging. Jobs that touch the same file go in the same job.
- The prompt says: leave changes uncommitted, run typecheck and related unit tests, do not run e2e. Claude reads the diff, runs the e2e specs (distinct `PW_PORT` per worktree), commits on the job branch and merges into `dev`.

## Working with Codex

Claude is the coordinator: it plans, decides, integrates, and does the final verification. Codex (OpenAI Codex CLI via the `codex@openai-codex` plugin, ChatGPT login) is an independent collaborator. Claude stays accountable for everything Codex produces.

### Models (terra/luna verified 2026-11-06, sol 6.2 verified 2026-11-22 with live runs)

| Model ID | Use for |
|---|---|
| `gpt-6.2-sol` | The user's current choice for implementation jobs (2026-11-22). Pick `--effort` per task: `medium` for small scoped fixes, `high` for `ChartPane`, migrations and analysis math |
| `gpt-6.1-terra` | Complex implementation, hard debugging, architecture, independent code review |
| `gpt-6-luna` | Small fixes, writing tests, straightforward coding, focused analysis |

Always pass `--model` explicitly; the Codex default (`gpt-6-sol` in `~/.codex/config.toml`, the older Sol) is not what we want. The CLI rejects an unknown model ID with "model is not supported", so a run without that error used the model you named. The plugin's `--effort` accepts only `none|minimal|low|medium|high|xhigh` (not `max`/`ultra`). If a model is rejected, say so and name the model that actually ran. Don't claim the preferred one was used.

### How to invoke

The `/codex:review`, `/codex:adversarial-review`, `/codex:status`, `/codex:result` slash commands are user-only (Claude can't invoke them). Claude calls the companion script directly with the Bash tool:

```bash
CODEX="$(ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | tail -1)"

# Read-only review of uncommitted work (or --base main --scope branch)
node "$CODEX" review --model gpt-6.1-terra --scope working-tree
node "$CODEX" adversarial-review --model gpt-6.1-terra --scope working-tree "focus text"

# Investigation, read-only (default sandbox)
node "$CODEX" task --fresh --model gpt-6.1-terra --effort high "<prompt>"

# Implementation, can write files: on a codex/<slug> branch in the main folder, while Claude does not edit
node "$CODEX" task --fresh --write --model gpt-6-luna "<prompt>"
```

For long runs use the Bash tool's `run_in_background` and wait for the notification instead of polling. `node "$CODEX" status` / `result <job-id>` read job state. The `codex:codex-rescue` agent is an alternative for tasks: put `--model …` in its prompt, since it otherwise leaves the model unset and **defaults to `--write` in the current tree**.

### When to delegate

Delegate when it clearly helps:
- **Second-opinion review** of a non-trivial diff before telling the user it's done (terra, `review` or `adversarial-review`). Especially for `ChartPane.tsx`, parsers, workspace migration, analysis math.
- **Stuck bug:** after one solid attempt fails, have Codex investigate independently (terra, read-only) and compare root causes.
- **Independent tests:** Codex writes tests from the spec/types, not from Claude's implementation (luna, on a `codex/<slug>` branch).
- **Large tasks with separable parts** (e.g. a new analysis card in `domain/analysis/` + its card component): run the parts one after another on a branch each. Parallel agents need worktrees, which only the user can approve (see Git).
- **Alternative design** for an architectural choice (terra, read-only, no writes).

Don't delegate trivial edits, one-file fixes Claude can verify in a minute, or anything needing the conversation's context that's costly to explain.

### Rules

- **One writer per file.** Never let Claude and Codex (or two Codex jobs) edit the same files at the same time. Write-capable Codex runs happen in the main folder on their own branch, and Claude does not edit until the job finishes; then merge the branch into `dev` and delete it. Read-only runs may use the tree at any time.
- **Claude creates the branch, Codex doesn't.** Before a write job, Claude makes sure the tree is clean and runs `git switch -c codex/<task> dev` itself (in parallel mode, inside `gits/_worktrees/claude-dev`), then writes the writer lock and starts the branch watcher. The prompt says the branch is already checked out, and that Codex must not create worktrees, copies of the repo, or a `node_modules` install. Codex has made worktrees on its own before (following an older AGENTS.md); after each job, check `git worktree list` and clean up anything it made.
- Give Codex a self-contained prompt: goal, files involved, constraints from this file, and the verification to run, scaled per "When to run what" (targeted while iterating, the full e2e suite once at the end).
- Treat Codex output as a proposal. Claude reads the diff, rejects what doesn't fit, merges the rest, then runs the verification commands above itself. Codex reporting "tests pass" is not enough.
- Tell the user which model did what and what was accepted or rejected. Delete task branches once merged or abandoned.

## Design documentation

Use [design decisions](docs/design/design-decisions-2026-11-10.md) and [the plan](docs/plan.md).

## AI and tool leftovers

Temporary work goes in .scratch/: handoff notes, kits, screenshots, evidence, reports, patches. Never commit them. Kits are copied into src/ and tests/; the kit folder itself stays untracked. Evidence for a change goes in the chat report, not the repo.

The staged-file guard permits an intentional exception only with `ALLOW_AI_FILES=1`. The existing README workspace image and `docs/design/references/` images are allowed.
