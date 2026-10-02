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


# ── AAII Asset Allocation Survey ──────────────────────────────────────────────
#
# The workbook is hand-supplied (aaii.com is behind a bot WAF), so the tests that
# need the real file skip when it is absent. The logic that actually matters, the
# positional date rebuild that works around AAII's mislabelled 2006/2007 rows, is
# covered by pure-function tests that need no file at all.

import datetime as _date_mod
from pathlib import Path

from . import aaii_allocation as aaii


def test_rebuild_dates_is_dense_monthly_from_the_survey_start():
    dates = aaii._rebuild_dates(_date_mod.date(1987, 11, 30), _date_mod.date(1988, 2, 29), 4)
    assert dates == ["1987-11-01", "1987-12-01", "1988-01-01", "1988-02-01"]


def test_rebuild_dates_repairs_the_2006_2007_mislabelling():
    # AAII stamps Feb-Dec 2006/2007 with 2005 month-ends. Position, not the label,
    # is the truth: row 219 (0-based) must land on 2006-02 regardless of its cell.
    n = 464  # 1987-11 .. 2026-06
    dates = aaii._rebuild_dates(_date_mod.date(1987, 11, 30), _date_mod.date(2026, 6, 24), n)
    assert len(dates) == n
    assert dates[219] == "2006-02-01"
    assert dates[231] == "2007-02-01"
    assert dates[-1] == "2026-06-01"


def test_rebuild_dates_refuses_when_the_sheet_is_not_dense():
    # A real gap must fail loudly: guessing would shift every observation.
    with pytest.raises(ValueError, match="dense"):
        aaii._rebuild_dates(_date_mod.date(1987, 11, 30), _date_mod.date(1988, 2, 29), 3)


def test_rebuild_dates_rejects_an_unexpected_survey_start():
    with pytest.raises(ValueError, match="start"):
        aaii._rebuild_dates(_date_mod.date(1990, 1, 31), _date_mod.date(1990, 4, 30), 4)


def test_locate_columns_takes_the_granular_block_not_the_rollup_duplicates():
    # "Stocks"/"Bonds"/"Cash" appear twice: once granular (left of Total), once
    # rolled up (right of it). Everything must bind to the left-hand block.
    header = [None, "Stock Funds", "Stocks", "Bond Funds", "Bonds", "Cash", "Total",
              None, "Stocks", "Bonds", "Cash"]
    cols = aaii._locate_columns(header)
    assert cols["stock funds"] == 1
    assert cols["stocks"] == 2      # not 8
    assert cols["bonds"] == 4       # not 9
    assert cols["cash"] == 5        # not 10
    assert cols["total"] == 6


def test_locate_columns_without_a_total_column_raises():
    with pytest.raises(ValueError, match="Total"):
        aaii._locate_columns([None, "Stock Funds", "Stocks", "Cash"])


def test_store_writes_three_percent_series_and_is_idempotent():
    conn = sqlite3.connect(":memory:")
    try:
        rows = [aaii.AllocRow("1987-11-01", 45.33, 19.80, 34.91),
                aaii.AllocRow("1987-12-01", 46.30, 21.20, 32.50)]
        assert aaii.store(conn, rows)[aaii.STOCKS_SERIES] == 2
        aaii.store(conn, rows)  # upsert, must not duplicate
        n = conn.execute(
            "SELECT COUNT(*) FROM macro_series WHERE series_id LIKE 'AAII%'"
        ).fetchone()[0]
        assert n == 6  # 3 series x 2 months
        v, unit, src = conn.execute(
            "SELECT value, unit, source FROM macro_series "
            "WHERE series_id=? AND date='1987-11-01'", (aaii.STOCKS_SERIES,)
        ).fetchone()
        assert (round(v, 2), unit, src) == (45.33, "%", "AAII")
    finally:
        conn.close()


def test_refresh_without_a_source_file_is_a_no_op_not_an_error():
    conn = sqlite3.connect(":memory:")
    try:
        schema.ensure_external_schema(conn)
        out = aaii.refresh_aaii_allocation(conn, path="does-not-exist.xls")
        assert out["status"] == "no source file" and out["rows"] == 0
    finally:
        conn.close()


