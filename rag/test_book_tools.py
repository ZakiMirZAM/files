"""Tests for rag/book_tools.py: the local-only guard, the Books folder rules,
and the page text tools (on a small PDF built in the test)."""
from __future__ import annotations

import fitz
import pytest
from multidict import CIMultiDict

import book_tools


class _Req:
    def __init__(self, headers):
        # aiohttp request headers ignore case, like this CIMultiDict.
        self.headers = CIMultiDict(headers)


@pytest.fixture
def shelf(tmp_path, monkeypatch):
    doc = fitz.open()
    for i in range(1, 6):
        page = doc.new_page()
        page.insert_text((72, 72), f"Chapter {1 if i < 4 else 2} page {i}. Return on invested capital "
                                   f"{'beats WACC' if i == 3 else 'is defined here'}.")
    doc.set_toc([[1, "Chapter 1 Introduction", 1], [1, "Chapter 2 Growth", 4]])
    doc.save(tmp_path / "Investment Valuation.pdf")
    doc.close()
    (tmp_path / "receipts").mkdir()
    (tmp_path / "receipts" / "x.pdf").write_bytes(b"%PDF")
    monkeypatch.setenv("LOCAL_BOOKS_DIR", str(tmp_path))
    return tmp_path.resolve()


# --- guard -----------------------------------------------------------------------
def test_guard_needs_the_opt_in(monkeypatch):
    monkeypatch.delenv("LOCAL_BOOKS", raising=False)
    assert not book_tools.local_allowed(_Req({"Host": "localhost:3013"}))
    monkeypatch.setenv("LOCAL_BOOKS", "1")
    assert book_tools.local_allowed(_Req({"Host": "localhost:3013"}))
    assert book_tools.local_allowed(_Req({"Host": "127.0.0.1:3013"}))


@pytest.mark.parametrize("headers", [
    {"Host": "ai.intrinsicfined.org"},
    {"Host": "localhost:3013", "X-Forwarded-For": "203.0.113.9"},
    {"Host": "localhost:3013", "Cf-Connecting-Ip": "203.0.113.9"},
    {"Host": "evil.example"},
    {},
])
def test_guard_refuses_anything_not_direct_loopback(monkeypatch, headers):
    monkeypatch.setenv("LOCAL_BOOKS", "1")
    assert not book_tools.local_allowed(_Req(headers))


# --- folder rules ------------------------------------------------------------------
def test_resolve_by_id_or_unique_title_words(shelf):
    root = book_tools.books_root()
    assert root == shelf
    assert book_tools.resolve_book(root, "Investment Valuation.pdf") == shelf / "Investment Valuation.pdf"
    assert book_tools.resolve_book(root, "investment valuation") == shelf / "Investment Valuation.pdf"


@pytest.mark.parametrize("bad", ["", "../x.pdf", "receipts/x.pdf", "RECEIPTS/x.pdf", "C:/Windows/win.ini",
                                 "nothing matches this"])
def test_resolve_refuses(shelf, bad):
    assert book_tools.resolve_book(book_tools.books_root(), bad) is None


def test_list_skips_tool_folders(shelf):
    assert [p.name for p in book_tools.list_book_files(shelf)] == ["Investment Valuation.pdf"]


# --- page tools --------------------------------------------------------------------
def test_contents_reads_the_outline(shelf):
    text = book_tools.contents_text(shelf, shelf / "Investment Valuation.pdf")
    assert "5 PDF pages" in text
    assert "Chapter 1 Introduction (page 1)" in text and "Chapter 2 Growth (page 4)" in text


def test_read_pages_clamps_and_labels(shelf):
    text = book_tools.read_text(shelf / "Investment Valuation.pdf", 2, 99)
    assert "pages 2-5 of 5" in text
    assert "--- page 2 ---" in text and "--- page 5 ---" in text and "--- page 1 ---" not in text


def test_search_ranks_pages(shelf):
    text = book_tools.search_text(shelf / "Investment Valuation.pdf", "beats WACC")
    assert text.splitlines()[1].startswith("page 3:")
    assert "No page" in book_tools.search_text(shelf / "Investment Valuation.pdf", "zebra")


# --- fast path: page ranges ---------------------------------------------------------
@pytest.fixture
def no_outline_book(tmp_path):
    """A book like Porter's: no outline, a contents page, part pages opening with a
    Roman numeral (one scanned as "Il"), chapters opening with a bare number, and a
    running header "N / BOOK TITLE" on other pages."""
    tops = ["Contents\nPart I\nChapter 1\nChapter 2\nChapter 3",
            "I\nGeneral Techniques\nPart I lays the foundation.",
            "1\nThe Structural Analysis\nChapter 1 text.",
            "4\nBOOK TITLE\nChapter 1 described the forces of competition.",
            "2\nGeneric Strategies\nChapter 2 text.",
            "6\nBOOK TITLE\nmore text",
            "Il\nGeneric Environments\nPart II begins.",
            "3\nFragmented Industries\nChapter 3 text.",
            "9\nBOOK TITLE\nmore text"]
    doc = fitz.open()
    for top in tops * 1:
        page = doc.new_page()
        page.insert_text((72, 72), top)
    for _ in range(8):                      # pad so "BOOK TITLE" counts as a running header
        doc.new_page().insert_text((72, 72), "12\nBOOK TITLE\nfiller")
    path = tmp_path / "porter.pdf"
    doc.save(path)
    doc.close()
    return path


