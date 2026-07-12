"""Uses of cash: what management actually did with each year's operating cash flow.

This module answers one question and nothing more. Given a company's fiscal-year
rows, where did the cash go: capital expenditure, research and development,
acquisitions, share buybacks, dividends, or paying down debt.

It exists as a backend block rather than a frontend reconstruction for one reason:
THE SIGN CONVENTION IN THIS DATABASE IS NOT UNIFORM, and getting it wrong produces
a chart that is confidently, plausibly wrong.

Measured across all 346,000 rows of the live financials table:

    Capital Expenditure         329,977 negative /   1,131 positive  -> abs() is safe
    Common Stock Repurchased     93,612 negative /   1,348 positive  -> abs() is safe
    Dividends Paid              221,227 negative /      12 positive  -> abs() is safe
    Research And Development      1,526 negative / 164,368 positive  -> stored positive
    Debt Repayment              142,906 negative / 133,287 positive  -> AMBIGUOUS
    Acquisitions Net             94,693 negative / 118,490 positive  -> AMBIGUOUS
    Operating Cash Flow          94,788 negative                     -> denominator trap

"Debt Repayment" and "Acquisitions Net" are NET figures. They flip sign, and the
sign carries the meaning:

    Debt Repayment  < 0  the company repaid debt          -> a USE of cash
    Debt Repayment  > 0  the company borrowed, net        -> a SOURCE of cash
    Acquisitions Net < 0 the company bought businesses    -> a USE of cash
    Acquisitions Net > 0 divestitures exceeded purchases  -> a SOURCE of cash

Johnson & Johnson's FY2025 "Debt Repayment" is +9,637,000,000. That is nearly ten
billion dollars of net BORROWING. Calling abs() on it, which is what a naive reader
of the column name would do, would draw that borrowing as if management had spent
ten billion dollars paying debt down. The house style in individualanalysis.py
never abs()es these two columns, and this module does not either.

Two further rules, for the same reason:

  * A share of operating cash flow is only computed when operating cash flow is
    POSITIVE. Dividing by a negative denominator returns a negative percentage that
    reads as the opposite of the truth.
  * A NULL is not a zero. The yfinance daily-update path maps a narrow column set,
    so fiscal years appended that way carry NULL for the financing lines. Alphabet
    has NULL buybacks, debt repayment and acquisitions for FY2023, FY2024 and
    FY2025. Rendering those as 0 would state that Alphabet bought back no stock.
    Every field therefore carries a `reported` flag, and the caller must render an
    unreported field as unknown rather than as nothing spent.

Grounding for the analysis this feeds (the project's RAG vault): Giroux, "Capital
Allocation"; Thorndike, "The Outsiders"; Damodaran, "Applied Corporate Finance";
Fridson, "Financial Statement Analysis". Their shared instruction is to read each
use as a SHARE of operating cash flow and to watch the drift over time, because the
drift is more revealing than the level in any single year.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Mapping, Optional, Sequence

Row = Mapping[str, Any] | sqlite3.Row

# Columns that are reliably stored as a negative number when cash left the company.
# abs() is safe here and only here.
_RELIABLY_NEGATIVE = {
    "capex": "Capital Expenditure",
    "buybacks": "Common Stock Repurchased",
    "dividends": "Dividends Paid",
}

# Stored positive. R&D is an income-statement expense, not a cash-flow outflow line,
# but it is a genuine use of cash and the capital-allocation literature treats it as
# one, so it belongs in the mix.
_RND = "Research And Development Expenses"

# Signed. The sign is the meaning. See the module docstring.
_ACQUISITIONS = "Acquisitions Net"
_DEBT = "Debt Repayment"

_OCF = "Operating Cash Flow"

USE_KEYS: tuple[str, ...] = (
    "capex", "rnd", "acquisitions", "buybacks", "dividends", "debtRepaid",
)

_NEGATIVE_OCF_REASON = (
    "Operating cash flow was negative this year, so a share of it cannot be "
    "computed. A negative denominator would turn every use of cash into a negative "
    "percentage, which reads as the opposite of what happened. The dollar amounts "
    "are still shown."
)


def _row_val(row: Row, col: str) -> Optional[float]:
    """Safe read. Returns None for a missing column, a NULL, or a non-number."""
    try:
        keys = row.keys() if hasattr(row, "keys") else ()
        if col not in keys:
            return None
        v = row[col]
    except (KeyError, IndexError, TypeError):
        return None
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _split_signed(value: Optional[float]) -> tuple[float, float]:
    """A signed net column into (outflow, inflow), both non-negative.

    A negative value is cash leaving the company, so it becomes the outflow. A
    positive value is cash arriving (net borrowing, or divestitures exceeding
    purchases), so it becomes the inflow and the outflow is zero. Never abs().
    """
    if value is None:
        return 0.0, 0.0
    if value < 0:
        return abs(value), 0.0
    return 0.0, value


def build_uses_of_cash(rows: Sequence[Row]) -> dict[str, Any]:
    """Per fiscal year, how operating cash flow was spent.

    Args:
        rows: One mapping per fiscal year. Any order is accepted; the rows are
            sorted ascending by "Calendar Year" before anything reads them
            positionally, which is a hard invariant in this repo.

    Returns:
        A JSON-safe dict. When there is no usable history it returns
        ``{"applicable": False, "reason": ...}`` rather than raising.
    """
    if not rows:
        return {"applicable": False,
                "reason": "No financial history is on file for this company."}

    ordered = sorted(rows, key=lambda r: int(_row_val(r, "Calendar Year") or 0))

    years: list[dict[str, Any]] = []
    totals: dict[str, float] = {k: 0.0 for k in USE_KEYS}
    total_ocf = 0.0
    any_use = False
    any_positive_ocf = False

    for row in ordered:
        year = _row_val(row, "Calendar Year")
        if year is None:
            continue
        ocf = _row_val(row, _OCF)

        uses: dict[str, Optional[float]] = {}
        reported: dict[str, bool] = {}

        for key, col in _RELIABLY_NEGATIVE.items():
            raw = _row_val(row, col)
            reported[key] = raw is not None
            uses[key] = abs(raw) if raw is not None else None

        rnd_raw = _row_val(row, _RND)
        reported["rnd"] = rnd_raw is not None
        # R&D is stored positive. A stray negative is a data error, not a cash
        # inflow from research, so clip rather than invent a source of cash.
        uses["rnd"] = max(0.0, rnd_raw) if rnd_raw is not None else None

        acq_raw = _row_val(row, _ACQUISITIONS)
        acq_out, acq_in = _split_signed(acq_raw)
        reported["acquisitions"] = acq_raw is not None
        uses["acquisitions"] = acq_out if acq_raw is not None else None

        debt_raw = _row_val(row, _DEBT)
        debt_out, debt_in = _split_signed(debt_raw)
        reported["debtRepaid"] = debt_raw is not None
        uses["debtRepaid"] = debt_out if debt_raw is not None else None

        # Cash that came IN. Never stacked with the uses, because borrowing is not
        # spending. Surfaced so the reader can see why a year's uses look small.
        sources = {
            "netDebtRaised": debt_in if (debt_raw is not None and debt_in > 0) else None,
            "netDivestitures": acq_in if (acq_raw is not None and acq_in > 0) else None,
        }

        known = [v for v in uses.values() if v is not None]
        total_uses = sum(known) if known else None
        if known:
            any_use = True

        ocf_positive = ocf is not None and ocf > 0
        if ocf_positive:
            any_positive_ocf = True
            share = {k: (v / ocf if v is not None else None) for k, v in uses.items()}
            total_share = (total_uses / ocf) if total_uses is not None else None
            share_reason = None
        else:
            share = None
            total_share = None
            share_reason = _NEGATIVE_OCF_REASON if ocf is not None else (
                "Operating cash flow is not reported for this year, so a share of it "
                "cannot be computed."
            )

        for k in USE_KEYS:
            v = uses.get(k)
            if v is not None:
                totals[k] += v
        if ocf is not None:
            total_ocf += ocf

        years.append({
            "year": int(year),
            "operatingCashFlow": ocf,
            "ocfPositive": ocf_positive,
            "uses": uses,
            "reported": reported,
            "sources": sources,
            "shareOfOcf": share,
            "shareReason": share_reason,
            "totalUses": total_uses,
            "totalUsesShareOfOcf": total_share,
        })

    if not years or not any_use:
        return {"applicable": False,
                "reason": "This company does not report the cash-flow lines needed "
                          "to show how its operating cash flow was used."}

    total_share_of_ocf = (
        {k: (totals[k] / total_ocf) for k in USE_KEYS} if total_ocf > 0 else None
    )
    grand_total_uses = sum(totals.values())

    return {
        "applicable": True,
        "years": years,
        "totals": totals,
        "totalOperatingCashFlow": total_ocf if total_ocf else None,
        "totalUses": grand_total_uses,
        "totalShareOfOcf": total_share_of_ocf,
        "anyPositiveOcf": any_positive_ocf,
        "note": (
            "Each use is shown as a share of operating cash flow as well as in "
            "dollars, because the drift in the shares over time says more than the "
            "level in any one year. Net borrowing and net divestitures are cash "
            "coming in, so they are reported as sources and are never drawn as uses."
        ),
    }
