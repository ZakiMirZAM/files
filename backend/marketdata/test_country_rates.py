"""Location-specific discount rates (Damodaran dcfrates: rf by currency via the
inflation differential, ERP by country via the country risk premium)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest  # noqa: E402

from marketdata import country_rates as cr  # noqa: E402


def test_us_dollar_us_company_is_unchanged():
    r = cr.location_rates("AAPL", "United States", "USD", 0.05, 0.035, 2026)
    assert r["riskFreeRate"] == pytest.approx(0.05)
    assert r["equityRiskPremium"] == pytest.approx(0.035)
    assert r["countryRiskPremium"] == 0.0


def test_riskfree_rate_scales_by_the_inflation_differential():
    r = cr.location_rates("RELIANCE.NS", None, "INR", 0.05, 0.035, 2026)
    pi, pi_us = cr.expected_inflation("INR", 2026), cr.expected_inflation("USD", 2026)
    assert pi > pi_us
    assert r["riskFreeRate"] == pytest.approx(1.05 * (1 + pi) / (1 + pi_us) - 1)


def test_country_premium_is_added_net_of_the_us_spread():
    r = cr.location_rates("RELIANCE.NS", None, "INR", 0.05, 0.035, 2026)
    d = cr._data()["countries"]
    assert r["country"] == "India" and r["countrySource"] == "listing suffix"
    assert r["equityRiskPremium"] == pytest.approx(0.035 + d["India"]["crp"] - d["United States"]["crp"])
    assert r["equityRiskPremium"] > 0.035


def test_country_resolution_order_and_aliases():
    assert cr.resolve_country("X", "South Korea", "KRW") == ("Korea", "stated country")
    assert cr.resolve_country("7203.T", None, "JPY")[0] == "Japan"
    assert cr.resolve_country("TSM", None, "TWD") == ("Taiwan", "reporting currency")
    assert cr.resolve_country("PR1", "Puerto Rico", "USD")[0] == "United States"


def test_unknown_location_keeps_us_rates_and_says_so():
    r = cr.location_rates("XYZ", None, "ZZZ", 0.05, 0.035, 2026)
    assert r["riskFreeRate"] == 0.05 and r["equityRiskPremium"] == 0.035
    assert len(r["notes"]) == 2 and r["adjusted"] is False
