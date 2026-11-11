"""Locks the USD ingest rules in data/usd_ingest.py. Network-free."""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data import usd_ingest as U  # noqa: E402
from data.financial_db import EXCEL_COLUMNS  # noqa: E402
from remediation.fx_history import MONTHLY_DDL, monthly_from_daily  # noqa: E402

RATES = {
    ("TWD", "2015-12"): 0.03,
    ("JPY", "2015-03"): 0.008,
    ("ILS", "2020-12"): 0.30,
    ("EUR", "2019-10"): 1.10,      # 2019-11 and 2019-12 are missing on purpose
}


def _row(**kw):
    base = {c: "" for c in EXCEL_COLUMNS}
    base.update({"Ticker": "2330.TW", "Name": "TSMC", "Date": "2015-12-31",
                 "Reported Currency": "TWD", "Period": "FY", "Calendar Year": "2015"})
    base.update({k.replace("_", " "): v for k, v in kw.items()})
    return base


def test_every_numeric_column_is_classified_once():
    numeric = [c for c in EXCEL_COLUMNS if c not in U.TEXT_COLUMNS]
    assert set(U.MONEY_COLUMNS) | U.UNITLESS_COLUMNS == set(numeric)
    assert not set(U.MONEY_COLUMNS) & U.UNITLESS_COLUMNS


@pytest.mark.parametrize("col", [
    "Revenue", "Net Income", "Total Assets", "Market Cap", "Enterprise Value",
    "EPS", "EPS Diluted", "Book Value Per Share", "Free Cash Flow", "Dividend",
    "Graham Number", "Working Capital", "Cash At Beginning Of Period",
    "Capex Per Share", "Net Debt",
])
def test_money_columns(col):
    assert col in U.MONEY_COLUMNS


@pytest.mark.parametrize("col", [
    "PE Ratio", "Price To Sales Ratio", "ROE", "ROIC", "Gross Profit Ratio",
    "Weighted Average Shs Out", "Weighted Average Shs Out Dil", "Revenue Growth",
    "Debt To Equity", "Dividend Yield", "Days Sales Outstanding",
    "Inventory Turnover", "Current Ratio", "SGA Expenses Growth",
    "Capex To Revenue", "Net Debt To EBITDA", "Earnings Yield",
])
def test_unitless_columns_are_never_converted(col):
    assert col in U.UNITLESS_COLUMNS


def test_convert_row_keeps_ratios_and_identities():
    raw = _row(Revenue="1000", Net_Income="250", Market_Cap="5000", EPS="10",
               PE_Ratio="20", Price_To_Sales_Ratio="5", ROE="0.25",
               Weighted_Average_Shs_Out="25", Net_Income_Ratio="0.25")
    rec, reason = U.convert_row(raw, RATES)
    assert reason is None
    assert rec["Revenue"] == pytest.approx(30.0)
    assert rec["Net Income"] == pytest.approx(7.5)
    assert rec["EPS"] == pytest.approx(0.30)
    assert rec["Market Cap"] == pytest.approx(150.0)
    # unitless columns are untouched
    assert rec["PE Ratio"] == 20 and rec["ROE"] == 0.25
    assert rec["Weighted Average Shs Out"] == 25
    # identities survive because one rate is used for the whole row
    assert rec["Market Cap"] == pytest.approx(rec["Price To Sales Ratio"] * rec["Revenue"])
    assert rec["Net Income"] / rec["Revenue"] == pytest.approx(rec["Net Income Ratio"])
    assert rec["Market Cap"] / rec["Net Income"] == pytest.approx(rec["PE Ratio"])
    assert rec["Reported Currency"] == "USD"
    assert rec["Source Currency"] == "TWD" and rec["FX Rate"] == 0.03


def test_usd_row_is_unchanged():
    rec, _ = U.convert_row(_row(Reported_Currency="USD", Revenue="1000"), {})
    assert rec["Revenue"] == 1000 and rec["FX Rate"] == 1.0


def test_rate_is_the_rows_own_month_not_the_calendar_year():
    rec, _ = U.convert_row(_row(Date="2015-03-31", Reported_Currency="JPY",
                                Revenue="1000"), RATES)
    assert rec["Revenue"] == pytest.approx(8.0)


