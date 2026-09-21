"""Peer-set loading for industry structure analysis.

Mirrors the peer-selection rules of ``_ranking_for_industry`` in
``backend/api.py`` (L5279-5330): PRIMARY listings only, share-class
exclusion via ``NOT GLOB '*-P[A-Z]'``, USD-converted revenue via the
``fx_rates`` table, with the same NULL/USD currency contract as
``_FX_SPOT_MC_SQL``.

Four queries need that recipe (``load_peers``, ``load_sector_peers``,
``panel.load_industry_panel``, ``ranks._cross_industry_sql``). It is built
once here by ``peer_from_where`` and turned into ``Peer`` objects by
``_row_to_peer``, so the four cannot drift apart.

Implements Rule A items 1-3 and 7 of the approved plan.
"""

from __future__ import annotations

import sqlite3
import statistics
from dataclasses import dataclass, field
from typing import Any, Optional

from industry_structure.dedupe import dedupe_listings


# ── Data classes ────────────────────────────────────────────────────────────

@dataclass
class Peer:
    """One company in a peer set."""
    ticker: str
    name: str
    revenue_usd: float
    revenue_local: float
    reported_currency: str
    calendar_year: int
    # Raw ratio columns carried for downstream use
    ratios: dict[str, Any] = field(default_factory=dict)
    # The company's industry. Populated by the SECTOR loader, where rows of
    # many industries are mixed and the profit pool needs to split them
    # again (finding H6). None on industry-scoped loads, where it is the
    # peer set's own ``group_name``.
    industry: Optional[str] = None
    # USD per one unit of reported currency (revenue_usd / revenue_local).
    # Used to convert local-currency balance-sheet items to USD for
    # cross-firm aggregation (capex, dep, PP&E sums in evolution/environment).
    usd_per_unit: float = 1.0
    # ``security_map.cik``, when the symbol has one. Two different CIKs are
    # two SEC registrants, which is what keeps ``dedupe_listings`` from
    # collapsing them.
    cik: Optional[str] = None


@dataclass
class PeerSet:
    """A resolved set of peers for an industry or sector."""
    peers: list[Peer]
    fiscal_year: int
    group_name: str  # industry or sector name
    # How many cross-listed duplicate lines were collapsed into a single
    # firm for this year (finding H2). Zero when nothing was dropped.
    duplicate_listings_dropped: int = 0

    @property
    def total_revenue_usd(self) -> float:
        return sum(p.revenue_usd for p in self.peers)

    def revenue_shares(self) -> dict[str, float]:
        """Revenue share per ticker (Rule A item 2)."""
        total = self.total_revenue_usd
        if total <= 0:
            return {}
        return {p.ticker: p.revenue_usd / total for p in self.peers}

    def cr4(self) -> float:
        """Concentration ratio: sum of four largest shares (Rule A item 3)."""
        shares = sorted(self.revenue_shares().values(), reverse=True)
        return sum(shares[:4])

    def cr8(self) -> float:
        """Concentration ratio: sum of eight largest shares."""
        shares = sorted(self.revenue_shares().values(), reverse=True)
        return sum(shares[:8])

    def hhi(self) -> float:
        """Herfindahl-Hirschman Index: sum of squared pct shares (Rule A item 3).

        Four firms at 30, 30, 20, 20 give 2600.
        """
        shares = self.revenue_shares()
        return sum((s * 100) ** 2 for s in shares.values())


# ── Column names we read ────────────────────────────────────────────────────

_RATIO_COLS = (
    "Revenue",
    "Operating Income",
    "Gross Profit",
    "Gross Profit Ratio",
    "Interest Expense",
    "Total Debt",
    "EBITDA",
    "Net Income",
    "Market Cap",
    "Reported Currency",
    "Total Assets",
    "Total Stockholders Equity",
    "Net Debt",
    "Depreciation And Amortization",
    "Capital Expenditure",
    "Research And Development Expenses",
    "Selling General And Administrative Expenses",
    "Cost Of Revenue",
    "Property Plant Equipment Net",
    "Intangible Assets",
    # "Operating Cash Flow" and "Cash And Cash Equivalents" were carried on
    # every peer row of every year and read by nothing (finding M2).
    # "Cash And Short Term Investments" is the cash measure the entry
    # evidence actually uses.
    "Cash And Short Term Investments",
    # Read by value_system._days_series_from_panel, which plots the medians
    # by year. Not dead.
    "Days Payables Outstanding",
    "Days Sales Outstanding",
    "Free Cash Flow",
)


def _usd_rate_expr() -> str:
    """SQL expression for the USD conversion rate.

    Same contract as ``_FX_SPOT_MC_SQL`` in ``api.py``:
    - known currency -> fx_rates.usd_per_unit
    - USD or NULL currency -> 1.0
    - unknown currency -> NULL (row drops)

    A row with NULL Reported Currency is dropped (HARD RULE).
    """
    return (
        'COALESCE(x.usd_per_unit, '
        "CASE WHEN f.\"Reported Currency\" = 'USD' THEN 1.0 ELSE NULL END)"
    )


