"""
comparitivestockanalysis.py

Ranks every company within each industry using a fixed set of valuation,
profitability, leverage, liquidity, growth, and per-share metrics drawn
straight from financials.db, and performs horizontal (year-over-year)
analysis on every metric for each ticker.

Metrics used (all sourced from financials.db):
  - DCF intrinsic value per share + margin of safety
  - Return on Equity (ROE)
  - Asset Turnover (Revenue / Total Assets)
  - Gross Profit / Gross Profit Ratio
  - Growth in Net Income, Free Cash Flow, Operating Cash Flow
  - Leverage: Assets/Equity (Financial Leverage), Debt/Equity, Debt/Assets
  - Return on Invested Capital (ROIC)
  - Current Ratio and Quick Ratio
  - Debt Service Coverage Ratio (EBITDA / (Interest + Short Term Debt))
  - Net Current Asset Value (Graham Net-Net) per share
  - Per-share metrics from the DB (Revenue, NI, OCF, FCF, BVPS, etc.)
  - Price to FCF (PFCF Ratio) and Graham Number

Output:
  backend/output/comparative_<industry>.xlsx  (one file per industry, optional)
  backend/output/comparative_summary.xlsx     (top-ranked ticker per industry)

Usage:
    python comparitivestockanalysis.py
    python comparitivestockanalysis.py --industry "Semiconductors"
    python comparitivestockanalysis.py --min-tickers 3
    python comparitivestockanalysis.py --no-excel
"""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Reuse the existing DB layer so we have one source of truth for the schema.
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "data"))

from financial_db import FinancialDB, capm_discount_rate  # noqa: E402
import individualanalysis as _ia  # noqa: E402  — shared FCFF + EVA + metric registry

# Bottom-up beta engine (optional; see individualanalysis.py for the pattern).
try:
    import betas as _beta_engine  # noqa: E402
except Exception:  # noqa: BLE001
    _beta_engine = None  # type: ignore[assignment]

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("comparitive")


# ── Metric definitions ───────────────────────────────────────────────────────

# Per-share metrics stored directly in the DB (used for horizontal analysis).
PER_SHARE_METRICS: list[str] = [
    "Revenue Per Share",
    "Net Income Per Share",
    "Operating Cash Flow Per Share",
    "Free Cash Flow Per Share",
    "Cash Per Share",
    "Book Value Per Share",
    "Tangible Book Value Per Share",
    "Shareholders Equity Per Share",
    "Interest Debt Per Share",
    "Capex Per Share",
]

# Metrics required for the comparative rank — every entry maps to a column or
# derived expression. All values are pulled at the latest available year.
RANKED_METRICS: list[str] = [
    "ROE",
    "ROIC",
    "Gross Profit Ratio",
    "Asset Turnover",
    "Current Ratio",
    "Quick Ratio",
    "Net Income Growth",
    "Free Cash Flow Growth",
    "Operating Cash Flow Growth",
    "Debt To Equity",
    "Financial Leverage",
    "Debt Service Coverage",
    "PFCF Ratio",
    "Graham Number Ratio",
    "Margin Of Safety",
]

# ── Value-score model (magnitude-aware, industry-weighted) ───────────────────
#
# The comparative value score mirrors the individual equity value score: it is an
# ABSOLUTE 0-100 read on business quality, not a pure peer rank. Each metric's
# LEVEL is mapped to 0-100 via a calibrated curve (METRIC_CURVES) and blended with
# a smaller peer-percentile tilt (LEVEL_BLEND). Metric importance is weighted by
# SECTOR (WEIGHTS_BY_SECTOR), and any company with negative core profitability is
# hard-capped so it can never rank high.
#
# RAG-grounded methodology (vault: verified before implementation):
#   • Economic profit is the dominant value driver — "it is not growth that creates
#     value, but growth in conjunction with excess returns" (Damodaran, Investment
#     Valuation Ch.32); "growth … can in fact subtract value if ROIC is below cost
#     of capital" (The Valuation Handbook, Morningstar ch.). → economic-profit
#     metrics (roic_wacc_spread, eva_margin, excess_return) carry the top weight and
#     anchor their curve floor at 0, so a negative spread scores near zero.
#   • Banks/insurers: net interest margin, ROE/ROTCE, ROA, P/B, efficiency
#     (Global Investing Pt.V; Value & Capital Management ch.14). EVA/ROIC-WACC are
#     n/a for financials (fcff_applicable guard) → omitted; excess_return (ROE−Ke)
#     is the financial-sector value-creation measure.
#   • REITs: P/FFO (≈ P/FCF proxy), EV/EBITDA, leverage (ND/EBITDA), coverage,
#     dividend (Global Investing Pt.V). • Tech/high-growth: revenue growth paired
#     with gross/operating margin and FCF conversion; SBC dilution penalised
#     (Damodaran Ch.11; Narrative & Numbers).

# Metrics where a SMALLER value is better (cheapness / leverage / dilution).
_LOWER_IS_BETTER: set[str] = {
    "pfcf", "ev_ebitda", "ev_ebit", "pe", "pb", "net_debt_ebitda", "sbc_revenue",
}

