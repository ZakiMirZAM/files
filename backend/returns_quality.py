"""Returns quality: current returns measured against their own five-year history
and against the industry (Damodaran, *Investment Valuation* Ch.11 and Ch.12).

Five methods, all of them comparisons rather than point estimates:

1. Return on equity against its own five-year average.
2. Return on invested capital against its own five-year average, plus an
   attribution splitting the gap into margin, tax, and capital turnover.
3. Return on invested capital and the ROIC-WACC spread against the industry.
4. Expected growth (reinvestment rate x ROIC) against actual growth, with the
   expression computed BOTH on the current year and on five-year averages.
5. The reinvestment rate against its own five-year average.

Two deliberate design rules, both load-bearing:

**The five-year average is a COMPARISON, never a fallback.** Nothing here ever
substitutes an average for a point estimate when the point estimate looks
extreme. Both figures are always computed and both are always returned, because
the distance between them is the finding. A silently-substituted number teaches
the reader nothing and hides the very case worth looking at.

**A negative reinvestment rate is carried, not floored.** Capex below
depreciation means the firm is consuming its asset base. That is information
about the business, not a data error, and flooring it to zero (as the forecast
path does) makes a harvesting firm look merely static.

Pure functions over rows, no DB and no imports from `individualanalysis`, so the
section stands alone and dict rows work in tests.
"""

from __future__ import annotations

import math
from typing import Any, Optional, Sequence

Row = Any  # sqlite3.Row or dict — both support row[col] by column name.

# Comparison window. Five years is the app-wide convention and is long enough to
# span a normal capex cycle without reaching back into a different business.
WINDOW = 5

# The attribution reconciles only when the three components and the headline
# return are measured on one base. Beyond this gap (in decimal ROIC) the
# decomposition is reported as not reconciling rather than shown as if it did.
RECONCILE_TOL = 0.01

# A gap this wide (in decimal) between the current figure and its five-year
# average marks the current year as a departure from the norm.
DEPARTURE_GAP = 0.05


# ── helpers ──────────────────────────────────────────────────────────────────

def _val(row: Row, col: str) -> Optional[float]:
    """Column value as a float, or None when absent/blank/non-numeric."""
    try:
        v = row[col]
    except (KeyError, IndexError, TypeError):
        return None
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den in (None, 0):
        return None
    out = num / den
    return out if math.isfinite(out) else None


def _mean(vals: Sequence[float]) -> Optional[float]:
    clean = [v for v in vals if v is not None and math.isfinite(v)]
    return (sum(clean) / len(clean)) if clean else None


def _median(vals: Sequence[float]) -> Optional[float]:
    clean = sorted(v for v in vals if v is not None and math.isfinite(v))
    if not clean:
        return None
    mid = len(clean) // 2
    if len(clean) % 2:
        return clean[mid]
    return (clean[mid - 1] + clean[mid]) / 2.0


def _tax_rate(row: Row) -> Optional[float]:
    """Effective rate, rejected outside [0, 0.6] where it is a data artifact
    rather than a rate (a loss year drives it negative or enormous)."""
    r = _div(_val(row, "Income Tax Expense"), _val(row, "Income Before Tax"))
    if r is None or r < 0 or r > 0.6:
        return None
    return r


def _nopat(row: Row) -> Optional[float]:
    ebit = _val(row, "Operating Income")
    t = _tax_rate(row)
    if ebit is None:
        return None
    return ebit * (1.0 - (t if t is not None else 0.21))


def _equity(row: Row) -> Optional[float]:
    return _val(row, "Total Stockholders Equity") or _val(row, "Total Equity")


def _invested_capital(row: Row) -> Optional[float]:
    """Book equity + total debt. Matches the base the rest of the engine uses so
    this section reconciles with the ROIC shown elsewhere on the page. Cash is
    NOT subtracted here; see the module note in the section overview."""
    eq, debt = _equity(row), _val(row, "Total Debt")
    if eq is None or debt is None:
        return None
    return eq + debt


