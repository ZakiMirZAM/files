# Phase 6 — FX-WEIGHT patch for by-year sector/industry averages

## Problem

The two by-year aggregators weight every metric by the **raw local-currency**
`Market Cap`, summing a JPY/KRW/TWD cap against a USD cap at face value. A
large-notional foreign filer (e.g. a ¥10,000 cap) then dominates the weighted
average over a $100 US filer for the wrong reason. This distorts every
displayed industry/sector trend line and the integrity-question inputs derived
from these aggregates.

`Market Cap` is stored in the company's **reporting currency** (repo invariant).
The scorecard ranking already does the right thing via a `fx_rates` LEFT JOIN
and `Market Cap * usd_per_unit` (`_ranking_for_industry`, api.py ~4644). This
patch brings the two by-year aggregators in line.

## Fix

Weight expression becomes:

```sql
f."Market Cap" * COALESCE(
    x.usd_per_unit,
    CASE WHEN f."Reported Currency" = 'USD'
           OR f."Reported Currency" IS NULL THEN 1.0
         ELSE NULL END
)
```

- **USD / NULL currency** weight at `1.0` per unit (NULL-currency rows are
  treated as already-USD, not dropped).
- **Known currencies** convert via the `fx_rates` LEFT JOIN.
- **Unknown / garbage currencies** have no rate and are not USD/NULL, so the
  `CASE` yields `NULL`, the whole weight is `NULL`, and the row drops from BOTH
  the numerator and the denominator — better than silently pretending a 1:1 rate
  and letting a large foreign notional distort the average.

Metric **VALUES are untouched** — ratios stay in local currency (currency-neutral;
never FX-convert a ratio). Only the WEIGHT converts.

The CAPE and DCF queries in `industry_averages.py` (`compute_cape`,
`compute_dcf`) are **NOT touched** — they are latest-year, mostly USD-filtered,
and use their own `SUM(... * mktcap)` weighting.

---

## Edit 1 — `backend/api.py`: add the shared weight constant

Add a module-level constant immediately before `_by_year_with_groups`.

**old_string**
```python
@cached(ttl_seconds=30 * 60, key_prefix="db")
def _by_year_with_groups(group_col: str) -> dict[int, dict[str, dict[str, Any]]]:
```

**new_string**
```python
# FX-normalised size weight shared by the by-year group aggregates. Requires the
# query to carry `LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"`.
# USD / NULL currency -> 1.0 per unit; a known currency -> its usd_per_unit; an
# unknown currency -> NULL (the row drops from both numerator and denominator).
_FX_WEIGHT_SQL = (
    'f."Market Cap" * COALESCE(x.usd_per_unit, '
    "CASE WHEN f.\"Reported Currency\" = 'USD' "
    "OR f.\"Reported Currency\" IS NULL THEN 1.0 ELSE NULL END)"
)


@cached(ttl_seconds=30 * 60, key_prefix="db")
def _by_year_with_groups(group_col: str) -> dict[int, dict[str, dict[str, Any]]]:
```

## Edit 2 — `backend/api.py`: weight the select-parts by USD cap + add the JOIN

**old_string**
```python
    select_parts: list[str] = []
    for tpl in _GROUP_METRIC_DISPLAY:
        col, clip_low, clip_high = tpl[3], tpl[5], tpl[6]
        clamped = f'MAX(MIN(f."{col}", {clip_high}), {clip_low})'
        select_parts.append(
            f'SUM(({clamped}) * f."Market Cap") / '
            f'NULLIF(SUM(({clamped}) * 0 + f."Market Cap"), 0) AS "{col}"'
        )

    sql = f"""
        SELECT
            t.{group_col} AS grp,
            CAST(f."Calendar Year" AS INTEGER) AS yr,
            COUNT(DISTINCT f.Ticker) AS ticker_count,
            {", ".join(select_parts)}
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        WHERE t.{group_col} IS NOT NULL
```

**new_string**
```python
    # FX-normalised size weight: convert each filer's Market Cap to USD before
    # weighting so a ¥/₩ cap is not summed against a $ cap at face value. USD and
    # NULL-currency rows weight at 1.0/unit; known currencies convert via the
    # fx_rates LEFT JOIN (alias `x`); an UNKNOWN currency has no rate, so the
    # COALESCE resolves to NULL, the whole weight is NULL, and that row drops from
    # both numerator and denominator (better than pretending a 1:1 rate). Metric
    # VALUES stay untouched — ratios are currency-neutral and never FX-converted.
    weight = _FX_WEIGHT_SQL
    select_parts: list[str] = []
    for tpl in _GROUP_METRIC_DISPLAY:
        col, clip_low, clip_high = tpl[3], tpl[5], tpl[6]
        clamped = f'MAX(MIN(f."{col}", {clip_high}), {clip_low})'
        select_parts.append(
            f'SUM(({clamped}) * ({weight})) / '
            f'NULLIF(SUM(({clamped}) * 0 + ({weight})), 0) AS "{col}"'
        )

    sql = f"""
        SELECT
            t.{group_col} AS grp,
            CAST(f."Calendar Year" AS INTEGER) AS yr,
            COUNT(DISTINCT f.Ticker) AS ticker_count,
            {", ".join(select_parts)}
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"
        WHERE t.{group_col} IS NOT NULL
