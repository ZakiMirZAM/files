"""The market-cap currency repair: detection, the dry run, and reversibility.

Every test runs against a temporary fixture database. Nothing here touches the
live warehouse and nothing here touches the network.

Run:  cd backend && python -m pytest test_repair_market_cap_currency.py -q
"""

from __future__ import annotations

import os
import sqlite3
import sys

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.join(_HERE, "..", "data"), os.path.join(_HERE, "..", "remediation")):
    _p = os.path.abspath(_p)
    if _p not in sys.path:
        sys.path.insert(0, _p)

import repair_market_cap_currency as R  # noqa: E402

RATES = {"USD": 1.0, "TWD": 0.031246, "GBP": 1.355179, "CNY": 0.148540,
         "EUR": 1.158346, "JPY": 0.0062842}

_COLS = ('Ticker', '"Calendar Year"', '"Reported Currency"', '"Market Cap"',
         '"PE Ratio"', '"Net Income"', '"PB Ratio"',
         '"Total Stockholders Equity"', '"Price To Sales Ratio"', 'Revenue',
         '"POCF Ratio"', '"Operating Cash Flow"')


def _db(tmp_path, rows, rates=RATES):
    path = str(tmp_path / "f.db")
    conn = sqlite3.connect(path)
    conn.execute(
        f"CREATE TABLE financials ({', '.join(_COLS[:1])} TEXT, "
        + ", ".join(f"{c} REAL" for c in _COLS[1:])
        + ', PRIMARY KEY (Ticker, "Calendar Year"))')
    conn.execute("CREATE TABLE fx_rates (currency TEXT PRIMARY KEY, "
                 "usd_per_unit REAL NOT NULL, asof TEXT)")
    conn.executemany(
        f"INSERT INTO financials ({', '.join(_COLS)}) "
        f"VALUES ({', '.join('?' * len(_COLS))})", rows)
    conn.executemany("INSERT INTO fx_rates VALUES (?, ?, '2026-01-01')",
                     list(rates.items()))
    conn.commit()
    conn.close()
    return path


def _row(ticker, year, ccy, cap, fy_cap, ni=1.0e11):
    """One company-year. ``fy_cap`` is the fiscal-year-end cap in the REPORTING
    currency, which is what the stored ratio columns encode."""
    return (ticker, year, ccy, cap, fy_cap / ni, ni, None, None, None, None,
            None, None)


def test_a_usd_quote_in_a_twd_row_is_certain(tmp_path):
    """The TSM shape: 2024 is a clean TWD year, 2025 holds the USD ADR cap."""
    db = _db(tmp_path, [
        _row("TSM", 2024, "TWD", 2.78721e13, 2.78721e13),
        _row("TSM", 2025, "TWD", 2.211e12, 2.211e12 / 0.031246 * 0.9),
    ])
    conn = sqlite3.connect(db)
    found = R.scan(conn)
    conn.close()

    assert len(found) == 1
    f = found[0]
    assert (f["ticker"], f["year"]) == ("TSM", 2025)
    assert f["quote_currency"] == "USD"
    assert f["classification"] == "CERTAIN"
    assert f["corrected_cap"] == pytest.approx(2.211e12 / 0.031246)
    assert f["prior_year_check"] == "supports"


def test_a_london_pence_cap_is_certain(tmp_path):
    db = _db(tmp_path, [
        _row("RR.L", 2024, "GBP", 5.0e10, 5.0e10),
        _row("RR.L", 2025, "GBP", 1.0e13, 1.0e11),
    ])
    conn = sqlite3.connect(db)
    found = R.scan(conn)
    conn.close()
    assert [(f["quote_currency"], f["classification"]) for f in found] == [
        ("GBp", "CERTAIN")]
    assert found[0]["corrected_cap"] == pytest.approx(1.0e11)


def test_a_clean_row_is_not_flagged(tmp_path):
    """A cap that already reads as its own currency, even after a 40% move."""
    db = _db(tmp_path, [
        _row("AAPL", 2024, "USD", 3.4e12, 3.4e12),
        _row("AAPL", 2025, "USD", 4.4e12, 3.1e12),
    ])
    conn = sqlite3.connect(db)
    assert R.scan(conn) == []
    conn.close()


