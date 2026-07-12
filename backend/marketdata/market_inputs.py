"""
marketdata/market_inputs.py  (ported from valuation_debug/data_sources/market_inputs.py)

Computes the live valuation macro inputs from free market data:

  * **Risk-free rate** — the latest 10-Year Treasury (FRED ``DGS10``).
  * **Implied ERP** — Damodaran's forward-looking method: the internal rate of
    return ``r`` that sets the S&P 500 price equal to the PV of its expected cash
    flows (2-stage model); ``ERP = r − risk_free``.
  * **S&P-500 valuation / projection** — the same cash-flow stream exposed as a
    fair value vs. a baseline required return.

Adaptation for the IntrinsicEd port: the S&P-500 **earnings** input prefers
Damodaran's published trailing S&P-500 earnings
(:func:`marketdata.damodaran_market.current_sp500_earnings`), falling back to
Shiller's index earnings — per the product requirement that the earnings yield
use "earnings per share from Damodaran". Everything else is unchanged.

Results persist to ``market_inputs`` and everything degrades gracefully.
"""

from __future__ import annotations

import datetime as _dt
import sqlite3
from dataclasses import asdict, dataclass

RISK_FREE_FALLBACK = 0.045
ERP_FALLBACK = 0.045

# Implied-ERP model parameters (all documented, all overridable).
DEFAULT_CASH_PAYOUT = 0.85   # S&P 500 long-run total payout incl. buybacks ≈ 80–90%
DEFAULT_EXPECTED_INFLATION = 0.023  # used only if FRED breakeven is unavailable
EXPLICIT_YEARS = 5
ERP_FLOOR = 0.010            # sanity band — reject absurd solver output
ERP_CEILING = 0.090
GROWTH_CEILING_OVER_RF = 0.04  # explicit nominal growth capped at rf + 4%


@dataclass(frozen=True)
class WaccParams:
    """Live discount-rate inputs plus the diagnostics they were derived from."""

    risk_free_rate: float
    equity_risk_premium: float
    erp_method: str           # 'implied_two_stage' | 'damodaran' | 'fixed_fallback'
    rf_source: str            # 'FRED:DGS10' | 'fallback'
    asof: str
    sp500_level: float | None = None
    sp500_earnings: float | None = None
    sp500_dividend: float | None = None
    cape: float | None = None
    earnings_yield: float | None = None
    expected_growth: float | None = None

    def as_dict(self) -> dict:
        return asdict(self)


# ── S&P-500 earnings source (Damodaran preferred, Shiller fallback) ────────────


def _sp500_earnings(shiller_earnings: float | None, *, cache_dir: str | None) -> float | None:
    """Damodaran's trailing S&P-500 earnings if available, else Shiller's."""
    try:
        from .damodaran_market import current_sp500_earnings
        dmd = current_sp500_earnings(cache_dir=cache_dir)
    except Exception:  # noqa: BLE001
        dmd = None
    return dmd if (dmd is not None and dmd > 0) else shiller_earnings


# ── Implied ERP solver ──────────────────────────────────────────────────────


def _pv_two_stage(
    r: float,
    *,
    price: float,
    cf1: float,
    growth: float,
    g_term: float,
    years: int,
) -> float:
    """PV of a 2-stage cash-flow stream minus ``price`` (root => fair ``r``)."""
    pv = 0.0
    cf = cf1
    for t in range(1, years + 1):
        pv += cf / (1.0 + r) ** t
        if t < years:
            cf *= (1.0 + growth)
    cf_year_n = cf1 * (1.0 + growth) ** (years - 1)
    terminal = cf_year_n * (1.0 + g_term) / (r - g_term)
    pv += terminal / (1.0 + r) ** years
    return pv - price


def compute_implied_erp(
    *,
    price: float,
    earnings: float,
    risk_free: float,
    growth: float,
    dividend: float | None = None,
    cash_payout: float = DEFAULT_CASH_PAYOUT,
    years: int = EXPLICIT_YEARS,
) -> tuple[float | None, float | None]:
    """Return ``(implied_erp, implied_return)`` or ``(None, None)``."""
    if price is None or earnings is None or earnings <= 0 or price <= 0:
        return None, None
    g_term = max(0.0, risk_free)
    growth = max(0.0, min(growth, risk_free + GROWTH_CEILING_OVER_RF))

    payout = cash_payout
    if dividend is not None and earnings > 0:
        div_payout = dividend / earnings
        if div_payout == div_payout:  # not NaN
            payout = min(1.0, max(cash_payout, div_payout))
    payout = min(max(payout, 0.10), 1.0)

    cf1 = earnings * payout * (1.0 + growth)
    if cf1 <= 0:
        return None, None

    lo = g_term + 1e-4
    hi = 0.40
    f_lo = _pv_two_stage(lo, price=price, cf1=cf1, growth=growth, g_term=g_term, years=years)
    f_hi = _pv_two_stage(hi, price=price, cf1=cf1, growth=growth, g_term=g_term, years=years)
    if f_lo < 0 or f_hi > 0:
        return None, None
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        f_mid = _pv_two_stage(mid, price=price, cf1=cf1, growth=growth, g_term=g_term, years=years)
        if abs(f_mid) < 1e-9 or (hi - lo) < 1e-10:
            break
        if f_mid > 0:
            lo = mid
        else:
            hi = mid
    r = 0.5 * (lo + hi)
    erp = r - risk_free
    if not (ERP_FLOOR <= erp <= ERP_CEILING):
        return None, None
    return round(erp, 4), round(r, 4)