def test_minor_units_and_vendor_aliases():
    assert U.usd_rate("ILA", "2020-12-31", RATES) == pytest.approx(0.003)
    assert U.usd_rate("NIS", "2020-12-31", RATES) == pytest.approx(0.30)
    rec, _ = U.convert_row(_row(Date="2020-12-31", Reported_Currency="ILA",
                                Revenue="100"), RATES)
    assert rec["Source Currency"] == "ILS" and rec["Revenue"] == pytest.approx(0.3)


def test_gap_looks_back_two_months_and_no_further():
    assert U.usd_rate("EUR", "2019-12-31", RATES) == pytest.approx(1.10)
    assert U.usd_rate("EUR", "2020-01-31", RATES) is None


def test_missing_rate_is_a_reject_never_one_to_one():
    rec, reason = U.convert_row(_row(Reported_Currency="GEL", Revenue="1"), RATES)
    assert rec is None and "GEL" in reason
    rec, reason = U.convert_row(_row(Reported_Currency="", Revenue="1"), RATES)
    assert rec is None and reason == "no reporting currency"
    rec, reason = U.convert_row(_row(Reported_Currency="Unavailable", Revenue="1"), RATES)
    assert rec is None and reason


def test_blank_row_is_silently_skipped():
    assert U.convert_row(_row(Date="", Reported_Currency=""), RATES) == (None, None)


def test_junk_cells_become_null_not_zero():
    rec, _ = U.convert_row(_row(Revenue="#N/A", Net_Income="  ", Total_Assets="nan"), RATES)
    assert rec["Revenue"] is None and rec["Net Income"] is None
    assert rec["Total Assets"] is None


def _db():
    conn = sqlite3.connect(":memory:")
    cols = ", ".join(
        f'"{c}" TEXT' if c in U.TEXT_COLUMNS else f'"{c}" REAL'
        for c in EXCEL_COLUMNS if c not in ("Ticker", "Calendar Year"))
    conn.execute(f'CREATE TABLE financials (Ticker TEXT NOT NULL, '
                 f'"Calendar Year" INTEGER NOT NULL, {cols}, last_updated TEXT, '
                 f'PRIMARY KEY (Ticker, "Calendar Year"))')
    conn.execute(MONTHLY_DDL)
    conn.executemany("INSERT INTO fx_rates_monthly VALUES (?,?,?,?)",
                     [(c, m, r, r) for (c, m), r in RATES.items()])
    return conn


def test_load_tab_keys_by_the_period_end_year_and_reports_rejects():
    conn = _db()
    rows = [
        _row(Revenue="1000", Calendar_Year="2014"),            # vendor says 2014
        _row(Ticker="X.GE", Reported_Currency="GEL", Revenue="5"),
        _row(Ticker="BLANK", Date="", Reported_Currency=""),
    ]
    stats = U.load_tab(conn, rows, source="2015", table="financials", annual=True)
    assert stats == {"loaded": 1, "blank": 1, "rejected": 1}
    got = conn.execute('SELECT Ticker, "Calendar Year", Revenue, "Reported Currency", '
                       '"Source Currency", Period FROM financials').fetchall()
    assert got == [("2330.TW", 2015, pytest.approx(30.0), "USD", "TWD", "FY")]
    assert conn.execute("SELECT source, ticker FROM usd_ingest_rejects").fetchall() \
        == [("2015", "X.GE")]


def test_load_tab_rejects_an_invalid_year():
    conn = _db()
    stats = U.load_tab(conn, [_row(Date="1800-12-31", Reported_Currency="USD", Revenue="1")],
                       source="x", table="financials", annual=True)
    assert stats["loaded"] == 0 and stats["rejected"] == 1


def test_change_of_year_end_shifts_the_whole_earlier_run_back():
    """March years 2009-03 and 2010-03, then a switch to December (2010-12).
    The March run moves back one year each, so no fiscal year is lost and the
    order stays ascending."""
    conn = _db()
    seen: set = set()
    stats = {}
    for src, date in (("2008", "2009-03-31"), ("2009", "2010-03-31"),
                      ("2010", "2010-12-31"), ("2011", "2011-12-31")):
        stats = U.load_tab(conn, [_row(Reported_Currency="USD", Date=date, Revenue="1")],
                           source=src, table="financials", annual=True, seen=seen)
        assert stats["rejected"] == 0
    assert conn.execute('SELECT "Calendar Year", Date FROM financials ORDER BY 1').fetchall()         == [(2008, "2009-03-31"), (2009, "2010-03-31"),
            (2010, "2010-12-31"), (2011, "2011-12-31")]


