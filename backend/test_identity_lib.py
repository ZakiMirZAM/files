"""Unit tests for remediation/identity_lib.py pure functions."""

import os
import sys

import pytest

sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "remediation"))

from identity_lib import (  # noqa: E402
    classify_kind,
    norm_dot_dash,
    pad_cik,
    yf_symbol_guess,
)


@pytest.mark.parametrize("symbol,expected", [
    ("GS-PA", "preferred"),
    ("WFC-P", "preferred"),
    ("BAC-PP", "preferred"),
    ("MS-PO", "preferred"),
    ("BRK-B", "common"),
    ("BRK-A", "common"),
    ("MOG-A", "common"),
    ("AAPL", "common"),
    ("GS", "common"),
    ("ABCD-WT", "warrant"),
    ("ABCD-WS", "warrant"),
    ("KCAC-UN", "unit"),
    ("SPAC-U", "unit"),
])
def test_classify_kind(symbol: str, expected: str) -> None:
    assert classify_kind(symbol) == expected


def test_classify_kind_lowercase_input() -> None:
    assert classify_kind("gs-pa") == "preferred"


@pytest.mark.parametrize("raw,expected", [
    ("brk.b", "BRK-B"),
    ("BRK.B", "BRK-B"),
    ("aapl", "AAPL"),
    ("BRK-B", "BRK-B"),
    ("7203.t", "7203-T"),
])
def test_norm_dot_dash(raw: str, expected: str) -> None:
    assert norm_dot_dash(raw) == expected


@pytest.mark.parametrize("symbol,expected", [
    ("BRK.B", "BRK-B"),          # single-letter US class -> dash
    ("brk.b", "BRK-B"),
    ("7203.T", "7203.T"),        # Tokyo suffix preserved
    ("VOD.L", "VOD.L"),          # London suffix preserved
    ("RELIANCE.NS", "RELIANCE.NS"),  # NSE two-char suffix preserved
    ("AAPL", "AAPL"),            # no dot, unchanged
    ("BRK-B", "BRK-B"),          # already dash form
    ("GS-PA", "GS-PA"),
])
def test_yf_symbol_guess(symbol: str, expected: str) -> None:
    assert yf_symbol_guess(symbol) == expected


def test_yf_symbol_guess_exchange_arg_ignored_when_suffix_known() -> None:
    assert yf_symbol_guess("7203.T", exchange="JPX") == "7203.T"


@pytest.mark.parametrize("cik,expected", [
    (886982, "0000886982"),
    ("886982", "0000886982"),
    ("0000886982", "0000886982"),
    (320193, "0000320193"),
    (None, None),
    ("", None),
    ("not-a-cik", None),
])
def test_pad_cik(cik: object, expected: str | None) -> None:
    assert pad_cik(cik) == expected