# ── Live inputs orchestration ─────────────────────────────────────────────────


def _latest_dgs10(fred) -> tuple[float | None, str]:
    """Latest 10y Treasury as a decimal (FRED reports percent), with source tag."""
    try:
        _, pct = fred.latest("DGS10")
    except Exception:  # noqa: BLE001
        pct = None
    if pct is not None and pct == pct:
        return round(pct / 100.0, 5), "FRED:DGS10"
    return None, "fallback"


def _expected_inflation(fred) -> float:
    """10-year breakeven inflation as a decimal (FRED ``T10YIE``), or default."""
    try:
        _, pct = fred.latest("T10YIE")
    except Exception:  # noqa: BLE001
        pct = None
    if pct is not None and pct == pct and 0 < pct < 10:
        return pct / 100.0
    return DEFAULT_EXPECTED_INFLATION


def get_live_wacc_params(
    conn: sqlite3.Connection | None = None,
    *,
    fred=None,
    shiller=None,
    persist: bool = True,
    fred_api_key: str | None = None,
    cache_dir: str | None = None,
) -> WaccParams:
    """Compute live ``(risk_free_rate, equity_risk_premium)`` from free data."""
    from .fred_client import FredClient
    from .shiller_data import ShillerData

    fred = fred or FredClient(api_key=fred_api_key, cache_dir=cache_dir)
    shiller = shiller or ShillerData(cache_dir=cache_dir)
    asof = _dt.date.today().isoformat()

    rf, rf_source = _latest_dgs10(fred)
    if rf is None:
        rf = RISK_FREE_FALLBACK

    # Index fundamentals from Shiller (price/dividend); earnings prefer Damodaran.
    try:
        rows = shiller.load()
    except Exception:  # noqa: BLE001
        rows = []
    latest = ShillerData.latest_complete(rows) if rows else None
    cape = ShillerData.latest_cape(rows) if rows else None

    price = latest.sp500 if latest else None
    earnings = _sp500_earnings(latest.earnings if latest else None, cache_dir=cache_dir)
    dividend = latest.dividend if latest else None
    earnings_yield = (earnings / price) if (price and earnings) else None

    # Nominal growth = trailing real earnings CAGR + expected inflation.
    real_g = ShillerData.real_earnings_cagr(rows) if rows else None
    infl = _expected_inflation(fred)
    growth = (real_g + infl) if real_g is not None else (0.02 + infl)

    erp: float | None = None
    method = "fixed_fallback"
    if price and earnings:
        erp, _r = compute_implied_erp(
            price=price, earnings=earnings, risk_free=rf,
            growth=growth, dividend=dividend,
        )
        if erp is not None:
            method = "implied_two_stage"

    if erp is None:
        erp = _try_damodaran_erp(cache_dir=cache_dir)
        if erp is not None:
            method = "damodaran"

    if erp is None:
        erp = ERP_FALLBACK
        method = "fixed_fallback"

    params = WaccParams(
        risk_free_rate=round(rf, 5),
        equity_risk_premium=round(erp, 5),
        erp_method=method,
        rf_source=rf_source,
        asof=asof,
        sp500_level=price,
        sp500_earnings=earnings,
        sp500_dividend=dividend,
        cape=cape,
        earnings_yield=round(earnings_yield, 5) if earnings_yield else None,
        expected_growth=round(growth, 5) if growth is not None else None,
    )

    if persist and conn is not None:
        try:
            _persist(conn, params)
        except Exception:  # noqa: BLE001 — persistence must not break the value
            pass
    return params


def _try_damodaran_erp(*, cache_dir: str | None) -> float | None:
    """Best-effort: Damodaran's published implied ERP as a cross-check/fallback."""
    try:
        from .damodaran_market import current_implied_erp
        return current_implied_erp(cache_dir=cache_dir)
    except Exception:  # noqa: BLE001
        return None


