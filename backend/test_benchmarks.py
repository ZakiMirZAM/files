"""Tests for the /api/individual/{ticker}/benchmarks projection.

The endpoint reuses the cached scorecard matrices; these tests pin the pure
re-keying layer: individual snake_case keys -> matrix camelCase keys, units
carried from _SECTOR_METRIC_DEFS, non-finite values dropped, and metrics with
no group benchmark omitted entirely.

Run:  cd backend && python -m pytest test_benchmarks.py -q
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))


def _api():
    import api  # heavy import (pandas/yfinance); done lazily inside the tests

    return api


def test_key_map_targets_exist_in_sector_defs():
    api = _api()
    matrix_keys = {k for k, *_ in api._SECTOR_METRIC_DEFS}
    for ind_key, mx_key in api._BENCHMARK_KEY_MAP.items():
        assert mx_key in matrix_keys, f"{ind_key} maps to unknown matrix key {mx_key}"


def test_key_map_sources_exist_in_display_metrics():
    api = _api()
    import individualanalysis as ia

    display_keys = {m[0] for m in ia.DISPLAY_METRICS}
    for ind_key in api._BENCHMARK_KEY_MAP:
        assert ind_key in display_keys, f"{ind_key} is not an individual DISPLAY_METRICS key"


def test_benchmark_payload_projects_and_rekeys():
    api = _api()
    company = {"roic": 21.0, "wacc": 8.0, "roeEquity": 35.0}
    industry = {"roic": 14.5, "wacc": 8.2, "roeEquity": 22.0}
    sector = {"roic": 12.0, "wacc": 8.5, "roeEquity": 18.0}
    out = api._benchmark_payload("AAPL", "Technology", "Consumer Electronics",
                                 company, industry, sector)

    assert out["ticker"] == "AAPL"
    assert out["sector"] == "Technology"
    assert out["industry"] == "Consumer Electronics"

    roe = out["metrics"]["roe"]  # individual key, sourced from roeEquity
    assert roe["company"] == 35.0
    assert roe["industry"] == 22.0
    assert roe["sector"] == 18.0
    assert roe["unit"] == "%"
    assert roe["label"] == "ROE"

    # No group benchmark for eva_margin in these columns: the key is omitted.
    assert "eva_margin" not in out["metrics"]


def test_benchmark_payload_drops_non_finite_and_keeps_group_only_rows():
    api = _api()
    industry = {"roic": float("nan"), "wacc": 9.0}
    sector = {"roic": float("inf"), "wacc": 8.0}
    out = api._benchmark_payload("X", "Energy", "Oil & Gas", {}, industry, sector)

    # roic had only non-finite values everywhere: omitted.
    assert "roic" not in out["metrics"]
    # wacc has group values but no company value: kept, company None.
    wacc = out["metrics"]["wacc"]
    assert wacc["company"] is None
    assert wacc["industry"] == 9.0
    assert wacc["sector"] == 8.0


def test_benchmark_payload_empty_columns():
    api = _api()
    out = api._benchmark_payload("X", None, None, {}, {}, {})
    assert out["metrics"] == {}
    assert out["sector"] is None and out["industry"] is None
