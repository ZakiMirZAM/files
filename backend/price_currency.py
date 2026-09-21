"""price_currency.py — one place that decides whether a market quote and a
model's per-share value are the same kind of number, and reconciles them when
they are not.

Why this exists. Every per-share figure the valuation engines produce is per
ORDINARY share, in the filer's own reporting currency, because it is built out
of ``financials`` rows that are denominated that way. The market quote is
whatever the LISTING trades in. For a foreign filer trading in the United
States through a depositary receipt those are two different things twice over:

* the currency differs (TSM reports in TWD, its receipt quotes in USD), and
* the unit differs (one receipt is several ordinary shares).

Taken as raw numbers they produced a margin of safety of +357.95 percent for
TSM: intrinsic 1990.55 (TWD, per ordinary share) against 434.67 (USD, per
receipt). Reconciled at about 0.0312 TWD per USD and five ordinary shares per
receipt the same model says roughly 313 dollars against a 434.67 dollar quote,
which is about minus 28 percent. A plus 358 looks like the finding of a
lifetime and a minus 28 looks like an expensive stock, and only one of them is
a comparison.

The rules, in the order they are applied:

1. **No quote** is not a mismatch. The caller falls back to its usual market
   cap over shares, which is denominated the way the stored rows are.
2. **An unparseable reporting currency** leaves the quote alone. The warehouse
   holds NULL and junk in ``"Reported Currency"``, and a US filer with a
   missing currency must behave exactly as it did before.
3. **The same currency** is a no-op, which covers every US filer and every
   ordinary foreign listing quoted at home (2330.TW in TWD).
4. **A known ordinary-shares-per-receipt ratio** reconciles properly:
   ``quote x fx(quote to reporting) / ratio``. Minor units (GBp, ILA, ZAc) are
   handled by ``fx_convert`` on the way through.
5. **An interlisted ordinary share** (a Canadian filer's NYSE or Nasdaq line)
   is the same share on two exchanges, one for one, so it needs an exchange
   rate and nothing else. This is a fact about how Canadian issuers list, not
   an assumption about any one of them, and the list is Canada alone.
6. **A depositary receipt with no ratio on file** cannot be compared at all.
   The margin of safety, the reverse DCF and any verdict component built on
   price against value come back ``{"applicable": False, "reason": ...}``
   rather than as a number nobody can act on.
7. **Any other cross-currency listing** (a CNY filer quoted in HKD, a .TO line
   quoted in CAD over statements in USD) converts by exchange rate alone.

Nothing here touches the network or the database. The exchange rates arrive as
a plain ``{currency: usd_per_unit}`` mapping, which is what
``FinancialDB.get_fx_rates()`` returns.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Optional

import fx_convert


# ── Switching a receipt on (what the owner has to add) ──────────────────────
#
# Every US-listed foreign filer whose statements are in a currency other than
# its quote comes back "not applicable" until a deposit ratio is on file. To
# turn one on, add a ``ratios`` object to ``adr_mapping.json`` at the repo root,
# keyed by the US symbol, holding the number of ORDINARY SHARES PER RECEIPT:
#
#     {
#       "matches": { ... leave as it is ... },
#       "log":     [ ... leave as it is ... ],
#       "ratios": {
#         "TSM":  5,
#         "ASML": 1,
#         "BABA": 8
#       }
#     }
#
# An entry may instead be written as an object, ``{"ratio": 5}``, and a ratio
# added to an existing ``matches`` entry under ``ordinarySharesPerAdr`` is read
# too. Any of the three works; the loader below takes whichever it finds.
#
# The figure MUST come from the depositary's own published terms (the deposit
# agreement, or the ratio the depositary bank states for that programme), not
# from arithmetic. A ratio worked out by dividing a live market cap by a stored
# share count divides one vendor's spot snapshot by another vendor's
# fiscal-year figure and moves silently with either. A ratio is also NOT
# permanent: a programme can be split or combined, and when it is, the number
# here has to be updated or every margin of safety for that company is wrong by
# the change. Record the source beside it if that helps.
#
# No code change is needed. Adding a ratio routes that ticker from the refusal
# branch straight to the proper reconciliation, on the next process start.
#
# What does NOT need a ratio: an interlisted ordinary share (see
# INTERLISTED_ORDINARY_CURRENCIES below), which is the same share on two
# exchanges and needs only an exchange rate.

# ── Depositary-receipt ratios ───────────────────────────────────────────────
#
# There are none on file today, and this module does not guess one.
#
# ``adr_mapping.json`` at the repo root is the only ADR data in the tree. It
# holds two keys: ``matches``, six entries mapping a LOCAL exchange symbol to
# its US symbol with a name and a market cap (``{"2330.TW": {"us": "TSM",
# "name": ..., "mc": ...}}``), and ``log``, five hundred foreign symbols that
# found no US match. No entry carries a ratio, and no other file in the repo
# does either; ``backend/betas/bottom_up.py`` reads the same file purely to
# find a US sibling to borrow a beta from.
#
# A ratio could be DERIVED from a live market cap over the stored ordinary
# share count, but that divides one vendor's snapshot by another vendor's
# fiscal-year figure and would silently move with either. A ratio is a
# published fact about the deposit agreement; until one is on file the honest
# answer is that the comparison cannot be made.
#
# The loader below reads a ratio from ``adr_mapping.json`` the moment one is
# added, under either spelling, keyed by the US symbol.
_RATIO_FIELDS = ("ordinarySharesPerAdr", "ordinary_shares_per_adr", "ratio")

_RATIOS: Optional[dict[str, float]] = None


def _repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_ratios() -> dict[str, float]:
    """``{US symbol: ordinary shares per receipt}`` from ``adr_mapping.json``.

    Read once per process. A malformed file, a missing file and a file with no
    ratios in it all give the same empty mapping, which routes every receipt to
    the not-applicable branch rather than to a guess.
    """
    global _RATIOS
    if _RATIOS is not None:
        return _RATIOS
    out: dict[str, float] = {}
    try:
        with open(os.path.join(_repo_root(), "adr_mapping.json"), encoding="utf-8") as fh:
            raw = json.load(fh)
    except Exception:  # noqa: BLE001 — absent or unreadable means "no ratios"
        _RATIOS = out
        return out

    def _take(symbol: Any, entry: Any) -> None:
        if not isinstance(entry, dict) or not symbol:
            return
        for field in _RATIO_FIELDS:
            v = entry.get(field)
            if v is None:
                continue
            try:
                ratio = float(v)
            except (TypeError, ValueError):
                continue
            if ratio > 0:
                out[str(symbol).upper()] = ratio
            return

    if isinstance(raw, dict):
        # matches: {local symbol: {"us": US symbol, ...}} — the ratio belongs
        # to the receipt, so it is keyed by the US symbol.
        for _local, entry in (raw.get("matches") or {}).items():
            if isinstance(entry, dict):
                _take(entry.get("us"), entry)
        # An explicit table, should one ever be added beside the matches.
        for symbol, entry in (raw.get("ratios") or {}).items():
            if isinstance(entry, dict):
                _take(symbol, entry)
            else:
                _take(symbol, {"ratio": entry})
    _RATIOS = out
    return out


def adr_ratio_for(ticker: object) -> Optional[float]:
    """Ordinary shares per depositary receipt for ``ticker``, or None.

    None means "not on file", never "one for one". A receipt with no ratio
    cannot have its quote compared with a per-ordinary-share value.
    """
    if not ticker:
        return None
    return _load_ratios().get(str(ticker).strip().upper())


def reset_ratio_cache() -> None:
    """Drop the memoised ratio table. For tests only."""
    global _RATIOS
    _RATIOS = None


# ── Listing shape ───────────────────────────────────────────────────────────

# Reporting currencies whose US listings are the SAME ORDINARY SHARES, not
# receipts over them.
#
# Canada is the case, and it is a fact about how Canadian issuers list rather
# than a guess about any one company. A Canadian company on the NYSE or Nasdaq
# is interlisted: the identical ordinary share trades on both sides of the
# border, one for one, and the two lines are fungible because the shares move
# between them through the same depository. There is no deposit agreement, no
# depositary bank and no ratio, so there is nothing to look up. CNQ, SHOP, ACB,
# ENB, TD, RY, BNS and CM are all interlisted ordinary shares. They need an
# exchange rate and nothing else.
#
# The warehouse agrees. Those filers' stored market caps are genuine
# home-currency figures (RY 3.009e11 CAD over 1.4116 bn shares is 213.20 a
# share, ACB 4.09, BNS 89.42, CM 120.07), unlike the receipt names, whose caps
# hold the receipt's US dollar value under the filer's own currency code.
#
# This list stays at Canada. A European, Japanese, Chinese, Taiwanese, Indian,
# Brazilian, Danish or British company listed in the United States trades as a
# receipt, with a ratio that is frequently not one for one (TSM 5, BABA 8,
# TM 10), and guessing one for one there is exactly the error this module
# exists to prevent. Adding a currency here is a claim about a whole country's
# listing practice and needs the same kind of evidence.
INTERLISTED_ORDINARY_CURRENCIES = frozenset({"CAD"})


def is_interlisted_ordinary(reporting_currency: object) -> bool:
    """Whether a US line over these statements is an ordinary share, not a
    receipt, and so needs only an exchange rate."""
    reporting = fx_convert.normalize_currency(reporting_currency)
    return reporting is not None and reporting[0] in INTERLISTED_ORDINARY_CURRENCIES


def looks_like_depositary_receipt(
    ticker: object,
    reporting_currency: object,
    quote_currency: object = None,
) -> bool:
    """Whether this listing is a depositary receipt over a foreign company.

    The test is the one the warehouse's own symbology supports: a symbol with
    NO exchange suffix is a US listing (``2330.TW`` and ``0939.HK`` carry
    theirs), and a US listing whose statements are in a foreign currency is a
    receipt rather than an ordinary share. When the quote currency is known it
    must be USD as well, which keeps a US-symbol row that somehow quotes
    elsewhere out of the branch.

    Canada is the exception, for the reason above: those US lines are the same
    ordinary shares, interlisted one for one.
    """
    if not ticker:
        return False
    symbol = str(ticker).strip().upper()
    if not symbol or "." in symbol:
        return False
    reporting = fx_convert.normalize_currency(reporting_currency)
    if reporting is None or reporting[0] == "USD":
        return False
    if is_interlisted_ordinary(reporting_currency):
        return False
    if quote_currency is not None:
        quote = fx_convert.normalize_currency(quote_currency)
        if quote is None or quote[0] != "USD":
            return False
    return True


# ── The reconciliation ──────────────────────────────────────────────────────

# Written once, so every surface that refuses the comparison refuses it in the
# same words. ``{quote}`` and ``{reporting}`` are the major currency codes.
RECEIPT_NO_RATIO_REASON = (
    "The market quote is for a depositary receipt in {quote} while the model "
    "value is per ordinary share in {reporting}, and the number of ordinary "
    "shares per receipt is not on file."
)

NO_RATE_REASON = (
    "The market quote is in {quote} while the model value is in {reporting}, "
    "and no exchange rate between them is on file, so the two cannot be "
    "compared."
)

STORED_RECEIPT_REASON = (
    "No live quote was available, and the stored market value of a depositary "
    "receipt cannot be turned into a price per ordinary share in {reporting} "
    "without the number of ordinary shares per receipt, which is not on file."
)


# What each ``method`` did, in one plain clause. The payload carries it as
# ``basis`` so a reader (and the AI block) can see WHICH rule ran without
# having to know the enum, and so the interlisted case is visibly a different
# decision from a plain cross-listing rather than the same one by luck.
BASIS: dict[str, str] = {
    "noQuote": "no market quote was available",
    "unverified": ("the filer's reporting currency is not on file, so the "
                   "quote is used as delivered"),
    "sameCurrency": "the quote and the statements are in the same currency",
    "fxOnly": "converted by exchange rate only, one share per share",
    "interlistedOrdinary": ("interlisted ordinary share, converted by exchange "
                            "rate only"),
    "adrRatio": ("depositary receipt, converted by exchange rate and divided "
                 "by the ordinary shares per receipt"),
    "receiptNoRatio": "depositary receipt with no deposit ratio on file",
    "storedReceiptNoRatio": "depositary receipt with no deposit ratio on file",
    "noRate": "no exchange rate between the two currencies is on file",
    "storedMarketValue": ("the stored market value over diluted shares is a "
                          "price per ordinary share for this listing"),
}


@dataclass(frozen=True)
class PriceComparison:
    """Whether price and value can be compared, and the price if they can.

    ``price`` is per ORDINARY share in the REPORTING currency, which is the
    unit every model output carries. It is None either because no quote was
    available (``applicable`` stays True and the caller falls back to its
    stored market cap) or because the comparison cannot be made at all
    (``applicable`` is False and ``reason`` says why).
    """

    applicable: bool
    price: Optional[float]
    reason: Optional[str]
    quote_price: Optional[float]
    quote_currency: Optional[str]
    reporting_currency: Optional[str]
    adr_ratio: Optional[float]
    method: str

    @property
    def basis(self) -> str:
        """Which rule ran, in plain words."""
        return BASIS.get(self.method, self.method)

    def to_dict(self) -> dict[str, Any]:
        """The payload shape, following the repo's applicable/reason contract."""
        return {
            "applicable": self.applicable,
            "reason": self.reason,
            "price": round(self.price, 4) if self.price is not None else None,
            "quotePrice": (round(self.quote_price, 4)
                           if self.quote_price is not None else None),
            "quoteCurrency": self.quote_currency,
            "reportingCurrency": self.reporting_currency,
            "ordinarySharesPerReceipt": self.adr_ratio,
            "method": self.method,
            "basis": self.basis,
        }


