"""Tests for the vault retrieval layer.

The pure tests are network-free and run anywhere. The tests that need the real
index plus a running Ollama are marked `live` and skip themselves when either is
absent, so `pytest rag/` stays green on a machine with neither.

  python -m pytest rag/test_retrieval.py -q
  python -m pytest rag/test_retrieval.py -q -m live     # needs vault.db + ollama
"""
from __future__ import annotations

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import books
import chunking
import retrieval

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vault.db")


# --- books.py: duplicate-import folding -------------------------------------
def test_book_id_strips_punctuation():
    assert books.book_id("The Little Book_ That -- Builds") == "thelittlebookthatbuilds"


def test_separator_variants_fold_together():
    """The pair that motivated this: same book, two punctuation spellings."""
    a = "The Little Book That Builds Wealth_ The Knockout Formula for -- Pat"
    b = "The_Little_Book_That_Builds_Wealth_The_Knockout_Formula_for_Pat"
    canon = books.fold([books.book_id(a), books.book_id(b)])
    assert canon[books.book_id(a)] == canon[books.book_id(b)]


def test_truncated_title_folds_onto_the_longer_one():
    """One export kept the author, the other cut the title short."""
    short = "poorcharliesalmanackthewitandwisdomof"
    long = "poorcharliesalmanackthewitandwisdomofcharlestmunger"
    canon = books.fold([short, long])
    assert canon[short] == canon[long] == long


def test_fold_does_not_merge_distinct_books_sharing_a_short_prefix():
    """Guarded by MIN_FOLD_LEN, or every book starting "the" would collapse."""
    canon = books.fold(["theartofwar", "theartofpersuasion"])
    assert canon["theartofwar"] != canon["theartofpersuasion"]


def test_fold_is_idempotent():
    ids = ["investmentvaluation3rdedition", "investmentvaluation3rdeditionextra"]
    once = books.fold(ids)
    twice = books.fold(once.values())
    assert {twice[v] for v in once.values()} == set(once.values())


def test_display_title_recovers_a_readable_name():
    assert books.display_title("dokumen.pub_investment-valuation-3rd-edition") \
        .lower().startswith("investment valuation")


def test_opaque_directory_is_left_alone():
    assert books.is_opaque("2b66030e0dd4c77b2bda437f6c1e5e66")
    assert books.is_opaque("27598267")
    assert not books.is_opaque("Security Analysis")


def test_context_prefix_names_book_and_chapter():
    prefix = books.context_prefix(
        "Books/investment-valuation-3rd-edition/Ch16 - Chapter 15 Firm Valuation.md")
    assert "investment valuation" in prefix.lower()
    assert "Firm Valuation" in prefix


def test_context_prefix_of_opaque_book_falls_back_to_the_chapter():
    prefix = books.context_prefix("Books/27598267/Ch04 - Part 4 Risk and Return.md")
    assert prefix == "Part 4 Risk and Return"
    assert "27598267" not in prefix


# --- query expansion --------------------------------------------------------
def test_acronym_gets_its_long_form_appended():
    out = retrieval.expand_query("WACC")
    assert out.startswith("WACC")                      # user wording is preserved
    assert "weighted average cost of capital" in out


def test_symbol_token_expands():
    assert "enterprise value" in retrieval.expand_query("EV/EBITDA").lower()


def test_short_acronym_does_not_fire_inside_a_word():
    """`ev` must not match inside `seven`, or the 7 Powers deck gets EV passages."""
    assert retrieval.expand_query("seven powers") == "seven powers"


def test_already_spelled_out_query_is_untouched():
    q = "weighted average cost of capital"
    assert retrieval.expand_query(q) == q


def test_unknown_term_is_left_alone():
    """No entry means no guess; the exact-phrase channel covers it instead."""
    assert retrieval.expand_query("customer concentration") == "customer concentration"


def test_expansion_is_bounded():
    out = retrieval.expand_query("WACC ROIC EVA FCFF DCF CAPE ERP DDM")
    assert len(out) < len("WACC ROIC EVA FCFF DCF CAPE ERP DDM") + 200


def test_expansion_tuning_constants_are_the_ablated_ones():
    """Swept against the live index over 18 queries. max_additions plateaus at 2.
    skip_nested=True reads tidier and measured 4 points WORSE, because repeating a
    head term through its nested key weights it. Do not "clean this up" without
    re-running the sweep."""
    assert retrieval.MAX_ADDITIONS == 2
    assert retrieval.SKIP_NESTED_KEYS is False


def test_pool_sizes_are_the_ablated_ones():
    """100/100 measured 6 points better than 50/50; 150/150 added nothing."""
    assert retrieval.VEC_POOL == 100
    assert retrieval.LEX_POOL == 100


def test_phrase_for_keeps_the_users_words_not_the_expansion():
    assert retrieval.phrase_for("EV/EBITDA") == "EV EBITDA"


# --- fusion, threshold, de-duplication --------------------------------------
def _hit(cid, source, text="body text here", distance=0.5):
    return {"id": cid, "source": source, "text": text, "distance": distance}


def test_rrf_ranks_an_item_found_by_both_channels_first():
    vector = [_hit(1, "Books/A/Ch1.md"), _hit(2, "Books/B/Ch1.md")]
    lexical = [_hit(2, "Books/B/Ch1.md"), _hit(3, "Books/C/Ch1.md")]
    assert retrieval._rrf(vector, lexical)[0]["id"] == 2


