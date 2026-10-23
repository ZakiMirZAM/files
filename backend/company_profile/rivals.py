"""Competitor analysis: capability table and rival picker (plan 3.4).

``get_rival_capabilities(conn, ticker, rivals, now_peers, sector)`` returns the
capability table for the company and up to three rivals (each validated as a
member of the same industry panel). ``list_group_rivals(...)`` returns the
members of the company's strategic group ordered by revenue, for the picker.

Sustainable growth is Porter's form:

    margin x asset turnover x assets/equity x share of earnings retained

Every factor is local currency over local currency, or a pure count, so the
product is currency-neutral and a TWD filer is not compared on an FX-mixed
figure (CLAUDE.md: "never FX-convert a ratio"). Retention needs the dividend
figure, which is NOT in ``peers._RATIO_COLS``, so it is read from the
``financials`` row of the SAME fiscal year the peer set was built on — the
peer set is one year for every firm, so the table never mixes years.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

from industry_structure.peers import PeerSet, load_peers_at_year
from industry_structure.dimensions import (
    AXIS_REGISTRY,
    axis_value,
    compute_industry_medians,
)

from company_profile.common import (
    cogs_plus_sga as _cogs_plus_sga,
    company_groups,
    group_data_note,
    r6,
    safe_div,
    safe_float,
)

MAX_RIVALS = 3


# ── Dividends: the one figure the peer ratios do not carry ──────────────────

def dividends_and_earnings(
    conn: Optional[sqlite3.Connection],
    tickers: list[str],
    fiscal_year: int,
) -> dict[str, dict[str, Optional[float]]]:
    """{ticker: {"dividendsPaid": x, "netIncome": y}} for one fiscal year.

    ``Dividends Paid`` is stored as a cash OUTFLOW (negative); the retention
    formula wants it as a positive amount, so the sign is taken off here, once.
    Both figures come off the same row as the peer's ratios, so retention is
    fiscal-year aligned with margin, turnover and leverage.
    """
    out: dict[str, dict[str, Optional[float]]] = {}
    if conn is None or not tickers:
        return out
    placeholders = ",".join("?" for _ in tickers)
    try:
        rows = conn.execute(
            'SELECT f.Ticker AS tk, f."Dividends Paid" AS dp, f."Net Income" AS ni'
            " FROM financials f"
            f" WHERE UPPER(f.Ticker) IN ({placeholders})"
            ' AND CAST(f."Calendar Year" AS INTEGER) = ?',
            (*[t.upper() for t in tickers], int(fiscal_year)),
        ).fetchall()
    except sqlite3.Error:
        return out
    for r in rows:
        dp = safe_float(r["dp"])
        out[str(r["tk"]).upper()] = {
            "dividendsPaid": abs(dp) if dp is not None else None,
            "netIncome": safe_float(r["ni"]),
        }
    return out


def _retention(
    dividends_paid: Optional[float],
    net_income: Optional[float],
) -> Optional[float]:
    """Share of earnings retained = 1 - dividends paid / net income.

    ``None`` when earnings are not positive: a loss makes the payout ratio
    meaningless (a dividend paid out of a loss gives a retention above 1 that
    would inflate the product), and Porter's identity assumes earnings that
    can be retained. A retention outside 0 to 1 that comes from POSITIVE
    earnings (a firm paying out more than it earned) is returned as computed
    and NOT clamped — clamping would silently invent a number.
    """
    ni = safe_float(net_income)
    dp = safe_float(dividends_paid)
    if ni is None or ni <= 0 or dp is None:
        return None
    return 1.0 - (dp / ni)


def sustainable_growth(
    revenue: Any,
    net_income: Any,
    total_assets: Any,
    equity: Any,
    dividends_paid: Optional[float],
) -> tuple[Optional[float], dict[str, Optional[float]]]:
    """Porter's sustainable growth and its four factors.

    Returns ``(product, factors)``. The product is exactly the four factors
    multiplied — no rounding between them, no substitution of a missing
    factor by 1. It is ``None`` when any factor is missing, when equity is
    not positive (assets/equity would flip sign), or when net income is not
    positive (see ``_retention``).
    """
    margin = safe_div(net_income, revenue)
    turnover = safe_div(revenue, total_assets)
    assets_over_equity = safe_div(total_assets, equity)
    retention = _retention(dividends_paid, net_income)

    factors: dict[str, Optional[float]] = {
        "margin": r6(margin),
        "assetTurnover": r6(turnover),
        "assetsOverEquity": r6(assets_over_equity),
        "retention": r6(retention),
    }

    eq = safe_float(equity)
    ni = safe_float(net_income)
    if eq is None or eq <= 0 or ni is None or ni <= 0:
        return None, factors
    if margin is None or turnover is None or assets_over_equity is None or retention is None:
        return None, factors
    product = margin * turnover * assets_over_equity * retention
    return r6(product), factors


# ── Capability rows ─────────────────────────────────────────────────────────

def _cash_months_of_operating_costs(ratios: dict[str, Any]) -> Optional[float]:
    """Cash and short-term investments over one month of cash operating costs.

    Operating costs are ``Revenue - Operating Income``: every cost the firm
    ran through operations, which is defined for a bank and a REIT as well as
    for a manufacturer, and never depends on a COGS line that may be absent.
    Depreciation and amortization are added back when reported, because this
    is a runway figure and a non-cash charge does not consume cash. ``None``
    when either input is missing or the remaining cash cost is not positive.
    """
    rev = safe_float(ratios.get("Revenue"))
    op_inc = safe_float(ratios.get("Operating Income"))
    cash = safe_float(ratios.get("Cash And Short Term Investments"))
    if rev is None or op_inc is None or cash is None:
        return None
    op_costs = rev - op_inc
    da = safe_float(ratios.get("Depreciation And Amortization"))
    if da is not None and da > 0:
        op_costs -= da
    if op_costs <= 0:
        return None
    return cash / (op_costs / 12.0)


def _capex_to_depreciation(ratios: dict[str, Any]) -> Optional[float]:
    """|Capital Expenditure| / |D&A|.

    Capital expenditure is stored as a negative cash outflow and D&A as a
    positive charge, but neither sign is guaranteed across the dataset, so
    both are taken as magnitudes and the ratio is always non-negative.
    """
    capex = safe_float(ratios.get("Capital Expenditure"))
    dep = safe_float(ratios.get("Depreciation And Amortization"))
    if capex is None or dep is None or dep == 0:
        return None
    return abs(capex) / abs(dep)


def _pos_div(a: Any, b: Any) -> Optional[float]:
    """a / b, or None when either is missing or the denominator is <= 0.

    Stricter than ``safe_div``: a negative equity or capital base flips the
    sign of the ratio, so it is withheld rather than published."""
    fb = safe_float(b)
    if fb is None or fb <= 0:
        return None
    return safe_div(a, fb)


def _return_on_capital(ratios: dict[str, Any]) -> Optional[float]:
    """Operating Income / (Total Debt - Cash And Short Term Investments + Equity).

    Missing debt or cash is missing data, not zero, so the figure is None."""
    debt = safe_float(ratios.get("Total Debt"))
    cash = safe_float(ratios.get("Cash And Short Term Investments"))
    equity = safe_float(ratios.get("Total Stockholders Equity"))
    if debt is None or cash is None or equity is None:
        return None
    return _pos_div(ratios.get("Operating Income"), debt - cash + equity)


def _capability_row(
    peer: Any,
    dividends_paid: Optional[float] = None,
) -> dict[str, Any]:
    """One firm's row of the capability table (plan 3.4). Raw figures only."""
    r = peer.ratios
    product, factors = sustainable_growth(
        r.get("Revenue"),
        r.get("Net Income"),
        r.get("Total Assets"),
        r.get("Total Stockholders Equity"),
        dividends_paid,
    )
    return {
        "ticker": peer.ticker,
        "name": peer.name,
        "cogsAndSgaToRevenue": r6(_cogs_plus_sga(r)),
        "cashToAssets": r6(safe_div(
            r.get("Cash And Short Term Investments"), r.get("Total Assets"),
        )),
        "debtToEquity": r6(safe_div(
            r.get("Total Debt"), r.get("Total Stockholders Equity"),
        )),
        "fcfToRevenue": r6(safe_div(r.get("Free Cash Flow"), r.get("Revenue"))),
        "sustainableGrowth": product,
        "sustainableGrowthFactors": factors,
        "cashMonthsOfOpCosts": r6(_cash_months_of_operating_costs(r)),
        "capexToDepreciation": r6(_capex_to_depreciation(r)),
        "reportedCurrency": peer.reported_currency,
        # Head to Head (DuPont legs + return on capital). Local over local,
        # so currency-neutral; null when a denominator is not positive.
        "netMargin": r6(_pos_div(r.get("Net Income"), r.get("Revenue"))),
        "assetTurnover": r6(_pos_div(r.get("Revenue"), r.get("Total Assets"))),
        "equityMultiplier": r6(_pos_div(
            r.get("Total Assets"), r.get("Total Stockholders Equity"),
        )),
        "roe": r6(_pos_div(r.get("Net Income"), r.get("Total Stockholders Equity"))),
        "returnOnCapital": r6(_return_on_capital(r)),
        # An AMOUNT in USD (converted through fx_rates by the peer loader).
        "revenueUsd": r6(getattr(peer, "revenue_usd", None)),
    }


