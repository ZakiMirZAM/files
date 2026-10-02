"""Capex split (upkeep vs growth) and R&D capitalization. Network-free.

Rows are plain dicts, the way test_valuation_fixes.py builds them."""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import individualanalysis as ia  # noqa: E402
from betas import edgar_client as ec  # noqa: E402


def _row(year, **kw):
    base = {"Calendar Year": year, "Date": f"{year}-12-31", "Reported Currency": "USD",
            "Revenue": 1000.0, "Property Plant Equipment Net": 400.0,
            "Capital Expenditure": -100.0, "Depreciation And Amortization": 80.0,
            "Acquisitions Net": 0.0, "Market Cap": 2000.0, "Total Debt": 0.0,
            "Cash And Cash Equivalents": 0.0,
            "t_sector": "Technology", "t_industry": "Software - Application"}
    base.update(kw)
    return base


# ── Capex split ──────────────────────────────────────────────────────────────

def test_owner_worked_example_after_inflation_and_acquisitions():
    """Capex 120; revenue rose 50 once 2% inflation and 30 of bought revenue are
    removed; 0.40 of equipment per $1 of sales -> growth 20, upkeep 100; D&A 80
    -> upkeep / depreciation 1.25, profit overstatement 20."""
    prior = _row(2023)                                   # PP&E/sales 0.40, EV/Sales 2.0
    latest = _row(2024, Revenue=1000 * 1.02 + 30 + 50, **{
        "Capital Expenditure": -120.0, "Acquisitions Net": -60.0})
    out = ia._capex_split([prior, latest], {2024: 0.02})
    y = out["years"][-1]
    assert y["method"] == "greenwald"
    assert y["ppeToSales"] == pytest.approx(0.40)
    assert y["acquiredRevenue"] == pytest.approx(30.0)
    assert y["inflation"] == pytest.approx(0.02)
    assert y["revenueChangeNominal"] == pytest.approx(100.0)
    assert y["revenueChange"] == pytest.approx(50.0)
    assert y["growthSpending"] == pytest.approx(20.0)
    assert y["upkeepSpending"] == pytest.approx(100.0)
    assert y["upkeepToDepreciation"] == pytest.approx(1.25)
    assert y["profitOverstatement"] == pytest.approx(20.0)
    assert out["inflationAdjusted"] is True and out["acquisitionsAdjusted"] is True


def test_inflation_strips_a_pure_price_rise():
    rows = [_row(2023, Revenue=100.0, **{"Property Plant Equipment Net": 40.0}),
            _row(2024, Revenue=103.0, **{"Capital Expenditure": -10.0,
                                          "Depreciation And Amortization": 8.0})]
    y = ia._capex_split(rows, {2024: 0.03})["years"][-1]
    assert y["revenueChange"] == pytest.approx(0.0, abs=1e-9)
    assert y["growthSpending"] == 0.0
    assert y["upkeepSpending"] == pytest.approx(10.0)


def test_non_usd_and_unknown_currency_get_no_inflation():
    for ccy in ("EUR", None):
        rows = [_row(2023, Revenue=100.0, **{"Reported Currency": ccy}),
                _row(2024, Revenue=103.0, **{"Reported Currency": ccy})]
        out = ia._capex_split(rows, {2023: 0.04, 2024: 0.03})
        y = out["years"][-1]
        assert y["inflation"] is None
        assert y["revenueChange"] == pytest.approx(3.0)
        assert out["inflationAdjusted"] is False


def test_null_currency_row_falls_back_to_the_latest_known_currency():
    rows = [_row(2023, Revenue=100.0), _row(2024, Revenue=103.0, **{"Reported Currency": None})]
    out = ia._capex_split(rows, {2024: 0.03})
    assert out["years"][-1]["inflation"] == pytest.approx(0.03)
    assert out["years"][-1]["revenueChange"] == pytest.approx(0.0, abs=1e-9)
    assert out["inflationAdjusted"] is True and out["currency"] == "USD"