def test_near_parity_currencies_are_unsure_not_certain(tmp_path):
    """A EUR filer holding a USD cap: the exchange rate is the same size as an
    ordinary price move, so the detector must decline to decide."""
    db = _db(tmp_path, [
        _row("ASML", 2024, "EUR", 3.0e11, 3.0e11),
        # the stored figure is the USD cap, so the EUR fiscal-year-end cap the
        # ratio columns encode is that figure divided by the EUR rate
        _row("ASML", 2025, "EUR", 7.0e11, 7.0e11 / 1.158346),
    ])
    conn = sqlite3.connect(db)
    found = R.scan(conn)
    conn.close()
    assert len(found) == 1
    assert found[0]["quote_currency"] == "USD"
    assert found[0]["classification"] == "UNSURE"


def test_a_row_with_no_ratio_anchor_is_skipped(tmp_path):
    db = _db(tmp_path, [
        ("NOANCHOR", 2025, "TWD", 2.2e12, None, None, None, None, None, None,
         None, None)])
    conn = sqlite3.connect(db)
    assert R.scan(conn) == []
    conn.close()


def test_junk_reporting_currency_is_skipped(tmp_path):
    db = _db(tmp_path, [_row("JUNK", 2025, "Unavailable", 2.2e12, 7.0e13)])
    conn = sqlite3.connect(db)
    assert R.scan(conn) == []
    conn.close()


def test_the_prior_year_check_downgrades_an_implausible_correction(tmp_path):
    """Correcting a 1.5x year into a 47x year is the detector fitting noise."""
    db = _db(tmp_path, [
        _row("WEIRD", 2024, "TWD", 1.0e9, 1.0e9),
        _row("WEIRD", 2025, "TWD", 1.5e9, 1.5e9 / 0.031246),
    ])
    conn = sqlite3.connect(db)
    found = R.scan(conn)
    conn.close()
    assert len(found) == 1
    assert found[0]["prior_year_check"] == "contradicts"
    assert found[0]["classification"] == "UNSURE"


def test_dry_run_writes_nothing_and_apply_is_reversible(tmp_path):
    rows = [
        _row("TSM", 2024, "TWD", 2.78721e13, 2.78721e13),
        _row("TSM", 2025, "TWD", 2.211e12, 2.211e12 / 0.031246 * 0.9),
        _row("ASML", 2024, "EUR", 3.0e11, 3.0e11),
        _row("ASML", 2025, "EUR", 7.0e11, 7.0e11 / 1.158346),
    ]
    db = _db(tmp_path, rows)
    csv_path = str(tmp_path / "out.csv")

    assert R.main([db, "--out", csv_path]) == 0
    conn = sqlite3.connect(db)
    assert conn.execute('SELECT "Market Cap" FROM financials WHERE Ticker = "TSM"'
                        ' AND "Calendar Year" = 2025').fetchone()[0] == 2.211e12
    assert conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE name = "
        "'market_cap_repair_audit'").fetchone()[0] == 0
    conn.close()
    assert os.path.exists(csv_path)

    assert R.main([db, "--out", csv_path, "--apply"]) == 0
    conn = sqlite3.connect(db)
    try:
        new = conn.execute('SELECT "Market Cap" FROM financials WHERE Ticker = "TSM"'
                           ' AND "Calendar Year" = 2025').fetchone()[0]
        assert new == pytest.approx(2.211e12 / 0.031246)
        # the UNSURE row was left alone
        assert conn.execute('SELECT "Market Cap" FROM financials '
                            'WHERE Ticker = "ASML" AND "Calendar Year" = 2025'
                            ).fetchone()[0] == 7.0e11
        audit = conn.execute(
            "SELECT ticker, year, old_cap, new_cap, quote_currency, "
            "reporting_currency FROM market_cap_repair_audit").fetchall()
        assert audit == [("TSM", 2025, 2.211e12, new, "USD", "TWD")]
        assert conn.execute("SELECT last_run FROM job_runs WHERE job = ?",
                            (R.JOB_NAME,)).fetchone() is not None

        # reversible, row by row, from the audit table alone
        for ticker, year, old, _n, _q, _r in audit:
            conn.execute('UPDATE financials SET "Market Cap" = ? WHERE Ticker = ?'
                         ' AND "Calendar Year" = ?', (old, ticker, year))
        conn.commit()
        assert conn.execute('SELECT "Market Cap" FROM financials WHERE Ticker = "TSM"'
                            ' AND "Calendar Year" = 2025').fetchone()[0] == 2.211e12
    finally:
        conn.close()


