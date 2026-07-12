"""
marketdata/damodaran_market.py  (new — focused subset of valuation_debug)

A deliberately small module that pulls ONLY the market-level numbers the app
needs from Aswath Damodaran's "Historical Implied Equity Risk Premiums for the
US" workbook (``histimpl.xls`` on NYU Stern). It does NOT touch any of his
by-industry benchmark datasets (betas/wacc/margins/PE) — those are sector/
industry-specific and explicitly out of scope for this port.

Exposed values
--------------
* :func:`current_implied_erp`     — Damodaran's latest published implied ERP.
* :func:`current_sp500_earnings`  — Damodaran's latest trailing S&P-500 earnings
  (index points). Used as the EPS numerator for the Fed-model earnings yield
  (``EPS ÷ yfinance S&P-500 price``).
* :func:`sp500_earnings_history`  — the year-by-year (earnings, index level)
  series, used to draw the historical earnings-yield line.

The same cached download backs all three so the workbook is fetched at most once
per ``max_age_days``. Every function degrades to ``None``/empty on any failure
(missing ``xlrd``, format drift, no network + no cache).
"""

from __future__ import annotations

import io

from .http_cache import cached_download

_BASE = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/"
_HISTIMPL_FILE = "histimpl.xls"
_CACHE_NAME = "damodaran_histimpl.xls"
_DEFAULT_MAX_AGE = 30.0


def _norm(s: object) -> str:
    return str(s).strip().lower()


def _load_df(*, cache_dir: str | None = None, max_age_days: float = _DEFAULT_MAX_AGE,
             force: bool = False):
    """Download + parse histimpl.xls into a header-less DataFrame, or None."""
    try:
        import pandas as pd  # noqa: PLC0415
    except ImportError:
        return None
    result = cached_download(
        _BASE + _HISTIMPL_FILE, _CACHE_NAME,
        cache_dir=cache_dir, max_age_days=max_age_days, force=force,
    )
    if result.data is None:
        return None
    try:
        return pd.read_excel(io.BytesIO(result.data), header=None, engine="xlrd")
    except Exception:  # noqa: BLE001 — xlrd missing or format drift
        return None


def current_implied_erp(*, cache_dir: str | None = None,
                        max_age_days: float = _DEFAULT_MAX_AGE) -> float | None:
    """Damodaran's latest published implied ERP (decimal), best-effort.

    Reads ``histimpl.xls`` and takes the last numeric value in the column whose
    header mentions an implied premium. Returns None on any failure. (Lifted from
    valuation_debug ``damodaran_data.current_implied_erp``.)"""
    df = _load_df(cache_dir=cache_dir, max_age_days=max_age_days)
    if df is None:
        return None
    for i in range(min(15, len(df))):
        headers = [_norm(c) for c in df.iloc[i].tolist()]
        col = next((j for j, h in enumerate(headers)
                    if "implied" in h and "premium" in h), None)
        if col is None:
            col = next((j for j, h in enumerate(headers) if "implied erp" in h), None)
        if col is not None:
            series = df.iloc[i + 1:, col]
            for v in reversed(series.tolist()):
                try:
                    f = float(v)
                except (ValueError, TypeError):
                    continue
                if f != f:  # NaN
                    continue
                erp = f / 100.0 if f > 1.0 else f  # percent vs decimal
                if 0.01 <= erp <= 0.12:
                    return round(erp, 4)
            return None
    return None


def _find_columns(df) -> tuple[int, dict[str, int | None]] | None:
    """Locate the header row + the (year, earnings, index, growth) column indices.

    ``growth`` is Damodaran's "Analyst Growth Estimate" — the consensus forward
    earnings-growth rate he projects the index's earnings with. It drives the
    projected (forward) earnings figure."""
    for i in range(min(15, len(df))):
        headers = [_norm(c) for c in df.iloc[i].tolist()]
        year_col = next((j for j, h in enumerate(headers)
                         if h == "year" or h.startswith("year")), None)
        earn_col = next((j for j, h in enumerate(headers)
                         if "earnings" in h and "real" not in h
                         and "growth" not in h and "yield" not in h
                         and "change" not in h), None)
        idx_col = next((j for j, h in enumerate(headers)
                        if "s&p 500" in h or "index" in h), None)
        growth_col = next((j for j, h in enumerate(headers)
                           if "analyst" in h and "growth" in h), None)
        if growth_col is None:  # fall back to Damodaran's smoothed growth column
            growth_col = next((j for j, h in enumerate(headers)
                               if "smoothed" in h and "growth" in h), None)
        if year_col is not None and earn_col is not None:
            return i, {"year": year_col, "earnings": earn_col,
                       "index": idx_col, "growth": growth_col}
    return None


def _num(v) -> float | None:
    try:
        f = float(v)
    except (ValueError, TypeError):
        return None
    return f if f == f else None  # drop NaN