def test_page_range_without_outline(no_outline_book):
    p = no_outline_book
    assert book_tools.page_range(p, "Chapter 1") == (3, 4)
    assert book_tools.page_range(p, "chapters 1 to 2") == (3, 7)
    assert book_tools.page_range(p, "Part I") == (2, 6)
    assert book_tools.page_range(p, "Part II")[0] == 7
    assert book_tools.page_range(p, "pages 2 to 5") == (2, 5)
    assert book_tools.page_range(p, "the good bits") is None


def test_page_range_with_outline(shelf):
    p = shelf / "Investment Valuation.pdf"
    assert book_tools.page_range(p, "Chapter 1") == (1, 3)
    assert book_tools.page_range(p, "Chapter 2") == (4, 5)


def test_slice_range_covers_the_range_once():
    parts = [book_tools.slice_range(32, 219, i, 3) for i in range(3)]
    assert parts[0][0] == 32 and parts[-1][1] == 219
    assert all(parts[k][1] + 1 == parts[k + 1][0] for k in range(2))
    assert book_tools.slice_range(41, 42, 2, 5) == (42, 42)      # more slices than pages
    assert book_tools.parse_slice({"index": 1, "of": 3}) == (1, 3)
    assert book_tools.parse_slice({"index": 3, "of": 3}) == (0, 1)
    assert book_tools.parse_slice(None) == (0, 1)


def test_source_text_labels_pages_and_caps(shelf):
    p = shelf / "Investment Valuation.pdf"
    text = book_tools.source_text(p, 1, 5)
    assert "--- page 1 ---" in text and "--- page 5 ---" in text
    short = book_tools.source_text(p, 1, 5, max_chars=120)
    assert "the text stops here" in short


# --- payloads ----------------------------------------------------------------------
def test_validate_ask_keeps_book_page_and_recent_history():
    err, p = book_tools.validate_ask({
        "question": "Why did I get question 3 wrong?",
        "book": {"id": "Investment Valuation.pdf", "name": "Investment Valuation", "pages": "Chapter 1"},
        "page": 12,
        "history": [{"question": f"q{i}", "answer": "a"} for i in range(9)],
    })
    assert err is None
    assert p["book"]["pages"] == "Chapter 1" and p["page"] == 12
    assert [t["question"] for t in p["history"]] == ["q5", "q6", "q7", "q8"]
    prompt = book_tools.build_ask_prompt(p)
    assert "book id for the tools: Investment Valuation.pdf" in prompt and "page 12" in prompt


def test_validate_ask_merges_mentioned_books():
    err, p = book_tools.validate_ask({
        "question": "Compare the two",
        "book": {"id": "a.pdf", "name": "A"},
        "books": [{"id": "a.pdf", "name": "A"}, {"id": "b.pdf", "name": "B"}],
    })
    assert err is None and [b["id"] for b in p["books"]] == ["a.pdf", "b.pdf"]
    prompt = book_tools.build_ask_prompt(p)
    assert "referenced these books" in prompt and "a.pdf" in prompt and "b.pdf" in prompt
    err, p = book_tools.validate_ask({"question": "x", "books": [{"id": f"{i}.pdf"} for i in range(9)]})
    assert len(p["books"]) == book_tools.MAX_BOOKS


@pytest.mark.parametrize("data", [None, {}, {"question": "  "}, {"question": "x", "book": "not a dict"},
                                  {"question": "x", "books": "nope"}, {"question": "x", "books": [{"id": ""}]},
                                  {"question": "x" * (book_tools.MAX_QUESTION + 1)}])
def test_validate_ask_refuses(data):
    err, _ = book_tools.validate_ask(data)
    assert err


def test_learn_guidance_names_the_book_and_pages():
    _, book = book_tools.parse_book({"id": "Investment Valuation.pdf", "pages": "pages 1-30"})
    text = book_tools.learn_book_guidance(book)
    assert "Investment Valuation.pdf" in text and "pages 1-30" in text and "read_pages" in text


def test_validate_ask_tutor_mode_keeps_more_history_and_its_end():
    hist = [{"question": f"q{i}", "answer": "x" * 5000 + f"MAP{i}"} for i in range(20)]
    err, p = book_tools.validate_ask({"question": "tutor me", "mode": "tutor", "history": hist})
    assert err is None and p["tutor"] is True
    assert len(p["history"]) == book_tools.TUTOR_HISTORY_TURNS
    # The end of a long tutor answer (skill map, open question) survives the cut.
    assert p["history"][-1]["answer"].endswith("MAP19")
    err, p = book_tools.validate_ask({"question": "x", "history": hist})
    assert p["tutor"] is False and len(p["history"]) == book_tools.MAX_HISTORY_TURNS


def test_validate_ask_tutor_mode_takes_full_test_results():
    long_q = "r" * (book_tools.MAX_QUESTION + 1)
    assert book_tools.validate_ask({"question": long_q})[0] == book_tools.ERR_QUESTION_LONG
    assert book_tools.validate_ask({"question": long_q, "mode": "tutor"})[0] is None