def test_an_older_period_never_displaces_a_newer_one():
    """The stored row is NEWER than the incoming one: nothing is shifted and
    the incoming row is reported, never silently dropped or swapped in."""
    conn = _db()
    seen: set = set()
    U.load_tab(conn, [_row(Reported_Currency="USD", Date="2016-12-31", Revenue="2")],
               source="a", table="financials", annual=True, seen=seen)
    second = U.load_tab(conn, [_row(Reported_Currency="USD", Date="2016-03-31", Revenue="1")],
                        source="b", table="financials", annual=True, seen=seen)
    assert second == {"loaded": 0, "blank": 0, "rejected": 1}
    assert conn.execute('SELECT "Calendar Year", Date FROM financials').fetchall()         == [(2016, "2016-12-31")]
    assert "already loaded" in conn.execute(
        "SELECT reason FROM usd_ingest_rejects").fetchone()[0]


def test_two_fiscal_years_ending_in_one_calendar_year_are_both_kept():
    """A change of fiscal year end: years ending 2016-03-31 and 2016-12-31.
    The earlier one moves to 2015 (free), so no fiscal year is lost."""
    conn = _db()
    seen: set = set()
    U.load_tab(conn, [_row(Reported_Currency="USD", Date="2016-03-31", Revenue="1")],
               source="2015", table="financials", annual=True, seen=seen)
    second = U.load_tab(conn, [_row(Reported_Currency="USD", Date="2016-12-31", Revenue="2")],
                        source="2016", table="financials", annual=True, seen=seen)
    assert second["loaded"] == 1 and second["rejected"] == 0 and second["rekeyed"] == 1
    assert conn.execute('SELECT "Calendar Year", Date, Revenue FROM financials '
                        'ORDER BY 1').fetchall() == [
        (2015, "2016-03-31", 1.0), (2016, "2016-12-31", 2.0)]


def test_53_week_filer_keeps_every_year():
    """Year ends 2009-01-02, 2010-01-01, 2010-12-31, 2011-12-30: four fiscal
    years, four keys, nothing rejected."""
    assert [U._fiscal_year(d) for d in
            ("2009-01-02", "2010-01-01", "2010-12-31", "2011-12-30", "2016-01-31")]         == [2008, 2009, 2010, 2011, 2016]
    conn = _db()
    seen: set = set()
    total = {"loaded": 0, "rejected": 0}
    for src, date in (("2008", "2009-01-02"), ("2009", "2010-01-01"),
                      ("2010", "2010-12-31"), ("2011", "2011-12-30")):
        st = U.load_tab(conn, [_row(Reported_Currency="USD", Date=date, Revenue="1")],
                        source=src, table="financials", annual=True, seen=seen)
        total["loaded"] += st["loaded"]; total["rejected"] += st["rejected"]
    assert total == {"loaded": 4, "rejected": 0}
    assert [r[0] for r in conn.execute(
        'SELECT "Calendar Year" FROM financials ORDER BY 1')] == [2008, 2009, 2010, 2011]


def test_quarterly_row_without_a_period_is_rejected():
    conn = _db()
    conn.execute('CREATE TABLE q AS SELECT * FROM financials')
    stats = U.load_tab(conn, [_row(Reported_Currency="USD", Period="", Revenue="1")],
                       source="Q", table="q")
    assert stats["loaded"] == 0 and stats["rejected"] == 1


def test_run_refuses_the_live_database_name(tmp_path):
    with pytest.raises(ValueError):
        U.run(str(tmp_path / "FINANCIALS.DB"), str(tmp_path))


def _usd_warehouse(tmp_path):
    """A FinancialDB on a USD warehouse with one stored June-FYE row."""
    from data.financial_db import FinancialDB
    db = FinancialDB(str(tmp_path / "w.db"))
    with db._connect() as conn:
        U.ensure_columns(conn, "financials")
        U.ensure_columns(conn, "financials_quarterly")
        conn.execute(MONTHLY_DDL)
        conn.executemany("INSERT INTO fx_rates_monthly VALUES (?,?,?,?)",
                         [("JPY", "2016-06", 0.01, 0.01), ("JPY", "2017-06", 0.01, 0.01)])
        # the ingest stored the year ending 2016-06 under year key 2016
        conn.execute('INSERT INTO financials (Ticker, "Calendar Year", Date, Period, '
                     'Revenue, "Reported Currency", "Source Currency", "FX Rate") '
                     "VALUES ('JUNE.T', 2016, '2016-06-30', 'FY', 500.0, 'USD', 'JPY', 0.01)")
        conn.commit()
    db._usd_mode_cached = None
    return db


