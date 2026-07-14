"""Network-free tests for the Phase 6 Damodaran benchmark ingest.

Covered:
* ``extract_rows`` turns a synthetic header-less frame (Damodaran layout, with
  a multi-row preamble and aggregate rows to skip) into per-industry metrics.
* ``_persist`` + PK restatement: re-ingesting the same year REPLACES the row.
* ``benchmark_for`` against a temp DB with a monkeypatched alias resolver:
  alias hit, raw-label hit, fuzzy fallback, unmapped -> all-None.
* ``_archive_name`` mirrors the betas ``<stem><YY>.xls`` convention.

Run:  cd backend && python -m pytest test_phase6_benchmark.py -q
"""

from __future__ import annotations

import datetime as _dt
import os
import sqlite3
import sys

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
for _p in (_HERE, os.path.join(_ROOT, "remediation"), os.path.join(_ROOT, "data")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import phase6_damodaran_benchmark as p6  # noqa: E402


# ── synthetic-frame parsing ──────────────────────────────────────────────────
class _FakeFrame:
    """Minimal stand-in for a header-less pandas frame: ``.iloc[i].tolist()``
    over a list-of-rows, plus ``len``. Avoids a pandas dependency in the test."""

    class _Row:
        def __init__(self, cells):
            self._cells = cells

        def tolist(self):
            return list(self._cells)

    class _ILoc:
        def __init__(self, rows):
            self._rows = rows

        def __getitem__(self, i):
            return _FakeFrame._Row(self._rows[i])

    def __init__(self, rows):
        self._rows = rows
        self.iloc = _FakeFrame._ILoc(rows)

    def __len__(self):
        return len(self._rows)


def _margin_like_frame():
    """Two-row preamble, a header row, two industries, and an aggregate row."""
    return _FakeFrame([
        ["Date updated:", "2026-01-05", None, None],
        [None, None, None, None],
        ["Industry Name", "Number of firms",
         "Net Margin", "Pre-tax Unadjusted Operating Margin"],
        ["Advertising", "52", 0.10, 0.15],
        ["Air Transport", "18", -0.02, 0.05],
        ["Total Market", "7000", 0.11, 0.14],  # must be skipped
    ])


def test_extract_rows_locates_header_and_maps_columns():
    metric_map = p6._DATASETS["margin.xls"]
    parsed = p6.extract_rows(_margin_like_frame(), metric_map)
    assert set(parsed) == {"Advertising", "Air Transport"}  # aggregate skipped
    assert parsed["Advertising"] == {
        "net_margin": 0.10, "operating_margin": 0.15}
    assert parsed["Air Transport"]["net_margin"] == pytest.approx(-0.02)


def test_extract_rows_first_column_by_index_wins_for_operating_margin():
    """Both a 'pre-tax, pre-stock' and a plain operating-margin column exist;
    the priority list resolves the unadjusted one, and a NaN cell is dropped."""
    rows = [
        ["Industry Name", "Net Margin",
         "Pre-tax, Pre-stock compensation Operating Margin",
         "Pre-tax Unadjusted Operating Margin"],
        ["Software", 0.20, 0.30, 0.25],
        ["Empty", float("nan"), float("nan"), float("nan")],
    ]
    parsed = p6.extract_rows(_FakeFrame(rows), p6._DATASETS["margin.xls"])
    assert parsed["Software"]["operating_margin"] == pytest.approx(0.25)
    assert "Empty" not in parsed  # all-NaN row contributes nothing


def test_extract_rows_empty_or_headerless():
    assert p6.extract_rows(None, p6._DATASETS["margin.xls"]) == {}
    no_header = _FakeFrame([["foo", "bar"], ["baz", 1.0]])
    assert p6.extract_rows(no_header, p6._DATASETS["margin.xls"]) == {}


def test_archive_name_mirrors_betas_convention():
    assert p6._archive_name("margin.xls", 2020) == "margin20.xls"
    assert p6._archive_name("pedata.xls", 2007) == "pedata07.xls"
    assert p6._archive_name("wacc.xls", 2025) == "wacc25.xls"


# ── persistence + PK restatement ─────────────────────────────────────────────
@pytest.fixture()
def db():
    conn = sqlite3.connect(":memory:")
    p6.ensure_benchmark_schema(conn)
    yield conn
    conn.close()


def test_persist_and_pk_restatement(db):
    year = 2025
    n1 = p6._persist(db, year, {"Advertising": {"net_margin": 0.10}}, "src-a")
    db.commit()
    assert n1 == 1
    # Re-ingest the SAME (year, industry, metric) with a new value + source.
    n2 = p6._persist(db, year, {"Advertising": {"net_margin": 0.12}}, "src-b")
    db.commit()
    assert n2 == 1
    rows = db.execute(
        "SELECT value, source FROM damodaran_benchmark "
        "WHERE year=? AND dam_industry='Advertising' AND metric='net_margin'",
        [year]).fetchall()
    assert len(rows) == 1  # REPLACED, not duplicated
    assert rows[0][0] == pytest.approx(0.12)
    assert rows[0][1] == "src-b"


# ── benchmark_for with a monkeypatched alias resolver ────────────────────────
def _seed(db, year=2025):
    now = _dt.datetime.now().isoformat(timespec="seconds")
    seed = {
        "Software (System & Application)": {
            "operating_margin": 0.30, "net_margin": 0.22, "wacc": 0.09,
            "cost_of_equity": 0.10, "pe": 35.0, "roe": 0.25,
        },
        "Advertising": {"net_margin": 0.10, "pe": 18.0},
    }
    for ind, metrics in seed.items():
        for m, v in metrics.items():
            db.execute(
                "INSERT OR REPLACE INTO damodaran_benchmark "
                "(year, dam_industry, metric, value, source, fetched_at) "
                "VALUES (?,?,?,?,?,?)",
                [year, ind, m, v, "test", now])
    db.commit()


def test_benchmark_for_alias_hit(db, monkeypatch):
    _seed(db)
    # Monkeypatch the alias resolver: our yfinance label -> Damodaran group.
    monkeypatch.setattr(
        p6, "alias_industry",
        lambda ind: "Software (System & Application)"
        if ind == "Software - Application" else None)
    out = p6.benchmark_for(db, "Software - Application", 2025)
    assert set(out) == set(p6.BENCHMARK_METRICS)
    assert out["operating_margin"] == pytest.approx(0.30)
    assert out["pe"] == pytest.approx(35.0)
    assert out["roe"] == pytest.approx(0.25)


def test_benchmark_for_raw_label_hit_when_no_alias(db, monkeypatch):
    _seed(db)
    monkeypatch.setattr(p6, "alias_industry", lambda ind: None)
    out = p6.benchmark_for(db, "Advertising", 2025)
    assert out["net_margin"] == pytest.approx(0.10)
    assert out["pe"] == pytest.approx(18.0)
    # Metrics absent for this industry are present as None, not missing.
    assert out["operating_margin"] is None
    assert out["roe"] is None


def test_benchmark_for_fuzzy_fallback(db, monkeypatch):
    _seed(db)
    monkeypatch.setattr(p6, "alias_industry", lambda ind: None)
    # "Software" is a substring of the stored "Software (System & Application)".
    out = p6.benchmark_for(db, "Software", 2025)
    assert out["operating_margin"] == pytest.approx(0.30)


def test_benchmark_for_unmapped_is_all_none(db, monkeypatch):
    _seed(db)
    monkeypatch.setattr(p6, "alias_industry", lambda ind: None)
    out = p6.benchmark_for(db, "Zzz Nonexistent Industry", 2025)
    assert set(out) == set(p6.BENCHMARK_METRICS)
    assert all(v is None for v in out.values())


def test_benchmark_for_year_isolation(db, monkeypatch):
    _seed(db, year=2025)
    monkeypatch.setattr(p6, "alias_industry", lambda ind: None)
    # No 2015 rows -> all None even though 2025 has data.
    out = p6.benchmark_for(db, "Advertising", 2015)
    assert all(v is None for v in out.values())
