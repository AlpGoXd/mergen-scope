# Repository safety and collaboration policy

- Git metadata is protected permanently: never delete or force-clean `.git` directories or files, linked worktree metadata, refs, objects, or indexes.
- Never clean up agent worktrees or junctions. Do not run recursive deletes, force removals, `git worktree remove`, `git clean`, or `git reset --hard`.
- Never create or remove junctions. Leave task directories in place.
- Additive, reviewed Git operations are allowed. Do not commit unless the user asks. Never push or deploy.
- Do not read secrets, `.env*`, or authentication files.
- Root orchestrates and reviews. Use Terra high for risky Phase 3 steps 3B, 3E and 3F. Luna may handle routine, scoped work. Root must get the user's explicit OK before assigning Sol or Astra. Keep one writer per file and isolated worktrees.
- At each Phase 3 step boundary, stop with a report of at most 15 lines so the user can run full test gates, commit and bundle. Do not start the next step until that checkpoint. Root must not review large diffs. Assign one Terra medium reviewer only for migration, Undo/history, ChartPane, Smith or export; routine work needs no reviewer.
- Keep dataset identity independent of sample arrays so a future live-sources project can update samples without changing identity. Do not build live-source behavior in this redesign.
- Never run `npm ci` or another clean install against an existing `node_modules`. Install locked dependencies only in a fresh directory after confirming `node_modules` is absent.
- Main `node_modules/mergen-scope` is an existing self-junction to the main project root. Do not traverse, touch, or clean it, and do not recursively copy or enumerate existing dependencies.
