"""Reconciling a market quote with a per-ordinary-share model value.

Every per-share figure the valuation engines produce is per ORDINARY share in
the filer's reporting currency. The quote is in whatever the LISTING trades in.
Compared raw, TSM's intrinsic value of 1990.55 (TWD, per ordinary share) sat
against a quote of 434.67 (USD, per depositary receipt) and the page printed a
margin of safety of plus 357.95 percent.

Network-free and DB-free: the reconciliation is pure given a rate mapping, and
dict rows stand in for sqlite3.Row throughout (both expose keys()/__getitem__).

Run:  cd backend && python -m pytest test_price_currency.py -q
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import individualanalysis as ia  # noqa: E402
import price_currency as pc  # noqa: E402


# USD per one unit, the shape FinancialDB.get_fx_rates() returns.
RATES = {
    "USD": 1.0,
    "TWD": 0.0312,
    "GBP": 1.34,
    "EUR": 1.158,
    "HKD": 0.1285,
    "CNY": 0.1485,
    "JPY": 0.0066,
    "CAD": 0.72,
}


# ── The reconciliation itself ────────────────────────────────────────────────

class TestReconcilePrice:
    def test_a_us_filer_is_untouched(self):
        out = pc.reconcile_price("NVDA", 222.27, "USD", "USD", RATES)
        assert out.applicable is True
        assert out.price == 222.27
        assert out.method == "sameCurrency"
        assert out.reason is None

    def test_a_missing_reporting_currency_leaves_the_quote_alone(self):
        """The newest row can carry NULL. That is not a mismatch."""
        out = pc.reconcile_price("NVDA", 222.27, "USD", None, RATES)
        assert out.applicable is True
        assert out.price == 222.27
        assert out.method == "unverified"

    def test_no_quote_is_not_a_mismatch(self):
        """The caller falls back to its stored market cap, as it always did."""
        out = pc.reconcile_price("TSM", None, None, "TWD", RATES)
        assert out.applicable is True
        assert out.price is None
        assert out.method == "noQuote"

    def test_a_receipt_with_no_ratio_cannot_be_compared(self):
        out = pc.reconcile_price("TSM", 434.67, "USD", "TWD", RATES)
        assert out.applicable is False
        assert out.price is None
        assert out.method == "receiptNoRatio"
        assert out.reason == (
            "The market quote is for a depositary receipt in USD while the "
            "model value is per ordinary share in TWD, and the number of "
            "ordinary shares per receipt is not on file."
        )
        # The quote is still reported, so a page can say what it was refusing.
        assert out.quote_price == 434.67
        assert out.quote_currency == "USD"
        assert out.reporting_currency == "TWD"

    def test_a_receipt_with_a_ratio_reconciles_properly(self):
        """TSM at five ordinary shares per receipt.

        434.67 USD at 0.0312 USD per TWD is 13,931.73 TWD for the receipt, and
        over five ordinary shares that is 2,786.35 TWD per ordinary share. Read
        the other way round, the model's 1,990.55 TWD per ordinary share is
        about 310 dollars a receipt against a 434.67 dollar quote, so the
        reconciled margin of safety is about minus 29 percent where the raw
        comparison printed plus 358.
        """
        out = pc.reconcile_price("TSM", 434.67, "USD", "TWD", RATES, adr_ratio=5.0)
        assert out.applicable is True
        assert out.method == "adrRatio"
        assert out.adr_ratio == 5.0
        assert out.price == pytest.approx(434.67 / 0.0312 / 5.0, rel=1e-9)
        assert out.price == pytest.approx(2786.35, abs=0.01)
        reconciled_mos = (1990.55 - out.price) / out.price
        assert reconciled_mos == pytest.approx(-0.2856, abs=5e-4)
        raw_mos = (1990.55 - 434.67) / 434.67
        assert raw_mos == pytest.approx(3.5795, abs=5e-4)

    def test_london_pence_are_divided_out(self):
        """The LSE quotes in pence against statements in pounds.

        RR.L at 1450 GBp is 14.50 GBP. Read raw against a 19.25 GBP model value
        the page printed a margin of safety of minus 98.67 percent.
        """
        out = pc.reconcile_price("RR.L", 1450.0, "GBp", "GBP", RATES)
        assert out.applicable is True
        assert out.method == "fxOnly"
        assert out.price == pytest.approx(14.50, rel=1e-9)

    def test_pence_are_matched_case_sensitively(self):
        """GBp and GBP differ only in case and mean different things."""
        assert pc.reconcile_price("X.L", 1450.0, "GBP", "GBP", RATES).price == 1450.0
        assert pc.reconcile_price("X.L", 1450.0, "GBp", "GBP", RATES).price == pytest.approx(14.5)

    def test_a_one_for_one_cross_listing_converts_by_rate_alone(self):
        """A CNY filer quoted in Hong Kong dollars: one share per share."""
        out = pc.reconcile_price("0700.HK", 419.0, "HKD", "CNY", RATES)
        assert out.applicable is True
        assert out.method == "fxOnly"
        assert out.price == pytest.approx(419.0 * 0.1285 / 0.1485, rel=1e-9)

    def test_an_ordinary_foreign_listing_at_home_is_untouched(self):
        out = pc.reconcile_price("2330.TW", 1450.0, "TWD", "TWD", RATES)
        assert out.applicable is True
        assert out.price == 1450.0
        assert out.method == "sameCurrency"

    def test_a_missing_rate_refuses_rather_than_guessing_one_for_one(self):
        out = pc.reconcile_price("0700.HK", 419.0, "HKD", "CNY", {"USD": 1.0})
        assert out.applicable is False
        assert out.method == "noRate"
        assert "no exchange rate" in out.reason

    def test_a_non_positive_quote_is_treated_as_no_quote(self):
        assert pc.reconcile_price("TSM", 0.0, "USD", "TWD", RATES).method == "noQuote"
        assert pc.reconcile_price("TSM", -3.0, "USD", "TWD", RATES).method == "noQuote"


class TestDepositaryReceiptTest:
    def test_a_us_symbol_over_foreign_statements_is_a_receipt(self):
        assert pc.looks_like_depositary_receipt("TSM", "TWD", "USD") is True
        assert pc.looks_like_depositary_receipt("BABA", "CNY") is True

    def test_an_exchange_suffix_means_an_ordinary_listing(self):
        assert pc.looks_like_depositary_receipt("2330.TW", "TWD", "USD") is False
        assert pc.looks_like_depositary_receipt("0700.HK", "CNY", "HKD") is False

    def test_a_us_filer_is_never_a_receipt(self):
        assert pc.looks_like_depositary_receipt("NVDA", "USD", "USD") is False
        assert pc.looks_like_depositary_receipt("NVDA", None, "USD") is False

    def test_a_quote_that_is_not_in_dollars_is_not_a_us_receipt(self):
        assert pc.looks_like_depositary_receipt("XYZ", "TWD", "HKD") is False


class TestRatioSource:
    def test_no_ratio_is_on_file_today(self):
        """adr_mapping.json holds a symbol crosswalk, not deposit ratios.

        Its `matches` are six {local symbol: {us, name, mc}} entries and its
        `log` is five hundred unmatched foreign symbols. If a ratio is ever
        added the loader picks it up with no code change, which the next test
        exercises; until then every receipt takes the refusal branch.
        """
        pc.reset_ratio_cache()
        for t in ("TSM", "TM", "BABA", "NVO", "SONY", "ASML"):
            assert pc.adr_ratio_for(t) is None

    def test_a_ratio_added_to_the_file_is_picked_up(self, tmp_path, monkeypatch):
        import json
        payload = {"matches": {"2330.TW": {"us": "TSM", "ordinarySharesPerAdr": 5}}}
        (tmp_path / "adr_mapping.json").write_text(json.dumps(payload), encoding="utf-8")
        monkeypatch.setattr(pc, "_repo_root", lambda: str(tmp_path))
        pc.reset_ratio_cache()
        try:
            assert pc.adr_ratio_for("TSM") == 5.0
            assert pc.adr_ratio_for("tsm") == 5.0
            assert pc.adr_ratio_for("NVDA") is None
            out = pc.reconcile_price("TSM", 434.67, "USD", "TWD", RATES)
            assert out.applicable is True
            assert out.method == "adrRatio"
        finally:
            pc.reset_ratio_cache()

    def test_a_missing_file_means_no_ratios_not_a_crash(self, tmp_path, monkeypatch):
        monkeypatch.setattr(pc, "_repo_root", lambda: str(tmp_path))
        pc.reset_ratio_cache()
        try:
            assert pc.adr_ratio_for("TSM") is None
        finally:
            pc.reset_ratio_cache()


class TestStoredMarketValue:
    """The leaderboard takes no live quote; its price is cap over shares."""

    def test_an_ordinary_listing_keeps_the_stored_fallback(self):
        out = pc.reconcile_stored_market_value("NVDA", "USD")
        assert out.applicable is True
        assert out.method == "storedMarketValue"
        out = pc.reconcile_stored_market_value("2330.TW", "TWD")
        assert out.applicable is True

    def test_a_receipt_cannot_use_the_stored_fallback_either(self):
        out = pc.reconcile_stored_market_value("TSM", "TWD")
        assert out.applicable is False
        assert out.method == "storedReceiptNoRatio"
        assert "ordinary shares per receipt" in out.reason
        assert "TWD" in out.reason

    def test_a_known_ratio_restores_the_fallback(self):
        out = pc.reconcile_stored_market_value("TSM", "TWD", adr_ratio=5.0)
        assert out.applicable is True


# ── The plumbing: what the models do with the verdict ────────────────────────

def _rows(currency="USD", years=8):
    """A plain, solvable profitable filer. Dict rows stand in for sqlite3.Row."""
    out = []
    for i in range(years):
        rev = 1000.0 * (1.10 ** i)
        out.append({
            "Calendar Year": 2018 + i,
            "Reported Currency": currency,
            "t_sector": "Technology", "t_industry": "Semiconductors", "t_name": "Test",
            "Revenue": rev,
            "Operating Income": rev * 0.25,
            "Net Income": rev * 0.20,
            "EBITDA": rev * 0.30,
            "Income Before Tax": rev * 0.24,
            "Income Tax Expense": rev * 0.05,
            "Interest Expense": rev * 0.01,
            "Total Assets": rev * 2.0,
            "Total Stockholders Equity": rev * 1.2,
            "Total Debt": rev * 0.4,
            "Cash And Cash Equivalents": rev * 0.3,
            "Net Debt": rev * 0.1,
            "Market Cap": rev * 12.0,
            "Weighted Average Shs Out Dil": 100.0,
            "Free Cash Flow": rev * 0.15,
            "Operating Cash Flow": rev * 0.22,
            "Capital Expenditure": -rev * 0.07,
            "Depreciation And Amortization": rev * 0.05,
            "Free Cash Flow Per Share": rev * 0.0015,
            "PFCF Ratio": 20.0,
            "Enterprise Value Over EBITDA": 14.0,
            "Enterprise Value": rev * 12.4,
            "Minority Interest": 0.0,
        })
    return out


def test_a_usable_price_drives_the_model_exactly_as_before():
    rows = _rows()
    before = ia.compute_forecast(rows, beta=1.0, rf=0.045, erp=0.045, price=150.0)
    after = ia.compute_forecast(rows, beta=1.0, rf=0.045, erp=0.045, price=150.0,
                                price_unusable=False, price_unusable_reason=None)
    assert before["marginOfSafety"] == after["marginOfSafety"]
    assert before["currentPrice"] == after["currentPrice"] == 150.0
    assert after["priceComparison"] is None


def test_an_unusable_price_empties_every_price_derived_figure():
    rows = _rows("TWD")
    reason = "because the two are different units"
    out = ia.compute_forecast(rows, beta=1.0, rf=0.045, erp=0.045, price=434.67,
                              price_unusable=True, price_unusable_reason=reason)
    assert out["marginOfSafety"] is None
    assert out["currentPrice"] is None
    assert out["priceComparison"] == {"applicable": False, "reason": reason}
    assert out["reverseDcf"] == {"applicable": False, "reason": reason}
    # The VALUE itself is untouched: nothing about the quote changes what the
    # business is worth per ordinary share.
    clean = ia.compute_forecast(rows, beta=1.0, rf=0.045, erp=0.045, price=None)
    assert out["intrinsicPerShare"] == clean["intrinsicPerShare"]


def test_an_unusable_price_empties_every_stage_variant_too():
    rows = _rows("TWD")
    out = ia.compute_forecast(rows, beta=1.0, rf=0.045, erp=0.045, price=434.67,
                              price_unusable=True, price_unusable_reason="r")
    variants = (out.get("valuationSelection") or {}).get("stageVariants") or {}
    assert variants, "the damodaran engine should have produced stage variants"
    for v in variants.values():
        if v.get("applicable"):
            assert v.get("marginOfSafety") is None


def test_the_stale_market_cap_fallback_is_suppressed_too():
    """Not applicable means no price, not "use the older wrong one".

    The warehouse's stored cap for exactly these filers has been observed
    holding the receipt's US dollar value under the filer's own currency code,
    so falling back would swap one bad comparison for another.
    """
    rows = _rows("TWD")
    assert ia._effective_price(None, 12000.0, 100.0) == 120.0
    assert ia._effective_price(None, 12000.0, 100.0, True) is None
    out = ia.compute_forecast(rows, beta=1.0, rf=0.045, erp=0.045, price=None,
                              price_unusable=True, price_unusable_reason="r")
    assert out["currentPrice"] is None


def test_the_verdict_drops_the_margin_of_safety_rather_than_scoring_a_wrong_one():
    """A None metric is skipped, so the quality score is built on the rest.

    Four candidate metrics, two of which pass. TSM's raw +357.95 percent clears
    the 20 percent margin-of-safety threshold, so the fabricated comparison
    counted as a third pass and moved the headline from HOLD to BUY. The
    reconciled figure, about minus 29 percent, would have moved it the other
    way. Neither is a verdict the page should reach on a number built out of
    two different currencies.
    """
    base = {"ratios": {"Return On Equity": 0.05, "Debt To Equity": 3.0},
            "avg_fcf_growth": 0.10, "net_income_growth_latest": 0.10}
    _s, _w, raw, raw_label = ia._build_verdict({**base, "margin_of_safety": 3.5795})
    _s2, _w2, dropped, dropped_label = ia._build_verdict({**base, "margin_of_safety": None})
    assert raw == pytest.approx(60.0)
    assert raw_label.startswith("BUY")
    assert dropped == pytest.approx(50.0)
    assert dropped_label.startswith("HOLD")


def test_the_equity_models_suppress_their_own_margin_of_safety():
    rows = _rows("TWD")
    for fn in (ia._residual_income, ia._dividend_discount_model,
               ia._fcfe_regulatory_capital):
        out = fn(rows, beta=1.0, rf=0.045, erp=0.045, price=434.67, price_unusable=True)
        if out is None or out.get("applicable") is False:
            continue
        assert out.get("marginOfSafety") is None, fn.__name__
        assert out.get("currentPrice") is None, fn.__name__


def test_the_reported_quote_currency_is_the_one_the_source_used():
    """A 1450 GBp quote must not be labelled GBP beside its own figure.

    The refusal SENTENCES name the major code, because "your quote is in GBp"
    helps nobody; the code carried beside `quotePrice` is the spelling the
    source delivered, so the two agree.
    """
    out = pc.reconcile_price("RR.L", 1450.0, "GBp", "GBP", RATES).to_dict()
    assert out["quoteCurrency"] == "GBp"
    assert out["quotePrice"] == 1450.0
    assert out["price"] == pytest.approx(14.5)
    receipt = pc.reconcile_price("TSM", 434.67, "USD", "TWD", RATES)
    assert receipt.quote_currency == "USD"
    assert "in USD" in receipt.reason


# ── The leaderboard path: no live quote, price = stored cap over shares ──────
#
# `use_live_price=False` skips the per-ticker quote (one network call per
# company would make the whole-industry request take minutes), so the price is
# the stored market value over diluted shares. That is a per-ordinary-share
# figure for an ordinary listing. For a depositary receipt the warehouse has
# been observed holding the RECEIPT's US dollar value under the filer's own
# currency code: TSM's FY2025 cap of 2.211e12 "TWD" over 25.93 billion ordinary
# shares is 85 a share against an ordinary share that trades near 1,400 TWD, so
# the ranking printed a margin of safety of +6,482 percent and a Graham Number
# Ratio of 6.57 on a curve that tops out at 1.0.

class _Db:
    """Only what build_snapshot reaches for. No network, no database."""

    def __init__(self, price=None, currency=None):
        self._price, self._currency = price, currency

    def get_or_compute_beta(self, _t):
        return 1.0

    def get_latest_price(self, _t):
        return self._price

    def get_latest_price_currency(self, _t):
        return self._price, self._currency

    def get_fx_rates(self):
        return RATES


def _cmp_rows(currency, ticker):
    rows = _rows(currency)
    for r in rows:
        r["Ticker"] = ticker
        r["t_name"] = ticker
        r["EPS Diluted"] = r["Net Income"] / 100.0
        r["Book Value Per Share"] = r["Total Stockholders Equity"] / 100.0
        r["beta"] = 1.0
    return rows


def test_the_leaderboard_refuses_a_receipts_stored_market_value():
    import comparitivestockanalysis as cmp

    snap = cmp.build_snapshot("TSM", _cmp_rows("TWD", "TSM"), db=_Db(),
                              rf=0.045, erp=0.045, use_live_price=False)
    assert snap.price_comparison["applicable"] is False
    assert snap.price_comparison["method"] == "storedReceiptNoRatio"
    assert snap.margin_of_safety is None
    assert snap.implied_price is None
    assert snap.metrics["Margin Of Safety"] is None
    # The Graham ratio is the one of the two that is actually SCORED, at weight
    # 1.0 in every sector profile, and it divides by that same price.
    assert snap.metrics["Graham Number Ratio"] is None
    # The VALUE is untouched: the quote has no bearing on what a share is worth.
    assert snap.dcf_intrinsic is not None


def test_the_leaderboard_is_unchanged_for_an_ordinary_listing():
    import comparitivestockanalysis as cmp

    for ticker, currency in (("NVDA", "USD"), ("2330.TW", "TWD")):
        snap = cmp.build_snapshot(ticker, _cmp_rows(currency, ticker), db=_Db(),
                                  rf=0.045, erp=0.045, use_live_price=False)
        assert snap.price_comparison["applicable"] is True, ticker
        assert snap.price_comparison["method"] == "storedMarketValue", ticker
        assert snap.margin_of_safety is not None, ticker
        assert snap.metrics["Graham Number Ratio"] is not None, ticker


def test_a_dropped_metric_is_skipped_by_the_value_score_not_scored_as_zero():
    import comparitivestockanalysis as cmp

    a = cmp.build_snapshot("TSM", _cmp_rows("TWD", "TSM"), db=_Db(),
                           rf=0.045, erp=0.045, use_live_price=False)
    b = cmp.build_snapshot("NVDA", _cmp_rows("USD", "NVDA"), db=_Db(),
                           rf=0.045, erp=0.045, use_live_price=False)
    scores = cmp.score_industry([a, b], sector="Technology")
    # Identical businesses apart from the currency label. The receipt is scored
    # on the metrics that survive, not sunk for the one that could not be built.
    assert scores["TSM"] > 0.0
    assert abs(scores["TSM"] - scores["NVDA"]) < 12.0


def test_a_live_quote_still_reaches_the_leaderboard_when_it_is_asked_for():
    import comparitivestockanalysis as cmp

    snap = cmp.build_snapshot("NVDA", _cmp_rows("USD", "NVDA"),
                              db=_Db(price=150.0, currency="USD"),
                              rf=0.045, erp=0.045, use_live_price=True)
    assert snap.price_comparison["method"] == "sameCurrency"
    assert snap.implied_price == 150.0


class _CountingDb(_Db):
    """Counts the rate-table reads the snapshot builder asks for."""

    def __init__(self):
        super().__init__()
        self.fx_calls = 0

    def get_fx_rates(self):
        self.fx_calls += 1
        return RATES


def test_the_ranking_reads_the_rate_table_once_for_the_whole_industry():
    """Each snapshot used to look the rates up for itself, which on a
    561-company industry opened a connection to the 640 MB warehouse and
    re-read the same 45 rows 561 times. A caller that has already read them
    passes them in, and the builder asks for nothing."""
    import comparitivestockanalysis as cmp

    per_call = _CountingDb()
    for tk in ("TSM", "NVDA", "2330.TW"):
        cmp.build_snapshot(tk, _cmp_rows("TWD", tk), db=per_call,
                           rf=0.045, erp=0.045, use_live_price=False)
    assert per_call.fx_calls == 3

    shared = _CountingDb()
    for tk in ("TSM", "NVDA", "2330.TW"):
        cmp.build_snapshot(tk, _cmp_rows("TWD", tk), db=shared,
                           rf=0.045, erp=0.045, use_live_price=False, rates=RATES)
    assert shared.fx_calls == 0


def test_the_passed_rates_are_the_ones_the_reconciliation_uses():
    """Not merely skipped: the figures come out the same as when the builder
    reads the table itself."""
    import comparitivestockanalysis as cmp

    own = cmp.build_snapshot("TSM", _cmp_rows("TWD", "TSM"), db=_Db(),
                             rf=0.045, erp=0.045, use_live_price=False)
    passed = cmp.build_snapshot("TSM", _cmp_rows("TWD", "TSM"), db=_CountingDb(),
                                rf=0.045, erp=0.045, use_live_price=False, rates=RATES)
    assert passed.price_comparison == own.price_comparison
    assert passed.metrics == own.metrics


def test_the_ranking_endpoint_reads_the_rates_before_its_loop():
    """The source assertion that keeps the fix in place: the endpoint reads the
    table once and hands the result to every snapshot."""
    with open(os.path.join(os.path.dirname(__file__), "api.py"), encoding="utf-8") as fh:
        src = fh.read()
    body = src[src.index("def _ranking_for_industry("):]
    body = body[: body.index("\n@")] if "\n@" in body else body
    assert "fx_rates = _fx_rates()" in body
    assert "rates=fx_rates" in body
    assert body.index("fx_rates = _fx_rates()") < body.index("rates=fx_rates")


# ── The payload guard in api.py ──────────────────────────────────────────────

class _Snap:
    """Only the attributes _valuation_block reads."""

    def __init__(self, pc):
        self.price_comparison = pc
        self.dcf_intrinsic = 1990.55
        self.implied_price = 434.67
        self.margin_of_safety = 3.5795
        self.avg_fcf_growth = 0.10
        self.forecast = None
        self.dividend_discount = None


def test_the_payload_refuses_the_comparison_even_if_a_caller_upstream_did_not():
    """Belt and braces: the page's headline block is the last line of defence."""
    import api

    refused = api._valuation_block(_Snap({"applicable": False, "reason": "units"}))
    assert refused["marginOfSafety"] is None
    assert refused["impliedPrice"] is None
    assert refused["priceComparison"]["reason"] == "units"
    # The value itself is never withdrawn: the quote has no bearing on it.
    assert refused["dcfIntrinsicPerShare"] == 1990.55

    ok = api._valuation_block(_Snap({"applicable": True, "reason": None,
                                     "method": "sameCurrency"}))
    assert ok["marginOfSafety"] == 3.5795
    assert ok["impliedPrice"] == 434.67


