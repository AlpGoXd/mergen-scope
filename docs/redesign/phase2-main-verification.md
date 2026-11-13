# Integrated Phase 2 main verification

Date: 2026-11-08
HEAD: c126ace4f02068876f9dfae447bb21fea892ea56 (no commit)
Pre-run: .claude/settings.local.json is 47 bytes; common .git/hooks/pre-push is 109 bytes. Both test ports 5173 and 4173 were free.

## typecheck
```text

> mergen-scope@2.0.0 typecheck
> tsc --noEmit

```
Exit code: 0
Duration: 00:00:03.2532026

## unit tests
```text

> mergen-scope@2.0.0 test:unit
> vitest run


 RUN  v4.1.7 C:/Users/alpgo/Desktop/gits/mergen-scope

(node:22672) Warning: `--localstorage-file` was provided without a valid path
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  16 passed (16)
      Tests  117 passed | 4 todo (121)
   Start at  02:50:03
   Duration  5.50s (transform 3.79s, setup 11.36s, import 5.38s, tests 1.52s, environment 54.35s)

```
Exit code: 0
Duration: 00:00:06.4675101

## browser e2e
```text

> mergen-scope@2.0.0 test:e2e
> playwright test

[2m[WebServer] [22m(node:49720) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 21 tests using 10 workers

(node:23580) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:43788) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:33080) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:52628) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:44528) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:31436) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:47460) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:17820) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:23456) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:55220) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:23580) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:43788) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:52628) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:33080) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:44528) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:47460) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:31436) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:17820) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:23456) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:55220) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ok  7 [chromium] › tests\e2e\shared-controls.spec.ts:29:1 › disabled menu item retains neutral background on hover (1.9s)
  ok  8 [chromium] › tests\e2e\shared-controls.spec.ts:12:1 › popovers stay in viewport and dismiss outside (1.6s)
  ok  5 [chromium] › tests\e2e\shared-controls.spec.ts:21:1 › long menus stay visible and track their anchor on resize and scroll (2.0s)
  ok  1 [chromium] › tests\e2e\gui-smoke.spec.ts:7:1 › loads the app shell directly from /app.html (2.4s)
  ok  4 [chromium] › tests\e2e\shared-controls.spec.ts:3:1 › shared controls support keyboard, disabled explanations, dialog and feedback (2.4s)
  ok  6 [chromium] › tests\e2e\shared-controls.spec.ts:15:1 › active and danger hover retain their roles and toast undo stays legible (2.1s)
  ok  2 [chromium] › tests\e2e\gui-smoke.spec.ts:48:1 › routes ambiguous CSV imports through the import wizard (2.7s)
  ok 10 [chromium] › tests\e2e\gui-smoke.spec.ts:62:1 › import wizard shows which rows and columns its settings select (2.6s)
  ok  9 [chromium] › tests\e2e\workflows.spec.ts:57:1 › rejecting a trace drop onto another domain shows a warning (3.0s)
  ok 11 [chromium] › tests\e2e\workflows.spec.ts:71:1 › a file dropped onto an incompatible pane reports its new pane (2.5s)
  ok  3 [chromium] › tests\e2e\gui-smoke.spec.ts:14:1 › imports data, uses marker/search tools, exports CSV, and reloads a workspace (4.9s)
  ok 15 [chromium] › tests\e2e\workflows.spec.ts:157:1 › reference-line placement creates, edits, and deletes sidebar state (2.7s)
  ok 17 [chromium] › tests\e2e\workflows.spec.ts:197:1 › four empty panes fit without covering each other's headers (2.5s)
  ok 18 [chromium] › tests\e2e\workflows.spec.ts:212:1 › a multi-channel time CSV fills one new pane instead of one pane per channel (2.5s)
  ok 12 [chromium] › tests\e2e\workflows.spec.ts:83:1 › multi-pane assignment survives workspace save and reload (3.4s)
  ok 20 [chromium] › tests\e2e\workflows.spec.ts:247:1 › a broken file shows an import error instead of crashing the app (1.1s)
  ok 16 [chromium] › tests\e2e\workflows.spec.ts:175:1 › Touchstone import exposes matrix controls and analysis cards without crashing (3.1s)
  ok 13 [chromium] › tests\e2e\workflows.spec.ts:109:1 › trace ops can create an offset trace and include it in CSV export (3.6s)
  ok 19 [chromium] › tests\e2e\workflows.spec.ts:234:1 › Touchstone traces load while the sidebar is hidden (2.5s)
  ok 14 [chromium] › tests\e2e\workflows.spec.ts:133:1 › analysis panels compute visible results for imported spectrum data (3.6s)
  ok 21 [chromium] › tests\e2e\workflows.spec.ts:260:1 › loading a workspace keeps traces in their saved pane even when another pane is the target (1.5s)

  21 passed (11.0s)
```
Exit code: 0
Duration: 00:00:12.2148547

## build
```text

> mergen-scope@2.0.0 build
> tsc --noEmit && vite build

vite v7.3.2 building client environment for production...
transforming...
✓ 755 modules transformed.
rendering chunks...
[plugin vite:singlefile] 

[plugin vite:singlefile] Inlining: app-DOia1B1t.js
[plugin vite:singlefile] Inlining: style-DupluM-1.css
computing gzip size...
dist/app.html  1,279.79 kB │ gzip: 545.61 kB
✓ built in 6.16s
```
Exit code: 0
Duration: 00:00:10.5378009

## static bundle tests
```text

> mergen-scope@2.0.0 test:static
> playwright test --config=playwright.static.config.ts

[2m[WebServer] [22m(node:39996) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 1 test using 1 worker

(node:25616) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:25616) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ok 1 [chromium] › tests\static\cloudflare-pages.spec.ts:3:1 › serves the production app as static Cloudflare Pages-compatible files (323ms)

  1 passed (2.6s)
```
Exit code: 0
Duration: 00:00:03.7853376

