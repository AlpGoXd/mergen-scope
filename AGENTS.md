# Repository rules for agents (Codex and others)

> The human's real prompt: "ok agent, refactor everything to TS, make no mistakes, and please leave main alone." The rules below are the same thing, with fewer prayers.

`CLAUDE.md` is the full project guide (architecture, TypeScript conventions, commands, test policy). This file repeats the rules an agent must never get wrong. The two files must agree; if they seem to differ, `CLAUDE.md` wins and you report the difference.

## Folder, branches and worktrees

- Work happens in **one folder**: `gits/mergen-scope`. There is no `gits/mergen-scope-beta-2` and no `beta-2` branch any more.
- `main` is the released line. Never commit on it, never touch it.
- `dev` is the integration branch. Task branches are made from `dev` and named `type/kebab-slug` (`feat/`, `fix/`, `chore/`, `codex/`).
- **When you are given a task, your branch is already checked out** in `gits/mergen-scope`. Work and commit there. Check with `git branch --show-current`; if you are on `dev` or `main` instead, stop and report.
- **Do not create worktrees, copies of the repo, or git bundles.** Not under `gits/_worktrees/`, not in a temp folder, not "for verification". If you think you need an isolated copy, stop and say why.
- Never merge, never push, never deploy. The coordinator (Claude) reviews your branch and merges it into `dev`.
- Never delete a branch, never rewrite history: no `git reset --hard`, rebase, `git clean`, force-push or `--force` anything. Never delete or edit `.git` metadata.
- The working tree may contain uncommitted changes that are not yours (for example `README.md`, `docs/plan.md`, `package-lock.json`). Never stage, revert or edit them. Stage only the files you changed, by explicit path (no `git add -A`, no `git add .`).

## Dependencies

- There is **one** install: `gits/mergen-scope/node_modules`. Use it as is.
- There is **no** shared install in `gits/`. An old `gits/node_modules` from an earlier policy may still exist. Node falls back to it from any folder under `gits/` without its own `node_modules`, which gives the wrong packages. That is one more reason not to work outside `gits/mergen-scope`.
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
- `src/components/chart/ChartPane.tsx` is fragile: change it only when the task says so, in small steps, running the chart e2e specs after each one.
- Workspace files are v5. A change to the saved shape needs a migration in `workspace-migrate-v5.ts` and a test in `tests/unit/workspace-v5.test.ts`.
- Parsers read untrusted files: keep their input validation and bounds checks.

## Security

- Do not read, print or commit secrets: `.env*`, `~/.codex/auth.json`, tokens.

## AI and tool leftovers

(Yes, your 47 half-finished experiments too. Clean up after yourself; the repo is not your sketchbook.)

Temporary work goes in `.scratch/`: handoff notes, kits, screenshots, evidence, reports, patches. Never commit them. Kits are copied into `src/` and `tests/`; the kit folder itself stays untracked. Evidence for a change goes in your report, not the repo.

The staged-file guard permits an intentional exception only with `ALLOW_AI_FILES=1`. The existing README workspace image and `docs/design/references/` images are allowed.
