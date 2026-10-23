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


# -- prompt v2 + per-group fields (B1) ----------------------------------------

from relationship_map import suggest, value_chain  # noqa: E402
from relationship_map.prompt import (  # noqa: E402
    GROUP_FIELDS, PROMPT_VERSION, build_suggest_question,
)

_ALL_FIELDS = {f for fs in GROUP_FIELDS.values() for f in fs}


def test_question_v2_names_every_group_field():
    q = build_question("Acme", "ACME")
    rules = q.split("JSON shape:")[0]
    for f in _ALL_FIELDS:
        assert f'"{f}":str|null' in q and f in rules
    assert "Write switching cost as what the customer would lose by switching" in q
    assert "—" not in q and PROMPT_VERSION == 2


def test_v2_fields_kept_per_group_and_dropped_elsewhere():
    extra = {f: f"{f} text" for f in _ALL_FIELDS}
    extra["unknownKey"] = "x"
    out = parse.validate_map({"groups": {g: [{"category": "c", "links": [_link(**extra)]}]
                                         for g in GROUP_FIELDS}})
    for g, fields in GROUP_FIELDS.items():
        link = out["groups"][g]["categories"][0]["links"][0]
        assert all(link[f] == f"{f} text" for f in fields)
        # A field of another group survives only when it is also this group's own.
        assert not ((_ALL_FIELDS - set(fields)) & set(link))
        assert "unknownKey" not in link
    comp = out["groups"]["competitors"]["categories"][0]["links"][0]
    assert "switchingCost" not in comp and "shareOfRevenue" not in comp


def test_v2_fields_are_cleaned_truncated_or_null():
    out = parse.validate_map({"groups": {"competitors": [{"category": "c", "links": [
        _link(strategy=["brand", "<b>price</b>", 3], reportedAs="x" * 500)]}],
        "suppliers": [{"category": "c", "links": [_link(shareOfCosts=7)]}]}})
    comp = out["groups"]["competitors"]["categories"][0]["links"][0]
    assert comp["strategy"] == "brand; price" and len(comp["reportedAs"]) == 200
    sup = out["groups"]["suppliers"]["categories"][0]["links"][0]
    assert sup["shareOfCosts"] is None and sup["alternatives"] is None


def test_suggest_question_inserts_untrusted_name_last():
    q = build_suggest_question("Evil {name}\x00 Co", "suppliers", "Acme")
    assert q.startswith("Check whether Evil {name}  Co belongs in the suppliers group of Acme's")
    assert "shareOfSupplierRevenue" in q and "Suppliers include labor" in q
    assert "{group}" not in q and "{rule}" not in q and "{shape}" not in q


# -- rebuild rules (B2) -------------------------------------------------------

def _ready(built, **payload):
    return {"status": "ready", "built_at": built, "started_at": None, "error": None,
            "payload": json.dumps({"builtAt": built, "groups": {}, **payload})}


def test_decide_build_early_rebuild_cases():
    fresh = store.iso(NOW - dt.timedelta(hours=2))
    v1 = _ready(fresh)                                           # no promptVersion = 1
    assert store.decide_build(NOW, v1, True, 2025, 2) is True
    assert store.decide_build(NOW, v1, False, 2025, 2) is False  # refresh still required
    assert store.decide_build(NOW, v1, True, 2025, 1) is False
    v2 = _ready(fresh, promptVersion=2, latestFilingYear=2024)
    assert store.decide_build(NOW, v2, True, 2024, 2) is False
    assert store.decide_build(NOW, v2, True, 2025, 2) is True    # new annual filing
    assert store.decide_build(NOW, v2, True, None, 2) is False
    assert store.decide_build(NOW, _ready(fresh, promptVersion=2), True, 2030, 2) is False


