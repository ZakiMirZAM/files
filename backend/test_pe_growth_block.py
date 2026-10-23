"""The P/E vs growth and returns block and the EV/NOPAT figures, assembled.

A synthetic company whose EPS grows exactly 10% a year from 2019 to 2024,
with the owner's worked example underneath (ROE 18%, cost of equity 9%,
stable growth 4%, forward P/E 25). Every expected value is hand-computed in
the comment beside it; tolerances follow the payload's display rounding
(multiples to 2 decimals, rates to 4). Network-free and DB-free: plain dicts stand in for
sqlite3.Row, as in test_damodaran_models.py.

Run:  cd backend && python -m pytest test_pe_growth_block.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import pytest  # noqa: E402

import individualanalysis as ia  # noqa: E402
from financial_db import consensus_from_info  # noqa: E402
from valuation import pe_growth as pg  # noqa: E402

YEARS = list(range(2019, 2025))
ROWS = [{"Calendar Year": y, "Net Income Per Share": 1.1 ** i} for i, y in enumerate(YEARS)]
RI = {"applicable": True, "roeUsed": 0.18, "costOfEquity": 0.09,
      "retention": 0.5, "growthTerminal": 0.04}
FORECAST = {"assumptions": {"roic": 0.15, "wacc": 0.08}}
HIST = {
    "excess_return": {2023: 0.08, 2024: 0.09},
    "roic_wacc_spread": {2023: 0.06, 2024: 0.07},
    "reinvestment_rate": {2023: 0.25, 2024: 0.30},
    "marginal_roic": {2024: 0.20},
}
CONSENSUS = {"forwardPe": 25.0, "forwardEps": 1.77, "currentYearEps": 1.70,
             "nextYearGrowth": 1.77 / 1.70 - 1, "analysts": 30}


def _block(**over):
    kw = dict(residual_income=RI, forecast=FORECAST, metric_hist=HIST,
              consensus=CONSENSUS, price=40.0, price_unusable=False, rf=0.04)
    kw.update(over)
    return ia._pe_growth(ROWS, **kw)


# ── Consensus parsing ──────────────────────────────────────────────────────

def test_consensus_from_info_reads_yahoo_fields():
    info = {"forwardPE": 35.58, "forwardEps": 9.585, "epsCurrentYear": 8.8307,
            "numberOfAnalystOpinions": 40}
    out = consensus_from_info(info)
    assert out["forwardPe"] == pytest.approx(35.58)
    # 9.585 ÷ 8.8307 − 1 = 8.54%
    assert out["nextYearGrowth"] == pytest.approx(0.0854, abs=1e-4)
    assert out["analysts"] == 40


def test_consensus_without_a_forward_pe_is_none():
    assert consensus_from_info({"forwardEps": 9.5}) is None
    assert consensus_from_info({"forwardPE": float("nan")}) is None
    assert consensus_from_info(None) is None


def test_consensus_growth_is_none_when_the_two_estimates_are_in_different_currencies():
    # BABA: forwardEps is USD per receipt, epsCurrentYear is CNY per share.
    out = consensus_from_info({"forwardPE": 11.93, "forwardEps": 9.20, "epsCurrentYear": 43.98,
                               "currency": "USD", "financialCurrency": "CNY"})
    assert out["forwardPe"] == pytest.approx(11.93)
    assert out["nextYearGrowth"] is None


def test_consensus_growth_is_none_when_either_estimate_is_a_loss():
    out = consensus_from_info({"forwardPE": 30.0, "forwardEps": 1.0, "epsCurrentYear": -0.5})
    assert out["nextYearGrowth"] is None


# ── The panel ──────────────────────────────────────────────────────────────

def test_multiples_and_yields():
    b = _block()
    assert b["forwardPe"] == pytest.approx(25.0)
    assert b["earningsYield"] == pytest.approx(0.04)
    # Trailing: 40 ÷ 1.61051 = 24.837
    assert b["trailingPe"] == pytest.approx(24.837, abs=0.01)
    assert b["treasury10y"] == pytest.approx(0.04)
    # 4% − 9% = −5 points
    assert b["earningsYieldMinusKe"] == pytest.approx(-0.05)


def test_growth_rows_use_the_book_methods():
    b = _block()
    assert b["epsGrowth5y"] == pytest.approx(0.10, abs=1e-9)        # geometric
    assert b["epsGrowthTrend5y"] == pytest.approx(0.10, abs=1e-9)   # log-linear
    assert b["consensusGrowth"] == pytest.approx(0.04118, abs=1e-4)
    # PEG on the TRAILING P/E (Ch.18): 24.837 ÷ 10 = 2.484
    assert b["peg"] == pytest.approx(2.4837, abs=0.01)
    # Sustainable growth = ROE × retention = 0.18 × 0.5
    assert b["sustainableGrowth"] == pytest.approx(0.09)
    assert b["reinvestmentRate"] == pytest.approx(0.30)
    assert b["marginalRoic"] == pytest.approx(0.20)


def test_returns_and_spreads():
    b = _block()
    assert b["roe"] == pytest.approx(0.18)
    assert b["costOfEquity"] == pytest.approx(0.09)
    assert b["roeMinusKe"] == pytest.approx(0.09)
    assert b["roicMinusWacc"] == pytest.approx(0.07)
    assert [p["year"] for p in b["spreadHistory"]] == [2023, 2024]
    assert b["spreadHistory"][-1] == {"year": 2024, "roeMinusKe": 0.09, "roicMinusWacc": 0.07}


def test_fair_pe_and_the_worked_example():
    b = _block()
    assert b["stableGrowth"] == pytest.approx(0.04)
    assert b["fairPe"] == pytest.approx(15.556, abs=0.01)
    assert b["actualToFairPe"] == pytest.approx(25 / 15.556, abs=1e-3)
    assert b["noGrowthPe"] == pytest.approx(11.111, abs=0.01)
    assert b["growthPremiumShare"] == pytest.approx(0.5556, abs=1e-4)
    assert b["impliedGrowth"] == pytest.approx(0.0643, abs=1e-4)


def test_implied_versus_deliverable_growth():
    b = _block()
    # 6.43% implied against 9% sustainable and 4.12% consensus.
    assert b["impliedMinusSustainable"] == pytest.approx(0.0643 - 0.09, abs=1e-4)
    assert b["impliedMinusConsensus"] == pytest.approx(0.0643 - 0.04118, abs=1e-4)


def test_two_stage_and_years_are_consistent_with_the_model():
    b = _block()
    # At an 18% ROE no five years of growth reach 25x (the curve tops out
    # near 21x), so the two-stage figure is a bound, not a rate.
    assert b["impliedGrowthTwoStage"] == {"growth": None, "bound": "above"}
    years = b["highGrowthYears"]
    assert years["growth"] == pytest.approx(0.10)
    assert pg.panel_two_stage_pe(0.10, years["years"], 0.18, 0.09, 0.04) == pytest.approx(25, abs=0.05)


def test_implied_return_at_consensus_growth():
    b = _block()
    # 0.04118 + (1 − 0.04118/0.18) ÷ 25 = 0.07204
    assert b["impliedReturnAtConsensus"] == pytest.approx(0.07204, abs=1e-4)


def test_grid_shock_and_scenarios_are_present():
    b = _block()
    assert b["grid"]["matrix"][2][2] == pytest.approx(15.556, abs=0.01)
    assert b["rateShock"]["up"] is not None and b["rateShock"]["down"] is not None
    cases = b["scenarios"]
    assert [c["case"] for c in cases] == ["bear", "base", "bull"]
    # 4.12% consensus < 9% sustainable < 10% historical
    assert [c["source"] for c in cases] == ["consensus", "sustainable", "historical"]
    assert cases[0]["actualToFairPe"] == pytest.approx(25 / cases[0]["fairPe"], abs=1e-3)


def test_eps_history_travels_with_the_block():
    b = _block()
    assert [p["year"] for p in b["epsHistory"]] == YEARS
    assert b["epsHistory"][-1]["eps"] == pytest.approx(1.61051, abs=1e-4)


# ── Missing inputs degrade to n/a, never to a guess ────────────────────────

def test_no_consensus_leaves_the_forward_figures_blank():
    b = _block(consensus=None)
    for k in ("forwardPe", "earningsYield", "actualToFairPe", "impliedGrowth",
              "growthPremiumShare", "consensusGrowth", "impliedReturnAtConsensus"):
        assert b[k] is None, k
    # Figures that do not need the forward P/E stay.
    assert b["fairPe"] == pytest.approx(15.556, abs=0.01)
    assert b["epsGrowth5y"] == pytest.approx(0.10, abs=1e-9)


def test_the_forward_eps_stays_out_of_the_payload():
    # It is in the quote currency per receipt for an ADR, unlike epsHistory.
    assert "forwardEps" not in _block()


def test_a_trailing_pe_far_from_the_stored_one_is_blanked():
    # BRK-B resolves to BRK-A: the A-share price over B-equivalent EPS read
    # 24,434x against a stored P/E of 16. More than 3x apart = a unit mismatch.
    rows = [dict(r) for r in ROWS]
    rows[-1]["PE Ratio"] = 16.0
    b = ia._pe_growth(rows, residual_income=RI, forecast=FORECAST, metric_hist=HIST,
                      consensus=CONSENSUS, price=40_000.0, price_unusable=False, rf=0.04)
    assert b["trailingPe"] is None and b["peg"] is None
    ok = ia._pe_growth(rows, residual_income=RI, forecast=FORECAST, metric_hist=HIST,
                       consensus=CONSENSUS, price=40.0, price_unusable=False, rf=0.04)
    assert ok["trailingPe"] == pytest.approx(24.837, abs=0.01)


def test_an_unusable_price_blanks_the_trailing_pe_and_peg():
    b = _block(price_unusable=True)
    assert b["trailingPe"] is None and b["peg"] is None


def test_a_loss_year_makes_historical_growth_not_meaningful():
    rows = [dict(r) for r in ROWS]
    rows[0]["Net Income Per Share"] = -0.2
    b = _block()
    b2 = ia._pe_growth(rows, residual_income=RI, forecast=FORECAST, metric_hist=HIST,
                       consensus=CONSENSUS, price=40.0, price_unusable=False, rf=0.04)
    assert b["epsGrowth5y"] is not None
    assert b2["epsGrowth5y"] is None and b2["epsGrowthTrend5y"] is None
    assert b2["peg"] is None


def test_a_missing_share_count_carries_the_last_known_one_forward():
    # NVDA's newest row carried net income but no per-share figures: EPS
    # must come from net income over the last known diluted share count.
    rows = [{"Calendar Year": 2023, "Net Income Per Share": 1.0,
             "Net Income": 100.0, "Weighted Average Shs Out Dil": 100.0},
            {"Calendar Year": 2024, "Net Income": 150.0}]
    assert ia._eps_series(rows) == {2023: 1.0, 2024: 1.5}


# ── Peers ──────────────────────────────────────────────────────────────────

class _Peer:
    def __init__(self, ticker, ni, mc, eq, ccy="USD", rev=1.0):
        self.ticker, self.name, self.calendar_year = ticker, ticker, 2025
        self.reported_currency, self.revenue_usd = ccy, rev
        self.ratios = {"Net Income": ni, "Market Cap": mc, "Total Stockholders Equity": eq}


class _PeerSet:
    fiscal_year = 2025

    def __init__(self, peers):
        self.peers = peers


def _peer_conn(tickers):
    import sqlite3
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE tickers (ticker TEXT, beta REAL)")
    conn.execute('CREATE TABLE financials (Ticker TEXT, "Calendar Year" TEXT, '
                 '"Payout Ratio" REAL, "Dividends Paid" REAL)')
    for t in tickers:
        conn.execute("INSERT INTO tickers VALUES (?, 1.0)", (t,))
        conn.execute("INSERT INTO financials VALUES (?, '2025', 0.3, NULL)", (t,))
    return conn


def test_peers_are_usd_filers_inside_the_scorecard_bounds():
    ps = _PeerSet([
        _Peer("OK1", 10, 150, 80), _Peer("OK2", 10, 200, 60), _Peer("OK3", 10, 120, 100),
        _Peer("OK4", 10, 180, 70), _Peer("OK5", 10, 130, 90),
        _Peer("LOSS", -5, 100, 50),                 # loss: P/E means nothing
        _Peer("RICH", 1, 500, 50),                  # P/E 500 > 100
        _Peer("TINYBOOK", 10, 150, 2),              # ROE 500% > 100%
        _Peer("TWD", 10, 150, 80, ccy="TWD"),       # stored cap currency unreliable
    ])
    out = ia._pe_peers(_peer_conn([p.ticker for p in ps.peers]), ps, "OK1", 0.04, 0.05)
    assert sorted(p["ticker"] for p in out["peers"]) == ["OK1", "OK2", "OK3", "OK4", "OK5"]
    assert out["regression"]["n"] == 5
    assert out["subject"] is not None


# ── Peer comparison arithmetic ─────────────────────────────────────────────

def test_peer_comparison_regresses_pe_on_the_spread():
    peers = [
        {"ticker": "A", "name": "A", "pe": 10.0, "fairPe": 11.0, "spread": 0.00},
        {"ticker": "B", "name": "B", "pe": 15.0, "fairPe": 14.0, "spread": 0.10},
        {"ticker": "C", "name": "C", "pe": 20.0, "fairPe": 18.0, "spread": 0.20},
        {"ticker": "D", "name": "D", "pe": 25.0, "fairPe": 20.0, "spread": 0.30},
        {"ticker": "ME", "name": "Me", "pe": 30.0, "fairPe": 16.0, "spread": 0.10},
    ]
    out = pg.peer_comparison(peers, "ME")
    by = {p["ticker"]: p for p in out["peers"]}
    assert by["ME"]["gap"] == pytest.approx(14.0)          # 30 − 16
    assert by["ME"]["isSubject"] is True
    fit = out["regression"]
    # The subject is part of the fit; its residual is P/E minus the line.
    predicted = fit["intercept"] + fit["slope"] * 0.10
    assert out["subject"]["predictedPe"] == pytest.approx(predicted)
    assert out["subject"]["residual"] == pytest.approx(30.0 - predicted)
    assert fit["n"] == 5


def test_no_regression_line_on_fewer_than_five_peers():
    peers = [{"ticker": t, "name": t, "pe": pe, "fairPe": None, "spread": sp}
             for t, pe, sp in (("A", 10.0, 0.0), ("B", 15.0, 0.1), ("C", 20.0, 0.2), ("ME", 30.0, 0.1))]
    out = pg.peer_comparison(peers, "ME")
    assert out["regression"] is None and out["subject"] is None
    assert out["peerCount"] == 4


def test_peer_comparison_without_the_subject_has_no_residual():
    peers = [{"ticker": t, "name": t, "pe": pe, "fairPe": None, "spread": s}
             for t, pe, s in (("A", 10.0, 0.0), ("B", 15.0, 0.1), ("C", 20.0, 0.2),
                              ("D", 25.0, 0.3), ("E", 12.0, 0.05))]
    out = pg.peer_comparison(peers, "ME")
    assert out["subject"] is None
    assert out["peers"][0]["gap"] is None


# ── Item 2: justified EV/NOPAT on the EVA block ────────────────────────────

def test_ev_nopat_figures():
    out = ia._ev_nopat(price=100.0, shares=10.0, gross_debt=300.0, minority=0.0,
                       cash=100.0, nopat=75.0, roic=0.15, wacc=0.10, g=0.03)
    # EV = 1,000 + 300 − 100 = 1,200 ; 1,200 ÷ 75 = 16.0
    assert out["actual"] == pytest.approx(16.0)
    assert out["justified"] == pytest.approx(11.771, abs=1e-3)
    assert out["actualToJustified"] == pytest.approx(16.0 / 11.771, abs=1e-3)
    assert out["enterpriseValue"] == pytest.approx(1200.0)


def test_ev_nopat_blank_on_a_loss_or_no_price():
    assert ia._ev_nopat(price=None, shares=10.0, gross_debt=0, minority=0, cash=0,
                        nopat=75.0, roic=0.15, wacc=0.10, g=0.03)["actual"] is None
    out = ia._ev_nopat(price=100.0, shares=10.0, gross_debt=0, minority=0, cash=0,
                       nopat=-5.0, roic=-0.01, wacc=0.10, g=0.03)
    assert out["actual"] is None and out["justified"] is None and out["actualToJustified"] is None
