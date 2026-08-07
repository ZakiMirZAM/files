"""
financial_db.py

Core system for:
  1. Ingesting Excel sheets (your exact format) into a SQLite database
  2. Daily updates for new fiscal years via yfinance
  3. TTM (trailing twelve months) retrieval via yfinance
  4. A query API that mirrors yfinance's interface

Excel format assumed:
  A1       = Year label
  Row 2    = Column headers (Ticker, Name, Sector, ... all metrics)
  A3+      = Ticker column; data starts at B3

Usage:
  from financial_db import FinancialDB
  db = FinancialDB("financials.db")
  db.ingest_excel("AAPL.xlsx")          # one-time load
  db.update_all()                        # run daily
  df = db.get("AAPL")                    # all historical years
  df = db.get("AAPL", year=2023)         # specific year
  ttm = db.get_ttm("AAPL")              # live TTM via yfinance
  val = db.get_metric("AAPL", "Revenue", year=2022)
"""

import sqlite3
import os
import time
import warnings
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, date
from pathlib import Path

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------

EXCEL_COLUMNS = [
    "Ticker", "Name", "Sector", "Industry", "Date", "Revenue",
    "Reported Currency", "Period", "Cik", "Filling Date", "Accepted Date",
    "Calendar Year", "Cost Of Revenue", "Gross Profit", "Gross Profit Ratio",
    "Research And Development Expenses", "General And Administrative Expenses",
    "Selling And Marketing Expenses", "Other Expenses", "Operating Expenses",
    "Cost And Expenses", "Interest Expense", "Depreciation And Amortization",
    "EBITDA", "EBITDA Ratio", "Operating Income", "Operating Income Ratio",
    "Total Other Income Expenses Net", "Income Before Tax",
    "Income Before Tax Ratio", "Income Tax Expense", "Interest Income",
    "Net Income", "Net Income Ratio", "EPS", "EPS Diluted",
    "Weighted Average Shs Out", "Weighted Average Shs Out Dil",
    "Selling General And Administrative Expenses", "Cash And Cash Equivalents",
    "Capital Lease Obligations", "Short Term Investments",
    "Cash And Short Term Investments", "Net Receivables", "Inventory",
    "Other Current Assets", "Total Current Assets",
    "Property Plant Equipment Net", "Goodwill", "Intangible Assets",
    "Goodwill And Intangible Assets", "Long Term Investments", "Tax Assets",
    "Other Non Current Assets", "Total Non Current Assets", "Other Assets",
    "Total Assets", "Account Payables", "Short Term Debt", "Tax Payables",
    "Deferred Revenue", "Other Current Liabilities", "Total Current Liabilities",
    "Long Term Debt", "Deferred Revenue Non Current",
    "Deferred Tax Liabilities Non Current", "Other Non Current Liabilities",
    "Total Non Current Liabilities", "Other Liabilities", "Total Liabilities",
    "Minority Interest", "Total Equity", "Total Liabilities and Total Equity",
    "Common Stock", "Preferred Stock", "Retained Earnings",
    "Accumulated Other Comprehensive Income Loss", "Other Total Stockholders Equity",
    "Total Stockholders Equity", "Total Liabilities And Stockholders Equity",
    "Total Investments", "Total Debt", "Net Debt", "Minority Interest Preferred Stock",
    "Deferred Income Tax", "Net Income Cashflow",
    "Depreciation and Amortization Cashflow", "Stock Based Compensation",
    "Change In Working Capital", "Accounts Receivables", "Accounts Payables",
    "Other Working Capital", "Other Non Cash Items",
    "Net Cash Provided By Operating Activities",
    "Investments In Property Plant And Equipment", "Acquisitions Net",
    "Purchases Of Investments", "Sales Maturities Of Investments",
    "Other Investing Activities", "Net Cash Used For Investing Activities",
    "Debt Repayment", "Common Stock Issued", "Common Stock Repurchased",
    "Dividends Paid", "Other Financing Activities",
    "Net Cash Used Provided By Financing Activities",
    "Effect Of Forex Changes On Cash", "Net Change In Cash",
    "Cash At End Of Period", "Cash At Beginning Of Period",
    "Operating Cash Flow", "Capital Expenditure", "Free Cash Flow",
    "Inventory Cashflow", "Revenue Per Share", "Net Income Per Share",
    "Operating Cash Flow Per Share", "Free Cash Flow Per Share", "Cash Per Share",
    "Book Value Per Share", "Tangible Book Value Per Share",
    "Shareholders Equity Per Share", "Interest Debt Per Share", "Market Cap",
    "Enterprise Value", "PE Ratio", "Price To Sales Ratio", "POCF Ratio",
    "PFCF Ratio", "PB Ratio", "PTB Ratio", "EV To Sales",
    "Enterprise Value Over EBITDA", "EV To Operating Cash Flow",
    "EV To Free Cash Flow", "Earnings Yield", "Free Cash Flow Yield",
    "Debt To Equity", "Debt To Assets", "Net Debt To EBITDA", "Current Ratio",
    "Interest Coverage", "Income Quality", "Dividend Yield", "Payout Ratio",
    "Sales General And Administrative To Revenue",
    "Research And Development To Revenue", "Intangibles To Total Assets",
    "Capex To Operating Cash Flow", "Capex To Revenue", "Capex To Depreciation",
    "Stock Based Compensation To Revenue", "Graham Number", "ROIC",
    "Return On Tangible Assets", "Graham Net Net", "Working Capital",
    "Tangible Asset Value", "Net Current Asset Value", "Average Receivables",
    "Average Payables", "Average Inventory", "Days Sales Outstanding",
    "Days Payables Outstanding", "Days Of Inventory On Hand",
    "Receivables Turnover", "Payables Turnover", "Inventory Turnover", "ROE",
    "Capex Per Share", "Dividend", "Revenue Growth", "Gross Profit Growth",
    "EBIT growth", "Operating Income Growth", "Net Income Growth", "EPS Growth",
    "EPS Diluted Growth", "Weighted Average Shares Growth",
    "Weighted Average Shares Diluted Growth", "Dividends Per Share Growth",
    "Operating Cash Flow Growth", "Free Cash Flow Growth",
    "Ten Y Revenue Growth Per Share", "Five Y Revenue Growth Per Share",
    "Three Y Revenue Growth Per Share", "Ten Y Operating CF Growth Per Share",
    "Five Y Operating CF Growth Per Share", "Three Y Operating CF Growth Per Share",
    "Ten Y Net Income Growth Per Share", "Five Y Net Income Growth Per Share",
    "Three Y Net Income Growth Per Share",
    "Ten Y Shareholders Equity Growth Per Share",
    "Five Y Shareholders Equity Growth Per Share",
    "Three Y Shareholders Equity Growth Per Share",
    "Ten Y Dividend Per Share Growth Per Share",
    "Five Y Dividend Per Share Growth Per Share",
    "Three Y Dividend Per Share Growth Per Share",
    "Receivables Growth", "Inventory Growth", "Asset Growth",
    "Book Value per Share Growth", "Debt Growth", "RD Expense Growth",
    "SGA Expenses Growth"
]

# ── Ingest validation (Phase 1 remediation) ──────────────────────────────────
# The 2026-05-26 Wisesheets ingest wrote ~13k rows whose Calendar Year/Period
# held error strings ('Unavailable', '2025 data not available yet.'). Every
# ingest path must gate on this so junk never re-enters the warehouse.

MIN_VALID_YEAR = 1990
MAX_VALID_YEAR = 2035
VALID_PERIODS = {"FY", "Q1", "Q2", "Q3", "Q4", "TTM"}


def is_valid_year_period(year, period=None) -> bool:
    """True when `year` parses to a plausible fiscal year (4 digits,
    1990-2035) and `period`, if given, is a known tag (FY/Q1-Q4/TTM)."""
    s = str(year).strip() if year is not None else ""
    if len(s) != 4 or not s.isdigit():
        return False
    if not (MIN_VALID_YEAR <= int(s) <= MAX_VALID_YEAR):
        return False
    if period is not None and str(period).strip() not in VALID_PERIODS:
        return False
    return True


# Metrics yfinance can supply for annual/TTM updates
# Maps our column name -> yfinance key (income_stmt, balance_sheet, cashflow)
YF_INCOME_MAP = {
    "Revenue":                          "Total Revenue",
    "Cost Of Revenue":                  "Cost Of Revenue",
    "Gross Profit":                     "Gross Profit",
    "Research And Development Expenses":"Research And Development",
    "General And Administrative Expenses": "General And Administrative Expense",
    "Selling And Marketing Expenses":   "Selling And Marketing Expense",
    "Operating Expenses":               "Operating Expense",
    "Operating Income":                 "Operating Income",
    "Interest Expense":                 "Interest Expense",
    "EBITDA":                           "EBITDA",
    "Income Before Tax":                "Pretax Income",
    "Income Tax Expense":               "Tax Provision",
    "Net Income":                       "Net Income",
    "EPS":                              "Basic EPS",
    "EPS Diluted":                      "Diluted EPS",
    "Depreciation And Amortization":    "Reconciled Depreciation",
}