def test_rebuild_reason():
    v = store.view(_ready("2026-10-22T10:00:00Z"), NOW)
    assert store.rebuild_reason(v, 2025, 2) == "new prompt"
    v = store.view(_ready("2026-10-22T10:00:00Z", promptVersion=2, latestFilingYear=2024), NOW)
    assert store.rebuild_reason(v, 2025, 2) == "new annual filing"
    assert store.rebuild_reason(v, 2024, 2) is None
    assert store.rebuild_reason({"status": "building"}, 2025, 2) is None


def test_build_payload_records_prompt_version_and_filing_year(monkeypatch):
    conn = _fixture_conn()
    fixture_db.insert_row(conn, "BASE", 2025)
    monkeypatch.setattr("company_profile.common.industry_peer_set", lambda c, ind: None)

    @contextmanager
    def factory():
        yield conn

    store.mark_building("BASE", NOW)
    build.run_build("BASE", "Base Co", None, None, conn_factory=factory, resolve=str.upper,
                    ask=lambda *a: {"answer": _answer({"competitors": [
                        {"category": "c", "links": [_link()]}]})}, now_fn=lambda: NOW)
    v = store.view(store.get_row("BASE"), NOW)
    assert v["promptVersion"] == 2 and v["latestFilingYear"] == 2025


# -- map rivals (B4) ----------------------------------------------------------

def test_map_rivals_order_dedupe_base_excluded_cap_8():
    links = [{"resolvedTicker": t, "inDatabase": t != "OUT"} for t in
             ["R1", "BASE", "R2", "R1", "OUT", "R3", "R4", "R5", "R6", "R7", "R8", "R9"]]
    v = {"groups": {"competitors": {"categories": [
        {"category": "a", "links": links[:4]}, {"category": "b", "links": links[4:]}]}}}
    assert store.map_rivals(v, "base") == ("R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8")
    assert store.map_rivals(None, "BASE") == ()
    assert store.map_rivals({"groups": {}}, "BASE") == ()


# -- value chain (B3) ---------------------------------------------------------

def _vc_ins(conn, tk, yr, **over):
    """fixture_db.insert_row with named columns, so the extra
    "Operating Income Ratio" column the warehouse has is filled too."""
    row = fixture_db.default_row(tk, yr, **over)
    row.setdefault("Operating Income Ratio", 0.12)
    cols = ", ".join(f'"{c}"' for c in row)
    conn.execute(f"INSERT INTO financials ({cols}) VALUES ({','.join('?' for _ in row)})",
                 list(row.values()))


def _vc_conn():
    conn = sqlite3.connect(":memory:")
    fixture_db.create_schema(conn)
    conn.execute('ALTER TABLE financials ADD COLUMN "Operating Income Ratio" REAL')
    rows = {  # ticker: {year: (gross, operating)}
        "BASE": {2025: (0.6, 0.3), 2020: (0.55, 0.25)},
        "SUP": {2024: (0.2, 0.1), 2019: (0.25, 0.12)},   # its own fiscal years
        "CUS": {2025: (0.3, 0.05)},                       # no row five years back
        "S1": {2025: (0.5, 0.2)}, "S2": {2025: (0.5, 0.4)}, "S3": {2025: (0.5, 0.1)},
    }
    for tk, years in rows.items():
        fixture_db.add_ticker(conn, tk, tk + " Co", "X", "Y")
        for yr, (g, o) in years.items():
            _vc_ins(conn, tk, yr, gpr=g, **{"Operating Income Ratio": o})
    conn.commit()
    return conn


def _L(name, tk, db=True):
    return {"name": name, "resolvedTicker": tk, "inDatabase": db}


def _vc_map():
    return {"status": "ready", "name": "Base Co", "groups": {
        "suppliers": {"categories": [{"category": "Cans", "links": [
            _L("Sup", "SUP"), _L("Private", None, False), _L("Sup again", "SUP")]}]},
        "customers": {"categories": [{"category": "Shops", "links": [
            _L("Cus", "CUS"), _L("Base itself", "BASE")]}]},
        "substitutes": {"categories": [
            {"category": "Coffee", "links": [_L("S1", "S1"), _L("S2", "S2"), _L("S3", "S3")]},
            {"category": "Water", "links": [_L("S1 again", "S1"), _L("Gone", "NOPE")]},
            {"category": "Tea", "links": [_L("Private tea", None, False)]}]},
    }}


