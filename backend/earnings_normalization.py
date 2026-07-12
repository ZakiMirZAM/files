"""Damodaran-style earnings & capital normalization (Investment Valuation, Ch.9
"Measuring Earnings").

Financial statements misclassify several items relative to how a valuation should
treat them. This module restates reported figures into the normalized earnings and
capital Damodaran uses, and returns a reported→adjusted bridge for display:

  1. Operating leases → debt (Ch.9 "Converting Operating Leases into Debt"):
     the debt value of leases is added to conventional debt, and operating income
     is grossed up by the imputed interest on that lease debt (the approximate
     adjustment: Adjusted OI ≈ OI + lease_debt × pre-tax cost of debt).
  2. Income from investments / marketable securities (Ch.9 "Income from
     Investments and Cross Holdings"): for NON-financial firms, interest/investment
     income is stripped out of earnings and the securities are held aside to be
     added back at market value — never mingled with operating cash flows.
  3. One-time / non-recurring items (Ch.9 "Extraordinary, Recurring, and Unusual
     Items", the Xerox case): a normalized operating income is built from the
     firm's own through-the-cycle median operating margin, and years whose margin
     departs sharply from that median are flagged as candidate one-time distortions.
  4. Goodwill & stock-based compensation (Ch.9): SBC is kept as a real expense (NOT
     added back — Damodaran's position) but its drag is surfaced; a material
     year-over-year fall in goodwill is inferred as an impairment and treated as a
     one-time item.

Pure functions over ``rows`` (sqlite3.Row or dict — both index by column name), so
the block is unit-testable without a database. The caller supplies the pre-tax
cost of debt, the firm's effective tax rate, sector/industry, and (optionally, from
the Ch.9-faithful 10-K lease footnote via XBRL) the present value of operating
lease commitments; without that footnote the on-balance-sheet capital-lease figure
is used and is NOT double-counted into the WACC debt weight.
"""

from __future__ import annotations

from typing import Any, Optional, Sequence

Row = Any  # sqlite3.Row or dict — both support row[col] by column name.

# ── Financial-firm guard (mirrors individualanalysis._FCFF_GUARD_*) ──────────
# For a financial-services firm "that defines its business as the buying and
# selling of securities" (Ch.9) investment income IS operating, so the
# marketable-securities adjustment does not apply.
_FIN_SECTORS = {"Financial Services", "Real Estate"}
_FIN_INDUSTRY_KW = ("reit", "bank", "insurance", "mortgage", "capital markets")

# A year whose operating margin departs from the through-the-cycle median by more
# than this (in margin points) is flagged as a candidate one-time distortion.
_ONE_TIME_MARGIN_DEV = 0.10
# A year-over-year fall in goodwill larger than this share of total assets is
# inferred to be an impairment (a one-time, non-operating charge).
_GOODWILL_IMPAIR_MATERIALITY = 0.03
# Fallback pre-tax cost of debt when the caller cannot supply one.
_FALLBACK_PRETAX_KD = 0.061


# ── small self-contained helpers (no dependency on individualanalysis) ───────

def _val(row: Row, col: str) -> Optional[float]:
    """Numeric column value, or None (missing / non-numeric / NaN)."""
    try:
        v = row[col]
    except (KeyError, IndexError, TypeError):
        return None
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # drop NaN (f != f)


def _str(row: Row, col: str) -> Optional[str]:
    try:
        v = row[col]
    except (KeyError, IndexError, TypeError):
        return None
    return str(v) if v is not None else None


def _safe_div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den is None or den == 0:
        return None
    return num / den


def _median(values: Sequence[float]) -> Optional[float]:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    n = len(vals)
    mid = n // 2
    return vals[mid] if n % 2 else (vals[mid - 1] + vals[mid]) / 2.0


def is_financial(sector: Optional[str], industry: Optional[str]) -> bool:
    s = (sector or "").strip()
    ind = (industry or "").lower()
    return s in _FIN_SECTORS or any(k in ind for k in _FIN_INDUSTRY_KW)


