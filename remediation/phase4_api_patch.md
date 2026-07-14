# Phase 4 patch — `backend/api.py` (TTM_MODE substitution)

Apply these Edit blocks in order. Each `old_string` is copied verbatim from the
current file. Default `TTM_MODE=off` keeps behavior byte-identical; the feature
is entirely opt-in.

Summary:
- **A.** Put `remediation/` on `sys.path` and `import ttm_lib` (the ONE shared
  implementation of the substitution rule, also used by the tests).
- **B.** Import `EXCEL_COLUMNS` from `financial_db` (drives the overlay column
  set).
- **C.** Module-level flag `TTM_MODE = os.getenv('TTM_MODE', 'off').lower()`.
- **D.** Helpers `_ttm_row(ticker)` (reads the stored TTM row, None when absent)
  and `_latest_or_ttm(rs, ticker)` (the single per-site selection wrapper).
- **E-I.** The five per-company sites: `latest = rs[0]` → `latest =
  _latest_or_ttm(rs, <tk>)`. Nothing else at those sites changes.

Behavior by mode (identical at all five sites):
- `off`   — returns `rs[0]` unchanged (byte-identical to pre-Phase-4).
- `on`    — annual row overlaid with the stored TTM row's metric values, with a
  per-column annual fallback (null TTM column keeps the annual figure, no TTM
  row keeps the whole annual row).
- `shadow`— valuations do NOT move (returns the annual row); the TTM row stays
  retrievable via `_ttm_row(ticker)` / `ttm_lib.ttm_shadow_fields` for
  side-by-side display. This matches the codebase's BETA_RESOLVER shadow
  convention (surface, do not drive).

---

## Edit A — `sys.path` + `import ttm_lib`

```
old_string:
for p in (ROOT / "backend", ROOT / "data"):
    sp = str(p)
    if sp not in sys.path:
        sys.path.insert(0, sp)
```

```
new_string:
for p in (ROOT / "backend", ROOT / "data", ROOT / "remediation"):
    sp = str(p)
    if sp not in sys.path:
        sys.path.insert(0, sp)

import ttm_lib  # noqa: E402 -- pure TTM/latest-row selection logic (Phase 4)
```

---

## Edit B — import `EXCEL_COLUMNS`

```
old_string:
    from financial_db import FinancialDB, fetch_latest_market_cap_yf  # type: ignore
```

```
new_string:
    from financial_db import (  # type: ignore
        FinancialDB, fetch_latest_market_cap_yf, EXCEL_COLUMNS,
    )
```

---

## Edit C — module-level `TTM_MODE` flag

```
old_string:
ENV = os.environ.get("ENV", "development").lower()
IS_PRODUCTION = ENV == "production"
```

```
new_string:
ENV = os.environ.get("ENV", "development").lower()
IS_PRODUCTION = ENV == "production"

# TTM substitution mode for the per-company metric sites (Phase 4).
#   off    -> latest annual row only (byte-identical to pre-Phase-4 behavior)
#   on     -> substitute the stored rolling TTM row (annual fallback per column)
#   shadow -> valuations unchanged; TTM surfaced via _ttm_row for display
TTM_MODE = os.getenv("TTM_MODE", "off").lower()
```

---

## Edit D — `_ttm_row` + `_latest_or_ttm` helpers

Insert immediately before `_company_metrics` (after `_mc_to_usd`).

```
old_string:
    ccy = latest["Reported Currency"] if "Reported Currency" in latest.keys() else None
    return mc * _fx_rates().get(ccy, 1.0) if ccy else mc


def _company_metrics(latest: Any, prior: Any | None) -> dict[str, float | None]:
```

```
new_string:
    ccy = latest["Reported Currency"] if "Reported Currency" in latest.keys() else None
    return mc * _fx_rates().get(ccy, 1.0) if ccy else mc


# ── TTM substitution (Phase 4) ───────────────────────────────────────────────
# Overlay-eligible columns = EXCEL_COLUMNS metrics minus the two currency-bound
# absolute figures (Market Cap / Enterprise Value): the stored TTM snapshot's
# cap comes from yfinance .info and may be in a different currency than the
# annual row's Reported Currency, which _mc_to_usd relies on. Every other metric
# (income / balance / cash flow / currency-neutral ratios) overlays cleanly.
_TTM_METRIC_COLS = ttm_lib.metric_columns(EXCEL_COLUMNS) - {
    "Market Cap", "Enterprise Value",
}


def _ttm_row(ticker: str) -> Any | None:
    """The stored TTM snapshot row for `ticker` (financials_quarterly,
    Period='TTM'), or None when the table or the row is absent. Returns a
    sqlite3.Row (mapping access by column name)."""
    try:
        with db_conn() as conn:
            return conn.execute(
                "SELECT * FROM financials_quarterly "
                "WHERE Ticker = ? AND Period = 'TTM' LIMIT 1",
                (ticker.upper(),),
            ).fetchone()
    except sqlite3.OperationalError:
        return None  # table not created yet


def _latest_or_ttm(rs: list[Any], ticker: str) -> Any:
    """The effective 'latest' row for a company's per-metric calculation.

    off    -> the annual latest row (rs[0]) unchanged (byte-identical).
    on     -> annual overlaid with the stored TTM row's metric values (annual
              fallback when there is no TTM row or a null column).
    shadow -> annual unchanged; valuations never move (TTM via _ttm_row)."""
    latest = rs[0]
    if TTM_MODE == "on":
        return ttm_lib.choose_latest(latest, _ttm_row(ticker), "on",
                                     _TTM_METRIC_COLS)
    return latest  # off / shadow


def _company_metrics(latest: Any, prior: Any | None) -> dict[str, float | None]:
```

