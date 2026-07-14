"""Regression test for the batch-quote wiring (/api/quotes).

The batch used to call `quote_endpoint(sym)` positionally, binding the symbol
to the `request` parameter. Every symbol threw, the broad `except` swallowed
it, and the route always returned [] — the simulator priced nothing and showed
no error. These tests pin the shared `_quote_for` core both routes now use.

Run:  cd backend && python -m pytest test_quote_batch.py -q
"""

import inspect
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))


def _api():
    import api  # heavy import (pandas/yfinance); done lazily inside the tests
    return api


def test_quote_core_is_keyed_by_ticker_only():
    api = _api()
    sig = inspect.signature(api._quote_for)
    params = list(sig.parameters)
    assert params == ["ticker"], (
        "_quote_for must take ONLY the ticker: the batch calls it positionally, "
        "and a leading `request` param is exactly the bug this test guards")


def test_batch_uses_the_shared_core_not_the_route():
    api = _api()
    src = inspect.getsource(api.quotes_batch_endpoint)
    assert "_quote_for(sym)" in src
    assert "quote_endpoint(sym)" not in src, (
        "calling the ROUTE positionally binds the symbol to `request`")


def test_batch_returns_a_quote_per_symbol(monkeypatch):
    api = _api()
    from fastapi.testclient import TestClient
    seen: list[str] = []

    def fake_quote(ticker: str) -> dict:
        seen.append(ticker)
        return {"ticker": ticker, "price": 100.0}

    monkeypatch.setattr(api, "_quote_for", fake_quote)
    r = TestClient(api.app).get("/api/quotes?tickers=aapl, msft ,GS,AAPL")

    assert r.status_code == 200
    assert seen == ["AAPL", "MSFT", "GS"]          # upper-cased + de-duped
    assert [q["ticker"] for q in r.json()] == ["AAPL", "MSFT", "GS"]


def test_batch_skips_only_the_bad_symbol(monkeypatch):
    api = _api()
    from fastapi.testclient import TestClient

    def fake_quote(ticker: str) -> dict:
        if ticker == "BAD":
            raise api.HTTPException(404, "no quote")
        return {"ticker": ticker, "price": 1.0}

    monkeypatch.setattr(api, "_quote_for", fake_quote)
    r = TestClient(api.app).get("/api/quotes?tickers=AAPL,BAD,MSFT")

    # one bad symbol must not sink the batch, and must not empty it
    assert [q["ticker"] for q in r.json()] == ["AAPL", "MSFT"]
