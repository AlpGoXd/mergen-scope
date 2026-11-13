# Phase 0 baseline

Scope: current checkout only, `ts_refactor` HEAD `31724efc737c79b1ad393a07692aa1c056ac73f4`, executed in `../mergen-scope-codex-baseline` on `codex/baseline`. Starting status clean before copying the two untracked planning documents. Main checkout had untracked `docs/`. No product or test code changed. Installed `node_modules` is a junction to the main checkout; no dependencies were installed or changed.

Environment: Windows, Node v25.9.0, npm 11.12.1, Playwright 1.60.0, bundled Chromium 148.0.7778.96 (`chromium-1223`). Ports 5173 and 4173 were checked free before running the stock Playwright configs, which start their own servers in this checkout. Screenshot capture used a separate Vite server on 5193 with `--strictPort`, stopped afterwards. No unrelated servers were reused or stopped.

| Command | Exit | Wall time | Result |
| --- | ---: | ---: | --- |
| `npm run typecheck` | 0 | 4.89 s | Pass |
| `npm run test:unit` | 0 | 10.85 s | 13 files, 79 passed, 4 todo |
| `npm run test:e2e` | 0 | 17.40 s | 16 passed |
| `npm run build` | 0 | 10.38 s | Pass |
| `npm run test:static` | 0 | 3.71 s | 1 passed |

Full logs, timing JSON, capture script and images are in [baseline-artifacts](baseline-artifacts/). There were no check failures to classify. The static test is a shell/icon smoke test, not evidence of privacy or offline behavior. The passing `tests/unit/pane-count.test.ts:19-24` asserts the existing wrong-domain fallback, contrary to the redesign specification; replace this expectation in the relevant future phase, not during baseline.

Screenshots show the actual current app. Each capture uses a fresh browser context and an emulated OS color scheme; the script verifies the applied HTML theme. Demo images load `demo-assets/demo_cascade_ip3_-12dBm.DAT` through the existing file input, assert a visible trace and plot and absence of the empty dropzone. Empty images assert the inverse. The README's `?demo=default` link did not load a demo in this checkout: the React source has a demo loader but no query-parameter wiring. An initial capture using that URL produced empty screenshots; these were overwritten with asserted loaded captures. Capture log records trace counts.

Visual inspection of loaded light 1440×900 and dark 1024×640 images shows a bright pane header in dark mode, dense multi-row controls that consume vertical chart space at 1024×640, truncated trace names and tiny footer/readout text. These are observations, not measured contrast results. Empty captures show the existing dropzone and no footer settings control. Images are baseline references, not redesign mockups.

Build output: `git status --short` showed only `?? docs/` after checks; tracked `dist` did not change. No staging, commit, push or deploy occurred. `manifest.sha256` lists hashes for reviewable documentation and artifacts, excluding itself to avoid recursion.
