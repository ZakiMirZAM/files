"""
industry_averages.py

Computes industry and sector averages for all financial metrics in financials.db,
including derived ratios, CAPE approximation, simplified DCF, and bank leverage flags.
Exports per-year ranked Excel files with a Summary sheet.

Usage:
    python industry_averages.py
    python industry_averages.py --industry "Semiconductors"
    python industry_averages.py --sector "Technology"
    python industry_averages.py --metric "PE Ratio" --metric "ROE"
    python industry_averages.py --min-tickers 5
    python industry_averages.py --sectors-only / --industries-only
    python industry_averages.py --no-excel
    python industry_averages.py --output-dir ./output

NOTE: Beta / Volatility vs S&P 500 requires daily price history which is NOT
stored in financials.db. Use economicmetrics.py (yfinance) for that data.
"""

import sys
import os
import sqlite3
import argparse
from datetime import date

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "data"))

from financial_db import FinancialDB, EXCEL_COLUMNS, capm_discount_rate

# Bottom-up beta engine (optional). When BETA_RESOLVER=on, the group-DCF SQL
# below reads resolver betas via LEFT JOIN computed_betas (same financials.db).
try:
    import betas as _beta_engine
except Exception:  # noqa: BLE001
    _beta_engine = None


def _resolver_beta_sql() -> tuple[str, str]:
    """(select_expr, join_clause) for the per-ticker beta in the group DCF."""
    if _beta_engine is not None and _beta_engine.beta_mode() == "on":
        return ("COALESCE(cb.beta, t.beta)",
                " LEFT JOIN computed_betas cb ON cb.ticker = t.ticker")
    return ("t.beta", "")

# ── COLUMN SETS ──────────────────────────────────────────────────────────────

_NON_METRIC_COLS = {
    "Ticker", "Name", "Sector", "Industry", "Date",
    "Reported Currency", "Period", "Cik",
    "Filling Date", "Accepted Date", "Calendar Year",
}
METRIC_COLS = [c for c in EXCEL_COLUMNS if c not in _NON_METRIC_COLS]

# Derived metrics computed as SQL expressions over individual rows before AVG.
# Using per-row ratios then averaging gives the true mean ratio across companies,
# which is more meaningful than ratio-of-averages.
DERIVED_METRICS = {
    # ── Efficiency ───────────────────────────────────────────────────────────
    "Asset Turnover":
        'f."Revenue" / NULLIF(f."Total Assets", 0)',
    "Fixed Asset Turnover":
        'f."Revenue" / NULLIF(f."Property Plant Equipment Net", 0)',
    "Cash Conversion Cycle":
        'f."Days Sales Outstanding" + f."Days Of Inventory On Hand" - f."Days Payables Outstanding"',
    "FCF To Revenue":
        'f."Free Cash Flow" / NULLIF(f."Revenue", 0)',
    "OCF To Revenue":
        'f."Operating Cash Flow" / NULLIF(f."Revenue", 0)',

    # ── Liquidity ────────────────────────────────────────────────────────────
    "Quick Ratio":
        '(f."Total Current Assets" - f."Inventory") / NULLIF(f."Total Current Liabilities", 0)',

    # ── Leverage / Capital Structure ─────────────────────────────────────────
    "Financial Leverage":           # Assets / Equity — key bank metric
        'f."Total Assets" / NULLIF(f."Total Stockholders Equity", 0)',
    "Equity Multiplier":            # same concept, alternate label
        'f."Total Assets" / NULLIF(f."Total Equity", 0)',
    "Net Debt To Revenue":
        '(f."Total Debt" - f."Cash And Cash Equivalents") / NULLIF(f."Revenue", 0)',

    # ── Capital Intensity ────────────────────────────────────────────────────
    "Capital Intensity Ratio":      # PP&E / Total Assets
        'f."Property Plant Equipment Net" / NULLIF(f."Total Assets", 0)',
    "Capex To Assets":
        'ABS(f."Capital Expenditure") / NULLIF(f."Total Assets", 0)',
    "Depreciation To Assets":
        'f."Depreciation And Amortization" / NULLIF(f."Total Assets", 0)',

    # ── R&D / SGA ────────────────────────────────────────────────────────────
    "R&D Intensity":
        'f."Research And Development Expenses" / NULLIF(f."Revenue", 0)',
    "SGA Intensity":
        'f."Selling General And Administrative Expenses" / NULLIF(f."Revenue", 0)',

    # ── Book Value ───────────────────────────────────────────────────────────
    "Tangible Book Value Ratio":    # tangible assets / total assets
        'f."Tangible Asset Value" / NULLIF(f."Total Assets", 0)',
    "Book Value To Market":         # inverse of P/B, less distorted for negatives
        'f."Total Stockholders Equity" / NULLIF(f."Market Cap", 0)',

    # ── Profitability (derived) ───────────────────────────────────────────────
    "ROA":                          # Net Income / Total Assets
        'f."Net Income" / NULLIF(f."Total Assets", 0)',

    # ── DuPont (5-factor) levers ──────────────────────────────────────────────
    # ROE = Tax Burden × Interest Burden × EBIT Margin (= Operating Income Ratio)
    #       × Asset Turnover × Financial Leverage. The two below are the levers not
    #       already produced elsewhere; EBIT = Operating Income.
    "Tax Burden":                   # Net Income / EBT (pre-tax income)
        'f."Net Income" / NULLIF(f."Income Before Tax", 0)',
    "Interest Burden":              # EBT / EBIT (Operating Income)
        'f."Income Before Tax" / NULLIF(f."Operating Income", 0)',
}

ALL_DERIVED_NAMES = list(DERIVED_METRICS.keys())

# ── VALUATION SCORING ─────────────────────────────────────────────────────────
# (metric, weight, direction, clip_negatives)
#
# Weight tiers:
#   3.0  Core: return on equity and invested capital
#   2.5  Strong: gross margin (pricing power / moat proxy)
#   2.0  Important: efficiency, growth
#   1.5  Supporting: liquidity, leverage
SCORE_METRICS = [
    # ── Profitability ────────────────────────────────────────────────────────
    ("ROE",                       3.0, "higher", True),   # return on equity
    ("ROIC",                      3.0, "higher", True),   # return on invested capital
    ("Gross Profit Ratio",        3.0, "higher", False),  # margin / moat proxy

    # ── Efficiency ───────────────────────────────────────────────────────────
    ("Asset Turnover",            3.0, "higher", False),  # derived: Revenue / Assets

    # ── Liquidity ────────────────────────────────────────────────────────────
    ("Current Ratio",             1.5, "higher", False),
    ("Quick Ratio",               1.5, "higher", False),  # derived: (CA-Inventory)/CL

    # ── Growth ───────────────────────────────────────────────────────────────
    ("Net Income Growth",         2.0, "higher", False),
    ("Free Cash Flow Growth",     2.0, "higher", False),
    ("Operating Cash Flow Growth",2.0, "higher", False),

    # ── Leverage (lower = safer) ─────────────────────────────────────────────
    ("Financial Leverage",        3.0, "lower",  False),  # derived: Assets / Equity
    ("Debt To Equity",            1.5, "lower",  False),
]

