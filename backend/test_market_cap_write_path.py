"""One write path for ``financials."Market Cap"``.

A quote is denominated in the LISTING's currency; the row is denominated in the
filer's reporting currency. Six places used to convert between the two and then
UPDATE, each with its own "unconvertible means leave the stored value alone"
branch, and the bug that put TSM's USD ADR cap into its TWD row had to be fixed
in each of them separately. ``data/financial_db.py write_market_cap`` is now the
one function that emits that UPDATE from a quote; this file asserts both what it
does and that nobody writes the column around it.

Network-free and DB-free: an in-memory database stands in for the warehouse.

Run:  cd backend && python -m pytest test_market_cap_write_path.py -q
"""

import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

from financial_db import ROW_CURRENCY, write_market_cap  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

RATES = {"USD": 1.0, "TWD": 0.0312, "GBP": 1.34}


def _db(currency="TWD", cap=1.0):
    conn = sqlite3.connect(":memory:")
    conn.execute(
        'CREATE TABLE financials ("Ticker" TEXT, "Calendar Year" TEXT,'
        ' "Reported Currency" TEXT, "Market Cap" REAL)'
    )
    conn.execute(
        'INSERT INTO financials VALUES (?, ?, ?, ?)', ("TSM", "2025", currency, cap)
    )
    return conn


def _stored(conn):
    return conn.execute('SELECT "Market Cap" FROM financials').fetchone()[0]


# ── What the helper does ────────────────────────────────────────────────────

def test_a_quote_is_converted_into_the_rows_own_currency():
    conn = _db("TWD")
    written = write_market_cap(conn, "TSM", 2025, 100.0, "USD", RATES)
    assert written == 100.0 * 1.0 / 0.0312
    assert _stored(conn) == written


def test_the_same_currency_on_both_sides_needs_no_rate():
    conn = _db("USD")
    assert write_market_cap(conn, "TSM", 2025, 100.0, "USD", {}) == 100.0
    assert _stored(conn) == 100.0


def test_an_unresolvable_pair_writes_nothing_and_keeps_the_stored_value():
    for row_ccy, quote_ccy, rates in (
        ("Unavailable", "USD", RATES),   # junk in the reporting column
        (None, "USD", RATES),            # no reporting currency at all
        ("TWD", None, RATES),            # the fetcher gave no quote currency
        ("TWD", "JPY", RATES),           # no rate for the quote side
    ):
        conn = _db(row_ccy, cap=7.0)
        assert write_market_cap(conn, "TSM", 2025, 100.0, quote_ccy, rates) is None
        assert _stored(conn) == 7.0, (row_ccy, quote_ccy)


def test_a_missing_cap_writes_nothing():
    conn = _db("TWD", cap=7.0)
    assert write_market_cap(conn, "TSM", 2025, None, "USD", RATES) is None
    assert _stored(conn) == 7.0


def test_a_fetcher_with_no_currency_keeps_the_old_unconverted_contract():
    """A plain float-returning fetcher reports no currency, and its figure has
    always been taken as already in the row's own currency."""
    conn = _db("TWD", cap=7.0)
    assert write_market_cap(conn, "TSM", 2025, 100.0, ROW_CURRENCY, RATES) == 100.0
    assert _stored(conn) == 100.0


def test_a_row_that_is_not_there_is_not_created():
    conn = _db("TWD")
    assert write_market_cap(conn, "NVDA", 2025, 100.0, "USD", RATES) is None
    assert conn.execute("SELECT COUNT(*) FROM financials").fetchone()[0] == 1


# ── That nobody writes the column around it ─────────────────────────────────

#: Files allowed to emit the UPDATE themselves, and why. Each writes a figure
#: that is NOT a quote, so the conversion this helper performs does not apply.
ALLOWED = {
    # The helper itself.
    os.path.join("data", "financial_db.py"),
    # Shares times a point-in-time price, written only into a NULL cell and only
    # when the listing currency and the row currency already agree.
    os.path.join("remediation", "phase3_complete_rows.py"),
    # The filer's own EntityPublicFloat from SEC, or a NULL where SEC has none.
    os.path.join("remediation", "phase7_delisted_repair.py"),
    # An audited correction of a value already stored, written in one
    # transaction beside its own audit row.
    os.path.join("remediation", "repair_market_cap_currency.py"),
    # This file, and the repair script's own test, quote the SQL to check it.
    os.path.join("backend", "test_market_cap_write_path.py"),
    os.path.join("backend", "test_repair_market_cap_currency.py"),
}

WRITE_SQL = re.compile(r'SET\s+"Market Cap"\s*=')


def _python_files():
    for root in ("backend", "data", "remediation", "scripts", "rag"):
        base = os.path.join(REPO, root)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in {"__pycache__", ".venv"}]
            for name in filenames:
                if name.endswith(".py"):
                    yield os.path.join(dirpath, name)


def test_no_other_file_writes_the_market_cap_column():
    offenders = []
    for path in _python_files():
        rel = os.path.relpath(path, REPO)
        with open(path, encoding="utf-8") as fh:
            if WRITE_SQL.search(fh.read()) and rel not in ALLOWED:
                offenders.append(rel)
    assert not offenders, (
        "these write financials.\"Market Cap\" outside data/financial_db.py "
        f"write_market_cap: {offenders}"
    )


def test_the_two_quote_driven_writers_go_through_the_helper():
    """The jobs that turn a live quote into a stored cap call the helper rather
    than converting and updating themselves."""
    for rel in (os.path.join("data", "market_cap_refresh.py"),):
        with open(os.path.join(REPO, rel), encoding="utf-8") as fh:
            src = fh.read()
        assert "write_market_cap(" in src, rel
        assert not WRITE_SQL.search(src), rel
    with open(os.path.join(REPO, "data", "financial_db.py"), encoding="utf-8") as fh:
        db_src = fh.read()
    # refresh_market_caps lives in the same module as the helper, so assert it
    # calls it rather than repeating the UPDATE: exactly one UPDATE in the file.
    assert len(WRITE_SQL.findall(db_src)) == 1, "financial_db.py grew a second writer"
    body = db_src[db_src.index("    def refresh_market_caps("):]
    body = body[: body.index("\n    def ", 1)]
    assert "write_market_cap(" in body


def test_the_phantom_stock_price_column_is_described_correctly():
    """``SELECT "Stock Price"`` returns the string 'Stock Price' on every row
    because SQLite treats an unknown double-quoted identifier as a string
    literal. The repair script used to record that as a column holding a
    constant."""
    path = os.path.join(REPO, "remediation", "repair_market_cap_currency.py")
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    assert "There is NO ``Stock Price`` column" in src
    assert "in all 363,552 rows" not in src