def test_value_chain_shape_and_own_fiscal_years():
    out = value_chain.build_value_chain(_vc_conn(), "base", _vc_map())
    assert out["applicable"] is True and out["years"] == [2025, 2020]
    assert out["note"] == value_chain.NOTE
    assert [r["side"] for r in out["rows"]] == ["company", "supplier", "customer"]
    rows = {r["ticker"]: r for r in out["rows"]}
    assert rows["BASE"]["name"] == "Base Co" and rows["BASE"]["category"] is None
    assert rows["BASE"]["grossMargin"] == [0.6, 0.55]
    assert rows["BASE"]["operatingMargin"] == [0.3, 0.25]
    assert rows["SUP"]["years"] == [2024, 2019] and rows["SUP"]["grossMargin"] == [0.2, 0.25]
    assert rows["SUP"]["category"] == "Cans"
    assert rows["CUS"]["operatingMargin"] == [0.05, None]
    assert rows["CUS"]["daysReceivable"] == [35.0, None] and rows["CUS"]["daysPayable"][0] == 40.0


def test_value_chain_substitute_median_rules():
    subs = {s["category"]: s for s in
            value_chain.build_value_chain(_vc_conn(), "BASE", _vc_map())["substitutes"]}
    assert subs["Coffee"]["medianOperatingMargin"] == 0.2   # true median of 0.2, 0.4, 0.1
    assert [e["ticker"] for e in subs["Coffee"]["examples"]] == ["S1", "S2", "S3"]
    assert subs["Water"]["medianOperatingMargin"] is None   # one value and one missing
    assert subs["Water"]["examples"][1]["operatingMargin"] is None
    assert "Tea" not in subs                                # no in-database example
    assert value_chain.median_or_none([0.1, 0.3]) == 0.2
    assert value_chain.median_or_none([0.1, None]) is None


def test_value_chain_caps_each_side_at_six():
    conn = _vc_conn()
    links = []
    for i in range(8):
        fixture_db.add_ticker(conn, f"X{i}", f"X{i}", "X", "Y")
        _vc_ins(conn, f"X{i}", 2025)
        links.append(_L(f"X{i}", f"X{i}"))
    v = {"status": "ready", "groups": {"suppliers": {"categories": [
        {"category": "a", "links": links[:4]}, {"category": "b", "links": links[4:]}]}}}
    out = value_chain.build_value_chain(conn, "BASE", v)
    assert [r["ticker"] for r in out["rows"] if r["side"] == "supplier"] == [
        f"X{i}" for i in range(6)]


def test_value_chain_without_a_map():
    assert value_chain.build_value_chain(_vc_conn(), "BASE", None) == {
        "applicable": False, "reason": "Build the relationship map first."}
    assert value_chain.build_value_chain(
        _vc_conn(), "BASE", {"status": "building"})["applicable"] is False


# -- suggestions (B5) ---------------------------------------------------------

def _ready_map(ticker="BASE", **groups):
    store.mark_building(ticker, NOW)
    store.mark_ready(ticker, {
        "ticker": ticker, "name": "Base Co", "builtAt": "2026-10-22T12:00:00Z",
        "linkCount": 1,
        "groups": groups or {"competitors": {"suggestion": False, "categories": [
            {"category": "Chips", "links": [
                dict(_link("Rival Co"), resolvedTicker="RIV", inDatabase=True)]}]}},
    }, NOW)


def _suggest_answer(link, category="Chips", reason="It sells the same chips."):
    return {"answer": "```json\n" + json.dumps(
        {"link": link, "category": category, "reason": reason}) + "\n```"}


