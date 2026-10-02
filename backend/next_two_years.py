"""Next two years: the cash-flow model's first two projected years beside the
last reported year and, when it ties to our own reported figures, the analyst
consensus from Yahoo Finance.

The consensus is a comparison column, never a model input. Analysts' edge is
short-term (a year or two out), and the teaching point is the inconsistency
between their numbers and the company's fundamentals (Investment Valuation,
Ch.11). A consensus figure is therefore shown only when Yahoo's year-ago figure
is the number we report for the same fiscal year, within 5%. When it is not,
the estimate is on another basis (per depositary receipt, another currency, a
restated share count, a fiscal year our data does not have yet) and is hidden
with the reason instead of shown beside a figure it cannot be compared with.

Payload contract: ``analysis.nextTwoYears``.
"""
from __future__ import annotations

from typing import Any, Optional

TIE_TOLERANCE = 0.05   # GAAP vs analyst-basis EPS drifts 3-4% (MSFT, NVDA); an ADR is off by a multiple

_ROW_KEYS = ("revenue", "operatingMargin", "nopat", "reinvestment", "fcff", "roic", "eva", "eps")
_MODEL_KEY = {"revenue": "revenue", "operatingMargin": "operatingMargin", "nopat": "ebitAfterTax",
              "reinvestment": "reinvestment", "fcff": "fcff", "roic": "roic"}


def _field(row: Any, col: str) -> Any:
    try:
        return row[col]
    except (IndexError, KeyError):
        return None


def _digits(key: str) -> int:
    """Rates to 6 places, per-share to 4 (a 2-place EPS zeroes a penny stock), money to 2."""
    return 6 if key in ("operatingMargin", "roic") else 4 if key == "eps" else 2


def _r(v: Optional[float], nd: int) -> Optional[float]:
    return round(v, nd) if v is not None else None


def _months(ym: Any) -> Optional[int]:
    """``YYYY-MM`` or an ISO date as a month count, for fiscal-year matching."""
    try:
        return int(ym[:4]) * 12 + int(ym[5:7])
    except (TypeError, ValueError):
        return None


def _growth(new: Optional[float], base: Optional[float]) -> Optional[float]:
    """Growth only between two positive figures: across a loss it has no meaning."""
    if new is None or base is None or new <= 0 or base <= 0:
        return None
    return round(new / base - 1.0, 6)


def _reinvestment(ia, row: Any) -> Optional[float]:
    """Net capital spending plus the increase in noncash working capital, the
    numerator of ``valuation.inputs.reinvestment_rate``: the definition the
    model's fundamental growth (reinvestment rate x ROIC) is measured with.
    "Change In Working Capital" is the cash-flow line (positive = cash freed),
    so an increase in working capital enters with its sign flipped."""
    capex = ia._row_val(row, "Capital Expenditure")
    dep = ia._row_val(row, "Depreciation and Amortization Cashflow")
    if dep is None:
        dep = ia._row_val(row, "Depreciation And Amortization")
    d_nwc = ia._row_val(row, "Change In Working Capital")
    if capex is None or dep is None or d_nwc is None:
        return None
    return abs(capex) - dep - d_nwc


def _fiscal_year_reason(estimates: dict, latest: Any) -> Optional[str]:
    """Whether Yahoo's last reported fiscal year is ours. Matched on the row's
    statement date (year and month, one month of slack for 52/53-week years),
    not on the "Calendar Year" label, which runs a year behind the date for
    about 12% of rows (most fiscal years ending in March). Yahoo a year ahead
    means our data has not caught up; behind or unknown means nothing ties."""
    yahoo_fye = estimates.get("lastFiscalYearEnd")
    yahoo = _months(yahoo_fye)
    if yahoo is None:
        return "does_not_tie"
    ours = _months(_field(latest, "Date"))
    if ours is None:  # no statement date on the row: the label is all there is
        gap, slack = int(yahoo_fye[:4]) - int(latest["Calendar Year"]), 0
    else:
        gap, slack = yahoo - ours, 1
    if abs(gap) <= slack:
        return None
    return "database_behind" if gap > 0 else "does_not_tie"