# Financial Leverage threshold above which an industry is flagged as bank-like
BANK_LEVERAGE_THRESHOLD = 8.0

# Metrics excluded from scoring for bank-like groups (Financial Leverage > threshold).
# Each exclusion has a structural reason — these metrics are not quality signals
# for banks and would either artificially boost or unfairly penalise them.
_BANK_EXCLUDED_METRICS = {
    # ROE / ROIC: mechanically inflated by leverage (ROE = ROA × Assets/Equity).
    # A bank with 1% ROA at 15x leverage shows 15% ROE — not an indicator of quality.
    "ROE",
    "ROIC",
    # Asset Turnover: banks hold loans and securities as "assets", not operating assets.
    # Revenue/Assets is near-zero structurally and does not reflect operational efficiency.
    "Asset Turnover",
    # Liquidity ratios: a bank's current liabilities are deposits (callable on demand)
    # and its current assets include long-dated loans — these ratios are meaningless.
    "Current Ratio",
    "Quick Ratio",
    # Leverage ratios: high Assets/Equity is the bank business model (deposits = liability,
    # loans = asset). Penalising this conflates structure with recklessness.
    "Financial Leverage",
    "Debt To Equity",
    # FCF Growth: loan originations are recorded as operating cash outflows, making
    # FCF deeply negative in growth years regardless of underlying profitability.
    "Free Cash Flow Growth",
}

# Upper bound for bank detection: leverage > 500x is almost certainly a data
# artefact (a company with near-zero equity pulling the group average up) rather
# than a genuine high-leverage financial business. Real banks sit in the 8–40x
# range; values above 500 should be treated as data noise and scored normally.
_BANK_LEVERAGE_MAX = 500.0


def _is_bank_like(lev: float | None) -> bool:
    """True only for genuine high-leverage financial groups (not data artefacts)."""
    return lev is not None and BANK_LEVERAGE_THRESHOLD < lev <= _BANK_LEVERAGE_MAX


# ── CORE COMPUTE FUNCTIONS ────────────────────────────────────────────────────

# FX-normalised size weight (see _avg_exprs). Converts each filer's Market Cap to
# USD before weighting so a ¥/₩ cap is not summed against a $ cap at face value.
# The rate is the one that applied at the ROW'S OWN fiscal year end: converting a
# 2016 cap at today's rate understates a JPY filer by ~28% and a KRW filer by ~19%
# while inflating EUR/GBP by ~8%. The most recent year is the exception — its cap
# is refreshed to spot weekly, so it pairs with the spot rate.
# USD / NULL currency -> 1.0 per unit; an unknown currency -> NULL, so that row
# drops from both numerator and denominator.
# Any query using this MUST carry _FX_JOIN_SQL.
_FX_SPOT_FROM_YEAR = date.today().year - 1

_FX_JOIN_SQL = (
    ' LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"'
    ' LEFT JOIN fx_rates_hist xh ON xh.currency = f."Reported Currency"'
    ' AND xh.year = CAST(f."Calendar Year" AS INTEGER)'
)

_FX_WEIGHT_SQL = (
    'f."Market Cap" * COALESCE('
    f'CASE WHEN CAST(f."Calendar Year" AS INTEGER) < {_FX_SPOT_FROM_YEAR} '
    'THEN xh.usd_per_unit END, '
    'x.usd_per_unit, '
    "CASE WHEN f.\"Reported Currency\" = 'USD' "
    "OR f.\"Reported Currency\" IS NULL THEN 1.0 ELSE NULL END)"
)


def _avg_exprs(target_metrics: list[str], weight: str = _FX_WEIGHT_SQL) -> str:
    """Build size-weighted average SQL expressions for stored and derived metrics.

    Formula: SUM(value * weight) / SUM(weight)  — only over rows where both the
    metric and the weight are non-NULL.

    `weight` defaults to `_FX_WEIGHT_SQL`, an FX-normalised USD market cap: a
    company's Market Cap converted to USD so a ¥/₩ cap is not summed against a $
    cap at face value. It resolves to NULL for unknown currencies, so those rows
    drop from both numerator and denominator. Callers MUST include the two joins
    in `_FX_JOIN_SQL` (spot `x` + per-year `xh`).
    Metric VALUES are never FX-converted — ratios stay currency-neutral.

    Denominator trick: `(expr) * 0 + weight` evaluates to NULL whenever expr is
    NULL (so that ticker is excluded from both numerator and denominator), and
    equals the weight when expr is valid. This avoids double-counting the weight
    of tickers that are missing a given metric.
    """
    parts = []
    for m in target_metrics:
        if m in DERIVED_METRICS:
            expr = DERIVED_METRICS[m]
            parts.append(
                f'SUM(({expr}) * ({weight})) /\n'
                f'    NULLIF(SUM(({expr}) * 0 + ({weight})), 0) AS "{m}"'
            )
        else:
            col = f'f."{m}"'
            parts.append(
                f'SUM({col} * ({weight})) /\n'
                f'    NULLIF(SUM({col} * 0 + ({weight})), 0) AS "{m}"'
            )
    return ",\n    ".join(parts)


def _compute_averages(
    db: FinancialDB,
    group_col: str,
    metrics: list[str] | None = None,
    min_tickers: int = 1,
) -> dict[str, dict]:
    """AVG of each metric grouped by group_col across all years."""
    stored  = [m for m in (metrics or METRIC_COLS) if m not in DERIVED_METRICS]
    derived = list(ALL_DERIVED_NAMES)   # always compute; they use SQL expressions
    target  = stored + derived

    sql = f"""
        SELECT
            t.{group_col},
            COUNT(DISTINCT f.Ticker) AS ticker_count,
            {_avg_exprs(target)}
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        {_FX_JOIN_SQL}
        WHERE t.{group_col} IS NOT NULL
          AND f."Market Cap" > 0
          AND {_FX_WEIGHT_SQL} < 1e14
        GROUP BY t.{group_col}
        HAVING ticker_count >= {min_tickers}
        ORDER BY t.{group_col}
    """
    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(sql).fetchall()
    finally:
        conn.close()

    result = {}
    for row in rows:
        label = row[group_col]
        entry = {"_ticker_count": row["ticker_count"]}
        for m in target:
            v = row[m]
            entry[m] = float(v) if v is not None else None
        result[label] = entry
    return result


