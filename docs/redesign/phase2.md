# Phase 2 report

Checkpoint update, 8 November: the user committed Phase 2 as `517fb4c`. The retrospective [reference comparison](phase1-2-reference-comparison.md) and [side-by-side images](phase1-2-reference-comparison.html) distinguish correct foundation tokens from remaining consumer differences. The original report below describes the earlier verification checkpoint. Phase 3 has not started.

Phase 2 shared controls, transient feedback, engineering formatter/parser and Sidebar parser extraction are verified at an uncommitted checkpoint. Phase 3 has not started. See [UI implementation and evidence](phase2-ui.md), [units report](phase2-units.md), [independent main verification](phase2-main-verification.md), and [deferred work](deferred.md).

The UI implementation ran as native `gpt-6.1-terra`; `gpt-6-luna` implemented the domain work and independently verified main. CLI review requested `gpt-6.1-terra`, but its exact runtime variant was not exposed. Review rejected and fixed modal focus containment, nested Escape, sequential menu focus, popup positioning/viewport clipping, disabled hover and tooltip dismissal, and engineering precision/parsing cases. UI and dialog screenshots in light/dark and loaded baseline-demo app screenshots are `phase2-{controls,dialog,app}-{light,dark}.png`.

Independent main gates passed on the first run: typecheck, unit 117 passed and 4 todo, e2e 21 passed, build and static 1 passed. An earlier isolated UI run had a strict-locator ambiguity at `workflows.spec.ts:177`; its rerun passed and the full raw failed output was not retained. The independent main run had no failures. Task `*.log` files are ignored; complete final main output is retained in the linked Markdown log.

Before this phase the coordinator verified the push-deny settings and direct pre-push hook refusal, plus the pre-phase bundle. The deferred ledger was committed at `c126ace4f02068876f9dfae447bb21fea892ea56`. Caller adoption remains open: button and select roles in Phase 7; Sidebar readout Phase 4, chart axis Phase 5, and footer/wizard Phase 7; other existing items remain in the ledger. No commit or deployment was made for Phase 2. The next phase requires its own user-approved checkpoint and backup.

The combined manifest records the reviewed patch snapshot; after integration, this report and the plan, ledger and UI report were updated for verification status. Code and binary evidence were compared against the reviewed proposal on integration.