def _yf(year, date, revenue, ni, currency="JPY"):
    return {"Ticker": "JUNE.T", "Calendar Year": year, "Date": date, "Period": "FY",
            "Reported Currency": currency, "Revenue": revenue, "Net Income": ni,
            "Gross Profit Ratio": 0.4, "last_updated": "now"}


def test_live_update_converts_to_usd_and_never_duplicates_a_stored_period(tmp_path, monkeypatch):
    db = _usd_warehouse(tmp_path)
    monkeypatch.setattr(db, "_fetch_yf_annual", lambda t: [
        # the SAME fiscal period as the stored row, but keyed 2015 by the source
        _yf(2015, "2016-06-30", 50000.0, 9000.0),
        # a genuinely new year
        _yf(2017, "2017-06-30", 70000.0, 8000.0),
        # a different period that happens to share the stored row's year key
        dict(_yf(2016, "2016-12-31", 99999.0, 7777.0)),
    ])
    assert db.update_ticker("JUNE.T", verbose=False, fill_gaps=True) == 1
    with db._connect() as conn:
        rows = conn.execute(
            'SELECT "Calendar Year", Date, Revenue, "Net Income", "Reported Currency", '
            '"Source Currency", "Gross Profit Ratio" FROM financials '
            "WHERE Ticker='JUNE.T' ORDER BY 1").fetchall()
    assert [tuple(r) for r in rows] == [
        # stored row untouched: not duplicated, and NOT gap-filled from 2016-12
        (2016, "2016-06-30", 500.0, None, "USD", "JPY", None),
        # new year written in USD (70000 JPY x 0.01), ratio left alone
        (2017, "2017-06-30", pytest.approx(700.0), pytest.approx(80.0), "USD", "JPY", 0.4),
    ]


def test_live_update_gap_fills_only_the_same_period_in_usd(tmp_path, monkeypatch):
    db = _usd_warehouse(tmp_path)
    monkeypatch.setattr(db, "_fetch_yf_annual",
                        lambda t: [_yf(2016, "2016-06-30", 12345.0, 9000.0)])
    assert db.update_ticker("JUNE.T", verbose=False, fill_gaps=True) == 0
    with db._connect() as conn:
        rev, ni = conn.execute('SELECT Revenue, "Net Income" FROM financials').fetchone()
    assert rev == 500.0                       # a stored value is never overwritten
    assert ni == pytest.approx(90.0)          # the NULL is filled, in USD


def test_live_update_drops_a_record_without_a_currency(tmp_path, monkeypatch):
    db = _usd_warehouse(tmp_path)
    monkeypatch.setattr(db, "_fetch_yf_annual",
                        lambda t: [_yf(2017, "2017-06-30", 70000.0, 1.0, currency=None)])
    assert db.update_ticker("JUNE.T", verbose=False) == 0
    with db._connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM financials").fetchone()[0] == 1


def test_legacy_db_write_path_is_unchanged(tmp_path, monkeypatch):
    """No monthly table and no "Source Currency" column: nothing is converted."""
    from data.financial_db import FinancialDB
    db = FinancialDB(str(tmp_path / "legacy.db"))
    assert db._usd_mode() is False
    monkeypatch.setattr(db, "_fetch_yf_annual",
                        lambda t: [_yf(2017, "2017-06-30", 70000.0, 1.0)])
    assert db.update_ticker("JUNE.T", verbose=False) == 1
    with db._connect() as conn:
        assert conn.execute("SELECT Revenue FROM financials").fetchone()[0] == 70000.0


