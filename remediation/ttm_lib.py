"""Pure TTM / latest-row selection logic for the Phase 4 quarterly patch.

Stdlib only, no DB access, no yfinance. Every function is deterministic so it
can be unit tested in isolation (see backend/test_phase4_quarterly.py) and so
that both the FastAPI patch (`backend/api.py#_latest_or_ttm`) and the tests
import ONE implementation of the substitution rule.

Vocabulary
----------
annual : a mapping (sqlite3.Row or dict) for a company's most-recent fiscal
         year. Carries both metric columns (Revenue, Total Assets, ...) and
         alias/identity columns the API adds in its SELECT (yr, sec, ind, beta,
         peg, Reported Currency).
ttm    : the stored TTM snapshot row (financials_quarterly, Period='TTM') or
         None when no snapshot exists.
mode   : the TTM_MODE flag value: 'off' | 'shadow' | 'on'.
"""

from typing import Any, Iterable, Mapping

VALID_TTM_MODES: frozenset[str] = frozenset({"off", "shadow", "on"})

# Columns that identify / label a row rather than carry a financial magnitude.
# These are NEVER overlaid from the TTM row: substituting them would corrupt the
# grouping year, the sector/industry labels, the beta, or the FX currency the
# API relies on downstream. Mirrors the TEXT identity columns declared in
# data/financial_db.py#_init_db plus the year key.
IDENTITY_COLUMNS: frozenset[str] = frozenset({
    "Ticker", "Name", "Sector", "Industry", "Date", "Reported Currency",
    "Period", "Cik", "Filling Date", "Accepted Date", "Calendar Year",
})


def metric_columns(all_columns: Iterable[str],
                   identity: frozenset[str] = IDENTITY_COLUMNS) -> frozenset[str]:
    """The overlay-eligible metric columns: every column that is not an
    identity/label column. Callers pass EXCEL_COLUMNS as `all_columns`."""
    return frozenset(c for c in all_columns if c not in identity)


def _copy(row: Mapping[str, Any]) -> dict[str, Any]:
    """Faithful plain-dict copy of a mapping (sqlite3.Row or dict). A dict is
    fully compatible with the API's downstream row access (`row[col]`,
    `row.keys()`, `_sf`, `_RowWithMarketCap`)."""
    return {k: row[k] for k in row.keys()}


def overlay_ttm(annual: Mapping[str, Any],
                ttm: Mapping[str, Any] | None,
                metric_cols: frozenset[str]) -> dict[str, Any]:
    """Return a dict copy of `annual` with each metric column in `metric_cols`
    replaced by the TTM value when that value is present and non-null.

    Identity/label columns are preserved from `annual` so the grouping year,
    sector/industry, beta and reporting currency stay correct. `ttm=None`
    returns a faithful copy of `annual` (the annual-fallback path)."""
    base = _copy(annual)
    if ttm is None:
        return base
    ttm_keys = set(ttm.keys())
    overlaid = False
    for col in metric_cols:
        if col in ttm_keys:
            val = ttm[col]
            if val is not None:
                base[col] = val
                overlaid = True
    if overlaid:
        # Marker for consumers that must not mix a TTM latest with an annual
        # prior (e.g. operating leverage = YoY OI change / YoY revenue change,
        # a mixed-period ratio when latest is trailing-twelve-month).
        base["_ttm_overlay"] = True
    return base


def choose_latest(annual: Mapping[str, Any],
                  ttm: Mapping[str, Any] | None,
                  mode: str,
                  metric_cols: frozenset[str]) -> dict[str, Any]:
    """Decide the effective 'latest' mapping given the TTM mode.

    - 'on'            : annual overlaid with TTM metric values (annual fallback
                        when `ttm` is None or a given column is null).
    - 'shadow'/'off'  : annual returned unchanged (a copy) so valuations never
                        move. Matches this codebase's BETA_RESOLVER shadow
                        convention (surface, do not drive).
    Any unknown mode is treated as 'off'."""
    if (mode or "off").lower() == "on":
        return overlay_ttm(annual, ttm, metric_cols)
    return _copy(annual)


def ttm_shadow_fields(ttm: Mapping[str, Any] | None,
                      metric_cols: frozenset[str]) -> dict[str, Any]:
    """Side-by-side shadow view: {'ttm_<col>': value} for every metric column
    present and non-null in the TTM row. Empty dict when `ttm` is None. Used by
    shadow-mode consumers that want to display TTM next to the annual figure
    without altering the annual valuation."""
    if ttm is None:
        return {}
    out: dict[str, Any] = {}
    ttm_keys = set(ttm.keys())
    for col in metric_cols:
        if col in ttm_keys and ttm[col] is not None:
            out[f"ttm_{col}"] = ttm[col]
    return out
