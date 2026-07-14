"""Phase 6 FX-WEIGHT characterization tests.

Proves the by-year sector/industry aggregators weight metrics by an
FX-normalised (USD) market cap, not the raw local-currency cap. Before the
patch both aggregators summed a ¥/₩ cap against a $ cap at face value, so a
large-notional foreign filer dominated the weighted average for the wrong
reason. Metric VALUES (ratios) are never FX-converted; only the WEIGHT is.

These tests read the CURRENT builders:
  - industry_averages._avg_exprs   (the SQL fragment builder)
  - api._by_year_with_groups        (the end-to-end by-year aggregate)
If either still weights by raw local Market Cap, the assertions FAIL — this is
the intended red -> green signal for the patch.

Network-free. Builds a tiny temp financials.db with 2 companies in a shared
industry-year (one USD, one JPY) plus unknown-currency and NULL-currency edge
companies, and checks the weighted ROE directly.

Run:  cd backend && python -m pytest test_phase6_fx_weights.py -q
"""
import os
import sqlite3
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import industry_averages as ia  # noqa: E402

# JPY conversion used throughout: 10000 JPY * 0.007 usd_per_unit = $70.
_JPY_RATE = 0.007

# Columns api._by_year_with_groups reads (from _GROUP_METRIC_DISPLAY) plus the
# currency-weight columns. Only ROE / Market Cap / Reported Currency carry data.
_FIN_COLS = [
    "Revenue Growth", "Gross Profit Ratio", "Operating Income Ratio",
    "Net Income Ratio", "ROE", "ROIC", "Debt To Equity", "Current Ratio",
]


def _build_db(path: str) -> None:
    """Create a temp financials.db with tickers / financials / fx_rates.

    Three industry-year groups, all in calendar year 2020:

      CoreTwo     USD cap 100  ROE 0.10   +  JPY cap 10000 ($70)  ROE 0.30
      WithUnknown USD cap 100  ROE 0.10   +  ZZZ cap 999          ROE 0.99
      WithNull    NULL cap 100 ROE 0.10   +  USD cap 300          ROE 0.30
    """
    conn = sqlite3.connect(path)
    metric_defs = ", ".join(f'"{c}" REAL' for c in _FIN_COLS)
    conn.execute(
        f"""
        CREATE TABLE financials (
            Ticker TEXT,
            "Calendar Year" TEXT,
            "Reported Currency" TEXT,
            "Market Cap" REAL,
            {metric_defs},
            PRIMARY KEY (Ticker, "Calendar Year")
        )
        """
    )
    conn.execute(
        "CREATE TABLE tickers (ticker TEXT PRIMARY KEY, sector TEXT, industry TEXT)"
    )
    conn.execute(
        """CREATE TABLE fx_rates (
               currency TEXT PRIMARY KEY,
               usd_per_unit REAL NOT NULL,
               asof TEXT NOT NULL
           )"""
    )
    conn.execute(
        """CREATE TABLE fx_rates_hist (
               currency     TEXT    NOT NULL,
               year         INTEGER NOT NULL,
               usd_per_unit REAL    NOT NULL,
               asof         TEXT,
               PRIMARY KEY (currency, year)
           )"""
    )

    # (ticker, industry, ccy, market_cap, roe)
    companies = [
        ("USD1", "CoreTwo",     "USD", 100.0,   0.10),
        ("JPY1", "CoreTwo",     "JPY", 10000.0, 0.30),
        ("USD2", "WithUnknown", "USD", 100.0,   0.10),
        ("UNK1", "WithUnknown", "ZZZ", 999.0,   0.99),
        ("NUL1", "WithNull",    None,  100.0,   0.10),
        ("USD3", "WithNull",    "USD", 300.0,   0.30),
    ]
    roe_idx = _FIN_COLS.index("ROE")
    for tk, ind, ccy, mc, roe in companies:
        metrics = [None] * len(_FIN_COLS)
        metrics[roe_idx] = roe
        conn.execute(
            f'INSERT INTO tickers VALUES (?, ?, ?)', (tk, "SectorX", ind)
        )
        conn.execute(
            'INSERT INTO financials VALUES (?, ?, ?, ?, '
            + ", ".join("?" for _ in _FIN_COLS) + ")",
            (tk, "2020", ccy, mc, *metrics),
        )
    conn.executemany(
        "INSERT INTO fx_rates VALUES (?, ?, ?)",
        [("USD", 1.0, "2020-01-01"), ("JPY", _JPY_RATE, "2020-01-01")],
    )
    conn.commit()
    conn.close()


