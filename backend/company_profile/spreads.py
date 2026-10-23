"""Benchmark spread table (plan 5.2).

One row per metric in ``api.py#_BENCHMARK_KEY_MAP``: the company's value, its
industry median, its strategic-group median, the gap against each, and the
company's rank and count among the industry's companies.

UNITS. Every number in this table is in the SAME units the
``/api/individual/{ticker}/benchmarks`` endpoint already returns, because
every number comes from the same producer: ``api.py#_company_metrics``, run
once per company. Those are DISPLAY units — a percent metric arrives as
``5.0``, not ``0.05`` (CLAUDE.md, "DISPLAY-UNIT trap"). Nothing in this
module rescales anything, so a decimal figure can never land in the same
column as a display figure. ``backend/company_profile/UNITS.md`` names the
unit of every key.

The medians here are true medians of the per-company values, matching how
the group median has to be computed; the weighted matrix columns the
benchmarks sidebar shows are carried alongside as ``industryWeighted`` and
``sectorWeighted`` so the two surfaces reconcile instead of disagreeing
under one name.

Sorting, and picking the eight metrics whose rank sits furthest from the
middle, are frontend concerns. This returns the whole table.
"""

from __future__ import annotations

from typing import Any, Optional

from company_profile.common import (
    group_data_note,
    median_of,
    r6,
    rank_desc,
    safe_float,
)


def build_spread_table(
    ticker: str,
    peer_values: dict[str, dict[str, Optional[float]]],
    group_members: set[str],
    labels: dict[str, str],
    units: dict[str, Optional[str]],
    *,
    industry_weighted: Optional[dict[str, Optional[float]]] = None,
    sector_weighted: Optional[dict[str, Optional[float]]] = None,
    group_label: Optional[str] = None,
    industry: Optional[str] = None,
    sector: Optional[str] = None,
    fiscal_year: Optional[int] = None,
) -> dict[str, Any]:
    """Build the full spread table from one per-company metric map.

    ``peer_values`` is ``{ticker: {metric_key: display_value}}`` for every
    company in the ranked industry set, INCLUDING the company itself — the
    company's own column must be in the map, or it could not be ranked
    against it. ``group_members`` is the subset of those tickers that share
    the company's strategic group.

    Every figure for a given metric comes from the same producer, so the
    company value, the medians and the ranked values are commensurable by
    construction. There is no second path.
    """
    ticker = ticker.upper()
    peer_values = {t.upper(): v for t, v in peer_values.items()}
    group_members = {t.upper() for t in group_members}
    company_col = peer_values.get(ticker, {})

    industry_weighted = industry_weighted or {}
    sector_weighted = sector_weighted or {}

    metric_keys = sorted({k for col in peer_values.values() for k in col} | set(labels))

    metrics: dict[str, dict[str, Any]] = {}
    for key in metric_keys:
        pairs = [(t, col.get(key)) for t, col in peer_values.items()]
        reported = [v for _t, v in pairs if safe_float(v) is not None]
        if not reported and safe_float(company_col.get(key)) is None:
            continue

        company_val = safe_float(company_col.get(key))
        industry_med = median_of([v for _t, v in pairs])
        group_med = median_of([
            peer_values[t].get(key) for t in group_members if t in peer_values
        ])
        ind_w = safe_float(industry_weighted.get(key))
        sec_w = safe_float(sector_weighted.get(key))

        def _gap(other: Optional[float]) -> Optional[float]:
            if company_val is None or other is None:
                return None
            return round(company_val - other, 6)

        ranking = rank_desc(pairs, ticker)

        metrics[key] = {
            "label": labels.get(key, key),
            "unit": units.get(key),
            "company": r6(company_val),
            "industryMedian": r6(industry_med),
            "groupMedian": r6(group_med),
            "industryWeighted": r6(ind_w),
            "sectorWeighted": r6(sec_w),
            "gapIndustry": _gap(industry_med),
            "gapGroup": _gap(group_med),
            "gapSector": _gap(sec_w),
            "rank": ranking["rank"],
            "count": ranking["count"],
        }

    group_firm_count = len(group_members & set(peer_values)) or None

    return {
        "applicable": True,
        "ticker": ticker,
        "industry": industry,
        "sector": sector,
        "metrics": metrics,
        "groupLabel": group_label,
        "groupFirmCount": group_firm_count,
        "peerCount": len(peer_values),
        "fiscalYear": fiscal_year,
        "dataNote": group_data_note(group_firm_count),
        "unitsNote": (
            "Values are in the display units of the benchmarks endpoint: "
            "metrics marked % are already multiplied by 100."
        ),
    }


# A year's median needs at least this many firms reporting that year; below it
# the median is null rather than, say, the company's own value (one filer).
MIN_HISTORY_REPORTERS = 3


def build_spread_history(
    ticker: str,
    peer_history: dict[str, dict[str, dict[int, float]]],
    group_members: set[str],
    *,
    max_years: int = 5,
) -> dict[str, list[dict[str, Any]]]:
    """Per metric, the company's value and the industry and group medians for
    each of the company's last ``max_years`` reported years.

    ``peer_history`` is ``{ticker: {metric_key: {year: display_value}}}`` for
    every firm in the ranked set, INCLUDING the company. The medians are the
    same true medians ``build_spread_table`` takes, applied to one year at a
    time over whichever firms reported that year, with how many did. A median
    over fewer than ``MIN_HISTORY_REPORTERS`` firms is null. Nothing is rescaled.
    """
    ticker = ticker.upper()
    peer_history = {t.upper(): h for t, h in peer_history.items()}
    group_members = {t.upper() for t in group_members}
    company = peer_history.get(ticker, {})

    out: dict[str, list[dict[str, Any]]] = {}
    for key in sorted(company):
        years = sorted(company[key])[-max_years:]
        rows = []
        for y in years:
            industry_vals = [
                v for v in (h.get(key, {}).get(y) for h in peer_history.values())
                if safe_float(v) is not None
            ]
            group_vals = [
                v for v in (
                    peer_history[t].get(key, {}).get(y)
                    for t in group_members if t in peer_history
                )
                if safe_float(v) is not None
            ]
            rows.append({
                "year": y,
                "company": r6(safe_float(company[key].get(y))),
                "industryMedian": (
                    r6(median_of(industry_vals))
                    if len(industry_vals) >= MIN_HISTORY_REPORTERS else None
                ),
                "groupMedian": (
                    r6(median_of(group_vals))
                    if len(group_vals) >= MIN_HISTORY_REPORTERS else None
                ),
                "industryCount": len(industry_vals),
                "groupCount": len(group_vals),
            })
        if rows:
            out[key] = rows
    return out
