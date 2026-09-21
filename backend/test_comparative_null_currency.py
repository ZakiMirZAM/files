"""Regression tests for the /api/comparative 404s on NULL-currency industries.

Live symptom (2026-09-06): /api/comparative/Medical%20Care%20Facilities and its
/ranking and /company-metrics siblings all returned 404 even though the industry
has 17 filers with market caps. Every one of those filers carries a NULL
"Reported Currency", and the peer-ranking queries multiplied Market Cap by a
bare fx_rates.usd_per_unit, so the LEFT JOIN made every cap NULL and
`HAVING mc IS NOT NULL` emptied the peer set. 47 other industries were in the
same state. The fix adopts the contract _FX_WEIGHT_SQL already used elsewhere:
USD or NULL currency -> 1.0, known currency -> spot rate, unknown -> NULL.

Second half of the same failure: /api/industries advertised industries that
can never be served (secondary listings only, no financials, empty name, a
'/' in the name). _servable_industries() filters the menu to what the
comparative endpoints can actually answer.

Network-free; builds a tiny temp financials.db.
Run:  cd backend && python -m pytest test_comparative_null_currency.py -q
"""
import os
import sqlite3
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))


def _build_db(path: str) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """CREATE TABLE financials (
               Ticker TEXT, "Calendar Year" TEXT, "Reported Currency" TEXT,
               "Market Cap" REAL, PRIMARY KEY (Ticker, "Calendar Year"))"""
    )
    conn.execute("CREATE TABLE tickers (ticker TEXT PRIMARY KEY, sector TEXT, industry TEXT)")
    conn.execute("CREATE TABLE fx_rates (currency TEXT PRIMARY KEY, usd_per_unit REAL NOT NULL, asof TEXT NOT NULL)")
    conn.execute("CREATE TABLE security_map (symbol TEXT PRIMARY KEY, is_primary INTEGER)")
    # (ticker, industry, ccy, cap, is_primary or None)
    rows = [
        ("NULA", "NullCcyOnly",     None,  500.0,  None),  # the Medical Care Facilities case
        ("NULB", "NullCcyOnly",     None,  900.0,  None),
        ("USDA", "MixedNormal",     "USD", 100.0,  None),
        ("JPYA", "MixedNormal",     "JPY", 1e4,    None),
        ("UNKA", "UnknownCcyOnly",  "ZZZ", 999.0,  None),
        ("SECA", "SecondaryOnly",   "CHF", 800.0,  0),     # London line of a Swiss name
        ("EMPA", "",                "USD", 100.0,  None),
        ("SLSA", "Agri/Milling",    "USD", 100.0,  None),  # can't match the path param
    ]
    for tk, ind, ccy, mc, prim in rows:
        conn.execute("INSERT INTO tickers VALUES (?, ?, ?)", (tk, "SectorX", ind))
        conn.execute("INSERT INTO financials VALUES (?, ?, ?, ?)", (tk, "2024", ccy, mc))
        if prim is not None:
            conn.execute("INSERT INTO security_map VALUES (?, ?)", (tk, prim))
    conn.execute("INSERT INTO tickers VALUES ('NOFIN', 'SectorX', 'NoFinancials')")
    conn.executemany(
        "INSERT INTO fx_rates VALUES (?, ?, ?)",
        [("USD", 1.0, "2024-01-01"), ("JPY", 0.007, "2024-01-01"), ("CHF", 1.1, "2024-01-01")],
    )
    conn.commit()
    conn.close()


@pytest.fixture()
def api_with_db():
    import api  # noqa: E402  — heavy import; kept inside the fixture

    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    _build_db(path)
    old = api.DB_PATH
    api.DB_PATH = api.Path(path)
    api.invalidate_cache()
    try:
        yield api
    finally:
        api.DB_PATH = old
        api.invalidate_cache()
        os.remove(path)


def _spot_caps(api, industry: str) -> dict[str, float | None]:
    """Run the exact peer-set predicate the comparative queries use."""
    with api.db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT f.Ticker, {api._FX_SPOT_MC_SQL} AS mc
            FROM financials f JOIN tickers t ON t.ticker = f.Ticker
            LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"
            WHERE t.industry = ?
            """,
            (industry,),
        ).fetchall()
    return {r["Ticker"]: r["mc"] for r in rows}


def test_null_currency_cap_counts_as_usd(api_with_db):
    caps = _spot_caps(api_with_db, "NullCcyOnly")
    assert caps == {"NULA": 500.0, "NULB": 900.0}


def test_known_currency_converts_and_unknown_drops(api_with_db):
    assert _spot_caps(api_with_db, "MixedNormal") == {"USDA": 100.0, "JPYA": pytest.approx(70.0)}
    assert _spot_caps(api_with_db, "UnknownCcyOnly") == {"UNKA": None}


def test_servable_industries_matches_what_comparative_can_answer(api_with_db):
    servable = api_with_db._servable_industries()
    assert "NullCcyOnly" in servable
    assert "MixedNormal" in servable
    for hidden in ("UnknownCcyOnly", "SecondaryOnly", "", "Agri/Milling", "NoFinancials"):
        assert hidden not in servable, hidden


def test_list_industries_hides_unservable(api_with_db):
    names = {e["name"] for e in api_with_db.list_industries()}
    assert names == {"NullCcyOnly", "MixedNormal"}
