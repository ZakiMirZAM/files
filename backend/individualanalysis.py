"""
individualanalysis.py

Individual company valuation engine.  Takes a single ticker and decides — using
only the metrics stored in financials.db — what specifically makes this company
an excellent (or poor) investment.

Metrics consumed (all sourced from financials.db):
  - Horizontal analysis (YoY % change) on every financial-statement line item
  - Vertical analysis (common-size income statement and balance sheet)
  - Return on Assets, Equity, Sales, Invested Capital
  - Gross Profit (level + ratio)
  - Asset Turnover (Revenue / Total Assets)
  - Debt Service Coverage Ratio, Current Ratio, Quick Ratio
  - Interest Coverage Ratio
  - DCF Valuation
  - Operating Cash Flow / Free Cash Flow / NOPAT
  - Per-share metrics (Revenue, NI, OCF, FCF, BVPS, etc.)

Output:
  Console summary + backend/output/individual_<TICKER>.xlsx

Usage:
    python individualanalysis.py AAPL
    python individualanalysis.py MSFT --no-excel
    python individualanalysis.py NVDA --output-dir custom/path
"""

from __future__ import annotations

import argparse
import datetime as _dt
import logging
import math
import os
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "data"))

from financial_db import (  # noqa: E402
    FinancialDB,
    capm_discount_rate,
    RISK_FREE_RATE,
    EQUITY_RISK_PREMIUM,
)

# Damodaran Ch.9 earnings/capital normalization (self-contained, no back-import).
import earnings_normalization as _earn_norm  # noqa: E402
from valuation import valuation_engine  # noqa: E402
from valuation import growth as _vgrowth  # noqa: E402
from valuation import stages as _vstages  # noqa: E402
from valuation import selector as _vselector  # noqa: E402
from valuation import engines as _vengines  # noqa: E402
from valuation import diagnostics as _vdiag  # noqa: E402

# Uses of cash. Self-contained and imports nothing from this module, so there is
# no cycle. It owns the cash-flow sign convention, which is not uniform in this
# database: "Debt Repayment" and "Acquisitions Net" are NET figures whose sign
# carries the meaning, so a net inflow must never be drawn as a use of cash.
import uses_of_cash as _uses_of_cash  # noqa: E402

# Currency reconciliation between a market quote and a per-ordinary-share model
# value. Pure modules, no network and no database.
import fx_convert as _fx_convert  # noqa: E402
try:
    import price_currency as _pc  # noqa: E402
except Exception:  # noqa: BLE001 — absence leaves the prior behaviour in place
    _pc = None  # type: ignore[assignment]

# Financial-sector guard. The same predicate and the same reason wording the
# connections and industry-structure blocks use, so the credit block does not
# grow a second opinion about what a bank cannot report.
try:
    import financial_guard as _fg  # noqa: E402
except Exception:  # noqa: BLE001 — a missing guard must not break the snapshot
    _fg = None  # type: ignore[assignment]

# Bottom-up beta engine (backend/betas). Optional: when the package is missing
# or BETA_RESOLVER=off, every beta below stays the stored regression value.
try:
    import betas as _beta_engine  # noqa: E402
except Exception:  # noqa: BLE001 — engine absence must never break analysis
    _beta_engine = None  # type: ignore[assignment]

# SEC EDGAR XBRL client — full income statement + operating-lease facts (Ch.9).
try:
    from betas import edgar_client as _edgar  # noqa: E402
except Exception:  # noqa: BLE001
    _edgar = None  # type: ignore[assignment]

# ESG scores (best-effort, cache-only on the request path).
try:
    import esg_data as _esg_data  # noqa: E402
except Exception:  # noqa: BLE001
    _esg_data = None  # type: ignore[assignment]

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("individual")


# ── Metric groupings ────────────────────────────────────────────────────────

# Income statement lines used for horizontal + vertical (% of Revenue) analysis.
INCOME_STATEMENT_LINES: list[str] = [
    "Revenue",
    "Cost Of Revenue",
    "Gross Profit",
    "Research And Development Expenses",
    "Selling General And Administrative Expenses",
    "Operating Expenses",
    "Operating Income",
    "Interest Expense",
    "Income Before Tax",
    "Income Tax Expense",
    "Net Income",
    "EBITDA",
]

# Balance-sheet lines for horizontal + vertical (% of Total Assets) analysis.
BALANCE_SHEET_LINES: list[str] = [
    "Cash And Cash Equivalents",
    "Net Receivables",
    "Inventory",
    "Total Current Assets",
    "Property Plant Equipment Net",
    "Goodwill",
    "Intangible Assets",
    "Total Non Current Assets",
    "Total Assets",
    "Account Payables",
    "Short Term Debt",
    "Total Current Liabilities",
    "Long Term Debt",
    "Total Non Current Liabilities",
    "Total Liabilities",
    "Total Stockholders Equity",
    "Total Debt",
]

# Cash-flow lines for horizontal analysis (no vertical baseline used).
CASH_FLOW_LINES: list[str] = [
    "Operating Cash Flow",
    "Capital Expenditure",
    "Free Cash Flow",
    "Dividends Paid",
    "Common Stock Repurchased",
    "Stock Based Compensation",
]

# ── Vertical (common-size) analysis line-item sets ──────────────────────────
# Exhaustive over EVERY absolute-dollar statement line item in financials.db,
# laid out in canonical statement order. Non-line-item columns (ratios, per-share,
# growth rates, market data, identifiers) are intentionally excluded — common-
# sizing them is meaningless and they live in the Ratios/Per-Share/Trends sections.
# Coverage is asserted by tests/_vertical_coverage (no real line item is dropped).

# Income statement ÷ Revenue, top-line to bottom-line.
VERTICAL_INCOME_LINES: list[str] = [
    "Revenue",
    "Cost Of Revenue",
    "Gross Profit",
    "Research And Development Expenses",
    "General And Administrative Expenses",
    "Selling And Marketing Expenses",
    "Selling General And Administrative Expenses",
    "Other Expenses",
    "Operating Expenses",
    "Cost And Expenses",
    "Depreciation And Amortization",
    "EBITDA",
    "Operating Income",
    "Interest Income",
    "Interest Expense",
    "Total Other Income Expenses Net",
    "Income Before Tax",
    "Income Tax Expense",
    "Net Income",
]

# Balance sheet ÷ Total Assets: assets → liabilities → debt memo → equity.
VERTICAL_BALANCE_LINES: list[str] = [
    # Current assets
    "Cash And Cash Equivalents",
    "Short Term Investments",
    "Cash And Short Term Investments",
    "Net Receivables",
    "Inventory",
    "Other Current Assets",
    "Total Current Assets",
    # Non-current assets
    "Property Plant Equipment Net",
    "Goodwill",
    "Intangible Assets",
    "Goodwill And Intangible Assets",
    "Long Term Investments",
    "Tax Assets",
    "Other Non Current Assets",
    "Total Non Current Assets",
    "Other Assets",
    "Total Investments",
    "Total Assets",
    # Current liabilities
    "Account Payables",
    "Short Term Debt",
    "Capital Lease Obligations",
    "Tax Payables",
    "Deferred Revenue",
    "Other Current Liabilities",
    "Total Current Liabilities",
    # Non-current liabilities
    "Long Term Debt",
    "Deferred Revenue Non Current",
    "Deferred Tax Liabilities Non Current",
    "Other Non Current Liabilities",
    "Total Non Current Liabilities",
    "Other Liabilities",
    "Total Liabilities",
    # Debt memo
    "Total Debt",
    "Net Debt",
    # Equity
    "Minority Interest",
    "Minority Interest Preferred Stock",
    "Preferred Stock",
    "Common Stock",
    "Retained Earnings",
    "Accumulated Other Comprehensive Income Loss",
    "Other Total Stockholders Equity",
    "Total Stockholders Equity",
    "Total Equity",
    "Total Liabilities and Total Equity",
    "Total Liabilities And Stockholders Equity",
]

# Cash-flow statement ÷ Revenue: CFO → CFI → CFF → reconciliation → FCF.
VERTICAL_CASHFLOW_LINES: list[str] = [
    # Operating
    "Net Income Cashflow",
    "Depreciation and Amortization Cashflow",
    "Stock Based Compensation",
    "Deferred Income Tax",
    "Other Non Cash Items",
    "Change In Working Capital",
    "Accounts Receivables",
    "Inventory Cashflow",
    "Accounts Payables",
    "Other Working Capital",
    "Net Cash Provided By Operating Activities",
    "Operating Cash Flow",
    # Investing
    "Investments In Property Plant And Equipment",
    "Capital Expenditure",
    "Acquisitions Net",
    "Purchases Of Investments",
    "Sales Maturities Of Investments",
    "Other Investing Activities",
    "Net Cash Used For Investing Activities",
    # Financing
    "Debt Repayment",
    "Common Stock Issued",
    "Common Stock Repurchased",
    "Dividends Paid",
    "Other Financing Activities",
    "Net Cash Used Provided By Financing Activities",
    # Reconciliation
    "Effect Of Forex Changes On Cash",
    "Net Change In Cash",
    "Cash At Beginning Of Period",
    "Cash At End Of Period",
    # Free cash flow
    "Free Cash Flow",
]

VERTICAL_INCOME_BASE = "Revenue"
VERTICAL_BALANCE_BASE = "Total Assets"
VERTICAL_CASHFLOW_BASE = "Revenue"

# Per-share metrics that should be reported directly + with YoY growth.
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

# Profitability / efficiency / leverage / liquidity ratios.
RETURN_RATIOS: list[str] = [
    "Return On Assets",
    "Return On Equity",
    "Return On Sales",
    "Return On Invested Capital",
    "Asset Turnover",
    "Gross Profit Ratio",
]

SOLVENCY_RATIOS: list[str] = [
    "Current Ratio",
    "Quick Ratio",
    "Debt Service Coverage Ratio",
    "Interest Coverage Ratio",
    "Debt To Equity",
    "Debt To Assets",
]


# DCF assumptions — kept aligned with the comparative module so results are
# comparable across the two reports.
DCF_WACC = 0.10
DCF_TERMINAL_GROWTH = 0.03
DCF_PROJECTION_YEARS = 5
DCF_GROWTH_FLOOR = -0.15
DCF_GROWTH_CAP = 0.20

# Analysis window for the historical beta series and the per-year
# cost-of-equity / WACC trends, matching the financials history depth. The
# upper bound tracks the clock — a frozen year here silently truncated every
# WACC/Ke history chart the moment the calendar rolled over.
BETA_MIN_YEAR = 2012
BETA_MAX_YEAR = _dt.date.today().year

# Forward FCFF forecast (Damodaran, Investment Valuation, Ch.11/12/15).
# All inputs are derived from the company's own financials.db history; the only
# constants here are caps that keep a single data artefact from blowing up the
# projection (mirrors the DCF growth clamps above).
FORECAST_HORIZON_YEARS = 8
FORECAST_GROWTH_FLOOR = -0.10   # explicit-period revenue growth clamp (low)
FORECAST_GROWTH_CAP = 0.25      # explicit-period revenue growth clamp (high)
FORECAST_REINVEST_CAP = 0.90    # reinvestment rate ceiling (g / ROIC)

# ── Life-cycle-aware growth estimation (Damodaran Ch.11 + Figure 11.6) ────────
# The flat clamps above are right for a mature company and wrong for a young one:
# Ch.11's life-cycle table puts young growth at 30-100%+, high growth at 10-30%,
# mature growth at 5-15% and stable at 3-7%, so a single 25% ceiling silently
# understates every fast grower. These per-stage bounds replace the flat pair once
# the company's stage is known; the terminal rate is still capped at the risk-free
# rate, which is the constraint that actually matters (Ch.12).
_STAGE_GROWTH_BOUNDS: dict[str, tuple[float, float]] = {
    "emerging":  (-0.10, 0.60),   # young growth: 30-100% is normal, 60% is a sane ceiling
    "growth":    (-0.10, 0.35),   # high growth: 10-30%
    "mature":    (-0.10, 0.25),   # today's behavior, unchanged
    "declining": (-0.25, 0.15),   # let a shrinking firm actually shrink
}
# Weight on fundamental growth when reconciling it against the historical
# regression for a mature or declining firm with a meaningful positive ROIC.
# Damodaran leans on fundamentals for stable firms, so fundamentals lead here.
FUNDAMENTAL_BLEND_WEIGHT = 0.60
# Gap between historical and fundamental growth that is worth flagging to the user.
GROWTH_DIVERGENCE_FLAG = 0.05
# Sales-to-capital sanity band (a ratio outside this is a data artefact, not a firm).
_S2C_MIN, _S2C_MAX = 0.20, 20.0


def growth_model() -> str:
    """`GROWTH_MODEL` in {regression, shadow, fundamental}. Default `shadow`.

    `regression` is the pre-Ch.11 behavior exactly (rollback). `shadow` computes
    and surfaces the fundamental growth, the life-cycle stage and the
    sales-to-capital reinvestment path but keeps the historical regression
    driving the DCF, so no valuation moves. `fundamental` lets the reconciled
    growth and the sales-to-capital path drive the DCF. Re-read on every call so
    tests can flip it (same shape as betas.beta_mode)."""
    mode = os.environ.get("GROWTH_MODEL", "shadow").strip().lower()
    return mode if mode in ("regression", "shadow", "fundamental") else "shadow"


_LIFECYCLE_MIN_YEARS = 3


def lifecycle_from_series(
    growth: list[tuple[int, float]],
    margins: list[tuple[int, float]],
) -> dict:
    """Pure life-cycle classifier over (year, value) series, both decimals.

    The median growth of the last five years places the stage; the margin slope
    and the count of recent negative-growth years separate a real decline from a
    cyclical trough. Lives here (rather than in api.py) so the forecast can
    classify a single company from its own history without a circular import;
    api.py imports this for the sector/industry aggregates."""
    growth = sorted(growth)
    margins = sorted(margins)
    n = len(growth)
    if n < _LIFECYCLE_MIN_YEARS:
        return {"applicable": False,
                "reason": f"Fewer than {_LIFECYCLE_MIN_YEARS} usable years of history."}

    recent_g = [v for _, v in growth[-5:]]
    gbar = sorted(recent_g)[len(recent_g) // 2]  # median
    neg_recent = sum(1 for _, v in growth[-3:] if v < 0)

    mslope = None
    mrows = margins[-8:]
    if len(mrows) >= 3:
        xs = [float(y) for y, _ in mrows]
        ys = [v * 100.0 for _, v in mrows]
        xbar = sum(xs) / len(xs)
        ybar = sum(ys) / len(ys)
        var = sum((x - xbar) ** 2 for x in xs)
        if var > 0:
            mslope = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys)) / var

    stage: str
    if (gbar < 0 and neg_recent >= 2) or (
        gbar < 0.02 and mslope is not None and mslope < -0.5 and n >= 4
    ):
        stage = "declining"
    elif gbar > 0.15:
        stage = "emerging"
    elif gbar > 0.08:
        stage = "growth"
    elif gbar >= 0:
        stage = "mature"
    else:
        stage = "declining" if (mslope is not None and mslope < 0) else "mature"

    boundaries = (0.0, 0.08, 0.15)
    near_boundary = any(abs(gbar - b) < 0.01 for b in boundaries)
    g_range = (max(recent_g) - min(recent_g)) if len(recent_g) >= 3 else 0.0
    cyclical = g_range > 0.30
    confidence = "low" if (near_boundary or n < 5 or cyclical) else "normal"

    return {
        "applicable": True,
        "stage": stage,
        "confidence": confidence,
        "cyclicalSwings": cyclical,
        "medianGrowth5y": round(gbar, 4),
        "marginSlopePpYr": round(mslope, 2) if mslope is not None else None,
        "negativeGrowthYearsOf3": neg_recent,
        "yearsUsed": n,
    }
# Fallback tax rate used only when a company's effective rate is missing or
# implausible. The model otherwise uses the company's OWN effective rate
# throughout (jurisdiction-correct for this global universe — a single hardcoded
# US "marginal" rate would mis-tax every non-US ticker in the database).
DEFAULT_TAX_RATE = 0.21

# Marginal tax rate used ONLY for the after-tax cost-of-debt tax shield in
# compute_wacc (Damodaran, Investment Valuation Ch.8: the debt tax benefit is a
# marginal, not average/effective, phenomenon — the last dollar of interest is
# deducted at the marginal rate). Matches betas/bottom_up.py DEFAULT_TAX_RATE so
# the two halves of the cost-of-capital engine agree (the beta relevering already
# uses the marginal rate). US federal statutory 21%; a country→statutory map is a
# future refinement for non-US filers, but the effective rate is still used for
# NOPAT/FCFF everywhere else, so this only touches the debt shield.
MARGINAL_TAX_RATE = 0.21

# Quality thresholds used by the verdict engine.
QUALITY_THRESHOLDS = {
    "Return On Equity": 0.15,
    "Return On Invested Capital": 0.12,
    "Return On Assets": 0.07,
    "Return On Sales": 0.10,
    "Gross Profit Ratio": 0.35,
    "Asset Turnover": 0.50,
    "Current Ratio": 1.50,
    "Quick Ratio": 1.00,
    "Debt Service Coverage Ratio": 1.50,
    "Interest Coverage Ratio": 5.00,
    "Debt To Equity": 1.00,  # lower-is-better
    "Debt To Assets": 0.50,  # lower-is-better
    "Margin Of Safety": 0.20,
    "Free Cash Flow Growth": 0.05,
    "Net Income Growth": 0.05,
}

# Direction map: which side of the threshold is "good".
HIGHER_IS_BETTER = {
    "Return On Equity",
    "Return On Invested Capital",
    "Return On Assets",
    "Return On Sales",
    "Gross Profit Ratio",
    "Asset Turnover",
    "Current Ratio",
    "Quick Ratio",
    "Debt Service Coverage Ratio",
    "Interest Coverage Ratio",
    "Margin Of Safety",
    "Free Cash Flow Growth",
    "Net Income Growth",
}


# ── Snapshot container ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class IndividualSnapshot:
    """All numbers needed to value a single ticker on its own merits."""

    ticker: str
    name: Optional[str]
    sector: Optional[str]
    industry: Optional[str]
    latest_year: int
    years: list[int]

    # Latest-year ratios
    ratios: dict[str, Optional[float]] = field(default_factory=dict)
    per_share: dict[str, Optional[float]] = field(default_factory=dict)
    per_share_growth: dict[str, Optional[float]] = field(default_factory=dict)

    # NOPAT, OCF, FCF (latest year + history)
    nopat_history: dict[int, Optional[float]] = field(default_factory=dict)
    ocf_history: dict[int, Optional[float]] = field(default_factory=dict)
    fcf_history: dict[int, Optional[float]] = field(default_factory=dict)

    # DCF outputs
    dcf_intrinsic: Optional[float] = None
    implied_price: Optional[float] = None
    margin_of_safety: Optional[float] = None
    avg_fcf_growth: Optional[float] = None

    # Horizontal analysis: {metric: {year: yoy_pct}}
    horizontal_income: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)
    horizontal_balance: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)
    horizontal_cashflow: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)
    horizontal_per_share: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)

    # Vertical analysis: {metric: {year: pct_of_base}} — all three statements.
    vertical_income: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)
    vertical_balance: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)
    vertical_cashflow: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)

    # Per-share level history: {metric: {year: level}} (drives per-share sparklines)
    per_share_history: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)

    # Forward FCFF forecast + valuation bridge + sensitivity + EVA (Damodaran). JSON-safe.
    forecast: Optional[dict] = None

    # Growth-viability due-diligence deck (Damodaran Ch.11 + the quality-of-growth
    # literature): is the growth rate genuine and sustainable? JSON-safe.
    growth_viability: Optional[dict] = None

    # Fundamental metric history: {metric_key: {year: value}} (drives the trends grid)
    metric_history: dict[str, dict[int, Optional[float]]] = field(default_factory=dict)

    # Whether the market quote and the model's per-ordinary-share value are the
    # same kind of number, and in which currencies. Always present. When
    # applicable is False the margin of safety, the reverse DCF and every other
    # price-against-value figure are empty by design, not by accident, and the
    # reason says which two units could not be reconciled. JSON-safe.
    price_comparison: Optional[dict] = None

    # Deep-value asset floors (Graham Number / NCAV / Net-Net), latest year. JSON-safe.
    valuation_anchors: Optional[dict] = None

    # Forensic earnings-quality block (Schilit, "Financial Shenanigans"): quantitative
    # red-flag detectors + a qualitative question checklist. JSON-safe.
    shenanigans: Optional[dict] = None

    # Residual-income (excess-return) valuation + justified P/B-vs-ROE anchor — the
    # correct intrinsic model for Financials/REITs where FCFF is disabled. JSON-safe.
    residual_income: Optional[dict] = None

    # Two-stage dividend discount model (Damodaran Ch.21, Method 2) — observable
    # payouts sidestep the unmeasurable-reinvestment problem at banks. JSON-safe.
    dividend_discount: Optional[dict] = None

    # FCFE with reinvestment redefined as growth in regulatory capital (Damodaran
    # Ch.21, Method 3) — the "earnings are not cash flows" model. JSON-safe.
    fcfe_regulatory: Optional[dict] = None

    # Net interest margin + interest-spread decomposition for spread-based lenders
    # (Damodaran Ch.21). applicable=False for non-banks. JSON-safe.
    bank_profitability: Optional[dict] = None

    # Company credit analysis (Ziegel): synthetic rating, leverage/coverage/
    # liquidity panel, FCF debt capacity, natural-capital-structure check, with a
    # separate bank track for financials/REITs. JSON-safe.
    credit_analysis: Optional[dict] = None

    # R&D-capitalization adjustment (Damodaran Ch.9) for R&D-heavy firms. JSON-safe.
    rnd_adjusted: Optional[dict] = None

    # Normalized-earnings bridge (Damodaran Ch.9): operating leases as debt,
    # investment-income removal (ex-financials), one-time normalization, goodwill/
    # SBC treatment. JSON-safe.
    normalized_earnings: Optional[dict] = None

    # Reported income-statement walk from the 10-K XBRL (how earnings were built),
    # for the AI earnings explainer. JSON-safe.
    earnings_bridge: Optional[dict] = None

    # ESG block: numeric Sustainalytics scores when available, else the AI
    # qualitative-assessment marker. JSON-safe.
    esg: Optional[dict] = None

    # Management-compensation block: DEF 14A proxy link + SBC pay proxy. JSON-safe.
    management_comp: Optional[dict] = None

    # Business-events feed (Lev & Gu Ch.4): recent 8-K/6-K filings. JSON-safe.
    events: Optional[list] = None

    # Earnings power value (Greenwald): no-growth NOPAT/WACC anchor. JSON-safe.
    epv: Optional[dict] = None

    # Tobin's Q per year: (market cap + debt) / total assets. JSON-safe.
    tobins_q: Optional[dict] = None

    # Owner earnings (Buffett 1986): cash an owner could withdraw. JSON-safe.
    owner_earnings: Optional[dict] = None

    # Capital base: goodwill's share of invested capital + ROIC/EVA on tangible
    # operating capital only (Investment Valuation Ch.25). JSON-safe.
    capital_base: Optional[dict] = None

    # Extended (5-factor) DuPont decomposition of ROE. JSON-safe.
    dupont: Optional[dict] = None
    # Leverage decomposition of ROE, ROE = ROIC + D/E × [ROIC − i(1−t)]. JSON-safe.
    leverage_roe: Optional[dict] = None

    # Uses of cash: what each year's operating cash flow was actually spent on
    # (capex, R&D, acquisitions, buybacks, dividends, debt paydown), in dollars and
    # as a share of operating cash flow. Net borrowing and net divestitures are
    # reported as SOURCES, never as uses. JSON-safe.
    uses_of_cash: Optional[dict] = None

    # Business profile (plan 3.1): yfinance description, website, country,
    # employees, EDGAR segments, 10-K extract. JSON-safe.
    business_profile: Optional[dict] = None

    # Cost structure vs strategic group (plan 3.2): company and group medians
    # for COGS/Rev, SGA/Rev, R&D/Rev, DA/Rev, operating margin. JSON-safe.
    cost_structure: Optional[dict] = None

    # Generic competitive strategy (plan 3.3): raw figures with industry rank
    # and count, no percentile or grid placement. JSON-safe.
    generic_strategy: Optional[dict] = None

    # Moat direction and growth sustainability (feature plan item 11): spread
    # direction with the ROIC/WACC split, share and margins then and now, and
    # four-factor sustainable growth by year. Figures only. JSON-safe.
    moat_direction: Optional[dict] = None

    # Verdict
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    verdict: str = ""
    quality_score: float = 0.0


# ── Math helpers ────────────────────────────────────────────────────────────

def _safe_div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den is None or den == 0:
        return None
    return num / den


def _yoy_pct(curr: Optional[float], prev: Optional[float]) -> Optional[float]:
    if curr is None or prev is None or prev == 0:
        return None
    return (curr - prev) / abs(prev)


def _row_val(row: sqlite3.Row, col: str) -> Optional[float]:
    # sqlite3.Row raises IndexError for an unknown column name (a dict raises
    # KeyError); catching it beats `col in row.keys()`, which materialises the
    # full column list on every call (3.9M list builds per industry ranking).
    try:
        v = row[col]
    except (IndexError, KeyError):
        return None
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _effective_price(
    price: Optional[float],
    market_cap: Optional[float],
    shares: Optional[float],
    price_unusable: bool = False,
) -> Optional[float]:
    """The per-ordinary-share price a model compares its value against.

    The live quote when there is one, otherwise the stored market cap over
    diluted shares, which is denominated the way the rows are.

    ``price_unusable`` is the depositary-receipt case: the quote is for a
    receipt in a currency the statements are not in and the number of ordinary
    shares per receipt is not on file, so there is no price to compare and the
    stale fallback is NOT a substitute for it. The warehouse's stored cap for
    exactly those filers has been observed holding the receipt's USD value
    under the filer's own currency code, so falling back would trade one wrong
    comparison for another.
    """
    if price_unusable:
        return None
    if price is not None and price > 0:
        return price
    return _safe_div(market_cap, shares)


def _row_str(row: sqlite3.Row, col: str) -> Optional[str]:
    try:
        v = row[col]
    except (IndexError, KeyError):
        return None
    return str(v) if v is not None else None


# ── Price multiples: stored-vs-computed selection + sanity band ─────────────
# A price multiple collapses when its denominator approaches zero, and both the
# stored columns and the computed ratios carry that tail. Measured over the
# whole warehouse: |market cap / revenue| > 1000 on 1.76 percent of rows,
# |market cap / OCF| > 1000 on 1.82 percent, |market cap / FCF| > 1000 on 2.11
# percent, with the distributions flat either side of the cut. Above it the
# number is reporting a near-zero denominator, not a valuation.
_MULTIPLE_MAX = 1000.0

# SG&A over revenue is a share of sales. The stored column holds 14,449 rows
# above 1.0, 2,492 negatives and a maximum of 7.96e7; rendered with the "%"
# formatter a row at 1,515 prints as 151,500 percent. Everything genuine sits in
# [0, 2]: above 1.0 belongs to a company spending more on overhead than it sells
# (real, and the reason the ceiling is not 1.0), while 340,728 of 353,388 stored
# rows (96.4 percent) already fall inside the band.
_SGA_REVENUE_MAX = 2.0

# A computed multiple more than this many times away from the stored one is a
# basis mismatch, not a price move, so the stored figure is kept.
_MULTIPLE_DIVERGENCE = 3.0


def _sane_share(value: Optional[float], ceiling: float) -> Optional[float]:
    """A ratio that is meant to be a SHARE of something, kept inside [0, ceiling].

    Outside that band the stored figure is a data error rather than a small or
    large share, and the "%" display unit turns it into an unreadable headline.
    """
    if value is None or value < 0.0 or value > ceiling:
        return None
    return value


def _price_multiple(
    row: sqlite3.Row,
    stored_col: str,
    market_cap: Optional[float],
    denominator: Optional[float],
) -> Optional[float]:
    """One price multiple (P/S, P/OCF, P/FCF), choosing between the stored column
    and ``market cap / denominator``.

    The stored ratio is frozen at the fiscal-year pull while Market Cap is
    refreshed to spot weekly, so for a USD filer the computed figure is the
    current one (AAPL: stored 9.18 against a computed 10.73). For a foreign
    filer the two are not always on the same basis — TSM computes 0.58 against a
    stored P/S of 10.55, NVO 0.65 against 4.68 — so outside USD the stored ratio
    wins. A USD filer whose two figures diverge by more than 3x is the same
    mismatch wearing a USD label, and keeps the stored figure too.

    A stored value of zero or less is MISSING data, not a free company (19,031
    rows store a P/S of exactly 0), and a non-positive result is not a usable
    multiple, so both return None rather than guessing.
    """
    computed = None
    if market_cap is not None and denominator:
        computed = market_cap / denominator
    stored = _row_val(row, stored_col)
    if stored is not None and stored <= 0:
        stored = None

    is_usd = (_row_str(row, "Reported Currency") or "USD").strip().upper() == "USD"
    value = stored
    if is_usd and computed is not None and computed > 0:
        diverged = stored is not None and max(computed / stored, stored / computed) > _MULTIPLE_DIVERGENCE
        value = stored if diverged else computed

    if value is None or value <= 0 or value > _MULTIPLE_MAX:
        return None
    return value


# Sectors/industries where a free-cash-flow-to-firm (FCFF) DCF and EVA are the
# WRONG model (Damodaran): for banks/insurers debt is operating raw material, and
# REITs are valued on FFO, not FCFF. We still show their ratios + relative metrics.
_FCFF_GUARD_SECTORS = {"Financial Services", "Real Estate"}
_FCFF_GUARD_INDUSTRY_KEYWORDS = ("reit", "bank", "insurance", "mortgage", "capital markets")
_FCFF_NA_REASON = (
    "FCFF/EVA isn't used for Financials or REITs — a bank's debt is operating raw "
    "material and a REIT is valued on FFO, so an FCFF firm model misprices them. "
    "Use the ratios and relative metrics instead."
)


def fcff_applicable(latest: sqlite3.Row) -> tuple[bool, Optional[str]]:
    """Whether an FCFF/EVA valuation is appropriate for this company."""
    sector = (_row_str(latest, "t_sector") or "").strip()
    industry = (_row_str(latest, "t_industry") or "").lower()
    if sector in _FCFF_GUARD_SECTORS:
        return False, _FCFF_NA_REASON
    if any(k in industry for k in _FCFF_GUARD_INDUSTRY_KEYWORDS):
        return False, _FCFF_NA_REASON
    return True, None


def _safe_sheet_name(name: str) -> str:
    for ch in r"\/?*[]:":
        name = name.replace(ch, "_")
    return name[:31]


# ── Data loading ────────────────────────────────────────────────────────────

def load_ticker_rows(db: FinancialDB, ticker: str) -> list[sqlite3.Row]:
    sql = """
        SELECT f.*, t.name AS t_name, t.sector AS t_sector, t.industry AS t_industry
        FROM financials f
        LEFT JOIN tickers t ON t.ticker = f.Ticker
        WHERE UPPER(f.Ticker) = ?
          AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
        ORDER BY CAST(f."Calendar Year" AS INTEGER)
    """
    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(sql, [ticker.upper()]).fetchall()
    finally:
        conn.close()


# ── Latest-year metric computation ──────────────────────────────────────────

def _compute_return_ratios(row: sqlite3.Row) -> dict[str, Optional[float]]:
    """Return on Assets / Equity / Sales / Invested Capital, plus turnover/gross."""

    revenue = _row_val(row, "Revenue")
    net_income = _row_val(row, "Net Income")
    total_assets = _row_val(row, "Total Assets")
    equity = _row_val(row, "Total Stockholders Equity") or _row_val(row, "Total Equity")
    total_debt = _row_val(row, "Total Debt")
    operating_income = _row_val(row, "Operating Income")
    income_before_tax = _row_val(row, "Income Before Tax")
    income_tax = _row_val(row, "Income Tax Expense")

    # Effective tax rate, used for NOPAT and ROIC after tax.
    tax_rate = _safe_div(income_tax, income_before_tax)
    if tax_rate is None or tax_rate < 0 or tax_rate > 0.6:
        tax_rate = 0.21  # fallback to US statutory blended rate

    nopat = operating_income * (1 - tax_rate) if operating_income is not None else None
    invested_capital = None
    if equity is not None and total_debt is not None:
        invested_capital = equity + total_debt

    roa = _safe_div(net_income, total_assets)
    roe_db = _row_val(row, "ROE")
    roe = roe_db if roe_db is not None else _safe_div(net_income, equity)
    ros = _safe_div(net_income, revenue)
    roic_db = _row_val(row, "ROIC")
    # Only compute ROIC on a POSITIVE invested-capital base. With negative NOPAT
    # and negative invested capital (distressed firm), nopat/IC is spuriously
    # positive and would bypass the `roic > 0` guards downstream. ROIC is defined
    # against the book value of invested capital (Damodaran, *Investment
    # Valuation* Ch.19) — a non-positive base makes it meaningless.
    if roic_db is not None:
        roic = roic_db
    elif invested_capital is not None and invested_capital > 0:
        roic = _safe_div(nopat, invested_capital)
    else:
        roic = None

    return {
        "Return On Assets": roa,
        "Return On Equity": roe,
        "Return On Sales": ros,
        "Return On Invested Capital": roic,
        "Asset Turnover": _safe_div(revenue, total_assets),
        "Gross Profit Ratio": _row_val(row, "Gross Profit Ratio") or _safe_div(
            _row_val(row, "Gross Profit"), revenue
        ),
    }


def _compute_solvency_ratios(row: sqlite3.Row) -> dict[str, Optional[float]]:
    current_assets = _row_val(row, "Total Current Assets")
    current_liab = _row_val(row, "Total Current Liabilities")
    inventory = _row_val(row, "Inventory")
    ebitda = _row_val(row, "EBITDA")
    interest_exp = _row_val(row, "Interest Expense")
    short_term_debt = _row_val(row, "Short Term Debt")
    operating_income = _row_val(row, "Operating Income")
    operating_cash_flow = _row_val(row, "Operating Cash Flow")

    quick_num = None
    if current_assets is not None and inventory is not None:
        quick_num = current_assets - inventory

    # Interest Expense is stored with an inconsistent sign across feeds; use
    # magnitudes so a negative-signed interest figure can't flip the denominator.
    debt_service_den = abs(interest_exp or 0.0) + abs(short_term_debt or 0.0)
    debt_service = None
    # Use OCF when available, otherwise fall back to EBITDA.
    debt_service_num = operating_cash_flow if operating_cash_flow is not None else ebitda
    if debt_service_den > 0:
        debt_service = _safe_div(debt_service_num, debt_service_den)

    interest_coverage = None
    if interest_exp is not None and interest_exp != 0:
        # Interest Expense is often stored as a positive number; use absolute value.
        interest_coverage = _safe_div(operating_income, abs(interest_exp))

    return {
        "Current Ratio": _row_val(row, "Current Ratio") or _safe_div(current_assets, current_liab),
        "Quick Ratio": _safe_div(quick_num, current_liab),
        "Debt Service Coverage Ratio": debt_service,
        "Interest Coverage Ratio": _row_val(row, "Interest Coverage") or interest_coverage,
        "Debt To Equity": _row_val(row, "Debt To Equity"),
        "Debt To Assets": _row_val(row, "Debt To Assets"),
    }


def _dividend_yield(row: sqlite3.Row) -> Optional[float]:
    """Trailing dividend yield = cash dividends paid / market cap. Both are in the
    company's reporting currency, so the ratio is currency-consistent across this
    global universe. Falls back to the stored 'Dividend Yield' column, then to
    dividend-per-share / implied price. Returns a decimal (0.015 = 1.5%); None
    when the company pays no dividend or the data is missing."""
    market_cap = _row_val(row, "Market Cap")
    div_paid = _row_val(row, "Dividends Paid")
    if market_cap is not None and market_cap > 0 and div_paid is not None:
        y = abs(div_paid) / market_cap
        if 0.0 <= y < 0.5:  # guard against data artefacts
            return y
    stored = _row_val(row, "Dividend Yield")
    if stored is not None:
        # Stored as a decimal in this DB, but coerce a percent (e.g. 1.5) to 0.015.
        return stored / 100.0 if stored > 1.0 else stored
    dps = _row_val(row, "Dividend")
    shares = _row_val(row, "Weighted Average Shs Out Dil")
    if dps is not None and market_cap is not None and shares not in (None, 0):
        price = market_cap / shares
        if price > 0:
            return dps / price
    return None


def _compute_per_share(row: sqlite3.Row) -> dict[str, Optional[float]]:
    return {m: _row_val(row, m) for m in PER_SHARE_METRICS}


def _nopat_for_row(row: sqlite3.Row) -> Optional[float]:
    """NOPAT = Operating Income × (1 − effective tax rate)."""
    op = _row_val(row, "Operating Income")
    if op is None:
        return None
    ibt = _row_val(row, "Income Before Tax")
    tax = _row_val(row, "Income Tax Expense")
    rate = _safe_div(tax, ibt)
    if rate is None or rate < 0 or rate > 0.6:
        rate = DEFAULT_TAX_RATE
    return op * (1 - rate)


# ── Horizontal & vertical analysis ─────────────────────────────────────────

def _horizontal(rows: list[sqlite3.Row], metrics: list[str]) -> dict[str, dict[int, Optional[float]]]:
    out: dict[str, dict[int, Optional[float]]] = {m: {} for m in metrics}
    prev: dict[str, Optional[float]] = {m: None for m in metrics}
    for row in rows:
        year = int(row["Calendar Year"])
        for m in metrics:
            curr = _row_val(row, m)
            out[m][year] = _yoy_pct(curr, prev[m])
            prev[m] = curr
    return out


def _vertical(
    rows: list[sqlite3.Row],
    metrics: list[str],
    base_metric: str,
) -> dict[str, dict[int, Optional[float]]]:
    """Common-size percentages: each metric divided by the base for that year."""
    out: dict[str, dict[int, Optional[float]]] = {m: {} for m in metrics}
    for row in rows:
        year = int(row["Calendar Year"])
        base = _row_val(row, base_metric)
        for m in metrics:
            out[m][year] = _safe_div(_row_val(row, m), base)
    return out


# ── DCF valuation ───────────────────────────────────────────────────────────

def _historical_fcf_growth_unclamped(rows: list[sqlite3.Row]) -> Optional[float]:
    """Geometric (compounded) mean of historical FCF/share growth, UNCLAMPED —
    Damodaran Ch.11: "the geometric average is a much more accurate measure of
    true growth," and the arithmetic mean overstates it most for volatile FCF.
    Sign-crossing years (1+g <= 0) break compounding, so they fall back to the
    arithmetic mean. This is a MEASUREMENT of the past; the damodaran engine
    reports it as-is (a clamp here is what once pinned every fast grower to an
    identical 20.0%)."""
    growths: list[float] = []
    prev: Optional[float] = None
    for row in rows:
        val = _row_val(row, "Free Cash Flow Per Share")
        g = _yoy_pct(val, prev)
        if g is not None:
            growths.append(g)
        prev = val
    if not growths:
        return None
    compoundable = [g for g in growths if (1.0 + g) > 0.0]
    if compoundable:
        prod = 1.0
        for g in compoundable:
            prod *= (1.0 + g)
        return prod ** (1.0 / len(compoundable)) - 1.0
    return sum(growths) / len(growths)


def _historical_fcf_growth(rows: list[sqlite3.Row]) -> Optional[float]:
    """Legacy-clamped historical FCF growth ([-15%, +20%]) — used only by the
    legacy per-share DCF, kept byte-identical for VALUATION_ENGINE=legacy."""
    raw = _historical_fcf_growth_unclamped(rows)
    if raw is None:
        return None
    return max(DCF_GROWTH_FLOOR, min(raw, DCF_GROWTH_CAP))


def _compute_dcf(
    rows: list[sqlite3.Row],
    beta: float | None = None,
    rf: float | None = None,
    erp: float | None = None,
    price: float | None = None,
    price_unusable: bool = False,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """Legacy FCF-per-share DCF → (intrinsic, implied_price, margin_of_safety,
    growth_used). This discounts an EQUITY cash flow (FCF/share), so the correct
    rate is the COST OF EQUITY (CAPM), not WACC. ``rf``/``erp`` carry the live
    macro inputs; when beta is missing it falls back to DCF_WACC.
    """
    if not rows:
        return None, None, None, None

    latest = rows[-1]
    # FCFF/EVA guard applies to the legacy per-share DCF too (Financials/REITs).
    if not fcff_applicable(latest)[0]:
        return None, None, None, None
    fcf_ps = _row_val(latest, "Free Cash Flow Per Share")
    shares = _row_val(latest, "Weighted Average Shs Out Dil")
    market_cap = _row_val(latest, "Market Cap")

    if not fcf_ps or fcf_ps <= 0 or not shares or shares <= 0 or not market_cap:
        return None, None, None, None

    growth = _historical_fcf_growth(rows)
    if growth is None:
        growth = 0.05

    wacc = capm_discount_rate(beta, rf=rf, erp=erp) if beta is not None else DCF_WACC

    pv_fcf = 0.0
    fcf = fcf_ps
    for yr in range(1, DCF_PROJECTION_YEARS + 1):
        fcf = fcf * (1 + growth)
        pv_fcf += fcf / (1 + wacc) ** yr

    if wacc <= DCF_TERMINAL_GROWTH:
        return None, None, None, None

    terminal_fcf = fcf * (1 + DCF_TERMINAL_GROWTH)
    terminal_value = terminal_fcf / (wacc - DCF_TERMINAL_GROWTH)
    pv_terminal = terminal_value / (1 + wacc) ** DCF_PROJECTION_YEARS

    intrinsic = pv_fcf + pv_terminal
    # The same refusal the damodaran engine applies: with no price that is the
    # same kind of number as this per-ordinary-share value, there is no margin
    # of safety to report, and the stored cap is not a substitute.
    implied_price = _effective_price(price, market_cap, shares, price_unusable)
    if implied_price is None or implied_price <= 0:
        return round(intrinsic, 2), None, None, round(growth, 4)
    mos = (intrinsic - implied_price) / implied_price
    return round(intrinsic, 2), round(implied_price, 2), round(mos, 4), round(growth, 4)


# ── Verdict engine ──────────────────────────────────────────────────────────

def _evaluate_metric(
    name: str,
    value: Optional[float],
) -> tuple[bool, str]:
    """Return (is_strength, formatted_description)."""
    if value is None:
        return False, f"{name}: n/a"
    threshold = QUALITY_THRESHOLDS.get(name)
    if threshold is None:
        return False, f"{name}: {value:.4f}"

    higher = name in HIGHER_IS_BETTER
    if higher:
        passes = value >= threshold
    else:
        passes = value <= threshold

    pretty_threshold = (
        f"{threshold * 100:.1f}%" if abs(threshold) <= 1 else f"{threshold:.2f}"
    )
    pretty_value = (
        f"{value * 100:.2f}%" if abs(value) <= 1 and threshold <= 1 else f"{value:.2f}"
    )
    direction = ">=" if higher else "<="
    return passes, f"{name}: {pretty_value} ({direction} {pretty_threshold})"


def _build_verdict(snap_inputs: dict) -> tuple[list[str], list[str], float, str]:
    """Synthesize strengths, weaknesses, a 0-100 quality score, and a one-liner."""

    candidate_metrics: list[tuple[str, Optional[float]]] = []

    for m in (
        "Return On Equity",
        "Return On Invested Capital",
        "Return On Assets",
        "Return On Sales",
        "Gross Profit Ratio",
        "Asset Turnover",
        "Current Ratio",
        "Quick Ratio",
        "Debt Service Coverage Ratio",
        "Interest Coverage Ratio",
        "Debt To Equity",
        "Debt To Assets",
    ):
        candidate_metrics.append((m, snap_inputs["ratios"].get(m)))

    candidate_metrics.append(("Margin Of Safety", snap_inputs.get("margin_of_safety")))
    candidate_metrics.append((
        "Free Cash Flow Growth",
        snap_inputs.get("avg_fcf_growth"),
    ))
    candidate_metrics.append((
        "Net Income Growth",
        snap_inputs.get("net_income_growth_latest"),
    ))

    strengths: list[str] = []
    weaknesses: list[str] = []
    scored = 0
    passed = 0

    for name, value in candidate_metrics:
        if value is None:
            continue
        scored += 1
        is_strength, description = _evaluate_metric(name, value)
        if is_strength:
            strengths.append(description)
            passed += 1
        else:
            weaknesses.append(description)

    quality_score = (passed / scored * 100.0) if scored > 0 else 0.0

    if quality_score >= 75:
        verdict = "STRONG BUY — fundamentals are exceptional across most measured dimensions."
    elif quality_score >= 60:
        verdict = "BUY — strong fundamentals with a few caveats worth monitoring."
    elif quality_score >= 45:
        verdict = "HOLD — mixed signals; quality is fair but not compelling at this price."
    elif quality_score >= 30:
        verdict = "WEAK HOLD — material weaknesses outweigh strengths."
    else:
        verdict = "AVOID — fundamentals fail most basic quality screens."

    return strengths, weaknesses, round(quality_score, 2), verdict


# ── Per-share level history ─────────────────────────────────────────────────

def _per_share_history(rows: list[sqlite3.Row]) -> dict[str, dict[int, Optional[float]]]:
    """Per-share metric levels for every year on file: {metric: {year: level}}."""
    out: dict[str, dict[int, Optional[float]]] = {m: {} for m in PER_SHARE_METRICS}
    for row in rows:
        year = int(row["Calendar Year"])
        for m in PER_SHARE_METRICS:
            out[m][year] = _row_val(row, m)
    return out


# ── Forward FCFF forecast (Damodaran firm valuation) ────────────────────────

def _median(values: list[float]) -> Optional[float]:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    n = len(vals)
    mid = n // 2
    return vals[mid] if n % 2 == 1 else (vals[mid - 1] + vals[mid]) / 2.0


def _effective_tax_rate(row: sqlite3.Row) -> float:
    """The company's own effective rate (Income Tax Expense / Income Before Tax),
    clamped to a sane band; falls back to DEFAULT_TAX_RATE only when the rate is
    missing or implausible (e.g. a loss year or a one-off credit)."""
    rate = _safe_div(_row_val(row, "Income Tax Expense"), _row_val(row, "Income Before Tax"))
    if rate is None or rate < 0 or rate > 0.6:
        return DEFAULT_TAX_RATE
    return rate


def _revenue_cagr(rows: list[sqlite3.Row]) -> Optional[float]:
    """Compound annual revenue growth across all years on file (financials.db)."""
    points = [(int(r["Calendar Year"]), _row_val(r, "Revenue")) for r in rows]
    points = [(y, v) for y, v in points if v is not None and v > 0]
    if len(points) < 2:
        return None
    first_v = points[0][1]
    last_v = points[-1][1]
    span = points[-1][0] - points[0][0]
    if first_v <= 0 or span <= 0:
        return None
    return (last_v / first_v) ** (1.0 / span) - 1.0


def _invested_capital(row: sqlite3.Row) -> Optional[float]:
    """Invested capital = book equity + total debt (same base used for ROIC)."""
    equity = _row_val(row, "Total Stockholders Equity") or _row_val(row, "Total Equity")
    debt = _row_val(row, "Total Debt")
    if equity is None or debt is None:
        return None
    return equity + debt


# ── Damodaran statistical growth (log-linear regression, not CAGR) ──────────

def _ols_slope(xs: list[float], ys: list[float]) -> Optional[float]:
    """Ordinary-least-squares slope of ys on xs."""
    n = len(xs)
    if n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return sxy / sxx


def _revenue_growth_regression(rows: list[sqlite3.Row]) -> Optional[float]:
    """Damodaran's log-linear regression growth (Investment Valuation, Ch.11):
    regress ln(revenue) on a time index via OLS; the slope is the continuously
    compounded growth and the annual rate = e^slope − 1. Unlike a CAGR this uses
    EVERY year, so a single depressed endpoint can't make a declining firm look
    cheap (the value-trap problem). Falls back to a linear OLS (slope ÷ mean)
    when any revenue is non-positive, per his negative-value guidance."""
    vals = [_row_val(r, "Revenue") for r in rows]
    vals = [v for v in vals if v is not None]
    if len(vals) < 3:
        return None
    t = [float(i) for i in range(1, len(vals) + 1)]
    if all(v > 0 for v in vals):
        slope = _ols_slope(t, [math.log(v) for v in vals])
        if slope is None:
            return None
        return math.exp(slope) - 1.0
    slope = _ols_slope(t, [float(v) for v in vals])
    if slope is None:
        return None
    mean = sum(vals) / len(vals)
    if mean <= 0:
        return None
    return slope / mean


# ── Life-cycle stage + fundamental growth (Damodaran Ch.11, Figure 11.6) ──────

def _company_lifecycle(rows: list[sqlite3.Row]) -> dict:
    """Classify ONE company by life-cycle stage from its own history, using the
    same classifier the sector and industry pages use. Feeds the growth clamps
    and the reinvestment method."""
    growth: list[tuple[int, float]] = []
    margins: list[tuple[int, float]] = []
    prev_rev: Optional[float] = None
    for r in rows:
        year = int(r["Calendar Year"])
        rev = _row_val(r, "Revenue")
        g = _yoy_pct(rev, prev_rev)
        if g is not None:
            growth.append((year, g))
        prev_rev = rev
        m = _safe_div(_row_val(r, "Operating Income"), rev)
        if m is not None:
            margins.append((year, m))
    return lifecycle_from_series(growth, margins)


def sales_to_capital(row: sqlite3.Row) -> Optional[float]:
    """Damodaran's sales-to-capital: revenue / (equity + debt - cash).

    Cash is subtracted on purpose. Invested capital means the capital actually
    working in the business, and a young company sitting on a pile of cash it
    raised but has not deployed is not capital-intensive just because the cash is
    on its balance sheet. Leaving cash in overstates the capital, understates this
    ratio, and then inflates the reinvestment the model thinks growth requires,
    which quietly values every cash-rich young company into the ground. (Note the
    module's older `_invested_capital` does NOT subtract cash; it feeds ROIC and
    EVA and is left alone here.)"""
    equity = _row_val(row, "Total Stockholders Equity")
    if equity is None:
        equity = _row_val(row, "Total Equity")
    debt = _row_val(row, "Total Debt") or 0.0
    cash = _row_val(row, "Cash And Cash Equivalents") or 0.0
    if equity is None:
        return None
    capital = equity + debt - cash
    s2c = _safe_div(_row_val(row, "Revenue"), capital)
    if s2c is None or not (_S2C_MIN <= s2c <= _S2C_MAX):
        return None
    return s2c


def _forward_sales_to_capital(latest: sqlite3.Row) -> Optional[float]:
    """The company's own sales-to-capital for the latest year."""
    return sales_to_capital(latest)


def _forward_reinvestment_rate(latest: sqlite3.Row) -> Optional[float]:
    """(Capex - Depreciation + change in non-cash working capital) / NOPAT.

    Damodaran's reinvestment rate: the share of after-tax operating profit the
    company puts back into the business. Mirrors the display metric computed in
    `_compute_one_metric`, recomputed here because the forecast runs before it."""
    capex = _row_val(latest, "Capital Expenditure")
    dep = _row_val(latest, "Depreciation and Amortization Cashflow")
    if dep is None:
        dep = _row_val(latest, "Depreciation And Amortization")
    d_nwc = _row_val(latest, "Change In Working Capital")
    nopat = _nopat_for_row(latest)
    if capex is None or dep is None or d_nwc is None or nopat in (None, 0):
        return None
    return (abs(capex) - dep - d_nwc) / nopat


def _fundamental_growth(rows: list[sqlite3.Row], roic: Optional[float]) -> Optional[dict]:
    """Damodaran Ch.11 fundamental growth: reinvestment rate x return on capital,
    plus the second-order term for a return that is improving on the assets the
    company already owns.

        g = (reinvestment rate x ROIC) + (ROIC_now - ROIC_prior) / ROIC_prior

    Delegates to valuation.growth.fcff_growth. The legacy caps flag preserves
    the pre-rebuild clamps (reinvest [0, 0.90], efficiency 0.10) byte-for-byte
    when VALUATION_ENGINE=legacy; the damodaran engine measures uncapped with
    diagnostics instead. Returns None when the return on capital carries no
    signal — those firms are valued from the revenue trend with
    sales-to-capital reinvestment instead."""
    if not rows or roic is None or roic <= 0:
        return None
    prev_roic = None
    prev2_roic = None
    if len(rows) >= 2:
        prev_roic = _compute_return_ratios(rows[-2]).get("Return On Invested Capital")
    if len(rows) >= 3:
        prev2_roic = _compute_return_ratios(rows[-3]).get("Return On Invested Capital")
    return _vgrowth.fcff_growth(rows, roic, prev_roic=prev_roic,
                                prev2_roic=prev2_roic,
                                legacy_caps=(valuation_engine() == "legacy"))


def _reconcile_growth(
    historical: Optional[float],
    fundamental: Optional[float],
    stage: Optional[str],
) -> tuple[Optional[float], str]:
    """Pick the growth rate the forecast should use, and say why.

    Damodaran's argument in Ch.11 is that fundamental growth is the sounder
    anchor because it ties the rate to what the company actually reinvests and
    earns. That only holds where the return on capital means something. For a
    young or loss-making company the return carries no signal, so the revenue
    trend leads and the reinvestment comes from the sales-to-capital ratio
    instead (Figure 11.6). For a mature or declining company both numbers are
    informative, so they are blended with the weight on fundamentals."""
    if fundamental is None:
        return historical, "historical revenue trend (fundamental growth is not meaningful here)"
    if historical is None:
        return fundamental, "fundamental growth (no usable revenue history)"
    if stage in ("emerging", "growth"):
        return historical, "historical revenue trend (young or high growth, so the revenue path leads)"
    blended = (FUNDAMENTAL_BLEND_WEIGHT * fundamental
               + (1.0 - FUNDAMENTAL_BLEND_WEIGHT) * historical)
    return blended, "fundamental growth blended with the historical trend (mature)"


def _stage_bounds(stage: Optional[str]) -> tuple[float, float]:
    """Growth clamps for the company's life-cycle stage, falling back to the
    flat mature bounds when the stage is unknown."""
    return _STAGE_GROWTH_BOUNDS.get(
        stage or "", (FORECAST_GROWTH_FLOOR, FORECAST_GROWTH_CAP))


# ── True WACC (Damodaran: market-value weights, synthetic-rating cost of debt) ─

# Synthetic-rating default-spread tables keyed by interest-coverage floor
# (EBIT / interest). Two tables by size, per Investment Valuation Ch.8.
# (coverage_floor, default_spread) — descending; pick the first floor exceeded.
_SYNTH_SPREAD_LARGE = [   # firms > $5B market cap
    (8.50, 0.0050), (6.50, 0.0065), (5.50, 0.0085), (4.25, 0.0100),
    (3.00, 0.0110), (2.50, 0.0160), (2.00, 0.0335), (1.75, 0.0375),
    (1.50, 0.0500), (1.25, 0.0525), (0.80, 0.0800), (0.65, 0.1000),
    (0.20, 0.1200), (float("-inf"), 0.1400),
]
_SYNTH_SPREAD_SMALL = [   # firms <= $5B market cap
    (12.50, 0.0050), (9.50, 0.0065), (7.50, 0.0085), (6.00, 0.0100),
    (4.50, 0.0110), (3.50, 0.0160), (3.00, 0.0335), (2.50, 0.0375),
    (2.00, 0.0500), (1.50, 0.0525), (1.25, 0.0800), (0.80, 0.1000),
    (0.50, 0.1200), (float("-inf"), 0.1500),
]
_LARGE_CAP_CUTOFF = 5_000_000_000.0
_FALLBACK_DEBT_SPREAD = 0.0160   # ~BBB, used when interest coverage isn't computable

# The synthetic-rating size split (Damodaran Ch.8 large- vs small-firm tables) is a
# USD $5B line, but Market Cap is stored in the filer's local currency. Convert it to
# USD via fx_rates (usd_per_unit — the same convention as the ranking paths in api.py)
# so a weak-currency filer is not misrouted onto the large-firm table.
_FX_RATES_CACHE: Optional[dict[str, float]] = None

def _company_profile_peers(conn: sqlite3.Connection, industry: str) -> Any:
    """The industry's latest-year peer set, from the ONE shared 30-min cache.

    ``connections/sector_cache.py`` already caches the industry panel for the
    connections bundle, and the panel's latest-year PeerSet is the same object
    ``load_peers`` would rebuild. Keeping a second cache here doubled the
    memory for every industry a reader visits and let the two copies disagree
    after a refresh. Imported lazily: ``connections`` imports only
    ``industry_structure``, so there is no cycle back to this module, and the
    lazy import keeps it that way if that ever changes.
    """
    from company_profile.common import industry_peer_set
    return industry_peer_set(conn, industry)


def _fx_rates_for_conversion() -> dict[str, float]:
    """{currency: usd_per_unit} from fx_rates, loaded once per process. Best-effort:
    a missing DB/table yields an empty map, so callers fall back to the local cap."""
    global _FX_RATES_CACHE
    if _FX_RATES_CACHE is None:
        _FX_RATES_CACHE = {}
        db_path = os.environ.get("FINANCIALS_DB", "financials.db")
        try:
            if os.path.exists(db_path):
                _FX_RATES_CACHE = FinancialDB(db_path).get_fx_rates()
        except Exception:  # noqa: BLE001 — a missing DB/table must never break a valuation
            _FX_RATES_CACHE = {}
    return _FX_RATES_CACHE


def _market_cap_usd(row: sqlite3.Row) -> Optional[float]:
    """Local-currency Market Cap converted to USD for the synthetic-rating size split
    ONLY (never for the WACC equity weight, which stays local against local debt). A
    USD, unknown, or rate-less currency returns the cap unconverted, keeping the
    pre-conversion behaviour for that row rather than guessing a rate."""
    mc = _row_val(row, "Market Cap")
    if mc is None:
        return None
    ccy = _row_str(row, "Reported Currency")
    if not ccy or ccy == "USD":
        return mc
    rate = _fx_rates_for_conversion().get(ccy)
    return mc * rate if rate is not None else mc


def _synthetic_default_spread(interest_coverage: float, market_cap: Optional[float]) -> float:
    table = _SYNTH_SPREAD_LARGE if (market_cap is not None and market_cap > _LARGE_CAP_CUTOFF) else _SYNTH_SPREAD_SMALL
    for floor, spread in table:
        if interest_coverage > floor:
            return spread
    return table[-1][1]


def compute_wacc(
    latest: sqlite3.Row,
    beta: Optional[float],
    rf: Optional[float],
    erp: Optional[float],
    tax: float,
    lease_debt: float = 0.0,
) -> tuple[Optional[float], dict]:
    """True weighted-average cost of capital, Damodaran style (Ch.8/15):

      WACC = E/(D+E)·Ke + D/(D+E)·Kd_pretax·(1−tax)

    Cost of equity Ke = CAPM (Rf + β·ERP). Pre-tax cost of debt = Rf + the
    default spread implied by a SYNTHETIC RATING from the interest-coverage
    ratio (EBIT/interest). Weights use market value of equity (market cap) and
    book debt as the accepted proxy for the market value of debt (maturity isn't
    in the data). Returns (wacc, component breakdown). A debt-free firm's WACC
    is simply its cost of equity."""
    ke = capm_discount_rate(beta, rf=rf, erp=erp)
    rf_eff = RISK_FREE_RATE if rf is None else rf
    erp_eff = EQUITY_RISK_PREMIUM if erp is None else erp

    market_cap = _row_val(latest, "Market Cap")
    market_cap_usd = _market_cap_usd(latest)   # size split only; weights stay local
    conventional_debt = _row_val(latest, "Total Debt") or 0.0
    # Damodaran Ch.9: operating leases are debt. The caller passes the debt value
    # of operating leases (PV of lease commitments) when it is available (10-K
    # footnote via the XBRL layer); it is added to conventional debt for the WACC
    # weight. Capital leases already inside Total Debt pass lease_debt=0 so they
    # are never double-counted. A lease-only firm (no conventional debt) still has
    # a cost of debt once its leases are capitalized.
    lease_debt = max(0.0, lease_debt)
    total_debt = conventional_debt + lease_debt
    ebit = _row_val(latest, "Operating Income")
    interest = _row_val(latest, "Interest Expense")

    interest_coverage: Optional[float] = None
    cost_debt_pretax: Optional[float] = None
    if total_debt > 0:
        if interest is not None and abs(interest) > 0 and ebit is not None:
            interest_coverage = ebit / abs(interest)
            cost_debt_pretax = rf_eff + _synthetic_default_spread(interest_coverage, market_cap_usd)
        else:
            cost_debt_pretax = rf_eff + _FALLBACK_DEBT_SPREAD
    # Damodaran Ch.8: the debt tax shield uses the MARGINAL rate (the interest
    # deduction saves tax at the marginal rate), not the firm's effective rate.
    cost_debt_after = cost_debt_pretax * (1.0 - MARGINAL_TAX_RATE) if cost_debt_pretax is not None else None

    e = market_cap if (market_cap is not None and market_cap > 0) else None
    d = total_debt if total_debt > 0 else 0.0
    if e is None or d <= 0 or cost_debt_after is None:
        wacc = ke
        weight_e, weight_d = 1.0, 0.0
    else:
        weight_e = e / (e + d)
        weight_d = d / (e + d)
        wacc = weight_e * ke + weight_d * cost_debt_after

    components = {
        "wacc": round(wacc, 4),
        "costOfEquity": round(ke, 4),
        "costOfDebtPretax": round(cost_debt_pretax, 4) if cost_debt_pretax is not None else None,
        "costOfDebtAfterTax": round(cost_debt_after, 4) if cost_debt_after is not None else None,
        "interestCoverage": round(interest_coverage, 2) if interest_coverage is not None else None,
        "weightEquity": round(weight_e, 4),
        "weightDebt": round(weight_d, 4),
        "marketValueEquity": round(e, 2) if e is not None else None,
        "bookValueDebt": round(d, 2),
        "conventionalDebt": round(conventional_debt, 2),
        "leaseDebt": round(lease_debt, 2),
        "beta": round(beta, 4) if beta is not None else None,
        "riskFreeRate": round(rf_eff, 4),
        "equityRiskPremium": round(erp_eff, 4),
        "marginalTaxRate": round(MARGINAL_TAX_RATE, 4),
        "effectiveTaxRate": round(tax, 4),
    }
    return wacc, components


def _run_fcff_projection(
    *,
    base_revenue: float,
    margin_cur: float,
    margin_tgt: float,
    tax: float,
    roic: float,
    wacc: float,
    g_init: float,
    g_term: float,
    equity_adjust: float,
    shares: float,
    horizon: int = FORECAST_HORIZON_YEARS,
    reinvest_method: str = "earnings",
    sales_to_capital: Optional[float] = None,
) -> Optional[dict]:
    """One FCFF firm valuation pass. Returns the projected rows + the
    firm→equity→per-share bridge, or None when the inputs are inconsistent
    (e.g. WACC <= terminal growth). Pure function — used for the base case and
    every sensitivity cell.

    The equity bridge uses Damodaran's GROSS-debt rule: ``equity_adjust`` is
    (cash & marketable securities − gross total debt − minority interest), so
    equity = firm value + equity_adjust. ``tax`` is the company's own effective
    rate and is applied to every year including the terminal — jurisdiction-
    correct for this global universe.

    Reinvestment comes from one of two bridges (Damodaran Ch.11):
      * ``earnings``       reinvestment rate = g / ROIC. Needs a positive ROIC,
                           so it only works for a company that already earns a
                           real return on its capital.
      * ``salesToCapital`` reinvestment = change in revenue / sales-to-capital.
                           This is the bridge for a young or loss-making company
                           whose earnings cannot anchor anything (Figure 11.6);
                           the ratio is the industry norm for such a firm, not
                           its own distorted one. It needs NO positive ROIC, so
                           it is what lets those companies be valued at all."""
    use_s2c = reinvest_method == "salesToCapital"
    if (
        base_revenue is None or base_revenue <= 0
        or margin_cur is None or margin_tgt is None
        or wacc is None or wacc <= g_term
        or shares is None or shares <= 0
    ):
        return None
    if use_s2c:
        if sales_to_capital is None or sales_to_capital <= 0:
            return None
    elif roic is None or roic <= 0:
        # The earnings bridge divides by ROIC, so a non-positive return makes it
        # meaningless. The sales-to-capital path above is the answer for those firms.
        return None

    pv_explicit = 0.0
    rev = base_revenue
    ebit_after_tax = 0.0
    proj_rows: list[dict] = []
    for t in range(1, horizon + 1):
        # Year 1 starts at the current growth/margin and glides to the terminal
        # value in the final explicit year — same convention as `_fade_growth`
        # (Damodaran's transition phase). The previous `t/horizon` started the
        # path already partway faded in year 1, understating near-term revenue.
        frac = (t - 1) / (horizon - 1) if horizon > 1 else 1.0
        g_t = g_init + (g_term - g_init) * frac          # fade growth toward stable
        margin_t = margin_cur + (margin_tgt - margin_cur) * frac
        prev_rev = rev
        rev = rev * (1.0 + g_t)
        ebit = rev * margin_t
        ebit_after_tax = ebit * (1.0 - tax)              # company's own effective rate
        if use_s2c:
            # Reinvestment funds the REVENUE the company is adding, not a share of
            # profit it may not have yet. Growth that shrinks revenue frees capital
            # rather than consuming it, so a negative change floors at zero.
            reinvestment = max(0.0, (rev - prev_rev) / sales_to_capital)
            reinvest_rate = (reinvestment / ebit_after_tax) if ebit_after_tax else None
        else:
            reinvest_rate = max(0.0, min(g_t / roic, FORECAST_REINVEST_CAP))
            reinvestment = ebit_after_tax * reinvest_rate
        fcff = ebit_after_tax - reinvestment
        pv = fcff / (1.0 + wacc) ** t
        pv_explicit += pv
        proj_rows.append({
            "year": t,
            "growth": round(g_t, 4),
            "revenue": round(rev, 2),
            "operatingMargin": round(margin_t, 4),
            "taxRate": round(tax, 4),
            "ebit": round(ebit, 2),
            "ebitAfterTax": round(ebit_after_tax, 2),
            "reinvestment": round(reinvestment, 2),
            "fcff": round(fcff, 2),
            "pvFcff": round(pv, 2),
        })

    # Terminal reinvestment. In stable growth Damodaran ties it to the return the
    # company earns forever: reinvestment rate = g / ROIC (Ch.12). A company that
    # reached the terminal year on the sales-to-capital bridge has, by then, an
    # earnings base to reinvest out of, so the terminal phase uses the earnings
    # rule whenever a positive ROIC exists and falls back to the sales-to-capital
    # bridge (on terminal revenue growth) when it does not.
    if roic is not None and roic > 0:
        reinvest_rate_term = max(0.0, min(g_term / roic, FORECAST_REINVEST_CAP))
        fcff_terminal = ebit_after_tax * (1.0 + g_term) * (1.0 - reinvest_rate_term)
    else:
        reinvest_term = max(0.0, (rev * g_term) / sales_to_capital) if sales_to_capital else 0.0
        fcff_terminal = ebit_after_tax * (1.0 + g_term) - reinvest_term
    terminal_value = fcff_terminal / (wacc - g_term)
    pv_terminal = terminal_value / (1.0 + wacc) ** horizon

    firm_value = pv_explicit + pv_terminal
    equity_value = firm_value + (equity_adjust or 0.0)
    intrinsic_per_share = equity_value / shares
    return {
        "rows": proj_rows,
        "pvExplicit": round(pv_explicit, 2),
        "fcffTerminal": round(fcff_terminal, 2),
        "terminalValue": round(terminal_value, 2),
        "pvTerminal": round(pv_terminal, 2),
        "firmValue": round(firm_value, 2),
        "equityValue": round(equity_value, 2),
        "intrinsicPerShare": round(intrinsic_per_share, 2),
    }


def _reverse_dcf_scan(
    *,
    base_revenue: float,
    margin_cur: float,
    margin_tgt: float,
    tax: float,
    roic: float,
    wacc: float,
    rf_eff: float,
    equity_adjust: float,
    shares: float,
    price: float,
    g_base: float,
    hist_growth: Optional[float],
    reinvest_method: str = "earnings",
    sales_to_capital: Optional[float] = None,
    valuer=None,
    band: tuple[float, float] = (-0.10, 0.40),
    advisory_cap: Optional[float] = None,
) -> Optional[dict]:
    """Reverse DCF (Penman Ch.4; Damodaran, Narrative and Numbers Ch.9): solve for
    the revenue growth the CURRENT PRICE already implies, using the same FCFF
    engine as the forward model. intrinsic(g) is NOT monotonic when ROIC < WACC
    (growth can destroy value), so scan a 1pp grid over ``band``, bracket every
    sign change of intrinsic(g) - price, and bisect each bracket. Reports the
    root nearest the base-case growth. The reinvestment bridge must match the
    forward model's, or the implied growth would be solved against a different
    company than the one being valued.

    ``valuer(g, g_term) -> intrinsic`` lets the caller supply the stage-aware
    engine so trial valuations share the chosen variant's structure;
    ``advisory_cap`` is the life-cycle band ceiling the implied rate is judged
    against (a diagnostic, not a model limit)."""
    if price is None or price <= 0:
        return None

    g_lo, g_hi = band
    steps = int(round((g_hi - g_lo) * 100)) + 1

    def _intrinsic(g: float) -> Optional[float]:
        # Terminal growth re-derived per trial, exactly as the forward model does.
        g_term = min(rf_eff, max(0.0, g))
        if valuer is not None:
            return valuer(g, g_term)
        out = _run_fcff_projection(
            base_revenue=base_revenue, margin_cur=margin_cur, margin_tgt=margin_tgt,
            tax=tax, roic=roic, wacc=wacc,
            g_init=g, g_term=g_term, equity_adjust=equity_adjust, shares=shares,
            reinvest_method=reinvest_method, sales_to_capital=sales_to_capital,
        )
        return out["intrinsicPerShare"] if out else None

    grid: list[tuple[float, float]] = []
    for i in range(steps):
        g = g_lo + (g_hi - g_lo) * i / (steps - 1)
        v = _intrinsic(g)
        if v is not None:
            grid.append((g, v - price))
    if len(grid) < 2:
        return None

    roots: list[float] = []
    for (ga, fa), (gb, fb) in zip(grid[:-1], grid[1:]):
        if fa == 0.0:
            roots.append(ga)
            continue
        if fa * fb >= 0:
            continue
        lo, f_lo, hi = ga, fa, gb
        for _ in range(60):
            mid = (lo + hi) / 2.0
            v = _intrinsic(mid)
            if v is None:
                break
            fm = v - price
            if abs(hi - lo) < 1e-4 or fm == 0.0:
                lo = mid
                break
            if (fm > 0) == (f_lo > 0):
                lo, f_lo = mid, fm
            else:
                hi = mid
        roots.append(round(lo, 4))
    if grid[-1][1] == 0.0:
        roots.append(grid[-1][0])

    if not roots:
        # No crossing anywhere on the band: the price sits entirely below or
        # entirely above every growth path this model can produce.
        all_above = all(f > 0 for _, f in grid)
        status = "below_band" if all_above else "above_band"
        note = (
            f"Even a {abs(g_lo):.0%} yearly revenue decline values the company "
            "above today's price. The market is pricing in something this model "
            "cannot see, or the stock trades below any plausible going-concern "
            "value."
            if all_above else
            f"Even {g_hi:.0%} yearly growth for the full projection cannot "
            "justify today's price with these margins and this cost of capital. "
            "The price rests on assumptions beyond this model."
        )
        return {
            "applicable": True, "status": status, "impliedGrowth": None,
            "baseGrowth": round(g_base, 4),
            "historicalGrowth": round(hist_growth, 4) if hist_growth is not None else None,
            "priceUsed": round(price, 2), "note": note,
        }

    implied = min(roots, key=lambda r: abs(r - g_base))
    _cap = advisory_cap if advisory_cap is not None else FORECAST_GROWTH_CAP
    beyond_cap = implied > _cap
    return {
        "applicable": True, "status": "solved",
        "impliedGrowth": round(implied, 4),
        "multipleRoots": len(roots) > 1,
        "roots": [round(r, 4) for r in roots] if len(roots) > 1 else None,
        "baseGrowth": round(g_base, 4),
        "historicalGrowth": round(hist_growth, 4) if hist_growth is not None else None,
        "priceUsed": round(price, 2),
        "beyondModelCap": beyond_cap,
        "beyondDiagnosticBand": beyond_cap,
        "diagnosticBandHigh": round(_cap, 4),
        "note": (
            "The market price implies faster growth than companies at this "
            "stage of the life cycle typically sustain, so treat the implied "
            "rate as a signal of stretched expectations rather than a plan."
            if beyond_cap else
            "Compare the implied growth with the company's own history. When the "
            "price demands far more than the business has ever delivered, the "
            "market is paying for a story that still has to come true."
        ),
    }


def _eva_valuation(
    proj_rows: list[dict],
    *,
    invested_capital0: float,
    wacc: float,
    g_term: float,
    equity_adjust: float,
    shares: float,
    horizon: int,
) -> Optional[dict]:
    """Economic Value Added valuation derived from the FCFF projection path.

    EVAₜ = NOPATₜ − WACC × (beginning invested capital). Capital grows by each
    year's reinvestment. Terminal uses the practitioner trick (marginal ROIC =
    WACC ⇒ new investment adds zero EVA ⇒ EVA flat ⇒ TV = EVA_N / WACC). Then
    V = Invested Capital₀ + MVA, equity = V + equity_adjust (gross-debt bridge).
    Also reports the simple perpetuity and constant-growth MVA forms."""
    if invested_capital0 is None or wacc is None or wacc <= 0 or not shares or shares <= 0:
        return None

    ic = invested_capital0
    pv_eva = 0.0
    eva_last = 0.0
    projected: list[dict] = []
    for r in proj_rows:
        nopat_t = r["ebitAfterTax"]
        capital_charge = wacc * ic                 # charge on beginning-of-year capital
        eva_t = nopat_t - capital_charge
        t = r["year"]
        pv = eva_t / (1.0 + wacc) ** t
        pv_eva += pv
        projected.append({
            "year": t,
            "nopat": round(nopat_t, 2),
            "investedCapital": round(ic, 2),
            "capitalCharge": round(capital_charge, 2),
            "eva": round(eva_t, 2),
            "pvEva": round(pv, 2),
        })
        ic = ic + r["reinvestment"]
        eva_last = eva_t

    terminal_eva = eva_last / wacc                  # flat-EVA perpetuity
    pv_terminal_eva = terminal_eva / (1.0 + wacc) ** horizon
    mva = pv_eva + pv_terminal_eva
    firm_value = invested_capital0 + mva
    equity_value = firm_value + (equity_adjust or 0.0)
    intrinsic = equity_value / shares

    eva1 = projected[0]["eva"] if projected else None
    perpetuity_mva = (eva1 / wacc) if eva1 is not None else None
    constant_growth_mva = (eva1 / (wacc - g_term)) if (eva1 is not None and wacc > g_term) else None

    return {
        "wacc": round(wacc, 4),
        "investedCapital0": round(invested_capital0, 2),
        "eva1": round(eva1, 2) if eva1 is not None else None,
        "projected": projected,
        "pvExplicit": round(pv_eva, 2),
        "terminalEva": round(terminal_eva, 2),
        "pvTerminalEva": round(pv_terminal_eva, 2),
        "mva": round(mva, 2),
        "perpetuityMva": round(perpetuity_mva, 2) if perpetuity_mva is not None else None,
        "constantGrowthMva": round(constant_growth_mva, 2) if constant_growth_mva is not None else None,
        "firmValue": round(firm_value, 2),
        "equityValue": round(equity_value, 2),
        "intrinsicPerShare": round(intrinsic, 2),
    }


def compute_forecast(
    rows: list[sqlite3.Row],
    beta: float | None = None,
    rf: float | None = None,
    erp: float | None = None,
    price: float | None = None,
    lease_debt: float = 0.0,
    industry_norms: dict | None = None,
    gdp_growth: float | None = None,
    price_unusable: bool = False,
    price_unusable_reason: str | None = None,
) -> Optional[dict]:
    """Damodaran FCFF firm valuation + EVA valuation, every input derived from
    the ticker's own financials.db history (its own effective tax rate, a true
    market-value-weighted WACC, and a log-linear regression growth estimate).
    ``rf``/``erp`` are the live risk-free rate and equity risk premium; when None
    they fall back to the module constants. Returns a JSON-safe dict, or None
    when the company lacks the data needed to project. For Financials/REITs it
    returns a {"applicable": False} marker (FCFF is the wrong model for them)."""
    if not rows or len(rows) < 2:
        return None

    # Defensive: never trust caller row order. `rows[-1]` must be the latest fiscal
    # year and every growth/regression pass must run oldest→newest, regardless of
    # how the caller sorted (a DESC-sorted list silently mis-scored the whole page).
    rows = sorted(rows, key=lambda r: int(r["Calendar Year"]))
    latest = rows[-1]
    ok, reason = fcff_applicable(latest)
    if not ok:
        return {"applicable": False, "notApplicableReason": reason}

    base_revenue = _row_val(latest, "Revenue")

    margins = [_safe_div(_row_val(r, "Operating Income"), _row_val(r, "Revenue")) for r in rows]
    margin_cur = _safe_div(_row_val(latest, "Operating Income"), base_revenue)
    margin_tgt = _median([m for m in margins if m is not None])
    if margin_cur is None:
        margin_cur = margin_tgt
    if margin_tgt is None:
        margin_tgt = margin_cur

    # A company that has never made money has a NEGATIVE median margin, and fading
    # toward it projects losses forever, which values the firm below zero. That is
    # not a valuation, it is an artefact. Damodaran's answer for a young company is
    # to fade its margin toward the margin its industry actually earns, so the
    # industry margin becomes the target whenever the company's own history has
    # none to offer. Its own margin is kept whenever that margin is positive.
    margin_target_source = "own history"
    _ind_margin = (industry_norms or {}).get("operatingMargin")
    if (margin_tgt is None or margin_tgt <= 0) and _ind_margin and _ind_margin > 0:
        margin_tgt = _ind_margin
        margin_target_source = "industry margin (the company's own history is loss-making)"

    tax = _effective_tax_rate(latest)
    roic = _compute_return_ratios(latest).get("Return On Invested Capital")
    # True WACC (CAPM cost of equity + synthetic-rating after-tax cost of debt,
    # market-value weighted) — discounts FCFF (a firm/pre-debt cash flow).
    wacc, wacc_build = compute_wacc(latest, beta, rf, erp, tax, lease_debt=lease_debt)
    rf_eff = RISK_FREE_RATE if rf is None else rf

    # ── Growth: historical trend, fundamental growth, and the reconciliation ──
    # (Damodaran Ch.11 + Figure 11.6.) Under the damodaran engine GROWTH_MODEL
    # is ignored: fundamental growth drives the earnings track outright.
    _engine = valuation_engine()
    mode = growth_model() if _engine == "legacy" else "damodaran"
    norms = industry_norms or {}
    life = _company_lifecycle(rows)
    stage = life.get("stage") if life.get("applicable") else None

    g_raw = _revenue_growth_regression(rows)   # unclamped history, kept for reverse DCF
    fund = _fundamental_growth(rows, roic)
    g_fund = fund["growth"] if fund else None
    g_reconciled, reconcile_note = _reconcile_growth(g_raw, g_fund, stage)

    # ── Reinvestment bridge (Figure 11.6) ────────────────────────────────────
    # A company that earns a real return reinvests out of earnings (g / ROIC). A
    # young or loss-making one cannot, so its reinvestment is tied to the revenue
    # it is adding, through a sales-to-capital ratio taken from its industry
    # rather than from its own build-out-distorted books.
    own_s2c = _forward_sales_to_capital(latest)
    industry_s2c = norms.get("salesToInvestedCapital")
    # The earnings bridge divides by ROIC, so it fails exactly when the return on
    # capital carries no signal. That, and only that, is what sends a company to
    # the sales-to-capital bridge. A fast-growing company that already earns a
    # strong return (a large profitable compounder) keeps the earnings bridge:
    # growing quickly is not the same as being unable to fund growth from profit.
    needs_s2c = roic is None or roic <= 0
    s2c_used = None
    reinvest_method = "earnings"
    if needs_s2c:
        # A young company's own ratio is distorted by its build-out, so the
        # industry norm leads and its own ratio is the fallback (Figure 11.6).
        s2c_used = industry_s2c if (stage in ("emerging", "growth") and industry_s2c) else own_s2c
        if s2c_used is None:
            s2c_used = industry_s2c or own_s2c
        if s2c_used is not None and s2c_used > 0:
            reinvest_method = "salesToCapital"

    if _engine == "legacy":
        # Which growth actually drives the projection. `shadow` keeps the
        # historical regression in the driver's seat so no valuation moves; it
        # still surfaces everything below so the change can be judged first.
        g_drive = g_reconciled if mode == "fundamental" else g_raw
        if g_drive is None:
            g_drive = norms.get("revenueGrowth")
        if g_drive is None:
            g_drive = 0.05
        # Under `regression` nothing changes at all, incl. the reinvestment path.
        if mode == "regression":
            reinvest_method, s2c_used = "earnings", None
        # Life-cycle-aware clamps (legacy behavior, byte-identical).
        use_stage_bounds = mode == "fundamental" or reinvest_method == "salesToCapital"
        if use_stage_bounds:
            lo, hi = _stage_bounds(stage)
        else:
            lo, hi = FORECAST_GROWTH_FLOOR, FORECAST_GROWTH_CAP
        g_init = max(lo, min(g_drive, hi))
    else:
        # ── Damodaran engine: growth is MEASURED, never assumed ──────────────
        # The earnings track runs on fundamental growth (reinvestment × ROIC);
        # the sales-to-capital track runs on the revenue trend (Figure 11.6).
        # The historical regression stays visible as a cross-check. When
        # nothing is derivable the forecast says so — there is no fabricated
        # fallback rate anywhere in this path.
        if reinvest_method == "salesToCapital":
            g_drive = g_raw if g_raw is not None else norms.get("revenueGrowth")
            reconcile_note = ("the revenue trend drives the projection, with "
                              "reinvestment tied to added revenue through the "
                              "sales-to-capital ratio (young-company path)")
        else:
            g_drive = g_fund
            reconcile_note = ("fundamental growth (reinvestment rate x return "
                              "on capital) drives the projection; the revenue "
                              "trend is shown as a cross-check")
            if g_drive is None:
                g_drive = g_raw if g_raw is not None else norms.get("revenueGrowth")
                reconcile_note = ("the revenue trend stands in (the company's "
                                  "reinvestment could not be measured)")
        if g_drive is None:
            return {
                "applicable": False,
                "reason": ("Growth could not be derived from this company's "
                           "fundamentals, its revenue history, or its "
                           "industry. Rather than assume a rate, the "
                           "projection is withheld."),
            }
        # No clamps: the life-cycle bounds are ADVISORY diagnostics now.
        g_init = g_drive
        lo, hi = _stage_bounds(stage)
    # Stable growth can never exceed the risk-free rate (Damodaran Ch.12).
    g_term = min(rf_eff, max(0.0, g_init))

    growth_reconciliation = {
        "historical": round(g_raw, 4) if g_raw is not None else None,
        "fundamental": round(g_fund, 4) if g_fund is not None else None,
        "reinvestmentRate": fund["reinvestmentRate"] if fund else None,
        "efficiencyTerm": fund["efficiencyTerm"] if fund else None,
        "reconciled": round(g_reconciled, 4) if g_reconciled is not None else None,
        "growthUsed": round(g_init, 4),
        "methodUsed": reconcile_note,
        "divergence": (round(abs(g_raw - g_fund), 4)
                       if (g_raw is not None and g_fund is not None) else None),
        "divergenceFlag": bool(g_raw is not None and g_fund is not None
                               and abs(g_raw - g_fund) > GROWTH_DIVERGENCE_FLAG),
        "reinvestmentMethod": reinvest_method,
        "salesToCapitalUsed": round(s2c_used, 3) if s2c_used else None,
        "ownSalesToCapital": round(own_s2c, 3) if own_s2c else None,
        "industrySalesToCapital": round(industry_s2c, 3) if industry_s2c else None,
        "growthCap": round(hi, 4),
        "growthFloor": round(lo, 4),
        "marginTargetSource": margin_target_source,
        "marginTarget": round(margin_tgt, 4) if margin_tgt is not None else None,
        "mode": mode,
    }

    # Gross-debt equity bridge (Damodaran Ch.15): equity = firm + cash − gross
    # debt − minority interest.  equity_adjust collapses the latter three.
    cash = _row_val(latest, "Cash And Cash Equivalents")
    gross_debt = _row_val(latest, "Total Debt")
    minority = _row_val(latest, "Minority Interest")
    equity_adjust = (cash or 0.0) - (gross_debt or 0.0) - (minority or 0.0)
    net_debt = _row_val(latest, "Net Debt")
    if net_debt is None and gross_debt is not None and cash is not None:
        net_debt = gross_debt - cash

    shares = _row_val(latest, "Weighted Average Shs Out Dil")
    if _engine != "legacy" and (shares is None or shares <= 0):
        # A missing share count in the latest filing is a data gap, not a fact
        # about the company: take the most recent KNOWN diluted count instead
        # of refusing to value the firm (a count is a measurement, never an
        # assumption). Legacy keeps its old refusal, byte-identical.
        for _r in reversed(rows[:-1]):
            _s = _row_val(_r, "Weighted Average Shs Out Dil")
            if _s is not None and _s > 0:
                shares = _s
                break
    market_cap = _row_val(latest, "Market Cap")

    dam_selection: Optional[dict] = None
    dam_variants: Optional[dict] = None
    dam_shape: tuple[int, int] = (0, 0)
    if _engine == "legacy":
        base = _run_fcff_projection(
            base_revenue=base_revenue, margin_cur=margin_cur, margin_tgt=margin_tgt,
            tax=tax, roic=roic, wacc=wacc,
            g_init=g_init, g_term=g_term, equity_adjust=equity_adjust, shares=shares,
            reinvest_method=reinvest_method, sales_to_capital=s2c_used,
        )
        if base is None:
            return None
    else:
        # ── Stage-structured valuation: every applicable 1/2/3-stage variant,
        # a per-firm recommendation, and Ch.12's stable-phase discipline ──────
        # Memoised per beta: every input other than beta is fixed for the life
        # of this forecast, and the reverse-DCF scan re-walks the same stage
        # schedule (same betas) for ~70 trial growth rates. Without this cache
        # one industry ranking recomputed WACC ~1,000x per company (530k calls
        # for Semiconductors) and timed out at the tunnel.
        _wacc_memo: dict[Optional[float], Optional[float]] = {}

        def _wacc_of_beta(b, _latest=latest, _rf=rf, _erp=erp, _tax=tax,
                          _lease=lease_debt, _memo=_wacc_memo):
            try:
                return _memo[b]
            except KeyError:
                w, _ = compute_wacc(_latest, b, _rf, _erp, _tax, lease_debt=_lease)
                _memo[b] = w
                return w
        wacc_stable_probe = _wacc_of_beta(
            _vstages.stable_beta(beta, from_high_growth=True))
        roic_stable, roic_stable_source = _vstages.stable_return(
            roic, norms.get("roic"), wacc_stable_probe)
        try:
            _ddm_info = _vgrowth.ddm_growth(rows)
        except Exception:  # noqa: BLE001 — payout is selector garnish, never a blocker
            _ddm_info = None
        excess = (roic - wacc) if (roic is not None and wacc is not None) else None
        choice = _vselector.select_model(
            fcff_ok=True, stage=stage, excess_return=excess,
            size_usd=_market_cap_usd(latest), g_fund=g_init, rf=rf_eff,
            roic=roic, margin_current=margin_cur,
            payout=(_ddm_info or {}).get("payoutUsed"),
            historical_growth=g_raw)
        # The SELECTOR owns the track decision (Ch. 11: negative margins OR a
        # signal-free return both send a firm to the revenue-driven path). The
        # reinvestment bridge is reconciled to it — a negative-margin firm
        # whose negative-equity artifact yields a "positive" ROIC must not be
        # run through the earnings engine.
        track = choice.track if choice.track in ("fcff", "nstage") else "fcff"
        if track == "nstage" and reinvest_method != "salesToCapital":
            s2c_used = (industry_s2c
                        if (stage in ("emerging", "growth") and industry_s2c)
                        else (own_s2c or industry_s2c))
            if s2c_used is None or s2c_used <= 0:
                return {
                    "applicable": False,
                    "reason": ("The company's earnings carry no usable signal "
                               "(negative margin or return on capital) and no "
                               "sales-to-capital ratio could be derived for "
                               "the revenue-driven path, so the projection is "
                               "withheld rather than assumed."),
                }
            reinvest_method = "salesToCapital"
            # The revenue trend leads on this path (Figure 11.6).
            _g_rev = g_raw if g_raw is not None else norms.get("revenueGrowth")
            if _g_rev is not None:
                g_init = _g_rev
                g_term = min(rf_eff, max(0.0, g_init))
                reconcile_note = ("the revenue trend drives the projection, "
                                  "with reinvestment tied to added revenue "
                                  "through the sales-to-capital ratio "
                                  "(young-company path)")
            # The reconciliation payload was built before this reconciliation;
            # keep it truthful about what actually drives the model.
            growth_reconciliation.update({
                "growthUsed": round(g_init, 4),
                "methodUsed": reconcile_note,
                "reinvestmentMethod": reinvest_method,
                "salesToCapitalUsed": round(s2c_used, 3) if s2c_used else None,
            })
        dam_variants = _vengines.fcff_stage_variants(
            base_revenue=base_revenue, margin_cur=margin_cur,
            margin_tgt=margin_tgt, tax=tax,
            g_high=g_init, g_stable=g_term,
            wacc_of_beta=_wacc_of_beta, beta_high=beta,
            roic_high=roic if (roic is not None and roic > 0) else None,
            roic_stable=(roic_stable if reinvest_method == "earnings" else None),
            roic_stable_source=roic_stable_source,
            reinvest_method=reinvest_method, sales_to_capital=s2c_used,
            # None when the quote cannot be compared with a per-ordinary-share
            # value, so every stage variant's own margin of safety comes back
            # empty rather than repeating the mismatch three more times. The
            # engine already treats a missing price that way; nothing inside
            # backend/valuation needs to know about currencies.
            equity_adjust=equity_adjust, shares=shares,
            price=(None if price_unusable else price),
            track=track, recommended_stages=choice.stages)
        rec_key = "3" if track == "nstage" else str(choice.stages)
        order = [rec_key] + [k for k in ("3", "2", "1") if k != rec_key]
        chosen_key = next(
            (k for k in order if dam_variants.get(k, {}).get("applicable")), None)
        if chosen_key is None:
            _fail_reason = (dam_variants.get(rec_key, {}).get("reason")
                            or "No stage structure is solvable for this company.")
            if track == "nstage":
                _fail_reason = ("The revenue-driven n-stage path (the only "
                                "workable structure for a company whose "
                                "earnings carry no signal) could not be "
                                "solved: " + _fail_reason)
            return {"applicable": False, "reason": _fail_reason}
        chosen = dam_variants[chosen_key]
        base = chosen["raw"]
        dam_shape = (base["nHigh"], base["nTransition"])
        # Diagnostics replace the old clamps: warn, never alter the number.
        dam_diags: list[dict] = []
        band = _vdiag.lifecycle_band_warning(g_init, stage)
        if band:
            dam_diags.append(band)
        share_warn = _vdiag.market_share_warning(g_init, dam_shape[0] + dam_shape[1],
                                                 gdp_growth)
        if share_warn:
            dam_diags.append(share_warn)
        try:
            dam_diags.extend(_vdiag.imputed_roic_warnings(
                base["rows"], _invested_capital(latest),
                norms.get("roic"), wacc))
        except Exception:  # noqa: BLE001
            pass
        if fund and fund.get("diagnostics"):
            dam_diags.extend(fund["diagnostics"])
        dam_selection = {
            "track": track,
            "recommendedStages": int(chosen_key),
            "selectorStages": choice.stages,
            "highGrowthYears": choice.high_growth_years,
            "archetype": choice.archetype,
            "rationale": choice.rationale,
            "hModelApplicable": choice.h_model_applicable,
            "roicStable": round(roic_stable, 4) if roic_stable is not None else None,
            "roicStableSource": roic_stable_source,
            "diagnostics": dam_diags,
            "stageVariants": {
                k: {kk: vv for kk, vv in v.items() if kk != "raw"}
                for k, v in dam_variants.items()
            },
        }

    intrinsic = base["intrinsicPerShare"]
    current_price = _effective_price(price, market_cap, shares, price_unusable)
    mos = None
    if current_price is not None and current_price > 0:
        mos = (intrinsic - current_price) / current_price

    # Reverse DCF (Penman Ch.4): what growth does today's price already assume?
    # Additive companion to the forward model above — same engine, inverted.
    #
    # It inverts the SAME model against the SAME price, so it inherits the same
    # currency problem: solved against a receipt's US dollar quote while the
    # model runs in the filer's own currency, the "growth the price implies" is
    # an answer to a question nobody asked. It is refused with the price.
    reverse_dcf: Optional[dict] = None
    if price_unusable:
        reverse_dcf = {"applicable": False, "reason": price_unusable_reason}
    elif current_price is not None and current_price > 0:
        try:
            if _engine == "legacy":
                reverse_dcf = _reverse_dcf_scan(
                    base_revenue=base_revenue, margin_cur=margin_cur, margin_tgt=margin_tgt,
                    tax=tax, roic=roic, wacc=wacc, rf_eff=rf_eff,
                    equity_adjust=equity_adjust, shares=shares,
                    price=current_price, g_base=g_init, hist_growth=g_raw,
                    reinvest_method=reinvest_method, sales_to_capital=s2c_used,
                )
            else:
                # Trial valuations use the SAME stage structure as the chosen
                # variant, and the scan band is wide open — an implied growth
                # is a measurement, not something to clip at a model cap.
                def _rev_valuer(g, gt, _shape=dam_shape):
                    out = _vengines.run_fcff_revenue(
                        base_revenue=base_revenue, margin_cur=margin_cur,
                        margin_tgt=margin_tgt, tax=tax,
                        g_high=g, g_stable=gt,
                        n_high=_shape[0], n_transition=_shape[1],
                        wacc_of_beta=_wacc_of_beta, beta_high=beta,
                        roic_high=roic if (roic is not None and roic > 0) else None,
                        roic_stable=(roic_stable if reinvest_method == "earnings" else None),
                        reinvest_method=reinvest_method,
                        sales_to_capital=s2c_used,
                        equity_adjust=equity_adjust, shares=shares)
                    return out["intrinsicPerShare"] if out else None
                reverse_dcf = _reverse_dcf_scan(
                    base_revenue=base_revenue, margin_cur=margin_cur, margin_tgt=margin_tgt,
                    tax=tax, roic=roic, wacc=wacc, rf_eff=rf_eff,
                    equity_adjust=equity_adjust, shares=shares,
                    price=current_price, g_base=g_init, hist_growth=g_raw,
                    reinvest_method=reinvest_method, sales_to_capital=s2c_used,
                    valuer=_rev_valuer, band=(-0.10, 0.60),
                    advisory_cap=hi,
                )
        except Exception as exc:  # noqa: BLE001 — an inversion edge case must not kill the forecast
            log.warning("reverse dcf failed: %s", exc)

    # β = 1 intrinsic — Valuation Handbook (Ch.5) found a uniform discount rate
    # often beats firm-specific betas; shown as a discount-rate sensitivity.
    wacc_b1, _ = compute_wacc(latest, 1.0, rf, erp, tax, lease_debt=lease_debt)
    if _engine == "legacy":
        base_b1 = _run_fcff_projection(
            base_revenue=base_revenue, margin_cur=margin_cur, margin_tgt=margin_tgt,
            tax=tax, roic=roic, wacc=wacc_b1,
            g_init=g_init, g_term=g_term, equity_adjust=equity_adjust, shares=shares,
            reinvest_method=reinvest_method, sales_to_capital=s2c_used,
        )
    else:
        base_b1 = _vengines.run_fcff_revenue(
            base_revenue=base_revenue, margin_cur=margin_cur, margin_tgt=margin_tgt,
            tax=tax, g_high=g_init, g_stable=g_term,
            n_high=dam_shape[0], n_transition=dam_shape[1],
            wacc_of_beta=lambda b: wacc_b1, beta_high=1.0,
            roic_high=roic if (roic is not None and roic > 0) else None,
            roic_stable=(roic_stable if reinvest_method == "earnings" else None),
            reinvest_method=reinvest_method, sales_to_capital=s2c_used,
            equity_adjust=equity_adjust, shares=shares,
        )
    beta_one_intrinsic = base_b1["intrinsicPerShare"] if base_b1 else None

    # Erickson (Global Investing) cross-check: company's own historical median
    # P/FCF applied to projected year-N FCF per share, discounted to today.
    pfcf_hist = [_row_val(r, "PFCF Ratio") for r in rows]
    exit_multiple = _median([p for p in pfcf_hist if p is not None and p > 0])
    fcfps0 = _row_val(latest, "Free Cash Flow Per Share")
    # P/FCF × FCF-per-share is an EQUITY value, so discount it at the cost of
    # equity, not the WACC. Discounting an equity cash flow at the (lower) WACC
    # overstates the value — Damodaran, *Investment Valuation* Ch.2, "Error 1".
    ke_exit = capm_discount_rate(beta, rf=rf, erp=erp) if beta is not None else wacc
    exit_cross_check = None
    _exit_horizon = len(base["rows"]) if _engine != "legacy" else FORECAST_HORIZON_YEARS
    if (exit_multiple is not None and fcfps0 is not None and fcfps0 > 0
            and ke_exit > 0 and _exit_horizon > 0):
        fcfps_n = fcfps0
        if _engine == "legacy":
            for t in range(1, _exit_horizon + 1):
                frac = t / _exit_horizon
                fcfps_n *= (1.0 + g_init + (g_term - g_init) * frac)
        else:
            # One fade convention: compound along the SAME per-year growth
            # path the chosen stage structure used.
            for r in base["rows"]:
                fcfps_n *= (1.0 + r["growth"])
        exit_cross_check = round((exit_multiple * fcfps_n) / (1.0 + ke_exit) ** _exit_horizon, 2)

    # EV/EBITDA exit-multiple cross-check (Rosenbaum & Pearl) + implied perpetuity
    # growth that multiple embeds (Damodaran reconciliation).
    ebitda_latest = _row_val(latest, "EBITDA")
    ev_ebitda_hist = [
        _row_val(r, "Enterprise Value Over EBITDA")
        or _safe_div(_row_val(r, "Enterprise Value"), _row_val(r, "EBITDA"))
        for r in rows
    ]
    ev_ebitda_mult = _median([m for m in ev_ebitda_hist if m is not None and m > 0])
    ebitda_margin = _safe_div(ebitda_latest, base_revenue)
    ev_cross_check = None
    ev_implied_growth = None
    if (ev_ebitda_mult and ebitda_margin and shares and shares > 0 and wacc > 0
            and base["rows"]):
        rev_terminal = base["rows"][-1]["revenue"]
        fcff_n = base["rows"][-1]["fcff"]
        terminal_ev = ev_ebitda_mult * (rev_terminal * ebitda_margin)
        pv_terminal_ev = terminal_ev / (1.0 + wacc) ** len(base["rows"])
        equity_exit = base["pvExplicit"] + pv_terminal_ev + equity_adjust
        ev_cross_check = round(equity_exit / shares, 2)
        if terminal_ev:
            ev_implied_growth = round(wacc - (fcff_n * (1.0 + g_term)) / terminal_ev, 4)

    # EVA valuation derived from the same projection path (needs explicit years).
    eva = None
    if base["rows"]:
        eva = _eva_valuation(
            base["rows"], invested_capital0=_invested_capital(latest), wacc=wacc,
            g_term=g_term, equity_adjust=equity_adjust, shares=shares,
            horizon=len(base["rows"]),
        )

    # Sensitivity: intrinsic per share across WACC × explicit revenue growth.
    wacc_axis = [round(wacc + d, 4) for d in (-0.015, -0.0075, 0.0, 0.0075, 0.015)]
    if _engine == "legacy":
        # Legacy: the axis respects the same life-cycle bounds as the base case.
        growth_axis = [
            round(max(lo, min(g_init + d, hi)), 4)
            for d in (-0.03, -0.015, 0.0, 0.015, 0.03)
        ]
    else:
        # Damodaran: the axis is centered on the measured growth, unclamped —
        # a company at a former cap no longer gets duplicate columns.
        growth_axis = [round(g_init + d, 4)
                       for d in (-0.03, -0.015, 0.0, 0.015, 0.03)]
    matrix: list[list[Optional[float]]] = []
    for w in wacc_axis:
        cells: list[Optional[float]] = []
        for g in growth_axis:
            gt = min(rf_eff, max(0.0, g))
            if _engine == "legacy":
                proj = _run_fcff_projection(
                    base_revenue=base_revenue, margin_cur=margin_cur, margin_tgt=margin_tgt,
                    tax=tax, roic=roic, wacc=w,
                    g_init=g, g_term=gt, equity_adjust=equity_adjust, shares=shares,
                    reinvest_method=reinvest_method, sales_to_capital=s2c_used,
                )
            else:
                proj = _vengines.run_fcff_revenue(
                    base_revenue=base_revenue, margin_cur=margin_cur,
                    margin_tgt=margin_tgt, tax=tax,
                    g_high=g, g_stable=gt,
                    n_high=dam_shape[0], n_transition=dam_shape[1],
                    wacc_of_beta=lambda b, _w=w: _w, beta_high=beta,
                    roic_high=roic if (roic is not None and roic > 0) else None,
                    roic_stable=(roic_stable if reinvest_method == "earnings" else None),
                    reinvest_method=reinvest_method, sales_to_capital=s2c_used,
                    equity_adjust=equity_adjust, shares=shares,
                )
            cells.append(proj["intrinsicPerShare"] if proj else None)
        matrix.append(cells)

    latest_year = int(latest["Calendar Year"])
    _horizon_used = len(base["rows"]) if _engine != "legacy" else FORECAST_HORIZON_YEARS
    return {
        "assumptions": {
            "horizonYears": _horizon_used,
            "baseRevenue": round(base_revenue, 2) if base_revenue is not None else None,
            "revenueGrowthInitial": round(g_init, 4),
            "revenueGrowthTerminal": round(g_term, 4),
            "operatingMarginCurrent": round(margin_cur, 4) if margin_cur is not None else None,
            "operatingMarginTarget": round(margin_tgt, 4) if margin_tgt is not None else None,
            "taxRate": round(tax, 4),
            "roic": round(roic, 4) if roic is not None else None,
            "wacc": round(wacc, 4),
            "growthMethod": reconcile_note,
            "reinvestmentMethod": reinvest_method,
            "lifecycleStage": stage,
            "cash": round(cash, 2) if cash is not None else None,
            "grossDebt": round(gross_debt, 2) if gross_debt is not None else None,
            "minorityInterest": round(minority, 2) if minority is not None else None,
            "netDebt": round(net_debt, 2) if net_debt is not None else None,
            "dilutedShares": round(shares, 2) if shares is not None else None,
            "exitPfcfMultiple": round(exit_multiple, 2) if exit_multiple is not None else None,
            "evEbitdaMultiple": round(ev_ebitda_mult, 2) if ev_ebitda_mult is not None else None,
        },
        "baseYear": latest_year,
        "years": [latest_year + t for t in range(1, _horizon_used + 1)],
        "valuationSelection": dam_selection,
        # Damodaran Ch.11: the historical trend, the fundamental rate the company's
        # own reinvestment and returns support, and which one the model used.
        "growthReconciliation": growth_reconciliation,
        "lifecycle": life,
        "rows": base["rows"],
        "pvExplicit": base["pvExplicit"],
        "terminalValue": base["terminalValue"],
        "pvTerminal": base["pvTerminal"],
        "firmValue": base["firmValue"],
        "cash": round(cash, 2) if cash is not None else None,
        "grossDebt": round(gross_debt, 2) if gross_debt is not None else None,
        "minorityInterest": round(minority, 2) if minority is not None else None,
        "netDebt": round(net_debt, 2) if net_debt is not None else None,
        "equityValue": base["equityValue"],
        "intrinsicPerShare": intrinsic,
        "currentPrice": round(current_price, 2) if current_price is not None else None,
        "marginOfSafety": round(mos, 4) if mos is not None else None,
        # Why there is no price and no margin of safety, when that is the case.
        # Absent (None) whenever the comparison was made, so a reader never has
        # to work out which of the two situations they are in.
        "priceComparison": (
            {"applicable": False, "reason": price_unusable_reason}
            if price_unusable else None
        ),
        "exitCrossCheckPerShare": exit_cross_check,
        "evEbitdaCrossCheckPerShare": ev_cross_check,
        "evEbitdaImpliedGrowth": ev_implied_growth,
        "betaOneIntrinsicPerShare": beta_one_intrinsic,
        "eva": eva,
        "waccBuild": wacc_build,
        # Reverse DCF (Penman): the growth today's price implies, same engine inverted.
        "reverseDcf": reverse_dcf,
        "applicable": True,
        "sensitivity": {
            "waccAxis": wacc_axis,
            "growthAxis": growth_axis,
            "matrix": matrix,
        },
    }


# ── Fundamental metric registry + per-year history ──────────────────────────

# Each metric: (key, label, group, unit). unit drives frontend formatting:
#   "%"  → value is a decimal, show as percent     "x" → show as <n>x ratio
# Formulas live in _compute_one_metric below; all derive from financials.db
# columns or the standard definitions the user specified (nothing novel).
DISPLAY_METRICS: list[tuple[str, str, str, str]] = [
    ("dupont_tax_burden", "Tax Burden (NI/EBT)", "DuPont", "x"),
    ("dupont_interest_burden", "Interest Burden (EBT/EBIT)", "DuPont", "x"),
    ("dupont_ebit_margin", "EBIT Margin (EBIT/Rev)", "DuPont", "%"),
    ("net_margin", "Net Margin", "DuPont", "%"),
    ("asset_turnover", "Asset Turnover", "DuPont", "x"),
    ("equity_multiplier", "Equity Multiplier", "DuPont", "x"),
    ("operating_margin", "Operating Margin", "Profitability & EVA", "%"),
    ("sga_revenue", "SG&A / Sales", "Profitability & EVA", "%"),
    ("eva_margin", "EVA Margin", "Profitability & EVA", "%"),
    ("roic_wacc_spread", "ROIC − WACC Spread", "Profitability & EVA", "%"),
    ("sales_invested_capital", "Sales / Invested Capital", "Capital Efficiency", "x"),
    ("capex_depreciation", "Capex / Depreciation", "Capital Efficiency", "x"),
    ("reinvestment_rate", "Reinvestment Rate", "Capital Efficiency", "%"),
    ("marginal_roic", "Marginal ROIC", "Capital Efficiency", "%"),
    ("fcf_net_income", "FCF / Net Income", "Capital Efficiency", "x"),
    ("operating_leverage", "Operating Leverage (DOL)", "Capital Efficiency", "x"),
    ("liabilities_equity", "Liabilities / Equity", "Leverage & Coverage", "x"),
    ("net_debt_ocf", "Net Debt / OCF", "Leverage & Coverage", "x"),
    ("interest_coverage", "Interest Coverage", "Leverage & Coverage", "x"),
    ("ebitda_capex_interest", "(EBITDA − Capex) / Interest", "Leverage & Coverage", "x"),
    ("cogs_inventory", "COGS / Inventory", "Leverage & Coverage", "x"),
    ("ccc", "Cash Conversion Cycle", "Working Capital & Cash Conversion", "d"),
    ("dso", "Days Sales Outstanding", "Working Capital & Cash Conversion", "d"),
    ("dio", "Days Inventory Outstanding", "Working Capital & Cash Conversion", "d"),
    ("dpo", "Days Payables Outstanding", "Working Capital & Cash Conversion", "d"),
    ("receivables_turnover", "Receivables Turnover", "Working Capital & Cash Conversion", "x"),
    ("payables_turnover", "Payables Turnover", "Working Capital & Cash Conversion", "x"),
    ("pe", "P / E", "Valuation Multiples", "x"),
    ("ev_ebitda", "EV / EBITDA", "Valuation Multiples", "x"),
    ("ev_ebit", "EV / EBIT", "Valuation Multiples", "x"),
    ("pfcf", "P / FCF", "Valuation Multiples", "x"),
    ("pb", "P / B", "Valuation Multiples", "x"),
    ("ps", "P / Sales", "Valuation Multiples", "x"),
    ("pocf", "P / OCF", "Valuation Multiples", "x"),
    # Earnings-quality / forensic trend metrics (Schilit; Sloan 1996; Lev & Gu).
    ("income_quality", "Income Quality (CFO/NI)", "Earnings Quality", "x"),
    ("sloan_accruals", "Sloan Accruals Ratio", "Earnings Quality", "%"),
    ("sbc_revenue", "SBC / Revenue", "Earnings Quality", "%"),
    # Cash-flow leverage / coverage (joins the existing Leverage & Coverage group).
    ("net_debt_ebitda", "Net Debt / EBITDA", "Leverage & Coverage", "x"),
    ("fcf_total_debt", "FCF / Total Debt", "Leverage & Coverage", "%"),
    # ROE history for the P/B-vs-ROE anchor (joins Profitability & EVA).
    ("roe", "Return On Equity", "Profitability & EVA", "%"),
    # Leverage ROE decomposition terms (Damodaran Ch.11). ROIC, Debt To Equity and
    # Return On Equity are already above, so only the three terms unique to the
    # identity are added; each one gives its table cell a sidebar chart.
    ("book_interest_rate", "Book Interest Rate", "Leverage & Coverage", "%"),
    ("effective_tax_rate", "Effective Tax Rate", "Profitability & EVA", "%"),
    ("leverage_gain", "Leverage Gain", "Profitability & EVA", "%"),
    ("after_tax_debt_cost", "After-Tax Cost of Debt", "Leverage & Coverage", "%"),
    ("roic_book_rate_spread", "ROIC − After-Tax Debt Cost", "Profitability & EVA", "%"),
    # Ratio histories backing the definition sidebar graphs (formulas mirror the
    # quality-score ratio computations in _compute_solvency_ratios).
    ("roa", "Return On Assets", "Profitability & EVA", "%"),
    ("current_ratio", "Current Ratio", "Leverage & Coverage", "x"),
    ("quick_ratio", "Quick Ratio", "Leverage & Coverage", "x"),
    ("debt_service_coverage", "Debt Service Coverage", "Leverage & Coverage", "x"),
    ("debt_to_equity", "Debt To Equity", "Leverage & Coverage", "x"),
    ("debt_to_assets", "Debt To Assets", "Leverage & Coverage", "%"),
    # Value-creation, growth and risk metrics shared with the comparative matrix,
    # so the individual page shows the same set, each with history + a clickable
    # definition. EVA and NOPAT are dollar figures; beta is the regression beta
    # injected per year from the precomputed beta_history table.
    ("eva", "EVA", "Profitability & EVA", "$"),
    ("nopat", "NOPAT", "Profitability & EVA", "$"),
    ("roic", "ROIC", "Profitability & EVA", "%"),
    ("wacc", "WACC", "Profitability & EVA", "%"),
    ("cost_of_equity", "Cost of Equity", "Profitability & EVA", "%"),
    ("excess_return", "Excess Return (ROE − Ke)", "Profitability & EVA", "%"),
    ("net_interest_margin", "Net Interest Margin", "Profitability & EVA", "%"),
    ("justified_pb", "Justified P/B", "Valuation Multiples", "x"),
    ("revenue_growth", "Revenue Growth", "Growth", "%"),
    ("net_income_growth", "Net Income Growth", "Growth", "%"),
    ("beta", "Beta", "Risk", "x"),
]


def _compute_one_metric(
    row: sqlite3.Row,
    prev: Optional[sqlite3.Row],
    wacc: Optional[float],
    ke: Optional[float] = None,
    rf_eff: Optional[float] = None,
) -> dict[str, Optional[float]]:
    """All display metrics for a single year (prev row enables the YoY-based
    ones). `ke` is the cost of equity and `rf_eff` the risk-free rate, used for
    the equity value-creation metrics. Every formula matches a standard
    definition."""
    rev = _row_val(row, "Revenue")
    ni = _row_val(row, "Net Income")
    ta = _row_val(row, "Total Assets")
    equity = _row_val(row, "Total Stockholders Equity") or _row_val(row, "Total Equity")
    op_inc = _row_val(row, "Operating Income")
    ic = _invested_capital(row)
    nopat = _nopat_for_row(row)
    roic = _row_val(row, "ROIC")
    if roic is None:
        # Fall back to NOPAT / invested capital (positive base only) so the ROIC and
        # ROIC−WACC charts don't go blank in years the stored column is null —
        # matching the fallback in _compute_return_ratios used by the verdict.
        _ic = _invested_capital(row)
        if _ic is not None and _ic > 0:
            roic = _safe_div(nopat, _ic)
    capex = _row_val(row, "Capital Expenditure")
    dep = _row_val(row, "Depreciation and Amortization Cashflow")
    fcf = _row_val(row, "Free Cash Flow")
    ocf = _row_val(row, "Operating Cash Flow")
    net_debt = _row_val(row, "Net Debt")
    tot_liab = _row_val(row, "Total Liabilities")
    interest = _row_val(row, "Interest Expense")
    ebitda = _row_val(row, "EBITDA")
    cogs = _row_val(row, "Cost Of Revenue")
    inventory = _row_val(row, "Inventory")
    receivables = _row_val(row, "Net Receivables")
    payables = _row_val(row, "Account Payables")
    d_nwc = _row_val(row, "Change In Working Capital")
    market_cap = _row_val(row, "Market Cap")
    tot_debt = _row_val(row, "Total Debt")
    ev = _row_val(row, "Enterprise Value")
    sbc = _row_val(row, "Stock Based Compensation")
    ibt = _row_val(row, "Income Before Tax")
    current_assets = _row_val(row, "Total Current Assets")
    current_liab = _row_val(row, "Total Current Liabilities")
    short_term_debt = _row_val(row, "Short Term Debt")

    abs_capex = abs(capex) if capex is not None else None
    abs_int = abs(interest) if interest is not None else None

    # Sloan (1996) cash-flow accruals ratio = (Net Income − CFO) / average total
    # assets. High positive accruals = earnings running ahead of cash (low quality).
    prev_ta = _row_val(prev, "Total Assets") if prev is not None else None
    avg_assets = ((ta + prev_ta) / 2.0) if (ta is not None and prev_ta is not None) else ta
    sloan_accruals = None
    if ni is not None and ocf is not None and avg_assets not in (None, 0):
        sloan_accruals = (ni - ocf) / avg_assets
    # Income Quality = CFO / Net Income (prefer the stored FMP column).
    iq_col = _row_val(row, "Income Quality")
    income_quality = iq_col if iq_col is not None else _safe_div(ocf, ni)
    sbc_rev_col = _row_val(row, "Stock Based Compensation To Revenue")
    sbc_revenue = sbc_rev_col if sbc_rev_col is not None else _safe_div(sbc, rev)
    ndte_col = _row_val(row, "Net Debt To EBITDA")
    net_debt_ebitda = ndte_col if ndte_col is not None else _safe_div(net_debt, ebitda)
    pb_col = _row_val(row, "PB Ratio")
    pb = pb_col if pb_col is not None else _safe_div(market_cap, equity)
    roe_col = _row_val(row, "ROE")
    roe_val = roe_col if roe_col is not None else _safe_div(ni, equity)
    # Extended (5-factor) DuPont levers — ROE = tax × interest × EBIT-margin × turnover × leverage.
    # The first three decompose net margin: (NI/EBT)(EBT/EBIT)(EBIT/Rev) = NI/Rev. EBIT = Operating Income.
    dupont_tax_burden = _safe_div(ni, ibt)            # NI / EBT
    dupont_interest_burden = _safe_div(ibt, op_inc)   # EBT / EBIT
    dupont_ebit_margin = _safe_div(op_inc, rev)       # EBIT / Revenue

    # Working capital — Cash Conversion Cycle = DSO + DIO − DPO (365-day basis).
    # Prefer the stored day-metrics; fall back to the textbook formulas from the
    # raw balance-sheet/income lines so coverage is complete.
    dso = _row_val(row, "Days Sales Outstanding")
    if dso is None and receivables is not None:
        dso = _safe_div(365.0 * receivables, rev)
    dio = _row_val(row, "Days Of Inventory On Hand")
    if dio is None and inventory is not None:
        dio = _safe_div(365.0 * inventory, cogs)
    dpo = _row_val(row, "Days Payables Outstanding")
    if dpo is None and payables is not None:
        dpo = _safe_div(365.0 * payables, cogs)
    ccc = (dso + dio - dpo) if (dso is not None and dio is not None and dpo is not None) else None
    receivables_turnover = _row_val(row, "Receivables Turnover") or _safe_div(rev, receivables)
    payables_turnover = _row_val(row, "Payables Turnover") or _safe_div(cogs, payables)

    eva = None
    if nopat is not None and wacc is not None and ic is not None:
        eva = nopat - wacc * ic

    reinvestment_rate = None
    if abs_capex is not None and dep is not None and d_nwc is not None and nopat not in (None, 0):
        reinvestment_rate = (abs_capex - dep - d_nwc) / nopat

    marginal_roic = None
    operating_leverage = None
    revenue_growth = None
    net_income_growth = None
    if prev is not None:
        prev_nopat = _nopat_for_row(prev)
        prev_ic = _invested_capital(prev)
        if (prev_nopat is not None and nopat is not None
                and prev_ic is not None and ic is not None and (ic - prev_ic) != 0):
            marginal_roic = (nopat - prev_nopat) / (ic - prev_ic)
        prev_op = _row_val(prev, "Operating Income")
        prev_rev = _row_val(prev, "Revenue")
        d_op = _yoy_pct(op_inc, prev_op)
        d_rev = _yoy_pct(rev, prev_rev)
        if d_op is not None and d_rev not in (None, 0):
            operating_leverage = d_op / d_rev
        revenue_growth = _yoy_pct(rev, prev_rev)
        net_income_growth = _yoy_pct(ni, _row_val(prev, "Net Income"))

    # Equity value creation: per-year ROE against the (current) cost of equity,
    # and the price-to-book the fundamentals justify (Damodaran). g = retention ×
    # ROE, capped at the risk-free rate.
    excess_return = (roe_val - ke) if (roe_val is not None and ke is not None) else None
    justified_pb = None
    if ke is not None and roe_val is not None and roe_val > 0:
        payout = _row_val(row, "Payout Ratio")
        payout = max(0.0, min(1.0, payout)) if payout is not None else None
        retention = (1.0 - payout) if payout is not None else 1.0
        g_cap = rf_eff if rf_eff is not None else RISK_FREE_RATE
        g_eq = min(g_cap, max(0.0, retention * roe_val))
        if ke > g_eq:
            justified_pb = (roe_val - g_eq) / (ke - g_eq)

    # Net interest margin — only meaningful for spread-based lenders, so it is
    # computed only when interest income is a material share of revenue.
    interest_income = _row_val(row, "Interest Income")
    net_interest_margin = None
    if (interest_income is not None and rev not in (None, 0) and ta not in (None, 0)
            and abs_int is not None and (interest_income / rev) >= 0.20):
        net_interest_margin = (interest_income - abs_int) / ta

    # Leverage ROE identity terms (Damodaran Ch.11), computed by the same helper
    # the section itself uses so the charts and the table can never disagree.
    lev_roe = _leverage_roe_terms(row)

    return {
        "net_margin": _safe_div(ni, rev),
        "asset_turnover": _safe_div(rev, ta),
        "equity_multiplier": _safe_div(ta, equity),
        "dupont_tax_burden": dupont_tax_burden,
        "dupont_interest_burden": dupont_interest_burden,
        "dupont_ebit_margin": dupont_ebit_margin,
        "book_interest_rate": lev_roe["bookInterestRate"],
        "effective_tax_rate": lev_roe["taxRate"],
        "leverage_gain": lev_roe["leverageGain"],
        "after_tax_debt_cost": lev_roe["afterTaxDebtCost"],
        "roic_book_rate_spread": lev_roe["spread"],
        "operating_margin": _safe_div(op_inc, rev),
        "eva_margin": _safe_div(eva, rev),
        "roic_wacc_spread": (roic - wacc) if (roic is not None and wacc is not None) else None,
        "sales_invested_capital": _safe_div(rev, ic),
        "capex_depreciation": _safe_div(abs_capex, dep),
        "reinvestment_rate": reinvestment_rate,
        "marginal_roic": marginal_roic,
        "fcf_net_income": _safe_div(fcf, ni),
        "operating_leverage": operating_leverage,
        "liabilities_equity": _safe_div(tot_liab, equity),
        "net_debt_ocf": _safe_div(net_debt, ocf),
        "interest_coverage": _safe_div(op_inc, abs_int),
        "ebitda_capex_interest": _safe_div(
            (ebitda - abs_capex) if (ebitda is not None and abs_capex is not None) else None, abs_int),
        "cogs_inventory": _safe_div(cogs, inventory),
        "ccc": ccc,
        "dso": dso,
        "dio": dio,
        "dpo": dpo,
        "receivables_turnover": receivables_turnover,
        "payables_turnover": payables_turnover,
        "pe": _row_val(row, "PE Ratio") or _safe_div(market_cap, ni),
        "ev_ebitda": _row_val(row, "Enterprise Value Over EBITDA")
        or _safe_div(_row_val(row, "Enterprise Value"), ebitda),
        "ev_ebit": _safe_div(ev, op_inc),
        # The three price multiples share one selector so they cannot disagree
        # about which source they trust (see _price_multiple).
        "pfcf": _price_multiple(row, "PFCF Ratio", market_cap, fcf),
        "pb": pb,
        "ps": _price_multiple(row, "Price To Sales Ratio", market_cap, rev),
        "pocf": _price_multiple(row, "POCF Ratio", market_cap, ocf),
        # The stored column is already a decimal fraction (AAPL FY2025 = 0.06632,
        # matching SG&A 27.601B / Revenue 416.161B), so no /100 rescale is needed
        # for the "%" display unit. Outside [0, _SGA_REVENUE_MAX] the stored
        # figure is not a share of sales at all, so it is dropped rather than
        # rendered as a six-figure percentage.
        "sga_revenue": _sane_share(
            _row_val(row, "Sales General And Administrative To Revenue")
            or _safe_div(_row_val(row, "Selling General And Administrative Expenses"), rev),
            _SGA_REVENUE_MAX,
        ),
        "income_quality": income_quality,
        "sloan_accruals": sloan_accruals,
        "sbc_revenue": sbc_revenue,
        "net_debt_ebitda": net_debt_ebitda,
        "fcf_total_debt": _safe_div(fcf, tot_debt),
        "roe": roe_val,
        "roa": _safe_div(ni, ta),
        "quick_ratio": _safe_div(
            (current_assets - inventory) if (current_assets is not None and inventory is not None) else None,
            current_liab),
        "debt_service_coverage": _safe_div(
            ocf if ocf is not None else ebitda,
            ((abs_int or 0.0) + (short_term_debt or 0.0)) or None),
        "current_ratio": _safe_div(current_assets, current_liab),
        "debt_to_equity": _row_val(row, "Debt To Equity") or _safe_div(tot_debt, equity),
        "debt_to_assets": _row_val(row, "Debt To Assets") or _safe_div(tot_debt, ta),
        # Shared-with-comparative value-creation, growth and risk metrics.
        "eva": eva,
        "nopat": nopat,
        "roic": roic,
        "excess_return": excess_return,
        "justified_pb": justified_pb,
        "net_interest_margin": net_interest_margin,
        "revenue_growth": revenue_growth,
        "net_income_growth": net_income_growth,
        # wacc, cost_of_equity and beta are filled in by metric_history (they are
        # ticker-level constants / externally sourced, not per-row computations).
    }


def metric_history(
    rows: list[sqlite3.Row],
    beta: float | None = None,
    rf: float | None = None,
    erp: float | None = None,
    beta_hist: dict[int, float] | None = None,
    hist_params: dict[int, dict[str, float]] | None = None,
) -> dict[str, dict[int, Optional[float]]]:
    """{metric_key: {year: value}} for every DISPLAY_METRICS entry, all years.

    Cost of equity and WACC are computed PER YEAR from three time-varying inputs:
    that year's beta (trailing-60-month regression of the company's monthly
    returns on the S&P 500, from beta_history); that year's risk-free rate and
    implied equity risk premium (Damodaran's year-end T-bond rate + implied ERP,
    via hist_params); and that year's capital structure and tax rate. So the WACC
    and Cost of Equity charts track how the company's market risk, the rate
    environment, and its leverage actually drifted, instead of stamping one
    current value on every year. Each missing input falls back to the single live
    value (beta to the static ticker beta; rf/erp to the passed live rf/erp). The
    EVA-based metrics charge capital at the same per-year WACC."""
    beta_hist = beta_hist or {}
    hist_params = hist_params or {}
    # Defensive: oldest→newest so each year's `prev` is the prior fiscal year and
    # YoY metrics aren't computed backwards on a reverse-sorted caller list.
    rows = sorted(rows, key=lambda r: int(r["Calendar Year"]))
    out: dict[str, dict[int, Optional[float]]] = {k: {} for (k, _l, _g, _u) in DISPLAY_METRICS}
    prev: Optional[sqlite3.Row] = None
    for row in rows:
        year = int(row["Calendar Year"])
        beta_year = beta_hist.get(year, beta)
        hp = hist_params.get(year) or {}
        rf_year = hp.get("rf", rf)
        erp_year = hp.get("erp", erp)
        rf_year_eff = RISK_FREE_RATE if rf_year is None else rf_year
        ke_year = capm_discount_rate(beta_year, rf=rf_year, erp=erp_year)
        wacc_year, _ = compute_wacc(row, beta_year, rf_year, erp_year, _effective_tax_rate(row))
        vals = _compute_one_metric(row, prev, wacc_year, ke_year, rf_year_eff)
        vals["wacc"] = wacc_year
        vals["cost_of_equity"] = ke_year
        for key in out:
            out[key][year] = vals.get(key)
        prev = row
    return out


# ── Lean per-share valuation wrappers (shared with comparative module) ───────

def fcff_intrinsic_per_share(
    rows: list[sqlite3.Row], beta: float | None = None,
    rf: float | None = None, erp: float | None = None,
    price: float | None = None,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """(intrinsic, current_price, margin_of_safety, growth_used) from the FCFF
    firm model — the same engine used on the individual page, for the
    comparative leaderboard's DCF column."""
    f = compute_forecast(rows, beta=beta, rf=rf, erp=erp, price=price)
    if f is None:
        return None, None, None, None
    return (
        f.get("intrinsicPerShare"),
        f.get("currentPrice"),
        f.get("marginOfSafety"),
        f.get("assumptions", {}).get("revenueGrowthInitial"),
    )


def eva_intrinsic_per_share(
    rows: list[sqlite3.Row], beta: float | None = None,
    rf: float | None = None, erp: float | None = None,
    price: float | None = None,
) -> tuple[Optional[float], Optional[float]]:
    """(eva_intrinsic_per_share, eva_margin_of_safety) from the 2-stage EVA
    valuation, for the comparative leaderboard's EVA column."""
    f = compute_forecast(rows, beta=beta, rf=rf, erp=erp, price=price)
    if f is None or not f.get("eva"):
        return None, None
    eva = f["eva"]
    intrinsic = eva.get("intrinsicPerShare")
    price = f.get("currentPrice")
    mos = ((intrinsic - price) / price) if (intrinsic is not None and price and price > 0) else None
    return intrinsic, (round(mos, 4) if mos is not None else None)


# ── Essential quality / value ratios (latest year) ──────────────────────────

def _col_or(latest: sqlite3.Row, col: str, fallback: Optional[float]) -> Optional[float]:
    """Stored column value if present (incl. legit 0/negative), else a fallback.
    Unlike ``x or y`` this preserves a genuine 0.0 or negative reading."""
    v = _row_val(latest, col)
    return v if v is not None else fallback


def _compute_quality_value_ratios(
    latest: sqlite3.Row, prev: Optional[sqlite3.Row]
) -> dict[str, Optional[float]]:
    """The essential ratios requested for the individual layer, latest year.
    Most map to an existing financials.db column; a few are computed. Earnings-
    quality grounding: Sloan (1996) accruals, Lev & Gu cash-conversion."""
    ni = _row_val(latest, "Net Income")
    ocf = _row_val(latest, "Operating Cash Flow")
    ta = _row_val(latest, "Total Assets")
    prev_ta = _row_val(prev, "Total Assets") if prev is not None else None
    avg_assets = ((ta + prev_ta) / 2.0) if (ta is not None and prev_ta is not None) else ta
    fcf = _row_val(latest, "Free Cash Flow")
    tot_debt = _row_val(latest, "Total Debt")
    ev = _row_val(latest, "Enterprise Value")
    op_inc = _row_val(latest, "Operating Income")
    equity = _row_val(latest, "Total Stockholders Equity") or _row_val(latest, "Total Equity")
    market_cap = _row_val(latest, "Market Cap")
    rev = _row_val(latest, "Revenue")
    sbc = _row_val(latest, "Stock Based Compensation")
    ebitda = _row_val(latest, "EBITDA")
    net_debt = _row_val(latest, "Net Debt")

    sloan = None
    if ni is not None and ocf is not None and avg_assets not in (None, 0):
        sloan = (ni - ocf) / avg_assets

    return {
        "Net Debt To EBITDA": _col_or(latest, "Net Debt To EBITDA", _safe_div(net_debt, ebitda)),
        "Income Quality": _col_or(latest, "Income Quality", _safe_div(ocf, ni)),
        "SBC To Revenue": _col_or(latest, "Stock Based Compensation To Revenue", _safe_div(sbc, rev)),
        "FCF To Total Debt": _safe_div(fcf, tot_debt),
        "EV To EBIT": _safe_div(ev, op_inc),
        "Sloan Accruals Ratio": sloan,
        "Price To Earnings": _col_or(latest, "PE Ratio", _safe_div(market_cap, ni)),
        "Price To Book": _col_or(latest, "PB Ratio", _safe_div(market_cap, equity)),
    }


# ── Deep-value asset floors (Graham) ────────────────────────────────────────

def _valuation_anchors(latest: sqlite3.Row) -> dict:
    """Graham Number, NCAV and Net-Net asset floors, compared to price. These are
    downside anchors (Graham, Security Analysis), most meaningful for non-financials
    with real current assets; for asset-light/financial firms they are usually n/a.

    Stored FMP columns are surfaced as-is; only safe arithmetic (NCAV ÷ shares,
    price comparisons) is computed here — the column formulas are not re-derived."""
    shares = _row_val(latest, "Weighted Average Shs Out Dil")
    market_cap = _row_val(latest, "Market Cap")
    price = _safe_div(market_cap, shares)

    graham_number = _row_val(latest, "Graham Number")          # sqrt(22.5·EPS·BVPS)/share
    graham_net_net = _row_val(latest, "Graham Net Net")        # FMP net-net (per share)
    ncav_total = _row_val(latest, "Net Current Asset Value")   # total $ (CA − total liab)
    ncav_ps = _safe_div(ncav_total, shares)

    def upside(anchor: Optional[float]) -> Optional[float]:
        if anchor is None or price is None or price <= 0:
            return None
        return (anchor - price) / price

    # Graham's classic net-net buy test: price < 2/3 × NCAV/share.
    net_net_passes = (
        price is not None and ncav_ps is not None and price < (2.0 / 3.0) * ncav_ps
    ) if (price is not None and ncav_ps is not None and ncav_ps > 0) else None

    return {
        "price": round(price, 2) if price is not None else None,
        "grahamNumber": round(graham_number, 2) if graham_number is not None else None,
        "grahamNumberUpside": round(upside(graham_number), 4) if upside(graham_number) is not None else None,
        "ncavTotal": round(ncav_total, 2) if ncav_total is not None else None,
        "ncavPerShare": round(ncav_ps, 2) if ncav_ps is not None else None,
        "ncavPerShareUpside": round(upside(ncav_ps), 4) if upside(ncav_ps) is not None else None,
        "grahamNetNetPerShare": round(graham_net_net, 2) if graham_net_net is not None else None,
        "passesNetNetTest": net_net_passes,
        "note": (
            "Asset-floor valuations (Graham). Graham Number = sqrt(22.5 × EPS × BVPS). "
            "Net-net test: price < 2/3 × NCAV per share. Most informative for "
            "asset-heavy, non-financial firms; treat as a downside floor, not a target."
        ),
    }


# ── Financial Shenanigans (Schilit & Perler, 4th ed.) ───────────────────────

# Conservative trip-wires — a flag means "investigate", never a verdict (the book's
# forensic posture). All inputs are financials.db columns; trends use prior years.
_SHN_INCOME_QUALITY_FLOOR = 0.80   # CFO/NI below → accrual-heavy earnings (CF/EM)
_SHN_INCOME_QUALITY_BAD = 0.50     # severe
_SHN_SLOAN_HIGH = 0.10             # (NI−CFO)/avg assets above → high accruals (Sloan)
_SHN_SLOAN_BAD = 0.20
_SHN_RECV_GAP = 0.10               # receivables growth − revenue growth (EM1)
_SHN_INV_GAP = 0.10                # inventory growth − revenue growth (EM4/KM2)
_SHN_DSO_JUMP = 0.15               # YoY rise in DSO (EM1)
_SHN_DPO_JUMP = 0.20               # YoY rise in DPO → CFO flattered (CF3)
_SHN_SBC_REV = 0.10                # SBC/revenue → real cost hidden (EM5/KM1)
_SHN_SBC_OCF = 0.25                # SBC/CFO → operating cash flattered by non-cash comp (CF3)
_SHN_NONOP_SHARE = 0.20            # non-operating income / pretax → one-time boost (EM3)
_SHN_GM_JUMP = 0.05                # abs YoY gross-margin swing (KM1)
_SHN_CAPEX_DEP_JUMP = 0.50         # YoY rise in capex/dep → possible cost capitalization (EM4)
# Damodaran "Measuring Earnings" quality-of-earnings checklist detectors.
_SHN_EARN_REV_GAP = 0.10           # earnings-growth minus revenue-growth, persistent (efficiency mirage)
_SHN_WC_REV_GAP = 0.15             # working-capital growth minus revenue growth (credit-fuelled sales)
_SHN_DEFREV_DRAWDOWN = 0.10        # deferred (unearned) revenue drawn down while revenue rises (pull-forward)
_SHN_EARN_CV_HIGH = 0.35           # coefficient of variation of operating income → volatile earnings


# Qualitative checklist — questions only, mapped to Schilit's shenanigan taxonomy.
# Quotations of fact (Whirlpool, Valeant) are drawn from "Financial Shenanigans",
# Part Four (Key Metric Shenanigans) and Part Five (Acquisition Accounting).
SHENANIGAN_QUESTIONS: list[dict] = [
    {
        "category": "Earnings Manipulation",
        "items": [
            "EM1 — Revenue too soon: Is revenue booked before delivery/acceptance or while material contingencies remain? Are receivables (DSO) outgrowing sales?",
            "EM2 — Bogus revenue: Does revenue include items lacking economic substance — related-party sales, barter/round-trip deals, or vendor financing booked as revenue?",
            "EM3 — One-time boosts: Is income inflated by asset-sale or investment gains shown within operations, or by releasing reserves ('cookie-jar' accounting)?",
            "EM4 — Shifting current expenses later: Are normal operating costs being capitalized (software, customer acquisition) or parked on the balance sheet?",
            "EM5 — Hiding expenses/losses: Are real costs (stock comp, restructuring, pension) excluded from the headline 'adjusted' number, or losses kept off-balance-sheet?",
            "EM6 — Shifting current income later: In a strong year, is income deferred (over-reserving, deferring revenue) to smooth future periods?",
            "EM7 — Shifting future expenses earlier: Is a 'big bath' write-off overstating today's charge to relieve future periods?",
        ],
    },
    {
        "category": "Cash Flow Shenanigans",
        "items": [
            "CF1 — Financing inflows into CFO: Is operating cash flow boosted by selling/securitizing receivables or vendor financing routed through the operating section?",
            "CF2 — Operating outflows out of CFO: Are operating costs reclassified to investing/financing (capitalized outlays, 'boomerang' transactions)?",
            "CF3 — Unsustainable CFO: Is CFO propped up by stretching payables (rising DPO), under-buying inventory, or one-off working-capital releases that cannot repeat?",
        ],
    },
    {
        "category": "Key Metric Shenanigans",
        "items": [
            "KM1 — Misleading metrics: Does management lean on a self-defined metric (adjusted EBITDA, 'cash earnings', bookings, organic growth) whose definition shifts or diverges from GAAP? (Valeant touted 'cash earnings'; Whirlpool ran 'restructuring' charges in 23 of 27 years before the SEC objected in Oct 2016.)",
            "KM2 — Hidden balance-sheet decay: Are deteriorating ratios masked — factoring receivables to flatter DSO, dodging impairment, or excluding debt-like obligations (leases, pensions, factoring) from leverage?",
        ],
    },
    {
        "category": "Acquisition Accounting",
        "items": [
            "AA1 — Is acquired revenue/cash flow released to flatter pro-forma trends, or are pre-close write-downs used to build future cookie jars?",
            "AA2 — Is goodwill ballooning while ROIC on acquired capital falls — a serial acquirer masking organic stagnation?",
        ],
    },
]


def _shn_yoy(curr: Optional[float], prev: Optional[float]) -> Optional[float]:
    return _yoy_pct(curr, prev)


# ── Composite forensic scores: Altman Z-Score & Beneish M-Score ──────────────
# Two single-number distillations that complement the line-by-line trip-wires
# above. Both are grounded in the vault library:
#   • Altman Z-Score — Edward Altman, "Financial Ratios, Discriminant Analysis
#     and the Prediction of Corporate Bankruptcy," J. Finance (1968). Coefficients
#     and zones per Fabozzi, "The Handbook of Fixed Income Securities" (9th ed.,
#     Ch. 8, Credit Analysis): Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5.
#   • Beneish M-Score — Messod Beneish, "The Detection of Earnings Manipulation,"
#     Financial Analysts Journal (1999), eight-variable model; treatment per
#     Fridson & Alvarez, "Financial Statement Analysis: A Practitioner's Guide."
# Like every detector here, a score is a *screen, not a verdict* — a low Z or a
# high M says "investigate," nothing more.

# Altman's published cutoffs for the original (public-manufacturer) model.
_ALTMAN_SAFE = 2.99       # Z ≥ → "safe" zone
_ALTMAN_DISTRESS = 1.81   # Z < → "distress" zone (grey zone in between)

# Beneish eight-variable cutoffs. M > −1.78 flags a likely manipulator; below
# −2.22 is unlikely; the band between is grey.
_BENEISH_MANIP = -1.78
_BENEISH_CLEAN = -2.22


def _altman_z(latest: sqlite3.Row) -> Optional[dict]:
    """Altman Z-Score (1968 manufacturer model). Inappropriate for banks /
    insurers / REITs (leverage is their raw material and 'sales/assets' is
    meaningless), so those are returned as not-applicable rather than scored."""
    sector = (_row_str(latest, "t_sector") or "").strip()
    industry = (_row_str(latest, "t_industry") or "").lower()
    is_financial = sector in _FCFF_GUARD_SECTORS or any(
        k in industry for k in _FCFF_GUARD_INDUSTRY_KEYWORDS
    )
    if is_financial:
        return {
            "key": "altman_z", "label": "Altman Z-Score", "applicable": False,
            "value": None, "band": "na", "severity": "na",
            "headline": "Not applicable to financials / REITs",
            "reason": (
                "The Z-Score is calibrated for manufacturers; for banks, insurers "
                "and REITs leverage is operating raw material and sales/assets is "
                "meaningless, so the model misclassifies them. Read the cash-flow and "
                "leverage flags instead."
            ),
            "source": "Altman (1968); Fabozzi, Handbook of Fixed Income Securities, Ch. 8.",
            "components": [],
        }

    ta = _row_val(latest, "Total Assets")
    wc = _col_or(latest, "Working Capital", None)
    if wc is None:
        tca = _row_val(latest, "Total Current Assets")
        tcl = _row_val(latest, "Total Current Liabilities")
        wc = (tca - tcl) if (tca is not None and tcl is not None) else None
    re = _row_val(latest, "Retained Earnings")
    ebit = _row_val(latest, "Operating Income")        # standard EBIT proxy
    mve = _row_val(latest, "Market Cap")
    tl = _row_val(latest, "Total Liabilities")
    sales = _row_val(latest, "Revenue")

    x1 = _safe_div(wc, ta)
    x2 = _safe_div(re, ta)
    x3 = _safe_div(ebit, ta)
    x4 = _safe_div(mve, tl)
    x5 = _safe_div(sales, ta)
    parts = [
        ("x1", "Working capital / Total assets", x1, 1.2, "Short-term liquidity cushion"),
        ("x2", "Retained earnings / Total assets", x2, 1.4, "Cumulative profitability & age"),
        ("x3", "EBIT / Total assets", x3, 3.3, "Operating productivity of assets"),
        ("x4", "Market value of equity / Total liabilities", x4, 0.6, "Market solvency buffer"),
        ("x5", "Sales / Total assets", x5, 1.0, "Asset turnover"),
    ]
    if any(v is None for _, _, v, _, _ in parts):
        return {
            "key": "altman_z", "label": "Altman Z-Score", "applicable": False,
            "value": None, "band": "na", "severity": "na",
            "headline": "Insufficient data",
            "reason": "One or more inputs (working capital, retained earnings, EBIT, market cap, total liabilities or sales) are unavailable.",
            "source": "Altman (1968); Fabozzi, Handbook of Fixed Income Securities, Ch. 8.",
            "components": [],
        }

    z = sum(w * v for _, _, v, w, _ in parts)
    if z >= _ALTMAN_SAFE:
        band, severity = "safe", "ok"
        interp = (f"Z = {z:.2f} sits in the safe zone (≥ {_ALTMAN_SAFE:.2f}). "
                  "The model reads bankruptcy risk over the next two years as low.")
    elif z < _ALTMAN_DISTRESS:
        band, severity = "distress", "high"
        interp = (f"Z = {z:.2f} is in the distress zone (< {_ALTMAN_DISTRESS:.2f}). "
                  "Historically associated with elevated bankruptcy risk — scrutinise "
                  "leverage, liquidity and the going-concern disclosures.")
    else:
        band, severity = "grey", "medium"
        interp = (f"Z = {z:.2f} falls in the grey zone ({_ALTMAN_DISTRESS:.2f}–"
                  f"{_ALTMAN_SAFE:.2f}) — neither clearly safe nor distressed. Watch the trend.")

    return {
        "key": "altman_z", "label": "Altman Z-Score", "applicable": True,
        "value": round(z, 2), "band": band, "severity": severity,
        "headline": f"Z = {z:.2f} — {band} zone",
        "interpretation": interp,
        "threshold_note": f"Zones: distress < {_ALTMAN_DISTRESS} · grey {_ALTMAN_DISTRESS}–{_ALTMAN_SAFE} · safe ≥ {_ALTMAN_SAFE}.",
        "source": "Altman (1968); coefficients & zones per Fabozzi, Handbook of Fixed Income Securities, 9th ed., Ch. 8.",
        "components": [
            {"key": k, "label": lbl, "value": round(v, 4), "weight": w,
             "contribution": round(w * v, 3), "note": note}
            for k, lbl, v, w, note in parts
        ],
    }


def _beneish_index(num_t, den_t, num_p, den_p):
    """A Beneish ratio-of-ratios index: (num_t/den_t) / (num_p/den_p)."""
    cur = _safe_div(num_t, den_t)
    pri = _safe_div(num_p, den_p)
    return _safe_div(cur, pri)


def _beneish_m(latest: sqlite3.Row, prev: Optional[sqlite3.Row]) -> Optional[dict]:
    """Beneish eight-variable M-Score. Needs the current and prior year; any index
    whose inputs are missing is held at its neutral value (1.0; TATA → 0) and noted,
    so a single gap degrades confidence rather than killing the score."""
    if prev is None:
        return {
            "key": "beneish_m", "label": "Beneish M-Score", "applicable": False,
            "value": None, "band": "na", "severity": "na",
            "headline": "Needs two years of data",
            "reason": "The M-Score compares the latest year with the prior year; only one year is available.",
            "source": "Beneish (1999); Fridson & Alvarez, Financial Statement Analysis: A Practitioner's Guide.",
            "components": [],
        }

    g = lambda c: _row_val(latest, c)
    p = lambda c: _row_val(prev, c)

    sales_t, sales_p = g("Revenue"), p("Revenue")
    recv_t, recv_p = g("Net Receivables"), p("Net Receivables")
    gm_t, gm_p = g("Gross Profit Ratio"), p("Gross Profit Ratio")
    ca_t, ca_p = g("Total Current Assets"), p("Total Current Assets")
    ppe_t, ppe_p = g("Property Plant Equipment Net"), p("Property Plant Equipment Net")
    ta_t, ta_p = g("Total Assets"), p("Total Assets")
    dep_t, dep_p = g("Depreciation And Amortization"), p("Depreciation And Amortization")
    sga_t, sga_p = g("Selling General And Administrative Expenses"), p("Selling General And Administrative Expenses")
    cl_t, cl_p = g("Total Current Liabilities"), p("Total Current Liabilities")
    ltd_t, ltd_p = g("Long Term Debt"), p("Long Term Debt")
    ni = g("Net Income")
    cfo = g("Operating Cash Flow")

    # 1) DSRI — days' sales in receivables index
    dsri = _beneish_index(recv_t, sales_t, recv_p, sales_p)
    # 2) GMI — gross-margin index (prior ÷ current; >1 = margin deteriorating)
    gmi = _safe_div(gm_p, gm_t)
    # 3) AQI — asset-quality index; AQ = 1 − (current assets + PP&E)/total assets
    aq_t = (1 - _safe_div((ca_t or 0) + (ppe_t or 0), ta_t)) if ta_t else None
    aq_p = (1 - _safe_div((ca_p or 0) + (ppe_p or 0), ta_p)) if ta_p else None
    aqi = _safe_div(aq_t, aq_p)
    # 4) SGI — sales growth index
    sgi = _safe_div(sales_t, sales_p)
    # 5) DEPI — depreciation index; rate = Dep/(Dep+PP&E), prior ÷ current
    dr_t = _safe_div(dep_t, (dep_t or 0) + (ppe_t or 0)) if (dep_t is not None and ppe_t is not None) else None
    dr_p = _safe_div(dep_p, (dep_p or 0) + (ppe_p or 0)) if (dep_p is not None and ppe_p is not None) else None
    depi = _safe_div(dr_p, dr_t)
    # 6) SGAI — SG&A index
    sgai = _beneish_index(sga_t, sales_t, sga_p, sales_p)
    # 7) LVGI — leverage index; leverage = (current liab + LTD)/total assets
    lev_t = _safe_div((cl_t or 0) + (ltd_t or 0), ta_t) if ta_t else None
    lev_p = _safe_div((cl_p or 0) + (ltd_p or 0), ta_p) if ta_p else None
    lvgi = _safe_div(lev_t, lev_p)
    # 8) TATA — total accruals to total assets (income before extraordinary − CFO)
    tata = _safe_div((ni - cfo), ta_t) if (ni is not None and cfo is not None and ta_t) else None

    # Each index: (computed value, neutral fallback, Beneish coefficient, label,
    # the manipulator-mean direction the model treats as suspicious).
    NEUTRAL = object()
    specs = [
        ("dsri", dsri, 1.0, 0.920, "Days' sales in receivables index", "↑ receivables outrunning sales — revenue pulled forward"),
        ("gmi", gmi, 1.0, 0.528, "Gross-margin index", "↑ margins deteriorating — incentive to inflate income"),
        ("aqi", aqi, 1.0, 0.404, "Asset-quality index", "↑ more 'soft' non-current assets — costs may be capitalised"),
        ("sgi", sgi, 1.0, 0.892, "Sales-growth index", "↑ fast growth — pressure to keep the streak going"),
        ("depi", depi, 1.0, 0.115, "Depreciation index", "↑ depreciation slowing — assets being stretched"),
        ("sgai", sgai, 1.0, -0.172, "SG&A index", "↑ SG&A rising faster than sales (negative-weighted)"),
        ("tata", tata, 0.0, 4.679, "Total accruals to total assets", "↑ earnings running ahead of cash"),
        ("lvgi", lvgi, 1.0, -0.327, "Leverage index", "↑ leverage rising (negative-weighted)"),
    ]

    imputed: list[str] = []
    components: list[dict] = []
    m = -4.84  # Beneish intercept
    for key, val, neutral, coef, label, note in specs:
        used = val
        if used is None:
            used = neutral
            imputed.append(label)
        m += coef * used
        components.append({
            "key": key, "label": label,
            "value": (round(val, 3) if val is not None else None),
            "weight": coef, "contribution": round(coef * used, 3),
            "imputed": val is None, "note": note,
        })

    # Need the heavy-weight inputs (sales, receivables, accruals) for a meaningful
    # read; if more than two indices are imputed, flag low confidence.
    if dsri is None and sgi is None:
        return {
            "key": "beneish_m", "label": "Beneish M-Score", "applicable": False,
            "value": None, "band": "na", "severity": "na",
            "headline": "Insufficient data",
            "reason": "Core inputs (revenue and receivables across both years) are unavailable.",
            "source": "Beneish (1999); Fridson & Alvarez, Financial Statement Analysis: A Practitioner's Guide.",
            "components": [],
        }

    if m > _BENEISH_MANIP:
        band, severity = "flagged", "high"
        interp = (f"M = {m:.2f} is above the −1.78 threshold — the model groups the "
                  "firm with likely earnings manipulators. Treat the accrual, revenue-"
                  "timing and margin lines with real skepticism and read the filings.")
    elif m < _BENEISH_CLEAN:
        band, severity = "unlikely", "ok"
        interp = (f"M = {m:.2f} is below −2.22 — the accounting pattern looks unlike "
                  "known manipulators. Not a clean bill of health, but no statistical flag.")
    else:
        band, severity = "grey", "medium"
        interp = (f"M = {m:.2f} sits in the grey band (−2.22 to −1.78) — inconclusive. "
                  "Check which indices are driving it before drawing a view.")

    low_conf = len(imputed) > 2
    confidence = (
        f"Reduced confidence: {len(imputed)} of 8 indices imputed to neutral "
        f"({', '.join(imputed)})." if low_conf else
        (f"{len(imputed)} index held neutral ({', '.join(imputed)})." if imputed else "All eight indices computed from reported figures.")
    )

    return {
        "key": "beneish_m", "label": "Beneish M-Score", "applicable": True,
        "value": round(m, 2), "band": band, "severity": severity,
        "headline": f"M = {m:.2f} — {'likely manipulator' if band == 'flagged' else band}",
        "interpretation": interp,
        "threshold_note": f"Cutoffs: unlikely < {_BENEISH_CLEAN} · grey {_BENEISH_CLEAN} to {_BENEISH_MANIP} · flagged > {_BENEISH_MANIP}.",
        "confidence": confidence,
        "low_confidence": low_conf,
        "source": "Beneish (1999), Financial Analysts Journal; treatment per Fridson & Alvarez, Financial Statement Analysis: A Practitioner's Guide.",
        "components": components,
    }


def _forensic_scores(rows: list[sqlite3.Row]) -> list[dict]:
    """The two composite scores, each guarded so one failure can't sink the block."""
    if not rows:
        return []
    latest = rows[-1]
    prev = rows[-2] if len(rows) >= 2 else None
    out: list[dict] = []
    for fn, arg in ((_altman_z, (latest,)), (_beneish_m, (latest, prev))):
        try:
            score = fn(*arg)
            if score:
                out.append(score)
        except Exception as exc:  # noqa: BLE001 — a score edge case must not break the screen
            log.warning("forensic score %s failed: %s", getattr(fn, "__name__", "?"), exc)
    return out


def _yoy_pairs(rows: list[sqlite3.Row], col: str) -> list[tuple[int, float]]:
    """Year-over-year growth of a column across the history: ``[(year, growth), …]``
    (oldest→newest). Skips years where the prior value is missing/non-positive."""
    out: list[tuple[int, float]] = []
    for prev_r, cur_r in zip(rows[:-1], rows[1:]):
        p = _row_val(prev_r, col)
        c = _row_val(cur_r, col)
        if p is not None and p > 0 and c is not None:
            out.append((int(cur_r["Calendar Year"]), (c - p) / p))
    return out


def _cv(values: list[float]) -> Optional[float]:
    """Coefficient of variation (population std ÷ |mean|) — a scale-free volatility
    measure. None when fewer than three points or a zero mean."""
    vals = [v for v in values if v is not None]
    if len(vals) < 3:
        return None
    mean = sum(vals) / len(vals)
    if mean == 0:
        return None
    var = sum((v - mean) ** 2 for v in vals) / len(vals)
    return (var ** 0.5) / abs(mean)


def _shenanigans(rows: list[sqlite3.Row]) -> dict:
    """Quantitative red-flag detectors + the qualitative checklist. Each flag is
    {key,label,category,severity,value,threshold,detail}; severity ∈ {high,medium,ok,na}."""
    if not rows:
        return {"applicable": False, "flags": [], "scores": [], "questions": SHENANIGAN_QUESTIONS}

    latest = rows[-1]
    prev = rows[-2] if len(rows) >= 2 else None
    flags: list[dict] = []

    def add(key, label, category, severity, value, threshold, detail):
        flags.append({
            "key": key, "label": label, "category": category, "severity": severity,
            "value": (round(value, 4) if isinstance(value, (int, float)) else None),
            "threshold": threshold, "detail": detail,
        })

    ni = _row_val(latest, "Net Income")
    ocf = _row_val(latest, "Operating Cash Flow")
    rev = _row_val(latest, "Revenue")
    ta = _row_val(latest, "Total Assets")
    prev_ta = _row_val(prev, "Total Assets") if prev is not None else None
    avg_assets = ((ta + prev_ta) / 2.0) if (ta is not None and prev_ta is not None) else ta

    # 1) Income quality (CFO/NI)
    iq = _col_or(latest, "Income Quality", _safe_div(ocf, ni))
    if iq is None:
        add("income_quality", "Income Quality (CFO/NI)", "Cash Flow Shenanigans", "na", None, _SHN_INCOME_QUALITY_FLOOR, "CFO or net income unavailable.")
    elif iq < _SHN_INCOME_QUALITY_BAD:
        add("income_quality", "Income Quality (CFO/NI)", "Cash Flow Shenanigans", "high", iq, _SHN_INCOME_QUALITY_FLOOR, f"CFO is only {iq:.0%} of net income — earnings are largely non-cash. Investigate accruals (CF3/EM).")
    elif iq < _SHN_INCOME_QUALITY_FLOOR:
        add("income_quality", "Income Quality (CFO/NI)", "Cash Flow Shenanigans", "medium", iq, _SHN_INCOME_QUALITY_FLOOR, f"CFO is {iq:.0%} of net income (< {_SHN_INCOME_QUALITY_FLOOR:.0%}). Earnings running ahead of cash.")
    else:
        add("income_quality", "Income Quality (CFO/NI)", "Cash Flow Shenanigans", "ok", iq, _SHN_INCOME_QUALITY_FLOOR, f"CFO {iq:.0%} of net income — earnings are cash-backed.")

    # 2) Sloan accruals ratio
    sloan = ((ni - ocf) / avg_assets) if (ni is not None and ocf is not None and avg_assets not in (None, 0)) else None
    if sloan is None:
        add("sloan_accruals", "Sloan Accruals Ratio", "Earnings Manipulation", "na", None, _SHN_SLOAN_HIGH, "Inputs unavailable.")
    elif sloan > _SHN_SLOAN_BAD:
        add("sloan_accruals", "Sloan Accruals Ratio", "Earnings Manipulation", "high", sloan, _SHN_SLOAN_HIGH, f"Accruals are {sloan:.1%} of assets — very high; the accruals anomaly predicts weak future returns (Sloan 1996).")
    elif sloan > _SHN_SLOAN_HIGH:
        add("sloan_accruals", "Sloan Accruals Ratio", "Earnings Manipulation", "medium", sloan, _SHN_SLOAN_HIGH, f"Accruals are {sloan:.1%} of assets (> {_SHN_SLOAN_HIGH:.0%}). Earnings quality warrants a look.")
    else:
        add("sloan_accruals", "Sloan Accruals Ratio", "Earnings Manipulation", "ok", sloan, _SHN_SLOAN_HIGH, "Accruals are within a normal band.")

    # 3) Receivables vs revenue growth (EM1) — prefer stored growth columns, else DSO jump.
    rg = _row_val(latest, "Receivables Growth")
    rev_g = _row_val(latest, "Revenue Growth")
    if rg is not None and rev_g is not None:
        gap = rg - rev_g
        sev = "high" if gap > 2 * _SHN_RECV_GAP else ("medium" if gap > _SHN_RECV_GAP else "ok")
        add("recv_vs_rev", "Receivables vs Revenue growth", "Earnings Manipulation", sev, gap, _SHN_RECV_GAP,
            f"Receivables grew {rg:.0%} vs revenue {rev_g:.0%} (gap {gap:+.0%}). A persistent positive gap can signal revenue recognized too soon (EM1)." if sev != "ok" else "Receivables in line with revenue.")
    else:
        dso = _row_val(latest, "Days Sales Outstanding")
        dso_p = _row_val(prev, "Days Sales Outstanding") if prev is not None else None
        j = _shn_yoy(dso, dso_p)
        if j is None:
            add("recv_vs_rev", "DSO trend", "Earnings Manipulation", "na", None, _SHN_DSO_JUMP, "Receivables-growth and DSO data unavailable.")
        else:
            sev = "high" if j > 2 * _SHN_DSO_JUMP else ("medium" if j > _SHN_DSO_JUMP else "ok")
            add("recv_vs_rev", "DSO trend", "Earnings Manipulation", sev, j, _SHN_DSO_JUMP, f"DSO changed {j:+.0%} YoY." + (" Rising collection period can flag pulled-forward revenue (EM1)." if sev != "ok" else ""))

    # 4) Inventory vs revenue growth (EM4/KM2)
    ig = _row_val(latest, "Inventory Growth")
    if ig is not None and rev_g is not None:
        gap = ig - rev_g
        sev = "high" if gap > 2 * _SHN_INV_GAP else ("medium" if gap > _SHN_INV_GAP else "ok")
        add("inv_vs_rev", "Inventory vs Revenue growth", "Earnings Manipulation", sev, gap, _SHN_INV_GAP,
            f"Inventory grew {ig:.0%} vs revenue {rev_g:.0%} (gap {gap:+.0%}). Inventory outrunning sales signals demand softness or future write-downs (EM4/KM2)." if sev != "ok" else "Inventory in line with revenue.")
    else:
        add("inv_vs_rev", "Inventory vs Revenue growth", "Earnings Manipulation", "na", None, _SHN_INV_GAP, "Inventory-growth data unavailable (or non-inventory business).")

    # 5) SBC reliance (EM5/KM1, CF3)
    sbc = _row_val(latest, "Stock Based Compensation")
    sbc_rev = _col_or(latest, "Stock Based Compensation To Revenue", _safe_div(sbc, rev))
    if sbc_rev is None:
        add("sbc_revenue", "SBC / Revenue", "Earnings Manipulation", "na", None, _SHN_SBC_REV, "No SBC reported.")
    else:
        sev = "high" if sbc_rev > 2 * _SHN_SBC_REV else ("medium" if sbc_rev > _SHN_SBC_REV else "ok")
        add("sbc_revenue", "SBC / Revenue", "Earnings Manipulation", sev, sbc_rev, _SHN_SBC_REV,
            f"Stock comp is {sbc_rev:.0%} of revenue — a real, dilutive cost often excluded from 'adjusted' metrics (EM5/KM1)." if sev != "ok" else "SBC is a modest share of revenue.")
    sbc_ocf = _safe_div(sbc, ocf)
    if sbc_ocf is not None and sbc_ocf > _SHN_SBC_OCF:
        add("sbc_ocf", "SBC / Operating Cash Flow", "Cash Flow Shenanigans", "medium" if sbc_ocf <= 2 * _SHN_SBC_OCF else "high", sbc_ocf, _SHN_SBC_OCF,
            f"SBC equals {sbc_ocf:.0%} of CFO — operating cash flow is materially flattered by adding back non-cash compensation (CF3).")

    # 6) Non-operating income reliance (EM3)
    other = _row_val(latest, "Total Other Income Expenses Net")
    pretax = _row_val(latest, "Income Before Tax")
    if other is not None and pretax is not None and pretax > 0 and other > 0:
        share = other / pretax
        if share > _SHN_NONOP_SHARE:
            add("nonop_income", "Non-operating share of pretax income", "Earnings Manipulation", "high" if share > 2 * _SHN_NONOP_SHARE else "medium", share, _SHN_NONOP_SHARE,
                f"{share:.0%} of pretax income is non-operating (other income/gains). Low-quality, often one-time earnings (EM3).")
        else:
            add("nonop_income", "Non-operating share of pretax income", "Earnings Manipulation", "ok", share, _SHN_NONOP_SHARE, "Pretax income is predominantly operating.")

    # 7) Gross-margin swing (KM1)
    gm = _row_val(latest, "Gross Profit Ratio")
    gm_p = _row_val(prev, "Gross Profit Ratio") if prev is not None else None
    if gm is not None and gm_p is not None:
        d = gm - gm_p
        if abs(d) > _SHN_GM_JUMP:
            add("gross_margin_swing", "Gross-margin swing (YoY)", "Key Metric Shenanigans", "medium" if abs(d) <= 2 * _SHN_GM_JUMP else "high", d, _SHN_GM_JUMP,
                f"Gross margin moved {d:+.1%} YoY — a large swing; a sharp rise can mask cost capitalization, a sharp fall signals pricing/cost stress (KM1).")
        else:
            add("gross_margin_swing", "Gross-margin swing (YoY)", "Key Metric Shenanigans", "ok", d, _SHN_GM_JUMP, "Gross margin stable YoY.")

    # 8) Capex / depreciation jump (EM4)
    cd = _row_val(latest, "Capex To Depreciation")
    cd_p = _row_val(prev, "Capex To Depreciation") if prev is not None else None
    j = _shn_yoy(cd, cd_p)
    if j is not None and j > _SHN_CAPEX_DEP_JUMP:
        add("capex_dep_jump", "Capex / Depreciation jump", "Earnings Manipulation", "medium" if j <= 2 * _SHN_CAPEX_DEP_JUMP else "high", j, _SHN_CAPEX_DEP_JUMP,
            f"Capex/Depreciation rose {j:+.0%} YoY — verify it reflects real investment, not aggressive cost capitalization (EM4).")

    # 9) DPO jump → CFO flattered (CF3)
    dpo = _row_val(latest, "Days Payables Outstanding")
    dpo_p = _row_val(prev, "Days Payables Outstanding") if prev is not None else None
    j = _shn_yoy(dpo, dpo_p)
    if j is not None and j > _SHN_DPO_JUMP:
        add("dpo_jump", "DPO jump (stretching payables)", "Cash Flow Shenanigans", "medium" if j <= 2 * _SHN_DPO_JUMP else "high", j, _SHN_DPO_JUMP,
            f"Days payable rose {j:+.0%} YoY — stretching suppliers boosts CFO unsustainably (CF3).")

    # 10) Earnings growth outstripping revenue growth, year after year (Damodaran,
    #     "Measuring Earnings" quality checklist). A large, persistent gap between
    #     net-income growth and revenue growth raises the question of where the
    #     efficiency keeps coming from.
    ni_growth = _yoy_pairs(rows, "Net Income")
    rev_growth_by_year = dict(_yoy_pairs(rows, "Revenue"))
    gaps = [g - rev_growth_by_year[y] for y, g in ni_growth if y in rev_growth_by_year]
    if len(gaps) >= 3:
        med_gap = sorted(gaps)[len(gaps) // 2]
        pos_years = sum(1 for x in gaps if x > _SHN_EARN_REV_GAP)
        if med_gap > _SHN_EARN_REV_GAP and pos_years >= max(2, len(gaps) // 2):
            add("earn_vs_rev", "Earnings vs Revenue growth", "Earnings Manipulation",
                "high" if med_gap > 2 * _SHN_EARN_REV_GAP else "medium", med_gap, _SHN_EARN_REV_GAP,
                f"Net income has grown a median {med_gap:+.0%} faster than revenue, positive in {pos_years} of {len(gaps)} years. A large, persistent gap warrants asking where the efficiency keeps coming from (Damodaran).")
        else:
            add("earn_vs_rev", "Earnings vs Revenue growth", "Earnings Manipulation", "ok", med_gap, _SHN_EARN_REV_GAP,
                "Earnings growth broadly tracks revenue growth.")

    # 11) Working capital ballooning as revenue surges — often credit-fuelled sales
    #     on generous terms (Damodaran checklist).
    wc_growth_by_year = dict(_yoy_pairs(rows, "Working Capital"))
    wcg = wc_growth_by_year.get(int(latest["Calendar Year"]))
    if wcg is not None and rev_g is not None:
        gap = wcg - rev_g
        sev = "high" if gap > 2 * _SHN_WC_REV_GAP else ("medium" if gap > _SHN_WC_REV_GAP else "ok")
        add("wc_vs_rev", "Working capital vs Revenue growth", "Earnings Manipulation", sev, gap, _SHN_WC_REV_GAP,
            f"Working capital grew {wcg:+.0%} vs revenue {rev_g:+.0%} (gap {gap:+.0%}). Working capital ballooning ahead of sales can flag revenue booked on generous credit terms (Damodaran)." if sev != "ok" else "Working capital in line with revenue.")

    # 12) Deferred (unearned) revenue drawn down while revenue rises — revenue may
    #     be pulled forward out of the deferred balance.
    dr = _row_val(latest, "Deferred Revenue")
    dr_p = _row_val(prev, "Deferred Revenue") if prev is not None else None
    if dr is not None and dr_p is not None and dr_p > 0 and rev_g is not None:
        dr_change = (dr - dr_p) / dr_p
        if dr_change < -_SHN_DEFREV_DRAWDOWN and rev_g > 0:
            add("deferred_rev", "Deferred (unearned) revenue drawdown", "Revenue Recognition", "medium",
                dr_change, -_SHN_DEFREV_DRAWDOWN,
                f"Deferred revenue fell {dr_change:+.0%} while revenue rose {rev_g:+.0%} — recognized revenue may be outrunning new bookings, drawing the unearned-revenue balance into the P&L.")
        else:
            add("deferred_rev", "Deferred (unearned) revenue trend", "Revenue Recognition", "ok", dr_change, -_SHN_DEFREV_DRAWDOWN,
                "Deferred-revenue balance is stable or growing with the business.")

    # 13) Earnings volatility — coefficient of variation of operating income, with a
    #     plain verdict on whether swings are revenue- or margin-driven (Damodaran:
    #     is earnings volatile, and why?). Volatile earnings need a normalized value.
    oi_series = [v for v in (_row_val(r, "Operating Income") for r in rows) if v is not None]
    rev_series = [v for v in (_row_val(r, "Revenue") for r in rows) if v is not None]
    ebit_cv = _cv(oi_series)
    rev_cv = _cv(rev_series)
    if ebit_cv is not None:
        driver = ("revenue swings" if (rev_cv is not None and rev_cv > 0.6 * ebit_cv)
                  else "margin swings (operating leverage or one-time items)")
        if ebit_cv > _SHN_EARN_CV_HIGH:
            add("earnings_volatility", "Earnings volatility (CV of EBIT)", "Earnings Quality",
                "high" if ebit_cv > 2 * _SHN_EARN_CV_HIGH else "medium", ebit_cv, _SHN_EARN_CV_HIGH,
                f"Operating income varies {ebit_cv:.0%} around its mean, driven mainly by {driver}.")
        else:
            add("earnings_volatility", "Earnings volatility (CV of EBIT)", "Earnings Quality", "ok", ebit_cv, _SHN_EARN_CV_HIGH,
                f"Operating income is relatively stable, with a coefficient of variation of {ebit_cv:.0%}.")

    counts = {"high": 0, "medium": 0, "ok": 0, "na": 0}
    for f in flags:
        counts[f["severity"]] = counts.get(f["severity"], 0) + 1
    highs = counts.get("high", 0)
    meds = counts.get("medium", 0)
    if highs >= 2:
        summary = f"Elevated forensic risk — {highs} high and {meds} medium red flag(s). Treat reported earnings/cash skeptically and work the checklist."
    elif highs == 1 or meds >= 2:
        summary = f"Some forensic concerns — {highs} high, {meds} medium flag(s). Investigate the specific lines before trusting the headline numbers."
    else:
        summary = "No major quantitative red flags. Still walk the qualitative checklist — the worst shenanigans are not always visible in ratios."

    return {
        "applicable": True,
        "flags": flags,
        "counts": counts,
        "scores": _forensic_scores(rows),
        "summary": summary,
        "questions": SHENANIGAN_QUESTIONS,
        "method": "Detectors are conservative trip-wires from Schilit & Perler, 'Financial Shenanigans' (4th ed.), plus Sloan (1996) accruals and Lev & Gu cash-conversion, the Altman Z-Score (1968) and Beneish M-Score (1999). A flag or score means investigate, not guilt.",
    }


# ── Growth viability: is the growth rate genuine and sustainable? ─────────────
# A standing due-diligence deck the user answers in their own words. Every
# question always appears; the company's own figures decide which ones carry a
# flag. Grounding: Damodaran (Investment Valuation Ch.9 and Ch.11) on fundamental
# growth and on earnings that outrun revenue; Penman (Accounting for Value) on
# mean reversion; Fridson on the arithmetic ceiling that ends every growth story;
# Dorsey (The Little Book That Builds Wealth) on how fast a return on capital is
# competed away without a moat; Schilit (Financial Shenanigans) on one-time gains.

GV_PAST = "Has the past growth been sustainable?"
GV_REINVEST = "Will reinvestment and research and development sustain it?"
GV_THREATS = "What could lower the future growth rate?"
GV_GENUINE = "Is the growth genuine, or a one-off?"
GV_SENTIMENT = "Sentiment versus fundamentals, and small companies"

# Questions are written to be answered, not just read: detailed, with the company
# named so no pronoun is ambiguous, and no em dashes.
GROWTH_QUESTIONS: dict[str, tuple[str, str]] = {
    "earnings_vs_revenue": (GV_PAST,
        "Has {company}'s earnings grown faster than its revenue for several years in a row, "
        "and if that gap is real, is it coming from durable operating improvements or from "
        "cost cutting, buybacks, and accounting choices that cannot keep repeating?"),
    "growth_track_record": (GV_PAST,
        "Is {company}'s growth only a short streak of the last two or three years, or has "
        "revenue grown steadily across a long history, which is far more credible evidence "
        "that the growth will continue?"),
    "market_share_ceiling": (GV_PAST,
        "If {company}'s recent growth rate were extended, would the company have to capture "
        "an unrealistic share of its market within the next ten to fifteen years, which is "
        "the point at which the growth must slow no matter what management does?"),
    "revenue_to_operating_income": (GV_PAST,
        "Has {company}'s revenue growth actually reached the operating income line, or has "
        "revenue climbed while operating profit stalled, which points to pricing pressure or "
        "rising costs eating the gains?"),
    "roic_vs_wacc": (GV_REINVEST,
        "Is {company} earning a return on invested capital above its cost of capital, so that "
        "each dollar reinvested for growth actually builds value rather than adding revenue "
        "that destroys value?"),
    "reinvestment_sufficiency": (GV_REINVEST,
        "Is {company} reinvesting enough of its after-tax operating profit to fund the growth "
        "the model projects, or is the company holding reinvestment well below what that "
        "growth rate requires?"),
    "rd_trend": (GV_REINVEST,
        "Is {company}'s research and development spending rising as a share of revenue with a "
        "genuine product pipeline behind it, or is that spending being cut to lift near-term "
        "earnings, which borrows growth from the future?"),
    "capex_quality": (GV_REINVEST,
        "Is {company}'s capital spending expanding capacity in the high-return parts of the "
        "business, or is the company barely covering the wear on the assets it already owns "
        "while a real growth rate is still being assumed?"),
    "moat_roic_decay": (GV_THREATS,
        "How durable is {company}'s competitive advantage, judged by how slowly its return on "
        "invested capital has faded over the past several years, given that a company without "
        "a moat sees its returns competed away quickly?"),
    "cyclicality": (GV_THREATS,
        "How much of {company}'s recent growth reflects a lasting structural trend rather than "
        "an economic expansion or a commodity price swing that will reverse and pull the "
        "growth rate back down?"),
    "exclusivity_exposure": (GV_THREATS,
        "Does {company}'s growth lean on a small number of products, customers, patents, or "
        "licenses that could expire or be lost, and what does the growth rate become once that "
        "exclusivity ends?"),
    "one_time_gains": (GV_GENUINE,
        "How much of {company}'s recent profit came from one-time or non-operating items such "
        "as asset sales, legal settlements, or investment gains, and does the growth rate still "
        "hold once those items are stripped out?"),
    "recurring_charges": (GV_GENUINE,
        "Does {company} report charges it calls one-time in most years, a restructuring charge "
        "one year and a write-down the next, since charges that recur every year under "
        "different names are really ordinary operating costs being moved out of the headline "
        "growth number?"),
    "growth_backed_by_cash": (GV_GENUINE,
        "Is {company}'s reported growth backed by cash actually collected, or are receivables "
        "and accruals rising faster than revenue, which can mean sales are being booked before "
        "the cash arrives?"),
    "sentiment_gap": (GV_SENTIMENT,
        "How far above {company}'s fundamental growth rate is the growth the current share "
        "price already assumes, because a large gap means the market is paying for a story "
        "rather than for what the business currently earns and reinvests?"),
    "small_cap_scrutiny": (GV_SENTIMENT,
        "Because {company} is small, young, or not yet profitable, is there a wider margin of "
        "safety and more independent evidence behind the growth assumption, given that growth "
        "for companies like this is the least reliable and the easiest to overstate?"),
    "narrative_probability": (GV_SENTIMENT,
        "Is {company}'s growth story possible, plausible, and probable, and does the growth "
        "rate in the model sit at the probable end of that range rather than the merely "
        "possible end?"),
}

_GV_EARN_REV_GAP = 0.10        # earnings outrunning revenue by this much reads as unsustainable
_GV_TRACK_MIN_YEARS = 5        # fewer years than this is a short streak, not a record
_GV_CEILING_GROWTH = 0.15      # growth this far above the economy cannot run for long
_GV_ROIC_DECAY = 0.02          # ROIC giving up this much a year is a moat wearing through
_GV_CYCLE_RANGE = 0.30         # revenue-growth swing this wide is a cycle, not a trend
_GV_SENTIMENT_GAP = 0.05       # price-implied growth this far above fundamental is a story
_GV_SMALL_CAP = 2e9            # below this the growth evidence deserves extra scrutiny
_GV_RD_MATERIAL = 0.02         # R&D below this share of revenue is not a growth engine
_NOMINAL_GDP_GROWTH = 0.05     # the economy's pace, the ceiling every growth story runs into


def build_growth_viability(
    rows: list[sqlite3.Row],
    forecast: Optional[dict],
    shenanigans: Optional[dict],
    company: str,
    gdp_growth: Optional[float] = None,
    roic_hist: Optional[dict[int, Optional[float]]] = None,
) -> dict:
    """The standing growth-viability deck: every question, always, with the
    company's own figures deciding which ones carry a flag. ``gdp_growth`` is
    the LIVE nominal economy pace (FRED); the hardcoded constant survives only
    as its last-resort stand-in."""
    if not rows:
        return {"applicable": False, "reason": "No financial history."}
    econ_pace = gdp_growth if gdp_growth is not None else _NOMINAL_GDP_GROWTH

    checks: list[dict] = []
    latest = rows[-1]
    prev = rows[-2] if len(rows) >= 2 else None
    shn_flags = {f["key"]: f for f in ((shenanigans or {}).get("flags") or [])}
    f_assume = ((forecast or {}).get("assumptions") or {}) if isinstance(forecast, dict) else {}
    recon = ((forecast or {}).get("growthReconciliation") or {}) if isinstance(forecast, dict) else {}
    rev_dcf = ((forecast or {}).get("reverseDcf") or {}) if isinstance(forecast, dict) else {}

    def add(key: str, severity: str, value, threshold, detail: str) -> None:
        tier, question = GROWTH_QUESTIONS[key]
        checks.append({
            "id": key,
            "tier": tier,
            "question": question.format(company=company),
            "severity": severity,
            "value": round(value, 4) if isinstance(value, (int, float)) else None,
            "threshold": threshold,
            "detail": detail,
        })

    def pct(x) -> str:
        return "not available" if x is None else f"{x * 100:.0f}%"

    # ── Tier 1: has the past growth been sustainable? ─────────────────────────
    gaps: list[float] = []
    for a, b in zip(rows, rows[1:]):
        rg = _yoy_pct(_row_val(b, "Revenue"), _row_val(a, "Revenue"))
        ng = _yoy_pct(_row_val(b, "Net Income"), _row_val(a, "Net Income"))
        if rg is not None and ng is not None:
            gaps.append(ng - rg)
    med_gap = _median(gaps) if len(gaps) >= 3 else None
    if med_gap is None:
        add("earnings_vs_revenue", "na", None, _GV_EARN_REV_GAP,
            "Needs at least three years of revenue and profit to compare the two growth rates.")
    elif med_gap > _GV_EARN_REV_GAP:
        add("earnings_vs_revenue", "high" if med_gap > 2 * _GV_EARN_REV_GAP else "medium",
            med_gap, _GV_EARN_REV_GAP,
            f"Profit has grown about {pct(med_gap)} a year faster than revenue. A gap that wide "
            "is usually margin expansion or accounting, and margin expansion runs out.")
    else:
        add("earnings_vs_revenue", "ok", med_gap, _GV_EARN_REV_GAP,
            f"Profit growth tracks revenue growth within {pct(abs(med_gap))} a year.")

    years = len(rows)
    if years < _GV_TRACK_MIN_YEARS:
        add("growth_track_record", "medium", float(years), float(_GV_TRACK_MIN_YEARS),
            f"Only {years} years of history are on file. A record this short cannot show "
            "whether the growth survives a full cycle.")
    else:
        add("growth_track_record", "ok", float(years), float(_GV_TRACK_MIN_YEARS),
            f"{years} years of history are on file, enough to judge the growth across a cycle.")

    hist_g = recon.get("historical")
    if hist_g is None:
        add("market_share_ceiling", "na", None, _GV_CEILING_GROWTH,
            "No usable revenue trend to extend.")
    elif hist_g > _GV_CEILING_GROWTH:
        yrs_to_10x = math.log(10) / math.log(1 + hist_g) if hist_g > 0 else None
        add("market_share_ceiling", "high" if hist_g > 0.25 else "medium",
            hist_g, _GV_CEILING_GROWTH,
            f"Revenue has compounded at about {pct(hist_g)} a year against an economy growing "
            f"near {pct(econ_pace)}. At that pace the company would be ten times its "
            f"size in roughly {yrs_to_10x:.0f} years, so the rate has to fall at some point."
            if yrs_to_10x else "Growth sits far above the economy's pace.")
    else:
        add("market_share_ceiling", "ok", hist_g, _GV_CEILING_GROWTH,
            f"Revenue growth of {pct(hist_g)} is within reach of the economy's own pace.")

    rev_g = _yoy_pct(_row_val(latest, "Revenue"), _row_val(prev, "Revenue")) if prev is not None else None
    op_g = _yoy_pct(_row_val(latest, "Operating Income"), _row_val(prev, "Operating Income")) if prev is not None else None
    if rev_g is None or op_g is None:
        add("revenue_to_operating_income", "na", None, 0.0,
            "Needs revenue and operating income for the latest two years.")
    elif rev_g > 0 and op_g <= 0:
        add("revenue_to_operating_income", "medium", op_g, 0.0,
            f"Revenue grew {pct(rev_g)} while operating profit moved {pct(op_g)}. Growth that "
            "does not reach the profit line is being given away in price or in cost.")
    else:
        add("revenue_to_operating_income", "ok", op_g, 0.0,
            f"Revenue grew {pct(rev_g)} and operating profit grew {pct(op_g)}, so the growth "
            "is reaching the profit line.")

    # ── Tier 2: will reinvestment and R&D sustain it? ─────────────────────────
    roic = f_assume.get("roic")
    wacc_v = f_assume.get("wacc")
    if roic is None or wacc_v is None:
        add("roic_vs_wacc", "na", None, None,
            "The return on capital or the cost of capital is not available for this company.")
    elif roic <= wacc_v:
        add("roic_vs_wacc", "high", roic - wacc_v, 0.0,
            f"The return on invested capital is {pct(roic)} against a cost of capital of "
            f"{pct(wacc_v)}. Reinvesting at a return below the cost of capital destroys value, "
            "so growth here makes the company smaller in value, not larger.")
    else:
        add("roic_vs_wacc", "ok", roic - wacc_v, 0.0,
            f"The return on invested capital is {pct(roic)} against a {pct(wacc_v)} cost of "
            "capital, so reinvested money earns more than it costs.")

    reinv = recon.get("reinvestmentRate")
    g_used = recon.get("growthUsed")
    if reinv is None or roic in (None, 0) or g_used is None:
        add("reinvestment_sufficiency", "na", None, None,
            "The reinvestment rate cannot be measured for this company, so the growth cannot "
            "be tested against what funds it.")
    else:
        needed = g_used / roic if roic else None
        if needed is not None and reinv < needed * 0.75:
            add("reinvestment_sufficiency", "medium", reinv, round(needed, 4),
                f"The company reinvests about {pct(reinv)} of its after-tax operating profit, "
                f"but a {pct(g_used)} growth rate at a {pct(roic)} return needs roughly "
                f"{pct(needed)}. The growth in the model is not being funded.")
        else:
            add("reinvestment_sufficiency", "ok", reinv, round(needed, 4) if needed else None,
                f"Reinvestment of {pct(reinv)} is consistent with the growth the model projects.")

    rd = _row_val(latest, "Research And Development Expenses")
    rd_prev = _row_val(prev, "Research And Development Expenses") if prev is not None else None
    rev_now = _row_val(latest, "Revenue")
    rev_prev = _row_val(prev, "Revenue") if prev is not None else None
    rd_int = _safe_div(rd, rev_now)
    rd_int_prev = _safe_div(rd_prev, rev_prev)
    if rd_int is None or rd_int < _GV_RD_MATERIAL:
        add("rd_trend", "na", rd_int, _GV_RD_MATERIAL,
            "Research and development is not a material share of revenue here, so it is not "
            "the engine behind this company's growth.")
    elif rd_int_prev is not None and rd_int < rd_int_prev and (op_g or 0) > 0:
        add("rd_trend", "medium", rd_int, rd_int_prev,
            f"Research spending fell from {pct(rd_int_prev)} of revenue to {pct(rd_int)} while "
            "profit rose. Cutting research lifts earnings now and takes the growth from later.")
    else:
        add("rd_trend", "ok", rd_int, rd_int_prev,
            f"Research spending is {pct(rd_int)} of revenue and is not being cut to flatter "
            "current earnings.")

    capex_dep = _col_or(latest, "Capex To Depreciation",
                        _safe_div(abs(_row_val(latest, "Capital Expenditure") or 0.0),
                                  _row_val(latest, "Depreciation And Amortization")))
    if capex_dep is None:
        add("capex_quality", "na", None, 1.1,
            "Capital spending and depreciation are not both available.")
    elif capex_dep < 1.1 and (g_used or 0) > 0.05:
        add("capex_quality", "medium", capex_dep, 1.1,
            f"Capital spending is only {capex_dep:.2f} times depreciation, which barely covers "
            f"the wear on the assets the company already owns, yet the model still assumes "
            f"{pct(g_used)} growth. Growth normally has to be built before it is earned.")
    else:
        add("capex_quality", "ok", capex_dep, 1.1,
            f"Capital spending is {capex_dep:.2f} times depreciation, so the company is "
            "investing beyond simple maintenance.")

    # ── Tier 3: what could lower the growth? ──────────────────────────────────
    # The same ROIC series and fade as the Moat Direction strip, so the page
    # states one fade rate; the per-row ratios stand in when no history exists.
    if roic_hist is None:
        roic_hist = {int(r["Calendar Year"]): _compute_return_ratios(r).get("Return On Invested Capital")
                     for r in rows}
    fade = _roic_fade(roic_hist)
    if fade is None:
        add("moat_roic_decay", "na", None, _GV_ROIC_DECAY,
            "Not enough years of return on capital to see whether the advantage is wearing through.")
    else:
        decay = fade["fade"]
        span = f"FY{fade['fromYear']} to FY{fade['toYear']}"
        if decay > _GV_ROIC_DECAY:
            add("moat_roic_decay", "medium", decay, _GV_ROIC_DECAY,
                f"On the trend line through every year from {span}, the return on invested capital "
                f"has given up about {pct(decay)} a year; it stands at {pct(fade['last'])} now. "
                "Returns fade fast where there is no moat.")
        elif decay < -_GV_ROIC_DECAY:
            add("moat_roic_decay", "ok", decay, _GV_ROIC_DECAY,
                f"On the trend line through every year from {span}, the return on invested capital "
                f"has risen about {pct(-decay)} a year; it stands at {pct(fade['last'])} now.")
        else:
            add("moat_roic_decay", "ok", decay, _GV_ROIC_DECAY,
                f"The return on invested capital is holding near {pct(fade['last'])}, which is what "
                "a durable advantage looks like.")

    life = ((forecast or {}).get("lifecycle") or {}) if isinstance(forecast, dict) else {}
    if life.get("cyclicalSwings"):
        add("cyclicality", "medium", life.get("medianGrowth5y"), _GV_CYCLE_RANGE,
            "Revenue growth has swung across a very wide range in recent years, so the recent "
            "rate is probably tracking a price or demand cycle rather than a structural trend.")
    elif life.get("applicable"):
        add("cyclicality", "ok", life.get("medianGrowth5y"), _GV_CYCLE_RANGE,
            "Revenue growth has been steady enough that the recent rate is not obviously a "
            "cycle in disguise.")
    else:
        add("cyclicality", "na", None, _GV_CYCLE_RANGE,
            "Not enough history to tell a cycle from a trend.")

    if rd_int is not None and rd_int > 0.10:
        add("exclusivity_exposure", "medium", rd_int, 0.10,
            f"Research is {pct(rd_int)} of revenue, which usually means the growth rests on "
            "patents or approvals that run out on a clock. Check what expires and when.")
    else:
        add("exclusivity_exposure", "na", rd_int, 0.10,
            "The app cannot see customer or patent concentration. Judge this one yourself.")

    # ── Tier 4: genuine, or a one-off? ────────────────────────────────────────
    nonop = shn_flags.get("nonop_income")
    if nonop and nonop.get("severity") in ("medium", "high"):
        add("one_time_gains", nonop["severity"], nonop.get("value"), nonop.get("threshold"),
            f"The forensic check already flagged this: {nonop.get('detail')}")
    else:
        add("one_time_gains", "ok" if nonop else "na", (nonop or {}).get("value"),
            (nonop or {}).get("threshold"),
            "Non-operating items are not a large share of pre-tax profit, so the growth is not "
            "obviously propped up by one-off gains."
            if nonop else "Non-operating income could not be measured.")

    evol = shn_flags.get("earnings_volatility")
    if evol and evol.get("severity") in ("medium", "high"):
        add("recurring_charges", "medium", evol.get("value"), evol.get("threshold"),
            "Operating profit swings a lot from year to year, which is often what repeated "
            "charges look like once they are given a different name each time. Read the filings "
            "and count how many years carry a so-called one-time charge.")
    else:
        add("recurring_charges", "na", None, None,
            "The app cannot label a charge as one-time from the numbers alone. Read the last "
            "few filings and count how often a one-time charge appears.")

    accr = shn_flags.get("sloan_accruals")
    recv = shn_flags.get("recv_vs_rev")
    worst = None
    for f in (accr, recv):
        if f and f.get("severity") in ("medium", "high"):
            worst = f if (worst is None or f["severity"] == "high") else worst
    if worst:
        add("growth_backed_by_cash", worst["severity"], worst.get("value"), worst.get("threshold"),
            f"The forensic check already flagged this: {worst.get('detail')}")
    else:
        add("growth_backed_by_cash", "ok" if (accr or recv) else "na", None, None,
            "Accruals and receivables are growing in line with revenue, so the reported growth "
            "is backed by cash." if (accr or recv) else "Accruals could not be measured.")

    # ── Tier 5: sentiment, and the small-company caution ──────────────────────
    implied = rev_dcf.get("impliedGrowth")
    fund_g = recon.get("fundamental")
    if implied is None or fund_g is None:
        add("sentiment_gap", "na", None, _GV_SENTIMENT_GAP,
            "Either the price-implied growth or the fundamental growth could not be computed, "
            "so the two cannot be compared.")
    else:
        gap = implied - fund_g
        if gap > _GV_SENTIMENT_GAP:
            add("sentiment_gap", "high" if gap > 2 * _GV_SENTIMENT_GAP else "medium",
                gap, _GV_SENTIMENT_GAP,
                f"Today's price already assumes {pct(implied)} growth, while the company's own "
                f"reinvestment and returns support about {pct(fund_g)}. The market is paying "
                f"{pct(gap)} a year for a story the fundamentals do not yet fund.")
        else:
            add("sentiment_gap", "ok", gap, _GV_SENTIMENT_GAP,
                f"The price assumes {pct(implied)} growth against a fundamental rate of "
                f"{pct(fund_g)}, so expectations are not running ahead of the business.")

    mcap = _row_val(latest, "Market Cap")
    ni_now = _row_val(latest, "Net Income")
    small = (mcap is not None and mcap < _GV_SMALL_CAP)
    young = years < _GV_TRACK_MIN_YEARS
    lossmaking = (ni_now is not None and ni_now < 0)
    if small or young or lossmaking:
        why = ", ".join(w for w, on in (
            ("a small market capitalisation", small),
            ("a short history", young),
            ("negative earnings", lossmaking)) if on)
        add("small_cap_scrutiny", "medium", mcap, _GV_SMALL_CAP,
            f"This company has {why}. Growth is least reliable exactly here, so the growth "
            "assumption needs a wider margin of safety and evidence from outside the model.")
    else:
        add("small_cap_scrutiny", "ok", mcap, _GV_SMALL_CAP,
            "The company is large enough and has enough history that its growth record carries "
            "reasonable weight.")

    add("narrative_probability", "na", None, None,
        "Only you can judge this one. Damodaran's test is to separate what is possible from "
        "what is plausible and from what is probable, and to put only the probable number in "
        "the model.")

    return {
        "applicable": True,
        "checks": checks,
        "method": (
            "A standing due-diligence deck on the growth rate. Grounding: Damodaran "
            "(Investment Valuation Ch.9 and Ch.11) on fundamental growth and on earnings that "
            "outrun revenue, Penman on mean reversion, Fridson on the arithmetic ceiling, "
            "Dorsey on how quickly a return on capital is competed away without a moat, and "
            "Schilit on one-time gains. A flag means look closer, not that the growth is fake."
        ),
    }


# ── Residual income (excess-return) model + justified P/B-vs-ROE ─────────────

RI_HORIZON_YEARS = 8

# Shared horizon + growth caps for the two equity-side models below (Damodaran,
# Investment Valuation, Ch.21 "Valuing Financial Service Firms"). Growth is faded
# linearly from a fundamental rate (retention × ROE) to a terminal rate capped at
# the risk-free rate, exactly as Damodaran's HSBC / State Bank of India / Deutsche
# Bank examples transition high growth down to stable growth.
EQUITY_MODEL_HORIZON_YEARS = 8
EQUITY_MODEL_GROWTH_CAP = 0.20    # explicit-period growth ceiling (anti data-artefact)


def _fade_growth(g_start: float, g_end: float, horizon: int) -> list[float]:
    """Linear glide path from g_start (year 1) to g_end (terminal), one rate per
    explicit year — Damodaran's transition phase (Ch.21, State Bank of India)."""
    if horizon <= 1:
        return [g_end]
    step = (g_end - g_start) / (horizon - 1)
    return [g_start + step * i for i in range(horizon)]


def _residual_income(
    rows: list[sqlite3.Row],
    beta: float | None = None,
    rf: float | None = None,
    erp: float | None = None,
    horizon: int = RI_HORIZON_YEARS,
    price: float | None = None,
    price_unusable: bool = False,
) -> Optional[dict]:
    """Residual-income (excess-return) equity valuation, the correct intrinsic
    model for Financials/REITs where an FCFF firm model misprices (a bank's debt
    is operating; a REIT runs heavy depreciation). Clean-surplus:

      RIₜ = (ROE − Ke) × BVPSₜ₋₁ ;  V₀ = BVPS₀ + Σ PV(RIₜ) + PV(terminal RI)

    Also reports the single-stage justified P/B = (ROE − g)/(Ke − g) anchor vs the
    actual P/B. ROE held at the historical median (robust); book value grows by
    retention × ROE; terminal growth capped at the risk-free rate. Returns None
    when book value or cost of equity is unusable. ``recommended`` is True for the
    sectors where FCFF is switched off."""
    if not rows:
        return None
    latest = rows[-1]
    equity0 = _row_val(latest, "Total Stockholders Equity") or _row_val(latest, "Total Equity")
    shares = _row_val(latest, "Weighted Average Shs Out Dil")
    market_cap = _row_val(latest, "Market Cap")
    bvps0 = _row_val(latest, "Book Value Per Share")
    if bvps0 is None and equity0 is not None and shares not in (None, 0):
        bvps0 = equity0 / shares

    ke = capm_discount_rate(beta, rf=rf, erp=erp)
    rf_eff = RISK_FREE_RATE if rf is None else rf

    roes = [
        (_row_val(r, "ROE") if _row_val(r, "ROE") is not None
         else _safe_div(_row_val(r, "Net Income"),
                        _row_val(r, "Total Stockholders Equity") or _row_val(r, "Total Equity")))
        for r in rows
    ]
    roe_current = roes[-1] if roes else None
    roe_used = _median([x for x in roes if x is not None])
    if roe_used is None:
        roe_used = roe_current

    payout = _row_val(latest, "Payout Ratio")
    if payout is None:
        div = _row_val(latest, "Dividends Paid")
        ni = _row_val(latest, "Net Income")
        payout = _safe_div(abs(div) if div is not None else None, ni)
    payout = min(max(payout if payout is not None else 0.0, 0.0), 1.0)
    retention = 1.0 - payout

    actual_pb = _col_or(latest, "PB Ratio", _safe_div(market_cap, equity0))
    current_price = _effective_price(price, market_cap, shares, price_unusable)

    if bvps0 is None or bvps0 <= 0 or ke is None or roe_used is None:
        return {
            "applicable": False,
            "reason": "Residual income needs positive book value per share, a cost of equity, and an ROE history.",
            "costOfEquity": round(ke, 4) if ke is not None else None,
            "actualPB": round(actual_pb, 2) if actual_pb is not None else None,
            "currentPrice": round(current_price, 2) if current_price is not None else None,
        }

    g_term = min(rf_eff, max(0.0, retention * roe_used))
    # Single-stage justified P/B = (ROE − g)/(Ke − g)  (Damodaran; Gordon-equivalent).
    justified_pb = ((roe_used - g_term) / (ke - g_term)) if (ke > g_term) else None
    fair_value_single = (justified_pb * bvps0) if justified_pb is not None else None

    # Two-stage RI: hold ROE = roe_used; BVPS grows by retention × ROE. Legacy
    # held that growth FLAT for all eight years; the damodaran engine fades it
    # to the stable rate on the same glide every other equity model uses, so
    # the three models stop disagreeing about the same bank's path.
    g_bv = retention * roe_used
    if valuation_engine() != "legacy":
        bv_growth_path = _fade_growth(g_bv, g_term, horizon)
    else:
        bv_growth_path = [g_bv] * horizon
    rows_proj: list[dict] = []
    bv = bvps0
    pv_ri = 0.0
    last_ri = 0.0
    for t in range(1, horizon + 1):
        ri = (roe_used - ke) * bv          # residual income per share on opening book
        pv = ri / (1.0 + ke) ** t
        pv_ri += pv
        rows_proj.append({
            "year": t,
            "bvpsBegin": round(bv, 2),
            "roe": round(roe_used, 4),
            "equityCharge": round(ke * bv, 2),
            "residualIncome": round(ri, 2),
            "pv": round(pv, 2),
        })
        last_ri = ri
        bv = bv * (1.0 + bv_growth_path[t - 1])

    terminal_value = None
    pv_terminal = 0.0
    if ke > g_term:
        terminal_ri = last_ri * (1.0 + g_term)
        terminal_value = terminal_ri / (ke - g_term)
        pv_terminal = terminal_value / (1.0 + ke) ** horizon

    intrinsic = bvps0 + pv_ri + pv_terminal
    mos = ((intrinsic - current_price) / current_price) if (current_price not in (None, 0)) else None

    ok, _reason = fcff_applicable(latest)
    return {
        "applicable": True,
        "recommended": (not ok),  # the right primary model for Financials/REITs
        "costOfEquity": round(ke, 4),
        "bvps0": round(bvps0, 2),
        "roeCurrent": round(roe_current, 4) if roe_current is not None else None,
        "roeUsed": round(roe_used, 4),
        "payout": round(payout, 4),
        "retention": round(retention, 4),
        "growthTerminal": round(g_term, 4),
        "justifiedPB": round(justified_pb, 2) if justified_pb is not None else None,
        "actualPB": round(actual_pb, 2) if actual_pb is not None else None,
        "fairValueSingleStage": round(fair_value_single, 2) if fair_value_single is not None else None,
        "intrinsicPerShare": round(intrinsic, 2),
        "currentPrice": round(current_price, 2) if current_price is not None else None,
        "marginOfSafety": round(mos, 4) if mos is not None else None,
        "horizonYears": horizon,
        "rows": rows_proj,
        "terminalValue": round(terminal_value, 2) if terminal_value is not None else None,
        "pvTerminal": round(pv_terminal, 2),
        "pbVsRoe": {
            "actualPB": round(actual_pb, 2) if actual_pb is not None else None,
            "justifiedPB": round(justified_pb, 2) if justified_pb is not None else None,
            "roe": round(roe_used, 4),
            "costOfEquity": round(ke, 4),
            "verdict": (
                None if (actual_pb is None or justified_pb is None)
                else ("cheap vs ROE" if actual_pb < justified_pb else "rich vs ROE")
            ),
        },
        "note": (
            "Excess-return model: value = book equity + PV of (ROE − cost of equity) on book. "
            "Justified P/B = (ROE − g)/(Ke − g). For REITs, GAAP book/NI understate economics "
            "(heavy depreciation) — cross-check against an FFO/AFFO or P/FFO view."
        ),
    }


# ── Dividend Discount Model (Damodaran, Ch.21 — Method 2 for financials) ──────

def _eps_payout_roe(rows: list[sqlite3.Row]) -> tuple[
    Optional[float], Optional[float], Optional[float], Optional[float]
]:
    """Shared inputs for the equity models: (EPS₀, payout∈[0,1], retention,
    median ROE). Robust to missing columns — EPS falls back to NI/shares, payout
    to |Dividends Paid|/NI, ROE to NI/Equity, each medianed where sensible."""
    if not rows:
        return None, None, None, None
    latest = rows[-1]
    eps = _row_val(latest, "Net Income Per Share")
    if eps is None:
        ni = _row_val(latest, "Net Income")
        sh = _row_val(latest, "Weighted Average Shs Out Dil")
        eps = _safe_div(ni, sh)

    payout = _row_val(latest, "Payout Ratio")
    if payout is None:
        div = _row_val(latest, "Dividends Paid")
        ni = _row_val(latest, "Net Income")
        payout = _safe_div(abs(div) if div is not None else None, ni)
    payout = min(max(payout if payout is not None else 0.0, 0.0), 1.0)
    retention = 1.0 - payout

    roes = [
        (_row_val(r, "ROE") if _row_val(r, "ROE") is not None
         else _safe_div(_row_val(r, "Net Income"),
                        _row_val(r, "Total Stockholders Equity") or _row_val(r, "Total Equity")))
        for r in rows
    ]
    roe_used = _median([x for x in roes if x is not None])
    return eps, payout, retention, roe_used


def _ddm_damodaran(rows: list[sqlite3.Row], *, eps0: float, payout: float,
                   retention: float, roe_used: float, ok: bool,
                   beta: Optional[float], rf: Optional[float],
                   erp: Optional[float], rf_eff: float,
                   current_price: Optional[float]) -> dict:
    """Damodaran-engine DDM: augmented (buyback-inclusive) fundamental growth,
    per-firm stage selection with every variant computed, stable-phase
    discipline (payout 1 − g/ROE, beta → 1, g ≤ rf), and the H model as a
    cross-check for high-payout decliners. Payload stays key-compatible with
    the legacy two-stage DDM and adds the selection metadata."""
    try:
        dg = _vgrowth.ddm_growth(rows)
    except Exception:  # noqa: BLE001 — augmented payout is an upgrade, not a gate
        dg = None
    if dg is not None:
        payout_used = dg["payoutUsed"]
        g_fund = dg["growth"]
        buybacks_included = dg["buybacksIncluded"]
    else:
        payout_used = payout
        g_fund = retention * roe_used     # conventional, UNCAPPED — measured
        buybacks_included = False

    def _ke(b):
        return capm_discount_rate(b, rf=rf, erp=erp, market_fallback=True)

    ke_high = _ke(beta)
    ke_stable = _ke(_vstages.stable_beta(beta, from_high_growth=True))
    roe_stable, roe_src = _vstages.stable_return(roe_used, None, ke_stable)
    g_term = min(rf_eff, g_fund)

    life = _company_lifecycle(rows)
    stage = life.get("stage") if life.get("applicable") else None
    n, archetype, reasons = _vselector.high_growth_period(
        stage, (roe_used - ke_high) if roe_used is not None else None,
        _market_cap_usd(rows[-1]), g_fund, rf_eff)
    rec = 1 if n == 0 else (2 if n == 5 else 3)

    variants = _vengines.ddm_stage_variants(
        eps0=eps0, payout_high=payout_used, g_high=g_fund, g_stable=g_term,
        ke_of_beta=_ke, beta_high=beta, roe_stable=roe_stable,
        price=current_price, recommended_stages=rec)
    order = [str(rec)] + [k for k in ("3", "2", "1") if k != str(rec)]
    chosen_key = next(
        (k for k in order if variants.get(k, {}).get("applicable")), None)
    if chosen_key is None:
        return {
            "applicable": False,
            "recommended": (not ok),
            "reason": (variants.get(str(rec), {}).get("reason")
                       or "No dividend-model structure is solvable here."),
            "costOfEquity": round(ke_high, 4) if ke_high is not None else None,
            "currentPrice": round(current_price, 2) if current_price is not None else None,
        }
    chosen = variants[chosen_key]
    raw = chosen["raw"]
    intrinsic = chosen["intrinsicPerShare"]
    mos = chosen["marginOfSafety"]

    # H model cross-check (Ch. 13.5): needs high payout and declining growth.
    h_out = None
    if (payout_used is not None and payout_used >= _vselector.H_MODEL_MIN_PAYOUT
            and g_fund > g_term):
        h_out = _vstages.h_model(eps0 * payout_used, g_fund, g_term,
                                 ke_stable, two_h_years=float(max(n, 5)))

    return {
        "applicable": True,
        "recommended": (not ok),
        "costOfEquity": round(ke_high, 4),
        "eps0": round(eps0, 2),
        "dps0": round(eps0 * payout_used, 2),
        "payout": round(payout_used, 4),
        "retention": round(1.0 - payout_used, 4),
        "roeUsed": round(roe_used, 4),
        "growthInitial": round(g_fund, 4),
        "growthTerminal": round(g_term, 4),
        "terminalPayout": raw.get("payoutStable"),
        "horizonYears": chosen["nHigh"] + chosen["nTransition"],
        "rows": raw["rows"],
        "pvDividends": raw.get("pvDividends"),
        "terminalValue": raw.get("terminalValue"),
        "pvTerminal": raw.get("pvTerminal"),
        "intrinsicPerShare": intrinsic,
        "currentPrice": round(current_price, 2) if current_price is not None else None,
        "marginOfSafety": mos,
        "stageVariants": {
            k: {kk: vv for kk, vv in v.items() if kk != "raw"}
            for k, v in variants.items()
        },
        "recommendedStages": int(chosen_key),
        "selectorStages": rec,
        "archetype": archetype,
        "rationale": reasons,
        "augmentedPayout": (dg or {}).get("augmentedPayout"),
        "conventionalPayout": (dg or {}).get("conventionalPayout"),
        "buybacksIncluded": buybacks_included,
        "roeStableSource": roe_src,
        "hModel": h_out,
        "note": (
            "Multi-stage DDM (Damodaran Ch.13). Growth is the augmented "
            "retention times ROE, with buybacks counted as returned cash; in "
            "stable growth the payout rises to 1 − g/ROE, the beta moves to "
            "1, and growth cannot outrun the risk-free rate. Every stage "
            "structure is computed; the recommended one leads."
        ),
    }


def _dividend_discount_model(
    rows: list[sqlite3.Row],
    beta: float | None = None,
    rf: float | None = None,
    erp: float | None = None,
    horizon: int = EQUITY_MODEL_HORIZON_YEARS,
    price: float | None = None,
    price_unusable: bool = False,
) -> Optional[dict]:
    """Two-stage dividend discount model (Damodaran, Ch.21 — HSBC / State Bank of
    India). For a financial firm, dividends are observable so the model sidesteps
    the impossible task of measuring net-capex / working-capital reinvestment:

        DPSₜ = EPSₜ × payout ;  V₀ = Σ PV(DPSₜ) + PV(terminal price)

    EPS compounds at a fundamental growth rate g = retention × ROE that fades
    linearly to a terminal rate (≤ risk-free). ROE enters only as a *quality of
    growth* input here — never as a standalone value verdict. ``recommended`` is
    True for the sectors where the FCFF firm model is switched off."""
    if not rows:
        return None
    latest = rows[-1]
    eps0, payout, retention, roe_used = _eps_payout_roe(rows)
    ke = capm_discount_rate(beta, rf=rf, erp=erp)
    rf_eff = RISK_FREE_RATE if rf is None else rf
    shares = _row_val(latest, "Weighted Average Shs Out Dil")
    market_cap = _row_val(latest, "Market Cap")
    current_price = _effective_price(price, market_cap, shares, price_unusable)
    ok, _reason = fcff_applicable(latest)

    if (eps0 is None or eps0 <= 0 or ke is None or roe_used is None
            or payout is None or payout <= 0):
        return {
            "applicable": False,
            "recommended": (not ok),
            "reason": ("The dividend discount model needs positive EPS, a dividend "
                       "payout, a cost of equity and an ROE history — one is missing "
                       "(a non-payer or loss-maker is better read via the FCFE model)."),
            "costOfEquity": round(ke, 4) if ke is not None else None,
            "currentPrice": round(current_price, 2) if current_price is not None else None,
        }

    if valuation_engine() != "legacy":
        return _ddm_damodaran(rows, eps0=eps0, payout=payout,
                              retention=retention, roe_used=roe_used, ok=ok,
                              beta=beta, rf=rf, erp=erp, rf_eff=rf_eff,
                              current_price=current_price)

    g_fund = max(0.0, min(retention * roe_used, EQUITY_MODEL_GROWTH_CAP, ke - 0.005))
    g_term = min(rf_eff, g_fund)
    growth_path = _fade_growth(g_fund, g_term, horizon)

    rows_proj: list[dict] = []
    eps = eps0
    pv_div = 0.0
    last_dps = 0.0
    for t, g in enumerate(growth_path, start=1):
        eps = eps * (1.0 + g)
        dps = eps * payout
        pv = dps / (1.0 + ke) ** t
        pv_div += pv
        last_dps = dps
        rows_proj.append({
            "year": t,
            "growth": round(g, 4),
            "eps": round(eps, 2),
            "dps": round(dps, 2),
            "pv": round(pv, 2),
        })

    # Terminal price: in stable growth the payout rises to 1 − g/ROE (Damodaran),
    # so the firm pays out what it cannot reinvest. Guard ke > g_term.
    terminal_payout = max(0.0, min(1.0, 1.0 - (g_term / roe_used))) if roe_used else payout
    terminal_value = pv_terminal = None
    if ke > g_term:
        terminal_dps = (last_dps / payout) * (1.0 + g_term) * terminal_payout
        terminal_value = terminal_dps / (ke - g_term)
        pv_terminal = terminal_value / (1.0 + ke) ** horizon

    intrinsic = pv_div + (pv_terminal or 0.0)
    mos = ((intrinsic - current_price) / current_price) if (current_price not in (None, 0)) else None
    return {
        "applicable": True,
        "recommended": (not ok),
        "costOfEquity": round(ke, 4),
        "eps0": round(eps0, 2),
        "dps0": round(eps0 * payout, 2),
        "payout": round(payout, 4),
        "retention": round(retention, 4),
        "roeUsed": round(roe_used, 4),
        "growthInitial": round(g_fund, 4),
        "growthTerminal": round(g_term, 4),
        "terminalPayout": round(terminal_payout, 4),
        "horizonYears": horizon,
        "rows": rows_proj,
        "pvDividends": round(pv_div, 2),
        "terminalValue": round(terminal_value, 2) if terminal_value is not None else None,
        "pvTerminal": round(pv_terminal, 2) if pv_terminal is not None else None,
        "intrinsicPerShare": round(intrinsic, 2),
        "currentPrice": round(current_price, 2) if current_price is not None else None,
        "marginOfSafety": round(mos, 4) if mos is not None else None,
        "note": (
            "Two-stage DDM (Damodaran, Ch.21). Dividends are observable, so this avoids "
            "the unmeasurable reinvestment problem at banks. g = retention × ROE fades to "
            "a stable rate; in stable growth the payout rises to 1 − g/ROE. ROE is the "
            "quality-of-growth input, not the value verdict."
        ),
    }


# ── FCFE with regulatory-capital reinvestment (Damodaran, Ch.21 — Method 3) ───

def _fcfe_regulatory_capital(
    rows: list[sqlite3.Row],
    beta: float | None = None,
    rf: float | None = None,
    erp: float | None = None,
    horizon: int = EQUITY_MODEL_HORIZON_YEARS,
    price: float | None = None,
    price_unusable: bool = False,
) -> Optional[dict]:
    """Free-cash-flow-to-equity model where reinvestment is redefined as the
    equity a financial firm must retain to grow its (regulatory) capital base
    (Damodaran, Ch.21 — Deutsche Bank). A bank with a 5% equity/asset ratio must
    add $5 of equity for every $100 of new loans, so:

        potential dividend (FCFEₜ) = EPSₜ − equity reinvested to fund growth
                                    = (ROE − gₜ) × BVPSₜ₋₁

    This is the explicit answer to the "earnings are not cash flows" trap: a bank
    cannot both grow its book and pay out 100% of earnings, because growth consumes
    regulatory capital. Equity reinvestment rate = g / ROE; the equity/asset ratio
    is reported as the lending-capacity constraint. ``recommended`` is True for the
    sectors where the FCFF firm model is switched off."""
    if not rows:
        return None
    latest = rows[-1]
    eps0, payout, retention, roe_used = _eps_payout_roe(rows)
    ke = capm_discount_rate(beta, rf=rf, erp=erp)
    rf_eff = RISK_FREE_RATE if rf is None else rf
    equity0 = _row_val(latest, "Total Stockholders Equity") or _row_val(latest, "Total Equity")
    assets0 = _row_val(latest, "Total Assets")
    shares = _row_val(latest, "Weighted Average Shs Out Dil")
    market_cap = _row_val(latest, "Market Cap")
    bvps0 = _row_val(latest, "Book Value Per Share")
    if bvps0 is None and equity0 is not None and shares not in (None, 0):
        bvps0 = equity0 / shares
    current_price = _effective_price(price, market_cap, shares, price_unusable)
    equity_ratio = _safe_div(equity0, assets0)   # the "$5 per $100" constraint
    ok, _reason = fcff_applicable(latest)

    if bvps0 is None or bvps0 <= 0 or ke is None or roe_used is None or roe_used <= 0:
        return {
            "applicable": False,
            "recommended": (not ok),
            "reason": ("The FCFE model needs positive book value per share, a cost of "
                       "equity and a positive ROE history."),
            "costOfEquity": round(ke, 4) if ke is not None else None,
            "equityAssetRatio": round(equity_ratio, 4) if equity_ratio is not None else None,
            "currentPrice": round(current_price, 2) if current_price is not None else None,
        }

    growth_source = "retention x ROE"
    if valuation_engine() != "legacy":
        # Ch. 14: "It is far more consistent to replace the retention ratio
        # with the equity reinvestment rate" — ERR × noncash ROE where the
        # data supports it, the conventional rate (UNCAPPED — measured, not
        # clamped) where it does not.
        try:
            _fg = _vgrowth.fcfe_growth(rows)
        except Exception:  # noqa: BLE001
            _fg = None
        if _fg is not None:
            g_fund = _fg["growth"]
            growth_source = "equity reinvestment rate x noncash ROE"
        else:
            g_fund = retention * roe_used
            growth_source = ("retention x ROE (the equity reinvestment rate "
                             "could not be measured)")
    else:
        g_fund = max(0.0, min(retention * roe_used, EQUITY_MODEL_GROWTH_CAP, ke - 0.005))
    g_term = min(rf_eff, g_fund)
    growth_path = _fade_growth(g_fund, g_term, horizon)

    rows_proj: list[dict] = []
    bv = bvps0
    pv_fcfe = 0.0
    last_fcfe = 0.0
    for t, g in enumerate(growth_path, start=1):
        eps = roe_used * bv                       # clean-surplus EPS on opening book
        reinvest = g * bv                         # equity retained to grow the capital base
        fcfe = eps - reinvest                     # = (ROE − g) × BVPS, the potential dividend
        pv = fcfe / (1.0 + ke) ** t
        pv_fcfe += pv
        last_fcfe = fcfe
        rows_proj.append({
            "year": t,
            "growth": round(g, 4),
            "bvpsBegin": round(bv, 2),
            "eps": round(eps, 2),
            "equityReinvested": round(reinvest, 2),
            "fcfe": round(fcfe, 2),
            "pv": round(pv, 2),
        })
        bv = bv + reinvest

    terminal_value = pv_terminal = None
    if ke > g_term:
        terminal_fcfe = last_fcfe * (1.0 + g_term)
        terminal_value = terminal_fcfe / (ke - g_term)
        pv_terminal = terminal_value / (1.0 + ke) ** horizon

    intrinsic = pv_fcfe + (pv_terminal or 0.0)
    mos = ((intrinsic - current_price) / current_price) if (current_price not in (None, 0)) else None
    reinvest_rate = (g_fund / roe_used) if roe_used else None
    return {
        "applicable": True,
        "recommended": (not ok),
        "costOfEquity": round(ke, 4),
        "bvps0": round(bvps0, 2),
        "roeUsed": round(roe_used, 4),
        "payout": round(payout, 4) if payout is not None else None,
        "retention": round(retention, 4) if retention is not None else None,
        "equityAssetRatio": round(equity_ratio, 4) if equity_ratio is not None else None,
        "equityReinvestmentRate": round(reinvest_rate, 4) if reinvest_rate is not None else None,
        "growthInitial": round(g_fund, 4),
        "growthTerminal": round(g_term, 4),
        "growthSource": growth_source,
        "horizonYears": horizon,
        "rows": rows_proj,
        "pvFcfe": round(pv_fcfe, 2),
        "terminalValue": round(terminal_value, 2) if terminal_value is not None else None,
        "pvTerminal": round(pv_terminal, 2) if pv_terminal is not None else None,
        "intrinsicPerShare": round(intrinsic, 2),
        "currentPrice": round(current_price, 2) if current_price is not None else None,
        "marginOfSafety": round(mos, 4) if mos is not None else None,
        "note": (
            "FCFE with reinvestment redefined as equity retained to grow regulatory "
            "capital (Damodaran, Ch.21). FCFE = (ROE − g) × BVPS: a bank cannot grow its "
            "book and pay out all earnings, because growth consumes capital. Equity "
            f"reinvestment rate = g / ROE. The equity/asset ratio sets lending capacity."
        ),
    }


# ── Net interest margin / bank profitability (Damodaran, Ch.21) ──────────────

# A bank makes money on the spread between the interest it earns on assets and the
# interest it pays on funding. NIM only means something for spread-based lenders.
# Two gates are needed: (1) interest income is a large share of revenue, which
# screens out card networks (Visa/Mastercard), exchanges and asset managers; and
# (2) interest expense is a material share of interest income, which screens out
# cash-rich, pre-revenue firms (e.g. quantum-computing startups) whose "interest
# income" is just yield on cash, not a funded intermediation spread. Genuine
# lenders run ie/ii ≈ 0.3–0.7; cash-rich non-lenders run ≈ 0.
NIM_MATERIALITY = 0.20         # interest income ÷ revenue
NIM_FUNDING_MIN = 0.20         # interest expense ÷ interest income
NIM_LEVERAGE_MIN = 4.0         # assets ÷ equity — a lender funds earning assets with
                               # liabilities; cash-rich non-lenders sit near 1x


def _bank_profitability(rows: list[sqlite3.Row]) -> Optional[dict]:
    """Net interest margin and the interest spread that drives bank profitability
    (Damodaran, Ch.21). NIM = net interest income ÷ average earning assets; the
    DB has no earning-assets line, so total assets is used as the (slightly
    conservative) proxy and labelled as such. The spread is decomposed into asset
    yield (interest income ÷ avg assets) minus funding cost (interest expense ÷
    avg assets). Returns ``applicable=False`` for non-lenders, where NIM is not a
    meaningful profitability measure."""
    if not rows:
        return None
    latest = rows[-1]
    ii = _row_val(latest, "Interest Income")
    ie = _row_val(latest, "Interest Expense")
    rev = _row_val(latest, "Revenue")
    ta = _row_val(latest, "Total Assets")
    eq = _row_val(latest, "Total Stockholders Equity") or _row_val(latest, "Total Equity")
    sector = (_row_str(latest, "t_sector") or "").strip()

    ii_to_rev = _safe_div(ii, rev)
    ie_to_ii = _safe_div(ie, ii)
    leverage = _safe_div(ta, eq)
    nii = (ii - ie) if (ii is not None and ie is not None) else None
    material = (sector == "Financial Services"
                and ii_to_rev is not None and ii_to_rev >= NIM_MATERIALITY
                and ie_to_ii is not None and ie_to_ii >= NIM_FUNDING_MIN
                and leverage is not None and leverage >= NIM_LEVERAGE_MIN
                and nii is not None and nii > 0)

    if not material:
        return {
            "applicable": False,
            "reason": ("Net interest margin applies only to spread-based lenders (banks). "
                       "This firm earns little or no interest income relative to revenue, so "
                       "NIM is not a meaningful profitability measure — use the equity models "
                       "and margins above instead."),
            "interestIncomeToRevenue": round(ii_to_rev, 4) if ii_to_rev is not None else None,
            "sector": sector or None,
        }

    # Per-year trend on AVERAGE assets (NIM convention): avg of consecutive years.
    nim_trend: list[dict] = []
    assets_by_year = {int(r["Calendar Year"]): _row_val(r, "Total Assets") for r in rows}
    years_sorted = sorted(assets_by_year.keys())
    prev_year = {y: (years_sorted[i - 1] if i > 0 else None) for i, y in enumerate(years_sorted)}
    for r in rows:
        yr = int(r["Calendar Year"])
        ii_y = _row_val(r, "Interest Income")
        ie_y = _row_val(r, "Interest Expense")
        ta_y = assets_by_year.get(yr)
        py = prev_year.get(yr)
        ta_prev = assets_by_year.get(py) if py is not None else None
        avg_assets = ((ta_y + ta_prev) / 2.0) if (ta_y is not None and ta_prev is not None) else ta_y
        if ii_y is None or ie_y is None or not avg_assets:
            continue
        nim_y = (ii_y - ie_y) / avg_assets
        nim_trend.append({
            "year": yr,
            "nim": round(nim_y, 4),
            "assetYield": round(ii_y / avg_assets, 4),
            "fundingCost": round(ie_y / avg_assets, 4),
        })

    ta_prev_latest = assets_by_year.get(prev_year.get(int(latest["Calendar Year"])))
    avg_assets_latest = ((ta + ta_prev_latest) / 2.0) if (ta is not None and ta_prev_latest is not None) else ta
    nim = _safe_div(nii, avg_assets_latest)
    asset_yield = _safe_div(ii, avg_assets_latest)
    funding_cost = _safe_div(ie, avg_assets_latest)
    return {
        "applicable": True,
        "netInterestMargin": round(nim, 4) if nim is not None else None,
        "netInterestIncome": nii,
        "interestIncome": ii,
        "interestExpense": ie,
        "assetYield": round(asset_yield, 4) if asset_yield is not None else None,
        "fundingCost": round(funding_cost, 4) if funding_cost is not None else None,
        "interestIncomeToRevenue": round(ii_to_rev, 4) if ii_to_rev is not None else None,
        "nimTrend": nim_trend,
        "sector": sector or None,
        "note": (
            "NIM = net interest income ÷ average total assets (a conservative proxy — true NIM "
            "uses average earning assets, which the dataset does not break out, so this reads "
            "slightly below the reported figure). NIM = asset yield − funding cost: the spread a "
            "bank earns between what it charges on loans/securities and what it pays for funding."
        ),
    }


# ── Credit analysis (Ziegel, Fundamentals of Credit and Credit Analysis) ─────
# Company-level counterpart to the Credit & Banking macro page. Ziegel reduces
# credit to one question: the degree of risk that an obligor has enough cash to
# repay when due. We express it as a synthetic risk rating (Damodaran Ch.8),
# score the leverage/coverage/liquidity ratios, test debt capacity against free
# cash flow (Ziegel Ch.6), and check the "natural capital structure" rule that
# high operating risk must not be paired with high financial leverage. Banks are
# a separate track (leverage is their raw material; capital adequacy / NIM /
# confidence dominate), gated by the same financial-sector guard as the DCF.

# Parallel to the _SYNTH_SPREAD_* rows (14 entries, best -> worst). Ziegel's
# investment-grade cutoff is BBB-/Baa3; here Baa2/BBB (index 5) is the lowest
# investment-grade row the table resolves, so index <= 5 is investment grade.
_SYNTH_RATINGS = [
    "Aaa/AAA", "Aa2/AA", "A1/A+", "A2/A", "A3/A-", "Baa2/BBB",
    "Ba1/BB+", "Ba2/BB", "B1/B+", "B2/B", "B3/B-", "Caa/CCC", "Ca/CC", "C/D",
]
_IG_MAX_INDEX = 5

# Leverage / capacity thresholds (Ziegel Ch.2-3; common covenant levels).
_NET_DEBT_EBITDA_LIMIT = 3.0    # above this, leverage is high
_FCF_TO_DEBT_FLOOR = 0.10       # FCF should retire >=10% of debt a year
_OP_RISK_CV_HIGH = 0.15         # revenue-growth volatility that reads as high operating risk


def _synthetic_rating(interest_coverage: Optional[float], market_cap: Optional[float]) -> dict:
    """Interest coverage -> synthetic letter rating + default spread (Damodaran
    Ch.8), with Ziegel's investment-grade flag."""
    table = _SYNTH_SPREAD_LARGE if (market_cap is not None and market_cap > _LARGE_CAP_CUTOFF) else _SYNTH_SPREAD_SMALL
    if interest_coverage is None:
        return {
            "letter": None, "spread": _FALLBACK_DEBT_SPREAD, "investmentGrade": None,
            "interestCoverage": None,
            "headline": "Synthetic rating unavailable",
            "reason": ("EBIT or interest expense is missing, so an interest-coverage-based "
                       "synthetic rating cannot be assigned; a roughly BBB default spread is "
                       "assumed for the cost of debt."),
        }
    idx = len(table) - 1
    for i, (floor, _spread) in enumerate(table):
        if interest_coverage > floor:
            idx = i
            break
    letter = _SYNTH_RATINGS[idx]
    ig = idx <= _IG_MAX_INDEX
    return {
        "letter": letter,
        "spread": round(table[idx][1], 4),
        "investmentGrade": ig,
        "interestCoverage": round(interest_coverage, 2),
        "headline": f"Synthetic rating {letter} ({'investment grade' if ig else 'below investment grade'})",
        "reason": (
            f"With EBIT covering interest {interest_coverage:.1f} times, the interest-coverage "
            f"synthetic-rating table (Damodaran) maps to {letter}. "
            + ("At or above Ziegel's BBB-/Baa3 cutoff, so debt could trade with few or no "
               "covenants and no pre-maturity amortization."
               if ig else
               "Below Ziegel's BBB-/Baa3 cutoff, so lenders would require financial and "
               "non-financial covenants and a higher risk-adjusted return.")
        ),
    }


def _credit_metric(label: str, value: Optional[float], threshold: float,
                   higher_is_better: bool, unit: str, note: str) -> dict:
    """Score one leverage/coverage/liquidity ratio against its threshold."""
    if value is None:
        return {"label": label, "value": None, "unit": unit, "threshold": threshold,
                "higherIsBetter": higher_is_better, "pass": None, "severity": "na", "note": note}
    passed = value >= threshold if higher_is_better else value <= threshold
    if higher_is_better:
        severity = "good" if value >= threshold else ("warn" if value >= threshold * 0.6 else "bad")
    else:
        severity = "good" if value <= threshold else ("warn" if value <= threshold * 1.5 else "bad")
    return {"label": label, "value": round(value, 3), "unit": unit, "threshold": threshold,
            "higherIsBetter": higher_is_better, "pass": passed, "severity": severity, "note": note}


def _revenue_growth_cv(rows: list[sqlite3.Row]) -> Optional[float]:
    """Standard deviation of year-over-year revenue growth, a proxy for
    operating (cash-flow) risk in Ziegel's natural-capital-structure test."""
    revs = [_row_val(r, "Revenue") for r in rows]
    revs = [v for v in revs if v is not None and v > 0]
    if len(revs) < 3:
        return None
    growths = [(revs[i] - revs[i - 1]) / revs[i - 1] for i in range(1, len(revs))]
    if len(growths) < 2:
        return None
    mean = sum(growths) / len(growths)
    var = sum((g - mean) ** 2 for g in growths) / (len(growths) - 1)
    return var ** 0.5  # standard deviation of growth (absolute, not divided by mean)


def _credit_debt_capacity(latest: sqlite3.Row, rows: list[sqlite3.Row]) -> dict:
    """Total debt measured against free cash flow (Ziegel Ch.6: debt capacity is
    a function of projected FCF, not accounting profit)."""
    total_debt = _row_val(latest, "Total Debt")
    fcf = _row_val(latest, "Free Cash Flow")
    fcfs = [_row_val(r, "Free Cash Flow") for r in rows[-3:]]
    fcfs = [v for v in fcfs if v is not None]
    fcf_avg = (sum(fcfs) / len(fcfs)) if fcfs else None
    basis = fcf_avg if fcf_avg is not None else fcf
    debt_to_fcf = None
    if total_debt is not None and basis is not None and basis > 0:
        debt_to_fcf = total_debt / basis
    if total_debt is None or total_debt == 0:
        band, headline = "none", "No net debt to service"
    elif basis is not None and basis <= 0:
        band, headline = "distressed", "Free cash flow does not cover debt from operations"
    elif debt_to_fcf is None:
        band, headline = "na", "Debt capacity not computable"
    elif debt_to_fcf <= 4:
        band, headline = "low", "Low leverage, debt is only a few years of free cash flow"
    elif debt_to_fcf <= 8:
        band, headline = "moderate", "Moderate leverage relative to free cash flow"
    else:
        band, headline = "high", "High leverage, debt is many years of free cash flow"
    return {
        "totalDebt": total_debt, "fcfLatest": fcf, "fcf3yrAvg": fcf_avg,
        "debtToFcf": round(debt_to_fcf, 1) if debt_to_fcf is not None else None,
        "band": band, "headline": headline,
        "reason": ("Ziegel makes debt capacity a function of the level and stability of future "
                   "free cash flow. Debt divided by a three-year average of free cash flow is a "
                   "rough count of the years of cash flow it would take to retire the debt."),
    }


def _natural_capital_structure(latest: sqlite3.Row, rows: list[sqlite3.Row],
                               net_debt_ebitda: Optional[float],
                               debt_to_assets: Optional[float]) -> dict:
    """Ziegel's cardinal rule: do not pair high operating risk (volatile cash
    flow) with high financial leverage."""
    cv = _revenue_growth_cv(rows)
    op_risk_high = cv is not None and cv >= _OP_RISK_CV_HIGH
    lev_high = ((net_debt_ebitda is not None and net_debt_ebitda > _NET_DEBT_EBITDA_LIMIT)
                or (debt_to_assets is not None and debt_to_assets > 0.5))
    mismatch = bool(op_risk_high and lev_high)
    if mismatch:
        headline = "Warning: high operating risk paired with high leverage"
    elif op_risk_high and not lev_high:
        headline = "High operating risk, but conservatively financed"
    elif lev_high and not op_risk_high:
        headline = "High leverage carried on stable cash flow"
    else:
        headline = "Operating risk and leverage look compatible"
    return {
        "revenueGrowthVolatility": round(cv, 3) if cv is not None else None,
        "operatingRiskHigh": op_risk_high,
        "leverageHigh": lev_high,
        "mismatch": mismatch,
        "headline": headline,
        "reason": ("Ziegel's natural-capital-structure doctrine: every business has a capital "
                   "structure that fits its operating risk. Volatile cash flow (high operating "
                   "risk) needs patient equity, not heavy debt; only stable cash flow can safely "
                   "carry high leverage. Mixing the two is the classic path to distress."),
    }


def _bank_credit_view(latest: sqlite3.Row, bank_profitability: Optional[dict]) -> dict:
    """Ziegel's bank track: capital adequacy, leverage-as-raw-material, spread
    revenue, and the note that manufacturer leverage ratios and the Z-Score do
    not apply."""
    assets = _row_val(latest, "Total Assets")
    equity = _row_val(latest, "Total Stockholders Equity") or _row_val(latest, "Total Equity")
    net_income = _row_val(latest, "Net Income")
    equity_assets = _safe_div(equity, assets)
    leverage_multiple = _safe_div(assets, equity)
    roa = _safe_div(net_income, assets)
    roe = _safe_div(net_income, equity)
    nim = None
    if bank_profitability and bank_profitability.get("applicable"):
        nim = bank_profitability.get("netInterestMargin")
    metrics = [
        _credit_metric("Equity / Total Assets (capital adequacy)", equity_assets, 0.08, True, "x",
                       "Ziegel: banks run on ~8% equity because asset productivity is tiny; the "
                       "thin cushion is only safe if assets are liquid and high quality."),
        _credit_metric("Return on Assets", roa, 0.01, True, "x",
                       "A bank earns a small spread on a large asset base; ~1% ROA is a healthy result."),
        _credit_metric("Net Interest Margin", nim, 0.025, True, "x",
                       "The core spread the bank earns; it must absorb loan losses and fund the equity return."),
    ]
    return {
        "equityToAssets": round(equity_assets, 4) if equity_assets is not None else None,
        "leverageMultiple": round(leverage_multiple, 1) if leverage_multiple is not None else None,
        "returnOnAssets": round(roa, 4) if roa is not None else None,
        "returnOnEquity": round(roe, 4) if roe is not None else None,
        "netInterestMargin": nim,
        "metrics": metrics,
        "note": ("For a bank, leverage is operating raw material, so the manufacturer leverage "
                 "ratios and the Altman Z-Score do not apply. The dominant risks are capital "
                 "adequacy (reserves cover expected loss, capital covers unexpected loss), "
                 "concentration, and confidence/liquidity in the funding base."),
    }


def _guarded_rating(rating: dict) -> dict:
    """The synthetic-rating block with every coverage-derived figure nulled.

    The keys stay so the payload shape never changes and the page can render
    "not applicable" in the tile that held the letter. ``spread`` keeps its
    fallback value because the cost of debt still needs one; it is the LETTER,
    the investment-grade flag and the coverage that are being withdrawn.
    """
    reasons = _fg.NOT_APPLICABLE_REASONS if _fg is not None else {}
    return {
        **rating,
        "letter": None,
        "investmentGrade": None,
        "interestCoverage": None,
        "spread": _FALLBACK_DEBT_SPREAD,
        "headline": "Synthetic rating not applicable",
        "reason": reasons.get("syntheticRating", rating.get("reason")),
    }


def _credit_score(rating: dict, metrics: list[dict], capacity: dict) -> dict:
    """Composite 0-100 credit-quality score, magnitude-aware with hard caps so a
    negative-FCF or sub-1x-coverage name can never score well."""
    letter = rating.get("letter")
    rating_base = None
    if letter is not None and letter in _SYNTH_RATINGS:
        idx = _SYNTH_RATINGS.index(letter)
        rating_base = 100.0 * (1 - idx / (len(_SYNTH_RATINGS) - 1))
    scored = [m for m in metrics if m["pass"] is not None]
    pass_frac = (sum(1 for m in scored if m["pass"]) / len(scored)) if scored else 0.0
    metric_base = 100.0 * pass_frac
    if rating_base is None:
        score = metric_base
    else:
        score = 0.5 * rating_base + 0.5 * metric_base
    # Hard caps (mirror the comparative engine's NEG_PROFIT_CAP logic).
    ic = rating.get("interestCoverage")
    if ic is not None and ic < 1.0:
        score = min(score, 35.0)
    if capacity.get("band") == "distressed":
        score = min(score, 40.0)
    score = max(0.0, min(100.0, score))
    if score >= 70:
        band = "strong"
    elif score >= 50:
        band = "adequate"
    elif score >= 35:
        band = "weak"
    else:
        band = "distressed"
    headline = {
        "strong": "Strong credit, comfortable capacity to service debt",
        "adequate": "Adequate credit, capacity is sufficient but watch the trend",
        "weak": "Weak credit, limited cushion against a downturn",
        "distressed": "Distressed credit, high risk of trouble servicing debt",
    }[band]
    return {"score": round(score, 1), "band": band, "headline": headline}


def _credit_analysis(rows: list[sqlite3.Row],
                     shenanigans: Optional[dict] = None,
                     bank_profitability: Optional[dict] = None) -> Optional[dict]:
    """Ziegel-style company credit analysis. Corporate track for non-financials;
    a bank track (capital adequacy / NIM / confidence) for financials/REITs,
    where the manufacturer leverage ratios and the Z-Score are suppressed."""
    if not rows:
        return None
    rows = sorted(rows, key=lambda r: int(r["Calendar Year"]))
    latest = rows[-1]
    market_cap_usd = _market_cap_usd(latest)   # USD-equivalent for the size split
    solvency = _compute_solvency_ratios(latest)
    interest_coverage = solvency.get("Interest Coverage Ratio")
    # A firm with positive EBIT and negligible/zero interest expense is fully
    # covered; treat it as a very high coverage so it maps to a top rating rather
    # than falling through to "unavailable".
    if interest_coverage is None:
        ebit = _row_val(latest, "Operating Income")
        intr = _row_val(latest, "Interest Expense")
        if ebit is not None and ebit > 0 and (intr is None or abs(intr) < 1):
            interest_coverage = 1_000.0
    rating = _synthetic_rating(interest_coverage, market_cap_usd)

    is_corporate, na_reason = fcff_applicable(latest)
    source = ("Ziegel, Fundamentals of Credit and Credit Analysis; "
              "Damodaran, Investment Valuation Ch.8 (synthetic rating).")

    if not is_corporate:
        bank = _bank_credit_view(latest, bank_profitability)
        # A LENDER's interest expense is its cost of funding, not a fixed charge
        # covered out of operating income, so the coverage ratio that drives the
        # synthetic rating means something else entirely. JPM read 0.74x
        # coverage and came back Caa/CCC on a table calibrated on manufacturers,
        # and that letter then supplied half the composite score and tripped the
        # sub-1x hard cap. The rating goes, the bank's own capital-adequacy,
        # ROA and net-interest-margin metrics stay, and the score is built from
        # those alone. Real estate keeps its rating: a REIT's interest cover is
        # an ordinary fixed-charge cover, which is why the guard is asked
        # without real estate while the TRACK choice (fcff_applicable) is not.
        lender = _fg is not None and _fg.is_financial(
            _row_str(latest, "t_sector"), _row_str(latest, "t_industry"),
            include_real_estate=False,
        )
        bank_rating = _guarded_rating(rating) if lender else rating
        summary = _credit_score(bank_rating, bank["metrics"], {"band": "na"})
        out = {
            "applicable": True, "kind": "bank", "notApplicableReason": na_reason,
            "rating": bank_rating, "summary": summary,
            "metrics": bank["metrics"], "bank": bank,
            "debtCapacity": None, "capitalStructure": None,
            "forensic": {"altmanZ": _find_score(shenanigans, "altman_z"),
                         "beneishM": _find_score(shenanigans, "beneish_m")},
            "source": source,
            "isFinancial": bool(lender),
            "notApplicable": (
                _fg.not_applicable_map(_fg.CREDIT_BANK_GUARDED_FIELDS)
                if lender and _fg is not None else {}
            ),
        }
        return out

    # Corporate track.
    ebitda = _row_val(latest, "EBITDA")
    net_debt = _row_val(latest, "Net Debt")
    if net_debt is None:
        total_debt = _row_val(latest, "Total Debt")
        cash = _row_val(latest, "Cash And Cash Equivalents")
        net_debt = (total_debt - cash) if (total_debt is not None and cash is not None) else total_debt
    net_debt_ebitda = _safe_div(net_debt, ebitda) if (ebitda is not None and ebitda > 0) else None
    total_debt = _row_val(latest, "Total Debt")
    fcf = _row_val(latest, "Free Cash Flow")
    fcf_to_debt = _safe_div(fcf, total_debt) if (total_debt is not None and total_debt > 0) else None
    debt_to_assets = solvency.get("Debt To Assets")

    metrics = [
        _credit_metric("Interest Coverage (EBIT / interest)", interest_coverage, 5.0, True, "x",
                       "Ziegel's first coverage test: how many times operating earnings cover interest."),
        _credit_metric("Debt Service Coverage", solvency.get("Debt Service Coverage Ratio"), 1.5, True, "x",
                       "Cash flow against interest plus short-term debt — the near-term ability to pay."),
        _credit_metric("Net Debt / EBITDA", net_debt_ebitda, _NET_DEBT_EBITDA_LIMIT, False, "x",
                       "The headline leverage multiple lenders and covenants watch."),
        _credit_metric("FCF / Total Debt", fcf_to_debt, _FCF_TO_DEBT_FLOOR, True, "x",
                       "The share of debt free cash flow could retire in a year (Ziegel: cash, not profit, repays debt)."),
        _credit_metric("Debt / Equity", solvency.get("Debt To Equity"), 1.0, False, "x",
                       "Financial leverage against the equity cushion (Capital, the second C)."),
        _credit_metric("Debt / Assets", debt_to_assets, 0.5, False, "x",
                       "Total leverage against the asset base."),
        _credit_metric("Current Ratio", solvency.get("Current Ratio"), 1.5, True, "x",
                       "Near-term liquidity: current assets against current liabilities."),
        _credit_metric("Quick Ratio", solvency.get("Quick Ratio"), 1.0, True, "x",
                       "Acid-test liquidity excluding inventory."),
    ]
    capacity = _credit_debt_capacity(latest, rows)
    structure = _natural_capital_structure(latest, rows, net_debt_ebitda, debt_to_assets)
    summary = _credit_score(rating, metrics, capacity)
    return {
        "applicable": True, "kind": "corporate", "notApplicableReason": None,
        "rating": rating, "summary": summary, "metrics": metrics,
        "debtCapacity": capacity, "capitalStructure": structure, "bank": None,
        "forensic": {"altmanZ": _find_score(shenanigans, "altman_z"),
                     "beneishM": _find_score(shenanigans, "beneish_m")},
        "source": source,
        # Present and empty on the corporate track so the two tracks carry the
        # same shape and the frontend never branches on a missing key.
        "isFinancial": False,
        "notApplicable": {},
    }


def _find_score(shenanigans: Optional[dict], key: str) -> Optional[dict]:
    """Pull one forensic score (altman_z / beneish_m) out of the shenanigans block."""
    if not shenanigans:
        return None
    for s in shenanigans.get("scores", []) or []:
        if s.get("key") == key:
            return s
    return None


# ── R&D capitalization (Damodaran, Ch.9 'Measuring Earnings') ────────────────

RND_DEFAULT_LIFE = 5          # amortizable life of the research asset (years)
RND_MATERIALITY = 0.03        # R&D/revenue below this → capitalization is immaterial


def _rnd_capitalization(
    rows: list[sqlite3.Row], life: int = RND_DEFAULT_LIFE, materiality: float = RND_MATERIALITY
) -> dict:
    """Capitalize R&D into a research asset (Damodaran Ch.9): add current R&D back
    to operating income, subtract amortization of past R&D, and add the unamortized
    research asset to invested capital — correcting EBIT, NOPAT and ROIC for R&D-
    heavy firms. Only applied when R&D is material; otherwise returns an explanation."""
    if not rows:
        return {"applicable": False, "reason": "No data."}
    latest = rows[-1]
    rev = _row_val(latest, "Revenue")
    rd_now = _row_val(latest, "Research And Development Expenses")
    if rd_now is None or rd_now <= 0 or rev in (None, 0):
        return {"applicable": False, "reason": "No R&D expense reported (or no revenue) — capitalization is not applicable."}
    intensity = rd_now / rev
    if intensity < materiality:
        return {
            "applicable": False,
            "rdIntensity": round(intensity, 4),
            "reason": f"R&D is {intensity:.1%} of revenue (< {materiality:.0%}); capitalization is immaterial — reported EBIT/ROIC are fine as-is.",
        }

    rd_hist = [_row_val(r, "Research And Development Expenses") for r in rows]  # oldest→newest
    n = len(rd_hist)
    # Research asset = Σ over the last `life` years of the unamortized portion.
    research_asset = 0.0
    for i in range(0, life):
        idx = n - 1 - i
        if idx < 0:
            break
        v = rd_hist[idx]
        if v is not None and v > 0:
            research_asset += v * (life - i) / life
    # Current-year amortization = Σ 1/life of each of the prior `life` years' R&D.
    amort = 0.0
    amort_years = 0
    for i in range(1, life + 1):
        idx = n - 1 - i
        if idx < 0:
            break
        v = rd_hist[idx]
        if v is not None and v > 0:
            amort += v / life
            amort_years += 1

    ebit = _row_val(latest, "Operating Income")
    tax = _effective_tax_rate(latest)
    ic = _invested_capital(latest)

    ebit_adj = (ebit + rd_now - amort) if ebit is not None else None
    nopat_rep = ebit * (1.0 - tax) if ebit is not None else None
    nopat_adj = ebit_adj * (1.0 - tax) if ebit_adj is not None else None
    ic_adj = (ic + research_asset) if ic is not None else None
    roic_rep = _safe_div(nopat_rep, ic)
    roic_adj = _safe_div(nopat_adj, ic_adj)

    return {
        "applicable": True,
        "life": life,
        "yearsOfHistoryUsed": amort_years + 1,
        "rdIntensity": round(intensity, 4),
        "currentRD": round(rd_now, 2),
        "researchAsset": round(research_asset, 2),
        "amortizationThisYear": round(amort, 2),
        "ebitReported": round(ebit, 2) if ebit is not None else None,
        "ebitAdjusted": round(ebit_adj, 2) if ebit_adj is not None else None,
        "nopatReported": round(nopat_rep, 2) if nopat_rep is not None else None,
        "nopatAdjusted": round(nopat_adj, 2) if nopat_adj is not None else None,
        "investedCapitalReported": round(ic, 2) if ic is not None else None,
        "investedCapitalAdjusted": round(ic_adj, 2) if ic_adj is not None else None,
        "roicReported": round(roic_rep, 4) if roic_rep is not None else None,
        "roicAdjusted": round(roic_adj, 4) if roic_adj is not None else None,
        "note": (
            f"R&D capitalized over a {life}-year life (Damodaran, Ch.9). R&D is expensed under "
            "GAAP, which understates EBIT and invested capital for research-intensive firms; "
            "capitalizing it restates true operating profitability and ROIC. Life is a default "
            "assumption — lengthen for pharma/long-cycle R&D, shorten for fast-moving software."
        ),
    }


# ── Extended (5-factor) DuPont decomposition ────────────────────────────────

def _dupont_5factor(rows: list[sqlite3.Row]) -> Optional[dict]:
    """5-step DuPont: ROE = (NI/EBT) × (EBT/EBIT) × (EBIT/Rev) × (Rev/AvgTA) × (AvgTA/AvgEq)
    = Tax Burden × Interest Burden × EBIT Margin × Asset Turnover × Financial Leverage.

    Balance-sheet terms use the AVERAGE (begin+end)/2 per the standard definition;
    the first year on file falls back to period-end. EBIT = Operating Income — the
    same figure used in both the interest-burden and EBIT-margin terms, so the chain
    telescopes exactly to ROE. Returns latest-year factors + the product (a ROE
    reconciliation check) + per-year history. None when there are no rows."""
    if not rows:
        return None

    def _factors(row: sqlite3.Row, prev: Optional[sqlite3.Row]) -> dict:
        ni = _row_val(row, "Net Income")
        ebt = _row_val(row, "Income Before Tax")
        ebit = _row_val(row, "Operating Income")
        rev = _row_val(row, "Revenue")
        ta = _row_val(row, "Total Assets")
        eq = _row_val(row, "Total Stockholders Equity") or _row_val(row, "Total Equity")
        ta_p = _row_val(prev, "Total Assets") if prev is not None else None
        eq_p = (_row_val(prev, "Total Stockholders Equity") or _row_val(prev, "Total Equity")) if prev is not None else None
        avg_ta = ((ta + ta_p) / 2.0) if (ta is not None and ta_p is not None) else ta
        avg_eq = ((eq + eq_p) / 2.0) if (eq is not None and eq_p is not None) else eq
        five = [
            _safe_div(ni, ebt),       # tax burden
            _safe_div(ebt, ebit),     # interest burden
            _safe_div(ebit, rev),     # EBIT margin
            _safe_div(rev, avg_ta),   # asset turnover
            _safe_div(avg_ta, avg_eq) # financial leverage
        ]
        product = None
        if all(f is not None for f in five):
            product = 1.0
            for f in five:
                product *= f
        return {
            "taxBurden": five[0], "interestBurden": five[1], "ebitMargin": five[2],
            "assetTurnover": five[3], "financialLeverage": five[4],
            "netMargin": _safe_div(ni, rev), "product": product, "roe": _safe_div(ni, avg_eq),
        }

    def _r(v: Optional[float]) -> Optional[float]:
        return round(v, 6) if v is not None else None

    hist = []
    for i, row in enumerate(rows):
        f = _factors(row, rows[i - 1] if i > 0 else None)
        f["year"] = int(row["Calendar Year"])
        hist.append(f)

    latest = hist[-1]
    product, roe = latest["product"], latest["roe"]
    reconciles = (
        product is not None and roe is not None
        and abs(product - roe) <= max(1e-4, abs(roe) * 0.01)
    )
    return {
        "applicable": product is not None,
        "latestYear": latest["year"],
        "factors": {k: _r(latest[k]) for k in (
            "taxBurden", "interestBurden", "ebitMargin", "assetTurnover", "financialLeverage")},
        "netMargin": _r(latest["netMargin"]),
        "product": _r(product),
        "roe": _r(roe),
        "roeReported": _r(_row_val(rows[-1], "ROE")),
        "reconciles": reconciles,
        "rows": [
            {"year": h["year"], **{k: _r(h[k]) for k in (
                "taxBurden", "interestBurden", "ebitMargin", "assetTurnover",
                "financialLeverage", "roe")}}
            for h in hist
        ],
        "note": (
            "5-step DuPont: ROE = Tax Burden (NI/EBT) × Interest Burden (EBT/EBIT) × "
            "EBIT Margin (EBIT/Revenue) × Asset Turnover (Revenue/Avg Total Assets) × "
            "Financial Leverage (Avg Total Assets/Avg Equity). EBIT = Operating Income; "
            "balance-sheet terms use the average of beginning and ending values. The first "
            "three factors multiply to net margin; all five telescope to ROE."
        ),
    }


def _leverage_roe_terms(row: sqlite3.Row) -> dict:
    """The five book inputs of the leverage ROE identity for ONE fiscal year.

    Kept separate from `_leverage_roe` so `metric_history` can reuse the exact
    same arithmetic per year instead of a second, drifting copy.
    """
    equity = _row_val(row, "Total Stockholders Equity") or _row_val(row, "Total Equity")
    debt = _row_val(row, "Total Debt")
    interest = _row_val(row, "Interest Expense")
    nopat = _nopat_for_row(row)
    tax_rate = _effective_tax_rate(row)

    # Negative or zero book equity makes D/E and ROE meaningless (the ratio flips
    # sign and the identity stops describing anything), so the whole year drops.
    if equity is None or equity <= 0:
        return {"roic": None, "debtEquity": None, "bookInterestRate": None,
                "taxRate": tax_rate, "afterTaxDebtCost": None, "spread": None,
                "leverageGain": None, "roeModel": None, "roeReported": None}

    invested = (equity + debt) if debt is not None else None
    roic = _safe_div(nopat, invested)

    debt_equity = _safe_div(debt, equity)
    # Interest expense is stored with an inconsistent sign across vendors.
    book_rate = _safe_div(abs(interest), debt) if interest is not None else None

    # A debt-free company has no book interest rate to quote, but its leverage
    # gain is a defined 0: D/E is 0, so the spread cannot reach ROE either way.
    if debt is not None and debt == 0:
        book_rate = None
        after_tax_cost = None
        spread = None
        leverage_gain = 0.0 if roic is not None else None
    else:
        # A stored 0 interest expense against real debt is MISSING DATA, not a 0%
        # rate: no company borrows for free. Vendors report 0 when the filer nets
        # interest inside "other income" (AAPL FY2024-25 does exactly this, on
        # >$100B of debt). Taken literally it makes i(1-t) zero, hands the whole
        # ROIC to the spread, and massively overstates the leverage gain. Treat the
        # rate as unknown so the year drops out instead of printing a fake 0.00%.
        if book_rate == 0.0:
            book_rate = None
        after_tax_cost = book_rate * (1 - tax_rate) if book_rate is not None else None
        spread = (roic - after_tax_cost) if (roic is not None and after_tax_cost is not None) else None
        leverage_gain = (debt_equity * spread) if (debt_equity is not None and spread is not None) else None

    roe_model = (roic + leverage_gain) if (roic is not None and leverage_gain is not None) else None
    roe_reported = _row_val(row, "ROE")
    if roe_reported is None:
        roe_reported = _safe_div(_row_val(row, "Net Income"), equity)

    return {
        "roic": roic,
        "debtEquity": debt_equity,
        "bookInterestRate": book_rate,
        "taxRate": tax_rate,
        "afterTaxDebtCost": after_tax_cost,
        "spread": spread,
        "leverageGain": leverage_gain,
        "roeModel": roe_model,
        "roeReported": roe_reported,
    }


def _leverage_roe(rows: list[sqlite3.Row]) -> Optional[dict]:
    """Damodaran's leverage decomposition of ROE (Investment Valuation, Ch.11):

        ROE = ROIC + D/E × [ROIC − i(1−t)]

    ROIC is the after-tax operating return on BOOK capital, D/E the book debt-to-
    equity ratio, i the book interest rate (interest expense / book debt) and t
    the effective tax rate. It reads ROE as an operating return plus a financing
    bonus, where DuPont instead reads it as a chain of margin/turnover/leverage
    levers. The two answer different questions, so both sections stand.

    INVARIANT: the identity telescopes exactly only when ROIC's base is book
    equity + book debt with NO cash subtraction, which is the base
    `_invested_capital`/`_nopat_for_row` already use. Damodaran's own ROIC
    definition elsewhere subtracts cash and cross-holdings; swapping that base in
    here would silently break the reconciliation, so do not "fix" it.

    The gap between the modelled and the reported ROE is itself a signal rather
    than an error: NOPAT is an operating figure, so a wide gap means non-operating
    profit is propping up the reported ROE. That is one of the three ways a ROE is
    inflated; the other two (leverage and a depressed tax rate) are read straight
    off the D/E and tax terms.
    """
    if not rows:
        return None

    def _r(v: Optional[float]) -> Optional[float]:
        return round(v, 6) if v is not None else None

    hist = []
    for row in rows:
        terms = _leverage_roe_terms(row)
        terms["year"] = int(row["Calendar Year"])
        hist.append(terms)

    # Headline on the most recent year the identity actually computes, not simply
    # the last row. A single year with a vendor gap (a 0 interest expense against
    # real debt is the common one) would otherwise blank the whole section for a
    # company whose earlier years are complete. `rows` still carries every year,
    # so the reader sees exactly where the data stops, and `staleLatest` tells the
    # UI to say which year it is showing.
    usable = [h for h in hist if h["roeModel"] is not None]
    latest = usable[-1] if usable else hist[-1]
    data_through = hist[-1]["year"]
    model, reported = latest["roeModel"], latest["roeReported"]
    # 1pp of ROE, or 10% of the reading, whichever is looser: the residual is
    # non-operating income, not arithmetic drift, so the band is deliberately
    # wider than DuPont's (that chain is an exact algebraic identity, this is not).
    reconciles = (
        model is not None and reported is not None
        and abs(model - reported) <= max(0.01, abs(reported) * 0.10)
    )
    gap = (reported - model) if (model is not None and reported is not None) else None

    # Share of the modelled ROE that leverage, not the business, produced. Only
    # meaningful when both terms push the same way: with a negative ROIC or a
    # ROE straddling zero the ratio is arithmetic noise, so it is withheld.
    leverage_share = None
    if (model is not None and latest["leverageGain"] is not None
            and latest["roic"] is not None and latest["roic"] > 0 and model > 0):
        leverage_share = latest["leverageGain"] / model

    return {
        "applicable": latest["roeModel"] is not None,
        "latestYear": latest["year"],
        # Last fiscal year on file. When it is ahead of latestYear the newest rows
        # could not be modelled, and the UI says so rather than implying the
        # headline is current.
        "dataThroughYear": data_through,
        "staleLatest": latest["year"] != data_through,
        "terms": {k: _r(latest[k]) for k in (
            "roic", "debtEquity", "bookInterestRate", "taxRate",
            "afterTaxDebtCost", "spread", "leverageGain")},
        "roeModel": _r(model),
        "roeReported": _r(reported),
        "reconciles": reconciles,
        "nonOperatingGap": _r(gap),
        "leverageShare": _r(leverage_share),
        "spreadPositive": (latest["spread"] > 0) if latest["spread"] is not None else None,
        "rows": [
            {"year": h["year"], **{k: _r(h[k]) for k in (
                "roic", "debtEquity", "bookInterestRate", "taxRate",
                "afterTaxDebtCost", "spread", "leverageGain", "roeModel")}}
            for h in hist
        ],
        "note": (
            "Leverage decomposition: ROE = ROIC + D/E × [ROIC − i(1−t)], where i is the "
            "book interest rate (interest expense / book debt) and t the effective tax rate. "
            "ROIC is after-tax operating income over book capital (equity + debt). The second "
            "term is the leverage gain: borrowed capital earns ROIC but costs i(1−t), and the "
            "surplus on every borrowed dollar belongs to equity. A negative spread turns that "
            "gain into a drag that grows with D/E."
        ),
    }


# ── Earnings bridge (Damodaran Ch.9): how reported earnings were built ────────
# Ordered income-statement walk assembled from the 10-K XBRL facts, so the user
# can see, line by line, how the company got from revenue to net income (and where
# the Ch.9 adjustments — R&D, operating leases — apply).
_EARNINGS_BRIDGE_STEPS: tuple[tuple[str, str, str], ...] = (
    ("revenue", "Revenue", "total"),
    ("costOfRevenue", "Cost of revenue", "subtract"),
    ("grossProfit", "Gross profit", "total"),
    ("researchAndDevelopment", "Research & development", "subtract"),
    ("sellingGeneralAdministrative", "Selling, general & admin", "subtract"),
    ("operatingIncome", "Operating income", "total"),
    ("interestExpense", "Interest expense", "subtract"),
    ("pretaxIncome", "Pre-tax income", "total"),
    ("incomeTaxExpense", "Income tax", "subtract"),
    ("netIncome", "Net income", "total"),
)


def _build_earnings_bridge(facts) -> Optional[dict]:
    """The reported income-statement walk + operating-lease facts from the 10-K
    XBRL, or None when no filing was parsed (foreign filers, missing data)."""
    if facts is None:
        return None
    income = getattr(facts, "income", {}) or {}
    leases = getattr(facts, "leases", {}) or {}
    if not income and not leases:
        return None
    steps = [
        {"key": key, "label": label, "kind": kind, "value": round(income[key], 2)}
        for key, label, kind in _EARNINGS_BRIDGE_STEPS
        if income.get(key) is not None
    ]
    return {
        "source": "sec_10k_xbrl",
        "periodEnd": getattr(facts, "period_end", None),
        "fiscalYear": getattr(facts, "fiscal_year", None),
        "income": {k: round(v, 2) for k, v in income.items()},
        "leases": {k: round(v, 2) for k, v in leases.items()},
        "operatingLeasePV": (_edgar.operating_lease_pv(facts) if _edgar is not None else None),
        "steps": steps,
        "note": (
            "Reported income-statement walk sourced directly from the company's "
            "latest 10-K XBRL filing (SEC EDGAR). Use the AI explainer to see how "
            "each line was built and where the Damodaran Ch.9 adjustments apply."
        ),
    }


# ── Management compensation (proxy statement + SBC proxy) ─────────────────────

def _management_comp_block(latest: sqlite3.Row, proxy: Optional[dict]) -> dict:
    """Executive-compensation block: the DEF 14A proxy link (detailed pay tables)
    plus aggregate stock-based compensation as the in-statement pay proxy."""
    sbc = _row_val(latest, "Stock Based Compensation")
    rev = _row_val(latest, "Revenue")
    ni = _row_val(latest, "Net Income")
    return {
        "proxy": proxy,  # {url, filedDate, accession} or None
        "sbc": round(sbc, 2) if sbc is not None else None,
        "sbcToRevenue": round(_safe_div(sbc, rev), 4) if _safe_div(sbc, rev) is not None else None,
        "sbcToNetIncome": round(_safe_div(sbc, ni), 4) if _safe_div(sbc, ni) is not None else None,
        "note": (
            "Aggregate stock-based compensation is the quantitative pay signal in "
            "the financials; the DEF 14A proxy statement holds the detailed "
            "executive-pay tables (Summary Compensation Table, pay-vs-performance). "
            "Use the AI analyzer to assess how managers are paid and whether pay is "
            "aligned with performance."
        ),
    }


# ── Earnings power, Tobin's Q, owner earnings (value lenses) ─────────────────
# Three additive lenses beside the DCF: Greenwald's no-growth earnings power
# value, Tobin's Q as a market-vs-asset-base check, and Buffett's owner
# earnings as the cash a shareholder could actually take out.

def _epv(
    latest: sqlite3.Row,
    *,
    normalized_ebit: Optional[float],
    tax: float,
    wacc: Optional[float],
    dcf_intrinsic: Optional[float],
    price: Optional[float],
) -> dict:
    """Earnings Power Value (Greenwald Ch.7): sustainable NOPAT / WACC, with the
    same gross-debt equity bridge the FCFF model uses. A no-growth anchor: any
    market value above it is what the market pays for growth and franchise."""
    ok, reason = fcff_applicable(latest)
    if not ok:
        return {"applicable": False, "reason": reason}
    if normalized_ebit is None or wacc is None or wacc <= 0:
        return {"applicable": False,
                "reason": "Normalized operating income or the cost of capital is unavailable."}
    if normalized_ebit <= 0:
        return {"applicable": False,
                "reason": ("Sustainable operating income is negative, so a no-growth "
                           "earnings power value has no meaning for this company. Use the "
                           "asset-based anchors instead.")}
    shares = _row_val(latest, "Weighted Average Shs Out Dil")
    if shares is None or shares <= 0:
        return {"applicable": False, "reason": "Share count is unavailable."}

    nopat = normalized_ebit * (1.0 - tax)
    firm_value = nopat / wacc
    cash = _row_val(latest, "Cash And Cash Equivalents") or 0.0
    debt = _row_val(latest, "Total Debt") or 0.0
    minority = _row_val(latest, "Minority Interest") or 0.0
    equity_value = firm_value + cash - debt - minority
    per_share = equity_value / shares
    price_to_epv = _safe_div(price, per_share) if per_share > 0 else None
    growth_premium = None
    if dcf_intrinsic is not None and per_share != 0:
        growth_premium = dcf_intrinsic - per_share
    return {
        "applicable": True,
        "sustainableEbit": round(normalized_ebit, 2),
        "sustainableNopat": round(nopat, 2),
        "wacc": round(wacc, 4),
        "firmValue": round(firm_value, 2),
        "equityValue": round(equity_value, 2),
        "epvPerShare": round(per_share, 2),
        "priceToEpv": round(price_to_epv, 2) if price_to_epv is not None else None,
        "dcfIntrinsicPerShare": round(dcf_intrinsic, 2) if dcf_intrinsic is not None else None,
        "growthPremiumPerShare": round(growth_premium, 2) if growth_premium is not None else None,
        "note": (
            "Earnings power value capitalizes sustainable operating profit at the "
            "cost of capital with zero growth. Whatever the market pays above it is "
            "the price of future growth, which only creates value inside a protected "
            "franchise (Greenwald)."
        ),
    }


def _tobins_q(rows: list[sqlite3.Row]) -> dict:
    """Tobin's Q per year: (market value of equity + total debt) / total assets,
    with book assets standing in for replacement cost. All inputs share the
    company's reporting currency, so the ratio needs no FX conversion."""
    trend: list[dict] = []
    for r in rows:
        mcap = _row_val(r, "Market Cap")
        debt = _row_val(r, "Total Debt")
        assets = _row_val(r, "Total Assets")
        if mcap is None or assets is None or assets <= 0:
            continue
        q = (mcap + (debt or 0.0)) / assets
        trend.append({"year": int(r["Calendar Year"]), "q": round(q, 3)})
    if not trend:
        return {"applicable": False,
                "reason": "Market value or total assets are unavailable for every year on file."}
    latest_q = trend[-1]["q"]
    return {
        "applicable": True,
        "latest": latest_q,
        "trend": trend,
        "note": (
            "Tobin's Q compares what the market pays for the whole firm with the "
            "book value of the assets that produce its profits. A Q well above 1 "
            "says the market believes the assets earn more than they cost to "
            "assemble. A Q below 1 says the market prices the firm under its "
            "asset base."
        ),
    }


def _capital_base(row: sqlite3.Row, wacc: Optional[float]) -> dict:
    """Goodwill's share of invested capital, plus ROIC and EVA re-run on tangible
    operating capital only (Investment Valuation Ch.25; The Valuation Handbook
    Ch.9): separates what the operating assets earn from the return on the
    acquisition premium paid for them. Uses the SAME invested-capital base as the
    page's ROIC/EVA (book equity + total debt, cash not subtracted) so the
    with-goodwill figures reconcile with the rest of the page."""
    goodwill = _row_val(row, "Goodwill")
    intangibles = _row_val(row, "Intangible Assets")
    combined = _row_val(row, "Goodwill And Intangible Assets")
    if combined is None and (goodwill is not None or intangibles is not None):
        combined = (goodwill or 0.0) + (intangibles or 0.0)
    ic = _invested_capital(row)
    if ic is None or ic <= 0:
        return {"applicable": False,
                "reason": "Invested capital (book equity + total debt) is unavailable or non-positive."}
    if goodwill is None and combined is None:
        return {"applicable": False,
                "reason": "The balance sheet on file carries no goodwill or intangibles line."}
    nopat = _nopat_for_row(row)
    tangible_ic = ic - combined if combined is not None else None
    roic = _safe_div(nopat, ic)
    roic_tangible = None
    eva = None
    eva_tangible = None
    if nopat is not None and wacc is not None:
        eva = nopat - wacc * ic
    if nopat is not None and tangible_ic is not None and tangible_ic > 0:
        roic_tangible = nopat / tangible_ic
        if wacc is not None:
            eva_tangible = nopat - wacc * tangible_ic

    def _money(v: Optional[float]) -> Optional[float]:
        return None if v is None else round(v, 0)

    def _rate(v: Optional[float]) -> Optional[float]:
        return None if v is None else round(v, 4)

    return {
        "applicable": True,
        "year": int(row["Calendar Year"]),
        "goodwill": _money(goodwill),
        "intangibleAssets": _money(intangibles),
        "goodwillAndIntangibles": _money(combined),
        "investedCapital": _money(ic),
        "tangibleInvestedCapital": _money(tangible_ic),
        "goodwillPctInvestedCapital": _rate(_safe_div(goodwill, ic)),
        "goodwillAndIntangiblesPctInvestedCapital": _rate(_safe_div(combined, ic)),
        "nopat": _money(nopat),
        "wacc": _rate(wacc),
        "roic": _rate(roic),
        "roicTangible": _rate(roic_tangible),
        "eva": _money(eva),
        "evaTangible": _money(eva_tangible),
    }


_MAINT_CAPEX_FLOOR_OF_DDA = 0.25  # below this share of D&A the Greenwald estimate is not credible


def _maintenance_capex(rows: list[sqlite3.Row], i: int) -> tuple[Optional[float], str]:
    """Maintenance capital spending for the row at index i, Greenwald's method:
    the share of capex that supported this year's revenue growth is stripped out
    at the firm's own average PP&E-to-sales ratio, and what remains is upkeep.
    Falls back to depreciation and amortization when there is no prior year.

    The ratio uses NET property, plant and equipment because the warehouse has no
    gross PP&E column. Net PP&E is smaller than gross, so the ratio understates
    the capital a dollar of new sales needs, which understates growth capex and
    therefore leaves MORE of capex classified as maintenance. The bias runs one
    way: maintenance capex too high, owner earnings too low.

    Three method labels, so a reader can tell why a fallback ran:
      greenwald                 the estimate stands
      dda_proxy_floor           it came in under the D&A floor
      dda_proxy_insufficient    inputs missing, or the prior row is not the
                                immediately preceding fiscal year
    """
    capex = _row_val(rows[i], "Capital Expenditure")
    dda = _row_val(rows[i], "Depreciation And Amortization")
    rev_i = _row_val(rows[i], "Revenue")
    year_i = _row_val(rows[i], "Calendar Year")
    rev_prev = _row_val(rows[i - 1], "Revenue") if i > 0 else None
    year_prev = _row_val(rows[i - 1], "Calendar Year") if i > 0 else None

    # A gap in the fiscal-year history turns a multi-year revenue change into one
    # year of growth capex, which overstates it and understates upkeep. There is
    # no way to apportion it, so the year falls back to the proxy.
    consecutive = (
        year_i is not None and year_prev is not None and round(year_i - year_prev) == 1
    )

    ratios: list[float] = []
    for r in rows[max(0, i - 5):i]:
        ppe = _row_val(r, "Property Plant Equipment Net")
        rev = _row_val(r, "Revenue")
        year = _row_val(r, "Calendar Year")
        if ppe is None or rev is None or rev <= 0:
            continue
        # Five CALENDAR years back, not five rows back: with gaps in the history
        # the last five rows can reach a decade into the past, and a decade-old
        # PP&E-to-sales ratio is not this firm's current capital intensity.
        if year_i is not None and (year is None or not (0 < year_i - year <= 5)):
            continue
        ratios.append(ppe / rev)
    ratio = (sum(ratios) / len(ratios)) if ratios else None

    if capex is None or rev_i is None or rev_prev is None or ratio is None or not consecutive:
        if dda is not None:
            return dda, "dda_proxy_insufficient"
        return None, "unavailable"

    growth_capex_est = max(0.0, ratio * (rev_i - rev_prev))
    maint = min(max(abs(capex) - growth_capex_est, 0.0), abs(capex))
    # A fast grower can push the estimate to nearly zero, which would charge no
    # upkeep at all. Below a quarter of D&A the estimate is not credible, so the
    # D&A proxy is used instead and the method label says so.
    #
    # The floor only applies when growth capex was actually subtracted. A firm
    # whose revenue FELL has growth_capex_est = 0, so the estimate already IS the
    # whole of capex: there is nothing for the floor to protect against, and
    # applying it replaces a correct answer with a wrong one. PSTV spends 67,000
    # on upkeep while carrying D&A of 445,000, and the floor was publishing the
    # D&A figure, nearly seven times too much.
    if (
        growth_capex_est > 0.0
        and dda is not None
        and dda > 0
        and maint < _MAINT_CAPEX_FLOOR_OF_DDA * dda
    ):
        return dda, "dda_proxy_floor"
    return maint, "greenwald"


def _owner_earnings(rows: list[sqlite3.Row]) -> dict:
    """Owner earnings (Buffett, 1986 letter): reported earnings plus depreciation
    and amortization, minus maintenance capital spending and any working capital
    the business had to absorb. Maintenance capex is estimated with Greenwald's
    method (see _maintenance_capex), and the method used is stated in the payload
    rather than hidden."""
    latest = rows[-1]
    ni = _row_val(latest, "Net Income")
    dda = _row_val(latest, "Depreciation And Amortization")
    wc_change = _row_val(latest, "Change In Working Capital")  # cash-flow sign: + releases cash
    capex = _row_val(latest, "Capital Expenditure")
    shares = _row_val(latest, "Weighted Average Shs Out Dil")
    fcf = _row_val(latest, "Free Cash Flow")
    if ni is None or dda is None:
        return {"applicable": False,
                "reason": "Net income or depreciation and amortization is unavailable."}

    maint_capex, maint_method = _maintenance_capex(rows, len(rows) - 1)
    if maint_capex is None:
        return {"applicable": False,
                "reason": "Maintenance capital spending cannot be estimated."}
    oe = ni + dda - maint_capex + (wc_change or 0.0)
    # Spending beyond upkeep is growth. On the D&A fallback the upkeep estimate
    # can exceed the year's actual capex (a firm spending less than it wears
    # out), and "negative growth capex" is not a thing: the gap is under-
    # investment, so it is clamped to zero and reported as its own term. That
    # keeps one identity true in both directions and hides nothing:
    #     capex + underInvestment = maintenance + growth
    # with at most one of the two extra terms non-zero.
    growth_capex = under_investment = None
    if capex is not None:
        growth_capex = max(abs(capex) - maint_capex, 0.0)
        under_investment = max(maint_capex - abs(capex), 0.0)
    per_share = _safe_div(oe, shares)

    # Look-through flag: when a large share of pretax profit arrives from outside
    # operations, part of the true earnings sits in holdings the statements never
    # consolidate (Buffett's look-through idea). Data for investee retained
    # earnings does not exist here, so this stays a flag, not a number.
    other = _row_val(latest, "Total Other Income Expenses Net")
    pretax = _row_val(latest, "Income Before Tax")
    lookthrough_flag = bool(
        other is not None and pretax is not None and pretax > 0 and abs(other) / pretax > 0.10
    )
    history = []
    for idx in range(max(0, len(rows) - 5), len(rows)):
        r = rows[idx]
        ni_y = _row_val(r, "Net Income")
        dda_y = _row_val(r, "Depreciation And Amortization")
        wc_y = _row_val(r, "Change In Working Capital")
        if ni_y is None or dda_y is None:
            continue
        maint_y, _ = _maintenance_capex(rows, idx)
        if maint_y is None:
            continue
        history.append({"year": int(r["Calendar Year"]),
                        "ownerEarnings": round(ni_y + dda_y - maint_y + (wc_y or 0.0), 2)})
    return {
        "applicable": True,
        "netIncome": round(ni, 2),
        "depreciationAmortization": round(dda, 2),
        "maintenanceCapexProxy": round(maint_capex, 2),
        "maintenanceCapexMethod": maint_method,
        "workingCapitalChange": round(wc_change, 2) if wc_change is not None else None,
        "ownerEarnings": round(oe, 2),
        "ownerEarningsPerShare": round(per_share, 2) if per_share is not None else None,
        "freeCashFlow": round(fcf, 2) if fcf is not None else None,
        "growthCapex": round(growth_capex, 2) if growth_capex is not None else None,
        "capitalExpenditure": round(abs(capex), 2) if capex is not None else None,
        "underInvestment": round(under_investment, 2) if under_investment is not None else None,
        "lookThroughFlag": lookthrough_flag,
        "history": history,
        "assumption": (
            "Maintenance capital spending is estimated with Greenwald's method. "
            "It takes capital spending for the year and removes the spending "
            "needed to support this year's revenue growth, sized at the firm's "
            "average ratio of net property, plant and equipment to sales. What "
            "is left is the cost of standing still, so spending beyond it counts "
            "as growth. Depreciation and amortization is the fallback when the "
            "history is too short to measure that ratio, or when a fiscal year "
            "is missing from it. Where upkeep comes out above the year's actual "
            "capital spending, the shortfall is shown as under-investment rather "
            "than as negative growth spending."
        ),
        "note": (
            "Owner earnings measure the cash an owner could take out each year "
            "without weakening the business. Reported earnings ignore the real "
            "cost of upkeep, and free cash flow charges growth spending against "
            "today. Owner earnings sit between the two."
        ),
    }


# ── Snapshot builder ────────────────────────────────────────────────────────

def build_individual_snapshot(
    ticker: str,
    rows: list[sqlite3.Row],
    db: Optional[FinancialDB] = None,
    rf: float | None = None,
    erp: float | None = None,
    erp_method: str | None = None,
    hist_params: dict[int, dict[str, float]] | None = None,
    industry_norms: dict | None = None,
    gdp_growth: float | None = None,
) -> Optional[IndividualSnapshot]:
    if not rows:
        return None

    # Defensive: sort ascending so `rows[-1]` is the latest fiscal year and every
    # YoY/growth/horizontal pass runs oldest→newest, regardless of caller order.
    rows = sorted(rows, key=lambda r: int(r["Calendar Year"]))
    latest = rows[-1]
    years = [int(r["Calendar Year"]) for r in rows]

    ratios: dict[str, Optional[float]] = {}
    ratios.update(_compute_return_ratios(latest))
    ratios.update(_compute_solvency_ratios(latest))
    ratios["Dividend Yield"] = _dividend_yield(latest)
    # Essential quality/value ratios (Net Debt/EBITDA, Income Quality, SBC/Rev,
    # FCF/Total Debt, EV/EBIT, Sloan accruals, P/B).
    ratios.update(_compute_quality_value_ratios(latest, rows[-2] if len(rows) >= 2 else None))
    # PEG — not in financials.db; sourced (and persisted) from yfinance.
    peg: Optional[float] = None
    if db is not None:
        try:
            peg = db.get_or_compute_peg(ticker)
        except Exception as exc:  # noqa: BLE001 — never let a network call break the snapshot
            log.warning("PEG fetch failed for %s: %s", ticker.upper(), exc)
    ratios["PEG (yfinance)"] = peg

    per_share = _compute_per_share(latest)
    per_share_growth: dict[str, Optional[float]] = {}
    if len(rows) >= 2:
        prev_row = rows[-2]
        for m in PER_SHARE_METRICS:
            per_share_growth[m] = _yoy_pct(_row_val(latest, m), _row_val(prev_row, m))
    else:
        per_share_growth = {m: None for m in PER_SHARE_METRICS}

    nopat_history = {int(r["Calendar Year"]): _nopat_for_row(r) for r in rows}
    ocf_history = {int(r["Calendar Year"]): _row_val(r, "Operating Cash Flow") for r in rows}
    fcf_history = {int(r["Calendar Year"]): _row_val(r, "Free Cash Flow") for r in rows}

    # Measured beta: DB value, else computed via yfinance regression and persisted
    # (so every company ends up with a real beta rather than the 10% default).
    beta = db.get_or_compute_beta(ticker) if db is not None else None
    # Bottom-up beta (Damodaran Ch.8, backend/betas). In 'on' mode the resolver's
    # value replaces the regression beta for EVERY downstream consumer (DCF, WACC,
    # FCFF, EVA, residual income, DDM, FCFE, metric history) since they all take
    # this variable. In 'shadow' mode the value is only surfaced as provenance.
    beta_meta: dict | None = None
    if db is not None and _beta_engine is not None and _beta_engine.beta_mode() != "off":
        try:
            _res = _beta_engine.resolve_beta(ticker, db)
        except Exception as exc:  # noqa: BLE001 — resolver failure keeps old beta
            log.warning("beta resolver failed for %s: %s", ticker.upper(), exc)
            _res = None
        if _res is not None:
            beta_meta = {
                "betaMethod": _res.method,
                "betaConfidence": _res.confidence,
                "betaCoverage": _res.coverage,
                "betaUnlevered": _res.unlevered,
                "betaDeRatio": _res.de_ratio,
                "betaDeSource": _res.de_source,
                "betaComponents": [
                    {"segment": c.segment, "industry": c.industry,
                     "weight": c.weight, "unleveredBeta": c.unlevered_beta,
                     "mapSource": c.map_source}
                    for c in _res.components],
                "betaWarnings": list(_res.warnings),
                "betaRegression": _res.regression_beta,
            }
            if _beta_engine.beta_mode() == "on":
                beta = _res.value
            else:
                beta_meta["betaShadowValue"] = _res.value
    # Most recent market price (yfinance spot quote) for the intrinsic-vs-price
    # comparison; None when offline → models fall back to Market Cap / shares.
    #
    # The quote's own currency rides along, from the same FastInfo payload, and
    # is reconciled against the filer's reporting currency BEFORE any model
    # sees it. Every per-share figure below is per ORDINARY share in the
    # reporting currency; a US depositary receipt's quote is neither, and
    # comparing the two as raw numbers is what made TSM read +357.95 percent.
    live_price: Optional[float] = None
    quote_ccy: Optional[str] = None
    if db is not None:
        try:
            live_price, quote_ccy = db.get_latest_price_currency(ticker)
        except Exception as exc:  # noqa: BLE001 — a quote fetch must not break the snapshot
            log.warning("price fetch failed for %s: %s", ticker.upper(), exc)
    # The reporting currency is taken from the latest row that HAS one: the
    # newest row can carry NULL (NVDA's FY2026 row does) and a NULL there must
    # not be read as "this filer changed currency".
    reporting_ccy: Optional[str] = None
    for _r in reversed(rows):
        _c = _row_str(_r, "Reported Currency")
        if _c and _fx_convert.normalize_currency(_c) is not None:
            reporting_ccy = _c
            break
    price_comparison = None
    if _pc is not None:
        try:
            _rates = db.get_fx_rates() if db is not None else None
        except Exception as exc:  # noqa: BLE001
            log.warning("fx rates failed for %s: %s", ticker.upper(), exc)
            _rates = None
        price_comparison = _pc.reconcile_price(
            ticker, live_price, quote_ccy, reporting_ccy, _rates)
        live_price = price_comparison.price
    price_unusable = price_comparison is not None and not price_comparison.applicable
    price_unusable_reason = price_comparison.reason if price_unusable else None
    if valuation_engine() == "legacy":
        intrinsic, implied_price, mos, growth_used = _compute_dcf(
            rows, beta=beta, rf=rf, erp=erp, price=live_price,
            price_unusable=price_unusable)
    else:
        # The damodaran engine fills these from the chosen model below; the
        # legacy clamped per-share DCF no longer runs at all.
        intrinsic = implied_price = mos = growth_used = None

    horizontal_income = _horizontal(rows, INCOME_STATEMENT_LINES)
    horizontal_balance = _horizontal(rows, BALANCE_SHEET_LINES)
    horizontal_cashflow = _horizontal(rows, CASH_FLOW_LINES)
    horizontal_per_share = _horizontal(rows, PER_SHARE_METRICS)

    # Vertical (common-size) analysis over EVERY dollar line item of all three
    # statements, in canonical statement order (income & cash flow ÷ revenue,
    # balance sheet ÷ total assets).
    vertical_income = _vertical(rows, VERTICAL_INCOME_LINES, VERTICAL_INCOME_BASE)
    vertical_balance = _vertical(rows, VERTICAL_BALANCE_LINES, VERTICAL_BALANCE_BASE)
    vertical_cashflow = _vertical(rows, VERTICAL_CASHFLOW_LINES, VERTICAL_CASHFLOW_BASE)

    per_share_history = _per_share_history(rows)
    # Damodaran Ch.9: source the debt value of OPERATING leases from the 10-K XBRL
    # (OperatingLeaseLiability — the discounted PV of lease payments, absent from
    # yfinance's Total Debt) plus the reported income-statement walk. Best-effort +
    # DB-cached; gated by EARNINGS_XBRL (set =off to disable the SEC fetch).
    xbrl_facts = None
    lease_pv = 0.0
    if db is not None and _edgar is not None and os.environ.get("EARNINGS_XBRL", "on").lower() != "off":
        try:
            with sqlite3.connect(db.db_path) as _xc:
                _xc.row_factory = sqlite3.Row
                xbrl_facts = _edgar.get_financial_facts(_xc, ticker)
            pv = _edgar.operating_lease_pv(xbrl_facts)
            lease_pv = pv if (pv is not None and pv > 0) else 0.0
        except Exception as exc:  # noqa: BLE001 — SEC/network issues must not break the snapshot
            log.warning("xbrl facts failed for %s: %s", ticker.upper(), exc)
    try:
        forecast = compute_forecast(rows, beta=beta, rf=rf, erp=erp, price=live_price,
                                    lease_debt=lease_pv, industry_norms=industry_norms,
                                    gdp_growth=gdp_growth,
                                    price_unusable=price_unusable,
                                    price_unusable_reason=price_unusable_reason)
    except Exception as exc:  # noqa: BLE001 — never let a forecast edge case break the snapshot
        log.warning("forecast failed for %s: %s", ticker.upper(), exc)
        forecast = None

    # Damodaran engine: the recommended stage variant IS the headline valuation.
    # The legacy per-share DCF above survives only under VALUATION_ENGINE=legacy;
    # here its numbers are replaced wholesale, and the growth shown to the
    # verdict engine is the chosen model's first-year growth (falling back to
    # the measured historical geometric rate — never a fabricated 5%).
    if valuation_engine() != "legacy":
        if forecast is not None and forecast.get("applicable", True) is not False:
            intrinsic = forecast.get("intrinsicPerShare")
            implied_price = forecast.get("currentPrice")
            mos = forecast.get("marginOfSafety")
            growth_used = (forecast.get("assumptions") or {}).get("revenueGrowthInitial")
        else:
            intrinsic = implied_price = mos = None
            growth_used = None
        if growth_used is None:
            growth_used = _historical_fcf_growth_unclamped(rows)
    # Surface the resolver's provenance through the existing waccBuild dict so
    # the API response carries method/confidence/components next to the beta.
    if beta_meta and forecast is not None and isinstance(forecast.get("waccBuild"), dict):
        forecast["waccBuild"].update(beta_meta)
    # Tag how the equity risk premium was sourced (live implied two-stage vs the
    # fixed 4.5% fallback) so the UI can show provenance next to the ERP tile.
    if erp_method and forecast is not None and isinstance(forecast.get("waccBuild"), dict):
        forecast["waccBuild"]["erpMethod"] = erp_method
    # Per-year regression beta (trailing 60-month vs the S&P 500 total-return
    # index), precomputed in beta_history by data/compute_beta_history.py. Fetched
    # before metric_history so each year's cost of equity and WACC use that year's
    # beta; also shown directly as the Beta chart. Clamped to the constant
    # 2012-2025 window.
    beta_hist: dict[int, float] = {}
    if db is not None:
        try:
            beta_hist = db.get_beta_history(ticker) or {}
        except Exception as exc:  # noqa: BLE001
            log.warning("beta history failed for %s: %s", ticker.upper(), exc)
            beta_hist = {}
    beta_hist = {y: b for y, b in beta_hist.items() if BETA_MIN_YEAR <= y <= BETA_MAX_YEAR}
    # In 'on' mode the historical per-year betas use the same bottom-up method as
    # the point-in-time valuation: that year's archived Damodaran industry
    # unlevered beta relevered at that year's firm D/E. Regression years fill any
    # gap so the WACC/EVA trend never loses coverage.
    if (db is not None and _beta_engine is not None
            and _beta_engine.beta_mode() == "on"):
        try:
            year_de: dict[int, float | None] = {}
            for r in rows:
                yr = int(r["Calendar Year"])
                debt = _row_val(r, "Total Debt")
                mcap = _row_val(r, "Market Cap")
                year_de[yr] = (debt / mcap) if (debt is not None and mcap and mcap > 0) else None
            bu_hist = _beta_engine.historical_bottom_up(ticker, db, year_de)
            if bu_hist:
                beta_hist = {**beta_hist, **{
                    y: b for y, b in bu_hist.items()
                    if BETA_MIN_YEAR <= y <= BETA_MAX_YEAR}}
        except Exception as exc:  # noqa: BLE001 — trend falls back to regression betas
            log.warning("historical bottom-up betas failed for %s: %s", ticker.upper(), exc)
    try:
        metric_hist = metric_history(
            rows, beta=beta, rf=rf, erp=erp, beta_hist=beta_hist, hist_params=hist_params)
    except Exception as exc:  # noqa: BLE001
        log.warning("metric history failed for %s: %s", ticker.upper(), exc)
        metric_hist = {}
    if beta_hist:
        metric_hist["beta"] = beta_hist

    # Deep-value anchors, forensic shenanigans block, residual-income valuation,
    # and R&D capitalization. Each is guarded so an edge case can't break the page.
    valuation_anchors = _valuation_anchors(latest)
    try:
        shenanigans = _shenanigans(rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("shenanigans failed for %s: %s", ticker.upper(), exc)
        shenanigans = None
    # Growth viability: the standing due-diligence deck on the growth rate. Runs
    # after the forecast and the forensic flags because it reads both.
    try:
        _co_name = (latest["t_name"] if "t_name" in latest.keys() else None) or ticker.upper()
        growth_viability = build_growth_viability(rows, forecast, shenanigans, _co_name,
                                                  gdp_growth=gdp_growth,
                                                  roic_hist=metric_hist.get("roic") or None)
    except Exception as exc:  # noqa: BLE001
        log.warning("growth viability failed for %s: %s", ticker.upper(), exc)
        growth_viability = None
    try:
        residual_income = _residual_income(rows, beta=beta, rf=rf, erp=erp, price=live_price,
                                           price_unusable=price_unusable)
    except Exception as exc:  # noqa: BLE001
        log.warning("residual income failed for %s: %s", ticker.upper(), exc)
        residual_income = None
    try:
        dividend_discount = _dividend_discount_model(rows, beta=beta, rf=rf, erp=erp, price=live_price,
                                                     price_unusable=price_unusable)
    except Exception as exc:  # noqa: BLE001
        log.warning("dividend discount failed for %s: %s", ticker.upper(), exc)
        dividend_discount = None
    try:
        fcfe_regulatory = _fcfe_regulatory_capital(rows, beta=beta, rf=rf, erp=erp, price=live_price,
                                                   price_unusable=price_unusable)
    except Exception as exc:  # noqa: BLE001
        log.warning("fcfe regulatory failed for %s: %s", ticker.upper(), exc)
        fcfe_regulatory = None

    # Financial-sector headline (damodaran engine): the FCFF track is switched
    # off for banks/insurers/REITs, so the DIVIDEND model's recommended stage
    # variant carries the headline valuation instead of showing nothing —
    # exactly the JP Morgan treatment ("dividends because we have no choice").
    if (valuation_engine() != "legacy"
            and (forecast is None or forecast.get("applicable") is False)
            and isinstance(dividend_discount, dict)
            and dividend_discount.get("applicable")):
        intrinsic = dividend_discount.get("intrinsicPerShare")
        implied_price = dividend_discount.get("currentPrice")
        mos = dividend_discount.get("marginOfSafety")
        if dividend_discount.get("growthInitial") is not None:
            growth_used = dividend_discount.get("growthInitial")
    try:
        bank_profitability = _bank_profitability(rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("bank profitability failed for %s: %s", ticker.upper(), exc)
        bank_profitability = None
    try:
        rnd_adjusted = _rnd_capitalization(rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("rnd capitalization failed for %s: %s", ticker.upper(), exc)
        rnd_adjusted = None
    try:
        # Damodaran Ch.9 normalization. Pre-tax cost of debt comes from the WACC
        # build when the forecast ran; else the module's own fallback is used.
        wb = forecast.get("waccBuild") if isinstance(forecast, dict) else None
        pretax_kd = wb.get("costOfDebtPretax") if isinstance(wb, dict) else None
        normalized_earnings = _earn_norm.build_normalized_earnings(
            rows,
            pretax_cost_of_debt=pretax_kd,
            effective_tax=_effective_tax_rate(latest),
            total_debt=_row_val(latest, "Total Debt"),
            lease_commitment_pv=(lease_pv if lease_pv > 0 else None),
            rf=rf,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("normalized earnings failed for %s: %s", ticker.upper(), exc)
        normalized_earnings = None
    try:
        earnings_bridge = _build_earnings_bridge(xbrl_facts)
    except Exception as exc:  # noqa: BLE001
        log.warning("earnings bridge failed for %s: %s", ticker.upper(), exc)
        earnings_bridge = None
    # Value lenses beside the DCF: EPV (needs the normalized EBIT computed just
    # above), Tobin's Q, and owner earnings. Each guards itself and returns an
    # {"applicable": False} marker instead of breaking the snapshot.
    try:
        wb = forecast.get("waccBuild") if isinstance(forecast, dict) else None
        ne_block = (normalized_earnings or {}).get("oneTime") or {}
        epv = _epv(
            latest,
            normalized_ebit=ne_block.get("normalizedEbit"),
            tax=_effective_tax_rate(latest),
            wacc=(wb or {}).get("wacc"),
            dcf_intrinsic=(forecast or {}).get("intrinsicPerShare") if isinstance(forecast, dict) else None,
            price=_effective_price(
                live_price, _row_val(latest, "Market Cap"),
                _row_val(latest, "Weighted Average Shs Out Dil"), price_unusable),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("epv failed for %s: %s", ticker.upper(), exc)
        epv = None
    try:
        tobins_q = _tobins_q(rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("tobins q failed for %s: %s", ticker.upper(), exc)
        tobins_q = None
    try:
        owner_earnings = _owner_earnings(rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("owner earnings failed for %s: %s", ticker.upper(), exc)
        owner_earnings = None
    esg = None
    if db is not None and _esg_data is not None:
        try:
            with sqlite3.connect(db.db_path) as _esc:
                esg = _esg_data.build_esg_block(_esc, ticker)  # cache-only; no page-load network
        except Exception as exc:  # noqa: BLE001
            log.warning("esg block failed for %s: %s", ticker.upper(), exc)
    management_comp = None
    events = None
    if db is not None and _edgar is not None and os.environ.get("EARNINGS_XBRL", "on").lower() != "off":
        try:
            with sqlite3.connect(db.db_path) as _mc:
                _mc.row_factory = sqlite3.Row
                proxy = _edgar.get_def14a(_mc, ticker)
            management_comp = _management_comp_block(latest, proxy)
        except Exception as exc:  # noqa: BLE001 — SEC/network issues must not break the snapshot
            log.warning("management comp failed for %s: %s", ticker.upper(), exc)
        try:
            # Business-events feed (Lev & Gu Ch.4): 8-K for US filers, 6-K for
            # foreign filers, straight from the cached EDGAR submissions.
            with sqlite3.connect(db.db_path) as _ev:
                _ev.row_factory = sqlite3.Row
                events = _edgar.recent_events(_ev, ticker) or None
        except Exception as exc:  # noqa: BLE001
            log.warning("events feed failed for %s: %s", ticker.upper(), exc)
    try:
        dupont = _dupont_5factor(rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("dupont failed for %s: %s", ticker.upper(), exc)
        dupont = None
    try:
        leverage_roe = _leverage_roe(rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("leverage roe failed for %s: %s", ticker.upper(), exc)
        leverage_roe = None
    try:
        credit_analysis = _credit_analysis(rows, shenanigans=shenanigans,
                                           bank_profitability=bank_profitability)
    except Exception as exc:  # noqa: BLE001
        log.warning("credit analysis failed for %s: %s", ticker.upper(), exc)
        credit_analysis = None
    try:
        uses_of_cash = _uses_of_cash.build_uses_of_cash(rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("uses of cash failed for %s: %s", ticker.upper(), exc)
        uses_of_cash = None
    try:
        wb = forecast.get("waccBuild") if isinstance(forecast, dict) else None
        capital_base = _capital_base(latest, (wb or {}).get("wacc"))
    except Exception as exc:  # noqa: BLE001
        log.warning("capital base failed for %s: %s", ticker.upper(), exc)
        capital_base = None

    # ── Company profile (plan 3.1-3.3) ─────────────────────────────────────
    business_profile = None
    cost_structure = None
    generic_strategy = None
    growth_split = None
    _snap_sector = latest["t_sector"] if "t_sector" in latest.keys() else None
    _snap_industry = latest["t_industry"] if "t_industry" in latest.keys() else None
    if db is not None and _snap_industry:
        try:
            _cp_conn = sqlite3.connect(db.db_path, timeout=5.0)
            _cp_conn.row_factory = sqlite3.Row
            # The scheduled refresh jobs write to this file; wait for a lock
            # instead of failing the block.
            _cp_conn.execute("PRAGMA busy_timeout = 5000")
        except Exception:  # noqa: BLE001
            _cp_conn = None
        if _cp_conn is not None:
            try:
                from company_profile.profile import get_business_profile
                business_profile = get_business_profile(_cp_conn, ticker.upper())
            except Exception as exc:  # noqa: BLE001
                log.warning("business profile failed for %s: %s", ticker.upper(), exc)
                business_profile = None
            _cp_segment_count: Optional[int] = None
            if isinstance(business_profile, dict):
                _segs = business_profile.get("segments")
                if isinstance(_segs, list) and _segs:
                    _cp_segment_count = len(_segs)
            _cp_peers: Any = None
            try:
                _cp_peers = _company_profile_peers(_cp_conn, _snap_industry)
            except Exception as exc:  # noqa: BLE001
                log.warning("peer load for company profile failed for %s: %s",
                            ticker.upper(), exc)
            if _cp_peers is not None:
                try:
                    from company_profile.cost_structure import build_cost_structure
                    cost_structure = build_cost_structure(
                        ticker.upper(), _cp_peers, _snap_sector, _snap_industry,
                    )
                except Exception as exc:  # noqa: BLE001
                    log.warning("cost structure failed for %s: %s", ticker.upper(), exc)
                    cost_structure = None
                try:
                    from company_profile.generic_strategy import build_generic_strategy
                    generic_strategy = build_generic_strategy(
                        ticker.upper(), _cp_peers, _cp_segment_count,
                        _snap_sector, _snap_industry,
                    )
                except Exception as exc:  # noqa: BLE001
                    log.warning("generic strategy failed for %s: %s", ticker.upper(), exc)
                    generic_strategy = None
                try:
                    # Share now and five years back: the connections growth
                    # split, on the one cached industry panel.
                    from connections.sector_cache import get_industry_panel
                    from connections.splits import build_growth_split
                    _panel = get_industry_panel(_cp_conn, _snap_industry)
                    if _panel:
                        _now = _panel.by_year.get(_panel.fiscal_year)
                        _then = _panel.by_year.get(_panel.fiscal_year - 5)
                        if _now and _then:
                            growth_split = build_growth_split(
                                _cp_conn, ticker.upper(), _snap_industry, _now, _then)
                            if growth_split is not None:
                                growth_split["fiscalYear"] = _panel.fiscal_year
                except Exception as exc:  # noqa: BLE001
                    log.warning("growth split failed for %s: %s", ticker.upper(), exc)
                    growth_split = None
            _cp_conn.close()

    try:
        moat_direction = _moat_direction(rows, metric_hist, growth_split)
    except Exception as exc:  # noqa: BLE001
        log.warning("moat direction failed for %s: %s", ticker.upper(), exc)
        moat_direction = None

    net_income_growth_latest = horizontal_income["Net Income"].get(years[-1])
    strengths, weaknesses, quality_score, verdict = _build_verdict({
        "ratios": ratios,
        "margin_of_safety": mos,
        "avg_fcf_growth": growth_used,
        "net_income_growth_latest": net_income_growth_latest,
    })

    return IndividualSnapshot(
        ticker=ticker.upper(),
        name=latest["t_name"] if "t_name" in latest.keys() else None,
        sector=latest["t_sector"] if "t_sector" in latest.keys() else None,
        industry=latest["t_industry"] if "t_industry" in latest.keys() else None,
        latest_year=years[-1],
        years=years,
        ratios=ratios,
        per_share=per_share,
        per_share_growth=per_share_growth,
        nopat_history=nopat_history,
        ocf_history=ocf_history,
        fcf_history=fcf_history,
        dcf_intrinsic=intrinsic,
        implied_price=implied_price,
        margin_of_safety=mos,
        avg_fcf_growth=growth_used,
        horizontal_income=horizontal_income,
        horizontal_balance=horizontal_balance,
        horizontal_cashflow=horizontal_cashflow,
        horizontal_per_share=horizontal_per_share,
        vertical_income=vertical_income,
        vertical_balance=vertical_balance,
        vertical_cashflow=vertical_cashflow,
        per_share_history=per_share_history,
        forecast=forecast,
        growth_viability=growth_viability,
        metric_history=metric_hist,
        price_comparison=(price_comparison.to_dict()
                          if price_comparison is not None else None),
        valuation_anchors=valuation_anchors,
        shenanigans=shenanigans,
        residual_income=residual_income,
        dividend_discount=dividend_discount,
        fcfe_regulatory=fcfe_regulatory,
        bank_profitability=bank_profitability,
        credit_analysis=credit_analysis,
        rnd_adjusted=rnd_adjusted,
        normalized_earnings=normalized_earnings,
        earnings_bridge=earnings_bridge,
        esg=esg,
        management_comp=management_comp,
        events=events,
        epv=epv,
        tobins_q=tobins_q,
        owner_earnings=owner_earnings,
        capital_base=capital_base,
        dupont=dupont,
        leverage_roe=leverage_roe,
        uses_of_cash=uses_of_cash,
        business_profile=business_profile,
        cost_structure=cost_structure,
        generic_strategy=generic_strategy,
        moat_direction=moat_direction,
        strengths=strengths,
        weaknesses=weaknesses,
        verdict=verdict,
        quality_score=quality_score,
    )


# ── Moat direction and growth sustainability (feature plan item 11) ──────────
# Figures only, no verdict: the spread today and five years back, its average
# change per year (OLS slope over the window, not two endpoints), the exact
# split of that change into ROIC and WACC, the four-factor sustainable growth
# per year beside revenue growth, and share and margins now against then.

MOAT_WINDOW_YEARS = 5
# Data-sufficiency guard, not a label: below 5% capital growth over the
# window the return on new capital is withheld as noise.
_INCREMENTAL_ROIC_MIN_GROWTH = 0.05


def _r(v: Optional[float], d: int = 6) -> Optional[float]:
    return round(v, d) if v is not None else None


def _roic_fade(roic_by_year: dict[int, Optional[float]]) -> Optional[dict]:
    """ROIC fade over the moat window: minus the OLS slope of ROIC on the year,
    so a positive figure is ROIC given up per year. One function for the moat
    strip and the Growth Viability flag, so the page states one fade rate.
    None with fewer than three years in the window."""
    pts = sorted((int(y), v) for y, v in roic_by_year.items() if v is not None)
    if not pts:
        return None
    y1 = pts[-1][0]
    pts = [(y, v) for y, v in pts if y >= y1 - MOAT_WINDOW_YEARS]
    if len(pts) < 3:
        return None
    slope = _ols_slope([float(y) for y, _ in pts], [v for _, v in pts])
    if slope is None:
        return None
    return {"fade": -slope, "first": pts[0][1], "last": pts[-1][1],
            "fromYear": pts[0][0], "toYear": y1}


def _spread_direction(metric_hist: Optional[dict], equity_basis: bool = False) -> Optional[dict]:
    """ROIC − WACC today, five years back, the OLS slope across the window,
    and the exact split of the five-year change: Δspread = ΔROIC − ΔWACC.
    Reads the same per-year ROIC and WACC as the spread history table (each
    year's WACC carries that year's rates), so a spread that fell because
    rates rose shows up in the WACC term, not the ROIC term.

    ``equity_basis`` (banks, insurers, REITs, where debt is raw material and
    ROIC − WACC means nothing) runs the same arithmetic on ROE − cost of
    equity, the other line of the spread history table."""
    mh = metric_hist or {}
    rkey, ckey = ("roe", "cost_of_equity") if equity_basis else ("roic", "wacc")
    roic, wacc = mh.get(rkey) or {}, mh.get(ckey) or {}
    years = sorted(int(y) for y in roic if roic.get(y) is not None and wacc.get(y) is not None)
    if not years:
        return None
    y1 = years[-1]
    y0 = y1 - MOAT_WINDOW_YEARS
    window = [y for y in years if y >= y0]
    spread = {y: roic[y] - wacc[y] for y in window}
    slope = (_ols_slope([float(y) for y in window], [spread[y] for y in window])
             if len(window) >= 3 else None)
    has_then = y0 in spread
    # Rounded to the displayed precision (a percent to 3 decimals) so the
    # printed parts add to the printed total.
    d_roic = _r(roic[y1] - roic[y0], 5) if has_then else None
    d_wacc = _r(wacc[y1] - wacc[y0], 5) if has_then else None
    fade = _roic_fade({y: roic[y] for y in window})
    now = spread[y1]
    return {
        # "capital": ROIC − WACC; "equity": ROE − cost of equity.
        "basis": "equity" if equity_basis else "capital",
        "year": y1,
        "yearThen": y0 if has_then else None,
        "spreadNow": _r(now),
        "spreadThen": _r(spread[y0]) if has_then else None,
        "slopePerYear": _r(slope),
        "yearsInSlope": len(window),
        "returnNow": _r(roic[y1]),
        "costNow": _r(wacc[y1]),
        "returnChange": d_roic,
        "costChange": d_wacc,
        # Exact: the printed total is rebuilt from the printed parts.
        "spreadChange": _r(d_roic - d_wacc, 5) if has_then else None,
        "returnFadePerYear": _r(fade["fade"]) if fade else None,
        # Arithmetic only, shown only while the spread is positive and falling.
        "yearsToZeroAtThisPace": _r(now / -slope, 2)
            if (slope is not None and slope < 0 and now > 0) else None,
    }


def _sustainable_growth_history(rows: list[sqlite3.Row]) -> Optional[dict]:
    """Porter's four factors per year over the moat window (net margin × asset
    turnover × assets/equity × retention), beside revenue growth over the same
    years. Retention counts buybacks as cash returned, the augmented payout of
    valuation/inputs.py (Damodaran Ch.13.3): 1 − (dividends + buybacks) / net
    income. It can go below zero when a company returns more than it earns;
    that is shown as computed, never clamped."""
    from company_profile.rivals import sustainable_growth  # noqa: PLC0415

    by_year = {int(r["Calendar Year"]): r for r in rows}
    if not by_year:
        return None
    y1 = max(by_year)
    y0 = y1 - MOAT_WINDOW_YEARS
    out_rows: list[dict] = []
    saw_buybacks = False
    for y in range(y0 + 1, y1 + 1):
        r = by_year.get(y)
        if r is None:
            continue
        div = _row_val(r, "Dividends Paid")
        bb = _row_val(r, "Common Stock Repurchased")
        saw_buybacks = saw_buybacks or bb is not None
        # Both columns NULL is missing data, not zero payout: the DB stores an
        # explicit 0 for a company that paid nothing, so retention stays None.
        cash_returned = (None if (div is None and bb is None) else
                         (abs(div) if div is not None else 0.0) + (abs(bb) if bb is not None else 0.0))
        equity = _row_val(r, "Total Stockholders Equity") or _row_val(r, "Total Equity")
        product, f = sustainable_growth(_row_val(r, "Revenue"), _row_val(r, "Net Income"),
                                        _row_val(r, "Total Assets"), equity, cash_returned)
        out_rows.append({"year": y, **f, "sustainableGrowth": product})
    if not out_rows:
        return None
    products = [x["sustainableGrowth"] for x in out_rows if x["sustainableGrowth"] is not None]
    rev1 = _row_val(by_year[y1], "Revenue")
    rev0 = _row_val(by_year[y0], "Revenue") if y0 in by_year else None
    cagr = ((rev1 / rev0) ** (1.0 / MOAT_WINDOW_YEARS) - 1.0
            if (rev1 is not None and rev0 is not None and rev1 > 0 and rev0 > 0) else None)
    return {
        "rows": out_rows,
        "averageSustainableGrowth": _r(sum(products) / len(products)) if products else None,
        "yearsAveraged": len(products),
        "revenueCagr": _r(cagr),
        "revenueFromYear": y0 if rev0 is not None else None,
        "revenueToYear": y1,
        "buybacksIncluded": saw_buybacks,
    }


def _share_and_margins(rows: list[sqlite3.Row], growth_split: Optional[dict],
                       gross_margin: bool = True) -> Optional[dict]:
    """Gross and operating margin in the latest year and five years before,
    beside industry revenue share now and then (the growth split's own
    figures, from the same peer panel as the Industry page). ``gross_margin``
    is off for banks, insurers and REITs, which have no cost of goods sold."""
    by_year = {int(r["Calendar Year"]): r for r in rows}
    if not by_year:
        return None
    y1 = max(by_year)
    y0 = y1 - MOAT_WINDOW_YEARS

    def margins(y: int) -> tuple[Optional[float], Optional[float]]:
        r = by_year.get(y)
        if r is None:
            return None, None
        rev = _row_val(r, "Revenue")
        if rev is None or rev <= 0:
            return None, None
        return (_safe_div(_row_val(r, "Gross Profit"), rev) if gross_margin else None,
                _safe_div(_row_val(r, "Operating Income"), rev))

    g1, o1 = margins(y1)
    g0, o0 = margins(y0)
    gs = growth_split or {}
    return {
        "year": y1,
        "yearThen": y0,
        "grossMarginNow": _r(g1), "grossMarginThen": _r(g0),
        "operatingMarginNow": _r(o1), "operatingMarginThen": _r(o0),
        "shareNow": gs.get("shareNow"), "shareThen": gs.get("shareThen"),
        "shareYear": gs.get("fiscalYear"),
        "shareYearThen": (gs["fiscalYear"] - gs["years"])
            if (gs.get("fiscalYear") is not None and gs.get("years")) else None,
    }


def _incremental_roic(rows: list[sqlite3.Row]) -> Optional[dict]:
    """Return on the capital added over the moat window: (NOPAT now − NOPAT
    five years back) / (invested capital now − invested capital then). The
    one-year marginal ROIC swings on small capital changes; five years of
    change is the steadier read. None when capital grew by less than
    ``_INCREMENTAL_ROIC_MIN_GROWTH`` of its starting base: a tiny denominator
    prints noise (50 of new capital beside 500 of new profit reads 1,000%)."""
    by_year = {int(r["Calendar Year"]): r for r in rows}
    if not by_year:
        return None
    y1 = max(by_year)
    y0 = y1 - MOAT_WINDOW_YEARS
    if y0 not in by_year:
        return None
    n1, n0 = _nopat_for_row(by_year[y1]), _nopat_for_row(by_year[y0])
    c1, c0 = _invested_capital(by_year[y1]), _invested_capital(by_year[y0])
    if None in (n1, n0, c1, c0) or c1 - c0 <= _INCREMENTAL_ROIC_MIN_GROWTH * abs(c0):
        return None
    return {"value": _r((n1 - n0) / (c1 - c0)), "fromYear": y0, "toYear": y1}


def _moat_direction(rows: list[sqlite3.Row], metric_hist: Optional[dict],
                    growth_split: Optional[dict]) -> Optional[dict]:
    if not rows:
        return None
    rows = sorted(rows, key=lambda r: int(r["Calendar Year"]))
    operating_firm, _ = fcff_applicable(rows[-1])
    return {
        "windowYears": MOAT_WINDOW_YEARS,
        "spread": _spread_direction(metric_hist, equity_basis=not operating_firm),
        # Return on new capital is an operating-firm measure, like ROIC itself.
        "incrementalRoic": _incremental_roic(rows) if operating_firm else None,
        "shareAndMargins": _share_and_margins(rows, growth_split, gross_margin=operating_firm),
        "sustainableGrowth": _sustainable_growth_history(rows),
    }


# ── Console output ──────────────────────────────────────────────────────────

def _fmt_pct(v: Optional[float]) -> str:
    if v is None:
        return "    n/a"
    return f"{v * 100:>8.2f}%"


def _fmt_num(v: Optional[float]) -> str:
    if v is None:
        return "    n/a"
    if abs(v) >= 1_000_000:
        return f"{v / 1e6:>10,.2f}M"
    if abs(v) >= 1_000:
        return f"{v:>12,.0f}"
    return f"{v:>12.4f}"


def print_snapshot(snap: IndividualSnapshot) -> None:
    print()
    print("=" * 90)
    print(f"  INDIVIDUAL ANALYSIS: {snap.ticker}  —  {snap.name or ''}")
    print(f"  Sector: {snap.sector or 'n/a'}    Industry: {snap.industry or 'n/a'}")
    print(f"  Years on file: {snap.years[0]}-{snap.years[-1]} ({len(snap.years)} fiscal years)")
    print("=" * 90)

    print("\n  RETURN & EFFICIENCY (latest year)")
    print("  " + "-" * 86)
    for m in RETURN_RATIOS:
        v = snap.ratios.get(m)
        print(f"    {m:<32}{_fmt_pct(v) if v is not None and abs(v) <= 1 else _fmt_num(v)}")

    print("\n  SOLVENCY & LIQUIDITY (latest year)")
    print("  " + "-" * 86)
    for m in SOLVENCY_RATIOS:
        v = snap.ratios.get(m)
        print(f"    {m:<32}{_fmt_num(v)}")

    print("\n  CASH GENERATION (history)")
    print("  " + "-" * 86)
    print(f"    {'Year':<8}{'NOPAT':>16}{'Operating CF':>18}{'Free CF':>16}")
    for y in snap.years:
        print(
            f"    {y:<8}"
            f"{_fmt_num(snap.nopat_history.get(y))}"
            f"{_fmt_num(snap.ocf_history.get(y))}"
            f"{_fmt_num(snap.fcf_history.get(y))}"
        )

    print("\n  DCF VALUATION")
    print("  " + "-" * 86)
    print(f"    WACC: {DCF_WACC*100:.1f}%   Terminal Growth: {DCF_TERMINAL_GROWTH*100:.1f}%   "
          f"Projection: {DCF_PROJECTION_YEARS}y")
    print(f"    Growth assumption used : {_fmt_pct(snap.avg_fcf_growth)}")
    print(f"    Intrinsic per share    : {_fmt_num(snap.dcf_intrinsic)}")
    print(f"    Current implied price  : {_fmt_num(snap.implied_price)}")
    print(f"    Margin of safety       : {_fmt_pct(snap.margin_of_safety)}")

    print("\n  STRENGTHS")
    print("  " + "-" * 86)
    if snap.strengths:
        for s in snap.strengths:
            print(f"    [+] {s}")
    else:
        print("    (none meet quality thresholds)")

    print("\n  WEAKNESSES")
    print("  " + "-" * 86)
    if snap.weaknesses:
        for w in snap.weaknesses:
            print(f"    [-] {w}")
    else:
        print("    (no flagged weaknesses)")

    print("\n  VERDICT")
    print("  " + "-" * 86)
    print(f"    Quality Score : {snap.quality_score:.2f} / 100")
    print(f"    Conclusion    : {snap.verdict}")
    print()


# ── Excel export ────────────────────────────────────────────────────────────

def export_excel(snap: IndividualSnapshot, output_path: str) -> None:
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

    years = snap.years
    year_cols = [str(y) for y in years]

    def _table(
        title: str,
        table: dict[str, dict[int, Optional[float]]],
        as_pct: bool,
    ) -> pd.DataFrame:
        hdr = pd.DataFrame({"Metric": [title] + list(table.keys())})
        body_rows = [[None] * len(years)]
        for m in table:
            body_rows.append([
                (round(table[m][y] * 100, 2) if (as_pct and table[m].get(y) is not None) else table[m].get(y))
                for y in years
            ])
        body = pd.DataFrame(body_rows, columns=year_cols)
        return pd.concat([hdr, body], axis=1)

    # ── Sheet 1: Summary
    summary_rows: list[dict] = [
        {"Field": "Ticker", "Value": snap.ticker},
        {"Field": "Name", "Value": snap.name},
        {"Field": "Sector", "Value": snap.sector},
        {"Field": "Industry", "Value": snap.industry},
        {"Field": "Years Covered", "Value": f"{years[0]}-{years[-1]}"},
        {"Field": "Quality Score (0-100)", "Value": snap.quality_score},
        {"Field": "Verdict", "Value": snap.verdict},
        {"Field": "DCF Intrinsic / Share", "Value": snap.dcf_intrinsic},
        {"Field": "Implied Price", "Value": snap.implied_price},
        {"Field": "Margin of Safety %",
         "Value": round(snap.margin_of_safety * 100, 2) if snap.margin_of_safety is not None else None},
        {"Field": "FCF Growth Assumption %",
         "Value": round(snap.avg_fcf_growth * 100, 2) if snap.avg_fcf_growth is not None else None},
    ]
    df_summary = pd.DataFrame(summary_rows)

    # ── Sheet 2: Ratios
    ratio_rows: list[dict] = []
    for m in RETURN_RATIOS + SOLVENCY_RATIOS:
        v = snap.ratios.get(m)
        ratio_rows.append({
            "Metric": m,
            "Latest Value": v,
            "Threshold": QUALITY_THRESHOLDS.get(m),
            "Direction": "higher" if m in HIGHER_IS_BETTER else "lower",
        })
    df_ratios = pd.DataFrame(ratio_rows)

    # ── Sheet 3: Per-share
    ps_rows: list[dict] = []
    for m in PER_SHARE_METRICS:
        ps_rows.append({
            "Metric": m,
            "Latest Value": snap.per_share.get(m),
            "YoY Growth %": (round(snap.per_share_growth.get(m) * 100, 2)
                             if snap.per_share_growth.get(m) is not None else None),
        })
    df_ps = pd.DataFrame(ps_rows)

    # ── Sheet 4: Cash generation history
    cash_rows: list[dict] = []
    for y in years:
        cash_rows.append({
            "Year": y,
            "NOPAT": snap.nopat_history.get(y),
            "Operating Cash Flow": snap.ocf_history.get(y),
            "Free Cash Flow": snap.fcf_history.get(y),
        })
    df_cash = pd.DataFrame(cash_rows)

    # ── Sheets 5-6: Horizontal analysis (income + balance + cashflow + per-share)
    df_horiz_inc = _table("Income Statement — YoY % Change", snap.horizontal_income, as_pct=True)
    df_horiz_bs = _table("Balance Sheet — YoY % Change", snap.horizontal_balance, as_pct=True)
    df_horiz_cf = _table("Cash Flow — YoY % Change", snap.horizontal_cashflow, as_pct=True)
    df_horiz_ps = _table("Per-Share — YoY % Change", snap.horizontal_per_share, as_pct=True)

    # ── Sheets 7-8: Vertical analysis
    df_vert_inc = _table("Income Statement — % of Revenue", snap.vertical_income, as_pct=True)
    df_vert_bs = _table("Balance Sheet — % of Total Assets", snap.vertical_balance, as_pct=True)

    # ── Sheet 9: Strengths + Weaknesses
    verdict_rows: list[dict] = []
    for s in snap.strengths:
        verdict_rows.append({"Category": "Strength", "Detail": s})
    for w in snap.weaknesses:
        verdict_rows.append({"Category": "Weakness", "Detail": w})
    df_verdict = pd.DataFrame(verdict_rows) if verdict_rows else pd.DataFrame(
        [{"Category": "(no data)", "Detail": ""}]
    )

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df_summary.to_excel(writer, sheet_name="Summary", index=False)
        df_ratios.to_excel(writer, sheet_name="Ratios", index=False)
        df_ps.to_excel(writer, sheet_name="Per Share", index=False)
        df_cash.to_excel(writer, sheet_name="Cash Generation", index=False)
        df_horiz_inc.to_excel(writer, sheet_name="Horizontal Income", index=False)
        df_horiz_bs.to_excel(writer, sheet_name="Horizontal Balance", index=False)
        df_horiz_cf.to_excel(writer, sheet_name="Horizontal Cash Flow", index=False)
        df_horiz_ps.to_excel(writer, sheet_name="Horizontal Per Share", index=False)
        df_vert_inc.to_excel(writer, sheet_name="Vertical Income", index=False)
        df_vert_bs.to_excel(writer, sheet_name="Vertical Balance", index=False)
        df_verdict.to_excel(writer, sheet_name="Strengths & Weaknesses", index=False)

        for sheet_name in writer.sheets:
            ws = writer.sheets[sheet_name]
            for cell in ws[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal="center", wrap_text=True)
            ws.row_dimensions[1].height = 26
            for col in ws.columns:
                width = max((len(str(c.value)) for c in col if c.value is not None), default=0)
                ws.column_dimensions[get_column_letter(col[0].column)].width = min(width + 3, 32)
            ws.freeze_panes = "B2"

    log.info("  Saved: %s", output_path)


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Individual company valuation from financials.db."
    )
    parser.add_argument("ticker", help="Ticker symbol (e.g. AAPL).")
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
    rows = load_ticker_rows(db, args.ticker)
    if not rows:
        log.info("No data found for ticker %s in %s.", args.ticker.upper(), args.db)
        return

    snap = build_individual_snapshot(args.ticker, rows, db=db)
    if snap is None:
        log.info("Could not build snapshot for %s.", args.ticker.upper())
        return

    print_snapshot(snap)

    if not args.no_excel:
        out_path = Path(args.output_dir) / f"individual_{_safe_sheet_name(snap.ticker)}.xlsx"
        export_excel(snap, str(out_path))


if __name__ == "__main__":
    main()
