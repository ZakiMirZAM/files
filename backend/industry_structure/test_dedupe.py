"""The tightened cross-listing rule (review item 13).

Two DIFFERENT listed companies can report identical consolidated figures.
In practice that is an operating company and its holding company on the
SAME exchange; a real cross-listing sits on two different exchanges. The
rule therefore collapses only across exchange suffixes, and never across
two different non-null CIKs.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from industry_structure.dedupe import dedupe_listings, exchange_suffix, same_issuer
from industry_structure.peers import Peer


def _peer(ticker, *, rev=1000.0, ni=80.0, mc=5000.0, cik=None, ccy="USD", yr=2024):
    return Peer(
        ticker=ticker, name=ticker, revenue_usd=rev, revenue_local=rev,
        reported_currency=ccy, calendar_year=yr,
        ratios={"Revenue": rev, "Net Income": ni, "Market Cap": mc},
        usd_per_unit=1.0, cik=cik,
    )


class TestExchangeSuffix:

    def test_us_symbols_have_no_suffix(self):
        assert exchange_suffix("AEG") == ""
        assert exchange_suffix("BRK-B") == ""

    def test_foreign_listings_carry_one(self):
        assert exchange_suffix("601398.SS") == "SS"
        assert exchange_suffix("009970.KS") == "KS"


class TestMustNotCollapse:

    def test_operating_company_and_its_holdco_on_one_exchange(self):
        """111770.KS Youngone Corporation and 009970.KS Youngone Holdings
        report the same consolidated figures and are two companies."""
        opco = _peer("111770.KS")
        holdco = _peer("009970.KS")
        assert same_issuer(opco, holdco) is False
        kept, dropped = dedupe_listings([opco, holdco])
        assert dropped == 0
        assert {p.ticker for p in kept} == {"111770.KS", "009970.KS"}

    def test_the_other_two_known_holdco_pairs(self):
        for a, b in (("383220.KS", "007700.KS"), ("161890.KS", "024720.KS")):
            kept, dropped = dedupe_listings([_peer(a), _peer(b)])
            assert dropped == 0, f"{a} and {b} must not collapse"
            assert len(kept) == 2

    def test_two_different_non_null_ciks(self):
        """Two SEC registrants are two companies, whatever the figures say."""
        a = _peer("B", cik="0000009984")
        b = _peer("ABX.TO", cik="0000756894")
        assert same_issuer(a, b) is False
        kept, dropped = dedupe_listings([a, b])
        assert dropped == 0
        assert len(kept) == 2

    def test_a_contradicting_net_income_still_blocks_it(self):
        a = _peer("AEG", ni=80.0)
        b = _peer("AGN.AS", ni=95.0)
        assert same_issuer(a, b) is False
        assert dedupe_listings([a, b])[1] == 0


class TestStillCollapses:

    def test_a_true_cross_listing_on_two_exchanges(self):
        vienna = _peer("ICK.VI", mc=100.0)
        shanghai = _peer("601398.SS", mc=900.0)
        assert same_issuer(vienna, shanghai) is True
        kept, dropped = dedupe_listings([vienna, shanghai])
        assert dropped == 1
        assert [p.ticker for p in kept] == ["601398.SS"]  # larger USD cap wins

    def test_us_line_against_a_foreign_line(self):
        us = _peer("AEG", mc=700.0, cik="0000769218")
        ams = _peer("AGN.AS", mc=700.0, cik=None)
        kept, dropped = dedupe_listings([us, ams])
        assert dropped == 1
        # Equal caps: the SEC-registered (suffix-free) symbol wins.
        assert [p.ticker for p in kept] == ["AEG"]

    def test_matching_ciks_do_not_block(self):
        a = _peer("X", cik="0000000123", mc=10.0)
        b = _peer("X.L", cik="0000000123", mc=20.0)
        kept, dropped = dedupe_listings([a, b])
        assert dropped == 1
        assert [p.ticker for p in kept] == ["X.L"]


class TestUnrelatedRowsSurvive:

    def test_different_revenue_never_groups(self):
        kept, dropped = dedupe_listings([_peer("A", rev=1.0), _peer("B.L", rev=2.0)])
        assert dropped == 0
        assert len(kept) == 2

    def test_a_row_with_no_revenue_is_never_grouped(self):
        odd = _peer("C.L")
        odd.ratios["Revenue"] = None
        kept, dropped = dedupe_listings([_peer("C"), odd])
        assert dropped == 0
        assert len(kept) == 2

    def test_input_order_is_preserved(self):
        rows = [_peer("Z.L", mc=1.0), _peer("A", mc=2.0), _peer("M.DE", rev=5.0)]
        kept, _dropped = dedupe_listings(rows)
        assert [p.ticker for p in kept] == ["A", "M.DE"]