def test_apply_twice_is_idempotent_because_the_repaired_row_stops_matching(tmp_path):
    db = _db(tmp_path, [
        _row("TSM", 2024, "TWD", 2.78721e13, 2.78721e13),
        _row("TSM", 2025, "TWD", 2.211e12, 2.211e12 / 0.031246 * 0.9),
    ])
    csv_path = str(tmp_path / "out.csv")
    R.main([db, "--out", csv_path, "--apply"])
    R.main([db, "--out", csv_path, "--apply"])
    conn = sqlite3.connect(db)
    try:
        assert conn.execute(
            "SELECT COUNT(*) FROM market_cap_repair_audit").fetchone()[0] == 1
        assert conn.execute(
            'SELECT "Market Cap" FROM financials WHERE Ticker = "TSM" '
            'AND "Calendar Year" = 2025').fetchone()[0] == pytest.approx(
                2.211e12 / 0.031246)
    finally:
        conn.close()


def test_candidate_currencies_follow_the_exchange_suffix():
    assert R.candidate_currencies("TSM", "TWD") == ["TWD", "USD"]
    assert R.candidate_currencies("RR.L", "GBP")[:2] == ["GBP", "USD"]
    assert "GBp" in R.candidate_currencies("RR.L", "GBP")
    assert "HKD" in R.candidate_currencies("0005.HK", "USD")
    assert "ILA" in R.candidate_currencies("ABRA.TA", "ILS")


def _finding(ticker, quote, reporting="TWD", stored=1.0e9, cls="UNSURE"):
    return {"ticker": ticker, "quote_currency": quote, "classification": cls,
            "reported_currency": reporting, "stored_cap": stored,
            "prior_cap": None, "ln_gap": 0.0, "evidence": ""}


def test_verify_yf_confirms_dismisses_and_rebuilds(monkeypatch):
    """yfinance is authoritative about the quote currency, so it can confirm a
    guess, dismiss a finding outright, or move it onto a third currency."""
    class _FastInfo:
        def __init__(self, ccy):
            self.currency = ccy

    class _Tk:
        def __init__(self, sym):
            self.fast_info = _FastInfo(
                {"CONFIRM": "USD", "DISMISS": "TWD", "REBUILD": "GBP"}[sym])

    fake = type(sys)("yfinance")
    fake.Ticker = _Tk
    monkeypatch.setitem(sys.modules, "yfinance", fake)

    findings = [_finding("CONFIRM", "USD"),
                _finding("DISMISS", "USD", cls="CERTAIN"),
                _finding("REBUILD", "USD")]
    R.verify_with_yfinance(findings, RATES, throttle=0.0, verbose=False)

    assert findings[0]["classification"] == "CERTAIN"
    assert findings[1]["classification"] == "NOT-A-BUG"
    assert findings[2]["classification"] == "CERTAIN"
    assert findings[2]["quote_currency"] == "GBP"
    assert findings[2]["corrected_cap"] == pytest.approx(1.0e9 * 1.355179 / 0.031246)


def test_apply_ignores_rows_yfinance_dismissed(tmp_path):
    db = _db(tmp_path, [
        _row("TSM", 2024, "TWD", 2.78721e13, 2.78721e13),
        _row("TSM", 2025, "TWD", 2.211e12, 2.211e12 / 0.031246 * 0.9),
    ])
    conn = sqlite3.connect(db)
    try:
        found = R.scan(conn)
        found[0]["classification"] = "NOT-A-BUG"
        assert R.apply_repairs(conn, found) == 0
        assert conn.execute(
            'SELECT "Market Cap" FROM financials WHERE Ticker = "TSM" '
            'AND "Calendar Year" = 2025').fetchone()[0] == 2.211e12
    finally:
        conn.close()