# Per-metric absolute calibration: a monotonic piecewise-linear curve mapping the
# metric LEVEL → 0-100. Anchors are (level, score) pairs sorted by level; the score
# is clamped to the terminal anchors outside the range. Anchors reuse the individual
# page's QUALITY_THRESHOLDS where they overlap (ROE 0.15, ROIC 0.12, ROA 0.07,
# Gross 0.35) so both scores share calibration. Economic-profit floors sit at 0.
METRIC_CURVES: dict[str, list[tuple[float, float]]] = {
    # — Economic profit (floor at 0: a negative spread destroys value) —
    "roic_wacc_spread": [(-0.05, 0), (0.0, 12), (0.05, 62), (0.15, 92), (0.30, 100)],
    "eva_margin":       [(-0.05, 0), (0.0, 12), (0.05, 60), (0.15, 92), (0.30, 100)],
    "excess_return":    [(-0.05, 0), (0.0, 12), (0.05, 60), (0.12, 90), (0.25, 100)],
    # — Margins —
    "net_margin":          [(-0.05, 0), (0.0, 15), (0.10, 60), (0.25, 92), (0.40, 100)],
    "dupont_ebit_margin":  [(-0.05, 0), (0.0, 15), (0.12, 62), (0.30, 92), (0.45, 100)],
    "operating_margin":    [(-0.05, 0), (0.0, 15), (0.12, 62), (0.30, 92), (0.45, 100)],
    "Gross Profit Ratio":  [(0.05, 5), (0.20, 40), (0.35, 62), (0.60, 90), (0.80, 100)],
    # — Returns on capital (anchored on QUALITY_THRESHOLDS) —
    "roe":  [(-0.05, 0), (0.0, 12), (0.15, 62), (0.30, 92), (0.50, 100)],
    "roic": [(-0.03, 0), (0.0, 12), (0.12, 62), (0.25, 92), (0.40, 100)],
    "roa":  [(-0.02, 0), (0.0, 12), (0.07, 60), (0.15, 90), (0.25, 100)],
    "net_interest_margin": [(0.0, 0), (0.015, 30), (0.03, 65), (0.045, 90), (0.06, 100)],
    "asset_turnover": [(0.1, 5), (0.3, 30), (0.6, 55), (1.0, 75), (2.0, 95)],
    # — Cash conversion / coverage —
    "fcf_net_income":    [(-0.5, 0), (0.0, 15), (0.4, 40), (0.8, 65), (1.0, 82), (1.5, 98)],
    "interest_coverage": [(0.0, 0), (1.0, 20), (3.0, 45), (5.0, 65), (10.0, 88), (20.0, 100)],
    "income_quality":    [(0.0, 0), (0.5, 30), (1.0, 65), (1.5, 88), (2.0, 100)],
    # — Growth (negative growth scores low but is not value-destroying like a loss;
    #   economic-profit dominance + modest weight prevent growth-without-returns
    #   from ranking high) —
    "revenue_growth":    [(-0.10, 5), (0.0, 25), (0.08, 55), (0.20, 82), (0.40, 98)],
    "net_income_growth": [(-0.20, 5), (0.0, 25), (0.08, 55), (0.25, 82), (0.60, 98)],
    # — Cheapness / leverage / dilution (lower is better → score decreases) —
    "pfcf":           [(5, 95), (12, 72), (20, 50), (40, 20), (80, 3)],
    "ev_ebitda":      [(4, 95), (8, 72), (12, 50), (20, 22), (35, 3)],
    "pb":             [(0.5, 95), (1.0, 75), (2.0, 55), (4.0, 28), (8.0, 5)],
    "net_debt_ebitda":[(0.0, 95), (1.0, 78), (2.5, 55), (4.0, 30), (6.0, 8)],
    "sbc_revenue":    [(0.0, 100), (0.02, 70), (0.05, 45), (0.10, 20), (0.20, 3)],
    "Graham Number Ratio": [(0.3, 5), (0.7, 35), (1.0, 60), (1.5, 88), (2.5, 100)],
}

# Default importance weights (quality-dominant ≈ 85%, cheapness ≈ 15%). Used for
# every sector without an explicit override below.
DEFAULT_WEIGHTS: dict[str, float] = {
    # economic profit (top)
    "roic_wacc_spread": 3.0, "eva_margin": 3.0, "excess_return": 2.5,
    # margins
    "net_margin": 2.0, "dupont_ebit_margin": 2.0, "Gross Profit Ratio": 1.5,
    # returns on capital
    "roic": 2.0, "roe": 2.0, "roa": 1.5,
    # capital efficiency + cash quality
    "asset_turnover": 1.0, "fcf_net_income": 1.5, "interest_coverage": 1.0,
    "income_quality": 1.0,
    # growth (valuable only with returns → modest weight)
    "revenue_growth": 1.0, "net_income_growth": 1.0,
    # leverage / dilution (lower better)
    "net_debt_ebitda": 0.5, "sbc_revenue": 0.5,
    # cheapness (minor)
    "pfcf": 1.5, "ev_ebitda": 1.0, "Graham Number Ratio": 1.0,
}

