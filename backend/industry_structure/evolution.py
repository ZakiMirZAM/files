"""Evolution: ten-year series (plan 2.8)."""

from __future__ import annotations

from typing import Any, Optional

from industry_structure.helpers import _iqr_of
from industry_structure.panel import (
    NET_ENTRY_REPORTING_LAG,
    IndustryPanel,
    net_entry_window,
)
from industry_structure.peers import PeerSet

# internal series key -> the key the payload publishes it under. One table,
# so adding a series is one line rather than a list, an append and a rename.
_SERIES_KEYS: tuple[tuple[str, str], ...] = (
    ("revenue", "revenue"),
    ("growth", "growth"),
    ("firmCount", "firmCount"),
    ("hhi", "hhi"),
    ("gmIqr", "grossMarginSpread"),
    ("rdIqr", "rdIntensitySpread"),
    ("capexDep", "capexToDepreciation"),
    ("revPpe", "revenueOverPpe"),
)


def _net_entry_series_from_spans(
    ticker_spans: dict[str, tuple[int, int]],
    years: list[int],
    latest_year: int,
    delisted_year: Optional[dict[str, int]] = None,
) -> list[dict[str, Any]]:
    """Net entry per year from pre-computed ticker spans (finding H4).

    For each ticker, first_yr counts as an entry. A last_yr counts as an
    exit only once it is ``NET_ENTRY_REPORTING_LAG`` years behind the
    picked year, or when ``security_map`` says the symbol was delisted
    that year; the last plotted year is therefore the last non-lagging
    one, not the year in which half the industry has simply not filed.
    """
    entries_by_yr: dict[int, int] = {}
    exits_by_yr: dict[int, int] = {}
    delisted = delisted_year or {}
    for tk, (first, last) in ticker_spans.items():
        entries_by_yr[first] = entries_by_yr.get(first, 0) + 1
        exit_yr = delisted.get(tk, last)
        exits_by_yr[exit_yr] = exits_by_yr.get(exit_yr, 0) + 1

    last_plotted = latest_year - NET_ENTRY_REPORTING_LAG
    result: list[dict[str, Any]] = []
    for yr in years:
        if yr > last_plotted:
            continue
        ne = entries_by_yr.get(yr, 0) - exits_by_yr.get(yr, 0)
        result.append({"year": yr, "value": ne})
    return result


def cross_firm_totals_usd(
    firms: list,
) -> tuple[float, float, float]:
    """USD-converted capex, depreciation and PP&E totals across the firms.

    Capital expenditure is stored as a negative outflow, so it is summed as
    a magnitude. PP&E is summed only where it is positive. Each line is
    converted with the firm's own revenue rate, because the totals are
    added across currencies.
    """
    total_capex = sum(
        abs(float(p.ratios["Capital Expenditure"])) * p.usd_per_unit
        for p in firms
        if p.ratios.get("Capital Expenditure") is not None
    )
    total_dep = sum(
        float(p.ratios["Depreciation And Amortization"]) * p.usd_per_unit
        for p in firms
        if p.ratios.get("Depreciation And Amortization") is not None
    )
    total_ppe = sum(
        float(p.ratios["Property Plant Equipment Net"]) * p.usd_per_unit
        for p in firms
        if p.ratios.get("Property Plant Equipment Net") is not None
        and float(p.ratios["Property Plant Equipment Net"]) > 0
    )
    return total_capex, total_dep, total_ppe


def _build_year_series(
    ps: PeerSet,
    prev_rev: Optional[float],
) -> tuple[dict[str, Any], Optional[float]]:
    """Build one year's worth of evolution series data.

    Returns (series_dict, current_total_rev) for chaining.
    """
    firms = ps.peers
    total_rev = sum(p.revenue_usd for p in firms)

    growth = None
    if prev_rev is not None and prev_rev > 0:
        growth = total_rev / prev_rev - 1.0

    gm_vals = [
        float(p.ratios["Gross Profit Ratio"])
        for p in firms
        if p.ratios.get("Gross Profit Ratio") is not None
    ]
    rd_vals = [
        float(p.ratios["Research And Development Expenses"])
        / float(p.ratios["Revenue"])
        for p in firms
        if p.ratios.get("Research And Development Expenses") is not None
        and p.ratios.get("Revenue") is not None
        and float(p.ratios["Revenue"]) > 0
    ]

    total_capex, total_dep, total_ppe = cross_firm_totals_usd(firms)
    cd_ratio = total_capex / total_dep if total_dep > 0 else None
    rp_ratio = total_rev / total_ppe if total_ppe > 0 else None

    hhi = (
        sum((p.revenue_usd / total_rev * 100) ** 2 for p in firms)
        if total_rev > 0 else 0
    )

    gm_iqr = _iqr_of(gm_vals)
    rd_iqr = _iqr_of(rd_vals)

    yr = ps.fiscal_year
    return {
        "revenue": {"year": yr, "value": round(total_rev, 0)},
        "growth": (
            {"year": yr, "value": round(growth, 4)} if growth is not None else None
        ),
        "firmCount": {"year": yr, "value": len(firms)},
        "hhi": {"year": yr, "value": round(hhi, 1)},
        "gmIqr": {
            "year": yr,
            "value": round(gm_iqr, 4) if gm_iqr is not None else None,
        },
        "rdIqr": {
            "year": yr,
            "value": round(rd_iqr, 4) if rd_iqr is not None else None,
        },
        "capexDep": {
            "year": yr,
            "value": round(cd_ratio, 4) if cd_ratio is not None else None,
        },
        "revPpe": {
            "year": yr,
            "value": round(rp_ratio, 4) if rp_ratio is not None else None,
        },
    }, total_rev


def build_evolution(
    panel: IndustryPanel,
    latest_year: int,
) -> dict[str, Any]:
    """Revenue and growth by year, firm count and net entry by year,
    hhi by year, gross margin spread (IQR) by year, R&D intensity spread
    (IQR) by year, total capex over total depreciation by year,
    revenue over PP&E by year.
    """
    start_year = latest_year - 9
    years = sorted(
        yr for yr in panel.by_year if start_year <= yr <= latest_year
    )

    series: dict[str, list[dict[str, Any]]] = {
        internal: [] for internal, _payload in _SERIES_KEYS
    }

    prev_rev: Optional[float] = None
    for yr in years:
        year_series, prev_rev = _build_year_series(panel.by_year[yr], prev_rev)
        for internal, _payload in _SERIES_KEYS:
            point = year_series[internal]
            # Growth has no point in the first plotted year.
            if point is not None:
                series[internal].append(point)

    net_entry_series = _net_entry_series_from_spans(
        panel.ticker_spans, years, latest_year,
        getattr(panel, "delisted_year", None),
    )
    window = net_entry_window(latest_year)

    payload: dict[str, Any] = {
        "netEntryWindow": list(window) if window else None,
        "netEntryRule": (
            "A firm counts as an exit only once its last reported year is "
            f"{NET_ENTRY_REPORTING_LAG} years behind fiscal {latest_year}, or "
            "once security_map marks it delisted. Listings, not firm births. "
            "Coverage widened in 2019, which shows as a large one-off entry "
            "count that year."
        ),
    }
    for internal, published in _SERIES_KEYS:
        payload[published] = series[internal]
        # netEntry is derived from the spans, not from a year slice, but it
        # is published between firmCount and hhi.
        if published == "firmCount":
            payload["netEntry"] = net_entry_series
    return payload
