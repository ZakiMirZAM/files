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
