"""Tests for backend/relationship_map/. Network-free: the RAG call is faked."""

from __future__ import annotations

import datetime as dt
import json
import os
import sqlite3
import sys
import threading
from contextlib import contextmanager

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fixture_db  # noqa: E402
from relationship_map import build, parse, store  # noqa: E402
from relationship_map.prompt import build_question  # noqa: E402

NOW = dt.datetime(2026, 10, 22, 12, 0, tzinfo=dt.timezone.utc)


def _link(name="Rival Co", url="https://www.sec.gov/x", **over):
    link = {"name": name, "ticker": "RIV", "product": "Chips",
            "geography": "United States", "routeIn": None, "note": None,
            "source": {"title": "10-K", "url": url}}
    link.update(over)
    return link


def _answer(groups: dict) -> str:
    return ("Some prose.\n```json\n{\"groups\": {}}\n```\nFinal:\n```json\n"
            + json.dumps({"groups": groups}) + "\n```")


@pytest.fixture(autouse=True)
def _tmp_store(tmp_path, monkeypatch):
    monkeypatch.setenv("RELATIONSHIP_MAPS_DB", str(tmp_path / "maps.db"))


# ── prompt ──────────────────────────────────────────────────────────────────

def test_question_is_the_fixed_template_filled():
    q = build_question("Acme {Inc}", "ACME")
    assert q.startswith("Build the relationship map for Acme {Inc} (ACME).")
    assert "No source, no link." in q
    assert "Acme {Inc}'s product" in q
    assert "{name}" not in q and "{ticker}" not in q


# ── parse ───────────────────────────────────────────────────────────────────

def test_last_json_block_is_used():
    obj = parse.extract_last_json(_answer({"competitors": []}))
    assert obj == {"groups": {"competitors": []}}
    assert parse.extract_last_json("no block") is None
    assert parse.extract_last_json("```json\n[1,2]\n```") is None
    assert parse.extract_last_json("```json\n{bad\n```") is None


def test_good_map_keeps_links_and_marks_suggestions():
    out = parse.validate_map({"groups": {
        "competitors": [{"category": "Chip makers", "links": [_link()]}],
        "entrants": [{"category": "Cloud", "links": [_link("Cloud Co", routeIn="acquisition")]}],
        "bogus": [{"category": "x", "links": [_link()]}],
    }})
    assert set(out["groups"]) == {"competitors", "entrants"}
    assert out["groups"]["competitors"]["suggestion"] is False
    assert out["groups"]["entrants"]["suggestion"] is True
    link = out["groups"]["competitors"]["categories"][0]["links"][0]
    assert link["ticker"] == "RIV" and link["resolvedTicker"] is None
    assert link["inDatabase"] is False
    assert out["linkCount"] == 2 and out["droppedNoSource"] == 0


def test_missing_source_and_bad_url_are_dropped_and_counted():
    links = [
        _link("No source", source=None),
        _link("Bad scheme", url="javascript:alert(1)"),
        _link("No host", url="https://"),
        _link("Ftp", url="ftp://x.com/a"),
        _link("Ok", url="http://example.com/a"),
        {"name": "", "product": "x", "source": {"url": "https://a.com"}},  # no name: not counted
    ]
    out = parse.validate_map({"groups": {"suppliers": [{"category": "Fabs", "links": links}]}})
    kept = out["groups"]["suppliers"]["categories"][0]["links"]
    assert [lk["name"] for lk in kept] == ["Ok"]
    assert out["droppedNoSource"] == 4


def test_html_control_chars_and_em_dashes_are_stripped():
    out = parse.validate_map({"groups": {"customers": [{
        "category": "<b>Big</b> buyers\x07",
        "links": [_link("<script>x</script>Buyer—Inc", note="a <i>note</i>")],
    }]}})
    cat = out["groups"]["customers"]["categories"][0]
    assert cat["category"] == "Big buyers"
    link = cat["links"][0]
    assert "<" not in link["name"] and ">" not in link["name"]
    assert "—" not in link["name"] and link["name"].endswith("Buyer, Inc")
    assert link["note"] == "a note"


def test_caps_and_truncation():
    cats = [{"category": f"C{i}" + "x" * 100, "links": [_link(f"L{j}" + "n" * 200)
            for j in range(6)]} for i in range(10)]
    out = parse.validate_map({"groups": {"competitors": cats}})
    kept = out["groups"]["competitors"]["categories"]
    assert len(kept) == 8
    assert all(len(c["links"]) == 4 for c in kept)
    assert all(len(c["category"]) <= 80 for c in kept)
    assert all(len(lk["name"]) <= 120 for c in kept for lk in c["links"])
    assert out["linkCount"] == 32


