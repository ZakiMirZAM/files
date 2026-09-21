"""Full industry structure builder (orchestrator).

Loads all peer data in ONE query via ``load_industry_panel``, then
derives every evidence block from the in-memory panel.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

from financial_guard import NOT_APPLICABLE_REASONS, is_financial
from industry_structure.concentration import build_concentration
from industry_structure.entry_exit import build_entry_evidence
from industry_structure.entry_exit import build_exit_evidence
from industry_structure.environment import build_environment_indicators
from industry_structure.evolution import build_evolution
from industry_structure.helpers import sector_of
from industry_structure.panel import net_entry_window, panel_net_entry
from industry_structure.ranks import build_cross_industry_medians
from industry_structure.rivalry import build_rivalry_evidence
from industry_structure.stability import build_share_stability

# The structure payload's own names for the gross-margin family and the
# leaders' cost-of-goods table. Same families the connections guard nulls,
# under the keys this payload uses.
_GUARDED_SCALARS = ("grossMarginMedian", "grossMarginIqr")
_GUARDED_SERIES = ("grossMarginSpread",)
_GUARDED_LEADER_TABLE = "leaderCogsToRevenue5y"


def _null_year_series(series: Any) -> Any:
    """Null the ``value`` of every ``{"year": y, "value": v}`` entry."""
    if not isinstance(series, list):
        return series
    return [{**entry, "value": None} for entry in series]


def _apply_financial_guard(
    payload: dict[str, Any],
    *,
    financial: bool,
) -> None:
    """Mark the payload and null the figures a bank cannot report.

    A bank has no cost of revenue, so its stored gross margin is 1.0 by
    construction and its cost-of-goods line is empty. Those tiles used to
    print 0.0 percent on every bank industry. Keys keep their shape; only
    the numbers go to null, and ``notApplicable`` says why.
    """
    payload["isFinancial"] = bool(financial)
    if not financial:
        payload.setdefault("notApplicable", {})
        return

    entry = payload.get("entryEvidence") or {}
    for key in _GUARDED_SCALARS:
        if key not in entry:
            continue
        current = entry[key]
        # ``grossMarginMedian`` is a {value, percentile} pair; the IQR is a
        # bare number.
        entry[key] = (
            {**current, "value": None, "percentile": None}
            if isinstance(current, dict) else None
        )
    if _GUARDED_LEADER_TABLE in entry and isinstance(entry[_GUARDED_LEADER_TABLE], list):
        entry[_GUARDED_LEADER_TABLE] = [
            {**leader, "years": _null_year_series(leader.get("years"))}
            for leader in entry[_GUARDED_LEADER_TABLE]
        ]

    evolution = payload.get("evolution") or {}
    for key in _GUARDED_SERIES:
        if key in evolution:
            evolution[key] = _null_year_series(evolution[key])

    guarded = _GUARDED_SCALARS + _GUARDED_SERIES + (_GUARDED_LEADER_TABLE,)
    payload["notApplicable"] = {
        k: NOT_APPLICABLE_REASONS[k] for k in guarded if k in NOT_APPLICABLE_REASONS
    }


def build_industry_structure(
    conn: sqlite3.Connection,
    industry: str,
) -> dict[str, Any]:
    """The combined structure endpoint payload.

    Uses a single ``load_industry_panel`` call for all year-slices.
    """
    # Finding M1: one cached panel serves /structure, /group-map and
    # /api/connections, instead of each building its own.
    from connections.sector_cache import get_industry_panel  # noqa: PLC0415

    panel = get_industry_panel(conn, industry)
    ps = panel.by_year.get(panel.fiscal_year) if panel is not None else None
    if panel is None or ps is None:
        # Finding M9: one "no data" shape everywhere. This used to return
        # {"error": ...} with HTTP 200, which the frontend cannot tell
        # apart from a payload.
        return {
            "applicable": False,
            "reason": "No peer data found for this industry",
            "industry": industry,
        }

    five_ago = panel.fiscal_year - 5
    ps_then = panel.by_year.get(five_ago)

    cross_medians = build_cross_industry_medians(conn, panel.fiscal_year)

    net_entry_5y = panel_net_entry(panel, window=5)

    concentration = build_concentration(ps, cross_medians)
    entry = build_entry_evidence(
        ps, cross_medians, net_entry_5y=net_entry_5y, panel=panel,
    )
    exit_ev = build_exit_evidence(ps, cross_medians)
    rivalry = build_rivalry_evidence(
        ps, cross_medians, ps_then=ps_then,
    )
    stability = build_share_stability(ps, ps_then)

    scale_slope = {
        "slope": entry.get("scaleSlope"),
        "r2": entry.get("scaleR2"),
    }
    cagr_val = (
        rivalry["revenueCagr5y"]["value"]
        if rivalry.get("revenueCagr5y") else None
    )

    evolution = build_evolution(panel, panel.fiscal_year)

    env_indicators = build_environment_indicators(
        ps,
        panel=panel,
        scale_slope_result=scale_slope,
        revenue_cagr_5y=cagr_val,
        net_entry_5y=net_entry_5y,
    )

    payload = {
        "applicable": True,
        "reason": None,
        "industry": industry,
        "fiscalYear": panel.fiscal_year,
        "coverage": panel.coverage,
        "firmCount": len(ps.peers),
        "duplicateListingsDropped": ps.duplicate_listings_dropped,
        "netEntryWindow": list(net_entry_window(panel.fiscal_year) or ()) or None,
        "concentration": concentration,
        "entryEvidence": entry,
        "exitEvidence": exit_ev,
        "rivalryEvidence": rivalry,
        "shareStability": stability,
        "evolution": evolution,
        "environmentIndicators": env_indicators,
    }
    _apply_financial_guard(
        payload,
        financial=is_financial(
            sector_of(conn, industry), industry, include_real_estate=False,
        ),
    )
    return payload