def test_impossible_caps_are_quarantined_and_real_ones_kept():
    conn = _db()
    ins = ('INSERT INTO financials (Ticker, "Calendar Year", "Market Cap", Revenue, '
           '"Total Stockholders Equity", "PE Ratio", "Net Income") VALUES (?,?,?,?,?,?,?)')
    conn.executemany(ins, [
        ("JUNK", 2024, 8.4e13, 3e8, 2e8, 1.5e7, 5.0),      # 84 trillion haulier
        ("OVER", 2024, 2e13, 4e11, 1e11, 20.0, 1e10),      # above the 10-trillion ceiling
        ("AAPL", 2024, 3.5e12, 3.9e11, 5.7e10, 37.0, 9e10),
        ("BIOT", 2024, 2e10, 1e6, 5e9, None, -1e8),        # 20000x sales, 4x book
        ("NEGE", 2024, 3e11, 1.5e11, 1e6, 23.0, 1.5e10),   # tiny equity, real sales
        ("TINY", 2024, 5e9, 1.0, 1.0, 9.0, 1.0),           # under the floor
    ])
    assert U.quarantine_impossible_caps(conn) == 2
    got = dict(conn.execute('SELECT Ticker, "Market Cap" FROM financials'))
    assert got["JUNK"] is None and got["OVER"] is None
    assert got["AAPL"] == 3.5e12 and got["BIOT"] == 2e10
    assert got["NEGE"] == 3e11 and got["TINY"] == 5e9
    # the statement side of a quarantined row is untouched; its price ratios go
    assert conn.execute('SELECT Revenue, "Net Income", "PE Ratio" FROM financials '
                        "WHERE Ticker='JUNK'").fetchone() == (3e8, 5.0, None)
    assert conn.execute("SELECT ticker, market_cap FROM usd_ingest_cap_quarantine "
                        "ORDER BY ticker").fetchall() == [("JUNK", 8.4e13), ("OVER", 2e13)]
    with pytest.raises(ValueError):
        U.quarantine_impossible_caps(conn, "tickers")


def test_convert_record_for_live_rows_uses_spot_only_for_a_new_month():
    rec = {"Ticker": "7203.T", "Date": "2026-12-31", "Reported Currency": "JPY",
           "Revenue": 1000.0, "ROE": 0.1, "Exchange": "JPX"}
    assert U.convert_record(rec, RATES) is None                 # no rate: no write
    usd = U.convert_record(rec, RATES, spot={"JPY": 0.007})
    assert usd["Revenue"] == pytest.approx(7.0) and usd["ROE"] == 0.1
    assert usd["Reported Currency"] == "USD" and usd["Source Currency"] == "JPY"
    assert usd["Exchange"] == "JPX" and rec["Revenue"] == 1000.0  # input not mutated
    # an OLD period with no monthly rate must not fall back to today's rate
    old = dict(rec, Date="2010-12-31")
    assert U.convert_record(old, RATES, spot={"JPY": 0.007}) is None
    assert U.convert_record({"Date": "2020-01-01", "Revenue": 1.0}, RATES) is None