def _compute_averages_by_year(
    db: FinancialDB,
    group_col: str,
    metrics: list[str] | None = None,
    min_tickers: int = 1,
) -> dict[int, dict[str, dict]]:
    """AVG of each metric grouped by (group_col, Calendar Year)."""
    stored  = [m for m in (metrics or METRIC_COLS) if m not in DERIVED_METRICS]
    derived = list(ALL_DERIVED_NAMES)   # always compute; they use SQL expressions
    target  = stored + derived

    sql = f"""
        SELECT
            t.{group_col},
            CAST(f."Calendar Year" AS INTEGER) AS yr,
            COUNT(DISTINCT f.Ticker) AS ticker_count,
            {_avg_exprs(target)}
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        {_FX_JOIN_SQL}
        WHERE t.{group_col} IS NOT NULL
          AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
          AND f."Market Cap" > 0
          AND {_FX_WEIGHT_SQL} < 1e14
        GROUP BY t.{group_col}, yr
        HAVING ticker_count >= {min_tickers}
        ORDER BY yr, t.{group_col}
    """
    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(sql).fetchall()
    finally:
        conn.close()

    result: dict[int, dict] = {}
    for row in rows:
        yr    = int(row["yr"])
        label = row[group_col]
        result.setdefault(yr, {})
        entry = {"_ticker_count": row["ticker_count"]}
        for m in target:
            v = row[m]
            entry[m] = float(v) if v is not None else None
        result[yr][label] = entry
    return result


def compute_industry_averages(db, metrics=None, min_tickers=1):
    return _compute_averages(db, "industry", metrics, min_tickers)

def compute_sector_averages(db, metrics=None, min_tickers=1):
    return _compute_averages(db, "sector", metrics, min_tickers)

def compute_industry_averages_by_year(db, metrics=None, min_tickers=1):
    return _compute_averages_by_year(db, "industry", metrics, min_tickers)

def compute_sector_averages_by_year(db, metrics=None, min_tickers=1):
    return _compute_averages_by_year(db, "sector", metrics, min_tickers)


# ── CAPE APPROXIMATION ────────────────────────────────────────────────────────

def compute_cape(db: FinancialDB, group_col: str) -> dict[str, float | None]:
    """
    Simplified CAPE (Cyclically Adjusted P/E) per industry/sector.

    Method: for each ticker with >= 5 years of positive EPS Diluted, compute
    the average EPS across all available years as the 'cyclically adjusted' EPS.
    Then CAPE = implied share price (Market Cap / Shares) / avg_EPS.
    Average across tickers in each group.

    Note: no CPI adjustment (not in financials.db). This approximates CAPE
    as a smoothed-earnings PE rather than a true inflation-adjusted Shiller PE.
    """
    sql = f"""
        WITH eps_history AS (
            SELECT
                f.Ticker,
                AVG(CASE WHEN f."EPS Diluted" > 0 THEN f."EPS Diluted" END) AS avg_eps,
                COUNT(CASE WHEN f."EPS Diluted" > 0 THEN 1 END)              AS pos_eps_years
            FROM financials f
            WHERE f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
            GROUP BY f.Ticker
            HAVING pos_eps_years >= 5
        ),
        latest_price AS (
            SELECT f.Ticker,
                   f."Market Cap" / NULLIF(f."Weighted Average Shs Out Dil", 0) AS implied_price,
                   -- implied_price stays LOCAL (currency-neutral vs local EPS);
                   -- the WEIGHT converts to USD so a JPY/KRW cap is not summed
                   -- against a USD cap at face value (unknown ccy -> NULL ->
                   -- dropped from both sides of the weighted mean).
                   CASE WHEN f."Market Cap" > 0 AND ({_FX_WEIGHT_SQL}) < 1e14
                        THEN ({_FX_WEIGHT_SQL}) END AS mktcap
            FROM financials f
            {_FX_JOIN_SQL}
            INNER JOIN (
                SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS max_yr
                FROM financials
                WHERE "Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
                  AND "Market Cap" IS NOT NULL
                  AND "Weighted Average Shs Out Dil" > 0
                GROUP BY Ticker
            ) mx ON mx.Ticker = f.Ticker
                 AND CAST(f."Calendar Year" AS INTEGER) = mx.max_yr
        )
        SELECT
            t.{group_col},
            SUM((lp.implied_price / NULLIF(eh.avg_eps, 0)) * lp.mktcap) /
            NULLIF(SUM(lp.mktcap), 0) AS cape
        FROM eps_history eh
        JOIN latest_price lp  ON lp.Ticker = eh.Ticker
        JOIN tickers t        ON t.ticker  = eh.Ticker
        WHERE t.{group_col} IS NOT NULL
          AND lp.implied_price > 0
          AND eh.avg_eps > 0
        GROUP BY t.{group_col}
    """
    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(sql).fetchall()
    finally:
        conn.close()
    return {row[group_col]: (float(row["cape"]) if row["cape"] is not None else None)
            for row in rows}


# ── SIMPLIFIED DCF ────────────────────────────────────────────────────────────