def _reinvestment_rate(row: Row) -> Optional[float]:
    """(Capex - Depreciation + change in non-cash working capital) / NOPAT.

    Returned with its real sign. A negative rate means capex fell below
    depreciation, and that is carried through rather than floored to zero.
    """
    capex = _val(row, "Capital Expenditure")
    dep = _val(row, "Depreciation and Amortization Cashflow")
    d_nwc = _val(row, "Change In Working Capital")
    nopat = _nopat(row)
    if capex is None or dep is None or d_nwc is None or nopat in (None, 0):
        return None
    return (abs(capex) - dep + d_nwc) / nopat


def _year(row: Row) -> Optional[int]:
    y = _val(row, "Calendar Year")
    return int(y) if y is not None else None


def _sorted_window(rows: Sequence[Row], n: int = WINDOW) -> list[Row]:
    """Last `n` rows, ascending by fiscal year. Defensive sort: callers have
    passed DESC rows before and every positional index here would invert."""
    ordered = sorted((r for r in rows if _year(r) is not None), key=_year)
    return ordered[-n:]


def _compare(series: list[tuple[int, float]]) -> Optional[dict]:
    """Current value against the mean and median of its own window."""
    if not series:
        return None
    current = series[-1][1]
    vals = [v for _, v in series]
    avg, med = _mean(vals), _median(vals)
    gap = (current - avg) if avg is not None else None
    return {
        "current": current,
        "avg5": avg,
        "median5": med,
        "gap": gap,
        "isDeparture": bool(gap is not None and abs(gap) >= DEPARTURE_GAP),
        "yearsUsed": len(vals),
        "series": {str(y): v for y, v in series},
    }


def _series(rows: Sequence[Row], fn) -> list[tuple[int, float]]:
    out: list[tuple[int, float]] = []
    for r in rows:
        v = fn(r)
        y = _year(r)
        if v is not None and y is not None and math.isfinite(v):
            out.append((y, v))
    return out


# ── 1. Return on equity against its own history ──────────────────────────────

def roe_vs_history(rows: Sequence[Row]) -> Optional[dict]:
    """Return on equity, current against its own five-year mean and median.

    Uses net income / period-end equity, which is the headline convention on the
    individual page, so the current figure here matches the one shown above it.
    Financial leverage travels alongside because a return on equity that moved
    only because the equity base moved is not a business result.
    """
    win = _sorted_window(rows)
    if not win:
        return {"applicable": False, "reason": "No data."}

    def roe(r: Row) -> Optional[float]:
        stored = _val(r, "ROE")
        return stored if stored is not None else _div(_val(r, "Net Income"), _equity(r))

    def leverage(r: Row) -> Optional[float]:
        return _div(_val(r, "Total Assets"), _equity(r))

    cmp_ = _compare(_series(win, roe))
    if cmp_ is None:
        return {"applicable": False, "reason": "Return on equity could not be computed for any year in the window."}
    lev = _series(win, leverage)
    return {
        "applicable": True,
        "latestYear": _year(win[-1]),
        **cmp_,
        "leverage": {str(y): v for y, v in lev},
        "leverageCurrent": lev[-1][1] if lev else None,
    }


# ── 2. Return on capital against its own history, and why ────────────────────

def _roic_components(row: Row) -> Optional[tuple[float, float, float]]:
    """(operating margin, 1 - tax rate, capital turnover). The three factors
    whose product is the return on invested capital."""
    rev = _val(row, "Revenue")
    margin = _div(_val(row, "Operating Income"), rev)
    turnover = _div(rev, _invested_capital(row))
    t = _tax_rate(row)
    if margin is None or turnover is None:
        return None
    return (margin, 1.0 - (t if t is not None else 0.21), turnover)