def test_january_year_end_takes_the_prior_calendar_years_cpi():
    # FY Feb 2024 to Jan 2025 is labelled 2025 but earned in 2024.
    rows = [_row(2024, Date="2024-01-31", Revenue=100.0),
            _row(2025, Date="2025-01-31", Revenue=104.0)]
    y = ia._capex_split(rows, {2024: 0.04, 2025: 0.01})["years"][-1]
    assert y["inflation"] == pytest.approx(0.04)
    assert y["revenueChange"] == pytest.approx(0.0, abs=1e-9)
    assert ia._cpi_year(_row(2025, Date="2025-09-27")) == 2025     # Oct-Sep: mostly 2025
    assert ia._cpi_year(_row(2025, Date=None)) == 2025             # no date: the label


def test_acquired_revenue_is_capped_at_the_revenue_change():
    # EV/Sales 2.0: 60 spent "buys" 30, but revenue only rose 10.
    rows = [_row(2023), _row(2024, Revenue=1010.0, **{"Acquisitions Net": -60.0})]
    y = ia._capex_split(rows)["years"][-1]
    assert y["acquiredRevenue"] == pytest.approx(10.0)
    assert y["revenueChange"] == pytest.approx(0.0, abs=1e-9)
    # Revenue fell: nothing bought can be removed from a decline.
    fell = ia._capex_split([_row(2023), _row(2024, Revenue=950.0, **{"Acquisitions Net": -60.0})])
    assert fell["years"][-1]["acquiredRevenue"] == 0.0
    assert fell["years"][-1]["revenueChange"] == pytest.approx(-50.0)
    assert fell["acquisitionsAdjusted"] is False


def test_acquisition_spend_removes_bought_revenue_at_prior_ev_to_sales():
    # Prior EV = 3,000 + 500 - 500 on revenue 1,000: EV/Sales 3.0; 60 spent buys 20.
    prior = _row(2023, **{"Market Cap": 3000.0, "Total Debt": 500.0,
                          "Cash And Cash Equivalents": 500.0})
    latest = _row(2024, Revenue=1100.0, **{"Acquisitions Net": -60.0})
    y = ia._capex_split([prior, latest])["years"][-1]
    assert y["acquiredRevenue"] == pytest.approx(20.0)
    assert y["revenueChange"] == pytest.approx(80.0)


def test_acquisitions_fall_back_to_an_earlier_positive_ev_to_sales():
    rows = [_row(2022, **{"Market Cap": 4000.0}),          # EV/Sales 4.0
            _row(2023, **{"Market Cap": None}),              # prior year has none
            _row(2024, Revenue=1100.0, **{"Acquisitions Net": -80.0})]
    y = ia._capex_split(rows)["years"][-1]
    assert y["acquiredRevenue"] == pytest.approx(20.0)


def test_growth_spending_floors_at_zero_when_revenue_falls():
    rows = [_row(2023, Revenue=1200.0), _row(2024, Revenue=1000.0)]
    y = ia._capex_split(rows)["years"][-1]
    assert y["revenueChange"] == pytest.approx(-200.0)
    assert y["growthSpending"] == 0.0
    assert y["upkeepSpending"] == pytest.approx(100.0)
    assert y["method"] == "greenwald"