def test_rrf_keeps_the_copy_carrying_a_distance():
    vector = [_hit(7, "Books/A/Ch1.md", distance=0.4)]
    lexical = [{"id": 7, "source": "Books/A/Ch1.md", "text": "x", "distance": None}]
    assert retrieval._rrf(lexical, vector)[0]["distance"] == 0.4


def test_dedupe_drops_a_second_copy_of_the_same_chapter():
    hits = [_hit(1, "Books/The_Little_Book/Ch13 - Eleven.md", "same passage"),
            _hit(2, "Books/The_Little_Book/Ch13 - Eleven.md", "same passage"),
            _hit(3, "Books/Other/Ch01 - One.md", "different")]
    assert len(retrieval._dedupe(hits, 6)) == 2


def test_dedupe_drops_identical_text_from_different_books():
    hits = [_hit(1, "Books/A/Ch1.md", "identical body"),
            _hit(2, "Books/B/Ch2.md", "identical body")]
    assert len(retrieval._dedupe(hits, 6)) == 1


def test_dedupe_respects_top_k():
    hits = [_hit(i, f"Books/B{i}/Ch1.md", f"text {i}") for i in range(20)]
    assert len(retrieval._dedupe(hits, 6)) == 6


def test_threshold_is_between_the_measured_populations():
    """Measured on the live index: junk queries bottomed out at 0.887, working
    ones peaked at 0.762. The cut has to sit strictly between the two."""
    assert 0.762 < retrieval.MAX_DISTANCE < 0.887


# --- chunking: context + the Related graph ----------------------------------
RELATED_NOTE = """---
title: test
---
# Ch03 - Some Chapter

Body prose about the cost of capital.

## Related
- [[Ch19 - The Future of Cycles]] *(sim 0.79)* — Mastering-the-Market-Cycle-Howard-Marks
- [[Ch06 - You Are Not a Lottery Ticket]] *(sim 0.80)* *(same book)* — 021
"""


def test_parse_related_extracts_edges_with_scores():
    edges = chunking.parse_related(RELATED_NOTE)
    assert len(edges) == 2
    assert edges[0]["note"] == "Ch19 - The Future of Cycles"
    assert edges[0]["sim"] == pytest.approx(0.79)
    assert edges[0]["same_book"] is False


def test_parse_related_flags_same_book_links():
    assert chunking.parse_related(RELATED_NOTE)[1]["same_book"] is True


def test_parse_related_on_a_note_without_the_block():
    assert chunking.parse_related("# Title\n\nJust prose.\n") == []


def test_related_block_is_still_stripped_from_the_indexed_text():
    """The edges are captured, but the link list must not become a chunk."""
    assert "Mastering-the-Market-Cycle" not in chunking.strip_markdown_for_index(RELATED_NOTE)


def test_every_window_of_a_long_section_keeps_its_heading():
    """The fix for 97.4% of chunks being anonymous continuation windows."""
    body = "# Ch03 - Cost of Capital\n\n" + ("Sentence about discount rates. " * 400)
    sections = chunking.note_sections(body)
    assert len(sections) > 1
    assert all(heading == "Ch03 - Cost of Capital" for heading, _ in sections)


def test_note_chunks_still_returns_plain_strings():
    out = chunking.note_chunks(RELATED_NOTE)
    assert out and all(isinstance(c, str) for c in out)


def test_embed_text_prefixes_but_leaves_the_stored_text_alone():
    text = "Body prose."
    embedded = chunking.embed_text("Investment Valuation", "Chapter 15", text)
    assert embedded.startswith("Investment Valuation > Chapter 15")
    assert embedded.endswith(text)


def test_embed_text_without_context_is_a_passthrough():
    assert chunking.embed_text("", "", "Body.") == "Body."


# --- live index -------------------------------------------------------------
live = pytest.mark.live


@pytest.fixture(scope="module")
def db():
    if not os.path.exists(DB_PATH):
        pytest.skip("vault.db not present")
    import sqlite_vec
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    yield conn
    conn.close()


def _ollama_up() -> bool:
    import requests
    try:
        requests.get(f"{os.environ.get('OLLAMA_URL', 'http://localhost:11434')}/api/tags",
                     timeout=2).raise_for_status()
        return True
    except Exception:
        return False


@live
def test_category_resolves_across_directory_spellings(db):
    """`Investment Valuation` used to return zero because the directories spell it
    with dashes."""
    assert retrieval.resolve_category(db, "Investment Valuation")


@live
def test_unknown_category_falls_back_rather_than_returning_nothing(db):
    assert retrieval.resolve_category(db, "A Book That Is Not In The Vault") == []


@live
def test_bare_metric_label_retrieves_on_topic_passages(db):
    if not _ollama_up():
        pytest.skip("ollama not running")
    hits = retrieval.search(db, "WACC", None, 6)
    joined = " ".join(h["text"].lower() for h in hits)
    assert "cost of capital" in joined


@live
def test_symbol_query_retrieves_at_all(db):
    """EV/EBITDA matched 84 chunks lexically and zero within a 200-deep vector pool."""
    if not _ollama_up():
        pytest.skip("ollama not running")
    hits = retrieval.search(db, "EV/EBITDA", None, 6)
    assert any("ebitda" in h["text"].lower() for h in hits)


@live
def test_results_are_unique_per_chapter(db):
    if not _ollama_up():
        pytest.skip("ollama not running")
    hits = retrieval.search(db, "economic value added residual income", None, 6)
    keys = [(retrieval.canonical_id(h["source"].rpartition("/")[0]),
             h["source"].rpartition("/")[2]) for h in hits]
    assert len(keys) == len(set(keys))