def _consensus(estimates: Optional[dict], latest: Any, currency: Optional[str],
               reported: dict) -> Optional[dict]:
    if not estimates:
        return None
    fy_reason = _fiscal_year_reason(estimates, latest)
    fin_ccy = estimates.get("financialCurrency")
    # A NULL reporting currency is unknown, not a mismatch: the tie-out decides.
    same_ccy = not (currency and fin_ccy) or currency == fin_ccy
    current = estimates.get("current") or {}

    next_fye = estimates.get("nextFiscalYearEnd")
    # Label consensus years from our last reported year, never from Yahoo's
    # date, so "current" and "next" always sit under the model's two years
    # (Yahoo a year ahead, a lagging label, a 52/53-week year end). The real
    # year end stays in fiscalYearEnd.
    first_year = int(latest["Calendar Year"]) + 1

    years = []
    for i, label in enumerate(("current", "next")):
        entry: dict = {
            "label": label,
            "fiscalYear": first_year + i,
            "fiscalYearEnd": (f"{int(next_fye[:4]) + i}{next_fye[4:7]}"
                              if _months(next_fye) is not None else None),
        }
        for metric in ("revenue", "eps"):
            est = (estimates.get(label) or {}).get(metric)
            db_val = reported[metric]
            year_ago = (current.get(metric) or {}).get("yearAgo")   # Yahoo's figure for OUR last year
            ties = (same_ccy and year_ago is not None and db_val is not None
                    and abs(year_ago - db_val) <= TIE_TOLERANCE * abs(db_val))
            if fy_reason:
                reason = fy_reason
            elif not est or est.get("avg") is None:
                reason = "no_coverage"
            elif not ties:
                reason = "does_not_tie"
            else:
                reason = None
            if reason:
                entry[metric] = None
            else:
                nd = _digits(metric)
                base = db_val if label == "current" else (current.get(metric) or {}).get("avg")
                entry[metric] = {
                    "avg": _r(est["avg"], nd), "low": _r(est.get("low"), nd),
                    "high": _r(est.get("high"), nd), "analysts": est.get("analysts"),
                    "growth": _growth(est["avg"], base),
                }
            entry[f"{metric}HiddenReason"] = reason
        years.append(entry)
    return {"source": "Yahoo Finance", "years": years}


def build_next_two_years(rows: list, forecast: Optional[dict],
                         estimates: Optional[dict]) -> dict:
    """``analysis.nextTwoYears``: last reported year, the model's first two
    projected years, and the tied-out consensus (``estimates`` is
    ``financial_db.estimates_from_yf`` output, or None).

    The last-reported column uses the model's own definitions, so a reader
    compares like with like: NOPAT at the latest row's effective tax rate (the
    rate the projection runs on), reinvestment as the growth engine measures it,
    FCFF = NOPAT - reinvestment, ROIC as the page and the model's return path
    read it, and EVA charged on capital at the START of the year, as the model's
    EVA is. The model projects no EPS, so its EPS cells are null."""
    import individualanalysis as ia  # lazy: individualanalysis imports this module

    if not rows:
        return {"applicable": False, "reason": "No reported fiscal years on file."}
    if not forecast or forecast.get("applicable") is False:
        reason = (forecast or {}).get("reason") or (forecast or {}).get("notApplicableReason")
        return {"applicable": False,
                "reason": reason or "The cash-flow model could not project this company."}
    proj = forecast.get("rows") or []
    if len(proj) < 2 or len(forecast.get("years") or []) < 2:
        return {"applicable": False,
                "reason": "The cash-flow model has fewer than two projected years."}

    rows = sorted(rows, key=lambda r: int(r["Calendar Year"]))
    latest = rows[-1]
    last_year = int(latest["Calendar Year"])
    prior = rows[-2] if len(rows) > 1 and int(rows[-2]["Calendar Year"]) == last_year - 1 else None
    currency = next((c for c in (_field(r, "Reported Currency") for r in reversed(rows)) if c), None)

    revenue = ia._row_val(latest, "Revenue")
    nopat = ia._nopat_for_row(latest)
    reinvestment = _reinvestment(ia, latest)
    wacc = (forecast.get("waccBuild") or {}).get("wacc") or (forecast.get("assumptions") or {}).get("wacc")
    ic_start = ia._invested_capital(prior) if prior is not None else None
    last = {
        "revenue": revenue,
        "operatingMargin": ia._safe_div(ia._row_val(latest, "Operating Income"), revenue),
        "nopat": nopat,
        "reinvestment": reinvestment,
        "fcff": nopat - reinvestment if None not in (nopat, reinvestment) else None,
        "roic": ia._compute_return_ratios(latest).get("Return On Invested Capital"),
        "eva": nopat - wacc * ic_start if None not in (nopat, wacc, ic_start) else None,
        "eps": ia._row_val(latest, "EPS Diluted"),
    }
    eva_proj = (forecast.get("eva") or {}).get("projected") or []

    out_rows = []
    for key in _ROW_KEYS:
        if key == "eps":
            model = [None, None]
        elif key == "eva":
            model = [eva_proj[i].get("eva") if i < len(eva_proj) else None for i in (0, 1)]
        else:
            model = [proj[i].get(_MODEL_KEY[key]) for i in (0, 1)]
        nd = _digits(key)
        out_rows.append({"key": key, "lastReported": _r(last[key], nd),
                         "model1": _r(model[0], nd), "model2": _r(model[1], nd)})

    history = []
    for r in rows[-5:]:
        rev = ia._row_val(r, "Revenue")
        history.append({
            "year": int(r["Calendar Year"]),
            "revenue": _r(rev, 2),
            "operatingMargin": _r(ia._safe_div(ia._row_val(r, "Operating Income"), rev), 6),
            "eps": _r(ia._row_val(r, "EPS Diluted"), 4),
        })

    return {
        "applicable": True,
        "currency": currency,
        "lastFiscalYear": last_year,
        "modelYears": [int(y) for y in forecast["years"][:2]],
        "rows": out_rows,
        "consensus": _consensus(estimates, latest, currency,
                                {"revenue": revenue, "eps": last["eps"]}),
        "history": history,
    }