YF_BALANCE_MAP = {
    "Cash And Cash Equivalents":        "Cash And Cash Equivalents",
    "Short Term Investments":           "Other Short Term Investments",
    "Net Receivables":                  "Receivables",
    "Inventory":                        "Inventory",
    "Total Current Assets":             "Current Assets",
    "Property Plant Equipment Net":     "Net PPE",
    "Goodwill":                         "Goodwill",
    "Intangible Assets":                "Other Intangible Assets",
    "Total Assets":                     "Total Assets",
    "Account Payables":                 "Payables And Accrued Expenses",
    "Short Term Debt":                  "Current Debt And Capital Lease Obligation",
    "Total Current Liabilities":        "Current Liabilities",
    "Long Term Debt":                   "Long Term Debt And Capital Lease Obligation",
    "Total Liabilities":                "Total Liabilities Net Minority Interest",
    "Total Equity":                     "Stockholders Equity",
    "Total Stockholders Equity":        "Stockholders Equity",
    "Retained Earnings":                "Retained Earnings",
    "Total Debt":                       "Total Debt",
}

YF_CASHFLOW_MAP = {
    "Operating Cash Flow":              "Operating Cash Flow",
    "Capital Expenditure":              "Capital Expenditure",
    "Free Cash Flow":                   "Free Cash Flow",
    "Depreciation and Amortization Cashflow": "Depreciation And Amortization",
    "Stock Based Compensation":         "Stock Based Compensation",
    "Net Cash Provided By Operating Activities": "Operating Cash Flow",
    "Net Cash Used For Investing Activities":    "Investing Cash Flow",
    "Net Cash Used Provided By Financing Activities": "Financing Cash Flow",
}

# Flow (period-cumulative) columns for Q4 derivation: a full-year value minus the
# first three quarters. Balance-sheet columns are point-in-time snapshots and are
# copied from the FY row instead (see derive_q4).
FLOW_COLUMNS = (
    "Revenue", "Cost Of Revenue", "Gross Profit", "Operating Income",
    "Net Income", "Operating Cash Flow", "Capital Expenditure",
    "Free Cash Flow", "Income Tax Expense", "Interest Expense",
    "Research And Development Expenses",
)


# ---------------------------------------------------------------------------
# CAPM / discount-rate helpers
# ---------------------------------------------------------------------------
# Cost-of-equity model used by all three DCFs (individual, comparative,
# industry/sector). When a ticker's beta is unknown we fall back to a flat
# 10% WACC, which is the historical default and matches Rf + 1.0 * ERP under
# the constants below.

# Fallbacks only — the risk-free rate is fetched live per request from FRED
# (10-year Treasury, DGS10). The ERP is a FIXED 4.5% interim anchor (see
# api.get_live_wacc_params / FIXED_EQUITY_RISK_PREMIUM): a defensible mature-market
# premium (historical US stock-over-Treasury excess return is 3–5%), pending a
# true implied ERP from S&P 500 earnings. These constants are the fallbacks.
RISK_FREE_RATE     = 0.045   # fallback ~10-year US Treasury
EQUITY_RISK_PREMIUM = 0.045  # fixed interim ERP — keep in sync with FIXED_EQUITY_RISK_PREMIUM
DEFAULT_WACC        = 0.10   # cost-of-equity fallback when beta is unavailable


def capm_discount_rate(beta: float | None,
                       rf: float | None = None,
                       erp: float | None = None,
                       *,
                       market_fallback: bool = False) -> float:
    """CAPM cost of equity: Rf + beta * ERP. The single CAPM implementation —
    every cost-of-equity in the app must route through here so the no-beta
    policy is one documented decision, not four.

    Beta is NOT clamped (per the valuation spec — a real measured beta, however
    extreme, is used as-is). ``rf``/``erp`` accept the live values; when None
    they fall back to the module constants.

    No-beta policy: with ``market_fallback=True`` (the Damodaran-engine policy)
    a missing beta means the market's own cost of equity, beta = 1, so the rate
    still moves with the live rf/erp instead of freezing at a flat constant.
    The default (``False``) preserves the legacy flat DEFAULT_WACC fallback for
    the pre-rebuild code paths, which must stay byte-identical under
    VALUATION_ENGINE=legacy."""
    rf = RISK_FREE_RATE if rf is None else rf
    erp = EQUITY_RISK_PREMIUM if erp is None else erp
    if beta is None:
        return (rf + erp) if market_fallback else DEFAULT_WACC
    try:
        b = float(beta)
    except (TypeError, ValueError):
        return (rf + erp) if market_fallback else DEFAULT_WACC
    return rf + b * erp


# ── Regression beta (yfinance) ──────────────────────────────────────────────
# Cached S&P 500 monthly-return series, reused across tickers within a process
# so a 560-ticker comparative run downloads the market series only once.
_MARKET_RETURNS_CACHE: dict[str, "pd.Series | None"] = {}


def _yf_monthly_returns(ticker: str, period: str = "5y") -> "pd.Series | None":
    """Monthly % returns for ``ticker`` over ``period`` (auto-adjusted closes)."""
    try:
        data = yf.download(ticker, period=period, interval="1mo",
                           progress=False, auto_adjust=True)
    except Exception:
        return None
    if data is None or len(data) == 0 or "Close" not in data:
        return None
    close = data["Close"]
    if hasattr(close, "columns"):          # DataFrame / MultiIndex → first column
        close = close.iloc[:, 0]
    rets = close.pct_change().dropna()
    return rets if len(rets) >= 24 else None


def _market_monthly_returns(market: str = "^SP500TR") -> "pd.Series | None":
    # Total-return S&P 500 by default (dividends included, matching Damodaran's
    # return formula). Falls back to the price-only ^GSPC if it is unavailable.
    if market not in _MARKET_RETURNS_CACHE:
        s = _yf_monthly_returns(market)
        if s is None and market != "^GSPC":
            s = _yf_monthly_returns("^GSPC")
        _MARKET_RETURNS_CACHE[market] = s
    return _MARKET_RETURNS_CACHE[market]


def compute_beta_yf(ticker: str, market: str = "^GSPC") -> float | None:
    """Regression beta = Cov(stock, market) / Var(market) on ~5y of monthly
    returns vs the S&P 500. Not clamped. Returns None if data is insufficient.
    This is Damodaran's regression-beta method (slope of stock returns on the
    market index)."""
    stock = _yf_monthly_returns(ticker)
    mkt = _market_monthly_returns(market)
    if stock is None or mkt is None:
        return None
    df = pd.concat([stock, mkt], axis=1, join="inner").dropna()
    if len(df) < 24:
        return None
    s = df.iloc[:, 0].to_numpy(dtype=float)
    m = df.iloc[:, 1].to_numpy(dtype=float)
    var = float(np.var(m, ddof=1))
    if var == 0:
        return None
    beta = float(np.cov(s, m, ddof=1)[0, 1] / var)
    return round(beta, 4) if np.isfinite(beta) else None


def compute_peg_yf(ticker: str) -> float | None:
    """Forward PEG from yfinance. financials.db has no PEG column, so it is pulled
    (and persisted) here. Prefers ``trailingPegRatio`` (current yfinance field),
    falling back to the legacy ``pegRatio``. Returns None on any failure or a
    non-finite value. This is a point-in-time figure; daily_update can refresh it."""
    try:
        info = yf.Ticker(ticker).info
    except Exception:
        return None
    if not info:
        return None
    for key in ("trailingPegRatio", "pegRatio"):
        v = info.get(key)
        try:
            if v is not None:
                f = float(v)
                if f == f:  # NaN-safe (NaN != NaN), avoids a math import
                    return round(f, 4)
        except (TypeError, ValueError):
            continue
    return None


# Live price is a spot quote — NOT persisted to the DB (it changes daily). A short
# in-memory TTL cache keeps the per-page burst (FCFF + RI + DDM + FCFE + legacy DCF
# all ask for the same ticker's price) down to a single network call.
_PRICE_CACHE: dict[str, tuple[float, float]] = {}   # ticker -> (price, fetched_at)
_PRICE_TTL_SECONDS = 900  # 15 minutes

# Live market cap is likewise a spot value (price × shares). Same short in-memory
# TTL cache so the comparative scorecard's bounded set of tickers costs one quote
# each, and a repeated render inside the window costs zero.
_MARKETCAP_CACHE: dict[str, tuple[float, float]] = {}  # ticker -> (market_cap, fetched_at)
_MARKETCAP_TTL_SECONDS = 900  # 15 minutes