def _industry_axis_medians(now_peers: PeerSet) -> dict[str, Optional[float]]:
    """Industry medians the cost-position and price-policy axes need.

    The same call ``industry_structure/groups.py`` makes, so the axis values
    in this table and on the group map are measured against one median.
    """
    return compute_industry_medians(
        [{"ticker": p.ticker, "ratios": p.ratios} for p in now_peers.peers],
    )


def _axis_values_row(
    peer: Any,
    industry_medians: dict[str, Optional[float]],
) -> dict[str, Optional[float]]:
    """All seven dimension values for a firm's "current strategy" column."""
    return {
        key: r6(axis_value(peer.ratios, key, industry_medians))
        for key in AXIS_REGISTRY
    }


# ── Entry points ────────────────────────────────────────────────────────────

def validate_rivals(
    ticker: str,
    rivals: list[str],
    now_peers: PeerSet,
) -> tuple[list[str], Optional[dict[str, Any]]]:
    """Normalize and check the rival list. Returns ``(rivals, error_or_None)``.

    Order is preserved, duplicates and the company itself are dropped BEFORE
    the count is checked, so asking for ``AAPL,MSFT,MSFT`` is two rivals and
    not a rejection. Callers are expected to have run each ticker through
    ``api.py#_resolve_symbol`` already, so an alias (``BRK.B``) arrives as its
    primary listing and matches the peer panel.
    """
    ticker = ticker.upper()
    peer_tickers = {p.ticker.upper() for p in now_peers.peers}

    if ticker not in peer_tickers:
        return [], {
            "applicable": False,
            "reason": f"{ticker} is not in its industry's peer panel",
            "status": 404,
        }

    seen: set[str] = {ticker}
    cleaned: list[str] = []
    for raw in rivals:
        rv = raw.strip().upper()
        if not rv or rv in seen:
            continue
        seen.add(rv)
        cleaned.append(rv)

    if len(cleaned) > MAX_RIVALS:
        return [], {
            "applicable": False,
            "reason": f"Maximum {MAX_RIVALS} rivals allowed",
            "status": 400,
        }

    invalid = [rv for rv in cleaned if rv not in peer_tickers]
    if invalid:
        return [], {
            "applicable": False,
            "reason": f"Rivals not in this industry: {', '.join(invalid)}",
            "status": 400,
        }
    return cleaned, None