@pytest.fixture()
def db_path():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    _build_db(path)
    try:
        yield path
    finally:
        os.remove(path)


def _run_industry_roe(db_path: str, frag: str, industry: str) -> float | None:
    """Run a weighted-ROE fragment against one industry group in the temp DB."""
    sql = f"""
        SELECT {frag}
        FROM financials f
        JOIN tickers t ON t.ticker = f.Ticker
        LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"
        LEFT JOIN fx_rates_hist xh ON xh.currency = f."Reported Currency"
             AND xh.year = CAST(f."Calendar Year" AS INTEGER)
        WHERE t.industry = ?
        GROUP BY t.industry
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(sql, (industry,)).fetchone()
    finally:
        conn.close()
    return None if row is None or row["ROE"] is None else float(row["ROE"])


# ── industry_averages._avg_exprs (patched builder) ───────────────────────────

def test_avg_exprs_weights_by_usd_market_cap(db_path):
    """CoreTwo: patched weight is USD-normalised, so JPY sizes at $70 not 10000."""
    frag = ia._avg_exprs(["ROE"])
    got = _run_industry_roe(db_path, frag, "CoreTwo")

    expected = (0.10 * 100 + 0.30 * 70) / (100 + 70)   # 31 / 170
    assert got == pytest.approx(expected, abs=1e-9)


def test_old_raw_cap_weight_shows_the_bias(db_path):
    """The pre-patch raw-cap weighting sizes JPY at 10000 -> proves the direction
    of the fix (the value the patched builder must NOT return)."""
    old_frag = (
        'SUM(f."ROE" * f."Market Cap") /\n'
        '    NULLIF(SUM(f."ROE" * 0 + f."Market Cap"), 0) AS "ROE"'
    )
    got = _run_industry_roe(db_path, old_frag, "CoreTwo")

    biased = (0.10 * 100 + 0.30 * 10000) / (100 + 10000)   # 3010 / 10100
    assert got == pytest.approx(biased, abs=1e-9)
    # And the patched builder is materially different from the biased number.
    patched = _run_industry_roe(db_path, ia._avg_exprs(["ROE"]), "CoreTwo")
    assert abs(patched - biased) > 0.1


def test_avg_exprs_unknown_currency_drops_out(db_path):
    """WithUnknown: the ZZZ filer has no fx rate -> NULL weight -> excluded from
    numerator AND denominator, so the group ROE is the lone USD filer's 0.10."""
    frag = ia._avg_exprs(["ROE"])
    got = _run_industry_roe(db_path, frag, "WithUnknown")
    assert got == pytest.approx(0.10, abs=1e-9)


def test_avg_exprs_null_currency_treated_as_usd(db_path):
    """WithNull: the NULL-currency filer weights at 1.0/unit (like USD), so it
    contributes rather than dropping out."""
    frag = ia._avg_exprs(["ROE"])
    got = _run_industry_roe(db_path, frag, "WithNull")

    expected = (0.10 * 100 + 0.30 * 300) / (100 + 300)   # 100 / 400 = 0.25
    assert got == pytest.approx(expected, abs=1e-9)
    # If NULL were dropped, only USD3 would remain and ROE would be 0.30.
    assert got != pytest.approx(0.30, abs=1e-9)


# ── api._by_year_with_groups (patched end-to-end aggregate) ──────────────────

def test_by_year_with_groups_fx_weighted(db_path):
    """The api by-year aggregate applies the same FX weighting end to end."""
    import api  # noqa: E402  — heavy import; kept inside the test

    api.DB_PATH = api.Path(db_path)
    api.invalidate_cache()
    try:
        out = api._by_year_with_groups("industry")
    finally:
        api.invalidate_cache()

    year = out[2020]
    assert year["CoreTwo"]["ROE"] == pytest.approx(
        (0.10 * 100 + 0.30 * 70) / 170, abs=1e-9
    )
    assert year["WithUnknown"]["ROE"] == pytest.approx(0.10, abs=1e-9)
    assert year["WithNull"]["ROE"] == pytest.approx(
        (0.10 * 100 + 0.30 * 300) / 400, abs=1e-9
    )