```

*(The remainder of the WHERE / GROUP BY / ORDER BY block is unchanged.)*

---

## Edit 3 — `backend/industry_averages.py`: constant + parameterized `_avg_exprs`

**old_string**
```python
def _avg_exprs(target_metrics: list[str]) -> str:
    """Build market-cap-weighted average SQL expressions for stored and derived metrics.

    Formula: SUM(value * MarketCap) / SUM(MarketCap)  — only over rows where
    both the metric and Market Cap are non-NULL.

    Denominator trick: `(expr) * 0 + f."Market Cap"` evaluates to NULL whenever
    expr is NULL (so that ticker is excluded from both numerator and denominator),
    and equals Market Cap when expr is valid. This avoids double-counting the
    weight of tickers that are missing a given metric.
    """
    mc    = 'f."Market Cap"'
    parts = []
    for m in target_metrics:
        if m in DERIVED_METRICS:
            expr = DERIVED_METRICS[m]
            parts.append(
                f'SUM(({expr}) * {mc}) /\n'
                f'    NULLIF(SUM(({expr}) * 0 + {mc}), 0) AS "{m}"'
            )
        else:
            col = f'f."{m}"'
            parts.append(
                f'SUM({col} * {mc}) /\n'
                f'    NULLIF(SUM({col} * 0 + {mc}), 0) AS "{m}"'
            )
    return ",\n    ".join(parts)
```

**new_string**
```python
# FX-normalised size weight (see _avg_exprs). Converts each filer's Market Cap to
# USD before weighting so a ¥/₩ cap is not summed against a $ cap at face value.
# USD / NULL currency -> 1.0 per unit; a known currency -> its usd_per_unit; an
# unknown currency -> NULL, so that row drops from both numerator and denominator.
# Any query using this MUST carry:
#     LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"
_FX_WEIGHT_SQL = (
    'f."Market Cap" * COALESCE(x.usd_per_unit, '
    "CASE WHEN f.\"Reported Currency\" = 'USD' "
    "OR f.\"Reported Currency\" IS NULL THEN 1.0 ELSE NULL END)"
)


def _avg_exprs(target_metrics: list[str], weight: str = _FX_WEIGHT_SQL) -> str:
    """Build size-weighted average SQL expressions for stored and derived metrics.

    Formula: SUM(value * weight) / SUM(weight)  — only over rows where both the
    metric and the weight are non-NULL.

    `weight` defaults to `_FX_WEIGHT_SQL`, an FX-normalised USD market cap: a
    company's Market Cap converted to USD so a ¥/₩ cap is not summed against a $
    cap at face value. It resolves to NULL for unknown currencies, so those rows
    drop from both numerator and denominator. Callers MUST include
    `LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"` in the query.
    Metric VALUES are never FX-converted — ratios stay currency-neutral.

    Denominator trick: `(expr) * 0 + weight` evaluates to NULL whenever expr is
    NULL (so that ticker is excluded from both numerator and denominator), and
    equals the weight when expr is valid. This avoids double-counting the weight
    of tickers that are missing a given metric.
    """
    parts = []
    for m in target_metrics:
        if m in DERIVED_METRICS:
            expr = DERIVED_METRICS[m]
            parts.append(
                f'SUM(({expr}) * ({weight})) /\n'
                f'    NULLIF(SUM(({expr}) * 0 + ({weight})), 0) AS "{m}"'
            )
        else:
            col = f'f."{m}"'
            parts.append(
                f'SUM({col} * ({weight})) /\n'
                f'    NULLIF(SUM({col} * 0 + ({weight})), 0) AS "{m}"'
            )
    return ",\n    ".join(parts)
```

## Edit 4 — `backend/industry_averages.py`: JOIN in `_compute_averages`

**old_string**
```python
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        WHERE t.{group_col} IS NOT NULL
        GROUP BY t.{group_col}
        HAVING ticker_count >= {min_tickers}
        ORDER BY t.{group_col}
```

**new_string**
```python
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"
        WHERE t.{group_col} IS NOT NULL
        GROUP BY t.{group_col}
        HAVING ticker_count >= {min_tickers}
        ORDER BY t.{group_col}
```

## Edit 5 — `backend/industry_averages.py`: JOIN in `_compute_averages_by_year`

**old_string**
```python
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        WHERE t.{group_col} IS NOT NULL
          AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
        GROUP BY t.{group_col}, yr
```

**new_string**
```python
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"
        WHERE t.{group_col} IS NOT NULL
          AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
        GROUP BY t.{group_col}, yr
```

---

## NOT touched

- `industry_averages.compute_cape` and `compute_dcf` — latest-year, mostly
  USD-filtered, own `mktcap` weighting. Left exactly as is.
- Any metric VALUE / ratio — currency-neutral, never FX-converted.
- `_ranking_for_industry` / `comparative_endpoint` — already FX-correct.

## Test

`backend/test_phase6_fx_weights.py` — characterization (network-free temp DB).
Reads the CURRENT builders (`_avg_exprs`, `_by_year_with_groups`); if either
still weights by raw local cap the assertions fail (red -> green). All 5 pass
after the patch.

```
cd backend && python -m pytest test_phase6_fx_weights.py -q
```