# ── Interlisted ordinary shares (Canada) ────────────────────────────────────
#
# A Canadian company on the NYSE or Nasdaq is interlisted: the identical
# ordinary share trades on both sides of the border, one for one, with no
# deposit agreement, no depositary bank and therefore no ratio to look up. The
# warehouse agrees, and that is the cross-check worth having: RY's stored cap
# of 3.009e11 CAD over 1.4116 bn ordinary shares is 213.20 a share, and a 153.50
# US dollar quote converted at 0.72 is 213.19. A receipt name's stored cap does
# not reconcile like that, because it holds the receipt's US dollar value.
#
# The list is Canada and nothing else. A European, Japanese, Chinese, Taiwanese,
# Indian, Brazilian, Danish or British company listed in the United States
# trades as a receipt, on a ratio that is frequently not one for one.

class TestInterlistedOrdinary:
    def test_a_canadian_us_line_is_reconciled_by_exchange_rate_only(self):
        out = pc.reconcile_price("RY", 153.50, "USD", "CAD", RATES)
        assert out.applicable is True
        assert out.method == "interlistedOrdinary"
        assert out.adr_ratio == 1.0
        assert out.price == pytest.approx(153.50 / 0.72, rel=1e-9)
        # The warehouse's own figure for the same company, independently.
        assert out.price == pytest.approx(213.19, abs=0.02)
        assert out.basis == "interlisted ordinary share, converted by exchange rate only"
        assert out.reason is None

    def test_the_basis_reaches_the_payload(self):
        out = pc.reconcile_price("ACB", 5.68, "USD", "CAD", RATES).to_dict()
        assert out["basis"] == "interlisted ordinary share, converted by exchange rate only"
        assert out["ordinarySharesPerReceipt"] == 1.0
        assert out["method"] == "interlistedOrdinary"

    def test_a_canadian_line_is_not_classified_as_a_receipt(self):
        assert pc.looks_like_depositary_receipt("ACB", "CAD", "USD") is False
        assert pc.looks_like_depositary_receipt("RY", "CAD") is False
        assert pc.is_interlisted_ordinary("CAD") is True
        assert pc.is_interlisted_ordinary("cad") is True

    def test_the_stored_market_value_fallback_survives_for_a_canadian_line(self):
        """The leaderboard takes no quote, and a Canadian cap is a home-currency
        figure for the whole company, so cap over shares is a real price."""
        out = pc.reconcile_stored_market_value("ACB", "CAD")
        assert out.applicable is True
        assert out.method == "storedMarketValue"

    def test_every_other_currency_is_still_refused(self):
        """The carve-out is a fact about Canadian listing practice, not a
        licence to assume one for one anywhere else."""
        for ticker, currency in (("TSM", "TWD"), ("ASML", "EUR"), ("NVO", "DKK"),
                                 ("SONY", "JPY"), ("BABA", "CNY"), ("INFY", "INR"),
                                 ("ABEV", "BRL"), ("BTI", "GBP")):
            out = pc.reconcile_price(ticker, 100.0, "USD", currency, {**RATES,
                                                                      "DKK": 0.155,
                                                                      "INR": 0.0113,
                                                                      "BRL": 0.185})
            assert out.applicable is False, ticker
            assert out.method == "receiptNoRatio", ticker
            assert pc.looks_like_depositary_receipt(ticker, currency, "USD") is True
        assert pc.INTERLISTED_ORDINARY_CURRENCIES == frozenset({"CAD"})

    def test_the_reverse_direction_converts_by_exchange_rate_too(self):
        """A .TO or .V line quoted in Canadian dollars over statements in US
        dollars reaches the FX-only branch through the exchange-suffix test,
        which is the same treatment for the same reason."""
        for symbol in ("CNQ.TO", "SU.V", "ABX.TO"):
            out = pc.reconcile_price(symbol, 48.10, "CAD", "USD", RATES)
            assert out.applicable is True, symbol
            assert out.method == "fxOnly", symbol
            assert out.price == pytest.approx(48.10 * 0.72, rel=1e-9), symbol

    def test_a_canadian_filer_quoted_at_home_is_still_a_no_op(self):
        out = pc.reconcile_price("CNQ.TO", 65.26, "CAD", "CAD", RATES)
        assert out.method == "sameCurrency"
        assert out.price == 65.26


def test_every_method_carries_a_basis():
    """A payload that says `method` without saying what it did is an enum in
    front of a reader."""
    for method, words in pc.BASIS.items():
        assert words and words == words.lower().strip()
    seen = {
        pc.reconcile_price("NVDA", 10.0, "USD", "USD", RATES).method,
        pc.reconcile_price("NVDA", None, None, "USD", RATES).method,
        pc.reconcile_price("NVDA", 10.0, "USD", None, RATES).method,
        pc.reconcile_price("RR.L", 1450.0, "GBp", "GBP", RATES).method,
        pc.reconcile_price("RY", 153.5, "USD", "CAD", RATES).method,
        pc.reconcile_price("TSM", 434.67, "USD", "TWD", RATES).method,
        pc.reconcile_price("TSM", 434.67, "USD", "TWD", RATES, adr_ratio=5.0).method,
        pc.reconcile_price("0700.HK", 419.0, "HKD", "CNY", {"USD": 1.0}).method,
        pc.reconcile_stored_market_value("NVDA", "USD").method,
        pc.reconcile_stored_market_value("TSM", "TWD").method,
    }
    assert seen <= set(pc.BASIS), seen - set(pc.BASIS)
    assert len(seen) == 10
