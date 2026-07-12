"""
marketdata/sector_etf.py  (trimmed from valuation_debug/data_sources/international.py)

Yahoo Finance price history for the 11 US sector SPDR ETFs (the index funds the
app charts on each Sector Analysis page) plus SPY. Only the price-series fetch is
kept — all the sector-beta / regression machinery from valuation_debug is
dropped (sector/industry-specific, out of scope).

The endpoint that uses this is wrapped in the app's 15-minute TTL cache, so the
whole history (including the latest close) refreshes at most every 15 minutes —
no redundant yfinance calls in between.
"""

from __future__ import annotations

import datetime as _dt

# ETF ticker -> (series_id, human label). All 11 SPDR sectors + SPY.
SECTOR_ETFS: dict[str, tuple[str, str]] = {
    "XLK":  ("EQ_XLK",  "Sector SPDR: Technology (XLK)"),
    "XLF":  ("EQ_XLF",  "Sector SPDR: Financials (XLF)"),
    "XLV":  ("EQ_XLV",  "Sector SPDR: Health Care (XLV)"),
    "XLE":  ("EQ_XLE",  "Sector SPDR: Energy (XLE)"),
    "XLI":  ("EQ_XLI",  "Sector SPDR: Industrials (XLI)"),
    "XLY":  ("EQ_XLY",  "Sector SPDR: Consumer Discretionary (XLY)"),
    "XLP":  ("EQ_XLP",  "Sector SPDR: Consumer Staples (XLP)"),
    "XLB":  ("EQ_XLB",  "Sector SPDR: Materials (XLB)"),
    "XLU":  ("EQ_XLU",  "Sector SPDR: Utilities (XLU)"),
    "XLRE": ("EQ_XLRE", "Sector SPDR: Real Estate (XLRE)"),
    "XLC":  ("EQ_XLC",  "Sector SPDR: Communication Services (XLC)"),
    "SPY":  ("EQ_SPY",  "S&P 500 (SPY ETF)"),
}

# App GICS sector name (route param) -> SPDR ticker. Covers all 11 app sectors.
SECTOR_NAME_TO_TICKER: dict[str, str] = {
    "Technology": "XLK",
    "Financial Services": "XLF",
    "Healthcare": "XLV",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Basic Materials": "XLB",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Communication Services": "XLC",
}


def ticker_for_sector(sector: str) -> str | None:
    """Resolve an app sector name to its SPDR ETF ticker (case-insensitive)."""
    if sector in SECTOR_NAME_TO_TICKER:
        return SECTOR_NAME_TO_TICKER[sector]
    low = sector.strip().lower()
    for name, tkr in SECTOR_NAME_TO_TICKER.items():
        if name.lower() == low:
            return tkr
    return None


def fetch_price_history(
    ticker: str, *, start: str = "2010-01-01", interval: str = "1wk",
    end: str | None = None,
) -> list[tuple[str, float]]:
    """Adjusted closes for one ETF as ``[(ISO-date, price)]`` ascending.

    Defaults to weekly closes since 2010 — a clean long-horizon line for the
    chart without thousands of points. Returns ``[]`` on any failure."""
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError:
        return []
    end = end or _dt.date.today().isoformat()
    try:
        data = yf.download(ticker, start=start, end=end, interval=interval,
                           progress=False, auto_adjust=True)
    except Exception:  # noqa: BLE001
        return []
    if data is None or len(data) == 0 or "Close" not in data:
        return []
    close = data["Close"]
    if hasattr(close, "columns"):  # MultiIndex / DataFrame → first column
        close = close.iloc[:, 0]
    out: list[tuple[str, float]] = []
    for ts, raw in close.items():
        try:
            v = float(raw)
        except (ValueError, TypeError):
            continue
        if v != v:  # NaN
            continue
        try:
            iso = ts.date().isoformat()
        except Exception:  # noqa: BLE001
            iso = str(ts)[:10]
        out.append((iso, v))
    out.sort(key=lambda t: t[0])
    return out


def latest_price(ticker: str) -> tuple[str | None, float | None]:
    """Best-effort latest intraday price (date, value) via yfinance fast_info."""
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError:
        return None, None
    try:
        fi = yf.Ticker(ticker).fast_info
        px = fi.get("last_price") if hasattr(fi, "get") else fi["last_price"]
        if px is not None:
            return _dt.date.today().isoformat(), round(float(px), 4)
    except Exception:  # noqa: BLE001
        pass
    return None, None
