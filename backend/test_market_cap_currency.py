"""Market caps are stored in the filer's REPORTING currency, never the quote's.

yfinance prices a LISTING, so ``fast_info.market_cap`` comes back in that
listing's currency: TSM's US ADR quotes in USD while TSM reports in TWD. Every
writer used to drop that number straight into ``financials."Market Cap"``, and
every consumer then multiplied it by the row's ``fx_rates`` rate a second time.
TSM's 2025 row held 2.21e12 (the USD ADR cap) beside 2024's 2.79e13 (TWD), which
rendered as a $69B company on a 1.3x P/E with a 7263% margin of safety.

These tests pin the conversion helper, the two write paths, and the request-time
overlay. They are network-free: the fetchers are injected, and the databases are
temporary files built by ``FinancialDB`` itself.

Run:  cd backend && python -m pytest test_market_cap_currency.py -q
"""

from __future__ import annotations

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import fx_convert  # noqa: E402

# Rates as usd_per_unit, the fx_rates convention.
RATES = {"USD": 1.0, "TWD": 0.031246, "CNY": 0.148540, "EUR": 1.158346,
         "GBP": 1.355179, "JPY": 0.0062842}


# ── the conversion helper ────────────────────────────────────────────────────

def test_usd_quote_into_a_twd_row():
    """The TSM case: a USD ADR cap landing in a TWD-reporting row."""
    out = fx_convert.convert_amount(2.211e12, "USD", "TWD", RATES)
    assert out == pytest.approx(2.211e12 * 1.0 / 0.031246)
    # and it is now the same order of magnitude as the prior TWD year
    assert 1e13 < out < 1e14


def test_eur_quote_into_a_cny_row():
    """A Vienna cross-listing of a CNY filer (ICK.VI and friends)."""
    out = fx_convert.convert_amount(1.0e9, "EUR", "CNY", RATES)
    assert out == pytest.approx(1.0e9 * 1.158346 / 0.148540)


def test_london_pence_quote_into_a_gbp_row():
    """LSE quotes in pence. Taken as pounds the cap is 100x too large, which is
    what put a 1e15 USD weight into the sector aggregates."""
    assert fx_convert.convert_amount(5.0e11, "GBp", "GBP", RATES) == pytest.approx(5.0e9)
    assert fx_convert.convert_amount(5.0e11, "GBX", "GBP", RATES) == pytest.approx(5.0e9)


def test_other_minor_units():
    """Tel Aviv quotes agorot and Johannesburg cents; both are 1/100."""
    rates = {"ILS": 0.338226, "ZAR": 0.061826, "USD": 1.0}
    assert fx_convert.convert_amount(100.0, "ILA", "ILS", rates) == pytest.approx(1.0)
    assert fx_convert.convert_amount(100.0, "ZAc", "ZAR", rates) == pytest.approx(1.0)
    # pence into USD goes through GBP, not through a bogus "GBp" rate
    assert fx_convert.convert_amount(
        100.0, "GBp", "USD", RATES) == pytest.approx(1.355179)


def test_same_currency_is_a_no_op_and_needs_no_rate():
    assert fx_convert.convert_amount(123.0, "USD", "USD", RATES) == 123.0
    # a currency absent from the table still converts to itself
    assert fx_convert.convert_amount(123.0, "XOF", "XOF", RATES) == 123.0
    # case and whitespace do not make it a different currency
    assert fx_convert.convert_amount(123.0, " usd ", "USD", RATES) == 123.0


def test_missing_rate_returns_none_rather_than_a_guessed_one_to_one():
    assert fx_convert.convert_amount(1.0e9, "USD", "KRW", RATES) is None
    assert fx_convert.convert_amount(1.0e9, "KRW", "USD", RATES) is None


def test_junk_or_missing_currency_returns_none():
    for bad in (None, "", "   ", "Unavailable", "2025 data not available yet.", 0):
        assert fx_convert.convert_amount(1.0e9, "USD", bad, RATES) is None
        assert fx_convert.convert_amount(1.0e9, bad, "USD", RATES) is None
    assert fx_convert.convert_amount(None, "USD", "TWD", RATES) is None


def test_gbp_and_gbp_pence_are_not_the_same_code():
    """``GBp`` and ``GBP`` differ only by case and mean different things, so the
    pence lookup has to be case sensitive."""
    assert fx_convert.normalize_currency("GBP") == ("GBP", 1.0)
    assert fx_convert.normalize_currency("GBp") == ("GBP", 100.0)


# ── the write paths ──────────────────────────────────────────────────────────

def _db(tmp_path, rows, rates=RATES):
    """A real (temporary) warehouse with the production schema."""
    import financial_db

    db = financial_db.FinancialDB(str(tmp_path / "f.db"))
    conn = sqlite3.connect(db.db_path)
    conn.executemany(
        'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", '
        '"Market Cap") VALUES (?, ?, ?, ?)', rows)
    conn.executemany(
        "INSERT OR REPLACE INTO fx_rates(currency, usd_per_unit, asof) "
        "VALUES (?, ?, '2026-01-01')", list(rates.items()))
    conn.commit()
    conn.close()
    return db


def _cap(db_path, ticker, year):
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute(
            'SELECT "Market Cap" FROM financials WHERE Ticker = ? '
            'AND CAST("Calendar Year" AS INTEGER) = ?', (ticker, year)).fetchone()[0]
    finally:
        conn.close()


