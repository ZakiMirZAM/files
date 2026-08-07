"""Per-firm input extraction for the Damodaran engine (Ch. 11/13/14).

Pure functions over row-like mappings (sqlite3.Row or plain dicts, ascending
by fiscal year). Every estimator returns None when its inputs are missing or
meaningless — a caller never receives a fabricated number.

Sign conventions follow the warehouse (cash-flow statement values):
  "Capital Expenditure"          negative (outflow)   -> |capex| is the spend
  "Change In Working Capital"    positive = cash freed -> investment is -value
  "Dividends Paid"               negative (outflow)
  "Common Stock Repurchased"     negative (outflow)
"""
from __future__ import annotations

from typing import Any, Optional

DEFAULT_TAX_RATE = 0.21   # matches individualanalysis.DEFAULT_TAX_RATE

__all__ = [
    "row_val", "safe_div", "median",
    "effective_tax_rate", "nopat_for_row", "reinvestment_rate",
    "noncash_roe", "net_new_debt", "equity_reinvestment_rate",
    "augmented_payout",
]


# ── Row primitives (duplicated from individualanalysis on purpose: this
#    package must never import it, so the dependency points one way only) ─────

def row_val(row: Any, col: str) -> Optional[float]:
    if col not in row.keys():
        return None
    v = row[col]
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def safe_div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den is None or den == 0:
        return None
    return num / den


def median(values: list[Optional[float]]) -> Optional[float]:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    n = len(vals)
    mid = n // 2
    return vals[mid] if n % 2 == 1 else (vals[mid - 1] + vals[mid]) / 2.0


def effective_tax_rate(row: Any) -> float:
    """Income Tax Expense / Income Before Tax, clamped to a sane band; the
    marginal-rate fallback covers loss years and one-off credits."""
    rate = safe_div(row_val(row, "Income Tax Expense"),
                    row_val(row, "Income Before Tax"))
    if rate is None or rate < 0 or rate > 0.6:
        return DEFAULT_TAX_RATE
    return rate


def nopat_for_row(row: Any) -> Optional[float]:
    op = row_val(row, "Operating Income")
    if op is None:
        return None
    return op * (1.0 - effective_tax_rate(row))


def _depreciation(row: Any) -> Optional[float]:
    dep = row_val(row, "Depreciation and Amortization Cashflow")
    if dep is None:
        dep = row_val(row, "Depreciation And Amortization")
    return dep


def reinvestment_rate(row: Any) -> Optional[float]:
    """Firm-side reinvestment rate (Ch. 11): (net capex + change in noncash
    working capital) / NOPAT. Uncapped — the caller decides what an extreme
    value means (Damodaran's own examples exceed 100%)."""
    capex = row_val(row, "Capital Expenditure")
    dep = _depreciation(row)
    d_nwc = row_val(row, "Change In Working Capital")
    nopat = nopat_for_row(row)
    if capex is None or dep is None or d_nwc is None or nopat in (None, 0):
        return None
    return (abs(capex) - dep - d_nwc) / nopat


# ── FCFE-track inputs (Ch. 14): noncash ROE + equity reinvestment rate ───────

def _noncash_equity(row: Any) -> Optional[float]:
    eq = row_val(row, "Total Stockholders Equity")
    if eq is None:
        eq = row_val(row, "Total Equity")
    if eq is None:
        return None
    cash = row_val(row, "Cash And Short Term Investments")
    if cash is None:
        cash = row_val(row, "Cash And Cash Equivalents")
    return eq - (cash or 0.0)


def noncash_roe(rows: list[Any]) -> Optional[dict]:
    """Noncash return on equity (Ch. 14, Table 14.1):

        noncash NI  = Net income − Interest income × (1 − t)
        noncash BV  = Book equity − Cash & marketable securities
        noncash ROE = noncash NI / noncash BV

    Returns {"value": median across years, "latest": latest year's ratio,
    "noncashNetIncome", "noncashBookEquity"} or None."""
    if not rows:
        return None
    per_year: list[Optional[float]] = []
    latest_ni = latest_bv = None
    for row in rows:
        ni = row_val(row, "Net Income")
        bv = _noncash_equity(row)
        if ni is None or bv is None or bv <= 0:
            per_year.append(None)
            continue
        interest = row_val(row, "Interest Income") or 0.0
        nc_ni = ni - interest * (1.0 - effective_tax_rate(row))
        per_year.append(nc_ni / bv)
        latest_ni, latest_bv = nc_ni, bv
    med = median(per_year)
    if med is None:
        return None
    return {
        "value": round(med, 4),
        "latest": round(per_year[-1], 4) if per_year[-1] is not None else None,
        "noncashNetIncome": round(latest_ni, 2) if latest_ni is not None else None,
        "noncashBookEquity": round(latest_bv, 2) if latest_bv is not None else None,
    }


