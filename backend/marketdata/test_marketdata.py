"""
Network-free unit tests for the ported marketdata package.

Run from backend/:  python -m pytest marketdata/test_marketdata.py -q
"""

from __future__ import annotations

import sqlite3

import pandas as pd
import pytest

from . import schema
from . import damodaran_market as dmd
from . import sector_etf
from . import market_inputs as mi


# ── sector ETF mapping ────────────────────────────────────────────────────────


def test_sector_mapping_covers_eleven_sectors_including_xlb():
    assert len(sector_etf.SECTOR_NAME_TO_TICKER) == 11
    assert sector_etf.ticker_for_sector("Basic Materials") == "XLB"
    assert sector_etf.ticker_for_sector("Technology") == "XLK"
    # case-insensitive resolution
    assert sector_etf.ticker_for_sector("technology") == "XLK"
    # XLB present in the ETF catalog
    assert "XLB" in sector_etf.SECTOR_ETFS
    assert sector_etf.ticker_for_sector("Nonexistent Sector") is None


# ── Damodaran histimpl parsing (synthetic workbook, no network) ───────────────

_FAKE_HISTIMPL = pd.DataFrame([
    ["Year", "Earnings*", "Dividends*", "S&P 500", "Implied Premium", "Analyst Growth Estimate"],
    [2023, 213.53, 70.30, 4769.83, 0.047, 0.0874],
    [2024, 243.00, 75.00, 5881.00, 0.043, 0.0957],
    [2025, 271.52, 80.00, 6845.50, 0.040, 0.10],
    ["", "", "", "", "", ""],         # trailing blank / footnote row
])


@pytest.fixture()
def patched_histimpl(monkeypatch):
    monkeypatch.setattr(dmd, "_load_df", lambda **kw: _FAKE_HISTIMPL.copy())


def test_current_sp500_earnings(patched_histimpl):
    assert dmd.current_sp500_earnings() == 271.52


def test_sp500_earnings_history(patched_histimpl):
    hist = dmd.sp500_earnings_history()
    assert [r["year"] for r in hist] == [2023, 2024, 2025]
    assert hist[-1]["earnings"] == 271.52
    assert hist[-1]["index"] == 6845.50
    assert hist[-1]["growth"] == 0.10


def test_current_analyst_growth(patched_histimpl):
    assert dmd.current_analyst_growth() == 0.10


def test_current_sp500_forward_earnings(patched_histimpl):
    # 271.52 × (1 + 0.10) = 298.672 → 298.67
    assert dmd.current_sp500_forward_earnings() == 298.67
    # two-year compounding
    assert dmd.current_sp500_forward_earnings(years=2) == round(271.52 * 1.10 ** 2, 2)


def test_current_implied_erp(patched_histimpl):
    # Last in-band implied-premium value.
    assert dmd.current_implied_erp() == 0.04


def test_damodaran_no_data_returns_none(monkeypatch):
    monkeypatch.setattr(dmd, "_load_df", lambda **kw: None)
    assert dmd.current_sp500_earnings() is None
    assert dmd.sp500_earnings_history() == []
    assert dmd.current_implied_erp() is None
    assert dmd.current_analyst_growth() is None
    assert dmd.current_sp500_forward_earnings() is None


# ── implied-ERP solver ────────────────────────────────────────────────────────


def test_compute_implied_erp_in_band():
    erp, r = mi.compute_implied_erp(
        price=5000.0, earnings=230.0, risk_free=0.045, growth=0.06, dividend=70.0
    )
    assert erp is not None and r is not None
    assert mi.ERP_FLOOR <= erp <= mi.ERP_CEILING
    assert r == pytest.approx(erp + 0.045, abs=1e-3)


def test_compute_implied_erp_rejects_bad_inputs():
    assert mi.compute_implied_erp(
        price=5000.0, earnings=-1.0, risk_free=0.045, growth=0.06
    ) == (None, None)
    assert mi.compute_implied_erp(
        price=0.0, earnings=230.0, risk_free=0.045, growth=0.06
    ) == (None, None)


def test_sp500_projection_shape():
    proj = mi.sp500_projection(
        price=5000.0, earnings=230.0, risk_free=0.045, growth=0.06,
        dividend=70.0, baseline_erp=0.045,
    )
    assert proj is not None
    assert proj["earnings"] == 230.0
    assert len(proj["projection"]) == mi.EXPLICIT_YEARS
    # fair value & over/under are populated for sane inputs
    assert proj["fairValueAtBaseline"] is not None
    assert proj["overUnderValuationPct"] is not None


# ── schema ────────────────────────────────────────────────────────────────────


