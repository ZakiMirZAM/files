"""A lender's default spread is the model's fallback, and the payload says so.

The bank track withdraws the synthetic rating, the investment-grade flag and
the interest coverage, because all three are read off a table calibrated on
non-financial firms. It deliberately KEEPS a number in ``rating.spread``: the
cost of debt still needs one. That number is the fallback, not a reading off
this bank's coverage, and until this guard was added nothing in the payload
said which it was, so the frontend and the cross-stage context both printed it
as the company's own spread.

Network-free and DB-free.

Run:  cd backend && python -m pytest test_credit_bank_guard.py -q
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import financial_guard as fg  # noqa: E402


def test_the_default_spread_carries_its_own_reason():
    reasons = fg.not_applicable_map(fg.CREDIT_BANK_GUARDED_FIELDS)
    assert "defaultSpread" in reasons
    sentence = reasons["defaultSpread"]
    assert "fallback" in sentence
    assert sentence != reasons["syntheticRating"], "it is a different withdrawal"
    assert sentence.endswith(".")


def test_the_reason_is_plain_and_carries_no_em_dash():
    sentence = fg.NOT_APPLICABLE_REASONS["defaultSpread"]
    assert chr(0x2014) not in sentence, "em dash"
    assert chr(0x2212) not in sentence, "minus sign"


def test_the_three_withheld_credit_figures_are_still_the_bank_set():
    assert set(fg.CREDIT_BANK_GUARDED_FIELDS) == {
        "syntheticRating", "interestCoverage", "defaultSpread",
    }


def test_the_change_is_additive_and_nulls_nothing():
    """The guard map only gains a key. The rating block still carries a numeric
    spread, which is the whole reason it needed a marker of its own."""
    import individualanalysis as ia

    guarded = ia._guarded_rating({
        "letter": "A",
        "investmentGrade": True,
        "interestCoverage": 8.5,
        "spread": 0.0123,
        "headline": "whatever",
        "reason": None,
    })
    assert guarded["letter"] is None
    assert guarded["investmentGrade"] is None
    assert guarded["interestCoverage"] is None
    assert isinstance(guarded["spread"], float)
    assert guarded["spread"] == ia._FALLBACK_DEBT_SPREAD
