"""fx_convert.py — one place that converts an ABSOLUTE figure from the currency
it was quoted in into the currency a financial statement is reported in.

Why this exists: a market cap fetched from a live quote is denominated in the
**quote** currency of the listing (yfinance ``fast_info.currency``), while every
row in ``financials`` is denominated in that filer's **reporting** currency
(``"Reported Currency"``). Writing one into the other silently produces a cap
that is wrong by the whole exchange rate — TSM's TWD row held the USD cap of its
US ADR, so every consumer that then multiplied by ``fx_rates`` TWD→USD reported
a $69B company with a 1.3x P/E.

Rules this module encodes, and which callers must not re-implement:

* ``cap_reporting = cap_quote × usd_per_unit[quote] ÷ usd_per_unit[reporting]``.
* USD is 1.0 even when the ``fx_rates`` table has no row for it.
* Same currency is a **no-op** and needs no rate at all.
* A missing rate, or a currency code that is not a currency (the warehouse holds
  ``'Unavailable'`` and other junk in ``"Reported Currency"``), returns ``None``.
  Callers treat ``None`` as "do NOT write" and keep the stored value.
* Minor units are real: the London Stock Exchange quotes in **pence** (``GBp`` /
  ``GBX``), Tel Aviv in **agorot** (``ILA``) and Johannesburg in **cents**
  (``ZAc``). yfinance reports those as the quote currency, so one hundredth of
  the major unit has to be divided out or the cap comes back 100x too large.

Nothing here touches the network or the database, so it is cheap to import and
trivial to test.

A RATIO is never converted. Ratios are currency-neutral by construction; running
one through this module would be a bug, not a rounding difference.
"""

from __future__ import annotations

# Upper bound on a market cap used as a WEIGHT, in USD. One hundred trillion
# dollars is roughly the whole world's listed equity, so a single row above it
# is a corrupt source figure rather than a company. The warehouse holds several:
# one Wisesheets row claimed 3.2e17, BREN.JK claims $477 trillion and GMKN.ME
# $255 trillion, and a market-cap-weighted average lets one of those decide the
# whole group's number.
#
# This lives here, beside the currency conversion, because the bound only means
# anything once the cap is expressed in USD: a bound applied to a local-currency
# cap would reject a legitimate KRW or IDR filer. Both weighting paths import
# it rather than repeating the literal — ``industry_averages``' SQL aggregates
# and the ``api`` scorecard matrices.
#
# A figure at or above the bound is DROPPED from both numerator and denominator,
# never clamped: a clamped weight is still a fabricated one.
MAX_MARKET_CAP_USD = 1e14

# quote code (exactly as a data source spells it) -> (major ISO code, minor units
# per major unit). Only entries whose divisor is not 1 need to be listed; every
# other code is treated as a major unit of itself.
#
# ``GBp`` and ``GBP`` differ only in case and mean different things (pence vs
# pounds), so the pence spellings are matched case-SENSITIVELY. ``ILA`` and
# ``ZAc`` have no such clash, so they are matched case-insensitively.
_MINOR_EXACT: dict[str, tuple[str, float]] = {
    "GBp": ("GBP", 100.0),
    "GBX": ("GBP", 100.0),
    "GBx": ("GBP", 100.0),
}
_MINOR_UPPER: dict[str, tuple[str, float]] = {
    "ILA": ("ILS", 100.0),   # Israeli agorot
    "ILS AGOROT": ("ILS", 100.0),
    "ZAC": ("ZAR", 100.0),   # South African cents
}


def normalize_currency(code: object) -> tuple[str, float] | None:
    """``code`` -> ``(major ISO code, minor units per major unit)``.

    ``"GBp"`` -> ``("GBP", 100.0)``; ``"usd"`` -> ``("USD", 1.0)``. Returns
    ``None`` for anything that is not a plausible currency code, which includes
    the ``'Unavailable'`` and empty-string junk the warehouse holds."""
    if code is None:
        return None
    raw = str(code).strip()
    if not raw:
        return None
    exact = _MINOR_EXACT.get(raw)
    if exact is not None:
        return exact
    upper = raw.upper()
    minor = _MINOR_UPPER.get(upper)
    if minor is not None:
        return minor
    # A currency code is three letters. Anything else is junk, not a currency.
    if len(upper) != 3 or not upper.isalpha():
        return None
    return (upper, 1.0)


def usd_per_unit(code: object, rates: dict[str, float] | None) -> float | None:
    """USD value of one unit of ``code`` (minor units included), or ``None`` when
    the code is junk or the table has no rate for it. USD is always 1.0."""
    norm = normalize_currency(code)
    if norm is None:
        return None
    major, divisor = norm
    rate = (rates or {}).get(major)
    if rate is None and major == "USD":
        rate = 1.0
    if rate is None or rate <= 0:
        return None
    return rate / divisor


def convert_amount(
    amount: float | None,
    quote_currency: object,
    reporting_currency: object,
    rates: dict[str, float] | None,
) -> float | None:
    """``amount`` (denominated in ``quote_currency``) expressed in
    ``reporting_currency``.

    Returns ``None`` when the amount is missing, when either currency is absent
    or unparseable, or when either side has no rate — never a guessed 1:1. The
    same currency on both sides is a no-op and needs no rate, so a filer whose
    currency is missing from ``fx_rates`` still gets its own cap written."""
    if amount is None:
        return None
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return None

    q = normalize_currency(quote_currency)
    r = normalize_currency(reporting_currency)
    if q is None or r is None:
        return None
    if q == r:
        return value

    q_usd = usd_per_unit(quote_currency, rates)
    r_usd = usd_per_unit(reporting_currency, rates)
    if q_usd is None or r_usd is None:
        return None
    return value * q_usd / r_usd
