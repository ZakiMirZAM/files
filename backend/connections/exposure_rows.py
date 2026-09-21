"""Glue between the industry panel and the exposure table.

Picks the top firms, pulls their 2019/2020/2022 episode figures out of the
panel (zero SQL), and applies the financial-sector guard to the rows.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

from connections._helpers import _safe_float
from connections.episodes import per_ticker_episodes_from_panel
from connections.exposures import EXPOSURE_TOP_N, build_exposures
from connections.financial_guard import (
    EXPOSURE_GUARDED_FIELDS,
    apply_guard,
    is_financial,
)
from industry_structure.panel import IndustryPanel
from industry_structure.peers import PeerSet


def build_exposure_rows(
    conn: sqlite3.Connection,
    industry: str,
    sector: Optional[str],
    now_peers: PeerSet,
    then_peers: Optional[PeerSet],
    panel: Optional[IndustryPanel],
) -> list[dict[str, Any]]:
    shares_now = now_peers.revenue_shares()
    shares_then = then_peers.revenue_shares() if then_peers else None

    sorted_peers = sorted(now_peers.peers, key=lambda p: p.revenue_usd, reverse=True)
    top_tickers = [p.ticker for p in sorted_peers[:EXPOSURE_TOP_N]]

    if panel:
        rev_change_2020, gm_2020, gm_2022 = per_ticker_episodes_from_panel(
            panel, top_tickers,
        )
    else:
        from connections.episodes import _revenue_change_2020, _gross_margins
        rev_change_2020, gm_2020, gm_2022 = {}, {}, {}
        for tk in top_tickers:
            rev_change_2020[tk] = _revenue_change_2020(conn, tk)
            gms = _gross_margins(conn, tk, years=(2020, 2022))
            gm_2020[tk] = _safe_float(gms.get("2020"))
            gm_2022[tk] = _safe_float(gms.get("2022"))

    prior_peers = panel.by_year.get(now_peers.fiscal_year - 1) if panel else None

    rows = build_exposures(
        now_peers,
        top_n=EXPOSURE_TOP_N,
        shares_now=shares_now,
        shares_then=shares_then,
        revenue_change_2020=rev_change_2020,
        gross_margin_2020=gm_2020,
        gross_margin_2022=gm_2022,
        prior_peers=prior_peers,
    )

    financial = is_financial(sector, industry)
    for row in rows:
        apply_guard(row, EXPOSURE_GUARDED_FIELDS, financial=financial)
    return rows