def test_average_row_means_and_ratio_of_means():
    rows = [_row(2021, Revenue=1000.0),
            _row(2022, Revenue=1100.0, **{"Capital Expenditure": -100.0,
                                           "Depreciation And Amortization": 50.0}),
            _row(2023, Revenue=1100.0, **{"Capital Expenditure": -60.0,
                                           "Depreciation And Amortization": 100.0})]
    out = ia._capex_split(rows)
    assert [y["year"] for y in out["years"]] == [2021, 2022, 2023]
    first = out["years"][0]
    assert first["method"] == "dda_proxy_insufficient" and first["ppeToSales"] is None
    avg = out["average"]
    ups = [y["upkeepSpending"] for y in out["years"]]
    deps = [y["depreciation"] for y in out["years"]]
    assert avg["upkeepSpending"] == pytest.approx(sum(ups) / 3, abs=0.01)
    assert avg["capitalSpending"] == pytest.approx((100 + 100 + 60) / 3, abs=0.01)
    assert avg["upkeepToDepreciation"] == pytest.approx((sum(ups) / 3) / (sum(deps) / 3), abs=1e-4)
    # Only the years that used the ratio enter its mean.
    assert avg["ppeToSales"] == pytest.approx(
        (out["years"][1]["ppeToSales"] + out["years"][2]["ppeToSales"]) / 2)
    assert avg["revenueChange"] == pytest.approx(50.0)
    for k in ("year", "method", "inflation", "acquiredRevenue", "revenueChangeNominal"):
        assert k not in avg


def test_capital_light_flag():
    heavy = ia._capex_split([_row(2023), _row(2024)])
    light = ia._capex_split([_row(2023), _row(2024, **{"Property Plant Equipment Net": 40.0})])
    assert heavy["capitalLight"] is False and heavy["ppeToRevenueLatest"] == pytest.approx(0.40)
    assert light["capitalLight"] is True and light["ppeToRevenueLatest"] == pytest.approx(0.04)


def test_owner_earnings_upkeep_equals_capex_split_upkeep():
    rows = [_row(2022, Revenue=900.0), _row(2023, Revenue=950.0),
            _row(2024, Revenue=1080.0, **{"Acquisitions Net": -60.0, "Net Income": 150.0,
                                           "Change In Working Capital": 0.0})]
    infl = {2023: 0.04, 2024: 0.03}
    oe = ia._owner_earnings(rows, infl)
    cs = ia._capex_split(rows, infl)
    assert oe["maintenanceCapexProxy"] == pytest.approx(cs["years"][-1]["upkeepSpending"])
    assert oe["growthCapex"] == pytest.approx(cs["years"][-1]["growthSpending"])


def test_capex_split_not_applicable_for_financials_and_single_year():
    bank = [_row(2023, t_sector="Financial Services", t_industry="Banks - Diversified"),
            _row(2024, t_sector="Financial Services", t_industry="Banks - Diversified")]
    assert ia._capex_split(bank)["applicable"] is False
    assert ia._capex_split([_row(2024)])["applicable"] is False


def test_maintenance_capex_wrapper_matches_detail():
    rows = [_row(2023), _row(2024, Revenue=1100.0)]
    d = ia._maintenance_capex_detail(rows, 1)
    assert ia._maintenance_capex(rows, 1) == (d["upkeep"], d["method"])


# ── R&D capitalization ──────────────────────────────────────────────────────

_RD = [100.0, 90.0, 80.0, 70.0, 60.0, 50.0]   # newest first


def test_owner_rnd_example_pure_math():
    asset = ia._research_asset(_RD, 5)
    amort = ia._research_amortization(_RD, 5)
    assert asset == pytest.approx(260.0)
    assert amort == pytest.approx(70.0)
    # Asset_t = Asset_(t-1) + R&D_t - amortization_t
    assert ia._research_asset(_RD[1:], 5) + 100.0 - amort == pytest.approx(asset)
    kw = dict(rd_now=100.0, amort=amort, ebit=200.0, tax=0.25, capital=1000.0,
              research_asset=asset)
    expensed = ia._rnd_restate(tax_capitalized=False, **kw)
    capitalized = ia._rnd_restate(tax_capitalized=True, **kw)
    assert expensed["ebitAdjusted"] == pytest.approx(230.0)
    assert expensed["nopatReported"] == pytest.approx(150.0)
    assert expensed["nopatAdjusted"] == pytest.approx(180.0)
    assert capitalized["nopatAdjusted"] == pytest.approx(172.5)
    assert expensed["capitalAdjusted"] == pytest.approx(1260.0)
    assert expensed["roicReported"] == pytest.approx(0.15)
    assert round(expensed["roicAdjusted"], 4) == 0.1429
    assert round(capitalized["roicAdjusted"], 4) == 0.1369


