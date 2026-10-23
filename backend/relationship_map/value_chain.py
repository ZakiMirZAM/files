"""Value chain and substitute profitability from a READY map (Head to Head B3).

Raw reported figures only, each firm on its OWN fiscal years: the value at
its latest annual year and at exactly five years before (null when that row
or column is missing). No firm is moved onto another firm's year, and no
ratio is FX-converted (CLAUDE.md). The only arithmetic is a true median.
"""

from __future__ import annotations

import statistics
from typing import Any, Optional

MAX_SIDE = 6
YEARS_BACK = 5

# response key -> financials column (ratios as decimals, days as numbers)
COLUMNS: dict[str, str] = {
    "grossMargin": "Gross Profit Ratio",
    "operatingMargin": "Operating Income Ratio",
    "daysReceivable": "Days Sales Outstanding",
    "daysPayable": "Days Payables Outstanding",
}

NOTE = ("Margins are each company's own reported figures; a narrowing gap between a supplier "
        "and a customer may signal a shift in power, so check that it lasts through a full "
        "business cycle.")
NO_MAP = {"applicable": False, "reason": "Build the relationship map first."}


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) else None


def firm_figures(conn: Any, ticker: str) -> Optional[dict[str, Any]]:
    """``{"years": [Y, Y-5], key: [now, fiveYearsAgo], ...}`` on the firm's own
    latest annual year, or None when it has no annual row."""
    cols = ", ".join(f'"{c}"' for c in COLUMNS.values())
    rows = conn.execute(
        f'SELECT CAST("Calendar Year" AS INTEGER) AS yr, {cols} FROM financials'
        ' WHERE Ticker = ? ORDER BY yr', (ticker,),
    ).fetchall()
    by_year = {int(r[0]): r for r in rows if r[0] is not None}
    if not by_year:
        return None
    latest = max(by_year)
    years = [latest, latest - YEARS_BACK]
    out: dict[str, Any] = {"years": years}
    for i, key in enumerate(COLUMNS, start=1):
        vals = [_num(by_year[y][i]) if y in by_year else None for y in years]
        if key in ("daysReceivable", "daysPayable"):
            # A stored 0 days is a missing figure (no firm collects or pays instantly).
            vals = [None if x == 0 else x for x in vals]
        out[key] = vals
    return out


def median_or_none(values: list[Optional[float]]) -> Optional[float]:
    """True median of the non-null values; None when fewer than two."""
    vals = [v for v in values if v is not None]
    return statistics.median(vals) if len(vals) >= 2 else None


def _db_links(v: dict[str, Any], group: str):
    """``(category, link)`` for each in-database link of ``group``, map order."""
    for cat in ((v.get("groups") or {}).get(group) or {}).get("categories") or []:
        for link in cat.get("links") or []:
            if link.get("inDatabase") and link.get("resolvedTicker"):
                yield cat["category"], link


def build_value_chain(conn: Any, ticker: str, v: Optional[dict[str, Any]]) -> dict[str, Any]:
    """The value-chain response for a READY map view ``v`` (None: no map)."""
    if not v or v.get("status") != "ready":
        return dict(NO_MAP)
    ticker = ticker.upper()
    base = firm_figures(conn, ticker)
    rows: list[dict[str, Any]] = []
    if base is not None:
        rows.append({"ticker": ticker, "name": v.get("name") or ticker, "side": "company",
                     "category": None, **base})
    for group, side in (("suppliers", "supplier"), ("customers", "customer")):
        seen: set[str] = {ticker}
        for category, link in _db_links(v, group):
            tk = link["resolvedTicker"]
            if len(seen) > MAX_SIDE or tk in seen:
                continue
            figs = firm_figures(conn, tk)
            if figs is None:
                continue
            seen.add(tk)
            rows.append({"ticker": tk, "name": link["name"], "side": side,
                         "category": category, **figs})

    substitutes: list[dict[str, Any]] = []
    by_cat: dict[str, list[dict[str, Any]]] = {}
    for category, link in _db_links(v, "substitutes"):
        figs = firm_figures(conn, link["resolvedTicker"])
        examples = by_cat.setdefault(category, [])
        if any(e["ticker"] == link["resolvedTicker"] for e in examples):
            continue
        examples.append({"ticker": link["resolvedTicker"], "name": link["name"],
                         "operatingMargin": figs["operatingMargin"][0] if figs else None})
    for category, examples in by_cat.items():
        substitutes.append({
            "category": category, "examples": examples,
            "medianOperatingMargin": median_or_none([e["operatingMargin"] for e in examples]),
        })

    return {
        "applicable": True,
        "years": base["years"] if base else None,
        "rows": rows,
        "substitutes": substitutes,
        "note": NOTE,
    }