def _persist(conn: sqlite3.Connection, p: WaccParams) -> None:
    from .schema import ensure_external_schema

    ensure_external_schema(conn)
    now = _dt.datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO market_inputs
            (asof, risk_free_rate, equity_risk_premium, erp_method, rf_source,
             sp500_level, sp500_earnings, sp500_dividend, cape, earnings_yield,
             expected_growth, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asof) DO UPDATE SET
            risk_free_rate=excluded.risk_free_rate,
            equity_risk_premium=excluded.equity_risk_premium,
            erp_method=excluded.erp_method, rf_source=excluded.rf_source,
            sp500_level=excluded.sp500_level, sp500_earnings=excluded.sp500_earnings,
            sp500_dividend=excluded.sp500_dividend, cape=excluded.cape,
            earnings_yield=excluded.earnings_yield,
            expected_growth=excluded.expected_growth, computed_at=excluded.computed_at
        """,
        [p.asof, p.risk_free_rate, p.equity_risk_premium, p.erp_method, p.rf_source,
         p.sp500_level, p.sp500_earnings, p.sp500_dividend, p.cape,
         p.earnings_yield, p.expected_growth, now],
    )
    conn.commit()


def read_cached_params(
    conn: sqlite3.Connection, *, max_age_days: float = 1.0
) -> WaccParams | None:
    """Return the most recent persisted :class:`WaccParams` if fresh, else None."""
    try:
        row = conn.execute(
            """SELECT asof, risk_free_rate, equity_risk_premium, erp_method, rf_source,
                      sp500_level, sp500_earnings, sp500_dividend, cape,
                      earnings_yield, expected_growth
               FROM market_inputs ORDER BY asof DESC LIMIT 1"""
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    if not row:
        return None
    try:
        asof_date = _dt.date.fromisoformat(row[0])
    except ValueError:
        return None
    if (_dt.date.today() - asof_date).days > max_age_days:
        return None
    return WaccParams(
        risk_free_rate=row[1], equity_risk_premium=row[2], erp_method=row[3],
        rf_source=row[4], asof=row[0], sp500_level=row[5], sp500_earnings=row[6],
        sp500_dividend=row[7], cape=row[8], earnings_yield=row[9],
        expected_growth=row[10],
    )


def historical_implied_erp_series(
    conn: sqlite3.Connection, *, since: int = 2012, store: bool = True,
) -> dict[int, float]:
    """Year-by-year implied ERP, persisted to ``macro_series`` as ``ERP_IMPLIED``.

    Reuses the two-stage solver on each year-end S&P 500 fundamentals (Shiller)
    and that year's year-end 10y Treasury (FRED ``DGS10``). Returns {year: erp}."""
    from .shiller_data import ShillerData, read_stored
    from .fred_client import read_series

    rows = read_stored(conn)
    if not rows:
        return {}
    row_by_year: dict[int, object] = {}
    for r in rows:
        if r.is_complete:
            row_by_year[int(r.date[:4])] = r
    rf_by_year: dict[int, float] = {}
    for o in read_series(conn, "DGS10"):
        rf_by_year[int(o.date[:4])] = o.value / 100.0

    out: dict[int, float] = {}
    for yr in sorted(row_by_year):
        if yr < since:
            continue
        row = row_by_year[yr]
        rf = rf_by_year.get(yr)
        if rf is None:
            continue
        subset = [r for r in rows if int(r.date[:4]) <= yr]
        real_g = ShillerData.real_earnings_cagr(subset)
        growth = (real_g + DEFAULT_EXPECTED_INFLATION) if real_g is not None \
            else (0.02 + DEFAULT_EXPECTED_INFLATION)
        erp, _r = compute_implied_erp(
            price=row.sp500, earnings=row.earnings, risk_free=rf,
            growth=growth, dividend=row.dividend)
        if erp is not None:
            out[yr] = erp

    if store and out:
        from .schema import ensure_external_schema
        ensure_external_schema(conn)
        now = _dt.datetime.now().isoformat(timespec="seconds")
        conn.executemany(
            """INSERT INTO macro_series
                   (series_id, date, value, source, label, unit, fetched_at)
               VALUES ('ERP_IMPLIED', ?, ?, 'computed',
                       'Implied ERP (Shiller 2-stage)', 'decimal', ?)
               ON CONFLICT(series_id, date) DO UPDATE SET
                   value=excluded.value, fetched_at=excluded.fetched_at""",
            [(f"{yr}-12-01", erp, now) for yr, erp in out.items()],
        )
        conn.commit()
    return out


