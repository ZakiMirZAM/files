"""The AI sidebar's model switch: only "haiku" changes the model, and only to Haiku.

  python -m pytest rag/test_model_switch.py -q
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

server = pytest.importorskip("server", reason="claude_agent_sdk not installed")


def test_haiku_picks_the_fast_model():
    assert server.pick_model({"model": "haiku"}, server.ASK_MODEL) == "claude-haiku-5-5"
    assert server.pick_model({"model": " HAIKU "}, server.ASK_MODEL) == "claude-haiku-5-5"


@pytest.mark.parametrize("value", [None, "", "opus", "claude-opus-4-6", "claude-fable-5-1", 7, "haiku-x"])
def test_anything_else_keeps_the_route_default(value):
    """A request must never be able to name an arbitrary model."""
    data = {} if value is None else {"model": value}
    assert server.pick_model(data, server.ASK_MODEL) == server.ASK_MODEL
    assert server.pick_model(data, server.EXPLAIN_MODEL) == server.EXPLAIN_MODEL