def _sorted_rows(rows: list[Row]) -> list[Row]:
    """Ascending by fiscal year so ``rows[-1]`` is the latest (defensive — a
    DESC-sorted caller would otherwise normalize the oldest year)."""
    try:
        return sorted(rows, key=lambda r: int(r["Calendar Year"]))
    except (KeyError, IndexError, TypeError, ValueError):
        return rows


# ── 1. Operating leases → debt (Ch.9) ────────────────────────────────────────

def capitalize_leases(
    latest: Row,
    *,
    pretax_cost_of_debt: float,
    total_debt: float,
    lease_commitment_pv: Optional[float] = None,
) -> dict:
    """Restate operating leases as debt (Ch.9). ``lease_commitment_pv`` is the PV
    of future lease commitments from the 10-K footnote (Ch.9-faithful; supplied by
    the XBRL layer). When absent, the on-balance-sheet capital-lease figure is used
    for display only and is NOT added to the WACC debt weight (capital leases are
    conventionally already inside reported Total Debt, so re-adding double-counts).
    """
    reported_ebit = _val(latest, "Operating Income")
    if lease_commitment_pv is not None and lease_commitment_pv > 0:
        lease_debt = float(lease_commitment_pv)
        source = "xbrl_footnote"
        additive = True  # operating-lease PV is not in reported Total Debt
    else:
        lease_debt = _val(latest, "Capital Lease Obligations") or 0.0
        source = "balance_sheet_capital"
        additive = False

    if lease_debt <= 0:
        return {
            "applicable": False,
            "reason": (
                "No operating-lease commitments on file. A Ch.9-faithful "
                "capitalization needs the 10-K future-minimum-lease-payment "
                "footnote (added via the XBRL layer); the balance sheet shows no "
                "capital-lease obligation to display in the interim."
            ),
            "leaseSource": source,
        }

    imputed_interest = lease_debt * pretax_cost_of_debt
    adjusted_ebit = (reported_ebit + imputed_interest) if reported_ebit is not None else None
    additive_debt = lease_debt if additive else 0.0
    return {
        "applicable": True,
        "leaseSource": source,
        "leaseDebt": round(lease_debt, 2),
        "pretaxCostOfDebt": round(pretax_cost_of_debt, 4),
        "imputedInterest": round(imputed_interest, 2),
        "reportedEbit": round(reported_ebit, 2) if reported_ebit is not None else None,
        "adjustedEbit": round(adjusted_ebit, 2) if adjusted_ebit is not None else None,
        "conventionalDebt": round(total_debt, 2),
        "totalDebtWithLeases": round(total_debt + additive_debt, 2),
        "additiveDebtForWacc": round(additive_debt, 2),
        "waccImpact": additive,
        "note": (
            "Debt value of operating leases (PV of future lease commitments at the "
            "pre-tax cost of debt) added to conventional debt; operating income "
            "grossed up by the imputed lease interest (Damodaran Ch.9, approximate "
            "adjustment)."
            if additive else
            "On-balance-sheet capital leases are already inside reported Total Debt, "
            "so they are shown for context but NOT re-added to the WACC debt weight. "
            "True operating-lease capitalization awaits the 10-K lease footnote "
            "(XBRL layer)."
        ),
    }


# ── 2. Income from investments / marketable securities (Ch.9) ────────────────