def _check(ask, group="competitors", name="New Co"):
    conn = _fixture_conn()

    @contextmanager
    def factory():
        yield conn
    return suggest.check("BASE", "Base Co", group, name, conn_factory=factory,
                         resolve=str.upper, ask=ask, now_fn=lambda: NOW)


def test_suggest_added_appends_to_existing_category():
    _ready_map()
    calls = []

    def ask(q, c, d):
        calls.append(q)
        return _suggest_answer(_link("New Co", ticker="riv", strategy="price"), "chips")
    status, result = _check(ask)
    assert status == "added" and result["category"] == "Chips"
    assert result["link"]["addedOnRequest"] is True and result["link"]["inDatabase"] is True
    assert result["link"]["strategy"] == "price"
    v = store.view(store.get_row("BASE"), NOW)
    names = [lk["name"] for lk in v["groups"]["competitors"]["categories"][0]["links"]]
    assert names == ["Rival Co", "New Co"] and v["linkCount"] == 2
    assert v["builtAt"] == "2026-10-22T12:00:00Z" and v["updatedAt"] == store.iso(NOW)
    assert store.get_row("BASE")["built_at"] == store.iso(NOW)  # mark_ready's own time
    assert calls[0].startswith("Check whether New Co belongs in the competitors group")


def test_suggest_new_category_and_new_group():
    _ready_map()
    status, result = _check(lambda *a: _suggest_answer(_link("Cup Co"), "Cups"),
                            group="suppliers")
    assert status == "added" and result["category"] == "Cups"
    g = store.view(store.get_row("BASE"), NOW)["groups"]["suppliers"]
    assert g["suggestion"] is False and g["categories"][0]["links"][0]["name"] == "Cup Co"


def test_suggest_not_added_leaves_the_map_alone():
    _ready_map()
    before = store.get_row("BASE")["payload"]
    status, result = _check(lambda *a: _suggest_answer(None, None, "It makes cars."))
    assert (status, result) == ("not-added", {"reason": "It makes cars.", "name": "New Co",
                                              "group": "competitors"})
    status, result = _check(lambda *a: _suggest_answer(_link("New Co", source=None)))
    assert status == "not-added" and result["reason"] == suggest.NO_SOURCE
    status, _r = _check(lambda *a: {"answer": "no json"})
    assert status == "failed"
    assert store.get_row("BASE")["payload"] == before


def test_suggest_full_category_goes_to_request_category_then_full():
    full = [_link(f"L{i}") for i in range(4)]
    _ready_map(competitors={"suggestion": False, "categories": [
        {"category": "Chips", "links": full}]})
    status, result = _check(lambda *a: _suggest_answer(_link("New Co"), "Chips"))
    assert status == "added" and result["category"] == suggest.REQUEST_CATEGORY
    payload = {"groups": {"competitors": {"categories": [
        {"category": f"C{i}", "links": list(full)} for i in range(7)]
        + [{"category": suggest.REQUEST_CATEGORY, "links": list(full)}]}}}
    assert suggest.add_link(payload, "competitors", _link("X"), "C1") is None
    assert suggest.add_link(payload, "competitors", _link("X"), "Brand new") is None


def test_suggest_duplicate_is_added_at_once_without_ai():
    _ready_map()

    def no_ai(*a):
        raise AssertionError("AI must not be called")
    out = suggest.start_check("BASE", "Base Co", "competitors", "  rival co\x07 ",
                              conn_factory=None, resolve=str.upper, ask=no_ai,
                              now_fn=lambda: NOW)
    assert out["status"] == "added" and out["link"]["name"] == "Rival Co"
    assert out["category"] == "Chips"
    assert store.suggestion_view(store.get_suggestion(out["id"]), NOW)["status"] == "added"
    assert not suggest.is_busy()