# Sector-specific weight profiles. Each industry inherits its GICS sector's profile;
# sectors without an entry fall back to DEFAULT_WEIGHTS. Profiles only reference
# metric keys that are populated for that sector (e.g. eva_margin/roic_wacc_spread
# are None for Financials/REITs under the fcff_applicable guard, so they are omitted
# there and replaced by the financial-sector value-creation measures).
WEIGHTS_BY_SECTOR: dict[str, dict[str, float]] = {
    "Financial Services": {
        "net_interest_margin": 3.0, "roe": 3.0, "excess_return": 2.5, "roa": 2.0,
        "net_margin": 2.0, "revenue_growth": 1.5, "net_income_growth": 1.5,
        "income_quality": 1.0, "pb": 1.5,
    },
    "Real Estate": {
        "fcf_net_income": 2.0, "excess_return": 2.0, "roe": 2.0, "net_margin": 1.5,
        "interest_coverage": 2.0, "net_debt_ebitda": 1.5, "ev_ebitda": 2.0,
        "pfcf": 1.5, "pb": 1.5, "revenue_growth": 1.0,
    },
    "Technology": {
        "roic_wacc_spread": 3.0, "eva_margin": 3.0, "Gross Profit Ratio": 2.5,
        "net_margin": 2.0, "dupont_ebit_margin": 2.0, "fcf_net_income": 2.0,
        "revenue_growth": 2.0, "excess_return": 2.0, "roic": 2.0, "roe": 1.5,
        "net_income_growth": 1.5, "sbc_revenue": 1.0, "pfcf": 1.0,
    },
}

# Share of each metric score that comes from its ABSOLUTE level vs. the peer
# percentile (0.70 absolute / 0.30 relative).
LEVEL_BLEND = 0.70

# A company with negative core profitability is capped at this score so it can
# never rank high, regardless of how it compares to (equally weak) peers.
NEG_PROFIT_CAP = 30.0
# Any of these present-and-negative trips the cap: an outright loss (net_margin),
# negative economic profit (eva_margin / roic_wacc_spread), or negative ROE.
NEG_PROFIT_TRIGGERS = ("net_margin", "eva_margin", "roic_wacc_spread", "roe")

# DCF assumptions — kept conservative so per-ticker valuations are comparable.
DCF_WACC = 0.10
DCF_TERMINAL_GROWTH = 0.03
DCF_PROJECTION_YEARS = 5
DCF_GROWTH_FLOOR = -0.15
DCF_GROWTH_CAP = 0.20


@dataclass(frozen=True)
class TickerSnapshot:
    """All numbers needed to rank a single ticker in its industry."""

    ticker: str
    name: Optional[str]
    sector: Optional[str]
    industry: Optional[str]
    latest_year: int
    # Ranked metrics → value
    metrics: dict[str, Optional[float]] = field(default_factory=dict)
    # DCF outputs
    dcf_intrinsic: Optional[float] = None
    implied_price: Optional[float] = None
    margin_of_safety: Optional[float] = None
    avg_fcf_growth: Optional[float] = None
    # Per-share horizontal analysis: metric → {year: yoy_pct}
    per_share_horizontal: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)
    # Generic horizontal analysis for every ranked metric: metric → {year: yoy_pct}
    metric_horizontal: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)
    # Shared 2-stage EVA intrinsic value per share (None when not computable)
    eva_intrinsic: Optional[float] = None
    # Fundamental display-metric level history: metric_key → {year: value}
    metric_levels: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _safe_div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den is None or den == 0:
        return None
    return num / den


def _first_not_none(*vals: Optional[float]) -> Optional[float]:
    """First value that is not None (preserves a genuine stored 0.0, unlike ``a or b``)."""
    for v in vals:
        if v is not None:
            return v
    return None


def _pos_div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    """Divide only when the denominator is strictly positive.

    Leverage, coverage, and price/cash-flow multiples are economically
    meaningless when the denominator is non-positive (negative book equity,
    negative earnings/FCF, negative current liabilities). Per Damodaran,
    *Investment Valuation*: a negative-denominator multiple "is not meaningful"
    (Ch.17) and negative book equity yields a meaningless negative ratio (Ch.19).
    Returning None keeps such firms out of the comparison rather than scoring
    them as spuriously cheap/strong.
    """
    if num is None or den is None or den <= 0:
        return None
    return num / den


def _yoy_pct(curr: Optional[float], prev: Optional[float]) -> Optional[float]:
    if curr is None or prev is None or prev == 0:
        return None
    return (curr - prev) / abs(prev)


def _safe_sheet_name(name: str) -> str:
    """Excel sheet names: <= 31 chars, no \\ / ? * [ ] :"""
    for ch in r"\/?*[]:":
        name = name.replace(ch, "_")
    return name[:31]


# ── Data loading ─────────────────────────────────────────────────────────────

def load_industry_panel(db: FinancialDB, industry: Optional[str] = None) -> dict[str, list[sqlite3.Row]]:
    """
    Return {ticker: [rows ordered by year]} for every ticker in the requested
    industry (or every industry, if ``industry`` is None).
    """
    where = ['t.industry IS NOT NULL', "f.\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"]
    params: list = []
    if industry:
        where.append("LOWER(t.industry) LIKE ?")
        params.append(f"%{industry.lower()}%")

    sql = f"""
        SELECT f.*, t.name AS t_name, t.sector AS t_sector, t.industry AS t_industry
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        WHERE {' AND '.join(where)}
        ORDER BY f.Ticker, CAST(f."Calendar Year" AS INTEGER)
    """

    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    panel: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        panel.setdefault(row["Ticker"], []).append(row)
    return panel