def _ok(price, quote_price, qc, rc, ratio, method) -> PriceComparison:
    return PriceComparison(True, price, None, quote_price, qc, rc, ratio, method)


def reconcile_price(
    ticker: object,
    quote_price: Optional[float],
    quote_currency: object,
    reporting_currency: object,
    rates: Optional[dict[str, float]],
    *,
    adr_ratio: Optional[float] = None,
) -> PriceComparison:
    """The quote expressed per ordinary share in the reporting currency.

    ``rates`` is ``{major currency code: USD per unit}``. ``adr_ratio``
    overrides the on-file lookup, which is how a caller that already knows the
    deposit ratio (and how a test) supplies one.
    """
    symbol = str(ticker).strip().upper() if ticker else None
    rc_norm = fx_convert.normalize_currency(reporting_currency)
    qc_norm = fx_convert.normalize_currency(quote_currency)
    # The MAJOR code is what the refusal sentences name, because "your quote is
    # in GBp" helps nobody. The code reported beside ``quotePrice`` is the one
    # the source actually used, so a 1450 GBp quote is not labelled GBP and
    # read as fourteen hundred pounds.
    rc_code = rc_norm[0] if rc_norm else None
    qc_major = qc_norm[0] if qc_norm else None
    qc_code = str(quote_currency).strip() if (qc_norm and quote_currency) else qc_major

    try:
        price = float(quote_price) if quote_price is not None else None
    except (TypeError, ValueError):
        price = None
    if price is not None and price <= 0:
        price = None

    # 1. No quote. Not a mismatch: the caller falls back to its stored cap,
    #    which is denominated the way the rows are.
    if price is None:
        return _ok(None, None, qc_code, rc_code, None, "noQuote")

    # 2. An unparseable currency on either side. Nothing can be asserted about
    #    a mismatch, and a US filer whose "Reported Currency" is NULL must
    #    behave exactly as it did before this module existed.
    if rc_norm is None or qc_norm is None:
        return _ok(price, price, qc_code, rc_code, None, "unverified")

    # 3. Same currency, including the minor-unit spelling of the same one.
    if qc_norm == rc_norm:
        return _ok(price, price, qc_code, rc_code, None, "sameCurrency")

    converted = fx_convert.convert_amount(price, quote_currency, reporting_currency, rates)

    ratio = adr_ratio if adr_ratio is not None else adr_ratio_for(symbol)
    if ratio is not None and ratio > 0:
        # 4. A published deposit ratio reconciles both the currency and the unit.
        if converted is None:
            return PriceComparison(
                False, None,
                NO_RATE_REASON.format(quote=qc_major, reporting=rc_code),
                price, qc_code, rc_code, ratio, "noRate")
        return _ok(converted / ratio, price, qc_code, rc_code, ratio, "adrRatio")

    # 5. An interlisted ordinary share. Same share, two exchanges, one for one,
    # so an exchange rate is the whole reconciliation and the ratio is 1 as a
    # matter of how the listing works rather than as an assumption.
    interlisted = (
        is_interlisted_ordinary(reporting_currency)
        and symbol is not None and "." not in symbol
    )

    # 6. A receipt with no ratio. The unit is unknown, so no amount of currency
    # conversion makes the two numbers comparable.
    if not interlisted and looks_like_depositary_receipt(
            symbol, reporting_currency, quote_currency):
        return PriceComparison(
            False, None,
            RECEIPT_NO_RATIO_REASON.format(quote=qc_major, reporting=rc_code),
            price, qc_code, rc_code, None, "receiptNoRatio")

    # 7. Every remaining cross-listing: one share per share, convert by rate
    # alone. That covers the interlisted case above and the reverse of it, a
    # .TO or .V line quoted in Canadian dollars over statements in US dollars,
    # which reaches here through the exchange-suffix test.
    if converted is None:
        return PriceComparison(
            False, None,
            NO_RATE_REASON.format(quote=qc_major, reporting=rc_code),
            price, qc_code, rc_code, None, "noRate")
    return _ok(converted, price, qc_code, rc_code,
               1.0 if interlisted else None,
               "interlistedOrdinary" if interlisted else "fxOnly")