def remove_investment_income(
    latest: Row,
    *,
    sector: Optional[str],
    industry: Optional[str],
    effective_tax: float,
) -> dict:
    """Strip interest/investment income out of earnings and hold marketable
    securities aside at market value (Ch.9) — for NON-financial firms only."""
    if is_financial(sector, industry):
        return {
            "applicable": False,
            "reason": (
                "Investment and securities income IS operating income for a "
                "financial-services firm (a bank, insurer, or REIT whose business "
                "is holding securities), so no adjustment is made (Damodaran Ch.9)."
            ),
        }

    interest_income = _val(latest, "Interest Income") or 0.0
    net_income = _val(latest, "Net Income")
    after_tax_investment_income = interest_income * (1.0 - effective_tax)
    core_net_income = (
        net_income - after_tax_investment_income if net_income is not None else None
    )
    securities = (_val(latest, "Short Term Investments") or 0.0) + (
        _val(latest, "Long Term Investments") or 0.0
    )
    pct_from_investments = _safe_div(after_tax_investment_income, net_income)
    return {
        "applicable": True,
        "interestIncome": round(interest_income, 2),
        "afterTaxInvestmentIncome": round(after_tax_investment_income, 2),
        "reportedNetIncome": round(net_income, 2) if net_income is not None else None,
        "coreNetIncome": round(core_net_income, 2) if core_net_income is not None else None,
        "pctFromInvestments": round(pct_from_investments, 4) if pct_from_investments is not None else None,
        "marketableSecuritiesHeldAside": round(securities, 2),
        "note": (
            "Interest/investment income (after tax) removed from earnings; "
            "marketable securities are valued separately and added back at market "
            "value rather than mingled with operating cash flows (Damodaran Ch.9). "
            "Excludes financial firms."
        ),
    }


# ── 3. One-time / non-recurring normalization (Ch.9, the Xerox case) ─────────

def _operating_margins(rows: list[Row]) -> list[tuple[int, float]]:
    out: list[tuple[int, float]] = []
    for r in rows:
        rev = _val(r, "Revenue")
        oi = _val(r, "Operating Income")
        m = _safe_div(oi, rev)
        yr = _val(r, "Calendar Year")
        if m is not None and yr is not None:
            out.append((int(yr), m))
    return out


def _inferred_goodwill_impairment(rows: list[Row]) -> Optional[dict]:
    """A material year-over-year fall in goodwill, not explained in the data by a
    divestiture, is treated as a one-time impairment charge (Ch.9)."""
    if len(rows) < 2:
        return None
    latest, prev = rows[-1], rows[-2]
    gw_now = _val(latest, "Goodwill")
    gw_prev = _val(prev, "Goodwill")
    assets = _val(latest, "Total Assets")
    if gw_now is None or gw_prev is None or assets is None or assets <= 0:
        return None
    drop = gw_prev - gw_now
    if drop <= 0 or (drop / assets) < _GOODWILL_IMPAIR_MATERIALITY:
        return None
    return {
        "year": int(_val(latest, "Calendar Year")),
        "impairment": round(drop, 2),
        "pctOfAssets": round(drop / assets, 4),
    }


def normalize_one_time(rows: list[Row]) -> dict:
    """Normalized operating income from the through-the-cycle median margin, plus
    the years whose margin departs sharply from it (candidate one-time items)."""
    margins = _operating_margins(rows)
    if len(margins) < 2:
        return {"applicable": False, "reason": "Fewer than two years of operating margin on file."}

    median_margin = _median([m for _, m in margins])
    latest = rows[-1]
    revenue = _val(latest, "Revenue")
    reported_ebit = _val(latest, "Operating Income")
    reported_margin = _safe_div(reported_ebit, revenue)
    normalized_ebit = (median_margin * revenue) if (median_margin is not None and revenue is not None) else None

    flagged = [
        {"year": yr, "margin": round(m, 4), "deviation": round(m - median_margin, 4)}
        for yr, m in margins
        if median_margin is not None and abs(m - median_margin) > _ONE_TIME_MARGIN_DEV
    ]
    impairment = _inferred_goodwill_impairment(rows)
    return {
        "applicable": normalized_ebit is not None,
        "medianOperatingMargin": round(median_margin, 4) if median_margin is not None else None,
        "reportedMargin": round(reported_margin, 4) if reported_margin is not None else None,
        "reportedEbit": round(reported_ebit, 2) if reported_ebit is not None else None,
        "normalizedEbit": round(normalized_ebit, 2) if normalized_ebit is not None else None,
        "flaggedYears": flagged,
        "inferredGoodwillImpairment": impairment,
        "note": (
            "Normalized operating income = the firm's own through-the-cycle median "
            "operating margin applied to current revenue, so one good or bad year "
            "does not anchor the valuation (Damodaran Ch.9). Flagged years and any "
            "inferred goodwill impairment mark candidate one-time distortions."
        ),
    }


