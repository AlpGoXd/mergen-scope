# Independent main verification

Date: 2026-11-08
Repository: C:\Users\alpgo\Desktop\gits\mergen-scope
Dependency restore: additive create-new from approved locked worktree; 6,559 files / 58,531,266 bytes created and hash-verified; 2,088 matching existing files; no differing, refused, or partial files. `node_modules/mergen-scope` self-junction metadata verified intact and points to repository root.

## typecheck

```text

> mergen-scope@2.0.0 typecheck
> tsc --noEmit

```
Exit code: 0
Duration: 00:00:05.6296249

## unit tests

```text

> mergen-scope@2.0.0 test:unit
> vitest run


 RUN  v4.1.7 C:/Users/alpgo/Desktop/gits/mergen-scope

(node:49432) Warning: `--localstorage-file` was provided without a valid path
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  14 passed (14)
      Tests  88 passed | 4 todo (92)
   Start at  01:55:23
   Duration  9.27s (transform 6.50s, setup 22.66s, import 8.20s, tests 1.29s, environment 74.86s)

```
Exit code: 0
Duration: 00:00:12.1667229

## browser e2e

```text

> mergen-scope@2.0.0 test:e2e
> playwright test

[2m[WebServer] [22m(node:44832) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 16 tests using 10 workers

(node:40492) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:20428) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:49756) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:25492) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:38420) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:43724) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:28212) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:38224) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:49756) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:40492) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:21600) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:25492) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:20428) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:38420) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:4532) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:43724) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:38224) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:28212) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:21600) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:4532) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ok  4 [chromium] â€º tests\e2e\gui-smoke.spec.ts:7:1 â€º loads the app shell directly from /app.html (8.4s)
  ok  3 [chromium] â€º tests\e2e\gui-smoke.spec.ts:62:1 â€º import wizard shows which rows and columns its settings select (8.5s)
  ok  2 [chromium] â€º tests\e2e\gui-smoke.spec.ts:48:1 â€º routes ambiguous CSV imports through the import wizard (8.5s)
  ok  9 [chromium] â€º tests\e2e\workflows.spec.ts:57:1 â€º rejecting a trace drop onto another domain shows a warning (9.0s)
  ok  8 [chromium] â€º tests\e2e\workflows.spec.ts:71:1 â€º a file dropped onto an incompatible pane reports its new pane (9.1s)
  ok 10 [chromium] â€º tests\e2e\workflows.spec.ts:157:1 â€º reference-line placement creates, edits, and deletes sidebar state (9.8s)
  ok  7 [chromium] â€º tests\e2e\workflows.spec.ts:83:1 â€º multi-pane assignment survives workspace save and reload (9.9s)
  ok  5 [chromium] â€º tests\e2e\workflows.spec.ts:133:1 â€º analysis panels compute visible results for imported spectrum data (10.2s)
  ok  6 [chromium] â€º tests\e2e\workflows.spec.ts:109:1 â€º trace ops can create an offset trace and include it in CSV export (10.3s)
  ok  1 [chromium] â€º tests\e2e\gui-smoke.spec.ts:14:1 â€º imports data, uses marker/search tools, exports CSV, and reloads a workspace (10.4s)
  ok 13 [chromium] â€º tests\e2e\workflows.spec.ts:197:1 â€º four empty panes fit without covering each other's headers (2.2s)
  ok 11 [chromium] â€º tests\e2e\workflows.spec.ts:212:1 â€º a multi-channel time CSV fills one new pane instead of one pane per channel (2.4s)
  ok 15 [chromium] â€º tests\e2e\workflows.spec.ts:247:1 â€º a broken file shows an import error instead of crashing the app (1.9s)
  ok 12 [chromium] â€º tests\e2e\workflows.spec.ts:175:1 â€º Touchstone import exposes matrix controls and analysis cards without crashing (2.8s)
  ok 14 [chromium] â€º tests\e2e\workflows.spec.ts:234:1 â€º Touchstone traces load while the sidebar is hidden (2.7s)
  ok 16 [chromium] â€º tests\e2e\workflows.spec.ts:260:1 â€º loading a workspace keeps traces in their saved pane even when another pane is the target (2.3s)

  16 passed (17.2s)
```
Exit code: 0
Duration: 00:00:18.4651275

## build

```text

> mergen-scope@2.0.0 build
> tsc --noEmit && vite build

vite v7.3.2 building client environment for production...
transforming...
âœ“ 753 modules transformed.
rendering chunks...
[plugin vite:singlefile] 

[plugin vite:singlefile] Inlining: app-DUnc7nP-.js
[plugin vite:singlefile] Inlining: style-M-KMckcY.css
computing gzip size...
dist/app.html  1,268.26 kB â”‚ gzip: 543.00 kB
âœ“ built in 8.18s
```
Exit code: 0
Duration: 00:00:14.0435671

## static bundle tests

```text

> mergen-scope@2.0.0 test:static
> playwright test --config=playwright.static.config.ts

[2m[WebServer] [22m(node:40684) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[2m[WebServer] [22m(Use `node --trace-warnings ...` to show where the warning was created)

Running 1 test using 1 worker

(node:22500) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:22500) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ok 1 [chromium] â€º tests\static\cloudflare-pages.spec.ts:3:1 â€º serves the production app as static Cloudflare Pages-compatible files (388ms)

  1 passed (4.0s)
```
Exit code: 0
Duration: 00:00:05.9163142

