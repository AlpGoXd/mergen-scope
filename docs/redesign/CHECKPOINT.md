# Step checkpoint

Run this checklist automatically at the end of every implementation step. Do not ask before doing checklist work. Keep the final report to 15 lines maximum, then stop at the checkpoint.

## Verification

1. Run all five gates on the step's integrated tree, in order: `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`, `npm run build`, and `npm run test:static`. Report useful pass/fail counts for each gate. If e2e fails, rerun the full suite once. Treat a failure reproduced by that rerun as real and fix it with no more than two attempts; rerun the relevant gates after the fix. Do not claim a gate passed if it was not run.
2. Check the step against every applicable requirement in `docs/redesign/plan.md`. For each item, report `done`, `partly done (target phase)`, or `not done`, and name its covering test. If no test covers an item, say so.
3. For UI steps, capture current light and dark screenshots and compare each against its matching reference image. Read the reference README first. List each difference as fixed, deferred (name the target phase), or intentional (give the reason), and carry deferrals into `deferred.md`.
4. Update `docs/redesign/deferred.md` with any work moved to a later phase. Do not defer a required item silently.
5. Report the gates, requirement coverage, screenshot differences where applicable, and deferred updates in at most 15 lines. Stop after the report.

The checked-in reference directory is spelled `docs/redesign/referance/`; use its README and matching boards unless the repository's reference assets are deliberately relocated. The written specification in `plan.md` wins over a board.

## Approval boundaries

Ask the user only before committing, escalating to Sol/Astra, adding a dependency, resolving a product decision the specification does not answer, or proceeding after a safety-gate failure. Do all other checkpoint work autonomously. Never push or deploy. Preserve `.git`, worktrees, junctions and existing dependencies; follow `AGENTS.md`.

## Parallel workers

- Use at most three agents at once. Before starting any agent, state its file allowlist; allowlists must not overlap.
- Each agent works in its own worktree based on the same starting commit. Merge one branch at a time; after each merge, run typecheck and unit tests. After the last merge, run this entire checkpoint against the integrated tree.
- `ChartPane.tsx`, `Sidebar.tsx`, `App.tsx`, `index.css`, shared types and workspace serialization each have exactly one owner per step. If tasks overlap on any file, do them sequentially.
- Phase 4 begins with one short step that splits Sidebar rows into separate files. Only then parallelize later work where file allowlists are disjoint.