def test_parse_workbook_reads_percentages_and_sums_the_granular_components(tmp_path):
    # Synthetic workbook: fractions in, percentages out, roll-ups summed from the
    # five granular columns and cross-checked against the roll-up block.
    xlsx = tmp_path / "aaii_asset_allocation.xlsx"
    frame = pd.DataFrame([
        ["AAII", None, None, None, None, None, None, None, None, None, None],
        [None, None, None, None, None, None, None, None, None, None, None],
        [None, "Stock Funds", "Stocks", "Bond Funds", "Bonds", "Cash", "Total",
         None, "Stocks", "Bonds", "Cash"],
        [_date_mod.datetime(1987, 11, 30), 0.20, 0.25, 0.09, 0.11, 0.35, 1.0,
         None, 0.45, 0.20, 0.35],
        [_date_mod.datetime(1987, 12, 30), 0.22, 0.24, 0.09, 0.12, 0.33, 1.0,
         None, 0.46, 0.21, 0.33],
    ])
    with pd.ExcelWriter(xlsx, engine="openpyxl") as w:
        frame.to_excel(w, sheet_name=aaii.SHEET_NAME, index=False, header=False)

    rows = aaii.parse_workbook(xlsx)
    assert len(rows) == 2
    assert rows[0].date == "1987-11-01"
    assert rows[0].stocks == pytest.approx(45.0)   # (0.20 + 0.25) * 100
    assert rows[0].bonds == pytest.approx(20.0)
    assert rows[0].cash == pytest.approx(35.0)
    assert rows[1].date == "1987-12-01"


def test_parse_workbook_rejects_a_sheet_whose_components_do_not_total_100(tmp_path):
    xlsx = tmp_path / "bad.xlsx"
    frame = pd.DataFrame([
        [None, "Stock Funds", "Stocks", "Bond Funds", "Bonds", "Cash", "Total"],
        [_date_mod.datetime(1987, 11, 30), 0.20, 0.25, 0.09, 0.11, 0.05, 0.70],
    ])
    with pd.ExcelWriter(xlsx, engine="openpyxl") as w:
        frame.to_excel(w, sheet_name=aaii.SHEET_NAME, index=False, header=False)
    with pytest.raises(ValueError, match="outside"):
        aaii.parse_workbook(xlsx)


# ── the real workbook, when it has been dropped in ────────────────────────────

_REAL = aaii.find_source_file()
_needs_workbook = pytest.mark.skipif(
    _REAL is None, reason="AAII workbook not present in backend/data_manual/"
)


@_needs_workbook
def test_real_workbook_parses_to_a_dense_monthly_series_since_1987():
    rows = aaii.parse_workbook(_REAL)
    assert rows[0].date == "1987-11-01"
    # dense: every row is exactly one month after the previous one
    seen = {r.date for r in rows}
    assert len(seen) == len(rows)
    assert all(90.0 <= r.stocks + r.bonds + r.cash <= 110.0 for r in rows)


@_needs_workbook
def test_real_workbook_reproduces_aaiis_published_long_run_averages():
    # AAII prints "Stocks Avg = 62%, Bonds Avg = 16%, Cash Avg = 22%" on the sheet.
    # Reproducing those from our own parse proves the column mapping and the
    # positional date rebuild are both right.
    rows = aaii.parse_workbook(_REAL)
    n = len(rows)
    assert sum(r.stocks for r in rows) / n == pytest.approx(62.0, abs=0.6)
    assert sum(r.bonds for r in rows) / n == pytest.approx(16.0, abs=0.6)
    assert sum(r.cash for r in rows) / n == pytest.approx(22.0, abs=0.6)


@_needs_workbook
def test_real_workbook_places_the_known_extremes_on_the_right_months():
    # The two readings whose dates are historically unambiguous. If the 2006/2007
    # date repair regressed, these would land on the wrong month.
    by_date = {r.date: r for r in aaii.parse_workbook(_REAL)}
    peak = max(by_date.values(), key=lambda r: r.stocks)
    trough = min(by_date.values(), key=lambda r: r.stocks)
    assert peak.date == "2000-01-01" and peak.stocks == pytest.approx(77.0, abs=0.2)
    assert trough.date == "2009-03-01" and trough.stocks == pytest.approx(40.8, abs=0.2)
    # cash peaked the same month the market bottomed
    assert max(by_date.values(), key=lambda r: r.cash).date == "2009-03-01"


