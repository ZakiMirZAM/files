"""Network-free tests for remediation/phase3_backfill.py.

Covers the pure target-selection SQL (missing/frozen/explicit cohorts), the
symbol-mismatch resolution, checkpoint skip/persist behaviour, and the sweep
loop with a stubbed FinancialDB.update_ticker (no yfinance, no network).
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import pytest

# Standalone imports: data/ and remediation/ only.
_REPO = Path(__file__).resolve().parent.parent
for _p in (str(_REPO / "data"), str(_REPO / "remediation")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import phase3_backfill as p3  # noqa: E402


# ── fixtures ──────────────────────────────────────────────────────────────────

def _build_db(path: str) -> None:
    """A tiny DB with just the columns the selection SQL touches."""
    conn = sqlite3.connect(path)
    conn.execute(
        'CREATE TABLE financials (Ticker TEXT, "Calendar Year" INTEGER, '
        'last_updated TEXT, PRIMARY KEY (Ticker, "Calendar Year"))'
    )
    conn.execute(
        "CREATE TABLE security_map (symbol TEXT PRIMARY KEY, symbol_yf TEXT, "
        "is_primary INTEGER, status TEXT)"
    )
    conn.execute("CREATE TABLE job_runs (job TEXT PRIMARY KEY, last_run TEXT)")
    # financials rows
    conn.executemany(
        'INSERT INTO financials (Ticker, "Calendar Year", last_updated) VALUES (?,?,?)',
        [
            ("AAPL", 2023, "2024-01-01"),
            ("AAPL", 2025, "2025-01-01"),   # fresh: newest year 2025
            ("STALE", 2022, "2022-01-01"),
            ("STALE", 2024, "2023-01-01"),  # frozen: newest year 2024
            ("OLD", 2019, "2020-01-01"),    # frozen: newest year 2019
        ],
    )
    # security_map: MSFT primary with rows-none (missing); GHOST placeholder;
    # ALIAS non-primary; FOREIGN primary with a differing symbol_yf.
    conn.executemany(
        "INSERT INTO security_map (symbol, symbol_yf, is_primary, status) VALUES (?,?,?,?)",
        [
            ("AAPL", "AAPL", 1, "active"),
            ("STALE", "STALE", 1, "active"),
            ("MSFT", "MSFT", 1, "active"),        # missing (no financials rows)
            ("GHOST", "GHOST", 1, "placeholder_only"),  # excluded by status
            ("ALIASX", "ALIASX", 0, "active"),    # excluded: not primary
            ("FOREIGN", "7203.T", 1, "active"),   # missing but symbol_yf differs
        ],
    )
    conn.commit()
    conn.close()


@pytest.fixture()
def db_path(tmp_path: Path) -> str:
    p = tmp_path / "phase3_test.db"
    _build_db(str(p))
    return str(p)


@pytest.fixture()
def ro_conn(db_path: str):
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    yield conn
    conn.close()


# ── target selection ───────────────────────────────────────────────────────────

def test_select_missing_excludes_alias_placeholder_and_existing(ro_conn):
    got = {t.canonical for t in p3.select_missing(ro_conn)}
    assert got == {"MSFT", "FOREIGN"}  # AAPL/STALE have rows; GHOST/ALIASX excluded


def test_select_frozen_by_cutoff(ro_conn):
    got = {t.canonical for t in p3.select_frozen(ro_conn, max_year=2024)}
    assert got == {"STALE", "OLD"}      # AAPL newest year is 2025 -> not frozen


def test_select_frozen_cutoff_is_inclusive_boundary(ro_conn):
    # max_year 2019 keeps only OLD (newest 2019); STALE (2024) drops out.
    got = {t.canonical for t in p3.select_frozen(ro_conn, max_year=2019)}
    assert got == {"OLD"}


def test_build_targets_union_dedup(ro_conn):
    tgts = p3.build_targets(ro_conn, missing=True, frozen=True, max_year=2024)
    names = [t.canonical for t in tgts]
    assert set(names) == {"MSFT", "FOREIGN", "STALE", "OLD"}
    assert len(names) == len(set(names))  # no duplicates


def test_select_explicit_resolves_symbol_yf(ro_conn):
    tgts = p3.select_explicit(ro_conn, ["foreign", "msft", "UNKNOWN"])
    by_name = {t.canonical: t.symbol_yf for t in tgts}
    assert by_name == {"FOREIGN": "7203.T", "MSFT": "MSFT", "UNKNOWN": None}


# ── symbol resolution ──────────────────────────────────────────────────────────

def test_resolve_symbol_uses_canonical_when_matching_or_null():
    assert p3.resolve_symbol(p3.Target("MSFT", "MSFT", "missing")) == ("MSFT", False)
    assert p3.resolve_symbol(p3.Target("MSFT", None, "missing")) == ("MSFT", False)
    assert p3.resolve_symbol(p3.Target("MSFT", "", "missing")) == ("MSFT", False)


def test_resolve_symbol_flags_mismatch():
    sym, mismatch = p3.resolve_symbol(p3.Target("FOREIGN", "7203.T", "missing"))
    assert sym is None and mismatch is True


# ── checkpoint ──────────────────────────────────────────────────────────────────

def test_checkpoint_roundtrip_and_reset(tmp_path: Path):
    cp = tmp_path / "cp.json"
    assert p3.load_checkpoint(cp) == {"done": [], "failed": {}}
    p3.save_checkpoint(cp, {"done": ["AAPL"], "failed": {"X": "boom"}})
    loaded = p3.load_checkpoint(cp)
    assert loaded["done"] == ["AAPL"] and loaded["failed"] == {"X": "boom"}
    p3.reset_checkpoint(cp)
    assert not cp.exists()


def test_load_checkpoint_corrupt_starts_fresh(tmp_path: Path):
    cp = tmp_path / "cp.json"
    cp.write_text("{not valid json", encoding="utf-8")
    assert p3.load_checkpoint(cp) == {"done": [], "failed": {}}


# ── sweep loop (stubbed update_ticker) ──────────────────────────────────────────

class _StubDB:
    """Stand-in for FinancialDB: counts update_ticker calls, no network."""

    def __init__(self, db_path: str, added_by: dict[str, int] | None = None,
                 raise_on: set[str] | None = None):
        self.db_path = db_path
        self.calls: list[str] = []
        self._added_by = added_by or {}
        self._raise_on = raise_on or set()

    def update_ticker(self, ticker: str, verbose: bool = True,
                      fill_gaps: bool = False) -> int:
        self.calls.append(ticker)
        if ticker in self._raise_on:
            raise RuntimeError("rate limited")
        return self._added_by.get(ticker, 0)


def test_run_backfill_attempts_targets_and_skips_mismatch(db_path, tmp_path):
    cp = tmp_path / "cp.json"
    captured: list[_StubDB] = []

    def factory(path: str) -> _StubDB:
        stub = _StubDB(path, added_by={"MSFT": 3})
        captured.append(stub)
        return stub

    stats = p3.run_backfill(
        db_path, missing=True, frozen=False, sleep=0.0,
        checkpoint_path=cp, db_factory=factory)

    # MSFT attempted (fetched), FOREIGN skipped as a symbol mismatch.
    assert captured[0].calls == ["MSFT"]
    assert stats.attempted == 2
    assert stats.added_years == 3
    assert stats.skipped_mismatch == 1
    assert stats.failed == 0
    cp_data = json.loads(cp.read_text())
    assert cp_data["done"] == ["MSFT"]
    assert "FOREIGN" in cp_data["failed"]


def test_run_backfill_skips_done_on_rerun(db_path, tmp_path):
    cp = tmp_path / "cp.json"
    p3.save_checkpoint(cp, {"done": ["MSFT"], "failed": {}})
    captured: list[_StubDB] = []

    def factory(path: str) -> _StubDB:
        stub = _StubDB(path)
        captured.append(stub)
        return stub

    stats = p3.run_backfill(
        db_path, missing=True, frozen=False, sleep=0.0,
        checkpoint_path=cp, db_factory=factory)

    # MSFT already done -> not re-fetched; only FOREIGN (skipped) remains.
    assert captured[0].calls == []
    assert stats.attempted == 1
    assert stats.skipped_mismatch == 1


def test_run_backfill_limit_caps_targets(db_path, tmp_path):
    cp = tmp_path / "cp.json"

    def factory(path: str) -> _StubDB:
        return _StubDB(path)

    stats = p3.run_backfill(
        db_path, missing=True, frozen=True, max_year=2024, limit=1,
        sleep=0.0, checkpoint_path=cp, db_factory=factory)
    assert stats.attempted == 1


def test_run_backfill_counts_failures(db_path, tmp_path):
    cp = tmp_path / "cp.json"

    def factory(path: str) -> _StubDB:
        return _StubDB(path, raise_on={"STALE", "OLD"})

    stats = p3.run_backfill(
        db_path, missing=False, frozen=True, max_year=2024,
        sleep=0.0, checkpoint_path=cp, db_factory=factory)
    assert stats.failed == 2
    cp_data = json.loads(cp.read_text())
    assert set(cp_data["failed"]) == {"STALE", "OLD"}
    assert cp_data["done"] == []


def test_run_backfill_writes_job_marker(db_path, tmp_path):
    cp = tmp_path / "cp.json"
    p3.run_backfill(db_path, missing=True, sleep=0.0, checkpoint_path=cp,
                    db_factory=lambda path: _StubDB(path))
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT job FROM job_runs WHERE job = ?", [p3.JOB_NAME]).fetchall()
    assert rows == [(p3.JOB_NAME,)]


def test_run_backfill_reset_clears_checkpoint(db_path, tmp_path):
    cp = tmp_path / "cp.json"
    p3.save_checkpoint(cp, {"done": ["MSFT"], "failed": {}})
    stats = p3.run_backfill(
        db_path, missing=True, sleep=0.0, reset=True, checkpoint_path=cp,
        db_factory=lambda path: _StubDB(path, added_by={"MSFT": 1}))
    # After reset MSFT is attempted again.
    assert stats.attempted == 2
    assert stats.added_years == 1