---

## Edit E — `_sector_current_metrics` site

```
old_string:
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = rs[0]
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Floor on the USD-converted cap so $100M means the same in every currency;
```

```
new_string:
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = _latest_or_ttm(rs, _tk)
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Floor on the USD-converted cap so $100M means the same in every currency;
```

---

## Edit F — `_industry_metrics_for_sector` site

```
old_string:
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = rs[0]
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Currency-neutral $100M floor on the FX-converted cap (drops no-FX filers).
        mc = cm.get("_mc")
        if mc is None or mc < _AVG_MC_FLOOR_USD:
            continue
        cm.update(_lens_company_metrics(sector, latest, prior, rs))
        ind = latest["ind"]
```

```
new_string:
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = _latest_or_ttm(rs, _tk)
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Currency-neutral $100M floor on the FX-converted cap (drops no-FX filers).
        mc = cm.get("_mc")
        if mc is None or mc < _AVG_MC_FLOOR_USD:
            continue
        cm.update(_lens_company_metrics(sector, latest, prior, rs))
        ind = latest["ind"]
```

---

## Edit G — `_industry_scorecard` site

```
old_string:
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = rs[0]
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Currency-neutral $100M floor on the FX-converted cap (drops no-FX filers).
        mc = cm.get("_mc")
        if mc is None or mc < _AVG_MC_FLOOR_USD:
            continue
        if lens:
            cm.update(_lens_company_metrics(sector, latest, prior, rs))
        comps.append(cm)
```

```
new_string:
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = _latest_or_ttm(rs, _tk)
        prior = rs[1] if len(rs) > 1 else None
        cm = _company_metrics(latest, prior)
        # Currency-neutral $100M floor on the FX-converted cap (drops no-FX filers).
        mc = cm.get("_mc")
        if mc is None or mc < _AVG_MC_FLOOR_USD:
            continue
        if lens:
            cm.update(_lens_company_metrics(sector, latest, prior, rs))
        comps.append(cm)
```

---

## Edit H — `_company_metrics_for_industry` site

The overlay returns a plain dict; `_RowWithMarketCap(latest, live_cap)` on the
next line wraps a dict exactly as it wraps a sqlite Row (`__getitem__` /
`keys()`), so the live-cap override is unaffected.

```
old_string:
    for tk in tickers:  # preserve market-cap order
        rs = by_ticker.get(tk)
        if not rs:
            continue
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = rs[0]
        prior = rs[1] if len(rs) > 1 else None
```

```
new_string:
    for tk in tickers:  # preserve market-cap order
        rs = by_ticker.get(tk)
        if not rs:
            continue
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = _latest_or_ttm(rs, tk)
        prior = rs[1] if len(rs) > 1 else None
```

---

## Edit I — `_ranking_for_industry` site

```
old_string:
    for tk, rs in by_ticker.items():
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = rs[0]
        if _sf(latest, "beta") is None:
            continue  # ranking uses stored betas only — skip a ticker that has none
```

```
new_string:
    for tk, rs in by_ticker.items():
        rs.sort(key=lambda x: int(x["yr"]), reverse=True)
        latest = _latest_or_ttm(rs, tk)
        if _sf(latest, "beta") is None:
            continue  # ranking uses stored betas only — skip a ticker that has none
```

---

## Compatibility notes (why these edits are safe)

- **Dict-vs-Row.** In `on` mode `_latest_or_ttm` returns a plain dict copy of the
  annual row with only metric columns overlaid. Every downstream read is dict-
  and Row-compatible: `_sf`/`_sf_opt` (`row[col]`), `_RowWithMarketCap`
  (`__getitem__` + `keys()`), `_mc_to_usd` (`"Reported Currency" in row.keys()`),
  and `latest["yr"]/["sec"]/["ind"]/["beta"]/["peg"]`. Those alias columns are
  NOT in `EXCEL_COLUMNS`, so they are never in `_TTM_METRIC_COLS` and are always
  preserved from the annual row.
- **`off` is literally `rs[0]`** (the original sqlite Row object), so default
  behavior is byte-identical.
- **`shadow` returns the annual row**, so aggregates and ranking are unchanged.
  Consistent surfacing of TTM across BOTH the aggregate sites (E/F/G, whose
  `_aggregate_weighted_columns` only keeps `metric_keys`) and the per-company
  sites (H/I) is not achievable without redesigning the aggregation contract, so
  shadow deliberately exposes TTM through `_ttm_row` instead of mutating emitted
  metrics. See the decision note in the return doc.
- **No new import cycle.** `ttm_lib` is stdlib-only; `remediation/` is added to
  `sys.path` alongside `backend/` and `data/`.