@pytest.mark.parametrize("raw,want", [
    ("aapl", "AAPL"), ("BRK.B", "BRK.B"), ("6971.T", "6971.T"),
    ("NOT A TICKER", None), ("X" * 16, None), (None, None), (5, None), ("A$B", None),
])
def test_ticker_regex(raw, want):
    assert parse.clean_ticker(raw) == want


def test_all_dropped_map_has_no_links():
    out = parse.validate_map({"groups": {"competitors": [
        {"category": "x", "links": [_link(source={})]}]}})
    assert out["groups"] == {} and out["linkCount"] == 0 and out["droppedNoSource"] == 1


# ── store + status rules ────────────────────────────────────────────────────

def test_store_round_trip():
    assert store.view(store.get_row("AAA"), NOW) == {"status": "none"}
    store.mark_building("AAA", NOW)
    assert store.view(store.get_row("AAA"), NOW) == {
        "status": "building", "startedAt": "2026-10-22T12:00:00Z"}
    store.mark_ready("AAA", {"ticker": "AAA", "builtAt": "2026-10-22T12:05:00Z",
                             "groups": {}}, NOW)
    v = store.view(store.get_row("AAA"), NOW)
    assert v["status"] == "ready" and v["builtAt"] == "2026-10-22T12:05:00Z"
    assert store.get_row("AAA")["attempts"] == 1


def test_stale_building_reads_as_failed():
    store.mark_building("AAA", NOW)
    later = NOW + dt.timedelta(minutes=21)
    v = store.view(store.get_row("AAA"), later)
    assert v["status"] == "failed" and v["error"] == store.STALE_ERROR
    assert store.view(store.get_row("AAA"), NOW + dt.timedelta(minutes=19))["status"] == "building"


def test_failed_rebuild_keeps_the_previous_map():
    store.mark_building("AAA", NOW)
    store.mark_ready("AAA", {"builtAt": "2026-10-22T12:00:00Z", "groups": {}}, NOW)
    store.mark_building("AAA", NOW)
    store.mark_failed("AAA", "boom", NOW)
    assert store.view(store.get_row("AAA"), NOW)["status"] == "ready"
    store.mark_building("BBB", NOW)
    store.mark_failed("BBB", "no sourced links", NOW)
    assert store.view(store.get_row("BBB"), NOW) == {
        "status": "failed", "error": "no sourced links", "builtAt": "2026-10-22T12:00:00Z"}


def _row(status, built=None, started=None, payload=True):
    return {"status": status, "built_at": built, "started_at": started, "error": "e",
            "payload": json.dumps({"builtAt": built, "groups": {}}) if payload else None}


def test_decide_build():
    old = store.iso(NOW - dt.timedelta(hours=25))
    fresh = store.iso(NOW - dt.timedelta(hours=2))
    assert store.decide_build(NOW, None, False) is True
    assert store.decide_build(NOW, _row("failed", payload=False), False) is True
    assert store.decide_build(NOW, _row("ready", fresh), True) is False
    assert store.decide_build(NOW, _row("ready", old), False) is False
    assert store.decide_build(NOW, _row("ready", old), True) is True
    assert store.decide_build(NOW, _row("building", started=store.iso(NOW)), True) is False
    stale = store.iso(NOW - dt.timedelta(minutes=30))
    # A hung build reads as failed at its start time, so the failed-retry wait applies.
    assert store.decide_build(NOW, _row("building", started=stale, payload=False), False) is False
    hung = store.iso(NOW - dt.timedelta(minutes=61))
    assert store.decide_build(NOW, _row("building", started=hung, payload=False), False) is True


def test_failed_build_waits_an_hour_before_retrying():
    store.mark_building("FFF", NOW)
    store.mark_failed("FFF", "boom", NOW)
    row = store.get_row("FFF")
    assert store.decide_build(NOW + dt.timedelta(minutes=30), row, False) is False
    assert store.decide_build(NOW + dt.timedelta(minutes=61), row, False) is True


def test_daily_build_cap(monkeypatch):
    monkeypatch.setattr(build, "MAX_BUILDS_PER_DAY", 0)
    monkeypatch.setattr(build, "_BUILDS_TODAY", {})
    out = build.start_build("CAP", "Cap Co", None, None, refresh=False,
                            conn_factory=lambda: None, resolve=lambda t: t,
                            ask=lambda *a: {}, now_fn=lambda: NOW)
    assert out == "busy"
    assert not build.is_busy()  # the lock is released
    assert store.get_row("CAP") is None  # nothing marked building