def reconcile_stored_market_value(
    ticker: object,
    reporting_currency: object,
    *,
    adr_ratio: Optional[float] = None,
) -> PriceComparison:
    """Whether ``Market Cap / diluted shares`` is a usable per-share price.

    The whole-industry leaderboard takes no live quote (one network call per
    company would make the request take minutes), so its price is the stored
    market value over the stored diluted share count. Diluted shares are
    ORDINARY shares, and the stored cap is supposed to be in the filer's
    reporting currency, which makes the division correct for an ordinary
    listing and for every US filer.

    For a depositary receipt it is not. Measured on the live warehouse, the
    stored cap for TSM, TM, BABA, NVO and SONY is the receipt's US dollar
    value carrying the filer's own currency code: TSM's FY2025 cap of
    2.211e12 "TWD" over 25.93 billion ordinary shares is 85 a share, while a
    TSMC ordinary share trades near 1,400 TWD, and 2.211e12 US dollars is
    TSMC's actual market value. Divided out, that price is neither a receipt
    price nor an ordinary-share price, and the margin of safety built on it
    read plus 2,234 percent.

    Rather than guess which of the two it is, the comparison is refused for a
    receipt with no deposit ratio on file. An ordinary listing is unaffected.
    """
    rc_norm = fx_convert.normalize_currency(reporting_currency)
    rc_code = rc_norm[0] if rc_norm else None
    ratio = adr_ratio if adr_ratio is not None else adr_ratio_for(ticker)
    # An interlisted ordinary share is not a receipt, so it keeps the stored
    # fallback: its cap really is a home-currency figure for the whole company
    # (RY 3.009e11 CAD over 1.4116 bn shares is 213.20 a share).
    if ratio is None and looks_like_depositary_receipt(ticker, reporting_currency):
        return PriceComparison(
            False, None, STORED_RECEIPT_REASON.format(reporting=rc_code),
            None, None, rc_code, None, "storedReceiptNoRatio")
    return _ok(None, None, None, rc_code, ratio, "storedMarketValue")


def not_applicable_block(comparison: Optional[PriceComparison]) -> Optional[dict]:
    """``{"applicable": False, "reason": ...}`` when the comparison is refused.

    None when there is nothing to refuse, so a caller can write
    ``block = not_applicable_block(pc) or compute(...)``.
    """
    if comparison is None or comparison.applicable:
        return None
    return {"applicable": False, "reason": comparison.reason}
