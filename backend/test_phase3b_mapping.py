"""Network-free tests for the Phase 3b companyfacts -> financials-row mapper.

Feeds a small synthetic XBRL companyfacts dict through map_companyfacts and
asserts the column mapping, FY selection (latest filing wins on a restated
year), capex sign, shares extraction, and non-USD-unit skipping.

Run: cd backend && python -m pytest test_phase3b_mapping.py -q
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "remediation"))

import phase3b_delisted as p3b  # noqa: E402


def _facts() -> dict:
    """Synthetic companyfacts for FY2018 + FY2019 with a restated 2019."""
    return {
        "cik": 12345,
        "entityName": "Test Co",
        "facts": {
            "us-gaap": {
                "Revenues": {"units": {"USD": [
                    # 2019 as first filed ...
                    {"start": "2019-01-01", "end": "2019-12-31", "val": 1000.0,
                     "form": "10-K", "fp": "FY", "filed": "2020-02-01"},
                    # ... then restated in a later 10-K (latest filed must win)
                    {"start": "2019-01-01", "end": "2019-12-31", "val": 1100.0,
                     "form": "10-K", "fp": "FY", "filed": "2021-02-15"},
                    # a Q4-length duration inside the 10-K must be ignored
                    {"start": "2019-10-01", "end": "2019-12-31", "val": 300.0,
                     "form": "10-K", "fp": "FY", "filed": "2020-02-01"},
                    # a 10-Q fact must be ignored
                    {"start": "2018-01-01", "end": "2018-12-31", "val": 900.0,
                     "form": "10-Q", "fp": "FY", "filed": "2019-02-01"},
                    # legitimate FY2018
                    {"start": "2018-01-01", "end": "2018-12-31", "val": 800.0,
                     "form": "10-K", "fp": "FY", "filed": "2019-02-01"},
                ]}},
                "NetCashProvidedByUsedInOperatingActivities": {"units": {"USD": [
                    {"start": "2019-01-01", "end": "2019-12-31", "val": 200.0,
                     "form": "10-K", "fp": "FY", "filed": "2020-02-01"},
                ]}},
                "PaymentsToAcquirePropertyPlantAndEquipment": {"units": {"USD": [
                    {"start": "2019-01-01", "end": "2019-12-31", "val": 50.0,
                     "form": "10-K", "fp": "FY", "filed": "2020-02-01"},
                ]}},
                "Assets": {"units": {"USD": [
                    {"end": "2019-12-31", "val": 5000.0,
                     "form": "10-K", "fp": "FY", "filed": "2020-02-01"},
                ]}},
                # non-USD-only concept: must be skipped entirely
                "StockholdersEquity": {"units": {"EUR": [
                    {"end": "2019-12-31", "val": 9999.0,
                     "form": "10-K", "fp": "FY", "filed": "2020-02-01"},
                ]}},
            },
            "dei": {
                "EntityCommonStockSharesOutstanding": {"units": {"shares": [
                    {"end": "2020-01-31", "val": 100.0,
                     "form": "10-K", "fp": "FY", "filed": "2020-02-01"},
                ]}},
            },
        },
    }


@pytest.fixture
def rows() -> dict:
    return p3b.map_companyfacts(_facts(), "12345", "Test Co",
                                start_year=2012, end_year=2019)


def test_years_present(rows):
    assert set(rows) == {2018, 2019}


def test_column_mapping_and_revenue(rows):
    assert rows[2018]["Revenue"] == 800.0
    assert rows[2019]["Total Assets"] == 5000.0


def test_latest_filing_wins_on_restatement(rows):
    # 1100 (filed 2021) beats 1000 (filed 2020); the Q4 300 never competes.
    assert rows[2019]["Revenue"] == 1100.0


def test_quarterly_duration_ignored(rows):
    assert rows[2019]["Revenue"] != 300.0


def test_capex_is_negated(rows):
    assert rows[2019]["Capital Expenditure"] == -50.0


def test_free_cash_flow_uses_negated_capex(rows):
    # FCF = OCF + Capex = 200 + (-50) = 150
    assert rows[2019]["Free Cash Flow"] == 150.0


def test_non_usd_units_skipped(rows):
    assert rows[2019].get("Total Stockholders Equity") is None
    assert rows[2019].get("Total Equity") is None


def test_shares_extracted_nearest_fye(rows):
    # dei shares dated 2020-01-31 is 31 days after the 2019-12-31 FYE.
    assert rows[2019]["_shares"] == 100.0
    # 2018 has no nearby dei fact -> no shares attached.
    assert "_shares" not in rows[2018]


def test_identity_scalars(rows):
    row = rows[2019]
    assert row["Period"] == "FY"
    assert row["Reported Currency"] == "USD"
    assert row["Calendar Year"] == 2019
    assert row["Cik"] == "0000012345"
    assert row["Name"] == "Test Co"


def test_death_year_caps_range():
    rows = p3b.map_companyfacts(_facts(), "12345", "Test Co",
                                start_year=2012, end_year=2018)
    assert set(rows) == {2018}


def test_normalize_name_strips_suffixes():
    assert p3b.normalize_name("Conagra Brands, Inc.") == "CONAGRA BRANDS"
    assert p3b.normalize_name("CONAGRA BRANDS INC.") == "CONAGRA BRANDS"
