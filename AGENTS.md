# Repository safety and collaboration policy

> The human's real prompt: "ok agent, refactor everything to TS, make no mistakes, and please leave main alone." The rules below are the same thing, with fewer prayers.

## Branches, worktrees and dependencies (every agent follows this)

- `main` is the released line. Never commit on it. The next version is collected on `beta-2` (folder `gits/mergen-scope-beta-2`).
- A feature or task gets its own branch from `beta-2`, named `type/kebab-slug` (`feat/`, `fix/`, `chore/`, `codex/`). Merge it back with `git merge --no-ff`, then `git branch -d` it. Never delete an unmerged branch.
- An agent that writes files works in its own worktree: `git worktree add ../_worktrees/<slug> -b <type>/<slug> beta-2`, run from `gits/mergen-scope-beta-2`. One writer per worktree. After the merge, remove it with `git worktree remove ../_worktrees/<slug>` (no force; if it refuses, report instead of forcing).
- **Do not install dependencies in a worktree.** `gits/node_modules` holds one shared install and every folder under `gits/` finds it by itself (`typecheck`, `test:unit`, `test:e2e` and `build` all work with no `node_modules` in the worktree). No junctions, no copies, no `npm install` or `npm ci` in a worktree.
- If a task needs a different dependency set (a new package or a changed `package-lock.json`), stop and tell the user. They refresh the shared install.
- Releases are the user's call: bump the version, merge `beta-2` into `main`, tag `v<version>`, and the user pushes.

- Git metadata is protected permanently: never delete or force-clean `.git` directories or files, linked worktree metadata, refs, objects, or indexes.
- Never run recursive deletes, force removals, `git clean`, `git reset --hard`, rebase, or force-push. Never rewrite history on `beta-2`. Never create or remove junctions.
- Do not push or deploy. Do not touch the `main` branch.
- Local commits on `codex/*` branches and local merges into `beta-2` are authorized without asking only when the current user policy's safety sequence is followed: create and verify `../mergen-scope-before-<step>.bundle --all` first; merge with `--no-ff`; resolve conflicts while preserving both sides' intent; run all gates in `docs/redesign/CHECKPOINT.md` on the merged `beta-2` tree. A successful phase merge is the only point where cleanup may occur.
- If the post-merge checkpoint fails, fix on a branch with at most two attempts, or undo with `git merge --abort` before commit / `git revert -m 1` after commit. Never reset, rebase, or force.
- After a successful merge, `git worktree remove` is allowed only for the completed task's worktree and other old worktrees verified fully merged. Delete a task branch only if `git branch --merged beta-2` lists it. Never delete an unmerged branch or its worktree; list remaining unmerged worktrees in the phase report.
- Do not read secrets, `.env*`, or authentication files.
- Root orchestrates and reviews. Use Terra high for risky Phase 3 steps 3B, 3E and 3F. Luna may handle routine, scoped work. Root must get the user's explicit OK before assigning Sol or Astra. Keep one writer per file and isolated worktrees.
- Stop at the end of each phase with a report of at most 15 lines, including merge state, checkpoint results, screenshot differences against references, and deferred items. Wait for the user's `go` before starting another phase. Root must not review large diffs. Assign one Terra medium reviewer only for migration, Undo/history, ChartPane, Smith or export; routine work needs no reviewer.
- Parallel agents: at most three; write non-overlapping file allowlists first; each uses an isolated worktree from the same commit. Keep exactly one owner per step for `ChartPane.tsx`, `Sidebar.tsx`, `App.tsx`, `index.css`, shared types and workspace serialization. Merge one branch at a time, running typecheck and unit tests after each; run full `CHECKPOINT.md` after the last merge.
- Phase 4 starts with a short Sidebar-row file split. After that step, run Phase 4 alongside Phase 7A (TopBar and ToolbarStrip) and 7B (FooterBar, help sheet and app settings sheet) only on disjoint files. Keep `App.tsx` wiring minimal with one owner, finished in 7E. Compare the UI with boards 40-T1, 41-F1, 42-L1 and 44-S1 in the reference directory.
- Keep dataset identity independent of sample arrays so a future live-sources project can update samples without changing identity. Do not build live-source behavior in this redesign.
- Never run `npm ci` or another clean install against an existing `node_modules`. Install locked dependencies only in a fresh directory after confirming `node_modules` is absent.
- Main `node_modules/mergen-scope` is an existing self-junction to the main project root. Do not traverse, touch, or clean it, and do not recursively copy or enumerate existing dependencies.

## AI and tool leftovers

(Yes, your 47 half-finished experiments too. Clean up after yourself; the repo is not your sketchbook.)

Temporary work goes in .scratch/: handoff notes, kits, screenshots, evidence, reports, patches. Never commit them. Kits are copied into src/ and tests/; the kit folder itself stays untracked. Evidence for a change goes in the chat report, not the repo.

The staged-file guard permits an intentional exception only with `ALLOW_AI_FILES=1`. The existing README workspace image and `docs/design/references/` images are allowed.
