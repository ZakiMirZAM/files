"""Unit tests for the Phase 2 symbol-resolution core (alias -> primary folding).

These test the PURE lookup function in isolation: no DB, no network, no import of
``backend/api.py`` (which pulls pandas/yfinance and takes ~10s at import). The
function below is a verbatim copy of ``_resolve_symbol_core`` from
``remediation/phase2_api_patch.md`` (section 1). If that helper changes, update this
copy in lockstep — the search/individual endpoints call the same logic through a
thin cached wrapper (``_resolve_symbol`` -> ``_symbol_aliases`` -> this core).

Run: ``cd backend && python -m pytest test_symbol_resolution.py -q``
"""

from __future__ import annotations

import pytest


# ── Copy of the pure core from the patch (keep in sync with api.py) ──────────
def _resolve_symbol_core(symbol: str, alias_map: dict[str, str] | None) -> str:
    """Uppercase + dot->dash normalize, then fold an alias onto its primary via
    alias_map. A None map (security_map absent) or a non-alias symbol returns the
    normalized input unchanged."""
    normalized = (symbol or "").strip().upper().replace(".", "-")
    if not alias_map:
        return normalized
    return alias_map.get(normalized, normalized)


# ── Fixture: a hand-built alias map mirroring the known DB mislabelings ──────
@pytest.fixture()
def alias_map() -> dict[str, str]:
    # keys are already normalized (uppercase, dash) exactly as _symbol_aliases builds them
    return {
        "GS-PA": "GS",
        "GS-PC": "GS",
        "MS-PO": "MS",
        "BAC-PP": "BAC",
        "BRK-B": "BRK-A",   # data-carrier primary (BRK-A has 14y, BRK-B empty)
        "GOOGL": "GOOG",    # data-carrier primary (GOOG has full history)
    }


# ── alias fold ───────────────────────────────────────────────────────────────
def test_folds_preferred_alias_to_primary(alias_map: dict[str, str]) -> None:
    # Arrange / Act
    result = _resolve_symbol_core("GS-PA", alias_map)
    # Assert
    assert result == "GS"


def test_folds_dotted_class_ticker_with_normalize(alias_map: dict[str, str]) -> None:
    # 'BRK.B' must first normalize dot->dash to 'BRK-B', then fold to 'BRK-A'
    assert _resolve_symbol_core("BRK.B", alias_map) == "BRK-A"


def test_folds_data_carrier_alias(alias_map: dict[str, str]) -> None:
    # GOOGL (SEC-first, sparse) folds onto GOOG (data carrier, full history)
    assert _resolve_symbol_core("GOOGL", alias_map) == "GOOG"


def test_lowercase_alias_is_normalized_then_folded(alias_map: dict[str, str]) -> None:
    assert _resolve_symbol_core("ms-po", alias_map) == "MS"


def test_whitespace_is_stripped_before_lookup(alias_map: dict[str, str]) -> None:
    assert _resolve_symbol_core("  gs-pa  ", alias_map) == "GS"


# ── passthrough (not an alias) ───────────────────────────────────────────────
def test_unknown_symbol_passthrough(alias_map: dict[str, str]) -> None:
    # A symbol absent from the map returns normalized, unchanged
    assert _resolve_symbol_core("AAPL", alias_map) == "AAPL"


def test_primary_symbol_is_not_re_folded(alias_map: dict[str, str]) -> None:
    # 'GS' is a primary (not a key in the alias map) -> returned as-is
    assert _resolve_symbol_core("GS", alias_map) == "GS"


def test_unknown_dotted_symbol_still_normalizes(alias_map: dict[str, str]) -> None:
    # Not an alias, but dot->dash still applies (matches the DB's dash key format)
    assert _resolve_symbol_core("BRK.A", alias_map) == "BRK-A"


# ── table-missing (None map) passthrough — graceful degradation ──────────────
def test_none_map_passthrough_uppercases() -> None:
    # security_map absent -> None map -> identity normalize only
    assert _resolve_symbol_core("gs-pa", None) == "GS-PA"


def test_none_map_normalizes_dot_to_dash() -> None:
    assert _resolve_symbol_core("brk.b", None) == "BRK-B"


def test_empty_map_behaves_like_none() -> None:
    # An empty (but non-None) map is also falsy -> passthrough, no fold
    assert _resolve_symbol_core("GS-PA", {}) == "GS-PA"


# ── edge inputs ──────────────────────────────────────────────────────────────
def test_empty_string_input() -> None:
    assert _resolve_symbol_core("", {"GS-PA": "GS"}) == ""


def test_whitespace_only_input() -> None:
    assert _resolve_symbol_core("   ", None) == ""


@pytest.mark.parametrize(
    ("symbol", "expected"),
    [
        ("GS-PA", "GS"),
        ("GS-PC", "GS"),
        ("BAC-PP", "BAC"),
        ("brk.b", "BRK-A"),
        ("AAPL", "AAPL"),
        ("googl", "GOOG"),
    ],
)
def test_resolution_table(symbol: str, expected: str, alias_map: dict[str, str]) -> None:
    assert _resolve_symbol_core(symbol, alias_map) == expected
