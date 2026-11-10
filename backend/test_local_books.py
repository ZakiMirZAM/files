"""Tests for the local bookshelf (local_books.py and its two api.py routes)."""
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
    (tmp_path / "receipts").mkdir()
    (tmp_path / "receipts" / "r.pdf").write_bytes(b"%PDF")
    return tmp_path


def test_list_books_pdfs_only_sorted_no_tool_folders(shelf):
    books = local_books.list_books(shelf)
    assert [b["id"] for b in books] == ["sub/b.PDF", "Good Strategy.pdf"]
    assert books[1] == {"id": "Good Strategy.pdf", "name": "Good Strategy.pdf", "size": len(b"%PDF-1.4 good")}


def test_resolve_book_inside_root(shelf):
    assert local_books.resolve_book(shelf, "sub/b.PDF") == (shelf / "sub" / "b.PDF").resolve()


@pytest.mark.parametrize(
    "bad",
    ["", "../outside.pdf", "sub/../../outside.pdf", "notes.epub", "missing.pdf", ".claude-flow/hidden.pdf",
     "receipts/r.pdf", "C:/Windows/win.ini", "/etc/passwd", "a\x00.pdf"],
)
def test_resolve_book_refuses(shelf, tmp_path_factory, bad):
    outside = tmp_path_factory.mktemp("out") / "outside.pdf"
    outside.write_bytes(b"%PDF")
    assert local_books.resolve_book(shelf, bad) is None


def test_books_root_env_and_missing(shelf, monkeypatch):
    monkeypatch.setenv("LOCAL_BOOKS_DIR", str(shelf))
    assert local_books.books_root() == shelf.resolve()
    monkeypatch.setenv("LOCAL_BOOKS_DIR", str(shelf / "nope"))
    assert local_books.books_root() is None


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


def test_hidden_folder_check_ignores_case(shelf):
    assert local_books.resolve_book(shelf, "RECEIPTS/r.pdf") is None
    assert local_books.resolve_book(shelf, "Receipts/r.pdf") is None
    assert local_books.resolve_book(shelf, ".Claude-Flow/hidden.pdf") is None


def test_routes_serve_the_shelf_in_development(shelf, monkeypatch, api_mod, on):
    client = _client(api_mod, monkeypatch, False)
    r = client.get("/api/learn/local-books")
    assert r.status_code == 200
    assert [b["id"] for b in r.json()["books"]] == ["sub/b.PDF", "Good Strategy.pdf"]
    r = client.get("/api/learn/local-books/file", params={"id": "Good Strategy.pdf"})
    assert r.status_code == 200 and r.content == b"%PDF-1.4 good"
    assert r.headers["content-type"] == "application/pdf"
    r = client.get("/api/learn/local-books/file", params={"id": "Good Strategy.pdf"}, headers={"Range": "bytes=0-3"})
    assert r.status_code == 206 and r.content == b"%PDF"
    assert client.get("/api/learn/local-books/file", params={"id": "../x.pdf"}).status_code == 404


def _both_404(client, **kw):
    assert client.get("/api/learn/local-books", **kw).status_code == 404
    assert client.get("/api/learn/local-books/file", params={"id": "Good Strategy.pdf"}, **kw).status_code == 404


def test_routes_are_off_in_production(monkeypatch, api_mod, on):
    _both_404(_client(api_mod, monkeypatch, True))


def test_routes_are_off_without_the_opt_in(monkeypatch, api_mod, on):
    monkeypatch.delenv("LOCAL_BOOKS")
    _both_404(_client(api_mod, monkeypatch, False))


@pytest.mark.parametrize(
    "header",
    [{"X-Forwarded-For": "203.0.113.9"}, {"Cf-Connecting-Ip": "203.0.113.9"}, {"X-Real-IP": "203.0.113.9"}],
)
def test_routes_refuse_requests_through_the_tunnel(monkeypatch, api_mod, on, header):
    _both_404(_client(api_mod, monkeypatch, False), headers=header)


@pytest.mark.parametrize("base_url", ["http://api.intrinsicfined.org", "http://evil.example:8001", "http://testserver"])
def test_routes_refuse_a_non_local_host(monkeypatch, api_mod, on, base_url):
    _both_404(_client(api_mod, monkeypatch, False, base_url=base_url))