# ── Metric computation ───────────────────────────────────────────────────────

def _compute_ranked_metrics(latest: sqlite3.Row) -> dict[str, Optional[float]]:
    """Pull stored metrics directly and derive the ones not stored in the DB."""

    def g(col: str) -> Optional[float]:
        v = latest[col] if col in latest.keys() else None
        return float(v) if v is not None else None

    revenue = g("Revenue")
    total_assets = g("Total Assets")
    # `_first_not_none`, not `or`: a genuine 0.0 equity (technical insolvency) is
    # meaningful and must not silently fall through to the alternate column.
    equity = _first_not_none(g("Total Stockholders Equity"), g("Total Equity"))
    current_assets = g("Total Current Assets")
    current_liab = g("Total Current Liabilities")
    inventory = g("Inventory")
    ebitda = g("EBITDA")
    interest_exp = g("Interest Expense")
    short_term_debt = g("Short Term Debt")
    market_cap = g("Market Cap")
    fcf = g("Free Cash Flow")

    # Interest expense is stored negative in some feeds; magnitudes only.
    debt_service = abs(interest_exp or 0.0) + abs(short_term_debt or 0.0)

    return {
        "ROE": g("ROE"),
        "ROIC": g("ROIC"),
        "Gross Profit Ratio": g("Gross Profit Ratio"),
        "Asset Turnover": _safe_div(revenue, total_assets),
        "Current Ratio": _first_not_none(g("Current Ratio"), _pos_div(current_assets, current_liab)),
        "Quick Ratio": _pos_div(
            (current_assets - inventory) if (current_assets is not None and inventory is not None) else None,
            current_liab,
        ),
        "Net Income Growth": g("Net Income Growth"),
        "Free Cash Flow Growth": g("Free Cash Flow Growth"),
        "Operating Cash Flow Growth": g("Operating Cash Flow Growth"),
        "Debt To Equity": g("Debt To Equity"),
        "Financial Leverage": _pos_div(total_assets, equity),
        "Debt Service Coverage": _safe_div(ebitda, debt_service if debt_service > 0 else None),
        # Negative FCF → a negative P/FCF is not a "cheap" signal (Damodaran Ch.17).
        "PFCF Ratio": _first_not_none(g("PFCF Ratio"), _pos_div(market_cap, fcf)),
        # Graham Number / implied price ratio: > 1 = trading below Graham fair value
        "Graham Number Ratio": None,  # filled below once we know the implied price
    }


def _compute_per_share_levels_and_growth(
    rows: list[sqlite3.Row],
) -> dict[str, dict[int, Optional[float]]]:
    """Return {metric: {year: yoy_pct_change}} for each per-share field."""
    out: dict[str, dict[int, Optional[float]]] = {m: {} for m in PER_SHARE_METRICS}
    prev: dict[str, Optional[float]] = {m: None for m in PER_SHARE_METRICS}
    for row in rows:
        year = int(row["Calendar Year"])
        for m in PER_SHARE_METRICS:
            val = row[m] if m in row.keys() else None
            val_f = float(val) if val is not None else None
            out[m][year] = _yoy_pct(val_f, prev[m])
            prev[m] = val_f
    return out


def _compute_metric_horizontal(rows: list[sqlite3.Row]) -> dict[str, dict[int, Optional[float]]]:
    """YoY % change for each ranked metric (derived per row, then differenced)."""
    out: dict[str, dict[int, Optional[float]]] = {m: {} for m in RANKED_METRICS}
    prev: dict[str, Optional[float]] = {m: None for m in RANKED_METRICS}
    for row in rows:
        year = int(row["Calendar Year"])
        snapshot = _compute_ranked_metrics(row)
        for m in RANKED_METRICS:
            curr = snapshot.get(m)
            out[m][year] = _yoy_pct(curr, prev[m])
            prev[m] = curr
    return out


def _historical_fcf_growth(rows: list[sqlite3.Row]) -> Optional[float]:
    """Average YoY FCF/share growth over available history, capped for DCF use."""
    growths: list[float] = []
    prev: Optional[float] = None
    for row in rows:
        val = row["Free Cash Flow Per Share"] if "Free Cash Flow Per Share" in row.keys() else None
        val_f = float(val) if val is not None else None
        g = _yoy_pct(val_f, prev)
        if g is not None:
            growths.append(g)
        prev = val_f
    if not growths:
        return None
    # Geometric (compounded) mean, not arithmetic: Damodaran, *Investment
    # Valuation* Ch.11 — "the geometric average is a much more accurate measure
    # of true growth," and the arithmetic mean overstates it most for the volatile
    # series typical of FCF. Skip sign-crossing years (compounding undefined when
    # 1+g <= 0) and fall back to the arithmetic mean only if none remain.
    compoundable = [g for g in growths if (1.0 + g) > 0.0]
    if compoundable:
        prod = 1.0
        for g in compoundable:
            prod *= (1.0 + g)
        raw = prod ** (1.0 / len(compoundable)) - 1.0
    else:
        raw = sum(growths) / len(growths)
    return max(DCF_GROWTH_FLOOR, min(raw, DCF_GROWTH_CAP))


