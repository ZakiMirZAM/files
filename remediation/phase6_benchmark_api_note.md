# Phase 6 — recommended API read path for `benchmark`

This note describes (only) the minimal read path for attaching a survivorship-free
Damodaran `benchmark` block to `/api/industry/{industry}` responses. It does **not**
patch `api.py`; it is the recommendation for whoever wires the endpoint later.

## What Phase 6 produced

- Table **`damodaran_benchmark(year, dam_industry, metric, value, source, fetched_at)`**
  in `financials.db`, PK `(year, dam_industry, metric)`, populated by
  `remediation/phase6_damodaran_benchmark.py`.
- Metrics guaranteed per the contract: `operating_margin`, `net_margin`, `wacc`,
  `cost_of_equity`, `pe`, `roe` (plus a bonus `peg`). Margins / WACC / cost of
  equity / ROE are **decimals** (0.30 = 30%); `pe` and `peg` are raw ratios.
- Current run stamps `year = current calendar year`; `--hist Y1 Y2` fills prior
  years from Damodaran's archives.

## The read helper (already written — import, do not reimplement)

`remediation/phase6_damodaran_benchmark.py` exposes:

```python
benchmark_for(conn: sqlite3.Connection, industry: str, year: int) -> dict[str, float | None]
```

It maps our (yfinance-style) `tickers.industry` label to the exact Damodaran
group via the **existing** alias machinery in `betas/damodaran_industry.py`
(alias → raw → fuzzy substring), then returns every contract metric with `None`
for any that is absent or unmapped. Year isolation is built in.

## Minimal wiring for `/api/industry/{industry}`

1. **Reuse the request's open connection.** `api.py` already opens `financials.db`
   (the `damodaran_benchmark` table lives there — no second DB, no ATTACH).

2. **Pick the year.** Use the current calendar year to match the `--current`
   stamp. `benchmark_for` returns all-`None` if that year was never ingested, so
   a fallback to `max(year)` present in the table is a reasonable enhancement but
   not required for correctness.

3. **Call the helper and attach one key.** Add a `benchmark` field to the industry
   payload next to the in-house averages, e.g.:

   ```python
   from phase6_damodaran_benchmark import benchmark_for  # remediation/ on sys.path

   bench = benchmark_for(conn, industry, datetime.date.today().year)
   payload["benchmark"] = {
       "source": "damodaran",
       "note": "External survivorship-free industry averages (NYU Stern).",
       "metrics": bench,   # keys: operating_margin, net_margin, wacc,
                           #        cost_of_equity, pe, roe (values may be None)
   }
   ```

   `benchmark_for` is a couple of indexed point-reads — cheap enough to run inside
   the existing `@cached` industry handler with no extra caching.

## Guidance for the consumer

- **Units:** the frontend must format margins/WACC/cost-of-equity/ROE as percents
  (×100) and `pe`/`peg` as plain ratios. This mirrors the in-house average units
  for margins but note `wacc`/`cost_of_equity` here are decimals.
- **Comparison framing:** present `benchmark` beside the in-house average as the
  *unbiased* reference (the in-house aggregate is survivorship/look-ahead biased —
  see CLAUDE.md `industry_averages.py`). Do **not** blend the two into one number.
- **Missing metrics:** a `None` means Damodaran did not publish that metric for the
  mapped group (or the industry did not map); render as "n/a", never as 0.
- **No schema change downstream:** this is an additive response key, analogous to
  the existing additive `lifecycle` key on the industry payload.

## What NOT to do

- Do not duplicate the alias dict — `benchmark_for` already imports it from
  `betas/damodaran_industry.py`.
- Do not FX-convert any value; these are ratios/decimals, currency-neutral by
  construction (Market Cap invariant does not apply here).
- Do not write to `damodaran_benchmark` from the request path; it is refreshed
  only by the Phase 6 job (register with Task Scheduler using `sys.executable`,
  not the WindowsApps `python` alias).