def net_new_debt(prev: Any, curr: Any) -> Optional[float]:
    """Net debt issued between two fiscal years, as the balance-sheet delta of
    Total Debt (the warehouse has no debt-issuance flow column)."""
    d0 = row_val(prev, "Total Debt")
    d1 = row_val(curr, "Total Debt")
    if d0 is None or d1 is None:
        return None
    return d1 - d0


def equity_reinvestment_rate(rows: list[Any], window: int = 5) -> Optional[dict]:
    """Equity reinvestment rate (Ch. 14):

        ERR = [(CapEx − Dep) + ΔNoncash WC − (Debt raised − Debt repaid)]
              / Net income

    aggregated over up to ``window`` recent years so one lumpy year does not
    speak for the firm. UNCAPPED — Damodaran's Tsingtao example runs at
    149.97% (the excess is funded by new equity). Net new debt comes from the
    Total Debt balance-sheet delta; when a year lacks it, the year falls back
    to the Ch. 14 short form (reinvestment × (1 − book debt-to-capital)) and
    the provenance says so. None when nothing is derivable."""
    if len(rows) < 1:
        return None
    use = rows[-window:]
    total_reinvest = 0.0
    total_ni = 0.0
    years_used = 0
    short_form_years = 0
    for i, row in enumerate(use):
        ni = row_val(row, "Net Income")
        capex = row_val(row, "Capital Expenditure")
        dep = _depreciation(row)
        d_nwc = row_val(row, "Change In Working Capital")
        if ni is None or capex is None or dep is None or d_nwc is None:
            continue
        gross = (abs(capex) - dep) - d_nwc     # firm-side reinvestment
        # Position of this row in the FULL list, to find its true prior year.
        full_idx = len(rows) - len(use) + i
        delta_debt = net_new_debt(rows[full_idx - 1], row) if full_idx >= 1 else None
        if delta_debt is not None:
            equity_reinvest = gross - delta_debt
        else:
            debt = row_val(row, "Total Debt")
            eq = row_val(row, "Total Stockholders Equity")
            if debt is not None and eq is not None and (debt + eq) > 0:
                equity_reinvest = gross * (1.0 - debt / (debt + eq))
                short_form_years += 1
            else:
                equity_reinvest = gross
                short_form_years += 1
        total_reinvest += equity_reinvest
        total_ni += ni
        years_used += 1
    if years_used == 0 or total_ni <= 0:
        return None
    return {
        "value": round(total_reinvest / total_ni, 4),
        "yearsUsed": years_used,
        "netDebtSource": ("balanceSheetDelta" if short_form_years == 0
                          else "shortFormBookDC"),
    }


# ── DDM-track inputs (Ch. 13.3): augmented, buyback-inclusive payout ─────────

def augmented_payout(rows: list[Any], window: int = 5) -> Optional[dict]:
    """Augmented payout ratio (Ch. 13.3):

        augmented payout = (Dividends + Buybacks) / Net income

    aggregated over up to ``window`` years because buybacks are lumpy — the
    book prescribes a 4-5 year aggregate, never one year. Also returns the
    buyback-adjusted ROE: buybacks shrink book equity and flatter ROE, so the
    recent years' buybacks are added back to equity before re-estimating it.
    ``buybacksIncluded`` is False when the repurchase column is empty for the
    whole window (common for foreign filers) — the conventional payout then
    stands in, honestly labeled."""
    if not rows:
        return None
    use = rows[-window:]
    total_div = 0.0
    total_bb = 0.0
    total_ni = 0.0
    years_used = 0
    saw_buyback_col = False
    for row in use:
        ni = row_val(row, "Net Income")
        if ni is None:
            continue
        div = row_val(row, "Dividends Paid")
        bb = row_val(row, "Common Stock Repurchased")
        if bb is not None:
            saw_buyback_col = True
        total_div += abs(div) if div is not None else 0.0
        total_bb += abs(bb) if bb is not None else 0.0
        total_ni += ni
        years_used += 1
    if years_used == 0 or total_ni <= 0:
        return None

    conventional = total_div / total_ni
    augmented = (total_div + total_bb) / total_ni

    # Buyback-adjusted ROE: NI over equity with the window's buybacks restored.
    latest = rows[-1]
    ni_latest = row_val(latest, "Net Income")
    eq_latest = row_val(latest, "Total Stockholders Equity")
    if eq_latest is None:
        eq_latest = row_val(latest, "Total Equity")
    roe_adj = None
    if ni_latest is not None and eq_latest is not None and (eq_latest + total_bb) > 0:
        roe_adj = ni_latest / (eq_latest + total_bb)

    return {
        "augmentedPayout": round(augmented, 4),
        "conventionalPayout": round(conventional, 4),
        "buybacksIncluded": saw_buyback_col,
        "buybackAdjustedRoe": round(roe_adj, 4) if roe_adj is not None else None,
        "yearsUsed": years_used,
    }