def _dup_db():
    conn = _db()
    conn.execute('CREATE TABLE financials_quarterly AS SELECT * FROM financials WHERE 0')
    conn.execute("CREATE TABLE tickers (ticker TEXT PRIMARY KEY, name TEXT, "
                 "country TEXT, status TEXT)")
    conn.executemany("INSERT INTO tickers VALUES (?,?,?,?)", [
        ("XOM", "Exxon Mobil Corporation", "United States", None),
        ("XONA.DE", "Exxon Mobil Corporation", "United States", None),
        ("SAP.DE", "SAP SE", "Germany", None),
        ("BMW.DE", "Bayerische Motoren Werke", "Germany", None),
        ("REL.L", "RELX Plc", "United Kingdom", None),
        ("VOD.L", "Vodafone Group", "United Kingdom", None),
        ("IDP.L", "InnovaDerma PLC", "United Kingdom", None),
        ("AAPL", "Apple Inc.", "United States", None),
        ("ONE", "One Year Only", "United States", None),
        ("COHR", "Coherent, Inc.", "United States", None),
        ("IIVI", "II-VI Incorporated", "United States", "delisted"),
    ])
    ins = ('INSERT INTO financials (Ticker, "Calendar Year", Date, Revenue, "Net Income", '
           '"Total Assets") VALUES (?,?,?,?,?,?)')
    for y in (2021, 2022, 2023):
        d = f"{y}-12-31"
        conn.execute(ins, ("XOM", y, d, 3e11 + y, 3e10, 4e11))
        conn.execute(ins, ("XONA.DE", y, d, 3e11 + y, 3e10, 4e11))     # second listing
        conn.execute(ins, ("REL.L", y, d, 9e9 + y, 2e9, 1.5e10))
        conn.execute(ins, ("IDP.L", y, d, 9e9 + y, 2e9, 1.5e10))       # RELX's figures
        conn.execute(ins, ("SAP.DE", y, d, 3e10 + y, 5e9, 7e10))
        conn.execute(ins, ("AAPL", y, d, 3.9e11 + y, 9e10, 3.5e11))
        conn.execute(ins, ("COHR", y, d, 4e9 + y, 1e8, 1.4e10))
        conn.execute(ins, ("IIVI", y, d, 4e9 + y, 1e8, 1.4e10))        # the old name
    conn.execute(ins, ("ONE", 2023, "2023-12-31", 3.9e11 + 2023, 9e10, 3.5e11))  # 1 year only
    # the listings' own caps: RELX is a 60 billion company, InnovaDerma is tiny
    conn.execute("UPDATE financials SET \"Market Cap\" = 6e10 WHERE Ticker = 'REL.L'")
    conn.execute("UPDATE financials SET \"Market Cap\" = 2e7 WHERE Ticker = 'IDP.L'")
    # a renamed company: the vendor serves the same listing under both symbols
    conn.execute("UPDATE financials SET \"Market Cap\" = 1.5e10 "
                 "WHERE Ticker IN ('COHR', 'IIVI')")
    return conn


def test_find_duplicate_listings_keeps_the_home_listing():
    found = {d["ticker"]: d for d in U.find_duplicate_listings(_dup_db())}
    assert set(found) == {"XONA.DE", "IDP.L", "IIVI"}   # ONE matches a single year: not enough
    assert found["XONA.DE"]["kept"] == "XOM" and found["XONA.DE"]["same_company"] is True
    assert found["IDP.L"]["kept"] == "REL.L" and found["IDP.L"]["same_company"] is False
    # different names, same statements AND same cap: one company, renamed.
    # The actively trading symbol is the one that stays.
    assert found["IIVI"]["kept"] == "COHR" and found["IIVI"]["same_company"] is True


def test_remove_duplicate_listings_aliases_only_a_true_second_listing():
    conn = _dup_db()
    assert U.remove_duplicate_listings(conn) == {
        "duplicates": 3, "second_listings": 2, "wrong_company_data": 1}
    left = {t for (t,) in conn.execute("SELECT DISTINCT Ticker FROM financials")}
    assert left == {"XOM", "REL.L", "SAP.DE", "AAPL", "ONE", "COHR"}
    assert conn.execute("SELECT alias, primary_symbol FROM symbol_alias ORDER BY 1"
                        ).fetchall() == [("IIVI", "COHR"), ("XONA.DE", "XOM")]
    names = {t for (t,) in conn.execute("SELECT ticker FROM tickers")}
    assert "XONA.DE" not in names and "IDP.L" in names   # the wrong-data company still exists
    assert conn.execute("SELECT ticker, kept, same_company, rows_removed "
                        "FROM duplicate_listing_audit ORDER BY 1").fetchall() \
        == [("IDP.L", "REL.L", 0, 3), ("IIVI", "COHR", 1, 3), ("XONA.DE", "XOM", 1, 3)]
    assert U.remove_duplicate_listings(conn)["duplicates"] == 0     # idempotent


def test_a_wrong_data_ticker_keeps_its_own_rows():
    """IDP.L carries RELX's statements for 2021-2023 but has its OWN rows for
    2019 and 2020. Only the copies go."""
    conn = _dup_db()
    ins = ('INSERT INTO financials (Ticker, "Calendar Year", Date, Revenue, "Net Income", '
           '"Total Assets") VALUES (?,?,?,?,?,?)')
    conn.execute(ins, ("IDP.L", 2019, "2019-12-31", 8.1e6, -1e6, 9e6))
    conn.execute(ins, ("IDP.L", 2020, "2020-12-31", 9.4e6, -2e6, 8e6))
    U.remove_duplicate_listings(conn)
    assert conn.execute('SELECT "Calendar Year", Revenue FROM financials '
                        "WHERE Ticker = 'IDP.L' ORDER BY 1").fetchall() \
        == [(2019, 8.1e6), (2020, 9.4e6)]
    assert conn.execute("SELECT rows_removed FROM duplicate_listing_audit "
                        "WHERE ticker = 'IDP.L'").fetchone()[0] == 3