def test_no_roic_on_negative_capital():
    out = ia._rnd_restate(rd_now=10.0, amort=5.0, ebit=-20.0, tax=0.0, capital=-6.0,
                          research_asset=47.0, tax_capitalized=False)
    assert out["roicReported"] is None                  # not a 250% return
    assert out["roicAdjusted"] == pytest.approx(-15.0 / 41.0)


def _rd_rows(n=7, last=2024, **latest_kw):
    """n consecutive years; R&D 10% of revenue; equity + debt grows 100 a year."""
    rows = []
    for k in range(n):
        y = last - (n - 1 - k)
        rows.append(_row(y, Revenue=1000.0, **{
            "Research And Development Expenses": 50.0 + 10.0 * k,
            "Operating Income": 200.0, "Income Tax Expense": 25.0, "Income Before Tax": 100.0,
            "Total Stockholders Equity": 700.0 + 100.0 * k, "Total Debt": 300.0}))
    rows[-1].update(latest_kw)
    return rows


def test_materiality_tests():
    rev = ia._rnd_capitalization(_rd_rows())
    assert rev["applicable"] and rev["materiality"] == "revenue"
    # 2% of revenue, but 20% of a 100 operating profit.
    op = ia._rnd_capitalization(_rd_rows(**{"Research And Development Expenses": 20.0,
                                            "Operating Income": 100.0}))
    assert op["applicable"] and op["materiality"] == "operatingProfit"
    assert op["rdToOperatingProfit"] == pytest.approx(0.20)
    # 2% of revenue at an operating loss: not material.
    loss = ia._rnd_capitalization(_rd_rows(**{"Research And Development Expenses": 20.0,
                                              "Operating Income": -50.0}))
    assert loss["applicable"] is False and loss["rdToOperatingProfit"] is None
    # 2% of revenue and under 10% of operating profit: not material.
    small = ia._rnd_capitalization(_rd_rows(**{"Research And Development Expenses": 20.0,
                                               "Operating Income": 400.0}))
    assert small["applicable"] is False


def test_industry_life_lookup_and_default():
    assert ia._rnd_life("Software - Infrastructure") == (3, "industry", "software")
    assert ia._rnd_life("Drug Manufacturers - General") == (10, "industry", "drug makers")
    assert ia._rnd_life("Electronic Gaming & Multimedia")[0] == 3
    assert ia._rnd_life("Electronic - Gaming & Multimedia")[0] == 3
    assert ia._rnd_life("Semiconductors")[0] == 5
    assert ia._rnd_life("Communication Equipment") == (10, "industry", "telecom equipment makers")
    assert ia._rnd_life("Discount Stores") == (5, "default", None)
    assert ia._rnd_life(None) == (5, "default", None)
    out = ia._rnd_capitalization(_rd_rows(), industry="Biotechnology")
    assert out["life"] == 10 and out["lifeSource"] == "industry" and out["lifeIndustry"] == "drug makers"


def test_beginning_of_year_capital_and_prior_asset():
    rows = _rd_rows()
    out = ia._rnd_capitalization(rows, wacc=0.09)          # default life 5, R&D 50..110
    assert out["capitalBasis"] == "beginning_of_year"
    rd_newest = [110.0, 100.0, 90.0, 80.0, 70.0, 60.0]
    prior_asset = ia._research_asset(rd_newest[1:], 5)
    assert out["researchAssetPriorYear"] == pytest.approx(prior_asset)
    assert out["researchAsset"] == pytest.approx(ia._research_asset(rd_newest, 5))
    ic_prior = 700.0 + 100.0 * 5 + 300.0                   # the 2023 row, not 2024
    assert out["investedCapitalReported"] == pytest.approx(ic_prior)
    assert out["investedCapitalAdjusted"] == pytest.approx(ic_prior + prior_asset)
    assert out["roicReported"] == pytest.approx(200.0 * 0.75 / ic_prior, abs=1e-4)
    assert out["roicMinusWaccReported"] == pytest.approx(out["roicReported"] - 0.09, abs=1e-4)
    assert out["yearsOfHistoryUsed"] == 6
    assert out["taxRate"] == pytest.approx(0.25)