def compute_dcf(
    db: FinancialDB,
    group_col: str,
    wacc: float = 0.10,
    terminal_growth: float = 0.03,
    projection_years: int = 5,
) -> dict[str, dict[str, float | None]]:
    """
    Simplified DCF per industry/sector using data from financials.db only.

    For each ticker:
      - FCF per share (most recent year)
      - Historical average FCF growth rate (capped to [-15%, 20%] to avoid distortion)
      - Project FCF/share for `projection_years` years
      - Terminal value = FCF_final * (1 + terminal_g) / (WACC - terminal_g)
      - Intrinsic value = PV of projected FCFs + PV of terminal value
      - Implied current price = Market Cap / Shares Out (most recent year)
      - Margin of safety = (intrinsic - implied_price) / implied_price

    Returns {group: {"dcf_intrinsic": float, "margin_of_safety": float,
                     "avg_fcf_growth": float, "ticker_count": int}}
    """
    beta_expr, beta_join = _resolver_beta_sql()
    sql = f"""
        WITH latest AS (
            SELECT f.Ticker,
                   f."Free Cash Flow Per Share"          AS fcf_ps,
                   f."Free Cash Flow Growth"             AS fcf_growth,
                   f."Market Cap" / NULLIF(f."Weighted Average Shs Out Dil", 0) AS implied_price,
                   -- weight in USD (see compute_cape note); per-share figures
                   -- stay local so the DCF ratio math is currency-neutral.
                   CASE WHEN f."Market Cap" > 0 AND ({_FX_WEIGHT_SQL}) < 1e14
                        THEN ({_FX_WEIGHT_SQL}) END      AS mktcap
            FROM financials f
            {_FX_JOIN_SQL}
            INNER JOIN (
                SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS max_yr
                FROM financials
                WHERE "Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
                  AND "Free Cash Flow Per Share" IS NOT NULL
                  AND "Market Cap" IS NOT NULL
                GROUP BY Ticker
            ) mx ON mx.Ticker = f.Ticker
                 AND CAST(f."Calendar Year" AS INTEGER) = mx.max_yr
            WHERE f."Free Cash Flow Per Share" > 0
              AND f."Market Cap" > 0
              AND f."Weighted Average Shs Out Dil" > 0
        )
        SELECT
            t.{group_col},
            l.Ticker,
            l.fcf_ps,
            l.fcf_growth,
            l.implied_price,
            l.mktcap,
            {beta_expr} AS beta
        FROM latest l
        JOIN tickers t ON t.ticker = l.Ticker{beta_join}
        WHERE t.{group_col} IS NOT NULL
    """
    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(sql).fetchall()
    finally:
        conn.close()

    # Group by industry/sector
    groups: dict[str, list] = {}
    for row in rows:
        g = row[group_col]
        groups.setdefault(g, []).append({
            "fcf_ps":        row["fcf_ps"],
            "fcf_growth":    row["fcf_growth"],
            "implied_price": row["implied_price"],
            "mktcap":        row["mktcap"],
            "beta":          row["beta"],
        })

    result = {}
    for g, tickers in groups.items():
        intrinsics  = []   # (intrinsic, mktcap)
        mos_vals    = []   # (mos, mktcap)
        growth_vals = []   # (growth, mktcap)

        for t in tickers:
            fcf_ps  = t["fcf_ps"]
            growth  = t["fcf_growth"]
            price   = t["implied_price"]
            mktcap  = t["mktcap"] or 0.0
            beta_t  = t["beta"]

            if fcf_ps is None or fcf_ps <= 0 or price is None or price <= 0:
                continue

            # Cap growth rate to a realistic range
            if growth is None:
                growth = 0.05
            else:
                growth = max(-0.15, min(growth, 0.20))

            # Per-ticker discount rate via CAPM when beta is known; falls back
            # to the caller-supplied `wacc` (default 10%) when beta is missing.
            disc = capm_discount_rate(beta_t) if beta_t is not None else wacc
            if disc <= terminal_growth:
                continue

            # Only count this ticker's growth toward the reported average once it
            # actually contributes an intrinsic value below. Appending before the
            # discount-rate gate let excluded tickers skew avg_fcf_growth.
            growth_vals.append((growth, mktcap))

            # Project FCF per share
            pv_fcfs = 0.0
            fcf = fcf_ps
            for yr in range(1, projection_years + 1):
                fcf = fcf * (1 + growth)
                pv_fcfs += fcf / (1 + disc) ** yr

            # Terminal value
            terminal_fcf = fcf * (1 + terminal_growth)
            terminal_value = terminal_fcf / (disc - terminal_growth)
            pv_terminal    = terminal_value / (1 + disc) ** projection_years

            intrinsic = pv_fcfs + pv_terminal
            mos       = (intrinsic - price) / price

            intrinsics.append((intrinsic, mktcap))
            mos_vals.append((mos, mktcap))

        if not intrinsics:
            result[g] = None
            continue

        def _wt_avg(pairs):
            total_w = sum(w for _, w in pairs)
            if total_w == 0:
                return sum(v for v, _ in pairs) / len(pairs)
            return sum(v * w for v, w in pairs) / total_w

        result[g] = {
            "dcf_intrinsic":    round(_wt_avg(intrinsics),  2),
            "margin_of_safety": round(_wt_avg(mos_vals),    4),
            "avg_fcf_growth":   round(_wt_avg(growth_vals), 4),
            "ticker_count":     len(intrinsics),
        }

    return result


# ── SCORING & RANKING ─────────────────────────────────────────────────────────

def score_and_rank(
    year_data: dict[str, dict],
    cape_data: dict[str, float | None] | None = None,
) -> dict[str, float]:
    """
    Compute composite Value Score (0–100) for each group in a single year.
    Uses percentile ranking within peers for each scoring metric, then a
    per-group weighted average. Higher score = more attractive to invest in.

    Bank-like groups (Financial Leverage > BANK_LEVERAGE_THRESHOLD) are
    automatically excluded from capital intensity, leverage, and cash flow
    metrics that are structurally distorted by their business model. Their
    score is normalised against only the metrics that are applicable to them,
    so they are neither artificially boosted nor unfairly capped.

    cape_data: optional {group: cape_value} from compute_cape(). CAPE is a
    cross-time metric so it's passed separately rather than stored per year.
    """
    groups = list(year_data.keys())
    if not groups:
        return {}

    # Determine which groups are bank-like based on structural leverage.
    # Uses _is_bank_like() which caps at 500x to exclude data artefacts
    # (e.g. Real Estate groups with near-zero-equity outliers inflating AVG).
    is_bank: dict[str, bool] = {}
    for g in groups:
        lev = year_data[g].get("Financial Leverage")
        is_bank[g] = _is_bank_like(lev)

    # Per-group accumulators — normalising by applicable weight only ensures
    # banks are not penalised for metrics excluded from their scoring
    scores       = {g: 0.0 for g in groups}
    weights_used = {g: 0.0 for g in groups}

    for metric, weight, direction, clip_neg in SCORE_METRICS:
        raw: dict[str, float | None] = {}
        for g in groups:
            # Skip structurally distorted metrics for bank-like groups
            if is_bank[g] and metric in _BANK_EXCLUDED_METRICS:
                raw[g] = None
                continue

            # CAPE lives in cape_data, not in the per-year averages dict
            if metric == "CAPE (approx)":
                v = cape_data.get(g) if cape_data else None
            else:
                v = year_data[g].get(metric)

            if v is None:
                raw[g] = None
            elif clip_neg and v < 0:
                raw[g] = None
            else:
                raw[g] = v

        valid = [(g, v) for g, v in raw.items() if v is not None]
        if len(valid) < 2:
            continue

        sorted_valid = sorted(valid, key=lambda x: x[1],
                              reverse=(direction == "lower"))
        n        = len(sorted_valid)
        pct_rank = {g: (i / (n - 1)) * 100 for i, (g, _) in enumerate(sorted_valid)}

        for g in groups:
            if g in pct_rank:
                scores[g]       += pct_rank[g] * weight
                weights_used[g] += weight
            # Groups with None (missing data or excluded) contribute nothing
            # to numerator OR denominator — their score remains comparable

    # Normalise each group by its own applicable weight total
    for g in groups:
        if weights_used[g] > 0:
            scores[g] = round(scores[g] / weights_used[g], 2)
        else:
            scores[g] = 0.0

    return scores


# ── PRINT HELPERS ─────────────────────────────────────────────────────────────

def fmt(value: float | None, width: int = 14) -> str:
    if value is None:
        return "N/A".rjust(width)
    abs_v = abs(value)
    if abs_v >= 1_000_000_000_000:
        s = f"{value / 1_000_000_000_000:.2f}T"
    elif abs_v >= 1_000_000_000:
        s = f"{value / 1_000_000_000:.2f}B"
    elif abs_v >= 1_000_000:
        s = f"{value / 1_000_000:.2f}M"
    elif abs_v >= 1_000:
        s = f"{value:,.1f}"
    else:
        s = f"{value:.4f}"
    return s.rjust(width)