def test_suggest_needs_a_ready_map_and_respects_cap_and_lock(monkeypatch):
    kw = dict(conn_factory=None, resolve=str.upper, ask=lambda *a: {}, now_fn=lambda: NOW)
    assert suggest.start_check("BASE", "Base Co", "competitors", "X", **kw)["status"] == "none"
    _ready_map()
    monkeypatch.setattr(build, "MAX_BUILDS_PER_DAY", 0)
    monkeypatch.setattr(build, "_BUILDS_TODAY", {})
    assert suggest.start_check("BASE", "Base Co", "competitors", "X", **kw) == {"status": "busy"}
    assert not suggest.is_busy()
    monkeypatch.setattr(build, "MAX_BUILDS_PER_DAY", 5)
    release, done = threading.Event(), threading.Event()

    def slow_check(*a, **k):
        release.wait(5)
        return "not-added", {"reason": "no", "name": "X", "group": "competitors"}

    monkeypatch.setattr(suggest, "check", slow_check)
    real_finish = store.finish_suggestion

    def finish(*a):
        real_finish(*a)
        done.set()
    monkeypatch.setattr(store, "finish_suggestion", finish)
    first = suggest.start_check("BASE", "Base Co", "competitors", "X", **kw)
    assert first["status"] == "checking" and len(first["id"]) == 32
    assert suggest.start_check("BASE", "Base Co", "competitors", "Y", **kw) == {"status": "busy"}
    assert store.suggestion_view(store.get_suggestion(first["id"]), NOW) == {"status": "checking"}
    release.set()
    assert done.wait(5)
    for _ in range(50):
        if not suggest.is_busy():
            break
        threading.Event().wait(0.02)
    assert not suggest.is_busy()
    assert store.suggestion_view(store.get_suggestion(first["id"]), NOW) == {
        "status": "not-added", "reason": "no", "name": "X", "group": "competitors"}
    assert build._BUILDS_TODAY[NOW.date().isoformat()] == 1


def test_stale_checking_row_reads_as_failed():
    sid = store.create_suggestion("BASE", "competitors", "X", NOW)
    row = store.get_suggestion(sid)
    assert store.suggestion_view(row, NOW + dt.timedelta(minutes=14)) == {"status": "checking"}
    assert store.suggestion_view(row, NOW + dt.timedelta(minutes=16)) == {
        "status": "failed", "error": store.SUGGEST_STALE_ERROR}
    assert store.suggestion_view(None, NOW) is None


# -- suggest route validation (rejected before any AI or DB work) -------------

@pytest.mark.parametrize("body", [
    {"name": "x" * 121, "group": "competitors"},
    {"name": "Co", "group": "rivals"},
    {"name": "", "group": "competitors"},
    {"name": "Co", "group": "competitors", "extra": 1},
    {"name": 5, "group": "competitors"},
    {"name": "\x00\x01", "group": "competitors"},
])
def test_suggest_route_rejects_bad_bodies(body):
    from fastapi.testclient import TestClient
    import api
    r = TestClient(api.app).post("/api/individual/KO/relationship-map/suggest", json=body)
    assert r.status_code == 422


def test_zero_days_read_as_missing():
    from relationship_map import value_chain
    c = sqlite3.connect(":memory:")
    c.execute('CREATE TABLE financials (Ticker TEXT, "Calendar Year" TEXT, "Gross Profit Ratio" REAL,'
              ' "Operating Income Ratio" REAL, "Days Sales Outstanding" REAL, "Days Payables Outstanding" REAL)')
    c.execute("INSERT INTO financials VALUES ('ZZ','2025',0.4,0.1,0,35.5)")
    c.execute("INSERT INTO financials VALUES ('ZZ','2020',0.3,0.1,20.0,0)")
    out = value_chain.firm_figures(c, "ZZ")
    assert out["years"] == [2025, 2020]
    assert out["daysReceivable"] == [None, 20.0]
    assert out["daysPayable"] == [35.5, None]
    assert out["grossMargin"] == [0.4, 0.3]
