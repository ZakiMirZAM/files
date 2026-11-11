"""Tests for the local book list (local_books.py and GET /api/learn/local-books)."""
from __future__ import annotations

import pytest

import local_books


@pytest.fixture
def shelf(tmp_path):
    (tmp_path / "Good Strategy.pdf").write_bytes(b"%PDF-1.4 good")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "b.PDF").write_bytes(b"%PDF-1.4 b")
    (tmp_path / "notes.epub").write_bytes(b"epub")
    (tmp_path / ".claude-flow").mkdir()
    (tmp_path / ".claude-flow" / "hidden.pdf").write_bytes(b"%PDF")
    (tmp_path / "Receipts").mkdir()
    (tmp_path / "Receipts" / "r.pdf").write_bytes(b"%PDF")
    return tmp_path


def test_list_books_pdfs_only_sorted_no_tool_folders(shelf):
    books = local_books.list_books(shelf)
    assert [b["id"] for b in books] == ["sub/b.PDF", "Good Strategy.pdf"]
    assert books[1] == {"id": "Good Strategy.pdf", "name": "Good Strategy.pdf", "size": len(b"%PDF-1.4 good")}


def test_books_root_env_and_missing(shelf, monkeypatch):
    monkeypatch.setenv("LOCAL_BOOKS_DIR", str(shelf))
    assert local_books.books_root() == shelf.resolve()
    monkeypatch.setenv("LOCAL_BOOKS_DIR", str(shelf / "nope"))
    assert local_books.books_root() is None
    assert local_books.books_roots() == []


def test_default_folder_is_documents_books_books_first():
    assert local_books.DEFAULT_BOOKS_DIRS[0].parts[-3:] == ("Documents", "books", "books")


@pytest.fixture
def two(tmp_path, monkeypatch):
    main, extra = tmp_path / "main", tmp_path / "extra"
    (main / "sub").mkdir(parents=True)
    extra.mkdir()
    big = b"%PDF" + b"x" * 70_000
    (main / "CFA Volume 2.pdf").write_bytes(big)
    (main / "sub" / "Porter.pdf").write_bytes(b"%PDF porter")
    (extra / "CFA Volume 2 (2).pdf").write_bytes(b"%PDF copy")          # a " (2)" copy
    (extra / "Renamed copy.pdf").write_bytes(big)                       # same size = same file
    (extra / "porter.pdf").write_bytes(b"%PDF other")                   # same name, other case
    (extra / "Only Here.pdf").write_bytes(b"%PDF only")
    (extra / "Only Here (2).pdf").write_bytes(b"%PDF only 2")
    monkeypatch.setenv("LOCAL_BOOKS_DIR", f"{main}{local_books.os.pathsep}{extra}")
    return main.resolve(), extra.resolve()


def test_two_folders_one_entry_per_book(two):
    roots = local_books.books_roots()
    assert roots == list(two)
    assert [b["id"] for b in local_books.list_books(roots)] == ["CFA Volume 2.pdf", "@1/Only Here.pdf", "sub/Porter.pdf"]


def test_ids_from_either_folder_resolve_and_stay_inside(two):
    main, extra = two
    roots = local_books.books_roots()
    assert local_books.resolve_book(roots, "@1/Only Here.pdf") == extra / "Only Here.pdf"
    assert local_books.resolve_book(roots, "sub/Porter.pdf") == main / "sub" / "Porter.pdf"
    assert local_books.book_id(roots, extra / "Only Here.pdf") == "@1/Only Here.pdf"
    # A hidden copy still opens by its id (a saved test may point at it).
    assert local_books.resolve_book(roots, "@1/Renamed copy.pdf") == extra / "Renamed copy.pdf"
    for bad in ("@1/../main/CFA Volume 2.pdf", "@7/Only Here.pdf", "@1/C:/Windows/win.ini"):
        assert local_books.resolve_book(roots, bad) is None, bad


@pytest.fixture
def api_mod():
    import api  # heavy import, done once

    return api


def _client(api_mod, monkeypatch, production, base_url="http://localhost:8001"):
    from fastapi.testclient import TestClient

    monkeypatch.setattr(api_mod, "IS_PRODUCTION", production)
    return TestClient(api_mod.app, base_url=base_url)


@pytest.fixture
def on(shelf, monkeypatch):
    monkeypatch.setenv("LOCAL_BOOKS_DIR", str(shelf))
    monkeypatch.setenv("LOCAL_BOOKS", "1")


def test_route_lists_the_shelf_in_development(monkeypatch, api_mod, on):
    r = _client(api_mod, monkeypatch, False).get("/api/learn/local-books")
    assert r.status_code == 200
    assert [b["id"] for b in r.json()["books"]] == ["sub/b.PDF", "Good Strategy.pdf"]


def test_no_file_route():
    import api

    assert not any(getattr(r, "path", "") == "/api/learn/local-books/file" for r in api.app.routes)


def _404(client, **kw):
    assert client.get("/api/learn/local-books", **kw).status_code == 404


def test_route_is_off_in_production(monkeypatch, api_mod, on):
    _404(_client(api_mod, monkeypatch, True))


def test_route_is_off_without_the_opt_in(monkeypatch, api_mod, on):
    monkeypatch.delenv("LOCAL_BOOKS")
    _404(_client(api_mod, monkeypatch, False))


@pytest.mark.parametrize(
    "header",
    [{"X-Forwarded-For": "203.0.113.9"}, {"Cf-Connecting-Ip": "203.0.113.9"}, {"X-Real-IP": "203.0.113.9"}],
)
def test_route_refuses_requests_through_the_tunnel(monkeypatch, api_mod, on, header):
    _404(_client(api_mod, monkeypatch, False), headers=header)


@pytest.mark.parametrize("base_url", ["http://api.intrinsicfined.org", "http://evil.example:8001", "http://testserver"])
def test_route_refuses_a_non_local_host(monkeypatch, api_mod, on, base_url):
    _404(_client(api_mod, monkeypatch, False, base_url=base_url))