class _FlakyConn:
    """Delegates to a real connection but fails the Nth executemany.

    sqlite3.Connection attributes are read-only, so the failure is injected with a
    proxy rather than a monkeypatch. Everything else (execute, commit, rollback)
    passes straight through to the real connection.
    """

    def __init__(self, real: sqlite3.Connection, fail_on: int) -> None:
        self._real = real
        self._fail_on = fail_on
        self._n = 0

    def executemany(self, sql, params):
        self._n += 1
        if self._n == self._fail_on:
            raise sqlite3.OperationalError("database is locked")
        return self._real.executemany(sql, params)

    def __getattr__(self, name):
        return getattr(self._real, name)


def test_store_is_atomic_across_the_three_series():
    """A failure partway through must leave NOTHING behind.

    run_due() reuses one connection for every task in a tick, so an orphaned
    partial write would be committed by a later task and leave the AAII series
    lopsided, which the metric-69 reader cannot compute a percentile from.
    """
    real = sqlite3.connect(":memory:")
    try:
        schema.ensure_external_schema(real)
        rows = [aaii.AllocRow("1987-11-01", 45.33, 19.80, 34.91)]

        # stocks writes, bonds blows up
        conn = _FlakyConn(real, fail_on=2)
        with pytest.raises(sqlite3.OperationalError):
            aaii.store(conn, rows)  # type: ignore[arg-type]

        # Simulate the later task in the same tick that would otherwise sweep an
        # orphaned partial write into a commit.
        real.commit()
        left = real.execute(
            "SELECT COUNT(*) FROM macro_series WHERE series_id LIKE 'AAII%'"
        ).fetchone()[0]
        assert left == 0, "partial AAII write survived; store() is not atomic"
    finally:
        real.close()


# ── refresh scheduler: staleness probe + cache invalidation ───────────────────


class _ProbeConn:
    """Stands in for the market_data connection: answers MAX(fetched_at) from a
    {series_id: timestamp} map, mirroring _newest_macro's single-row query."""

    def __init__(self, fetched: dict[str, str]):
        self._fetched = fetched

    def execute(self, sql, params=()):
        newest = max((self._fetched[s] for s in params if s in self._fetched),
                     default=None)

        class _R:
            @staticmethod
            def fetchone():
                return (newest,)

        return _R()


def test_credit_spreads_have_their_own_staleness_probe():
    """A group that has never been fetched must not hide behind a fresh sibling:
    MAX(fetched_at) over one combined id list reads fresh and the new series
    never downloads."""
    import datetime as dt

    from . import refresh

    fresh = dt.datetime.now().isoformat(timespec="seconds")
    assert ("BAMLH0A0HYM2",) in refresh._FRED_PROBE_GROUPS

    # Treasuries fetched minutes ago, credit spreads never fetched at all.
    conn = _ProbeConn({"DGS1": fresh, "DGS10": fresh, "T10YIE": fresh,
                       "USEPUINDXD": fresh})
    assert refresh._fred_is_stale(conn) is True

    # Everything fresh, including the credit probe: nothing to do.
    conn = _ProbeConn({"DGS1": fresh, "DGS10": fresh, "T10YIE": fresh,
                       "USEPUINDXD": fresh, "BAMLH0A0HYM2": fresh})
    assert refresh._fred_is_stale(conn) is False
    assert refresh._fred_is_stale(conn, force=True) is True


def test_refresh_invalidates_the_connections_cache_too():
    """/api/connections caches under the generic "db" prefix, so invalidating
    "econ" alone left it serving pre-refresh macro figures."""
    from . import refresh

    assert "econ" in refresh.INVALIDATE_PREFIXES
    assert "db:connections_endpoint" in refresh.INVALIDATE_PREFIXES
    # Narrow, not the whole "db" namespace: a macro refresh cannot change a
    # sector/industry/ranking payload.
    assert "db" not in refresh.INVALIDATE_PREFIXES


# ── implied-ERP history: the stored date is the observation's own date ───────