_PRINT_SECTIONS = [
    ("Profitability", [
        "Gross Profit Ratio", "Operating Income Ratio", "Net Income Ratio",
        "EBITDA Ratio", "ROE", "ROIC", "Return On Tangible Assets",
        "Income Quality", "FCF To Revenue", "OCF To Revenue",
    ]),
    ("Income Statement", [
        "Revenue", "Gross Profit", "Operating Income", "EBITDA",
        "Net Income", "EPS",
        "Interest Expense", "Income Tax Expense", "Depreciation And Amortization",
        "Research And Development Expenses",
    ]),
    ("Per-Share Metrics", [
        "EPS Diluted", "Free Cash Flow Per Share", "Operating Cash Flow Per Share",
        "Revenue Per Share", "Book Value Per Share", "Tangible Book Value Per Share",
        "Cash Per Share", "Shareholders Equity Per Share",
    ]),
    ("Balance Sheet", [
        "Total Assets", "Total Liabilities", "Total Equity",
        "Total Stockholders Equity", "Total Debt", "Net Debt",
        "Cash And Cash Equivalents", "Net Receivables", "Inventory",
        "Total Current Assets", "Total Current Liabilities",
        "Long Term Debt", "Property Plant Equipment Net",
        "Goodwill", "Intangible Assets", "Retained Earnings",
        "Tangible Book Value Ratio", "Book Value To Market",
    ]),
    ("Liquidity", [
        "Current Ratio", "Quick Ratio", "Cash And Cash Equivalents",
        "Cash And Short Term Investments",
    ]),
    ("Leverage & Capital Structure", [
        "Debt To Equity", "Debt To Assets", "Net Debt To EBITDA",
        "Financial Leverage", "Equity Multiplier", "Net Debt To Revenue",
        "Interest Coverage",
    ]),
    ("Efficiency", [
        "Asset Turnover", "Fixed Asset Turnover",
        "Receivables Turnover", "Inventory Turnover", "Payables Turnover",
        "Days Sales Outstanding", "Days Of Inventory On Hand",
        "Days Payables Outstanding", "Cash Conversion Cycle",
    ]),
    ("Capital Intensity", [
        "Capital Intensity Ratio", "Capex To Revenue", "Capex To Assets",
        "Capex To Operating Cash Flow", "Capex To Depreciation",
        "Depreciation To Assets", "Property Plant Equipment Net",
        "R&D Intensity", "SGA Intensity",
        "Sales General And Administrative To Revenue",
        "Research And Development To Revenue",
    ]),
    ("Cash Flow", [
        "Operating Cash Flow", "Capital Expenditure", "Free Cash Flow",
        "Net Cash Provided By Operating Activities",
        "Net Cash Used For Investing Activities",
        "Net Cash Used Provided By Financing Activities",
        "Stock Based Compensation",
    ]),
    ("Growth", [
        "Revenue Growth", "Gross Profit Growth", "Operating Income Growth",
        "Net Income Growth", "EPS Growth", "EPS Diluted Growth",
        "Operating Cash Flow Growth", "Free Cash Flow Growth",
        "Book Value per Share Growth",
        "Ten Y Revenue Growth Per Share", "Five Y Revenue Growth Per Share",
        "Three Y Revenue Growth Per Share",
    ]),
    ("Valuation", [
        "Market Cap", "Enterprise Value", "PE Ratio", "PB Ratio",
        "Price To Sales Ratio", "POCF Ratio", "PFCF Ratio",
        "EV To Sales", "Enterprise Value Over EBITDA",
        "EV To Operating Cash Flow", "EV To Free Cash Flow",
        "Earnings Yield", "Free Cash Flow Yield",
        "Graham Number", "Graham Net Net",
    ]),
    ("Dividends & Payouts", [
        "Dividend Yield", "Payout Ratio", "Dividend",
        "Dividends Per Share Growth",
    ]),
]


def print_averages(
    averages: dict[str, dict],
    metrics: list[str],
    group_label: str = "Industry",
    cape_data: dict | None = None,
    dcf_data: dict | None = None,
) -> None:
    sep_major = "=" * 72
    sep_minor = "-" * 72
    # Deduplicate: derived metrics not already in the metrics list
    all_metrics = metrics + [m for m in ALL_DERIVED_NAMES if m not in metrics]

    for group, data in averages.items():
        n   = data["_ticker_count"]
        lev = data.get("Financial Leverage")
        bank_flag = _is_bank_like(lev)

        print()
        print(sep_major)
        header = f"  [{group_label}] {group}  (n={n} tickers)"
        if bank_flag:
            header += f"  *** HIGH LEVERAGE ({lev:.1f}x) ***"
        print(header)
        print(sep_major)

        sectioned = set()
        for section_name, section_metrics in _PRINT_SECTIONS:
            visible = [m for m in section_metrics
                       if m in all_metrics and data.get(m) is not None]
            if not visible:
                continue
            print(f"\n  {section_name}")
            print(f"  {sep_minor[:68]}")
            for m in visible:
                print(f"  {m:<46}{fmt(data[m])}")
                sectioned.add(m)

        others = [m for m in all_metrics
                  if m not in sectioned and data.get(m) is not None]
        if others:
            print(f"\n  Other Metrics")
            print(f"  {sep_minor[:68]}")
            for m in others:
                print(f"  {m:<46}{fmt(data[m])}")

        # CAPE
        if cape_data and group in cape_data and cape_data[group] is not None:
            print(f"\n  Cyclically Adjusted P/E (CAPE approx.)")
            print(f"  {sep_minor[:68]}")
            print(f"  {'CAPE (smoothed-earnings P/E)':<46}{fmt(cape_data[group])}")

        # DCF
        if dcf_data and group in dcf_data and dcf_data[group] is not None:
            d = dcf_data[group]
            print(f"\n  Simplified DCF  (WACC=10%, terminal g=3%, 5yr projection)")
            print(f"  {sep_minor[:68]}")
            print(f"  {'Avg DCF Intrinsic Value / Share':<46}{fmt(d['dcf_intrinsic'])}")
            mos_pct = d['margin_of_safety'] * 100
            print(f"  {'Avg Margin of Safety':<46}{fmt(mos_pct)} %")
            print(f"  {'Avg Historical FCF Growth Used':<46}{fmt(d['avg_fcf_growth'] * 100)} %")
            print(f"  {'Tickers with valid DCF data':<46}{str(d['ticker_count']).rjust(14)}")

        # Bank leverage detail
        if bank_flag:
            print(f"\n  *** BANK / HIGH-LEVERAGE INDUSTRY DETAIL ***")
            print(f"  {sep_minor[:68]}")
            print(f"  {'Financial Leverage (Assets/Equity)':<46}{fmt(lev)}")
            for m in ["Debt To Equity", "Debt To Assets", "Net Debt To EBITDA",
                      "Total Assets", "Total Equity", "Total Debt",
                      "Interest Coverage", "Interest Expense"]:
                if data.get(m) is not None:
                    print(f"  {m:<46}{fmt(data[m])}")
            print(f"\n  Interpretation: Financial leverage >{BANK_LEVERAGE_THRESHOLD:.0f}x is")
            print(f"  typical for banks/financials (deposits = liability, loans = asset).")
            print(f"  High leverage amplifies returns but increases systemic risk.")

    print()
    print(sep_major)
    total_label = (group_label.lower() + "ies"
                   if group_label.lower().endswith("y")
                   else group_label.lower() + "s")
    print(f"  Total {total_label} shown: {len(averages)}")
    print(sep_major)
    print()