def _revenue_usd_expr() -> str:
    """Revenue converted to USD."""
    return f'f."Revenue" * {_usd_rate_expr()}'


# ── The one peer-set recipe ─────────────────────────────────────────────────

_GROUP_COLS = ("industry", "sector")


def _check_group_col(group_col: str) -> str:
    if group_col not in _GROUP_COLS:
        raise ValueError(f"unsupported group column: {group_col}")
    return group_col


def peer_columns(*, with_industry: bool = False) -> str:
    """The identity columns every peer query selects, before its ratios."""
    cols = [
        "f.Ticker",
        "t.name AS t_name",
        f"{_revenue_usd_expr()} AS rev_usd",
        'f."Revenue" AS rev_local',
        'f."Reported Currency" AS ccy',
        'CAST(f."Calendar Year" AS INTEGER) AS yr',
        "s.cik AS cik",
    ]
    if with_industry:
        cols.insert(2, "t.industry AS t_industry")
    return ", ".join(cols)


def peer_from_where(
    *,
    group_col: Optional[str] = None,
    year: bool = False,
) -> str:
    """The FROM/JOIN/WHERE block shared by every peer-row query.

    Bind order is ``(group_value, year)`` for whichever of the two the
    caller asked for.
    """
    parts = [
        " FROM financials f",
        " JOIN tickers t ON t.ticker = f.Ticker",
        ' LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"',
        " LEFT JOIN security_map s ON s.symbol = f.Ticker",
        " WHERE COALESCE(s.is_primary, 1) = 1",
        " AND f.Ticker NOT GLOB '*-P[A-Z]'",
    ]
    if group_col is not None:
        parts.append(f" AND t.{_check_group_col(group_col)} = ?")
    if year:
        parts.append(' AND CAST(f."Calendar Year" AS INTEGER) = ?')
    parts += [
        ' AND f."Reported Currency" IS NOT NULL',
        ' AND f."Revenue" IS NOT NULL AND f."Revenue" > 0',
        " AND rev_usd IS NOT NULL",
    ]
    return "".join(parts)


def _ratio_select() -> str:
    return ", ".join(f'f."{c}"' for c in _RATIO_COLS)


def _row_to_peer(
    row: Any,
    year: int,
    *,
    ratios: Optional[dict[str, Any]] = None,
    name: Optional[str] = None,
    industry: Optional[str] = None,
) -> Peer:
    """One ``Peer`` from one row of a ``peer_from_where`` query.

    ``ratios`` defaults to the ``_RATIO_COLS`` slice of the row; the
    cross-industry pass in ``ranks.py`` selects a narrower column list and
    passes its own.
    """
    keys = row.keys()
    if ratios is None:
        ratios = {c: row[c] if c in keys else None for c in _RATIO_COLS}
    rev_usd = float(row["rev_usd"])
    rev_local = float(row["rev_local"])
    return Peer(
        ticker=row["Ticker"],
        name=name if name is not None else (row["t_name"] or row["Ticker"]),
        revenue_usd=rev_usd,
        revenue_local=rev_local,
        reported_currency=row["ccy"],
        calendar_year=year,
        ratios=ratios,
        industry=industry,
        usd_per_unit=rev_usd / rev_local if rev_local != 0 else 1.0,
        cik=row["cik"] if "cik" in keys else None,
    )


# ── Core loaders ────────────────────────────────────────────────────────────

# Six years, so a group whose latest two years are still filling in does not
# fall back onto a stale year (finding M6).
PICK_YEAR_LOOKBACK = 6


def pick_year_detail(
    conn: sqlite3.Connection,
    group_val: str,
    *,
    group_col: str = "industry",
    lookback: int = PICK_YEAR_LOOKBACK,
) -> Optional[dict[str, Any]]:
    """Latest fiscal year with at least 80% peer coverage (Rule A item 1).

    Looks at the last ``lookback`` years. The 80% threshold is relative to
    the best-covered year among those.

    Returns ``{fiscalYear, firms, bestFirms, coverage}`` where ``coverage``
    is the picked year's firm count over the best-covered year's, or None
    when no year qualifies.
    """
    _check_group_col(group_col)
    # The four-digit filter is a range test, not a GLOB, and deliberately
    # carries NO cast. "Calendar Year" is an INTEGER column and the second
    # column of the table's primary key, so the bare range is answered from
    # the covering index; GLOB (and a CAST) force a text rendering of every
    # row instead. Measured on the live warehouse inside this very query:
    # 760 ms for the GLOB, 639 ms with a CAST, 31 ms bare. The bare range
    # and the GLOB were verified row-identical over all 363,552 rows (zero
    # symmetric difference), and every write path is gated by
    # ``financial_db.is_valid_year_period``, so a junk year cannot appear.
    rows = conn.execute(
        'SELECT CAST(f."Calendar Year" AS INTEGER) AS yr, COUNT(DISTINCT f.Ticker) AS n'
        " FROM financials f"
        " JOIN tickers t ON t.ticker = f.Ticker"
        " LEFT JOIN security_map s ON s.symbol = f.Ticker"
        f" WHERE t.{group_col} = ?"
        " AND COALESCE(s.is_primary, 1) = 1"
        " AND f.Ticker NOT GLOB '*-P[A-Z]'"
        ' AND f."Calendar Year" BETWEEN 1000 AND 9999'
        ' AND f."Revenue" IS NOT NULL AND f."Revenue" > 0'
        ' AND f."Reported Currency" IS NOT NULL'
        " GROUP BY yr"
        " ORDER BY yr DESC"
        f" LIMIT {int(lookback)}",
        (group_val,),
    ).fetchall()
    if not rows:
        return None
    best = max(r["n"] for r in rows)
    threshold = best * 0.8
    for r in sorted(rows, key=lambda r: r["yr"], reverse=True):
        if r["n"] >= threshold:
            return {
                "fiscalYear": int(r["yr"]),
                "firms": int(r["n"]),
                "bestFirms": int(best),
                "coverage": round(r["n"] / best, 4) if best else None,
            }
    return None