def fetch_latest_market_cap_yf(ticker: str) -> float | None:
    """Most recent market cap for ``ticker`` from yfinance. Tries ``fast_info``
    first (cheap), then falls back to the heavier ``.info`` payload. Cached
    in-memory for 15 min. Returns None on any failure so callers fall back to the
    stored financials.db Market Cap (the prior, filing-date value)."""
    key = ticker.upper()
    hit = _MARKETCAP_CACHE.get(key)
    if hit is not None and (time.time() - hit[1]) < _MARKETCAP_TTL_SECONDS:
        return hit[0]

    cap: float | None = None
    try:
        fi = yf.Ticker(key).fast_info
        for attr in ("market_cap", "marketCap"):
            try:
                v = fi[attr] if hasattr(fi, "__getitem__") else getattr(fi, attr, None)
            except (KeyError, TypeError):
                v = getattr(fi, attr, None)
            if v is not None and float(v) > 0:
                cap = float(v)
                break
    except Exception:  # noqa: BLE001 — never let a quote fetch break a scorecard
        cap = None

    if cap is None:
        try:
            v = yf.Ticker(key).info.get("marketCap")
            if v is not None and float(v) > 0:
                cap = float(v)
        except Exception:  # noqa: BLE001
            cap = None

    if cap is not None:
        _MARKETCAP_CACHE[key] = (cap, time.time())
    return cap


def fetch_latest_price_yf(ticker: str) -> float | None:
    """Most recent market price for ``ticker`` from yfinance, for the intrinsic-
    vs-price margin-of-safety comparison. Tries the intraday last price first
    (``fast_info``), then the latest daily close. Cached in-memory for 15 min.
    Returns None on any failure so callers fall back to Market Cap / shares."""
    key = ticker.upper()
    hit = _PRICE_CACHE.get(key)
    if hit is not None and (time.time() - hit[1]) < _PRICE_TTL_SECONDS:
        return hit[0]

    price: float | None = None
    try:
        fi = yf.Ticker(key).fast_info
        for attr in ("last_price", "lastPrice"):
            try:
                v = fi[attr] if hasattr(fi, "__getitem__") else getattr(fi, attr, None)
            except (KeyError, TypeError):
                v = getattr(fi, attr, None)
            if v is not None and float(v) > 0:
                price = float(v)
                break
    except Exception:  # noqa: BLE001 — never let a quote fetch break valuation
        price = None

    if price is None:
        try:
            hist = yf.Ticker(key).history(period="5d")
            if hist is not None and len(hist) and "Close" in hist:
                v = float(hist["Close"].iloc[-1])
                if v > 0:
                    price = v
        except Exception:  # noqa: BLE001
            price = None

    if price is not None:
        _PRICE_CACHE[key] = (price, time.time())
    return price


# ---------------------------------------------------------------------------
# FinancialDB
# ---------------------------------------------------------------------------