# ── build (fake RAG) ────────────────────────────────────────────────────────

def _fixture_conn():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    fixture_db.create_schema(conn)
    fixture_db.add_ticker(conn, "BASE", "Base Co", "Technology", "Chips")
    fixture_db.add_ticker(conn, "RIV", "Rival Co", "Technology", "Software")
    fixture_db.add_ticker(conn, "NOFIN", "No Fin Co", "Technology", "Chips")
    fixture_db.insert_row(conn, "BASE", 2024)
    fixture_db.insert_row(conn, "RIV", 2024)
    conn.commit()
    return conn


def test_run_build_end_to_end_with_fake_ask(monkeypatch):
    conn = _fixture_conn()
    monkeypatch.setattr("company_profile.common.industry_peer_set", lambda c, ind: None)

    @contextmanager
    def factory():
        yield conn

    calls = []

    def fake_ask(question, context, data):
        calls.append((question, context, data))
        return {"answer": _answer({"competitors": [{"category": "Chips", "links": [
            _link("Rival Co", ticker="riv"), _link("No Fin", ticker="NOFIN"),
            _link("Private", ticker=None), _link("Unsourced", source=None)]}]}),
            "sources": ["vault/a.md", "vault/a.md", "<b>b</b>"]}

    store.mark_building("BASE", NOW)
    build.run_build("BASE", "Base Co", "Technology", "Chips", conn_factory=factory,
                    resolve=str.upper, ask=fake_ask, now_fn=lambda: NOW)
    assert calls[0][1] == "BASE Base Co" and "Industry: Chips" in calls[0][2]
    v = store.view(store.get_row("BASE"), NOW)
    assert v["status"] == "ready" and v["linkCount"] == 3 and v["droppedNoSource"] == 1
    links = {lk["name"]: lk for lk in v["groups"]["competitors"]["categories"][0]["links"]}
    assert links["Rival Co"]["resolvedTicker"] == "RIV" and links["Rival Co"]["inDatabase"]
    assert links["No Fin"]["inDatabase"] is False  # in tickers, no financials row
    assert links["Private"]["resolvedTicker"] is None
    assert v["sources"] == ["vault/a.md", "b"]
    assert store.ready_competitors("BASE") == ("2026-10-22T12:00:00Z", ("RIV",))


def test_run_build_fails_without_sourced_links_or_on_error(monkeypatch):
    conn = _fixture_conn()
    monkeypatch.setattr("company_profile.common.industry_peer_set", lambda c, ind: None)

    @contextmanager
    def factory():
        yield conn

    store.mark_building("BASE", NOW)
    build.run_build("BASE", "Base Co", None, None, conn_factory=factory, resolve=str.upper,
                    ask=lambda *a: {"answer": _answer({"competitors": [
                        {"category": "x", "links": [_link(source=None)]}]})},
                    now_fn=lambda: NOW)
    assert store.view(store.get_row("BASE"), NOW)["error"] == "no sourced links"

    def boom(*a):
        raise OSError("down")
    store.mark_building("BASE", NOW)
    build.run_build("BASE", "Base Co", None, None, conn_factory=factory, resolve=str.upper,
                    ask=boom, now_fn=lambda: NOW)
    assert store.view(store.get_row("BASE"), NOW)["status"] == "failed"


def test_start_build_is_one_at_a_time(monkeypatch):
    release = threading.Event()
    done = threading.Event()

    def slow_run(*a, **k):
        release.wait(5)
        done.set()

    monkeypatch.setattr(build, "run_build", slow_run)
    kw = dict(refresh=False, conn_factory=None, resolve=str.upper, now_fn=lambda: NOW)
    assert build.start_build("AAA", "A", None, None, **kw) == "started"
    assert build.is_busy()
    assert build.start_build("BBB", "B", None, None, **kw) == "busy"
    assert store.get_row("BBB") is None
    release.set()
    assert done.wait(5)
    for _ in range(50):
        if not build.is_busy():
            break
        threading.Event().wait(0.02)
    assert not build.is_busy()
    # AAA is "building" (fake run never finished it), so a second start skips.
    assert build.start_build("AAA", "A", None, None, **kw) == "skipped"
    assert not build.is_busy()