def test_rnd_needs_the_immediately_preceding_year():
    rows = _rd_rows()
    del rows[-2]                                           # 2023 missing
    out = ia._rnd_capitalization(rows)
    assert out["applicable"] is False and "previous fiscal year" in out["reason"]


def _facts(fy, rnd_dta, readable):
    return ec.FinancialFacts(period_end=f"{fy}-12-31", fiscal_year=fy, income={}, leases={},
                             rnd_dta=rnd_dta, dta_readable=readable)


@pytest.mark.parametrize("date, facts, ccy, expected", [
    # Apple-like FY2025: the tax year began 2024-09-29, still capitalized.
    ("2025-09-28", _facts(2025, 15e9, True), "USD", "footnote_capitalized"),
    # Calendar FY2025: the tax year began 2025-01-01, deductible again.
    ("2025-12-31", _facts(2025, 4e9, True), "USD", "footnote_us_2025_expensed"),
    ("2025-12-31", _facts(2025, None, True), "USD", "footnote_expensed"),
    ("2025-12-31", _facts(2025, None, None), "USD", "rule_us_expensed"),
    # 2022-2024 tax years: the law required capitalization, so a footnote
    # without the line is a tagging gap, not proof of a deduction.
    ("2023-12-31", _facts(2023, None, True), "USD", "rule_us_capitalized"),
    ("2025-09-28", _facts(2025, None, True), "USD", "rule_us_capitalized"),
    ("2023-12-31", _facts(2023, None, False), "USD", "rule_us_capitalized"),
    ("2021-12-31", _facts(2021, None, True), "USD", "footnote_expensed"),
    ("2021-12-31", _facts(2021, None, None), "USD", "rule_us_expensed"),
    # No usable footnote: the year-and-country rule.
    ("2023-12-31", None, "USD", "rule_us_capitalized"),
    ("2025-12-31", None, "USD", "rule_us_expensed"),
    ("2025-09-28", None, "USD", "rule_us_capitalized"),
    ("2020-12-31", None, "USD", "rule_us_expensed"),
    ("2023-12-31", None, "EUR", "rule_non_us_expensed"),
    # Facts from a different fiscal year are ignored.
    ("2023-12-31", _facts(2024, 5e9, True), "USD", "rule_us_capitalized"),
])
def test_tax_method_branches(date, facts, ccy, expected):
    fy = int(date[:4])
    latest = _row(fy, Date=date, **{"Reported Currency": ccy})
    assert ia._rnd_tax_method(latest, facts) == expected


def test_tax_method_null_currency_falls_back_to_the_latest_known_one():
    rows = _rd_rows(2, 2023, **{"Reported Currency": None})
    assert ia._rnd_capitalization(rows)["taxMethod"] == "rule_us_capitalized"
    eur = _rd_rows(2, 2023, **{"Reported Currency": None})
    eur[0]["Reported Currency"] = "EUR"
    assert ia._rnd_capitalization(eur)["taxMethod"] == "rule_non_us_expensed"


def test_capitalized_for_tax_taxes_the_add_back():
    rows = _rd_rows(2, 2025, Date="2025-09-28")
    cap = ia._rnd_capitalization(rows, facts=_facts(2025, 1e9, True))
    # Calendar FY2025 began 2025-01-01: a footnote without the line is a deduction.
    exp = ia._rnd_capitalization(_rd_rows(2, 2025), facts=_facts(2025, None, True))
    assert cap["taxMethod"] == "footnote_capitalized" and exp["taxMethod"] == "footnote_expensed"
    lift = cap["currentRD"] - cap["amortizationThisYear"]
    assert exp["nopatAdjusted"] - exp["nopatReported"] == pytest.approx(lift, abs=0.01)
    assert cap["nopatAdjusted"] - cap["nopatReported"] == pytest.approx(lift * 0.75, abs=0.01)