def test_schema_is_idempotent_and_scoped():
    conn = sqlite3.connect(":memory:")
    try:
        schema.ensure_external_schema(conn)
        schema.ensure_external_schema(conn)  # idempotent
        present = schema.existing_external_tables(conn)
        assert present == {"macro_series", "shiller_sp500", "market_inputs"}
        # sector/industry Damodaran tables are intentionally NOT ported.
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        names = {r[0] for r in rows}
        assert "damodaran_industry" not in names
        assert "sector_beta" not in names
    finally:
        conn.close()


# ── Expected-return building blocks (Ilmanen decomposition) ───────────────────

from . import expected_returns as er
from .shiller_data import ShillerRow


def _shiller_rows(n_months: int, *, cape: float, dividend: float = 60.0,
                  sp500: float = 5000.0, re_start: float = 100.0,
                  re_growth_m: float = 0.003) -> list[ShillerRow]:
    """Synthetic monthly Shiller history: constant CAPE/price/dividend, real
    earnings compounding at ``re_growth_m`` a month."""
    rows = []
    year, month = 2000, 1
    re = re_start
    for _ in range(n_months):
        rows.append(ShillerRow(f"{year:04d}-{month:02d}-01", sp500, dividend,
                               re * 1.1, 300.0, 4.0, sp500, dividend, re, cape))
        re *= (1.0 + re_growth_m)
        month += 1
        if month > 12:
            month, year = 1, year + 1
    return rows


def test_valuation_change_reverts_and_clamps():
    # CAPE 40 → anchor 20 over 10y = (0.5)^0.1 − 1 ≈ −6.7%, clamped to −4%.
    assert er._valuation_change(40.0, 20.0) == -er.VALUATION_CLAMP
    # Mild gap stays unclamped: 22 → 24.2 = 1.1^0.1 − 1 ≈ +0.96%.
    v = er._valuation_change(22.0, 24.2)
    assert v is not None and abs(v - (1.1 ** 0.1 - 1.0)) < 1e-9
    assert er._valuation_change(None, 20.0) is None
    assert er._valuation_change(20.0, None) is None


def test_median_cape_windows():
    rows = _shiller_rows(400, cape=30.0)
    for r in rows[:100]:
        pass
    assert er._median_cape(rows, None) == 30.0
    assert er._median_cape(rows[:50], None) is None      # under 60 obs → no anchor


def test_compute_expected_return_sums_terms(tmp_path):
    db = sqlite3.connect(":memory:")
    db.execute("""CREATE TABLE shiller_sp500 (date TEXT PRIMARY KEY, sp500 REAL,
                  dividend REAL, earnings REAL, cpi REAL, long_rate REAL,
                  real_price REAL, real_dividend REAL, real_earnings REAL, cape REAL)""")
    db.execute("""CREATE TABLE macro_series (series_id TEXT, date TEXT, value REAL,
                  source TEXT, label TEXT, unit TEXT, fetched TEXT,
                  PRIMARY KEY (series_id, date))""")
    rows = _shiller_rows(200, cape=25.0)
    db.executemany(
        "INSERT INTO shiller_sp500 VALUES (?,?,?,?,?,?,?,?,?,?)",
        [(r.date, r.sp500, r.dividend, r.earnings, r.cpi, r.long_rate,
          r.real_price, r.real_dividend, r.real_earnings, r.cape) for r in rows],
    )
    db.execute("INSERT INTO macro_series VALUES ('T10YIE','2016-08-01',2.3,'fred','','%','')")
    out = er.compute_expected_return(db)
    assert out is not None and out["partial"] is False
    # dividend yield 60/5000 = 1.2%; inflation 2.3%; CAPE flat → Δval = 0.
    assert abs(out["dividendYield"] - 0.012) < 1e-6
    assert abs(out["expectedInflation"] - 0.023) < 1e-6
    assert out["valuationChange"] == 0.0
    expected_total = out["dividendYield"] + out["realEarningsGrowth"] + 0.023 + 0.0
    assert abs(out["expectedReturnNominal"] - round(expected_total, 4)) <= 1e-4


def test_compute_expected_return_partial_when_inflation_missing():
    db = sqlite3.connect(":memory:")
    db.execute("""CREATE TABLE shiller_sp500 (date TEXT PRIMARY KEY, sp500 REAL,
                  dividend REAL, earnings REAL, cpi REAL, long_rate REAL,
                  real_price REAL, real_dividend REAL, real_earnings REAL, cape REAL)""")
    rows = _shiller_rows(200, cape=25.0)
    db.executemany(
        "INSERT INTO shiller_sp500 VALUES (?,?,?,?,?,?,?,?,?,?)",
        [(r.date, r.sp500, r.dividend, r.earnings, r.cpi, r.long_rate,
          r.real_price, r.real_dividend, r.real_earnings, r.cape) for r in rows],
    )
    out = er.compute_expected_return(db)   # no macro_series table at all
    assert out is not None
    assert out["expectedInflation"] is None and out["partial"] is True
    assert out["expectedReturnNominal"] is not None   # partial sum still shown, flagged