def sp500_earnings_history(
    *, cache_dir: str | None = None, max_age_days: float = _DEFAULT_MAX_AGE,
) -> list[dict[str, float]]:
    """Year-by-year ``[{year, earnings, index}]`` from histimpl.xls (ascending).

    ``index`` (the S&P-500 level) may be absent if the column can't be located;
    callers should guard for it. Returns ``[]`` on any failure."""
    df = _load_df(cache_dir=cache_dir, max_age_days=max_age_days)
    if df is None:
        return []
    found = _find_columns(df)
    if found is None:
        return []
    header_row, cols = found
    out: list[dict[str, float]] = []
    for _, row in df.iloc[header_row + 1:].iterrows():
        yr = _num(row.iloc[cols["year"]])
        if yr is None or not (1900 <= yr <= 2100):
            continue
        earn = _num(row.iloc[cols["earnings"]])
        if earn is None or earn <= 0:
            continue
        rec: dict[str, float] = {"year": int(yr), "earnings": earn}
        if cols["index"] is not None:
            lvl = _num(row.iloc[cols["index"]])
            if lvl is not None and lvl > 0:
                rec["index"] = lvl
        if cols["growth"] is not None:
            g = _num(row.iloc[cols["growth"]])
            # Damodaran reports growth as a decimal; keep only sane forward rates.
            if g is not None and -0.5 < g < 0.5:
                rec["growth"] = g
        out.append(rec)
    out.sort(key=lambda r: r["year"])
    return out


def historical_erp_rf_by_year(
    *, cache_dir: str | None = None, max_age_days: float = _DEFAULT_MAX_AGE,
) -> dict[int, dict[str, float]]:
    """Year-by-year risk-free rate and implied ERP from histimpl.xls:
    ``{year: {"rf": <T-bond rate>, "erp": <implied ERP>}}`` (both decimals).

    ``rf`` is Damodaran's "T.Bond Rate" (the US 10-year Treasury yield at each
    year end); ``erp`` is his "Implied ERP (FCFE)", the premium that equates the
    index level to the present value of expected cash flows for that year. These
    give a PER-YEAR CAPM input set, so a historical cost of equity and WACC can
    reflect each era's rate environment instead of one current value. Returns
    ``{}`` on any failure (callers fall back to the live single values)."""
    df = _load_df(cache_dir=cache_dir, max_age_days=max_age_days)
    if df is None:
        return {}
    header_row: int | None = None
    year_col = rf_col = erp_col = None
    for i in range(min(15, len(df))):
        headers = [_norm(c) for c in df.iloc[i].tolist()]
        yc = next((j for j, h in enumerate(headers) if h == "year" or h.startswith("year")), None)
        rc = next((j for j, h in enumerate(headers) if "t.bond" in h and "rate" in h), None)
        ec = next((j for j, h in enumerate(headers)
                   if "implied erp" in h and "fcfe" in h and "risk adjusted" not in h), None)
        if ec is None:  # header drift fallbacks
            ec = next((j for j, h in enumerate(headers)
                       if "implied premium" in h and "fcfe" in h), None)
        if ec is None:
            ec = next((j for j, h in enumerate(headers) if "implied premium (ddm)" in h), None)
        if yc is not None and rc is not None and ec is not None:
            header_row, year_col, rf_col, erp_col = i, yc, rc, ec
            break
    if header_row is None:
        return {}
    out: dict[int, dict[str, float]] = {}
    for _, row in df.iloc[header_row + 1:].iterrows():
        yr = _num(row.iloc[year_col])
        if yr is None or not (1900 <= yr <= 2100):
            continue
        rf = _num(row.iloc[rf_col])
        erp = _num(row.iloc[erp_col])
        if rf is None or erp is None:
            continue
        # Both are decimals in the workbook (0.0418 = 4.18%); keep sane ranges.
        if not (0.0 <= rf <= 0.25) or not (0.005 <= erp <= 0.15):
            continue
        out[int(yr)] = {"rf": round(rf, 4), "erp": round(erp, 4)}
    return out


def current_analyst_growth(
    *, cache_dir: str | None = None, max_age_days: float = _DEFAULT_MAX_AGE,
) -> float | None:
    """Damodaran's latest analyst (consensus) forward earnings-growth estimate."""
    hist = sp500_earnings_history(cache_dir=cache_dir, max_age_days=max_age_days)
    for rec in reversed(hist):
        if "growth" in rec:
            return round(rec["growth"], 4)
    return None


def current_sp500_forward_earnings(
    *, years: int = 1, cache_dir: str | None = None,
    max_age_days: float = _DEFAULT_MAX_AGE,
) -> float | None:
    """Damodaran's projected S&P-500 earnings = latest trailing earnings grown at
    the analyst growth estimate for ``years`` (default next-twelve-month). None if
    either input is unavailable."""
    eps = current_sp500_earnings(cache_dir=cache_dir, max_age_days=max_age_days)
    g = current_analyst_growth(cache_dir=cache_dir, max_age_days=max_age_days)
    if eps is None or g is None:
        return None
    return round(eps * (1.0 + g) ** years, 2)


def current_sp500_earnings(
    *, cache_dir: str | None = None, max_age_days: float = _DEFAULT_MAX_AGE,
) -> float | None:
    """Damodaran's latest trailing S&P-500 earnings (index points), or None.

    This is the EPS numerator the Fed-model earnings yield divides by the live
    yfinance S&P-500 price."""
    hist = sp500_earnings_history(cache_dir=cache_dir, max_age_days=max_age_days)
    if not hist:
        return None
    return round(hist[-1]["earnings"], 2)