# ── 10-K tax footnote parse ──────────────────────────────────────────────────

def _instance(facts_xml: str) -> bytes:
    return f"""<?xml version="1.0"?>
<xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:dei="http://xbrl.sec.gov/dei/2025"
      xmlns:acme="http://acme.example/20251231">
  <context id="FY"><period><startDate>2025-01-01</startDate><endDate>2025-12-31</endDate></period></context>
  <context id="I"><period><instant>2025-12-31</instant></period></context>
  <context id="P"><period><instant>2024-12-31</instant></period></context>
  <dei:DocumentPeriodEndDate contextRef="I">2025-12-31</dei:DocumentPeriodEndDate>
  <us-gaap:Revenues contextRef="FY" unitRef="usd">1000</us-gaap:Revenues>
  {facts_xml}
</xbrl>""".encode()


def test_parse_custom_namespace_capitalized_research_dta():
    ff = ec.parse_financial_facts(_instance(
        '<acme:DeferredTaxAssetsCapitalizedResearchAndDevelopment contextRef="P" unitRef="usd">7</acme:DeferredTaxAssetsCapitalizedResearchAndDevelopment>'
        '<acme:DeferredTaxAssetsCapitalizedResearchAndDevelopment contextRef="I" unitRef="usd">42</acme:DeferredTaxAssetsCapitalizedResearchAndDevelopment>'
        '<us-gaap:DeferredTaxAssetsTaxCreditCarryforwardsResearch contextRef="I" unitRef="usd">9</us-gaap:DeferredTaxAssetsTaxCreditCarryforwardsResearch>'))
    assert ff.rnd_dta == 42.0          # the period-end instant, not the prior year
    assert ff.dta_readable is True     # the research credit is another DTA line, not evidence


def test_parse_without_the_line():
    only_credit = ec.parse_financial_facts(_instance(
        '<us-gaap:DeferredTaxAssetsTaxCreditCarryforwardsResearch contextRef="I" unitRef="usd">9</us-gaap:DeferredTaxAssetsTaxCreditCarryforwardsResearch>'))
    assert only_credit.rnd_dta is None and only_credit.dta_readable is True
    bare = ec.parse_financial_facts(_instance(""))
    assert bare.rnd_dta is None and bare.dta_readable is False


@pytest.mark.parametrize("name", [
    "DeferredTaxAssetsResearchAndDevelopmentExpenditureAmortization",          # de:
    "DeferredTaxAssetsResearchAndDevelopmentCapitalization",                   # syk:, mdt:
    "DeferredTaxAssetsTaxDeferredExpenseCapitalizationOfResearchAndExperimentalExpenditures",  # rtx:
    "DeferredTaxAssetsResearchExpenditures",                                   # cat:
    "DeferredTaxAssetsResearchAndExperimentationExpenditureAmortization",      # hood:
    "DeferredTaxAssetCapitalizedResearchAndDevelopment",                       # pep:, txn: (singular)
    "DeferredTaxAssetsCapitalizedResearchAndDevelopment",                      # aapl:, msft:
    "DeferredTaxAssetsTaxDeferredExpenseCapitalizedResearchAndDevelopmentCosts",  # nvda:, meta:
    "DeferredTaxAssetsInProcessResearchAndDevelopment",                        # Alphabet
])
def test_research_dta_names_filers_use(name):
    ff = ec.parse_financial_facts(_instance(
        f'<acme:{name} contextRef="I" unitRef="usd">11</acme:{name}>'
        '<us-gaap:DeferredTaxAssetsOther contextRef="I" unitRef="usd">3</us-gaap:DeferredTaxAssetsOther>'))
    assert ff.rnd_dta == 11.0 and ff.dta_readable is True