# ── 4. Goodwill & stock-based compensation (Ch.9) ────────────────────────────

def goodwill_sbc(rows: list[Row]) -> dict:
    """Surface the SBC drag (kept as a real expense) and goodwill exposure /
    inferred impairment. SBC is NOT added back (Damodaran's position)."""
    latest = rows[-1]
    revenue = _val(latest, "Revenue")
    sbc = _val(latest, "Stock Based Compensation")
    ocf = _val(latest, "Operating Cash Flow")
    goodwill = _val(latest, "Goodwill")
    assets = _val(latest, "Total Assets")
    return {
        "sbc": round(sbc, 2) if sbc is not None else None,
        "sbcToRevenue": round(_safe_div(sbc, revenue), 4) if _safe_div(sbc, revenue) is not None else None,
        "sbcToOperatingCashFlow": round(_safe_div(sbc, ocf), 4) if _safe_div(sbc, ocf) is not None else None,
        "goodwill": round(goodwill, 2) if goodwill is not None else None,
        "goodwillToAssets": round(_safe_div(goodwill, assets), 4) if _safe_div(goodwill, assets) is not None else None,
        "inferredImpairment": _inferred_goodwill_impairment(rows),
        "note": (
            "Stock-based compensation is a real operating expense and is NOT added "
            "back (Damodaran Ch.9) — its dilution and margin drag are shown so the "
            "cost is not overlooked. A material year-over-year drop in goodwill is "
            "treated as a one-time impairment."
        ),
    }


# ── Aggregator ───────────────────────────────────────────────────────────────

def build_normalized_earnings(
    rows: list[Row],
    *,
    sector: Optional[str] = None,
    industry: Optional[str] = None,
    pretax_cost_of_debt: Optional[float] = None,
    effective_tax: float = 0.21,
    total_debt: Optional[float] = None,
    lease_commitment_pv: Optional[float] = None,
) -> Optional[dict]:
    """The full reported→adjusted normalization block (Damodaran Ch.9).

    ``additiveDebtForWacc`` is the incremental debt (operating-lease PV) the caller
    should fold into the WACC debt weight; it is 0 until the 10-K lease footnote is
    supplied, so today's WACC is unchanged and never double-counts capital leases.
    """
    if not rows:
        return None
    rows = _sorted_rows(rows)
    latest = rows[-1]
    sector = sector if sector is not None else _str(latest, "t_sector")
    industry = industry if industry is not None else _str(latest, "t_industry")
    kd = pretax_cost_of_debt if (pretax_cost_of_debt is not None and pretax_cost_of_debt > 0) else _FALLBACK_PRETAX_KD
    debt = total_debt if total_debt is not None else (_val(latest, "Total Debt") or 0.0)

    leases = capitalize_leases(
        latest, pretax_cost_of_debt=kd, total_debt=debt, lease_commitment_pv=lease_commitment_pv,
    )
    investments = remove_investment_income(
        latest, sector=sector, industry=industry, effective_tax=effective_tax,
    )
    one_time = normalize_one_time(rows)
    gw_sbc = goodwill_sbc(rows)

    additive = leases.get("additiveDebtForWacc", 0.0) if leases.get("applicable") else 0.0
    return {
        "leases": leases,
        "investmentIncome": investments,
        "oneTime": one_time,
        "goodwillSbc": gw_sbc,
        "additiveDebtForWacc": round(additive, 2),
        "excludesFinancials": is_financial(sector, industry),
    }
