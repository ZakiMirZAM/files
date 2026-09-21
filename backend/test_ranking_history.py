"""The ranking route's light form: /api/comparative/{industry}/ranking?history=0.

The full ranking payload is dominated by the per-cell `_history` arrays (the
Semiconductors table is 561 rows times ~48 metrics, about ten megabytes). A
caller that never opens a cell chart can ask for the same payload without them.
Two things must hold: the default is unchanged, and the strip never touches the
cached full payload every other caller shares.

Run:  cd backend && python -m pytest test_ranking_history.py -q
"""

import copy
import inspect
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))


def _api():
    import api  # heavy import (pandas/yfinance); done lazily inside the tests
    return api


def _payload():
    """A ranking payload shaped like the live one, small enough to read."""
    return {
        "asOf": "2026-09-20",
        "universe": "2 companies in Semiconductors",
        "metrics": [
            {"key": "score", "label": "Value Score", "unit": "n", "group": "Ranking",
             "definition": "A 0-100 business-quality score."},
            {"key": "roic", "label": "ROIC", "unit": "%", "group": "Value creation",
             "definition": "Return on invested capital."},
        ],
        "sectors": ["NVDA", "TSM"],
        "sector": "Technology",
        "data": {
            "NVDA": {
                "score": 88.0, "roic": 91.2, "_year": 2025, "_marketCap": 4.2e12,
                "_history": {
                    "roic": [{"period": "2024", "value": 70.1},
                             {"period": "2025", "value": 91.2}],
                    "score": [{"period": "2025", "value": 88.0}],
                },
            },
            "TSM": {
                "score": 81.0, "roic": 26.4, "_year": 2025, "_marketCap": 9e11,
                "_history": {"roic": [{"period": "2025", "value": 26.4}]},
            },
        },
    }


def test_light_form_drops_every_cell_history_and_keeps_everything_else():
    api = _api()
    full = _payload()
    light = api._without_cell_history(full)

    for ticker, col in light["data"].items():
        assert "_history" not in col, ticker
    # Everything that is not the history survives, cell for cell.
    for ticker, col in full["data"].items():
        for key, value in col.items():
            if key == "_history":
                continue
            assert light["data"][ticker][key] == value, f"{ticker}.{key}"
    # The rest of the document is untouched.
    for key in ("asOf", "universe", "metrics", "sectors", "sector"):
        assert light[key] == full[key], key


def test_light_form_never_mutates_the_cached_payload():
    api = _api()
    full = _payload()
    before = copy.deepcopy(full)
    api._without_cell_history(full)
    assert full == before, (
        "the payload handed in is the @cached object every other caller shares; "
        "stripping it in place would delete the histories from the full form too")


def test_light_form_is_smaller_than_the_full_one():
    api = _api()
    full = _payload()
    light = api._without_cell_history(full)
    assert len(json.dumps(light)) < len(json.dumps(full))


def test_light_form_tolerates_a_payload_with_no_data_block():
    api = _api()
    assert api._without_cell_history({"detail": "nothing here"}) == {"detail": "nothing here"}


def test_the_route_defaults_to_the_full_payload():
    api = _api()
    sig = inspect.signature(api.comparative_ranking_endpoint)
    assert "history" in sig.parameters, "the route must accept ?history=0"
    assert sig.parameters["history"].default.default is True, (
        "the default must stay the full payload: every existing caller relies on "
        "the per-cell histories for the click-to-chart sidebar")
    src = inspect.getsource(api.comparative_ranking_endpoint)
    assert "_without_cell_history" in src