def _compute_dcf(
    rows: list[sqlite3.Row],
    beta: float | None = None,
    price: float | None = None,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """
    Per-ticker simplified DCF using FCF/share. Returns
    (intrinsic_per_share, implied_price, margin_of_safety, growth_used).

    When ``beta`` is provided, the discount rate is derived from CAPM
    (Rf + beta * ERP). Otherwise the fixed DCF_WACC default is used.
    ``price`` is the live market price for the margin-of-safety comparison;
    when None it falls back to Market Cap / shares (stale filing-date price).
    """
    if not rows:
        return None, None, None, None

    latest = rows[-1]
    fcf_ps = latest["Free Cash Flow Per Share"] if "Free Cash Flow Per Share" in latest.keys() else None
    shares = latest["Weighted Average Shs Out Dil"] if "Weighted Average Shs Out Dil" in latest.keys() else None
    market_cap = latest["Market Cap"] if "Market Cap" in latest.keys() else None

    if fcf_ps is None or fcf_ps <= 0 or not shares or not market_cap or shares <= 0:
        return None, None, None, None

    growth = _historical_fcf_growth(rows)
    if growth is None:
        growth = 0.05

    wacc = capm_discount_rate(beta) if beta is not None else DCF_WACC

    pv_fcf = 0.0
    fcf = float(fcf_ps)
    for yr in range(1, DCF_PROJECTION_YEARS + 1):
        fcf = fcf * (1 + growth)
        pv_fcf += fcf / (1 + wacc) ** yr

    if wacc <= DCF_TERMINAL_GROWTH:
        return None, None, None, None
    terminal_fcf = fcf * (1 + DCF_TERMINAL_GROWTH)
    terminal_value = terminal_fcf / (wacc - DCF_TERMINAL_GROWTH)
    pv_terminal = terminal_value / (1 + wacc) ** DCF_PROJECTION_YEARS

    intrinsic = pv_fcf + pv_terminal
    implied_price = price if (price is not None and price > 0) else float(market_cap) / float(shares)
    mos = (intrinsic - implied_price) / implied_price
    return round(intrinsic, 2), round(implied_price, 2), round(mos, 4), round(growth, 4)


def build_snapshot(
    ticker: str,
    rows: list[sqlite3.Row],
    db: Optional[FinancialDB] = None,
    rf: float | None = None,
    erp: float | None = None,
    use_live_price: bool = True,
) -> Optional[TickerSnapshot]:
    if not rows:
        return None
    # Sort ascending by fiscal year so `rows[-1]` is the true LATEST year and every
    # YoY/growth pass runs oldest→newest, regardless of how the caller ordered rows.
    # (The ranking endpoint sorts its rows DESCENDING for the display columns, which
    # would otherwise make `rows[-1]` the oldest year and score stale metrics.)
    rows = sorted(rows, key=lambda r: int(r["Calendar Year"]))
    latest = rows[-1]
    metrics = _compute_ranked_metrics(latest)

    # Measured beta: stored DB value (sourced from beta.csv), else None.
    beta = db.get_or_compute_beta(ticker) if db is not None else None
    # Bottom-up beta override (BETA_RESOLVER=on). DB-only fast path: the
    # leaderboard loops the whole industry, so no network/LLM per ticker —
    # the universe is warmed by `python -m betas.refresh --resolve`.
    if db is not None and _beta_engine is not None and _beta_engine.beta_mode() == "on":
        try:
            beta = _beta_engine.get_beta_fast(ticker, db) or beta
        except Exception:  # noqa: BLE001 — fast path failure keeps stored beta
            pass
    # Most recent market price. ``use_live_price=False`` skips the per-ticker
    # yfinance spot quote (used by the whole-industry leaderboard, where one live
    # call per company would make the request take minutes) → Market Cap / shares
    # fallback is used for the intrinsic-vs-price margin-of-safety instead.
    live_price = (
        db.get_latest_price(ticker) if (db is not None and use_live_price) else None
    )
    # Use the shared FCFF firm model (consistent with the individual page) for the
    # DCF + EVA columns; fall back to the simpler FCF/share DCF when FCFF can't be
    # built (e.g. negative ROIC / missing shares).
    eva_intrinsic: Optional[float] = None
    forecast = _ia.compute_forecast(rows, beta=beta, rf=rf, erp=erp, price=live_price)
    if forecast is not None:
        intrinsic = forecast.get("intrinsicPerShare")
        implied_price = forecast.get("currentPrice")
        mos = forecast.get("marginOfSafety")
        growth_used = forecast.get("assumptions", {}).get("revenueGrowthInitial")
        eva_intrinsic = (forecast.get("eva") or {}).get("intrinsicPerShare")
    else:
        intrinsic, implied_price, mos, growth_used = _compute_dcf(rows, beta=beta, price=live_price)

    # Fundamental metric history (levels); latest year feeds the leaderboard columns.
    metric_levels = _ia.metric_history(rows, beta=beta, rf=rf, erp=erp)
    latest_year_int = int(latest["Calendar Year"])
    for key, hist in metric_levels.items():
        metrics[key] = hist.get(latest_year_int)

    # Graham Number = sqrt(22.5 * EPS * BVPS).  Ratio = Graham / implied price
    eps = latest["EPS Diluted"] if "EPS Diluted" in latest.keys() else None
    bvps = latest["Book Value Per Share"] if "Book Value Per Share" in latest.keys() else None
    graham_ratio: Optional[float] = None
    if eps is not None and bvps is not None and eps > 0 and bvps > 0 and implied_price:
        graham_number = (22.5 * float(eps) * float(bvps)) ** 0.5
        graham_ratio = round(graham_number / implied_price, 4)
    metrics["Graham Number Ratio"] = graham_ratio
    metrics["Margin Of Safety"] = mos

    return TickerSnapshot(
        ticker=ticker,
        name=latest["t_name"],
        sector=latest["t_sector"],
        industry=latest["t_industry"],
        latest_year=int(latest["Calendar Year"]),
        metrics=metrics,
        dcf_intrinsic=intrinsic,
        implied_price=implied_price,
        margin_of_safety=mos,
        avg_fcf_growth=growth_used,
        per_share_horizontal=_compute_per_share_levels_and_growth(rows),
        metric_horizontal=_compute_metric_horizontal(rows),
        eva_intrinsic=eva_intrinsic,
        metric_levels=metric_levels,
    )


# ── Ranking ──────────────────────────────────────────────────────────────────

# A ticker must have valid data for at least this fraction of the sector profile's
# total weight to earn a real value score; below it the average is built on too thin
# a base, so we sink it to 0.0 rather than letting it outrank well-covered peers.
MIN_SCORE_COVERAGE = 0.5


def _interp(anchors: list[tuple[float, float]], v: float) -> float:
    """Piecewise-linear interpolation over (level, score) anchors sorted by level,
    clamped to the terminal scores outside the anchored range."""
    if v <= anchors[0][0]:
        return anchors[0][1]
    if v >= anchors[-1][0]:
        return anchors[-1][1]
    for (v0, s0), (v1, s1) in zip(anchors, anchors[1:]):
        if v0 <= v <= v1:
            t = (v - v0) / (v1 - v0) if v1 > v0 else 0.0
            return s0 + t * (s1 - s0)
    return anchors[-1][1]


def _level_score(metric: str, value: Optional[float]) -> Optional[float]:
    """Absolute 0-100 score for a metric's level, or None if no curve / no value."""
    anchors = METRIC_CURVES.get(metric)
    if anchors is None or value is None:
        return None
    return max(0.0, min(100.0, _interp(anchors, float(value))))


def _peer_percentiles(snapshots: list[TickerSnapshot], metric: str, lower_better: bool) -> dict[str, float]:
    """rank/(n-1)*100 within the peer set (best = 100). Empty if < 2 have the metric.
    Tied values share the average percentile so equal metrics don't get an arbitrary
    0/100 split from input order."""
    valid = [(s.ticker, s.metrics.get(metric)) for s in snapshots if s.metrics.get(metric) is not None]
    if len(valid) < 2:
        return {}
    ordered = sorted(valid, key=lambda kv: kv[1], reverse=lower_better)
    n = len(ordered)
    out: dict[str, float] = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and ordered[j + 1][1] == ordered[i][1]:
            j += 1
        pct = ((i + j) / 2.0 / (n - 1)) * 100.0   # average rank across the tie group
        for k in range(i, j + 1):
            out[ordered[k][0]] = pct
        i = j + 1
    return out


def _resolve_sector(snapshots: list[TickerSnapshot]) -> Optional[str]:
    """Modal non-null sector of the peer panel (an industry maps to one sector)."""
    counts: dict[str, int] = {}
    for s in snapshots:
        if s.sector:
            counts[s.sector] = counts.get(s.sector, 0) + 1
    return max(counts, key=counts.get) if counts else None


def _has_negative_core_profit(metrics: dict[str, Optional[float]]) -> bool:
    """True if any present core-profitability signal is negative (loss / negative EVA)."""
    for key in NEG_PROFIT_TRIGGERS:
        v = metrics.get(key)
        if v is not None and v < 0:
            return True
    return False


def score_industry(
    snapshots: list[TickerSnapshot], sector: Optional[str] = None
) -> dict[str, float]:
    """Magnitude-aware, sector-weighted value score (0-100) for each ticker.

    Each metric contributes ``LEVEL_BLEND`` of an absolute level score (from its
    calibrated curve) plus the remainder from a peer percentile, weighted by the
    panel's sector profile. Companies with negative core profitability are capped at
    ``NEG_PROFIT_CAP`` so they can never rank high. ``sector`` defaults to the panel's
    modal sector.
    """
    if len(snapshots) < 2:
        return {s.ticker: 0.0 for s in snapshots}

    if sector is None:
        sector = _resolve_sector(snapshots)
    weights = WEIGHTS_BY_SECTOR.get(sector or "", DEFAULT_WEIGHTS)
    total_weight = sum(weights.values())

    scores = {s.ticker: 0.0 for s in snapshots}
    weights_used = {s.ticker: 0.0 for s in snapshots}

    for metric, weight in weights.items():
        lower_better = metric in _LOWER_IS_BETTER
        peer = _peer_percentiles(snapshots, metric, lower_better)
        for s in snapshots:
            value = s.metrics.get(metric)
            if value is None:
                continue
            lvl = _level_score(metric, value)
            if lvl is None:
                # No absolute curve — fall back to peer percentile alone (skip if
                # the metric isn't comparable across the panel either).
                if s.ticker not in peer:
                    continue
                metric_score = peer[s.ticker]
            else:
                # Blend absolute level with the peer tilt; if the metric isn't
                # peer-comparable, the level stands alone.
                metric_score = LEVEL_BLEND * lvl + (1 - LEVEL_BLEND) * peer.get(s.ticker, lvl)
            scores[s.ticker] += metric_score * weight
            weights_used[s.ticker] += weight

    min_weight = MIN_SCORE_COVERAGE * total_weight
    out: dict[str, float] = {}
    for s in snapshots:
        t = s.ticker
        if weights_used[t] < min_weight or weights_used[t] <= 0:
            out[t] = 0.0
            continue
        composite = scores[t] / weights_used[t]
        if _has_negative_core_profit(s.metrics):
            composite = min(composite, NEG_PROFIT_CAP)
        out[t] = round(composite, 2)
    return out


# ── Excel export ─────────────────────────────────────────────────────────────

def export_industry_excel(
    industry: str,
    snapshots: list[TickerSnapshot],
    scores: dict[str, float],
    output_path: str,
) -> None:
    try:
        import pandas as pd
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError:
        log.warning("Install pandas + openpyxl for Excel export.")
        return

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    header_fill = PatternFill("solid", fgColor="1F3864")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    top3 = [
        PatternFill("solid", fgColor="FFD700"),
        PatternFill("solid", fgColor="C0C0C0"),
        PatternFill("solid", fgColor="CD7F32"),
    ]

    # ── Ranking sheet ────────────────────────────────────────────────────────
    rank_rows: list[dict] = []
    for s in snapshots:
        row: dict = {
            "Ticker": s.ticker,
            "Name": s.name,
            "Sector": s.sector,
            "Industry": s.industry,
            "Latest Year": s.latest_year,
            "Value Score": scores.get(s.ticker, 0.0),
            "DCF Intrinsic/Share": s.dcf_intrinsic,
            "Implied Price": s.implied_price,
            "Margin of Safety %": (round(s.margin_of_safety * 100, 2)
                                   if s.margin_of_safety is not None else None),
            "FCF Growth Used %": (round(s.avg_fcf_growth * 100, 2)
                                  if s.avg_fcf_growth is not None else None),
        }
        for m in RANKED_METRICS:
            row[m] = s.metrics.get(m)
        rank_rows.append(row)

    df_rank = pd.DataFrame(rank_rows).sort_values("Value Score", ascending=False).reset_index(drop=True)
    df_rank.insert(0, "Rank", df_rank.index + 1)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df_rank.to_excel(writer, sheet_name="Ranking", index=False)
        ws = writer.sheets["Ranking"]
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws.row_dimensions[1].height = 28
        for row_idx in range(2, min(5, ws.max_row + 1)):
            for cell in ws[row_idx]:
                cell.fill = top3[row_idx - 2]
        for col in ws.columns:
            width = max((len(str(c.value)) for c in col if c.value is not None), default=0)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(width + 3, 28)
        ws.freeze_panes = "C2"

        # ── Per-ticker horizontal analysis sheets ───────────────────────────
        for s in sorted(snapshots, key=lambda x: scores.get(x.ticker, 0.0), reverse=True):
            sheet = _safe_sheet_name(s.ticker)
            years = sorted({
                y for table in (*s.per_share_horizontal.values(), *s.metric_horizontal.values())
                for y in table
            })
            if not years:
                continue

            tables: list[tuple[str, dict[str, dict[int, Optional[float]]]]] = [
                ("Per-Share Metrics — YoY % Change", s.per_share_horizontal),
                ("Ranked Metrics — YoY % Change", s.metric_horizontal),
            ]

            blocks: list[pd.DataFrame] = []
            for title, table in tables:
                hdr = pd.DataFrame({"": [title] + list(table.keys())})
                rows_df = pd.DataFrame(
                    [[None] * len(years)] + [
                        [
                            (round(table[m][y] * 100, 2) if table[m].get(y) is not None else None)
                            for y in years
                        ]
                        for m in table
                    ],
                    columns=[str(y) for y in years],
                )
                blocks.append(pd.concat([hdr, rows_df], axis=1))
                blocks.append(pd.DataFrame([[None]]))  # spacer row

            combined = pd.concat(blocks, axis=0, ignore_index=True)
            combined.to_excel(writer, sheet_name=sheet, index=False, header=True)
            ws_t = writer.sheets[sheet]
            ws_t.sheet_view.showGridLines = False
            for col in ws_t.columns:
                width = max((len(str(c.value)) for c in col if c.value is not None), default=0)
                ws_t.column_dimensions[get_column_letter(col[0].column)].width = min(width + 2, 24)

    log.info("  Saved: %s", output_path)


def export_summary(
    industry_scores: dict[str, list[TickerSnapshot]],
    industry_rankings: dict[str, dict[str, float]],
    output_path: str,
) -> None:
    try:
        import pandas as pd
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError:
        return

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    rows: list[dict] = []
    for industry, snapshots in industry_scores.items():
        scores = industry_rankings.get(industry, {})
        if not snapshots:
            continue
        ranked = sorted(snapshots, key=lambda s: scores.get(s.ticker, 0.0), reverse=True)
        top = ranked[0]
        rows.append({
            "Industry": industry,
            "Tickers": len(snapshots),
            "Top Ticker": top.ticker,
            "Top Name": top.name,
            "Top Score": scores.get(top.ticker, 0.0),
            "Top Margin of Safety %": (round(top.margin_of_safety * 100, 2)
                                       if top.margin_of_safety is not None else None),
            "Top ROE": top.metrics.get("ROE"),
            "Top ROIC": top.metrics.get("ROIC"),
        })

    if not rows:
        return

    df = pd.DataFrame(rows).sort_values("Top Score", ascending=False).reset_index(drop=True)
    df.insert(0, "Rank", df.index + 1)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Summary", index=False)
        ws = writer.sheets["Summary"]
        for cell in ws[1]:
            cell.fill = PatternFill("solid", fgColor="1F3864")
            cell.font = Font(bold=True, color="FFFFFF")
            cell.alignment = Alignment(horizontal="center")
        for col in ws.columns:
            width = max((len(str(c.value)) for c in col if c.value is not None), default=0)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(width + 3, 32)
        ws.freeze_panes = "B2"

    log.info("Summary saved: %s", output_path)


# ── Console print ────────────────────────────────────────────────────────────

def _fmt(v: Optional[float]) -> str:
    if v is None:
        return "    n/a"
    if abs(v) >= 1_000:
        return f"{v:,.0f}"
    return f"{v:.4f}"


def print_industry_ranking(industry: str, snapshots: list[TickerSnapshot], scores: dict[str, float]) -> None:
    ranked = sorted(snapshots, key=lambda s: scores.get(s.ticker, 0.0), reverse=True)
    print()
    print("=" * 90)
    print(f"  INDUSTRY: {industry}   (n={len(snapshots)} tickers)")
    print("=" * 90)
    print(f"  {'Rank':<5}{'Ticker':<10}{'Score':>8}  {'ROE':>8}  {'ROIC':>8}  "
          f"{'MoS %':>8}  {'D/E':>8}  Name")
    print("  " + "-" * 86)
    for i, s in enumerate(ranked, start=1):
        mos_pct = s.margin_of_safety * 100 if s.margin_of_safety is not None else None
        print(
            f"  {i:<5}{s.ticker:<10}{scores.get(s.ticker, 0.0):>8.2f}  "
            f"{_fmt(s.metrics.get('ROE')):>8}  {_fmt(s.metrics.get('ROIC')):>8}  "
            f"{_fmt(mos_pct):>8}  {_fmt(s.metrics.get('Debt To Equity')):>8}  "
            f"{(s.name or '')[:45]}"
        )


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Comparative within-industry stock ranking with horizontal analysis."
    )
    parser.add_argument("--industry", "-i", help="Filter industries by substring (case-insensitive).")
    parser.add_argument("--min-tickers", type=int, default=2,
                        help="Skip industries with fewer than N tickers (default: 2).")
    parser.add_argument("--no-excel", action="store_true", help="Skip Excel export.")
    parser.add_argument(
        "--output-dir",
        default=os.path.join(_HERE, "output"),
        help="Folder for Excel output (default: backend/output/).",
    )
    parser.add_argument(
        "--db",
        default=os.path.join(_HERE, "..", "financials.db"),
        help="Path to financials.db (default: ../financials.db).",
    )
    args = parser.parse_args()

    db = FinancialDB(args.db)
    panel = load_industry_panel(db, args.industry)
    if not panel:
        log.info("No tickers found for the requested filter.")
        return

    # Group snapshots by industry
    by_industry: dict[str, list[TickerSnapshot]] = {}
    for ticker, rows in panel.items():
        snap = build_snapshot(ticker, rows, db=db)
        if snap is None or snap.industry is None:
            continue
        by_industry.setdefault(snap.industry, []).append(snap)

    industry_rankings: dict[str, dict[str, float]] = {}
    out_dir = Path(args.output_dir)

    for industry, snapshots in sorted(by_industry.items()):
        if len(snapshots) < args.min_tickers:
            continue
        scores = score_industry(snapshots)
        industry_rankings[industry] = scores
        print_industry_ranking(industry, snapshots, scores)

        if not args.no_excel:
            path = out_dir / f"comparative_{_safe_sheet_name(industry)}.xlsx"
            export_industry_excel(industry, snapshots, scores, str(path))

    if not args.no_excel and industry_rankings:
        export_summary(
            by_industry,
            industry_rankings,
            str(out_dir / "comparative_summary.xlsx"),
        )


if __name__ == "__main__":
    main()