@pytest.mark.parametrize("name", [
    "DeferredTaxAssetsTaxCreditCarryforwardsResearch",
    "DeferredTaxAssetsTaxCreditCarryforwardsResearchValuationAllowance",
    "DeferredTaxAssetsCapitalizedInterest",
])
def test_research_credits_and_other_capitalized_lines_are_not_evidence(name):
    ff = ec.parse_financial_facts(_instance(
        f'<acme:{name} contextRef="I" unitRef="usd">11</acme:{name}>'))
    assert ff.rnd_dta is None and ff.dta_readable is True


def test_cached_row_from_an_older_parse_is_reparsed(tmp_path, monkeypatch):
    conn = sqlite3.connect(":memory:")
    ec._ensure_xbrl_table(conn)
    conn.execute("INSERT INTO xbrl_financials VALUES ('0000000001', 2025, '2025-12-31', "
                 "'{\"revenue\": 1000}', '{}', 'x', '{\"rndDta\": null, \"dtaReadable\": true}')")
    name = "DeferredTaxAssetsResearchAndDevelopmentExpenditureAmortization"
    (tmp_path / "sec_instance_000000000125000001.xml").write_bytes(_instance(
        f'<acme:{name} contextRef="I" unitRef="usd">8</acme:{name}>'))
    monkeypatch.setattr(ec, "DEFAULT_CACHE_DIR", tmp_path)
    monkeypatch.setattr(ec, "cik_for_ticker", lambda c, t: "0000000001")
    monkeypatch.setattr(ec, "latest_10k", lambda cik, force=False: ec.TenK(
        "0000000001-25-000001", "2025-12-31", 2025))
    monkeypatch.setattr(ec, "fetch_financial_facts", lambda *a, **k: pytest.fail("no fetch"))
    assert ec.get_financial_facts(conn, "ACME").rnd_dta == 8.0
    stored = conn.execute("SELECT tax_json FROM xbrl_financials").fetchone()[0]
    assert f'"v": {ec.TAX_PARSE_VERSION}' in stored
    # Current-version rows are served as cached, with no re-parse.
    (tmp_path / "sec_instance_000000000125000001.xml").unlink()
    assert ec.get_financial_facts(conn, "ACME").rnd_dta == 8.0


def test_cached_row_without_tax_fields_reparses_the_file_on_disk(tmp_path, monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.execute("""CREATE TABLE xbrl_financials (cik TEXT NOT NULL, fy INTEGER NOT NULL,
                    period_end TEXT, income_json TEXT, leases_json TEXT, updated TEXT,
                    PRIMARY KEY (cik, fy))""")
    conn.execute("INSERT INTO xbrl_financials VALUES ('0000000001', 2025, '2025-12-31', "
                 "'{\"revenue\": 1000}', '{}', 'x')")
    (tmp_path / "sec_instance_000000000125000001.xml").write_bytes(_instance(
        '<us-gaap:DeferredTaxAssetsInProcessResearchAndDevelopment contextRef="I" unitRef="usd">5</us-gaap:DeferredTaxAssetsInProcessResearchAndDevelopment>'))
    monkeypatch.setattr(ec, "DEFAULT_CACHE_DIR", tmp_path)
    monkeypatch.setattr(ec, "cik_for_ticker", lambda c, t: "0000000001")
    monkeypatch.setattr(ec, "latest_10k", lambda cik, force=False: ec.TenK(
        "0000000001-25-000001", "2025-12-31", 2025))
    monkeypatch.setattr(ec, "fetch_financial_facts", lambda *a, **k: pytest.fail("no fetch"))
    ff = ec.get_financial_facts(conn, "ACME")
    assert ff.income == {"revenue": 1000} and ff.rnd_dta == 5.0 and ff.dta_readable is False
    stored = conn.execute("SELECT tax_json FROM xbrl_financials").fetchone()[0]
    assert '"rndDta": 5.0' in stored