def _erp_conn(monkeypatch, shiller_rows, rf_by_year):
    """A market-data DB seeded with Shiller rows and DGS10, with the ERP solver
    stubbed so the test is about the DATE, not the arithmetic."""
    conn = sqlite3.connect(":memory:")
    schema.ensure_external_schema(conn)
    monkeypatch.setattr(mi, "compute_implied_erp",
                        lambda **kw: (0.045, {"method": "stub"}))
    monkeypatch.setattr("marketdata.shiller_data.read_stored",
                        lambda _c: shiller_rows)
    monkeypatch.setattr("marketdata.fred_client.read_series",
                        lambda _c, _s: [
                            type("Obs", (), {"date": f"{y}-12-31", "value": v * 100.0})()
                            for y, v in rf_by_year.items()])
    return conn


def _shiller(date):
    return ShillerRow(date=date, sp500=5000.0, dividend=70.0, earnings=200.0,
                      cpi=None, long_rate=None, real_price=None,
                      real_dividend=None, real_earnings=None, cape=30.0)


def test_implied_erp_history_is_dated_by_its_own_observation(monkeypatch):
    """Shiller's dividend/earnings columns lag price, so the CURRENT year's last
    complete row is mid-year. Stamping it December put the latest point months
    into the future on the economic chart."""
    rows = [_shiller("2024-11-01"), _shiller("2024-12-01"),
            _shiller("2025-06-01")]
    conn = _erp_conn(monkeypatch, rows, {2024: 0.042, 2025: 0.043})
    try:
        out = mi.historical_implied_erp_series(conn, since=2024)
        assert set(out) == {2024, 2025}
        stored = conn.execute(
            "SELECT date FROM macro_series WHERE series_id='ERP_IMPLIED' "
            "ORDER BY date").fetchall()
        assert [r[0] for r in stored] == ["2024-12-01", "2025-06-01"]
    finally:
        conn.close()


def test_implied_erp_history_replaces_a_previously_mislabelled_point(monkeypatch):
    """Re-running after the fix must not leave the old December stamp beside the
    corrected one; the chart would show the year twice."""
    rows = [_shiller("2025-06-01")]
    conn = _erp_conn(monkeypatch, rows, {2025: 0.043})
    try:
        conn.execute(
            "INSERT INTO macro_series (series_id, date, value, source, label,"
            " unit, fetched_at) VALUES ('ERP_IMPLIED', '2025-12-01', 0.039,"
            " 'computed', 'old', 'decimal', '2026-01-01')")
        conn.commit()
        mi.historical_implied_erp_series(conn, since=2025)
        stored = conn.execute(
            "SELECT date FROM macro_series WHERE series_id='ERP_IMPLIED'"
        ).fetchall()
        assert [r[0] for r in stored] == ["2025-06-01"]
    finally:
        conn.close()


# ── annual CPI inflation (capex split input) ─────────────────────────────────


def test_annual_inflation_uses_twelve_month_averages_and_a_partial_newest_year():
    from .fred_client import Obs, annual_inflation

    obs = [Obs(f"2023-{m:02d}-01", 100.0) for m in range(1, 13)]
    obs += [Obs(f"2024-{m:02d}-01", 103.0) for m in range(1, 13)]
    obs += [Obs("2025-01-01", 105.06), Obs("2025-02-01", 106.09)]
    out = annual_inflation(obs)
    assert 2023 not in out                       # no prior year to compare
    assert out[2024] == pytest.approx(0.03)      # 103 average over 100 average
    assert out[2025] == pytest.approx(106.09 / 103.0 - 1)  # Feb over Feb
    assert annual_inflation([]) == {}


def test_annual_inflation_keeps_a_past_year_missing_one_month():
    """October 2025 CPI was never published; 2025 must still get a rate."""
    from .fred_client import Obs, annual_inflation

    obs = [Obs(f"2024-{m:02d}-01", 100.0) for m in range(1, 13)]
    obs += [Obs(f"2025-{m:02d}-01", 102.0) for m in range(1, 13) if m != 10]
    obs += [Obs("2026-01-01", 104.0)]
    out = annual_inflation(obs)
    assert out[2025] == pytest.approx(0.02)
    assert out[2026] == pytest.approx(104.0 / 102.0 - 1)