# ── HISTORICAL CHARTS ────────────────────────────────────────────────────────
# Metrics shown in the Charts tab, in order.  Each becomes one line chart.
_CHART_METRICS = [
    ("Net Income",         "Net Income"),
    ("Free Cash Flow",     "Free Cash Flow"),
    ("Gross Profit",       "Gross Profit"),
    ("Gross Profit Ratio", "Gross Profit Ratio  (%)"),
    ("ROE",                "ROE  (Return on Equity)"),
    ("ROIC",               "ROIC  (Return on Invested Capital)"),
    ("ROA",                "ROA  (Net Income / Total Assets)"),
    ("Financial Leverage", "Assets / Equity  (Financial Leverage)"),
    ("Asset Turnover",     "Revenue / Assets  (Asset Turnover)"),
]


def _safe_sheet_name(name: str) -> str:
    """Truncate and strip characters forbidden in Excel sheet names."""
    for ch in r'\/?*[]:/':
        name = name.replace(ch, "_")
    return name[:31]


def _add_charts_sheet(
    wb,
    avgs_by_year: dict,
    scores_cache: dict,
    group_label: str,
    max_groups: int = 15,
) -> None:
    """
    Create one chart tab per group (top max_groups by avg score).

    Each tab contains 9 metric sections. Each section has:
      - A vertical bar chart showing the historical value (years on X-axis)
      - A vertical bar chart below it showing YoY % change

    Data is stored in a hidden _ChartData sheet organised by group.
    Columns per group block:
      col 1 : Year
      col 2+2i  : metric i value
      col 3+2i  : metric i YoY % change
    """
    from openpyxl.chart import BarChart, Reference
    from openpyxl.chart.series import DataPoint
    from openpyxl.utils import get_column_letter

    years = sorted(avgs_by_year.keys())
    if not years:
        return

    # Top N groups by average value score
    all_groups = sorted({g for yd in avgs_by_year.values() for g in yd})
    avg_scores: dict[str, float] = {}
    for g in all_groups:
        vals = [scores_cache[yr][g] for yr in years
                if yr in scores_cache and g in scores_cache[yr]]
        avg_scores[g] = sum(vals) / len(vals) if vals else 0.0
    groups = sorted(all_groups, key=lambda g: avg_scores[g], reverse=True)[:max_groups]

    n_metrics = len(_CHART_METRICS)
    # Column layout within each group block (1-indexed):
    #   col 1        = Year
    #   col 2+2*mi   = metric mi value
    #   col 3+2*mi   = metric mi YoY % change
    BLOCK_COLS = 1 + n_metrics * 2   # total columns per group block

    # ── Hidden data sheet ─────────────────────────────────────────────────────
    ws_data = wb.create_sheet("_ChartData")
    ws_data.sheet_state = "hidden"

    # group -> (hdr_row, first_data_row, last_data_row)
    group_rows: dict[str, tuple[int, int, int]] = {}
    cur = 1

    for group in groups:
        hdr = cur
        ws_data.cell(row=hdr, column=1, value="Year")
        for mi, (metric, _) in enumerate(_CHART_METRICS):
            ws_data.cell(row=hdr, column=2 + mi * 2,     value=metric)
            ws_data.cell(row=hdr, column=2 + mi * 2 + 1, value=metric + " %chg")

        first_data = hdr + 1
        prev: dict[str, float | None] = {}

        for yr in years:
            cur += 1
            ws_data.cell(row=cur, column=1, value=yr)
            for mi, (metric, _) in enumerate(_CHART_METRICS):
                raw  = avgs_by_year.get(yr, {}).get(group, {}).get(metric)
                val  = float(raw) if raw is not None else None
                pval = prev.get(metric)

                ws_data.cell(row=cur, column=2 + mi * 2, value=val)

                if val is not None and pval is not None and pval != 0:
                    pct = round((val - pval) / abs(pval) * 100, 2)
                else:
                    pct = None
                ws_data.cell(row=cur, column=2 + mi * 2 + 1, value=pct)
                prev[metric] = val

        last_data = cur
        group_rows[group] = (hdr, first_data, last_data)
        cur += 3   # gap before next group

    # ── One sheet per group ───────────────────────────────────────────────────
    CHART_W   = 18    # cm
    CHART_H   = 10    # cm
    VAL_COL   = "A"   # left anchor for value chart
    PCT_COL   = "K"   # right anchor for % change chart (≈10 cols right)
    ROW_STEP  = 22    # rows between chart pairs

    for group in groups:
        hdr, first_data, last_data = group_rows[group]
        ws_g = wb.create_sheet(_safe_sheet_name(group))
        ws_g.sheet_view.showGridLines = False

        for mi, (metric, title) in enumerate(_CHART_METRICS):
            val_col = 2 + mi * 2
            pct_col = 2 + mi * 2 + 1
            row_anchor = 1 + mi * ROW_STEP

            cats = Reference(ws_data,
                             min_row=first_data, max_row=last_data, min_col=1)

            # ── Value bar chart ───────────────────────────────────────────
            bar = BarChart()
            bar.type    = "col"
            bar.title   = title
            bar.style   = 10
            bar.width   = CHART_W
            bar.height  = CHART_H
            bar.legend  = None
            bar.y_axis.title = title
            bar.x_axis.title = "Year"

            bar.add_data(
                Reference(ws_data, min_row=hdr, max_row=last_data,
                          min_col=val_col, max_col=val_col),
                titles_from_data=True,
            )
            bar.set_categories(cats)
            ws_g.add_chart(bar, f"{VAL_COL}{row_anchor}")

            # ── YoY % change bar chart ────────────────────────────────────
            pct_bar = BarChart()
            pct_bar.type    = "col"
            pct_bar.title   = f"{title}  —  YoY % Change"
            pct_bar.style   = 10
            pct_bar.width   = CHART_W
            pct_bar.height  = CHART_H
            pct_bar.legend  = None
            pct_bar.y_axis.title = "% Change"
            pct_bar.x_axis.title = "Year"

            pct_bar.add_data(
                Reference(ws_data, min_row=hdr, max_row=last_data,
                          min_col=pct_col, max_col=pct_col),
                titles_from_data=True,
            )
            pct_bar.set_categories(cats)
            ws_g.add_chart(pct_bar, f"{PCT_COL}{row_anchor}")