class FinancialDB:
    """
    SQLite-backed store for annual financial data.
    Mirrors a yfinance-like query interface and supports live TTM data.
    """

    def __init__(self, db_path: str = "financials.db"):
        self.db_path = db_path
        self._init_db()

    # ------------------------------------------------------------------
    # DB setup
    # ------------------------------------------------------------------

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def get_beta(self, ticker: str) -> float | None:
        """Return the cached beta for ``ticker`` (from the tickers table) or
        None if the column is empty or the ticker is unknown. Used by the
        DCF modules to derive a CAPM-based discount rate per ticker."""
        with self._connect() as conn:
            row = conn.execute(
                'SELECT beta FROM tickers WHERE ticker = ?',
                [ticker.upper()],
            ).fetchone()
        if not row:
            return None
        try:
            return float(row[0]) if row[0] is not None else None
        except (TypeError, ValueError):
            return None

    def set_beta(self, ticker: str, beta: float) -> None:
        """Persist a (computed) beta back into the tickers table."""
        with self._connect() as conn:
            conn.execute('UPDATE tickers SET beta = ? WHERE ticker = ?',
                         [float(beta), ticker.upper()])
            conn.commit()

    def get_or_compute_beta(self, ticker: str) -> float | None:
        """Return the stored beta for ``ticker`` (from ``tickers.beta``), or None.

        Betas are sourced from beta.csv via ``import_betas_from_csv`` — they are
        NOT computed from yfinance anymore. Kept under this name so existing
        callers (individual analysis, comparative snapshots) are unchanged; a
        ticker with no stored beta returns None and the caller falls back to the
        default-WACC beta."""
        return self.get_beta(ticker)

    def get_beta_history(self, ticker: str) -> dict[int, float]:
        """Precomputed rolling beta by year (see data/compute_beta_history.py).
        Empty dict if the table has not been built or the ticker is missing."""
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT year, beta FROM beta_history WHERE ticker = ? ORDER BY year",
                    [ticker.upper()],
                ).fetchall()
        except sqlite3.OperationalError:
            return {}
        out: dict[int, float] = {}
        for y, b in rows:
            if b is not None:
                out[int(y)] = float(b)
        return out

    def get_industry_beta_history(self, industry: str) -> dict[int, float]:
        """Precomputed per-year UNLEVERED bottom-up industry beta (see
        data/compute_industry_beta.py). Empty dict if the table is missing or the
        industry has too few firms. Callers relever this at the firm's own D/E."""
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT year, unlevered_beta FROM industry_beta_history "
                    "WHERE industry = ? ORDER BY year",
                    [industry],
                ).fetchall()
        except sqlite3.OperationalError:
            return {}
        out: dict[int, float] = {}
        for y, b in rows:
            if b is not None:
                out[int(y)] = float(b)
        return out

    def get_peg(self, ticker: str) -> float | None:
        """Return the cached forward PEG for ``ticker`` (tickers table) or None."""
        with self._connect() as conn:
            try:
                row = conn.execute(
                    'SELECT peg FROM tickers WHERE ticker = ?', [ticker.upper()],
                ).fetchone()
            except sqlite3.OperationalError:
                return None  # column not yet migrated
        if not row:
            return None
        try:
            return float(row[0]) if row[0] is not None else None
        except (TypeError, ValueError):
            return None

    def set_peg(self, ticker: str, peg: float) -> None:
        """Persist a (fetched) PEG back into the tickers table."""
        with self._connect() as conn:
            conn.execute('UPDATE tickers SET peg = ? WHERE ticker = ?',
                         [float(peg), ticker.upper()])
            conn.commit()

    def get_or_compute_peg(self, ticker: str) -> float | None:
        """Return the DB PEG if present; otherwise fetch it from yfinance and
        persist it, mirroring ``get_or_compute_beta``."""
        cached = self.get_peg(ticker)
        if cached is not None:
            return cached
        peg = compute_peg_yf(ticker)
        if peg is not None:
            try:
                self.set_peg(ticker, peg)
            except Exception:
                pass
        return peg

    def get_latest_price(self, ticker: str) -> float | None:
        """Most recent market price from yfinance, for the intrinsic-vs-price
        margin-of-safety comparison. Unlike beta/PEG this is a spot quote and is
        NOT persisted (it changes daily); it is cached in-memory for 15 min.
        Returns None when offline so the valuation falls back to Market Cap /
        shares (the prior, stale filing-date price)."""
        return fetch_latest_price_yf(ticker)

    def _latest_db_market_cap(self, ticker: str) -> float | None:
        """The most recent non-null stored Market Cap for ``ticker`` — the
        offline fallback for ``get_latest_market_cap``."""
        try:
            with self._connect() as conn:
                row = conn.execute(
                    'SELECT "Market Cap" FROM financials '
                    'WHERE Ticker = ? AND "Market Cap" IS NOT NULL '
                    'ORDER BY CAST("Calendar Year" AS INTEGER) DESC LIMIT 1',
                    (ticker.upper(),),
                ).fetchone()
            return float(row[0]) if row and row[0] is not None else None
        except Exception:  # noqa: BLE001
            return None

    def get_latest_market_cap(self, ticker: str) -> float | None:
        """Most recent market cap — yfinance FIRST (cached spot value), then the
        stored financials.db Market Cap if yfinance has none. This is the
        up-to-date weight for the bounded comparative scorecard; the DB fallback
        keeps it working offline and for tickers yfinance cannot price."""
        cap = fetch_latest_market_cap_yf(ticker)
        if cap is not None:
            return cap
        return self._latest_db_market_cap(ticker)

    def refresh_market_caps(
        self, tickers: list[str] | None = None, verbose: bool = True
    ) -> dict:
        """yfinance-FIRST refresh of the stored Market Cap for the latest year of
        each ticker, so the market-cap-weighted sector/industry scorecards (which
        weight in bulk SQL over the whole universe) read up-to-date caps without a
        per-request network fan-out. A ticker yfinance cannot price keeps its
        existing (filing-date) value — the DB fallback. Intended to be driven by
        the same scheduled refresh that runs ``update_all``."""
        with self._connect() as conn:
            if tickers is None:
                tickers = [
                    r[0] for r in conn.execute("SELECT DISTINCT Ticker FROM financials")
                ]
            updated = 0
            skipped = 0
            for tk in tickers:
                cap = fetch_latest_market_cap_yf(tk)
                if cap is None:
                    skipped += 1
                    continue
                yr = conn.execute(
                    'SELECT MAX(CAST("Calendar Year" AS INTEGER)) FROM financials '
                    "WHERE Ticker = ? AND \"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'",
                    (tk,),
                ).fetchone()
                if not yr or yr[0] is None:
                    skipped += 1
                    continue
                conn.execute(
                    'UPDATE financials SET "Market Cap" = ? '
                    'WHERE Ticker = ? AND CAST("Calendar Year" AS INTEGER) = ?',
                    (cap, tk, int(yr[0])),
                )
                updated += 1
                if verbose and updated % 100 == 0:
                    print(f"  [market-cap] {updated} refreshed…", flush=True)
            conn.commit()
        if verbose:
            print(
                f"  [market-cap] done — {updated} refreshed, {skipped} kept DB value",
                flush=True,
            )
        return {"updated": updated, "skipped": skipped, "total": len(tickers)}

    def import_betas_from_csv(self, csv_path: str, verbose: bool = True) -> dict:
        """Import point-in-time betas from a CSV (header ``Ticker,beta``) into the
        ``tickers.beta`` column, REPLACING any existing value. This CSV is the
        source of truth for betas — the comparative leaderboard reads
        ``tickers.beta`` straight from the DB. Rows whose ticker isn't in the DB
        are ignored; rows with an unparseable beta are skipped."""
        import csv as _csv  # local import: keep module load lightweight

        updated = 0
        skipped = 0
        with self._connect() as conn:
            # utf-8-sig strips a leading BOM so the "Ticker" header parses cleanly.
            with open(csv_path, newline="", encoding="utf-8-sig") as fh:
                reader = _csv.DictReader(fh)
                fields = {(f or "").strip().lower(): f for f in (reader.fieldnames or [])}
                tcol = fields.get("ticker")
                bcol = fields.get("beta")
                if tcol is None or bcol is None:
                    raise ValueError(
                        f"{csv_path}: expected 'Ticker' and 'beta' columns, got {reader.fieldnames}"
                    )
                for row in reader:
                    ticker = (row.get(tcol) or "").strip().upper()
                    raw = (row.get(bcol) or "").strip()
                    if not ticker or not raw:
                        skipped += 1
                        continue
                    try:
                        beta = float(raw)
                    except (TypeError, ValueError):
                        skipped += 1
                        continue
                    cur = conn.execute(
                        "UPDATE tickers SET beta = ? WHERE ticker = ?", (beta, ticker)
                    )
                    if cur.rowcount > 0:
                        updated += 1
                    else:
                        skipped += 1  # ticker present in CSV but not in the DB
                    if verbose and (updated + skipped) % 2000 == 0:
                        print(f"  [beta-import] {updated + skipped} rows processed…", flush=True)
            conn.commit()
        if verbose:
            print(
                f"  [beta-import] done — {updated} betas replaced, "
                f"{skipped} rows skipped/unmatched",
                flush=True,
            )
        return {"updated": updated, "skipped": skipped}

    def _init_db(self):
        with self._connect() as conn:
            cols_sql = ",\n  ".join(
                f'"{c}" TEXT' if c in ("Ticker", "Name", "Sector", "Industry",
                                        "Date", "Reported Currency", "Period",
                                        "Cik", "Filling Date", "Accepted Date")
                else f'"{c}" REAL'
                for c in EXCEL_COLUMNS
                if c not in ("Ticker", "Calendar Year")
            )
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS financials (
                  Ticker TEXT NOT NULL,
                  "Calendar Year" INTEGER NOT NULL,
                  {cols_sql},
                  last_updated TEXT,
                  PRIMARY KEY (Ticker, "Calendar Year")
                )
            """)

            # Quarterly + TTM store. Same columns as `financials` but keyed by
            # (Ticker, Calendar Year, Period) so Q1-Q4/TTM rows coexist with the
            # annual (FY) warehouse without touching it. Period is a NOT NULL PK
            # column here, so it is declared explicitly and excluded from the
            # generated column list. Created on every init so existing DBs gain
            # the table too.
            q_cols_sql = ",\n  ".join(
                f'"{c}" TEXT' if c in ("Name", "Sector", "Industry", "Date",
                                        "Reported Currency", "Cik",
                                        "Filling Date", "Accepted Date")
                else f'"{c}" REAL'
                for c in EXCEL_COLUMNS
                if c not in ("Ticker", "Calendar Year", "Period")
            )
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS financials_quarterly (
                  Ticker TEXT NOT NULL,
                  "Calendar Year" INTEGER NOT NULL,
                  Period TEXT NOT NULL,
                  {q_cols_sql},
                  last_updated TEXT,
                  PRIMARY KEY (Ticker, "Calendar Year", Period)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS tickers (
                  ticker TEXT PRIMARY KEY,
                  name TEXT,
                  sector TEXT,
                  industry TEXT,
                  last_updated TEXT
                )
            """)

            # Market-level aggregates computed weekly (one row per run → an
            # accumulating time series). Powers the earnings-yield vs Treasury
            # ("Fed model") comparison on the economic page.
            conn.execute("""
                CREATE TABLE IF NOT EXISTS market_aggregates (
                  computed_date TEXT PRIMARY KEY,
                  market_pe REAL,
                  earnings_yield REAL,
                  n_constituents INTEGER,
                  method TEXT,
                  computed_at TEXT
                )
            """)

            # Currency → USD conversion rates, so market caps (and other absolute
            # figures) reported in different currencies can be compared like-for-like
            # — e.g. ranking a peer set by size. `usd_per_unit` is the USD value of
            # one unit of `currency` (USD = 1.0). Populated by refresh_fx_rates().
            conn.execute("""
                CREATE TABLE IF NOT EXISTS fx_rates (
                  currency TEXT PRIMARY KEY,
                  usd_per_unit REAL NOT NULL,
                  asof TEXT NOT NULL
                )
            """)

            # Per-YEAR FX, so a historical market cap converts at the rate that
            # applied when it was measured (a 2016 JPY cap at the 2026 rate
            # understates the filer by ~28%). Populated by
            # remediation/fx_history.py. Created here so the weighted-average
            # SQL, which JOINs it unconditionally, never hits a missing table.
            conn.execute("""
                CREATE TABLE IF NOT EXISTS fx_rates_hist (
                  currency     TEXT    NOT NULL,
                  year         INTEGER NOT NULL,
                  usd_per_unit REAL    NOT NULL,
                  asof         TEXT,
                  PRIMARY KEY (currency, year)
                )
            """)

            # Defensive ALTERs for newer ticker-level columns. Idempotent —
            # PRAGMA table_info skips columns that already exist. Lets daily
            # yfinance updates populate Exchange/Country/Beta without needing
            # a separate migration step.
            existing_tickers = {
                r[1] for r in conn.execute("PRAGMA table_info(tickers)")
            }
            for col in ("exchange", "country", "beta", "peg"):
                if col not in existing_tickers:
                    sql_type = "REAL" if col in ("beta", "peg") else "TEXT"
                    conn.execute(f"ALTER TABLE tickers ADD COLUMN {col} {sql_type}")

            conn.commit()

    # ------------------------------------------------------------------
    # FX rates (currency → USD) for like-for-like size comparisons
    # ------------------------------------------------------------------

    def refresh_fx_rates(self, verbose: bool = True) -> int:
        """Fetch a USD conversion rate for every reporting currency present in the
        DB (via yfinance ``{CCY}USD=X``, falling back to the inverse ``USD{CCY}=X``)
        and upsert them into ``fx_rates``. USD is always 1.0. Returns how many rates
        were stored. Currencies that can't be resolved are skipped (left absent), so
        callers can treat a missing rate as "not size-comparable"."""
        with self._connect() as conn:
            currencies = [
                r[0] for r in conn.execute(
                    'SELECT DISTINCT "Reported Currency" FROM financials '
                    'WHERE "Reported Currency" IS NOT NULL '
                    'AND "Reported Currency" NOT IN (\'Unavailable\', \'USD\')'
                ).fetchall()
            ]
        asof = date.today().isoformat()
        rates: dict[str, float] = {"USD": 1.0}
        for ccy in currencies:
            rate = self._fetch_fx_to_usd(ccy)
            if rate is not None and rate > 0:
                rates[ccy] = rate
            elif verbose:
                print(f"  [fx] no rate for {ccy} — skipped", flush=True)
        with self._connect() as conn:
            conn.executemany(
                "INSERT INTO fx_rates(currency, usd_per_unit, asof) VALUES (?, ?, ?) "
                "ON CONFLICT(currency) DO UPDATE SET "
                "  usd_per_unit = excluded.usd_per_unit, asof = excluded.asof",
                [(c, r, asof) for c, r in rates.items()],
            )
            conn.commit()
        if verbose:
            print(f"  [fx] stored {len(rates)} rates ({len(currencies)} non-USD currencies seen)", flush=True)
        return len(rates)

    @staticmethod
    def _fetch_fx_to_usd(ccy: str) -> "float | None":
        """USD value of one unit of ``ccy`` from yfinance, or None."""
        for symbol, invert in ((f"{ccy}USD=X", False), (f"USD{ccy}=X", True)):
            try:
                hist = yf.Ticker(symbol).history(period="5d")
                if hist is None or hist.empty:
                    continue
                close = hist["Close"].dropna()
                if close.empty:
                    continue
                val = float(close.iloc[-1])
                if val > 0:
                    return (1.0 / val) if invert else val
            except Exception:  # noqa: BLE001 — try the inverse / give up
                continue
        return None

    def get_fx_rates(self) -> dict[str, float]:
        """{currency: usd_per_unit} for converting local figures to USD."""
        with self._connect() as conn:
            try:
                return {r[0]: r[1] for r in conn.execute(
                    "SELECT currency, usd_per_unit FROM fx_rates")}
            except sqlite3.OperationalError:
                return {}

    # ------------------------------------------------------------------
    # Excel ingestion
    # ------------------------------------------------------------------

    def ingest_excel(self, filepath: str, verbose: bool = True) -> int:
        """
        Load one Excel file in your format into the database.
        Returns number of rows inserted/updated.
        """
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(filepath)

        wb_dict = pd.read_excel(
            filepath,
            sheet_name=None,
            header=None,
            dtype=str
        )

        total = 0
        for sheet_name, raw in wb_dict.items():
            if raw.shape[0] < 3:
                continue

            # Row 1 (index 1) has column headers
            headers = raw.iloc[1].tolist()

            # Normalize headers to match EXCEL_COLUMNS (case-insensitive strip)
            header_map = {}
            for i, h in enumerate(headers):
                if pd.isna(h):
                    continue
                for col in EXCEL_COLUMNS:
                    if str(h).strip().lower() == col.strip().lower():
                        header_map[i] = col
                        break

            if not header_map:
                continue

            data_rows = raw.iloc[2:]  # Row index 2+ is data

            inserted = 0
            rejected = 0
            with self._connect() as conn:
                for _, row in data_rows.iterrows():
                    record = {}
                    for idx, col_name in header_map.items():
                        val = row.iloc[idx] if idx < len(row) else None
                        if pd.isna(val) or str(val).strip() in ("", "nan", "None"):
                            record[col_name] = None
                        else:
                            record[col_name] = str(val).strip()

                    ticker = record.get("Ticker")
                    cal_year = record.get("Calendar Year")

                    if not ticker or not cal_year:
                        continue

                    if not is_valid_year_period(cal_year, record.get("Period")):
                        rejected += 1
                        continue

                    # Convert numeric fields
                    for col in EXCEL_COLUMNS:
                        if col in ("Ticker", "Name", "Sector", "Industry",
                                   "Date", "Reported Currency", "Period",
                                   "Cik", "Filling Date", "Accepted Date",
                                   "Calendar Year"):
                            continue
                        v = record.get(col)
                        if v is not None:
                            try:
                                record[col] = float(v)
                            except (ValueError, TypeError):
                                record[col] = None

                    record["last_updated"] = datetime.now().isoformat()

                    cols = ["Ticker", "Calendar Year"] + [
                        c for c in EXCEL_COLUMNS if c not in ("Ticker", "Calendar Year")
                    ] + ["last_updated"]

                    vals = [record.get(c) for c in cols]

                    placeholders = ", ".join(["?" for _ in cols])
                    col_sql = ", ".join([f'"{c}"' for c in cols])
                    update_sql = ", ".join([
                        f'"{c}" = excluded."{c}"'
                        for c in cols if c not in ("Ticker", "Calendar Year")
                    ])

                    conn.execute(f"""
                        INSERT INTO financials ({col_sql})
                        VALUES ({placeholders})
                        ON CONFLICT(Ticker, "Calendar Year") DO UPDATE SET {update_sql}
                    """, vals)

                    # Update tickers table
                    conn.execute("""
                        INSERT INTO tickers (ticker, name, sector, industry, last_updated)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET
                          name = excluded.name,
                          sector = excluded.sector,
                          industry = excluded.industry,
                          last_updated = excluded.last_updated
                    """, [
                        ticker,
                        record.get("Name"),
                        record.get("Sector"),
                        record.get("Industry"),
                        datetime.now().isoformat()
                    ])

                    inserted += 1

                conn.commit()

            if verbose:
                msg = f"  Sheet '{sheet_name}': {inserted} rows upserted"
                if rejected:
                    msg += f"  ({rejected} rejected: invalid year/period)"
                print(msg)
            total += inserted

        return total

    def ingest_csv(self, filepath: str, verbose: bool = True) -> int:
        """
        Load one CSV file in your format into the database.

        Expected layout (mirrors ingest_excel):
          Row 1 — metadata (e.g. year in A1). Ignored by the header scan.
          Row 2 — column headers, matched case-insensitively against EXCEL_COLUMNS.
          Row 3+ — data rows.

        Headers not found in EXCEL_COLUMNS are silently dropped. Rows missing
        a Ticker or Calendar Year are skipped. Each surviving row is UPSERTed
        on (Ticker, "Calendar Year"), the same key ingest_excel uses.

        Returns number of rows inserted/updated.
        """
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(filepath)

        # Excel on Windows saves "CSV (Comma delimited)" as cp1252, not UTF-8,
        # so we try a few encodings before giving up. latin-1 never raises
        # UnicodeDecodeError, so it acts as a last-resort fallback that
        # preserves all bytes (round-trippable even for unknown encodings).
        raw = None
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                raw = pd.read_csv(filepath, header=None, dtype=str, encoding=enc)
                break
            except UnicodeDecodeError:
                continue
        if raw is None:
            raise ValueError(f"Could not decode {filepath} with utf-8/cp1252/latin-1")

        if raw.shape[0] < 3:
            if verbose:
                print(f"  {path.name}: fewer than 3 rows, nothing to ingest")
            return 0

        # Row 1 (index 1) has column headers
        headers = raw.iloc[1].tolist()

        # Normalize headers to match EXCEL_COLUMNS (case-insensitive strip)
        header_map = {}
        for i, h in enumerate(headers):
            if pd.isna(h):
                continue
            for col in EXCEL_COLUMNS:
                if str(h).strip().lower() == col.strip().lower():
                    header_map[i] = col
                    break

        if not header_map:
            if verbose:
                print(f"  {path.name}: no recognised headers in row 2")
            return 0

        data_rows = raw.iloc[2:]  # Row index 2+ is data

        inserted = 0
        rejected = 0
        with self._connect() as conn:
            for _, row in data_rows.iterrows():
                record = {}
                for idx, col_name in header_map.items():
                    val = row.iloc[idx] if idx < len(row) else None
                    if pd.isna(val) or str(val).strip() in ("", "nan", "None"):
                        record[col_name] = None
                    else:
                        record[col_name] = str(val).strip()

                ticker = record.get("Ticker")
                cal_year = record.get("Calendar Year")

                if not ticker or not cal_year:
                    continue

                if not is_valid_year_period(cal_year, record.get("Period")):
                    rejected += 1
                    continue

                # Convert numeric fields
                for col in EXCEL_COLUMNS:
                    if col in ("Ticker", "Name", "Sector", "Industry",
                               "Date", "Reported Currency", "Period",
                               "Cik", "Filling Date", "Accepted Date",
                               "Calendar Year"):
                        continue
                    v = record.get(col)
                    if v is not None:
                        try:
                            record[col] = float(v)
                        except (ValueError, TypeError):
                            record[col] = None

                record["last_updated"] = datetime.now().isoformat()

                cols = ["Ticker", "Calendar Year"] + [
                    c for c in EXCEL_COLUMNS if c not in ("Ticker", "Calendar Year")
                ] + ["last_updated"]

                vals = [record.get(c) for c in cols]

                placeholders = ", ".join(["?" for _ in cols])
                col_sql = ", ".join([f'"{c}"' for c in cols])
                update_sql = ", ".join([
                    f'"{c}" = excluded."{c}"'
                    for c in cols if c not in ("Ticker", "Calendar Year")
                ])

                conn.execute(f"""
                    INSERT INTO financials ({col_sql})
                    VALUES ({placeholders})
                    ON CONFLICT(Ticker, "Calendar Year") DO UPDATE SET {update_sql}
                """, vals)

                # Update tickers table
                conn.execute("""
                    INSERT INTO tickers (ticker, name, sector, industry, last_updated)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                      name = excluded.name,
                      sector = excluded.sector,
                      industry = excluded.industry,
                      last_updated = excluded.last_updated
                """, [
                    ticker,
                    record.get("Name"),
                    record.get("Sector"),
                    record.get("Industry"),
                    datetime.now().isoformat()
                ])

                inserted += 1

            conn.commit()

        if verbose:
            msg = f"  {path.name}: {inserted} rows upserted"
            if rejected:
                msg += f"  ({rejected} rejected: invalid year/period)"
            print(msg)

        return inserted

    def ingest_directory(self, folder: str, verbose: bool = True) -> int:
        """Load all .xlsx and .csv files in a folder."""
        folder = Path(folder)
        total = 0
        for f in sorted(folder.iterdir()):
            ext = f.suffix.lower()
            if ext == ".xlsx":
                if verbose:
                    print(f"Ingesting {f.name}...")
                total += self.ingest_excel(str(f), verbose=verbose)
            elif ext == ".csv":
                if verbose:
                    print(f"Ingesting {f.name}...")
                total += self.ingest_csv(str(f), verbose=verbose)
        return total

    # ------------------------------------------------------------------
    # yfinance annual update
    # ------------------------------------------------------------------

    def _fetch_yf_annual(self, ticker: str) -> list[dict]:
        """
        Pull annual financials from yfinance.
        Returns a list of dicts, one per fiscal year reported by yfinance.
        """
        t = yf.Ticker(ticker)
        try:
            inc  = t.income_stmt
            bal  = t.balance_sheet
            cf   = t.cashflow
            info = t.info
        except Exception as e:
            print(f"  yfinance error for {ticker}: {e}")
            return []

        # Collect all fiscal year-end dates yfinance has data for
        yf_years = {}  # year (int) -> fiscal year-end date string
        for df in [inc, bal, cf]:
            if df is not None and not df.empty:
                for col in df.columns:
                    try:
                        dt = pd.to_datetime(col)
                        yf_years[dt.year] = str(col)[:10]
                    except Exception:
                        pass

        if not yf_years:
            return []

        records = []
        for yr in sorted(yf_years):

            fiscal_date = yf_years[yr]

            def get_for_year(df, key, target_yr=yr):
                if df is None or df.empty or key not in df.index:
                    return None
                for col in df.columns:
                    try:
                        if pd.to_datetime(col).year == target_yr:
                            v = df.loc[key, col]
                            return float(v) if pd.notna(v) else None
                    except Exception:
                        pass
                return None

            rec = {
                "Ticker":        ticker.upper(),
                "Calendar Year": yr,
                "Date":          fiscal_date,
                "Period":        "FY",
                "Name":          info.get("longName"),
                "Sector":        info.get("sector"),
                "Industry":      info.get("industry"),
                "Exchange":      info.get("exchange"),
                "Country":       info.get("country"),
                "Beta":          info.get("beta"),
                "last_updated":  datetime.now().isoformat(),
            }

            for our_col, yf_key in YF_INCOME_MAP.items():
                rec[our_col] = get_for_year(inc, yf_key)

            for our_col, yf_key in YF_BALANCE_MAP.items():
                rec[our_col] = get_for_year(bal, yf_key)

            for our_col, yf_key in YF_CASHFLOW_MAP.items():
                if rec.get(our_col) is None:
                    rec[our_col] = get_for_year(cf, yf_key)

            # Derived ratios
            rev   = rec.get("Revenue")
            gp    = rec.get("Gross Profit")
            ni    = rec.get("Net Income")
            oi    = rec.get("Operating Income")
            ocf   = rec.get("Operating Cash Flow")
            capex = rec.get("Capital Expenditure")

            if rev and gp:
                rec["Gross Profit Ratio"] = gp / rev
            if rev and ni:
                rec["Net Income Ratio"] = ni / rev
            if rev and oi:
                rec["Operating Income Ratio"] = oi / rev
            if ocf and capex:
                rec["Free Cash Flow"] = rec.get("Free Cash Flow") or (ocf + capex)

            records.append(rec)

        return records

    def update_ticker(self, ticker: str, verbose: bool = True,
                      fill_gaps: bool = False) -> int:
        """
        Check yfinance for fiscal years not yet in the database and insert them.
        Never modifies rows that already exist -- only adds genuinely new years.

        fill_gaps=True additionally completes NULL columns on EXISTING rows
        from the yfinance data (COALESCE semantics: a stored non-NULL value is
        never overwritten). Default keeps the strict additive-only contract.

        Returns the number of new year-rows inserted (gap fills not counted).
        """
        ticker = ticker.upper()

        # What years do we already have for this ticker?
        with self._connect() as conn:
            existing_years = {
                row[0] for row in conn.execute(
                    'SELECT "Calendar Year" FROM financials WHERE Ticker = ?',
                    [ticker]
                )
            }

        # What years does yfinance now report?
        yf_records = self._fetch_yf_annual(ticker)

        if not yf_records:
            return 0

        # Filter to only years that are not already stored, and gate out any
        # record with an implausible year/period (Phase 1 ingest guard).
        new_records = [
            r for r in yf_records
            if r["Calendar Year"] not in existing_years
            and is_valid_year_period(r["Calendar Year"], r.get("Period"))
        ]

        gap_records = []
        if fill_gaps:
            gap_records = [
                r for r in yf_records
                if r["Calendar Year"] in existing_years
                and is_valid_year_period(r["Calendar Year"], r.get("Period"))
            ]

        if not new_records and not gap_records:
            if verbose:
                print(f"  {ticker}: no new fiscal years found")
            return 0

        # Insert each genuinely new year.
        # Filter rec keys to those actually present as columns in the financials
        # table so that ticker-level metadata (Exchange, Country) carried in rec
        # for the tickers upsert below does not break this INSERT when the
        # financials schema does not yet contain those columns.
        fin_cols = set(EXCEL_COLUMNS) | {"last_updated"}
        with self._connect() as conn:
            for rec in new_records:
                cols = [c for c in rec.keys() if c in fin_cols]
                vals = [rec[c] for c in cols]
                col_sql     = ", ".join([f'"{c}"' for c in cols])
                placeholders = ", ".join(["?" for _ in cols])

                conn.execute(f"""
                    INSERT OR IGNORE INTO financials ({col_sql})
                    VALUES ({placeholders})
                """, vals)

                if verbose:
                    print(f"  {ticker}: added {rec['Calendar Year']} "
                          f"(fiscal year ending {rec.get('Date', 'unknown')})")

            # Complete NULL columns on existing rows (COALESCE keeps every
            # stored non-NULL value; identity/key columns are never touched).
            for rec in gap_records:
                cols = [c for c in rec.keys()
                        if c in fin_cols
                        and c not in ("Ticker", "Calendar Year", "last_updated")
                        and rec[c] is not None]
                if not cols:
                    continue
                set_sql = ", ".join(f'"{c}" = COALESCE("{c}", ?)' for c in cols)
                conn.execute(
                    f'UPDATE financials SET {set_sql}, last_updated = ? '
                    f'WHERE Ticker = ? AND "Calendar Year" = ?',
                    [rec[c] for c in cols]
                    + [datetime.now().isoformat(), ticker, rec["Calendar Year"]])
                if verbose:
                    print(f"  {ticker}: gap-filled {rec['Calendar Year']}")

            # Update tickers table with latest info
            if yf_records:
                latest = yf_records[-1]
                conn.execute("""
                    INSERT INTO tickers (ticker, name, sector, industry,
                                         exchange, country, beta, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                      name         = excluded.name,
                      sector       = excluded.sector,
                      industry     = excluded.industry,
                      exchange     = excluded.exchange,
                      country      = excluded.country,
                      -- Preserve the curated beta (from beta.csv / beta_history);
                      -- only fall back to yfinance's beta when none is stored yet,
                      -- so the daily update can't silently clobber the real beta.
                      beta         = COALESCE(beta, excluded.beta),
                      last_updated = excluded.last_updated
                """, [
                    ticker,
                    latest.get("Name"),
                    latest.get("Sector"),
                    latest.get("Industry"),
                    latest.get("Exchange"),
                    latest.get("Country"),
                    latest.get("Beta"),
                    datetime.now().isoformat()
                ])

            conn.commit()

        return len(new_records)

    def update_all(self, verbose: bool = True, fill_gaps: bool = False) -> dict:
        """
        Run update_ticker for every ticker in the database.
        Only adds new fiscal years -- never overwrites existing data
        (fill_gaps=True additionally completes NULL columns on existing rows).
        Returns a dict of ticker -> number of new years added.
        """
        with self._connect() as conn:
            tickers = [
                row[0] for row in conn.execute(
                    "SELECT DISTINCT ticker FROM tickers ORDER BY ticker"
                )
            ]

        if verbose:
            print(f"Checking {len(tickers)} tickers for new fiscal year data...")

        results = {}
        for t in tickers:
            try:
                n = self.update_ticker(t, verbose=verbose, fill_gaps=fill_gaps)
                results[t] = n
            except Exception as e:
                if verbose:
                    print(f"  {t} failed: {e}")
                results[t] = -1

        new_years_total = sum(v for v in results.values() if v > 0)
        if verbose:
            print(f"Update complete. {new_years_total} new year-rows added across "
                  f"{len(tickers)} tickers.")

        # Refresh the most-recent stored Market Cap from yfinance. update_ticker
        # only ADDS new fiscal years and never overwrites, so without this step
        # the latest row keeps its stale filing-date cap and the market-cap-
        # weighted sector/industry scorecards would weight on stale numbers.
        try:
            self.refresh_market_caps(tickers, verbose=verbose)
        except Exception as e:  # noqa: BLE001 — never let the cap refresh break update_all
            if verbose:
                print(f"  market-cap refresh failed: {e}")

        # Keep currency→USD rates current so cross-currency size comparisons stay
        # accurate (rates drift slowly, so a daily refresh is plenty).
        try:
            self.refresh_fx_rates(verbose=verbose)
        except Exception as e:  # noqa: BLE001 — never let the fx refresh break update_all
            if verbose:
                print(f"  fx-rate refresh failed: {e}")

        return results

    # ------------------------------------------------------------------
    # TTM (trailing twelve months) via yfinance -- never uses DB
    # ------------------------------------------------------------------

    def get_ttm(self, ticker: str) -> dict:
        """
        Pull trailing twelve months data directly from yfinance.
        Returns a flat dict of metric -> value.
        Covers income statement, balance sheet, cash flow, and ratios from info.
        """
        t = yf.Ticker(ticker)
        try:
            inc  = t.quarterly_income_stmt
            bal  = t.quarterly_balance_sheet
            cf   = t.quarterly_cashflow
            info = t.info
        except Exception as e:
            raise RuntimeError(f"yfinance error for {ticker}: {e}")

        def ttm_sum(df, key):
            """Sum the most recent 4 quarters. Returns None unless a genuine
            trailing-twelve-months window is available: the 4 newest quarters must
            exist and span at most ~13 months. A partial (2-3 quarter) sum or a
            gap-spanning window would be a misleading 'TTM', so we refuse it."""
            if df is None or df.empty or key not in df.index:
                return None
            row = df.loc[key].dropna()
            if len(row) < 4:
                return None
            # yfinance columns are period-end dates; sort newest-first explicitly
            # rather than trusting the provider's order.
            try:
                row = row.sort_index(ascending=False)
            except Exception:  # noqa: BLE001 — non-datetime index: fall back to as-is
                pass
            last4 = row.iloc[:4]
            try:
                span_days = (last4.index[0] - last4.index[-1]).days
                if span_days > 400:  # a missing quarter would stretch 4 points past 13 months
                    return None
            except Exception:  # noqa: BLE001 — index not date-like; accept the 4 newest
                pass
            return float(last4.sum())

        def latest(df, key):
            """Most recent quarter value (for balance sheet items)."""
            if df is None or df.empty or key not in df.index:
                return None
            row = df.loc[key].dropna()
            return float(row.iloc[0]) if not row.empty else None

        result = {
            "Ticker":   ticker.upper(),
            "Period":   "TTM",
            "Date":     date.today().isoformat(),
        }

        # Income statement -- sum last 4 quarters
        for our_col, yf_key in YF_INCOME_MAP.items():
            result[our_col] = ttm_sum(inc, yf_key)

        # Balance sheet -- most recent quarter (snapshot)
        for our_col, yf_key in YF_BALANCE_MAP.items():
            result[our_col] = latest(bal, yf_key)

        # Cash flow -- sum last 4 quarters
        for our_col, yf_key in YF_CASHFLOW_MAP.items():
            if result.get(our_col) is None:
                result[our_col] = ttm_sum(cf, yf_key)

        # Additional live metrics from info
        info_fields = {
            "Market Cap":           "marketCap",
            "Enterprise Value":     "enterpriseValue",
            "PE Ratio":             "trailingPE",
            "Price To Sales Ratio": "priceToSalesTrailing12Months",
            "PB Ratio":             "priceToBook",
            "EPS":                  "trailingEps",
            "Dividend Yield":       "dividendYield",
            "Current Ratio":        "currentRatio",
            "Debt To Equity":       "debtToEquity",
            "ROE":                  "returnOnEquity",
            # NOTE: yfinance .info has no reliable ROIC field; the old mapping to
            # "returnOnAssets" populated ROIC with ROA (a different concept). ROIC
            # is left to the computed NOPAT/IC path instead.
            "Operating Cash Flow":  "operatingCashflow",
            "Free Cash Flow":       "freeCashflow",
            "Revenue":              "totalRevenue",
            "Gross Profit":         "grossProfits",
            "EBITDA":               "ebitda",
        }

        for our_col, info_key in info_fields.items():
            if result.get(our_col) is None:
                v = info.get(info_key)
                if v is not None:
                    try:
                        result[our_col] = float(v)
                    except (ValueError, TypeError):
                        pass

        # yfinance reports debtToEquity as a PERCENT (e.g. 152.3 = 1.52x), but the
        # rest of the app stores Debt/Equity as a ratio. Normalise so the TTM row
        # matches the annual rows instead of being ~100x larger.
        if result.get("Debt To Equity") is not None:
            result["Debt To Equity"] = result["Debt To Equity"] / 100.0

        # Derived ratios
        rev = result.get("Revenue")
        gp  = result.get("Gross Profit")
        ni  = result.get("Net Income")
        oi  = result.get("Operating Income")

        if rev and gp:
            result["Gross Profit Ratio"] = gp / rev
        if rev and ni:
            result["Net Income Ratio"] = ni / rev
        if rev and oi:
            result["Operating Income Ratio"] = oi / rev

        ocf   = result.get("Operating Cash Flow")
        capex = result.get("Capital Expenditure")
        ebitda = result.get("EBITDA")

        if ocf and capex:
            result["Free Cash Flow"] = result.get("Free Cash Flow") or (ocf + capex)

        ev = result.get("Enterprise Value")
        if ev and ebitda:
            result["Enterprise Value Over EBITDA"] = ev / ebitda
        if ev and rev:
            result["EV To Sales"] = ev / rev
        if ev and ocf:
            result["EV To Operating Cash Flow"] = ev / ocf

        return result

    # ------------------------------------------------------------------
    # Quarterly + TTM store (financials_quarterly) -- additive, never touches
    # the annual financials warehouse.
    # ------------------------------------------------------------------

    def _fetch_yf_quarterly(self, ticker: str) -> dict:
        """Fetch quarterly income/balance/cashflow statements from yfinance.

        Returned as {'inc': df, 'bal': df, 'cf': df, 'info': dict}. Isolated in
        its own method so tests can monkeypatch it with synthetic frames
        (network-free)."""
        t = yf.Ticker(ticker)
        return {
            "inc":  t.quarterly_income_stmt,
            "bal":  t.quarterly_balance_sheet,
            "cf":   t.quarterly_cashflow,
            "info": t.info,
        }

    def save_quarters(self, ticker: str, verbose: bool = True) -> int:
        """Store one row per fiscal quarter in financials_quarterly.

        Period is 'Q1'..'Q4' assigned by end-date order WITHIN each calendar
        year; Calendar Year is the calendar year of the quarter-end date. Rows
        are additive (INSERT OR IGNORE) and gated by is_valid_year_period.
        Returns the number of rows actually inserted."""
        ticker = ticker.upper()
        try:
            data = self._fetch_yf_quarterly(ticker)
        except Exception as e:  # noqa: BLE001 -- isolate per-ticker fetch failures
            if verbose:
                print(f"  {ticker}: quarterly fetch failed: {e}")
            return 0

        inc, bal, cf = data.get("inc"), data.get("bal"), data.get("cf")

        # Every distinct quarter-end date across the three statements.
        q_dates = set()
        for df in (inc, bal, cf):
            if df is not None and not df.empty:
                for col in df.columns:
                    try:
                        q_dates.add(pd.to_datetime(col))
                    except Exception:  # noqa: BLE001 -- skip non-date columns
                        pass
        if not q_dates:
            return 0

        # Assign Period by end-date order within each calendar year.
        ordered = sorted(q_dates)
        counter: dict[int, int] = {}
        period_by_date: dict = {}
        for dt in ordered:
            counter[dt.year] = counter.get(dt.year, 0) + 1
            period_by_date[dt] = f"Q{min(counter[dt.year], 4)}"

        def val(df, key, target_dt):
            if df is None or df.empty or key not in df.index:
                return None
            for col in df.columns:
                try:
                    if pd.to_datetime(col) == target_dt:
                        v = df.loc[key, col]
                        return float(v) if pd.notna(v) else None
                except Exception:  # noqa: BLE001 -- skip unparseable columns
                    pass
            return None

        records = []
        for dt in ordered:
            period = period_by_date[dt]
            if not is_valid_year_period(dt.year, period):
                continue
            rec = {
                "Ticker":        ticker,
                "Calendar Year": dt.year,
                "Period":        period,
                "Date":          dt.date().isoformat(),
                "last_updated":  datetime.now().isoformat(),
            }
            for our_col, yf_key in YF_INCOME_MAP.items():
                rec[our_col] = val(inc, yf_key, dt)
            for our_col, yf_key in YF_BALANCE_MAP.items():
                rec[our_col] = val(bal, yf_key, dt)
            for our_col, yf_key in YF_CASHFLOW_MAP.items():
                if rec.get(our_col) is None:
                    rec[our_col] = val(cf, yf_key, dt)
            records.append(rec)

        if not records:
            return 0

        q_cols = set(EXCEL_COLUMNS) | {"last_updated"}
        inserted = 0
        with self._connect() as conn:
            for rec in records:
                cols = [c for c in rec.keys() if c in q_cols]
                vals = [rec[c] for c in cols]
                col_sql = ", ".join(f'"{c}"' for c in cols)
                ph = ", ".join("?" for _ in cols)
                cur = conn.execute(
                    f"INSERT OR IGNORE INTO financials_quarterly ({col_sql}) "
                    f"VALUES ({ph})", vals)
                inserted += cur.rowcount
            conn.commit()

        if verbose:
            print(f"  {ticker}: stored {inserted} quarter rows")
        return inserted

    def save_ttm(self, ticker: str, verbose: bool = True) -> bool:
        """Compute the live TTM snapshot (get_ttm) and upsert it into
        financials_quarterly with Period='TTM'. Calendar Year is the year of the
        TTM Date. The TTM row is a rolling snapshot, so ON CONFLICT restates it.
        Only columns in EXCEL_COLUMNS are stored. Returns True on write."""
        ticker = ticker.upper()
        try:
            ttm = self.get_ttm(ticker)
        except Exception as e:  # noqa: BLE001 -- isolate per-ticker fetch failures
            if verbose:
                print(f"  {ticker}: TTM fetch failed: {e}")
            return False
        if not ttm:
            return False

        ttm_date = ttm.get("Date") or date.today().isoformat()
        try:
            cal_year = int(str(ttm_date)[:4])
        except (TypeError, ValueError):
            cal_year = date.today().year
        if not is_valid_year_period(cal_year, "TTM"):
            return False

        rec = {k: v for k, v in ttm.items() if k in EXCEL_COLUMNS}
        rec["Ticker"] = ticker
        rec["Calendar Year"] = cal_year
        rec["Period"] = "TTM"
        rec["last_updated"] = datetime.now().isoformat()

        q_cols = set(EXCEL_COLUMNS) | {"last_updated"}
        cols = [c for c in rec.keys() if c in q_cols]
        col_sql = ", ".join(f'"{c}"' for c in cols)
        ph = ", ".join("?" for _ in cols)
        update_cols = [c for c in cols
                       if c not in ("Ticker", "Calendar Year", "Period")]
        set_sql = ", ".join(f'"{c}" = excluded."{c}"' for c in update_cols)
        with self._connect() as conn:
            conn.execute(
                f'INSERT INTO financials_quarterly ({col_sql}) VALUES ({ph}) '
                f'ON CONFLICT(Ticker, "Calendar Year", Period) '
                f'DO UPDATE SET {set_sql}',
                [rec[c] for c in cols])
            conn.commit()

        if verbose:
            print(f"  {ticker}: TTM snapshot saved ({cal_year})")
        return True

    def derive_q4(self, ticker: str, verbose: bool = True) -> int:
        """Back-fill the missing Q4 row for each fiscal year that has Q1-Q3 in
        financials_quarterly but no Q4. Flow columns = FY - (Q1+Q2+Q3);
        balance-sheet columns copy the FY row. INSERT OR IGNORE. Returns the
        number of Q4 rows created."""
        ticker = ticker.upper()
        flow_cols = list(FLOW_COLUMNS)
        bal_cols = list(YF_BALANCE_MAP.keys())
        q_cols = set(EXCEL_COLUMNS) | {"last_updated"}
        created = 0
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            fy_rows = conn.execute(
                'SELECT * FROM financials WHERE Ticker = ?', (ticker,)
            ).fetchall()
            for fy in fy_rows:
                try:
                    cal_year = int(fy["Calendar Year"])
                except (TypeError, ValueError, KeyError):
                    continue
                # Quarters are keyed by CALENDAR year of the quarter end while
                # the FY row is a FISCAL year: for a non-December fiscal filer
                # (AAPL Sep, WMT Jan) the two label different periods and
                # FY-(Q1+Q2+Q3) would mix them. Derive Q4 only for December
                # fiscal-year-ends, where calendar and fiscal align.
                fy_date = fy["Date"] if "Date" in fy.keys() else None
                if not fy_date or str(fy_date)[5:7] != "12":
                    continue
                q_rows = conn.execute(
                    'SELECT Period, ' +
                    ", ".join(f'"{c}"' for c in flow_cols) +
                    ' FROM financials_quarterly '
                    'WHERE Ticker = ? AND "Calendar Year" = ? '
                    "AND Period IN ('Q1','Q2','Q3','Q4')",
                    (ticker, cal_year)).fetchall()
                periods = {r["Period"] for r in q_rows}
                if not {"Q1", "Q2", "Q3"}.issubset(periods) or "Q4" in periods:
                    continue
                q123 = {r["Period"]: r for r in q_rows}
                rec = {
                    "Ticker":        ticker,
                    "Calendar Year": cal_year,
                    "Period":        "Q4",
                    "Date":          fy["Date"] if "Date" in fy.keys() else None,
                    "last_updated":  datetime.now().isoformat(),
                }
                for col in flow_cols:
                    fy_val = fy[col] if col in fy.keys() else None
                    if fy_val is None:
                        rec[col] = None
                        continue
                    partial = 0.0
                    ok = True
                    for p in ("Q1", "Q2", "Q3"):
                        v = q123[p][col]
                        if v is None:
                            ok = False
                            break
                        partial += float(v)
                    rec[col] = (float(fy_val) - partial) if ok else None
                for col in bal_cols:
                    rec[col] = fy[col] if col in fy.keys() else None

                cols = [c for c in rec.keys() if c in q_cols]
                col_sql = ", ".join(f'"{c}"' for c in cols)
                ph = ", ".join("?" for _ in cols)
                cur = conn.execute(
                    f"INSERT OR IGNORE INTO financials_quarterly ({col_sql}) "
                    f"VALUES ({ph})", [rec[c] for c in cols])
                created += cur.rowcount
            conn.commit()

        if verbose:
            print(f"  {ticker}: derived {created} Q4 rows")
        return created

    # ------------------------------------------------------------------
    # Query API (mirrors yfinance style)
    # ------------------------------------------------------------------

    def get(
        self,
        ticker: str,
        year: int = None,
        metrics: list[str] = None,
        as_dict: bool = False
    ) -> pd.DataFrame | dict:
        """
        Retrieve annual data for a ticker.

        Parameters
        ----------
        ticker  : Stock ticker (e.g. "AAPL")
        year    : Optional -- return only a specific calendar year
        metrics : Optional list of column names to return; all if None
        as_dict : If True, returns dict instead of DataFrame

        Returns
        -------
        DataFrame indexed by Calendar Year, or dict if as_dict=True
        """
        ticker = ticker.upper()
        where = ['Ticker = ?']
        params = [ticker]

        if year is not None:
            where.append('"Calendar Year" = ?')
            params.append(year)

        if metrics:
            select_cols = ', '.join(
                ['"Calendar Year"'] +
                [f'"{m}"' for m in metrics if m in EXCEL_COLUMNS]
            )
        else:
            select_cols = '*'

        sql = f"""
            SELECT {select_cols}
            FROM financials
            WHERE {' AND '.join(where)}
            ORDER BY "Calendar Year"
        """

        with self._connect() as conn:
            df = pd.read_sql_query(sql, conn, params=params)

        if df.empty:
            return {} if as_dict else df

        df = df.set_index("Calendar Year")
        df.index = df.index.astype(int)

        # Drop system columns from output
        for col in ["Ticker", "last_updated"]:
            if col in df.columns:
                df = df.drop(columns=[col])

        return df.to_dict() if as_dict else df

    def get_metric(
        self,
        ticker: str,
        metric: str,
        year: int = None
    ) -> pd.Series | float:
        """
        Retrieve a single metric for a ticker.

        Returns a scalar if year is specified, otherwise a Series indexed by year.
        """
        df = self.get(ticker, year=year, metrics=[metric])
        if df.empty:
            return None
        s = df[metric] if metric in df.columns else pd.Series(dtype=float)
        return float(s.iloc[0]) if year is not None and not s.empty else s

    def income_stmt(self, ticker: str) -> pd.DataFrame:
        """Return income statement metrics for all years, columns = years."""
        metrics = list(YF_INCOME_MAP.keys())
        df = self.get(ticker, metrics=metrics)
        return df[metrics].T if not df.empty else df

    def balance_sheet(self, ticker: str) -> pd.DataFrame:
        """Return balance sheet metrics for all years, columns = years."""
        metrics = list(YF_BALANCE_MAP.keys())
        df = self.get(ticker, metrics=metrics)
        return df[metrics].T if not df.empty else df

    def cashflow(self, ticker: str) -> pd.DataFrame:
        """Return cash flow metrics for all years, columns = years."""
        metrics = list(YF_CASHFLOW_MAP.keys())
        df = self.get(ticker, metrics=metrics)
        return df[metrics].T if not df.empty else df

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def list_tickers(self) -> list[str]:
        with self._connect() as conn:
            return [
                row[0] for row in conn.execute("SELECT ticker FROM tickers ORDER BY ticker")
            ]

    def coverage(self, ticker: str) -> list[int]:
        """Return list of calendar years available for a ticker."""
        with self._connect() as conn:
            return [
                row[0] for row in conn.execute(
                    'SELECT "Calendar Year" FROM financials WHERE Ticker = ? ORDER BY "Calendar Year"',
                    [ticker.upper()]
                )
            ]

    def info(self, ticker: str) -> dict:
        """Return name, sector, industry for a ticker."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT name, sector, industry FROM tickers WHERE ticker = ?",
                [ticker.upper()]
            ).fetchone()
        if row:
            return {"name": row[0], "sector": row[1], "industry": row[2]}
        return {}