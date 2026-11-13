# Phase 2 units implementation report

Model: `gpt-6-luna`. Worktree: `mergen-scope-codex-phase2-units`, branch `codex/phase2-units`, based on `c126ace4f02068876f9dfae447bb21fea892ea56`.

## Implemented scope

- Added canonical `formatEng(value, unit, step)` in `src/domain/units.ts`. It formats base-unit scalars, chooses the single-value SI prefix from `max(abs(value), abs(step))`, derives decimal precision from the scaled step, preserves warranted trailing zeroes for nonzero fractions, removes all-zero fractions, normalizes rounded negative zero, uses U+2212 for negative numbers/exponents, keeps dB-family values unscaled, and groups Hz fractional digits in threes. A rounded 1000 promotes to the next prefix. Extremely fine steps use shortest-roundtrip scientific notation.
- Added typed `parseEngInput(input, { baseUnit? })`, which returns a discriminated success/value or failure/reason result. It accepts real-minus and ASCII signs, decimal and exponent notation, whitespace before units, and valid grouped fractions. Prefix case remains significant (`MHz` / `mHz`, `MV` / `mV`, `S` / `s`); bare prefixes require a base-unit context. Known dB quantities remain unscaled, and incompatible log references such as dBm / dBW fail.
- Re-exported both APIs and their result types through `src/domain/format.ts`.
- Replaced only Sidebar’s local engineering input parser with a thin adapter that supplies `Hz` or `s` from the selected trace domain and maps parse failures to the existing `null` caller contract. Existing frequency/time display tables remain because other Sidebar display adapters use them; removed the parser-only prefix table.
- Left the existing range-aware axis batch formatters and their outputs unchanged. A scalar API has no visible-range argument and cannot promise a shared prefix across an axis; ChartPane adoption remains Phase 5 work, so finding 06 stays open until that integration lands.

Examples:

- `formatEng(1.42035e9, "Hz", 1e3)` → `1.420 350 GHz`
- `formatEng(500e6, "Hz", 500e6)` → `500 MHz`
- `formatEng(999.5, "Hz", 1)` → `1 kHz`
- `parseEngInput("1420.35M", { baseUnit: "Hz" })` → `{ ok: true, value: 1420350000 }`
- `parseEngInput("1.2 ms", { baseUnit: "s" })` → `{ ok: true, value: 0.0012 }`

## Verification

The worktree had no `node_modules`, so I ran `npm ci` in this fresh worktree only. It installed 205 locked packages without changing the manifest or lockfile. npm reported 12 audit advisories (2 low, 3 moderate, 7 high).

- `npm run typecheck` — passed (exit 0).
- `npm run test:unit` — passed (15 files, 98 passed, 4 todo; exit 0). This includes the existing `format-axis.test.ts` compatibility cases and 10 new engineering-units tests.
- `npm run test:e2e` — not run. Sidebar’s parser call path changed; run the UI e2e gate after root reviews and integrates this domain work.
- `git diff --check` — passed.

No package files, ChartPane, layout styling, stores, or other product files were changed. No commits or integration to main were made.

## Changed-file SHA-256

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/domain/units.ts` | 24,219 | `D5AD862FDFB749E3E8F1AB29B86D1D7F85444447762949A2E5EC7D00B4251501` |
| `src/domain/format.ts` | 11,734 | `53C5772BB2542B0954E2D8AC0765560901E0BBE4DCEF3CBCB117581EEA04F14C` |
| `src/components/layout/Sidebar.tsx` | 59,585 | `F5F9E60BAE15A6AD515F1B6AC8FA48AF8B0DC7C78B277B525DE4C62B6F2A3014` |
| `tests/unit/engineering-units.test.ts` | 6,108 | `F2E7DBC711D5ED6E06352D34768AA72F2188251EE9BE93247FB307FEB8EEB5BB` |