SHARE_YEAR_OFFSETS = (0, 5, 10)
SHARE_BASIS = "total company revenue, not product-line revenue"


def group_revenue_shares(
    conn: Optional[sqlite3.Connection],
    industry: str,
    tickers: list[str],
    fiscal_year: int,
    now_peers: Optional[PeerSet] = None,
) -> dict[str, Any]:
    """Each selected firm's share of the SELECTED set's USD revenue, by year.

    Years are ``fiscal_year``, -5 and -10. A share is only ever computed over
    the same firm set: if any selected firm has no revenue in a year, every
    share for that year is None and ``complete`` is False for it.
    """
    years = [fiscal_year - k for k in SHARE_YEAR_OFFSETS]
    cols: list[list[Optional[float]]] = [[] for _ in tickers]
    complete: list[bool] = []
    for yr in years:
        ps = now_peers if (yr == fiscal_year and now_peers is not None) else None
        if ps is None and conn is not None:
            ps = load_peers_at_year(conn, industry, yr)
        rev = {p.ticker.upper(): p.revenue_usd for p in ps.peers} if ps else {}
        vals = [rev.get(tk.upper()) for tk in tickers]
        total = sum(v for v in vals if v is not None)
        ok = all(v is not None and v > 0 for v in vals) and total > 0
        complete.append(ok)
        for i, v in enumerate(vals):
            cols[i].append(r6(v / total) if ok else None)
    return {
        "years": years,
        "rows": [{"ticker": tk, "shares": cols[i]} for i, tk in enumerate(tickers)],
        "complete": complete,
        "basis": SHARE_BASIS,
    }


