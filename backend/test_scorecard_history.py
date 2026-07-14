"""Sector/industry scorecard history: 2016 depth, year-aware FX, value score.

Three behaviours are pinned here, each of which was a real trap:

1. **Year-aware FX.** A row's market cap is as-of its own fiscal year end, so it
   must convert at THAT year's rate. Converting a 2016 JPY cap at the 2026 rate
   understates the filer by ~28%. The most recent year is the exception: its cap
   is refreshed to spot weekly, so it pairs with the spot rate.
2. **Widening the history window must not pollute the CURRENT column.** A
   company whose last filing was 2018 belongs in the 2018 chart point and
   nowhere near today's cell.
3. **Value Score history is peer-relative**, so it is scored per year across the
   whole cross-section, not one group at a time.

Run:  cd backend && python -m pytest test_scorecard_history.py -q
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "remediation"))


def _api():
    import api
    return api


class Row(dict):
    """A dict that also answers .keys() like a sqlite3.Row (what api.py expects)."""


# ── 1. Year-aware FX ─────────────────────────────────────────────────────────

def test_historical_year_uses_that_years_fx_rate(monkeypatch):
    api = _api()
    monkeypatch.setattr(api, "_fx_rates", lambda: {"JPY": 0.006156})       # spot
    monkeypatch.setattr(api, "_fx_hist", lambda: {("JPY", 2016): 0.008601})

    row = Row({"Reported Currency": "JPY", "yr": 2016})
    # 1bn JPY in 2016 -> converted at the 2016 rate, not today's
    assert api._mc_to_usd(row, 1e9) == pytest.approx(1e9 * 0.008601)


def test_latest_year_uses_spot_because_its_cap_is_spot(monkeypatch):
    api = _api()
    monkeypatch.setattr(api, "_fx_rates", lambda: {"JPY": 0.006156})
    monkeypatch.setattr(api, "_fx_hist", lambda: {("JPY", api.MAX_YEAR): 0.0099})

    row = Row({"Reported Currency": "JPY", "yr": api.MAX_YEAR})
    assert api._mc_to_usd(row, 1e9) == pytest.approx(1e9 * 0.006156)


def test_missing_historical_rate_falls_back_to_spot(monkeypatch):
    api = _api()
    monkeypatch.setattr(api, "_fx_rates", lambda: {"JPY": 0.006156})
    monkeypatch.setattr(api, "_fx_hist", lambda: {})          # table absent/empty

    row = Row({"Reported Currency": "JPY", "yr": 2016})
    assert api._mc_to_usd(row, 1e9) == pytest.approx(1e9 * 0.006156)


def test_usd_and_unknown_currency_are_unconverted(monkeypatch):
    api = _api()
    monkeypatch.setattr(api, "_fx_rates", lambda: {"JPY": 0.006156})
    monkeypatch.setattr(api, "_fx_hist", lambda: {})

    assert api._mc_to_usd(Row({"Reported Currency": "USD", "yr": 2016}), 500.0) == 500.0
    assert api._mc_to_usd(Row({"Reported Currency": None, "yr": 2016}), 500.0) == 500.0


def test_fx_weight_sql_prefers_history_then_spot():
    api = _api()
    sql = api._FX_WEIGHT_SQL
    # historical branch first, spot second, USD/NULL 1.0 last
    assert sql.index("xh.usd_per_unit") < sql.index("x.usd_per_unit")
    assert f'< {api._FX_SPOT_FROM_YEAR}' in sql
    # the join pair MUST be carried by every consumer
    assert "fx_rates_hist" in api._FX_JOIN_SQL and "fx_rates x" in api._FX_JOIN_SQL


# ── 2. Window depth vs the current column ────────────────────────────────────

def test_history_window_reaches_2016_but_current_gate_does_not():
    api = _api()
    assert api.SCORECARD_HISTORY_START == 2016
    # the current column keeps the original 5-year recency rule, so today's
    # displayed numbers and constituents do not move
    assert api._CURRENT_MIN_YEAR == api.MAX_YEAR - 4
    assert api.SCORECARD_HISTORY_START < api._CURRENT_MIN_YEAR


def test_per_year_columns_include_a_now_delisted_company(monkeypatch):
    api = _api()
    monkeypatch.setattr(api, "_AVG_MC_FLOOR_USD", 0.0)
    monkeypatch.setattr(api, "MIN_TICKERS_PER_GROUP_YEAR", 1)

    def fake_metrics(latest, prior=None):
        return {"_mc": 100.0, "roic": float(latest["roic"])}

    monkeypatch.setattr(api, "_company_metrics", fake_metrics)

    raw = {
        # alive: 2016 + 2025
        "LIVE": [Row({"yr": 2025, "roic": 10.0}), Row({"yr": 2016, "roic": 8.0})],
        # dead since 2018 — must still appear in the 2016/2018 points
        "DEAD": [Row({"yr": 2018, "roic": 4.0}), Row({"yr": 2016, "roic": 2.0})],
    }
    cols = api._per_year_columns(raw, "Grp", ["roic"], {})

    assert 2016 in cols and 2018 in cols and 2025 in cols
    # 2016 averages BOTH companies (8 and 2, equal weight) -> 5.0
    assert cols[2016]["roic"] == pytest.approx(5.0)
    assert cols[2016]["_companies"] == 2
    # 2025 has only the survivor
    assert cols[2025]["_companies"] == 1


# ── 3. Value Score history ───────────────────────────────────────────────────

def test_value_score_history_is_scored_per_year_across_groups(monkeypatch):
    api = _api()
    monkeypatch.setattr(api, "GROUP_SCORING_OK", True)

    calls: list[set[str]] = []

    class FakeScoring:
        @staticmethod
        def score_groups(cols, sector=None, sector_by_group=None):
            calls.append(set(cols))
            return {g: 50.0 + i for i, g in enumerate(sorted(cols))}

        @staticmethod
        def rank_groups(scores):
            return {g: i + 1 for i, g in enumerate(sorted(scores))}

        @staticmethod
        def build_group_integrity(*a, **k):
            return []

    monkeypatch.setattr(api, "group_scoring", FakeScoring)
    monkeypatch.setattr(api, "_integrity_inputs", lambda gc: {})
    monkeypatch.setattr(
        api, "_per_year_columns",
        lambda raw, g, mk, clip: {
            2016: {"roic": 1.0}, 2020: {"roic": 2.0}, 2025: {"roic": 3.0}})

    data = {"A": {"roic": 3.0}, "B": {"roic": 2.0}}
    api._augment_matrix_scoring(
        data, {"A": {}, "B": {}}, {"A": [], "B": []}, ["roic"], {},
        group_col="sector")

    for g in ("A", "B"):
        vs = data[g]["_history"]["valueScore"]
        assert [p["period"] for p in vs] == ["2016", "2020", "2025"]
        assert all(p["value"] is not None for p in vs)
    # every per-year call saw BOTH groups (peer percentile needs the cross-section)
    assert all(c == {"A", "B"} for c in calls[1:])


def test_value_score_history_needs_two_peers(monkeypatch):
    api = _api()
    monkeypatch.setattr(api, "GROUP_SCORING_OK", True)

    class FakeScoring:
        @staticmethod
        def score_groups(cols, sector=None, sector_by_group=None):
            return {g: 50.0 for g in cols}

        @staticmethod
        def rank_groups(scores):
            return {g: 1 for g in scores}

        @staticmethod
        def build_group_integrity(*a, **k):
            return []

    monkeypatch.setattr(api, "group_scoring", FakeScoring)
    monkeypatch.setattr(api, "_integrity_inputs", lambda gc: {})
    monkeypatch.setattr(
        api, "_per_year_columns",
        lambda raw, g, mk, clip: {2016: {"roic": 1.0}, 2025: {"roic": 2.0}})

    data = {"Solo": {"roic": 1.0}}
    api._augment_matrix_scoring(
        data, {"Solo": {}}, {"Solo": []}, ["roic"], {}, group_col="sector")

    # a percentile against nobody is not a score
    assert "valueScore" not in (data["Solo"].get("_history") or {})
