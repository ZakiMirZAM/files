"""Tests for the Learn flashcard importer (backend/learn_import.py) and its route.

Builds tiny .apkg and .xlsx fixtures in memory; network-free.
Run:  cd backend && python -m pytest test_learn_import.py -q
"""

import io
import os
import sqlite3
import sys
import tempfile
import time
import zipfile

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import learn_import as li  # noqa: E402


def _anki_db(notes: list[tuple[str, str]]) -> bytes:
    """A minimal Anki collection: just the notes table the importer reads."""
    fd, path = tempfile.mkstemp(suffix=".anki2")
    os.close(fd)
    try:
        conn = sqlite3.connect(path)
        conn.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, flds TEXT, tags TEXT)")
        for i, (flds, tags) in enumerate(notes, start=1):
            conn.execute("INSERT INTO notes VALUES (?, ?, ?)", (i, flds, tags))
        conn.commit()
        conn.close()
        with open(path, "rb") as fh:
            return fh.read()
    finally:
        os.remove(path)


def _apkg(notes, name="collection.anki2", extra: dict[str, bytes] | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(name, _anki_db(notes))
        zf.writestr("media", "{}")
        for k, v in (extra or {}).items():
            zf.writestr(k, v)
    return buf.getvalue()


def _xlsx(rows) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── html_to_text ─────────────────────────────────────────────────────────────

def test_html_to_text_lists_breaks_entities():
    s = '<ul><li style="x">One &amp; two</li><li>It&#x27;s</li></ul>a<br>b<img src="x.png">[sound:a.mp3]'
    assert li.html_to_text(s) == "• One & two\n• It's\na\nb"


# ── .apkg ────────────────────────────────────────────────────────────────────

def test_apkg_basic_fields_and_tags():
    data = _apkg([
        ("What is ROIC?\x1fReturn on <b>invested</b> capital", " metrics core "),
        ("Front only\x1f", ""),
        ("\x1f", ""),  # empty note dropped
    ])
    cards = li.parse_upload("deck.apkg", data)
    assert cards == [
        {"front": "What is ROIC?", "back": "Return on invested capital", "tags": ["metrics", "core"]},
        {"front": "Front only", "back": "", "tags": []},
    ]


def test_apkg_prefers_anki21_and_handles_cloze():
    data = _apkg(
        [("The {{c1::WACC}} is the {{c2::hurdle::rate}}\x1fExtra note", "")],
        name="collection.anki21",
        extra={"collection.anki2": _anki_db([("stub\x1fstub", "")])},
    )
    cards = li.parse_upload("deck.apkg", data)
    assert cards == [{
        "front": "The [...] is the [rate]",
        "back": "The WACC is the hurdle\nExtra note",
        "tags": [],
    }]


def test_apkg_new_format_without_zstd_gives_clear_message(monkeypatch):
    data = _apkg([("Please update\x1f", "")], extra={"collection.anki21b": b"\x28\xb5\x2f\xfd"})
    monkeypatch.setitem(sys.modules, "zstandard", None)  # force ImportError
    with pytest.raises(li.ImportError_, match="Support older Anki versions"):
        li.parse_upload("deck.apkg", data)


def test_apkg_rejects_non_zip_and_missing_collection():
    with pytest.raises(li.ImportError_):
        li.parse_upload("deck.apkg", b"not a zip")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("media", "{}")
    with pytest.raises(li.ImportError_, match="No Anki collection"):
        li.parse_upload("deck.apkg", buf.getvalue())


def test_apkg_rejects_zip_bomb(monkeypatch):
    monkeypatch.setattr(li, "MAX_UNZIPPED", 10)
    with pytest.raises(li.ImportError_, match="expands"):
        li.parse_upload("deck.apkg", _apkg([("a\x1fb", "")]))


def test_apkg_2000_notes():
    notes = [(f"Q{i}\x1fA{i}", "") for i in range(2000)]
    cards = li.parse_upload("big.apkg", _apkg(notes))
    assert len(cards) == 2000
    assert cards[1999] == {"front": "Q1999", "back": "A1999", "tags": []}


# ── .xlsx ────────────────────────────────────────────────────────────────────

def test_xlsx_with_header_and_tags():
    data = _xlsx([["Tags", "Question", "Answer"], ["a b", "Q1", "A1"], [None, "Q2", 42.0], [None, None, None]])
    assert li.parse_upload("cards.xlsx", data) == [
        {"front": "Q1", "back": "A1", "tags": ["a", "b"]},
        {"front": "Q2", "back": "42", "tags": []},
    ]


def test_xlsx_without_header_uses_first_two_columns():
    data = _xlsx([["Q1", "<b>A1</b>"], ["Q2", "A2"]])
    assert li.parse_upload("cards.xlsx", data) == [
        {"front": "Q1", "back": "A1", "tags": []},
        {"front": "Q2", "back": "A2", "tags": []},
    ]


def test_bad_xlsx_and_unknown_type():
    with pytest.raises(li.ImportError_):
        li.parse_upload("cards.xlsx", _apkg([("a\x1fb", "")]))
    with pytest.raises(li.ImportError_, match="Upload an"):
        li.parse_upload("cards.csv", b"a,b")
    with pytest.raises(li.ImportError_, match="empty"):
        li.parse_upload("cards.xlsx", b"")


# ── Denial-of-service guards ─────────────────────────────────────────────────

def _xlsx_dimension_bomb() -> bytes:
    """4.8 KB sheet whose <dimension> claims 16,384 columns down to row 200,000."""
    import re

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws["A1"] = "front"
    ws["B1"] = "back"
    ws.cell(row=200000, column=1, value="x")
    buf = io.BytesIO()
    wb.save(buf)
    zin = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            b = zin.read(info.filename)
            if info.filename == "xl/worksheets/sheet1.xml":
                b = re.sub(rb'<dimension ref="[^"]*"/>', b'<dimension ref="A1:XFD200000"/>', b)
            zout.writestr(info, b)
    return out.getvalue()


def _apkg_endless_view() -> bytes:
    """notes is a VIEW over a recursive CTE that never ends."""
    fd, path = tempfile.mkstemp(suffix=".anki2")
    os.close(fd)
    try:
        conn = sqlite3.connect(path)
        conn.execute(
            "CREATE VIEW notes AS WITH RECURSIVE r(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM r) "
            "SELECT 'a' AS flds, '' AS tags, x AS id FROM r"
        )
        conn.commit()
        conn.close()
        with open(path, "rb") as fh:
            blob = fh.read()
    finally:
        os.remove(path)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("collection.anki2", blob)
    return buf.getvalue()


def test_xlsx_dimension_bomb_is_fast():
    data = _xlsx_dimension_bomb()
    assert len(data) < 10_000
    t = time.monotonic()
    cards = li.parse_upload("bomb.xlsx", data)
    assert time.monotonic() - t < 10
    # The header row is found, the lone cell 200,000 rows down is past the gap.
    assert cards == []


def test_xlsx_gap_and_scan_limits(monkeypatch):
    monkeypatch.setattr(li, "XLSX_MAX_EMPTY_RUN", 3)
    data = _xlsx([["Q1", "A1"], [None], [None], ["Q2", "A2"], [None], [None], [None], ["Q3", "A3"]])
    assert [c["front"] for c in li.parse_upload("g.xlsx", data)] == ["Q1", "Q2"]


def test_apkg_view_is_refused_fast():
    t = time.monotonic()
    with pytest.raises(li.ImportError_, match="could not be read"):
        li.parse_upload("view.apkg", _apkg_endless_view())
    assert time.monotonic() - t < 10


def test_apkg_query_budget_aborts(monkeypatch):
    monkeypatch.setattr(li, "SQLITE_PROGRESS_LIMIT", 1)
    monkeypatch.setattr(li, "SQLITE_PROGRESS_STEP", 1)
    with pytest.raises(li.ImportError_, match="too long"):
        li.parse_upload("big.apkg", _apkg([(f"Q{i}\x1fA{i}", "") for i in range(200)]))


def test_html_to_text_unclosed_script_is_linear():
    s = "<script x" * 400_000  # 3.6 MB, quadratic under the old regex
    t = time.monotonic()
    li.html_to_text(s)  # clipped to MAX_FIELD before any regex
    assert li._strip_script_style(s) == s  # nothing closes, nothing removed
    assert time.monotonic() - t < 2
    assert li.html_to_text("a<script>x</script>b<STYLE>y</style >c<script>z") == "abcz"


def _sleep_forever(conn, filename, data):  # child target for the timeout test
    time.sleep(600)


def test_isolated_parse_returns_cards_and_errors():
    assert li.parse_upload_isolated("deck.apkg", _apkg([("Q\x1fA", "")])) == [
        {"front": "Q", "back": "A", "tags": []}
    ]
    t = time.monotonic()
    with pytest.raises(li.ImportError_, match="could not be read"):
        li.parse_upload_isolated("view.apkg", _apkg_endless_view())
    assert time.monotonic() - t < 10


def test_isolated_parse_kills_on_timeout():
    t = time.monotonic()
    with pytest.raises(li.ImportError_, match="took too long"):
        li.parse_upload_isolated("x.apkg", b"x", timeout=3, _target=_sleep_forever)
    assert time.monotonic() - t < 10


# ── Route ────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    import api  # heavy import, done once
    api.limiter.enabled = False
    return TestClient(api.app)


def test_route_returns_cards(client):
    r = client.post("/api/learn/import", files={"file": ("deck.apkg", _apkg([("Q\x1fA", "t")]), "application/octet-stream")})
    assert r.status_code == 200, r.text
    assert r.json() == {"cards": [{"front": "Q", "back": "A", "tags": ["t"]}]}


def test_route_errors(client):
    r = client.post("/api/learn/import", files={"file": ("deck.apkg", b"junk", "application/octet-stream")})
    assert r.status_code == 422
    r = client.post("/api/learn/import", files={"file": ("big.xlsx", b"x" * (25 * 1024 * 1024 + 1), "application/octet-stream")})
    assert r.status_code == 413
    r = client.post("/api/learn/import", data={"nothing": "here"})
    assert r.status_code == 400


def test_route_rejects_malicious_files_quickly(client):
    for name, data in (("bomb.xlsx", _xlsx_dimension_bomb()), ("view.apkg", _apkg_endless_view())):
        t = time.monotonic()
        r = client.post("/api/learn/import", files={"file": (name, data, "application/octet-stream")})
        assert time.monotonic() - t < 10, name
        assert r.status_code in (200, 422), (name, r.text)
        if r.status_code == 200:
            assert r.json() == {"cards": []}