def roic_vs_history(rows: Sequence[Row]) -> Optional[dict]:
    """Return on invested capital against its own five-year average, with the
    gap attributed to margin, tax, and capital turnover.

    Each effect moves ONE component to its current value and holds the other two
    at their five-year averages. The three do not sum exactly to the total gap,
    because moving one component at a time assigns the interaction between them
    nowhere. They identify which driver dominates, not an exact accounting.
    """
    win = _sorted_window(rows)
    if not win:
        return {"applicable": False, "reason": "No data."}

    def roic(r: Row) -> Optional[float]:
        stored = _val(r, "ROIC")
        if stored is not None:
            return stored
        ic = _invested_capital(r)
        return _div(_nopat(r), ic) if (ic is not None and ic > 0) else None

    cmp_ = _compare(_series(win, roic))
    if cmp_ is None:
        return {"applicable": False, "reason": "Return on invested capital could not be computed for any year in the window."}

    comps = [c for c in (_roic_components(r) for r in win) if c is not None]
    attribution = None
    if len(comps) >= 3:
        m_now, t_now, u_now = comps[-1]
        m_avg = _mean([c[0] for c in comps])
        t_avg = _mean([c[1] for c in comps])
        u_avg = _mean([c[2] for c in comps])
        margin_eff = (m_now - m_avg) * t_avg * u_avg
        tax_eff = m_avg * (t_now - t_avg) * u_avg
        turnover_eff = m_avg * t_avg * (u_now - u_avg)
        product_now = m_now * t_now * u_now
        product_avg = m_avg * t_avg * u_avg
        reported = cmp_["current"]
        reconciles = abs(product_now - reported) <= RECONCILE_TOL
        attribution = {
            "marginEffect": margin_eff,
            "taxEffect": tax_eff,
            "turnoverEffect": turnover_eff,
            "total": margin_eff + tax_eff + turnover_eff,
            "productNow": product_now,
            "productAvg": product_avg,
            "reportedRoic": reported,
            "reconciles": reconciles,
            "reconcileNote": (
                None if reconciles else
                "The three components multiply to a different return than the one displayed. "
                "The headline reads a stored value while the components are computed from the "
                "statements, so the two rest on different definitions of invested capital. "
                "Read the effects as the direction and rank of each driver, not as an exact split."
            ),
            "components": {
                "operatingMargin": {"current": m_now, "avg5": m_avg},
                "retentionAfterTax": {"current": t_now, "avg5": t_avg},
                "capitalTurnover": {"current": u_now, "avg5": u_avg},
            },
        }

    return {
        "applicable": True,
        "latestYear": _year(win[-1]),
        **cmp_,
        "attribution": attribution,
    }


# ── 3. Return on capital and the spread against the industry ─────────────────

