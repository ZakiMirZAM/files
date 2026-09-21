# Sector Rotation Matrix: one-click "Fill from data"

Multi-model workflow plan (Research -> Ideation -> Plan -> Execute -> Optimize -> Review).
Ideation ran two analyst roles in parallel; both reports are synthesized here.

## Context

The Sector Rotation Matrix (`frontend/src/pages/SectorRotation.tsx`) requires the user to
hand-set ~47 up/neutral/down readings. The page already fetches the full `/api/economic`
payload (used only for sidebar charts), and `lib/sectorRotation.ts` was explicitly designed
for an automated reader ("scoreMatrix() is pure and data-free, so a future automated reader
can derive the readings from the live payload and call it unchanged"). This feature adds a
"Fill from data" button that derives every derivable reading in one click, client-side,
via a new pure function. Educational framing: a starting point the user then edits, not an
answer.

## Chosen solution

### Classifier (new pure module `frontend/src/lib/rotationAutoFill.ts`)

Slope-vs-volatility-band classification with a level-percentile overlay for rows that
carry `neutral` vectors:

1. Resolve each matrix row to its payload series:
   - `SERIES_NAME_OVERRIDES` by exact metric name in `data.metrics` (fixes 3 latent gaps:
     both curve rows sharing definition 6; `m2`/`import_prices` resolving to LEVEL series
     when the rows are YoY-semantic; plus fills previously unmapped `m1`, `sp500`, `sp_m2`):
     `spread_10y3m -> "10Y - 3M Treasury Spread"`, `spread_10y2y -> "10Y - 2Y Treasury Spread"`,
     `m2 -> "M2 YoY %"`, `import_prices -> "Import Price Index YoY %"`, `m1 -> "M1 YoY %"`,
     `sp500 -> "S&P 500 YoY %"`, `sp_m2 -> "S&P 500 / M2 Normalised"`.
     If an override name is absent (mock payload), the row SKIPS (no wrong-semantics fallback).
   - Otherwise `ECON_LINK[id]` -> chartMetricName (same resolution the sidebar chart uses).
   - Special providers: `yields` -> `data.treasuryYields` ("10-Year Treasury Yield");
     `fed_model` -> derived daily spread `fedModel.earningsYieldTrend - treasuryYieldTrend`
     joined on period; `wheat` -> `data.commodities` label "Wheat" price series.
   - `sp500_pe` -> skipped `not-derivable` (no P/E trend in the payload).
2. Filter non-finite values; downsample daily -> monthly (last point per YYYY-MM).
   `parsePeriod` handles "YYYY" (mock annual), "YYYY-MM", and ISO dates.
3. Staleness guard: skip if latest point older than 400 days (annual: ~31 months).
4. Change over a time-based lookback: 6 months (annual series: 12), nearest-point with
   half-lookback tolerance.
5. Neutral band: |change| <= 0.5 x RMS of historical same-horizon changes (up to 15y of
   history, minimum 8 changes, 5 for annual); outside the band -> up/down by sign.
6. Level overlay (only rows where `hasNeutral(m)`): if slope says neutral, compute the
   latest level's percentile over trailing 10y; >= 0.80 escalates to "up", <= 0.20 to
   "down". Guard: curve rows never escalate DOWN (a flat/inverted stable curve IS the
   late-cycle neutral signal N_CURVE encodes). This fixes the "stably elevated" trap
   (VIX flat at 35 must not read as calm risk-on).

Return shape: `{ readings, filled: AutoFillEntry[], skipped: AutoFillSkip[] }` with
per-row provenance (source series, change, band, percentile, rule) and skip reasons.
`now` injectable via options for deterministic tests.

### UX (`SectorRotation.tsx`)

- Migrate the page from `fetchEconomic()` to `fetchEconomicResult()` so it sees `isLive`.
  Auto-fill from the offline mock would fabricate readings; the repo contract forbids it.
- Header button between HelpBadge and Reset: `btn-ghost`, `Zap` icon, label "Fill from data",
  `data-tour="rotation-autofill"` wrapper. Disabled while payload is loading or not live,
  with state-specific `title` copy (no em dashes anywhere).
- Click: `merged = { ...dirs, ...result.readings }` (overwrites sourced rows, preserves
  manual readings on skipped rows, never touches weights).
  - If merged equals current: toast "Readings already match the latest data" (no snapshot,
    keeps Undo semantics clean on double-click).
  - Else snapshot prev dirs, apply, `toast.success` "Filled N of 47 metrics from the latest
    data" + description "M metrics have no data feed, set those from your own read." +
    Undo action restoring the snapshot, 10s duration.
  - Zero filled: error toast, no state change.
- Tour: add step targeting `[data-tour="rotation-autofill"]` to ROTATION_TOUR, bump version
  so existing users see it. Help: append a paragraph to `content/help/rotationWeights.md`.

### Testing

- Add `vitest` devDependency + `"test": "vitest run"` (first frontend test harness).
- `src/lib/rotationAutoFill.test.ts`: rising/falling/flat ramps; VIX stably-elevated
  escalation; inverted-flat curve stays neutral; "YYYY" periods; NaN filtering; stale
  series skip; short annual series skip; fed_model derived spread; yields from
  treasuryYields; wheat from commodities; sp500_pe not-derivable; exhaustiveness (every
  METRICS id lands in filled or skipped); null payload -> all skipped.
- Gates: `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, `npx vitest run`.

## Files

| File | Change |
|---|---|
| `frontend/src/lib/rotationAutoFill.ts` | NEW pure classifier module |
| `frontend/src/lib/rotationAutoFill.test.ts` | NEW vitest unit tests |
| `frontend/src/pages/SectorRotation.tsx` | button, isLive migration, toast + undo |
| `frontend/src/lib/tours/pageTours.ts` | ROTATION_TOUR step + version bump |
| `frontend/src/content/help/rotationWeights.md` | help copy |
| `frontend/package.json` | vitest devDep + test script |

## Phase 5/6 (after implementation)

Parallel reviewer roles: logic/security reviewer (classifier correctness, boundary
conditions) + frontend reviewer (a11y, design consistency, copy rules: zero em dashes,
no author names). Then final gates and manual verification against the running app.
Changes stay uncommitted for the owner to review (repo convention).