def test_a_chain_does_not_remove_a_ticker_that_never_matched_the_kept_one():
    """A~B (2021-2023) and B~C (2018-2020) but A and C share nothing: C is not
    a copy of the kept ticker and must stay."""
    conn = _db()
    conn.execute('CREATE TABLE financials_quarterly AS SELECT * FROM financials WHERE 0')
    conn.execute("CREATE TABLE tickers (ticker TEXT PRIMARY KEY, name TEXT, "
                 "country TEXT, status TEXT)")
    conn.executemany("INSERT INTO tickers VALUES (?,?,?,?)", [
        ("AAA", "Alpha Corp", "United States", None),
        ("BBB.DE", "Alpha Corp", "United States", None),
        ("CCC.DE", "Gamma AG", "Germany", None),
        # make Germany the home country of the .DE suffix, so AAA is the home listing
        ("X1.DE", "X1 AG", "Germany", None), ("X2.DE", "X2 AG", "Germany", None)])
    ins = ('INSERT INTO financials (Ticker, "Calendar Year", Date, Revenue, "Net Income", '
           '"Total Assets") VALUES (?,?,?,?,?,?)')
    for y in (2018, 2019, 2020):
        conn.execute(ins, ("BBB.DE", y, f"{y}-12-31", 5e9 + y, 1e8, 9e9))
        conn.execute(ins, ("CCC.DE", y, f"{y}-12-31", 5e9 + y, 1e8, 9e9))
    for y in (2021, 2022, 2023):
        conn.execute(ins, ("AAA", y, f"{y}-12-31", 7e9 + y, 2e8, 1e10))
        conn.execute(ins, ("BBB.DE", y, f"{y}-12-31", 7e9 + y, 2e8, 1e10))
    found = {d["ticker"]: d["kept"] for d in U.find_duplicate_listings(conn)}
    # BBB.DE is a copy of the kept AAA. CCC.DE shares no year with AAA, so it
    # is not in the list even though it is in the same connected group.
    assert found == {"BBB.DE": "AAA"}
    U.remove_duplicate_listings(conn)
    left = {t for (t,) in conn.execute("SELECT DISTINCT Ticker FROM financials")}
    assert left == {"AAA", "CCC.DE"}
    assert conn.execute("SELECT COUNT(*) FROM financials WHERE Ticker = 'CCC.DE'"
                        ).fetchone()[0] == 3


def test_a_redated_repeat_does_not_shift_the_history():
    """The same fiscal year again with a slightly different date (27 vs 31
    December) is a repeat, not a change of year end: nothing moves."""
    conn = _db()
    seen: set = set()
    for src, date in (("2014", "2014-12-31"), ("2015", "2015-12-27")):
        U.load_tab(conn, [_row(Reported_Currency="USD", Date=date, Revenue="1")],
                   source=src, table="financials", annual=True, seen=seen)
    st = U.load_tab(conn, [_row(Reported_Currency="USD", Date="2015-12-31", Revenue="2")],
                    source="2016", table="financials", annual=True, seen=seen)
    assert st == {"loaded": 0, "blank": 0, "rejected": 1}
    assert conn.execute('SELECT "Calendar Year", Date FROM financials ORDER BY 1').fetchall() \
        == [(2014, "2014-12-31"), (2015, "2015-12-27")]


def test_live_path_uses_the_same_fiscal_year_key():
    import datetime as dt
    from data.financial_db import _fiscal_year_of
    for day in ("2009-01-02", "2010-01-01", "2010-01-10", "2010-01-11", "2010-12-31",
                "2016-01-31", "2024-06-30", "2027-01-02"):
        assert _fiscal_year_of(dt.date.fromisoformat(day)) == U._fiscal_year(day), day


def test_monthly_from_daily_close_and_average():
    got = monthly_from_daily([("2020-01-02", 1.0), ("2020-01-31", 3.0),
                              ("2020-01-15", 2.0), ("2020-02-03", 5.0),
                              ("2020-02-04", 0.0)])
    assert got == {"2020-01": (3.0, 2.0), "2020-02": (5.0, 5.0)}