def pick_year(
    conn: sqlite3.Connection,
    industry: str,
    *,
    lookback: int = PICK_YEAR_LOOKBACK,
) -> Optional[int]:
    """The picked fiscal year for an industry (see ``pick_year_detail``)."""
    detail = pick_year_detail(conn, industry, lookback=lookback)
    return detail["fiscalYear"] if detail else None


def _load_group_peers(
    conn: sqlite3.Connection,
    group_col: str,
    group_val: str,
    year: int,
    *,
    carry_industry: bool,
) -> Optional[PeerSet]:
    """One year of one industry or sector, de-duplicated."""
    sql = (
        "SELECT " + peer_columns(with_industry=carry_industry)
        + ", " + _ratio_select()
        + peer_from_where(group_col=group_col, year=True)
        + " ORDER BY rev_usd DESC"
    )
    rows = conn.execute(sql, (group_val, year)).fetchall()
    if not rows:
        return None

    peers = [
        _row_to_peer(
            r, year,
            industry=r["t_industry"] if carry_industry else None,
        )
        for r in rows
    ]
    peers, dropped = dedupe_listings(peers)
    return PeerSet(
        peers=peers, fiscal_year=year, group_name=group_val,
        duplicate_listings_dropped=dropped,
    )


def load_peers(
    conn: sqlite3.Connection,
    industry: str,
    *,
    year: Optional[int] = None,
) -> Optional[PeerSet]:
    """Load the peer set for an industry (Rule A item 1).

    Uses PRIMARY listings only and USD-converted revenue, mirroring
    ``_ranking_for_industry`` in ``api.py`` (L5279-5330).

    A row with a missing Reported Currency is dropped (HARD RULE).
    Zero or negative revenue rows are excluded (HARD RULE).
    """
    if year is None:
        year = pick_year(conn, industry)
    if year is None:
        return None
    return _load_group_peers(
        conn, "industry", industry, year, carry_industry=False,
    )


def load_sector_peers(
    conn: sqlite3.Connection,
    sector: str,
    year: int,
) -> Optional[PeerSet]:
    """Load the peer set for an entire sector at a given year.

    Same rules as ``load_peers`` but grouped by sector. The industry label
    rides along on each peer, because the profit pool has to split the rows
    again (finding H6).
    """
    return _load_group_peers(
        conn, "sector", sector, year, carry_industry=True,
    )


def load_peers_at_year(
    conn: sqlite3.Connection,
    industry: str,
    year: int,
) -> Optional[PeerSet]:
    """Load peers for a specific year (used for share-change calculations)."""
    return load_peers(conn, industry, year=year)


# ── Concentration helpers ───────────────────────────────────────────────────

def top5_share_change_detail(
    now: PeerSet,
    then: PeerSet,
) -> dict[str, Optional[float]]:
    """Average absolute change in the five largest firms' shares (Rule A item 7).

    Restricted to firms present in BOTH years (finding H3): a firm that did
    not exist five years ago used to be credited with its whole current
    share, which read as instability that never happened. This is the same
    restriction ``shareRankCorrelation5y`` already applies.

    Returns ``{value, firmsCompared}`` with the value in percentage points.
    """
    shares_now = now.revenue_shares()
    shares_then = then.revenue_shares()
    common = set(shares_now) & set(shares_then)

    top5 = sorted(common, key=lambda t: shares_now[t], reverse=True)[:5]

    changes = [abs(shares_now[t] - shares_then[t]) * 100 for t in top5]
    if not changes:
        return {"value": None, "firmsCompared": 0}
    return {"value": statistics.mean(changes), "firmsCompared": len(changes)}


def top5_share_change(
    now: PeerSet,
    then: PeerSet,
) -> Optional[float]:
    """``top5_share_change_detail(...)["value"]``."""
    return top5_share_change_detail(now, then)["value"]