def read_implied_erp(conn: sqlite3.Connection, year: int) -> float | None:
    """Stored implied ERP for a year (nearest earlier year if exact is missing)."""
    try:
        row = conn.execute(
            """SELECT value FROM macro_series
               WHERE series_id='ERP_IMPLIED' AND date <= ?
               ORDER BY date DESC LIMIT 1""",
            (f"{year}-12-01",),
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    return float(row[0]) if row and row[0] is not None else None


def sp500_projection(
    *, price: float, earnings: float, risk_free: float, growth: float,
    dividend: float | None = None, cash_payout: float = DEFAULT_CASH_PAYOUT,
    years: int = EXPLICIT_YEARS, baseline_erp: float = ERP_FALLBACK,
) -> dict | None:
    """Damodaran's S&P 500 valuation / implied-ERP method with the full cash-flow
    projection exposed. None on bad inputs."""
    if price is None or earnings is None or earnings <= 0 or price <= 0:
        return None
    g = max(0.0, min(growth, risk_free + GROWTH_CEILING_OVER_RF))
    g_term = max(0.0, risk_free)
    payout = cash_payout
    if dividend is not None and earnings > 0:
        dp = dividend / earnings
        if dp == dp:
            payout = min(1.0, max(cash_payout, dp))
    payout = min(max(payout, 0.10), 1.0)
    cf1 = earnings * payout * (1.0 + g)
    if cf1 <= 0:
        return None

    erp, r = compute_implied_erp(
        price=price, earnings=earnings, risk_free=risk_free, growth=growth,
        dividend=dividend, cash_payout=cash_payout, years=years)

    proj = []
    for t in range(1, years + 1):
        cf_t = cf1 * (1.0 + g) ** (t - 1)
        # Projected index earnings in year t = trailing earnings grown at g.
        # (cash flow to shareholders = projectedEarnings × payout = cf_t.)
        row = {
            "year": t,
            "projectedEarnings": round(earnings * (1.0 + g) ** t, 2),
            "cashFlow": round(cf_t, 2),
        }
        if r is not None:
            row["pvAtImpliedReturn"] = round(cf_t / (1.0 + r) ** t, 2)
        proj.append(row)
    cf_year_n = cf1 * (1.0 + g) ** (years - 1)

    def fair_value(req: float) -> float | None:
        if req <= g_term:
            return None
        return _pv_two_stage(req, price=0.0, cf1=cf1, growth=g, g_term=g_term, years=years)

    baseline_req = risk_free + baseline_erp
    fv_base = fair_value(baseline_req)
    return {
        "price": price, "earnings": earnings, "payout": round(payout, 4),
        "growth": round(g, 4), "riskFree": round(risk_free, 4),
        "terminalGrowth": round(g_term, 4),
        "impliedReturn": r, "impliedERP": erp,
        "projection": proj, "terminalCashFlow": round(cf_year_n, 2),
        "baselineERP": baseline_erp, "baselineRequiredReturn": round(baseline_req, 4),
        "fairValueAtBaseline": round(fv_base, 1) if fv_base is not None else None,
        "overUnderValuationPct": (round((fv_base / price - 1.0) * 100, 1)
                                  if fv_base is not None else None),
    }


def get_current_sp500_projection(
    conn: sqlite3.Connection, *, baseline_erp: float = ERP_FALLBACK,
    cache_dir: str | None = None,
) -> dict | None:
    """Run :func:`sp500_projection` on the latest stored fundamentals — Shiller's
    latest complete S&P 500 row (price/dividend) with earnings preferring
    Damodaran, FRED DGS10 as rf, growth = real-earnings CAGR + breakeven."""
    from .shiller_data import ShillerData, read_stored
    from .fred_client import read_series

    rows = read_stored(conn)
    latest = ShillerData.latest_complete(rows) if rows else None
    if latest is None:
        return None
    dgs = read_series(conn, "DGS10")
    rf = (dgs[-1].value / 100.0) if dgs else RISK_FREE_FALLBACK
    t10 = read_series(conn, "T10YIE")
    infl = (t10[-1].value / 100.0
            if (t10 and 0 < t10[-1].value < 10) else DEFAULT_EXPECTED_INFLATION)
    real_g = ShillerData.real_earnings_cagr(rows)
    growth = (real_g + infl) if real_g is not None else (0.02 + infl)
    earnings = _sp500_earnings(latest.earnings, cache_dir=cache_dir)
    return sp500_projection(
        price=latest.sp500, earnings=earnings, risk_free=rf,
        growth=growth, dividend=latest.dividend, baseline_erp=baseline_erp)
