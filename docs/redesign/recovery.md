# Recovery incident

From the main working directory, the baseline task first created a junction with `New-Item -ItemType Junction -Path ..\mergen-scope-codex-baseline\node_modules -Target (Resolve-Path node_modules)`. The subsequent cleanup command was:

```powershell
$baselinePath = 'C:\Users\alpgo\Desktop\gits\mergen-scope-codex-baseline'; $junction = Get-Item -LiteralPath (Join-Path $baselinePath 'node_modules') -Force; if ($junction.LinkType -ne 'Junction' -or $junction.Target -ne 'C:\Users\alpgo\Desktop\gits\mergen-scope\node_modules') { throw 'Unexpected junction target' }; Remove-Item -LiteralPath $junction.FullName; git worktree remove --force $baselinePath; if ($LASTEXITCODE -ne 0) { throw 'Worktree removal failed' }; git branch -d codex/baseline; git worktree list; git status --short
```

The output included `Remove-Item : Object reference not set to an instance of an object.`, then `error: failed to delete 'C:/Users/alpgo/Desktop/gits/mergen-scope-codex-baseline': Permission denied`, then `Worktree removal failed`. The final throw prevented branch deletion and the subsequent status commands.

The coordinator subsequently observed `main/node_modules/mergen-scope` as a junction to the main repository root. Traversal through that nested junction is a plausible cause of the damage, but the exact traversal was not traced. The initial inventory found `.git`, `.agents`, `.claude`, `.crush`, `.ds-sync`, `app.html`, and `demo-assets` absent. Comparison of the surviving checkout to the snapshot found 20 missing paths and 132 raw hash differences among 206 remaining snapshot files, but no normalized text differences. No secrets were read.

The main checkout was partially deleted. The original Git metadata was lost and subsequently restored from fresh GitHub history. The original `main` ref and the external `dugong` worktree were preserved. The restored main checkout's prior HEAD and index were copied to new files in this external forensic folder before the approved metadata recovery. All old task folders remain in place.

The untouched Phase 1 fonts snapshot provided the tracked files needed for recovery. Thirteen tracked files and seven tracked `dist` files were copied only where missing, using create-new operations and hash verification. Existing differing files were not overwritten. The recovered checkout's tracked source and history were verified by the coordinator using Git diff and fsck.

The original commits were reconstructed as exact Git objects, not replacement commits. Their full hashes and trees matched:

| Commit | Commit SHA-1 | Tree SHA-1 |
| --- | --- | --- |
| `before redesign` | `31724efc737c79b1ad393a07692aa1c056ac73f4` | `92ff43de853a52c874cbdd5e5dcf38916d8ff13f` |
| `docs: record redesign plan and baseline` | `c030a5a8706ad602d5933d8d7804810cc75ee442` | `534f7cdbb301233a939b3cba8c337f50078b9e7c` |

The approved recovery fetched these objects from the isolated bare recovery store, updated `ts_refactor` with a compare-and-swap, and restored the index without a checkout or working-file update. No push or deployment occurred.

Tracked recovery does not establish recovery of ignored local data. Initial inventory included `.agents`, `.claude`, `.crush`, and `.ds-sync`; those folders are now absent. Their contents were not inspected and their configuration is not claimed to have been restored. Main's existing dependencies were partially removed. A clean locked install in the v2 worktree works; additive repair of main's dependencies remains pending.

The coordinator paused, reviewed and corrected the safety guardrails, and resumed in fresh worktrees without junctions. Git metadata is protected; deletion, cleanup, worktree removal, junction operations, and force removal remain prohibited. Existing task folders are retained.

Main dependency repair completed additively: 6,559 missing files created and hash-verified, 2,088 existing matches unchanged, with no differences, refusals or failures. No recursive cleanup was used. Independent main verification passed all five gates; see [main verification log](phase1-verification-artifacts/independent-main-gates-2026-11-08.md). Ignored local tooling folders were not restored; tracked source and original commits were recovered.