def roic_vs_industry(rows: Sequence[Row], industry_norms: Optional[dict]) -> dict:
    """The company's return and ROIC-WACC spread against its industry.

    `industry_norms` carries the market-cap-weighted industry aggregates in
    DECIMAL units: roic, wacc, spread, roe. Absent, the block reports itself as
    inapplicable with a reason rather than inventing a benchmark.

    The spread comparison is the one that matters. A company can earn a lower
    return than its industry and still create more value if its capital costs
    less, so the two comparisons can disagree and the disagreement is the point.
    """
    if not industry_norms:
        return {
            "applicable": False,
            "reason": "No industry benchmark is available for this company, so its return cannot be placed against its peers.",
        }
    win = _sorted_window(rows, 1)
    if not win:
        return {"applicable": False, "reason": "No data."}
    row = win[-1]

    def gap(a: Optional[float], b: Optional[float]) -> Optional[float]:
        return (a - b) if (a is not None and b is not None) else None

    stored_roic = _val(row, "ROIC")
    ic = _invested_capital(row)
    own_roic = stored_roic if stored_roic is not None else (
        _div(_nopat(row), ic) if (ic is not None and ic > 0) else None
    )
    own_wacc = industry_norms.get("ownWacc")
    own_spread = gap(own_roic, own_wacc)
    stored_roe = _val(row, "ROE")
    own_roe = stored_roe if stored_roe is not None else _div(_val(row, "Net Income"), _equity(row))

    ind_roic = industry_norms.get("roic")
    ind_wacc = industry_norms.get("wacc")
    ind_spread = industry_norms.get("spread")
    if ind_spread is None:
        ind_spread = gap(ind_roic, ind_wacc)
    ind_roe = industry_norms.get("roe")

    roic_gap = gap(own_roic, ind_roic)
    roe_gap = gap(own_roe, ind_roe)
    leverage_tell = None
    if roic_gap is not None and roe_gap is not None and roe_gap > roic_gap * 3 and roe_gap > 0.10:
        leverage_tell = (
            "The return on equity beats the industry by far more than the return on capital does. "
            "That distance is leverage rather than an operating advantage."
        )

    return {
        "applicable": True,
        "latestYear": _year(row),
        "industryName": industry_norms.get("name"),
        "universe": industry_norms.get("universe"),
        "company": {"roic": own_roic, "wacc": own_wacc, "spread": own_spread, "roe": own_roe},
        "industry": {"roic": ind_roic, "wacc": ind_wacc, "spread": ind_spread, "roe": ind_roe},
        "roicGap": roic_gap,
        "spreadGap": gap(own_spread, ind_spread),
        "roeGap": roe_gap,
        "leverageTell": leverage_tell,
        "benchmarkCaveat": (
            "This industry average is built from companies trading today, so companies that "
            "failed are missing from it and the average reads high. Industry labels are also "
            "current rather than historical."
        ),
    }


# ── 4. Expected growth against actual growth ─────────────────────────────────

def _revenue_regression(rows: Sequence[Row]) -> Optional[float]:
    """Log-linear OLS growth on revenue: regress ln(revenue) on a time index and
    take e^slope - 1. Uses every year, so one depressed endpoint cannot set the
    rate the way a two-point CAGR would."""
    vals = [v for v in (_val(r, "Revenue") for r in rows) if v is not None and v > 0]
    n = len(vals)
    if n < 3:
        return None
    xs = list(range(1, n + 1))
    ys = [math.log(v) for v in vals]
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return math.exp(sxy / sxx) - 1.0


def growth_expected_vs_actual(rows: Sequence[Row]) -> dict:
    """Expected growth (reinvestment rate x ROIC) built TWICE, against actual.

    The current-year figure and the five-year-average figure are both returned,
    always. Neither replaces the other. A single year of either input can be
    unusual, and the distance between the two is what tells the reader so.

    Nothing is floored. Where the reinvestment rate is negative the expected
    growth is negative, which is the honest reading of a firm consuming its
    asset base.
    """
    win = _sorted_window(rows)
    if len(win) < 2:
        return {"applicable": False, "reason": "Not enough history to compare expected growth against actual growth."}

    def roic(r: Row) -> Optional[float]:
        stored = _val(r, "ROIC")
        if stored is not None:
            return stored
        ic = _invested_capital(r)
        return _div(_nopat(r), ic) if (ic is not None and ic > 0) else None

    reinv = _series(win, _reinvestment_rate)
    roics = _series(win, roic)
    if not reinv or not roics:
        return {"applicable": False, "reason": "The reinvestment rate or the return on capital could not be computed."}

    r_now, k_now = reinv[-1][1], roics[-1][1]
    r_avg, k_avg = _mean([v for _, v in reinv]), _mean([v for _, v in roics])
    expected_now = r_now * k_now
    expected_avg = (r_avg * k_avg) if (r_avg is not None and k_avg is not None) else None
    actual = _revenue_regression(_sorted_window(rows, len(rows)))

    divergence = None
    if actual is not None:
        divergence = abs(actual - expected_now)

    # Retention x ROE, the equity-side twin. Reported alongside rather than
    # instead: for an equity-financed firm it is the expression that fits.
    latest = win[-1]
    payout = _val(latest, "Payout Ratio")
    retention = (1.0 - max(0.0, min(1.0, payout))) if payout is not None else None
    stored_roe = _val(latest, "ROE")
    roe_now = stored_roe if stored_roe is not None else _div(_val(latest, "Net Income"), _equity(latest))
    expected_equity = (retention * roe_now) if (retention is not None and roe_now is not None) else None

    return {
        "applicable": True,
        "latestYear": _year(latest),
        "expectedCurrent": expected_now,
        "expectedFiveYearAverage": expected_avg,
        "actual": actual,
        "divergence": divergence,
        "inputs": {
            "reinvestmentCurrent": r_now,
            "reinvestmentFiveYearAverage": r_avg,
            "roicCurrent": k_now,
            "roicFiveYearAverage": k_avg,
        },
        "equityLens": {
            "retention": retention,
            "roe": roe_now,
            "expected": expected_equity,
        },
        # Read backwards: the reinvestment a given growth rate demands.
        "reinvestmentRequiredForActual": (
            _div(actual, k_now) if (actual is not None and k_now not in (None, 0)) else None
        ),
        "note": (
            "Both figures are shown because neither replaces the other. The current year "
            "reports what this year's reinvestment and return imply. The five-year average "
            "reports what the same expression gives once one unusual year cannot dominate it."
        ),
    }