def get_rival_capabilities(
    conn: Optional[sqlite3.Connection],
    ticker: str,
    rivals: list[str],
    now_peers: PeerSet,
    sector: Optional[str],
    industry: Optional[str] = None,
) -> dict[str, Any]:
    """Capability table for the company and up to three rivals (plan 3.4).

    ``industry`` defaults to ``now_peers.group_name``: ``load_peers`` builds
    the set with ``group_name`` equal to the industry it was queried by."""
    ticker = ticker.upper()
    cleaned, error = validate_rivals(ticker, rivals, now_peers)
    if error is not None:
        return error

    industry_medians = _industry_axis_medians(now_peers)
    groups = company_groups(now_peers, sector)
    company_group = groups.get(ticker)
    group_firm_count = sum(
        1 for g in groups.values() if company_group is not None and g == company_group
    ) or None

    all_tickers = [ticker] + cleaned
    dividends = dividends_and_earnings(conn, all_tickers, now_peers.fiscal_year)
    peer_map = {p.ticker.upper(): p for p in now_peers.peers}

    capabilities = []
    for tk in all_tickers:
        p = peer_map.get(tk)
        if p is None:
            continue
        div = (dividends.get(tk) or {}).get("dividendsPaid")
        cap = _capability_row(p, div)
        cap["axisValues"] = _axis_values_row(p, industry_medians)
        cap["groupLabel"] = groups.get(p.ticker)
        capabilities.append(cap)

    group_shares = group_revenue_shares(
        conn,
        industry or now_peers.group_name,
        [c["ticker"] for c in capabilities],
        now_peers.fiscal_year,
        now_peers,
    )

    return {
        "applicable": True,
        "ticker": ticker,
        "capabilities": capabilities,
        "fiscalYear": now_peers.fiscal_year,
        "peerCount": len(now_peers.peers),
        "groupLabel": company_group,
        "groupFirmCount": group_firm_count,
        "dataNote": group_data_note(group_firm_count),
        "groupShares": group_shares,
    }


def list_group_rivals(
    ticker: str,
    now_peers: PeerSet,
    sector: Optional[str],
) -> list[dict[str, Any]]:
    """Members of the company's strategic group, largest revenue first.

    Each row carries the group label it was picked from and the firm's share
    of the industry's dollar revenue, so the picker shows who a rival is and
    how big it is without a second request. Revenue is the USD figure the peer
    set already converted through ``fx_rates``; it is an AMOUNT, not a ratio,
    so converting it is correct.
    """
    ticker = ticker.upper()
    groups = company_groups(now_peers, sector)
    company_group = groups.get(ticker)
    if company_group is None:
        return []

    shares = now_peers.revenue_shares()
    members = [
        p for p in now_peers.peers
        if groups.get(p.ticker) == company_group and p.ticker.upper() != ticker
    ]
    members.sort(key=lambda p: p.revenue_usd, reverse=True)

    return [
        {
            "ticker": p.ticker,
            "name": p.name,
            "revenueUsd": r6(p.revenue_usd),
            "revenueShare": r6(shares.get(p.ticker)),
            "groupLabel": company_group,
        }
        for p in members
    ]