# ── EXCEL COLUMN ORDER ────────────────────────────────────────────────────────
# All metrics that feed the ranking score appear first, in score-weight order,
# so a value investor sees every ranked number without scrolling right.
# CAPE is omitted here and spliced in dynamically after "Debt To Equity"
# (it lives in cape_data, not the per-year averages dict).
# Remaining (non-scoring) metrics follow after.
# Note: Beta vs S&P 500 requires daily price history not in financials.db.
_PRIORITY_DISPLAY = [m for m, *_ in SCORE_METRICS if m != "CAPE (approx)"]

# ── EXCEL EXPORT ──────────────────────────────────────────────────────────────

def export_excel(
    avgs_by_year: dict[int, dict[str, dict]],
    metrics: list[str],
    group_label: str,
    output_path: str,
    cape_data: dict | None = None,
    dcf_data: dict | None = None,
) -> None:
    try:
        import pandas as pd
        from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("  pip install pandas openpyxl  to enable Excel export")
        return

    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    all_metrics = metrics + [m for m in ALL_DERIVED_NAMES if m not in metrics]

    # Build priority block: only include cols that actually exist in all_metrics,
    # then splice CAPE in after "Debt To Equity" (or at end of priority block).
    priority = [c for c in _PRIORITY_DISPLAY if c in all_metrics]
    if cape_data:
        insert_after = "Debt To Equity"
        if insert_after in priority:
            priority.insert(priority.index(insert_after) + 1, "CAPE (approx)")
        else:
            priority.append("CAPE (approx)")

    priority_set = set(priority)
    remaining    = [c for c in all_metrics if c not in priority_set]

    col_order = (
        ["Rank", group_label, "Tickers", "Value Score"]
        + priority
        + (["DCF Intrinsic/Share", "Margin of Safety %", "FCF Growth Used %"] if dcf_data else [])
        + remaining
    )

    header_fill = PatternFill("solid", fgColor="1F3864")
    header_font = Font(bold=True, color="FFFFFF", size=9)
    score_fill  = PatternFill("solid", fgColor="E8F0FE")
    bank_fill   = PatternFill("solid", fgColor="FFF2CC")   # yellow for high-leverage
    top3_fills  = [
        PatternFill("solid", fgColor="FFD700"),
        PatternFill("solid", fgColor="C0C0C0"),
        PatternFill("solid", fgColor="CD7F32"),
    ]
    thin   = Side(style="thin", color="CCCCCC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        years = sorted(avgs_by_year.keys())

        # Pre-compute scores once per year so the Summary sheet can reuse them
        scores_cache: dict[int, dict[str, float]] = {
            yr: score_and_rank(avgs_by_year[yr], cape_data)
            for yr in years
            if avgs_by_year[yr]
        }

        for yr in years:
            year_data = avgs_by_year[yr]
            if not year_data:
                continue
            scores = scores_cache[yr]

            rows = []
            for group, data in year_data.items():
                row: dict = {
                    "Rank":        0,
                    group_label:   group,
                    "Tickers":     data["_ticker_count"],
                    "Value Score": scores.get(group, 0.0),
                }
                if cape_data:
                    row["CAPE (approx)"] = cape_data.get(group)
                if dcf_data and dcf_data.get(group):
                    d = dcf_data[group]
                    row["DCF Intrinsic/Share"]   = d.get("dcf_intrinsic")
                    row["Margin of Safety %"]    = round(d.get("margin_of_safety", 0) * 100, 2)
                    row["FCF Growth Used %"]     = round(d.get("avg_fcf_growth", 0) * 100, 2)
                elif dcf_data:
                    row["DCF Intrinsic/Share"] = None
                    row["Margin of Safety %"]  = None
                    row["FCF Growth Used %"]   = None
                for m in all_metrics:
                    row[m] = data.get(m)
                rows.append(row)

            df = pd.DataFrame(rows)
            df = df.sort_values("Value Score", ascending=False).reset_index(drop=True)
            df["Rank"] = df.index + 1
            valid_cols = [c for c in col_order if c in df.columns]
            df = df[valid_cols]

            sheet_name = str(yr)
            df.to_excel(writer, sheet_name=sheet_name, index=False)
            ws = writer.sheets[sheet_name]

            # Header
            for cell in ws[1]:
                cell.fill      = header_fill
                cell.font      = header_font
                cell.alignment = Alignment(horizontal="center", wrap_text=True)
                cell.border    = border
            ws.row_dimensions[1].height = 30

            # Data rows
            lev_col_idx = None
            for i, col_name in enumerate(valid_cols, 1):
                if col_name == "Financial Leverage":
                    lev_col_idx = i

            for row_idx, ws_row in enumerate(
                ws.iter_rows(min_row=2, max_row=ws.max_row), start=1
            ):
                lev_val = None
                if lev_col_idx:
                    lev_cell = ws_row[lev_col_idx - 1]
                    if isinstance(lev_cell.value, (int, float)):
                        lev_val = lev_cell.value
                is_bank = _is_bank_like(lev_val)

                for cell in ws_row:
                    cell.border    = border
                    cell.alignment = Alignment(
                        horizontal="right" if isinstance(cell.value, (int, float)) else "left"
                    )
                    if row_idx <= 3:
                        cell.fill = top3_fills[row_idx - 1]
                    elif is_bank:
                        cell.fill = bank_fill
                    elif cell.column == 4:
                        cell.fill = score_fill

            # Column widths
            for col_cells in ws.columns:
                max_len = max(
                    len(str(c.value)) if c.value is not None else 0
                    for c in col_cells
                )
                ws.column_dimensions[
                    get_column_letter(col_cells[0].column)
                ].width = min(max_len + 3, 28)

            ws.freeze_panes = "C2"

        # ── Summary sheet ─────────────────────────────────────────────────────
        all_groups: set[str] = set()
        for yd in avgs_by_year.values():
            all_groups.update(yd.keys())

        summary_rows = []
        for group in sorted(all_groups):
            yr_scores = []
            for yr in years:
                if group in avgs_by_year.get(yr, {}):
                    s = scores_cache.get(yr, {}).get(group)
                    if s is not None:
                        yr_scores.append(s)
            if not yr_scores:
                continue
            row: dict = {
                "Rank":            0,
                group_label:       group,
                "Avg Value Score": round(sum(yr_scores) / len(yr_scores), 2),
                "Years With Data": len(yr_scores),
            }
            if cape_data:
                row["CAPE (approx)"] = cape_data.get(group)
            if dcf_data and dcf_data.get(group):
                d = dcf_data[group]
                row["DCF Intrinsic/Share"] = d.get("dcf_intrinsic")
                row["Margin of Safety %"]  = round(d.get("margin_of_safety", 0) * 100, 2)
            summary_rows.append(row)

        if summary_rows:
            sdf = pd.DataFrame(summary_rows)
            sdf = sdf.sort_values("Avg Value Score", ascending=False).reset_index(drop=True)
            sdf["Rank"] = sdf.index + 1
            s_cols = (["Rank", group_label, "Avg Value Score", "Years With Data"]
                      + (["CAPE (approx)"] if cape_data else [])
                      + (["DCF Intrinsic/Share", "Margin of Safety %"] if dcf_data else []))
            sdf = sdf[[c for c in s_cols if c in sdf.columns]]
            sdf.to_excel(writer, sheet_name="Summary", index=False)

            ws_s = writer.sheets["Summary"]
            for cell in ws_s[1]:
                cell.fill      = header_fill
                cell.font      = Font(bold=True, color="FFFFFF", size=10)
                cell.alignment = Alignment(horizontal="center")
            for row_idx, ws_row in enumerate(
                ws_s.iter_rows(min_row=2, max_row=ws_s.max_row), start=1
            ):
                if row_idx <= 3:
                    for cell in ws_row:
                        cell.fill = top3_fills[row_idx - 1]
            for col_cells in ws_s.columns:
                max_len = max(
                    len(str(c.value)) if c.value is not None else 0
                    for c in col_cells
                )
                ws_s.column_dimensions[
                    get_column_letter(col_cells[0].column)
                ].width = min(max_len + 3, 40)
            ws_s.freeze_panes = "B2"

        # ── Charts tab ────────────────────────────────────────────────────────
        _add_charts_sheet(writer.book, avgs_by_year, scores_cache, group_label)

    print(f"  Saved: {output_path}")


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Industry/sector financial averages with CAPE, DCF, and Excel export"
    )
    parser.add_argument("--industry",  "-i", help="Filter industries (substring)")
    parser.add_argument("--sector",    "-s", help="Filter sectors (substring)")
    parser.add_argument("--metric",    "-m", action="append", dest="metrics",
                        help="Specific metric(s) to include (default: all)")
    parser.add_argument("--min-tickers", type=int, default=1, metavar="N",
                        help="Min tickers per group (default: 1)")
    parser.add_argument("--sectors-only",    action="store_true")
    parser.add_argument("--industries-only", action="store_true")
    parser.add_argument("--no-excel",        action="store_true",
                        help="Skip Excel export")
    parser.add_argument("--no-cape",         action="store_true",
                        help="Skip CAPE computation")
    parser.add_argument("--no-dcf",          action="store_true",
                        help="Skip DCF computation")
    parser.add_argument("--output-dir",
                        default=os.path.join(_HERE, "output"),
                        help="Excel output folder (default: backend/output/)")
    parser.add_argument("--db",
                        default=os.path.join(_HERE, "..", "financials.db"))
    args = parser.parse_args()

    db      = FinancialDB(args.db)
    metrics = args.metrics if args.metrics else METRIC_COLS

    invalid = [m for m in metrics if m not in METRIC_COLS]
    if invalid:
        print(f"Unknown metric(s): {invalid}")
        sys.exit(1)

    total   = len(db.list_tickers())
    m_label = f"all ({len(metrics)})" if not args.metrics else str(metrics)
    print(f"\nComputing averages  |  tickers: {total}  |  metrics: {m_label}")
    print("NOTE: Beta/Volatility vs S&P 500 requires price history "
          "not stored in financials.db.\n      Use economicmetrics.py for that.")

    show_sectors    = not args.industries_only
    show_industries = not args.sectors_only

    # ── CAPE & DCF (computed once, shared between print and Excel) ─────────────
    cape_industry = cape_sector = None
    dcf_industry  = dcf_sector  = None

    if not args.no_cape:
        print("\nComputing CAPE approximations...")
        if show_industries:
            cape_industry = compute_cape(db, "industry")
        if show_sectors:
            cape_sector   = compute_cape(db, "sector")

    if not args.no_dcf:
        print("Computing simplified DCF estimates...")
        if show_industries:
            dcf_industry = compute_dcf(db, "industry")
        if show_sectors:
            dcf_sector   = compute_dcf(db, "sector")

    # ── PRINT ─────────────────────────────────────────────────────────────────
    if show_sectors:
        avgs = compute_sector_averages(db, metrics=metrics, min_tickers=args.min_tickers)
        if args.sector:
            q    = args.sector.lower()
            avgs = {k: v for k, v in avgs.items() if q in k.lower()}
        if avgs:
            print("\n" + "=" * 72)
            print("  SECTOR AVERAGES  (all years combined, market-cap weighted)")
            print("=" * 72)
            print_averages(avgs, metrics, "Sector", cape_sector, dcf_sector)

    if show_industries:
        avgs = compute_industry_averages(db, metrics=metrics, min_tickers=args.min_tickers)
        if args.industry:
            q    = args.industry.lower()
            avgs = {k: v for k, v in avgs.items() if q in k.lower()}
        if avgs:
            print("\n" + "=" * 72)
            print("  INDUSTRY AVERAGES  (all years combined, market-cap weighted)")
            print("=" * 72)
            print_averages(avgs, metrics, "Industry", cape_industry, dcf_industry)

    # ── EXCEL EXPORT ───────────────────────────────────────────────────────────
    if not args.no_excel:
        print("\nBuilding per-year data for Excel export...")

        if show_sectors:
            by_year = compute_sector_averages_by_year(
                db, metrics=metrics, min_tickers=args.min_tickers)
            if args.sector:
                q       = args.sector.lower()
                by_year = {yr: {k: v for k, v in yd.items() if q in k.lower()}
                           for yr, yd in by_year.items()}
            path = os.path.join(args.output_dir, "sector_averages_by_year.xlsx")
            print(f"  Exporting sector averages ({len(by_year)} years)...")
            export_excel(by_year, metrics, "Sector", path, cape_sector, dcf_sector)

        if show_industries:
            by_year = compute_industry_averages_by_year(
                db, metrics=metrics, min_tickers=args.min_tickers)
            if args.industry:
                q       = args.industry.lower()
                by_year = {yr: {k: v for k, v in yd.items() if q in k.lower()}
                           for yr, yd in by_year.items()}
            path = os.path.join(args.output_dir, "industry_averages_by_year.xlsx")
            print(f"  Exporting industry averages ({len(by_year)} years)...")
            export_excel(by_year, metrics, "Industry", path, cape_industry, dcf_industry)

        print(f"\nExcel files written to: {args.output_dir}")


if __name__ == "__main__":
    main()