# ── 5. The reinvestment rate against its own history ─────────────────────────

def reinvestment_vs_history(rows: Sequence[Row], industry_norms: Optional[dict] = None) -> dict:
    """The reinvestment rate, current against its own five-year mean and median.

    Capex/depreciation travels alongside because it isolates the asset-renewal
    half of the rate and drops the working-capital swing that makes the headline
    figure jump around.
    """
    win = _sorted_window(rows)
    if not win:
        return {"applicable": False, "reason": "No data."}

    def capex_dep(r: Row) -> Optional[float]:
        capex = _val(r, "Capital Expenditure")
        dep = _val(r, "Depreciation and Amortization Cashflow")
        return _div(abs(capex), dep) if capex is not None else None

    cmp_ = _compare(_series(win, _reinvestment_rate))
    if cmp_ is None:
        return {"applicable": False, "reason": "The reinvestment rate could not be computed for any year in the window."}

    cd = _series(win, capex_dep)
    consuming = bool(cmp_["current"] is not None and cmp_["current"] < 0)
    below_renewal = bool(cd and cd[-1][1] < 1.0)

    return {
        "applicable": True,
        "latestYear": _year(win[-1]),
        **cmp_,
        "capexToDepreciation": {str(y): v for y, v in cd},
        "capexToDepreciationCurrent": cd[-1][1] if cd else None,
        "isConsumingAssetBase": consuming,
        "isBelowRenewal": below_renewal,
        "salesToInvestedCapital": (industry_norms or {}).get("ownSalesToCapital"),
        "industrySalesToInvestedCapital": (industry_norms or {}).get("industrySalesToCapital"),
        "industryReinvestmentRate": (industry_norms or {}).get("reinvestmentRate"),
        "benchmarkNote": (
            None if (industry_norms or {}).get("reinvestmentRate") is not None else
            "No industry reinvestment rate is available, so this rate cannot be placed against "
            "the rate this company's rivals sustain. Sales to invested capital is the only "
            "reinvestment benchmark carried against the industry today."
        ),
    }


# ── aggregator ───────────────────────────────────────────────────────────────

def build_returns_quality(
    rows: Sequence[Row], *, industry_norms: Optional[dict] = None
) -> Optional[dict]:
    """The whole Returns Quality block. Each method is independent, so one that
    cannot be computed reports its own reason and the rest still render."""
    if not rows:
        return None
    return {
        "applicable": True,
        "window": WINDOW,
        "roeHistory": roe_vs_history(rows),
        "roicHistory": roic_vs_history(rows),
        "roicIndustry": roic_vs_industry(rows, industry_norms),
        "growth": growth_expected_vs_actual(rows),
        "reinvestment": reinvestment_vs_history(rows, industry_norms),
    }
