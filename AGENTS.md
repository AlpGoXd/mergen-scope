# Repository safety and collaboration policy

- Git metadata is protected permanently: never delete or force-clean `.git` directories or files, linked worktree metadata, refs, objects, or indexes.
- Never clean up agent worktrees or junctions. Do not run recursive deletes, force removals, `git worktree remove`, `git clean`, or `git reset --hard`.
- Never create or remove junctions. Leave task directories in place.
- Additive, reviewed Git operations are allowed. Do not commit unless the user asks. Never push or deploy.
- Do not read secrets, `.env*`, or authentication files.
- Root orchestrates and reviews. Terra and Luna execute with one writer per file and isolated worktrees.
- Never run `npm ci` or another clean install against an existing `node_modules`. Install locked dependencies only in a fresh directory after confirming `node_modules` is absent.
- Main `node_modules/mergen-scope` is an existing self-junction to the main project root. Do not traverse, touch, or clean it, and do not recursively copy or enumerate existing dependencies.
