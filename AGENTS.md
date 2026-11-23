# Repository rules for agents (Codex and others)

> The human's real prompt: "ok agent, refactor everything to TS, make no mistakes, and please leave main alone." The rules below are the same thing, with fewer prayers.

`CLAUDE.md` is the full project guide (architecture, TypeScript conventions, commands, test policy). This file repeats the rules an agent must never get wrong. The two files must agree; if they seem to differ, `CLAUDE.md` wins and you report the difference.

## Folder, branches and worktrees

- Normally work happens in **one folder**: `gits/mergen-scope`. There is no `gits/mergen-scope-beta-2` and no `beta-2` branch any more.
- **Parallel mode** (only when the user asks for it): each writer owns exactly one folder. `gits/mergen-scope` belongs to the user's agent; Claude and its Codex jobs work in `gits/_worktrees/claude-dev`. Never edit, switch branches in, or run git commands that write in a folder you don't own. In parallel mode only Claude merges into `dev`.
- `main` is the released line. Never commit on it, never touch it.
- `dev` is the integration branch. Task branches are made from `dev` and named `type/kebab-slug` (`feat/`, `fix/`, `chore/`, `codex/`).
- **When you are given a task, your branch is already checked out** in the folder you were started in. Work and commit there. Check with `git branch --show-current` before you start and before you commit. If it is not the branch your task names, or it changes while you work, or files you didn't touch show up in `git status` or the index, **stop at once and report**. Don't work around it.
- **Writer lock:** the folder may hold `$(git rev-parse --git-dir)/mergen-writer.lock`. While it exists, the pre-commit hook refuses commits on any other branch and commits with files outside your allowed paths. A refusal means something is wrong: stop and report. Never delete the lock and never bypass the hook (`--no-verify`).
- **Do not create worktrees, copies of the repo, or git bundles.** Not under `gits/_worktrees/`, not in a temp folder, not "for verification". If you think you need an isolated copy, stop and say why.
- **In `gits/_worktrees/claude-dev`, your sandbox can't write git data or start the dev server.** Leave your changes uncommitted, run typecheck and unit tests, skip e2e, and say so in your report. Claude commits and runs e2e.
- **Ports:** e2e reuses a dev server that is already running on its port. In `gits/_worktrees/claude-dev`, always set `PW_PORT=5183` for Playwright and `PW_STATIC_PORT=4183` for `test:static` so you never test another folder's server. The default 5173 belongs to `gits/mergen-scope`.
- Never merge, never push, never deploy. The coordinator (Claude) reviews your branch and merges it into `dev`.
- Never delete a branch, never rewrite history: no `git reset --hard`, rebase, `git clean`, force-push or `--force` anything. Never delete or edit `.git` metadata.
- The working tree may contain uncommitted changes that are not yours (for example `README.md`, `docs/plan.md`, `package-lock.json`). Never stage, revert or edit them. Stage only the files you changed, by explicit path (no `git add -A`, no `git add .`).

## Dependencies

- Each folder has its own install (`gits/mergen-scope/node_modules`, and in parallel mode `gits/_worktrees/claude-dev/node_modules`). Use the one in your folder as is.
- There is **no** shared install in `gits/` (the old `gits/node_modules` was deleted on 2026-11-22). If one reappears, don't use it: Node falls back to it from any folder without its own `node_modules`, which gives the wrong packages.
- Never run `npm install`, `npm ci` or `npm update`, and never change `package.json` or `package-lock.json`, unless the task explicitly says so. If something is missing from `node_modules`, stop and report it.
- No new dependencies without the user's OK.

## Tests: scale the run to the change

The full e2e suite is about 280 browser tests and loads the machine heavily. Locally, Vitest and Playwright are capped at half the CPU cores.

| When | Run |
|---|---|
| While iterating | `npm run typecheck` + `npx vitest related <changed files> --run` + the 1–3 e2e specs that cover your change (`npx playwright test tests/e2e/<spec>.spec.ts`) |
| Once, at the end of the task | `npm run typecheck` + `npm run test:unit` + `npm run test:e2e`. Add `npm run build && npm run test:static` for build or asset changes |
| Proving a flaky test is fixed | `--repeat-each=N` on that spec only |

Don't run the full suites repeatedly "to be sure"; CI runs everything on pushes to `main` and `dev`. Report real numbers (passed, failed, skipped) and the exact output of any failure. Don't just say "tests pass".

## Code rules (short version; details in CLAUDE.md)

- TypeScript strict: no `any`, no new `!` non-null assertions, `import type` for type-only imports, relative imports only.
- `src/domain/` and `src/types/` stay React-free. Math goes in `domain/`, not in components.
- `src/components/chart/ChartPane.tsx` is no longer treated as fragile (2026-11-23). Run the chart e2e specs that cover what you touched, like any other change.
- Workspace files are v5. A change to the saved shape needs a migration in `workspace-migrate-v5.ts` and a test in `tests/unit/workspace-v5.test.ts`.
- Parsers read untrusted files: keep their input validation and bounds checks.

## Security

- Do not read, print or commit secrets: `.env*`, `~/.codex/auth.json`, tokens.

## AI and tool leftovers

(Yes, your 47 half-finished experiments too. Clean up after yourself; the repo is not your sketchbook.)

Temporary work goes in `.scratch/`: handoff notes, kits, screenshots, evidence, reports, patches. Never commit them. Kits are copied into `src/` and `tests/`; the kit folder itself stays untracked. Evidence for a change goes in your report, not the repo.

The staged-file guard permits an intentional exception only with `ALLOW_AI_FILES=1`. The existing README workspace image and `docs/design/references/` images are allowed.