def test_refresh_market_caps_converts_a_usd_quote_into_the_twd_row(tmp_path, monkeypatch):
    import financial_db

    db = _db(tmp_path, [("TSM", 2024, "TWD", 2.78721e13),
                        ("TSM", 2025, "TWD", 1.0)])
    monkeypatch.setattr(financial_db, "fetch_latest_market_cap_currency_yf",
                        lambda t: (2.211e12, "USD"))

    res = db.refresh_market_caps(["TSM"], verbose=False)

    assert res["updated"] == 1 and res["unconvertible"] == 0
    stored = _cap(db.db_path, "TSM", 2025)
    assert stored == pytest.approx(2.211e12 / 0.031246)
    # the repaired latest year is now the same order of magnitude as 2024
    assert 0.2 < stored / 2.78721e13 < 5.0
    # only the latest year is touched
    assert _cap(db.db_path, "TSM", 2024) == pytest.approx(2.78721e13)


def test_refresh_market_caps_leaves_the_row_alone_when_the_pair_is_unresolvable(
        tmp_path, monkeypatch):
    """No rate, unknown quote currency, or junk Reported Currency: keep the
    stored value and say so, rather than writing a wrong-currency number."""
    import financial_db

    db = _db(tmp_path, [("KOSPI", 2025, "KRW", 42.0),      # KRW has no rate
                        ("NOCCY", 2025, "Unavailable", 43.0),
                        ("UNKNOWNQ", 2025, "TWD", 44.0)])

    def fetch(ticker):
        return (9.9e9, None) if ticker == "UNKNOWNQ" else (9.9e9, "USD")

    monkeypatch.setattr(financial_db, "fetch_latest_market_cap_currency_yf", fetch)
    res = db.refresh_market_caps(["KOSPI", "NOCCY", "UNKNOWNQ"], verbose=False)

    assert res["updated"] == 0
    assert res["unconvertible"] == 3
    assert _cap(db.db_path, "KOSPI", 2025) == 42.0
    assert _cap(db.db_path, "NOCCY", 2025) == 43.0
    assert _cap(db.db_path, "UNKNOWNQ", 2025) == 44.0


def test_resumable_sweep_converts_and_reports_unconvertible(tmp_path):
    import market_cap_refresh as mcr

    db = _db(tmp_path, [("TSM", 2025, "TWD", 1.0), ("KOSPI", 2025, "KRW", 42.0)])
    caps = {"TSM": (2.211e12, "USD"), "KOSPI": (1.0e12, "USD")}
    res = mcr.refresh_market_caps_resumable(
        db.db_path, fetch=caps.get, verbose=False)

    assert res["updated"] == 1
    assert res["unconvertible"] == 1
    assert _cap(db.db_path, "TSM", 2025) == pytest.approx(2.211e12 / 0.031246)
    assert _cap(db.db_path, "KOSPI", 2025) == 42.0


def test_resumable_sweep_still_accepts_a_plain_float_fetcher(tmp_path):
    """Existing callers and tests inject a float-returning fetch. An unknown
    quote currency means "already in the row's currency", i.e. the old
    behaviour, so those keep working unchanged."""
    import market_cap_refresh as mcr

    db = _db(tmp_path, [("TSM", 2025, "TWD", 1.0)])
    res = mcr.refresh_market_caps_resumable(
        db.db_path, fetch=lambda t: 777.0, verbose=False)

    assert res["updated"] == 1 and res["unconvertible"] == 0
    assert _cap(db.db_path, "TSM", 2025) == 777.0


# ── the request-time overlay ─────────────────────────────────────────────────

class _Row(dict):
    def keys(self):  # sqlite3.Row-like
        return list(super().keys())


def test_live_cap_overlay_converts_into_the_rows_currency(monkeypatch):
    import api

    monkeypatch.setattr(api, "fetch_latest_market_cap_currency_yf",
                        lambda t: (2.211e12, "USD"))
    monkeypatch.setattr(api, "_fx_rates", lambda: RATES)

    row = _Row({"Reported Currency": "TWD", "yr": 2025})
    assert api._live_cap_in_row_currency("TSM", row) == pytest.approx(
        2.211e12 / 0.031246)


def test_live_cap_overlay_is_a_no_op_when_the_currencies_match(monkeypatch):
    import api

    monkeypatch.setattr(api, "fetch_latest_market_cap_currency_yf",
                        lambda t: (3.5e12, "USD"))
    monkeypatch.setattr(api, "_fx_rates", lambda: RATES)

    row = _Row({"Reported Currency": "USD", "yr": 2025})
    assert api._live_cap_in_row_currency("AAPL", row) == 3.5e12


def test_live_cap_overlay_declines_when_it_cannot_convert(monkeypatch):
    """None means "keep the stored filing-date cap", which is the safe fallback
    the caller already implements."""
    import api

    monkeypatch.setattr(api, "_fx_rates", lambda: RATES)

    monkeypatch.setattr(api, "fetch_latest_market_cap_currency_yf",
                        lambda t: (1.0e9, "USD"))
    assert api._live_cap_in_row_currency("X", _Row({"Reported Currency": "KRW"})) is None
    assert api._live_cap_in_row_currency(
        "X", _Row({"Reported Currency": "Unavailable"})) is None

    monkeypatch.setattr(api, "fetch_latest_market_cap_currency_yf",
                        lambda t: (1.0e9, None))
    assert api._live_cap_in_row_currency("X", _Row({"Reported Currency": "TWD"})) is None

    monkeypatch.setattr(api, "fetch_latest_market_cap_currency_yf",
                        lambda t: (None, None))
    assert api._live_cap_in_row_currency("X", _Row({"Reported Currency": "USD"})) is None
