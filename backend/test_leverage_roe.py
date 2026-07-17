"""Regression tests for the leverage decomposition of ROE (Damodaran,
*Investment Valuation*, Ch.11): ROE = ROIC + D/E x [ROIC - i(1-t)].

The three worked examples (Consolidated Edison, Procter & Gamble, Intel) are
replicated from the book's published table. Each row is reverse-engineered from
the four published inputs so the assertion is that OUR arithmetic reproduces HIS
published ROE, not merely that our own numbers are self-consistent.

Network-free and DB-free: the functions under test are pure given a row-like
mapping, so plain dicts stand in for sqlite3.Row.

Run:  cd backend && python -m pytest test_leverage_roe.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import individualanalysis as ia  # noqa: E402


def _row(roic: float, de: float, i: float, t: float, year: int = 2024,
         equity: float = 1000.0) -> dict:
    """Build statement lines that yield exactly (roic, de, i, t).

    Inverts the identity's inputs: pick book equity, derive debt from D/E, then
    solve operating income from the target ROIC and interest from the target book
    rate. Net income falls out of the statement rather than being asserted, which
    is what makes the ROE comparison a real check.
    """
    debt = de * equity
    invested = equity + debt
    nopat = roic * invested
    operating_income = nopat / (1 - t)
    interest = i * debt
    ibt = operating_income - interest
    tax = t * ibt
    return {
        "Calendar Year": year,
        "Total Stockholders Equity": equity,
        "Total Debt": debt,
        "Operating Income": operating_income,
        "Interest Expense": interest,
        "Income Before Tax": ibt,
        "Income Tax Expense": tax,
        "Net Income": ibt - tax,
    }


# ── Damodaran's published table (Illustration 11.7) ──────────────────────────
# (name, ROIC, book D/E, book interest rate, tax rate, published ROE)
PUBLISHED = [
    ("Consolidated Edison", 0.0666, 1.0341, 0.0575, 0.3533, 0.0970),
    ("Procter & Gamble", 0.1219, 0.5833, 0.0256, 0.2725, 0.1822),
    ("Intel", 0.2789, 0.0532, 0.0549, 0.2855, 0.2916),
]


def test_reproduces_damodaran_published_roe():
    """ROE = ROIC + D/E x [ROIC - i(1-t)] must land on the book's published ROE."""
    for name, roic, de, i, t, published_roe in PUBLISHED:
        out = ia._leverage_roe([_row(roic, de, i, t)])
        assert out["applicable"], name
        # Within 5bp of the published figure (the book rounds its inputs).
        assert abs(out["roeModel"] - published_roe) < 5e-4, f"{name}: {out['roeModel']}"


def test_terms_match_published_inputs():
    """Each decomposition term is recovered from the statement lines."""
    for name, roic, de, i, t, _roe in PUBLISHED:
        terms = ia._leverage_roe([_row(roic, de, i, t)])["terms"]
        assert abs(terms["roic"] - roic) < 1e-6, name
        assert abs(terms["debtEquity"] - de) < 1e-6, name
        assert abs(terms["bookInterestRate"] - i) < 1e-6, name
        assert abs(terms["taxRate"] - t) < 1e-6, name
        assert abs(terms["afterTaxDebtCost"] - i * (1 - t)) < 1e-6, name
        assert abs(terms["spread"] - (roic - i * (1 - t))) < 1e-6, name
        assert abs(terms["leverageGain"] - de * (roic - i * (1 - t))) < 1e-6, name


def test_model_reconciles_with_reported_roe():
    """With no non-operating income the modelled ROE equals the reported ROE."""
    out = ia._leverage_roe([_row(0.0666, 1.0341, 0.0575, 0.3533)])
    assert out["reconciles"] is True
    assert abs(out["nonOperatingGap"]) < 1e-4


def test_non_operating_income_opens_a_gap_and_breaks_reconciliation():
    """Non-operating profit lifts reported ROE above the operating identity.

    This is the third way a ROE is inflated (after leverage and a low tax rate),
    and the gap is the signal the section is built to surface.
    """
    row = _row(0.0666, 1.0341, 0.0575, 0.3533)
    # A large one-off gain below the operating line: net income rises, operating
    # income does not, so the modelled ROE cannot see it.
    row["Net Income"] = row["Net Income"] + 400.0
    out = ia._leverage_roe([row])
    assert out["reconciles"] is False
    assert out["nonOperatingGap"] > 0.3      # reported ROE far above modelled


def test_leverage_drag_when_roic_below_after_tax_debt_cost():
    """A negative spread makes the leverage term a drag, pulling ROE under ROIC."""
    # ROIC 2% against a 5.75% book rate at 35.33% tax -> after-tax cost 3.72%.
    out = ia._leverage_roe([_row(0.02, 1.0341, 0.0575, 0.3533)])
    assert out["terms"]["spread"] < 0
    assert out["terms"]["leverageGain"] < 0
    assert out["roeModel"] < out["terms"]["roic"]    # leverage destroyed equity return
    assert out["spreadPositive"] is False


def test_debt_free_company_has_zero_leverage_gain_and_roe_equals_roic():
    """With no debt the identity collapses to ROE = ROIC."""
    row = _row(0.2789, 0.0, 0.0, 0.2855)
    row["Interest Expense"] = 0.0
    out = ia._leverage_roe([row])
    assert out["terms"]["debtEquity"] == 0.0
    assert out["terms"]["leverageGain"] == 0.0
    assert out["terms"]["bookInterestRate"] is None   # no debt, no rate to quote
    assert abs(out["roeModel"] - out["terms"]["roic"]) < 1e-9


def test_negative_book_equity_voids_the_decomposition():
    """Negative book equity makes D/E and ROE meaningless, so the year drops."""
    row = _row(0.0666, 1.0341, 0.0575, 0.3533)
    row["Total Stockholders Equity"] = -500.0
    out = ia._leverage_roe([row])
    assert out["applicable"] is False
    assert out["terms"]["debtEquity"] is None
    assert out["roeModel"] is None


def test_leverage_share_attributes_roe_between_business_and_balance_sheet():
    """Con Ed leans on leverage; Intel does not. The share must show that."""
    con_ed = ia._leverage_roe([_row(0.0666, 1.0341, 0.0575, 0.3533)])
    intel = ia._leverage_roe([_row(0.2789, 0.0532, 0.0549, 0.2855)])
    assert con_ed["leverageShare"] > 0.30      # ~31% of ROE is financing
    assert intel["leverageShare"] < 0.05       # ~4%: essentially all operations


def test_leverage_share_withheld_when_roic_negative():
    """A loss-making firm's share ratio is arithmetic noise, so it is not shown."""
    out = ia._leverage_roe([_row(-0.05, 1.0, 0.05, 0.25)])
    assert out["leverageShare"] is None


def test_history_rows_cover_every_year_ascending():
    rows = [_row(0.10, 0.5, 0.05, 0.25, year=y) for y in (2021, 2022, 2023)]
    out = ia._leverage_roe(rows)
    assert [r["year"] for r in out["rows"]] == [2021, 2022, 2023]
    assert out["latestYear"] == 2023


def test_metric_history_exposes_the_identity_terms():
    """The table's cells and their sidebar charts must come from one source."""
    rows = [_row(0.10, 0.5, 0.05, 0.25, year=y) for y in (2022, 2023)]
    hist = ia.metric_history(rows)
    for key in ("book_interest_rate", "effective_tax_rate", "leverage_gain",
                "after_tax_debt_cost", "roic_book_rate_spread"):
        assert key in hist, key
        assert abs(hist[key][2023] - {
            "book_interest_rate": 0.05,
            "effective_tax_rate": 0.25,
            "leverage_gain": 0.5 * (0.10 - 0.05 * 0.75),
            "after_tax_debt_cost": 0.05 * 0.75,
            "roic_book_rate_spread": 0.10 - 0.05 * 0.75,
        }[key]) < 1e-6, key


def test_zero_interest_on_real_debt_is_treated_as_missing_not_as_zero_percent():
    """A stored 0 interest expense against real debt is missing data, not a 0% rate.

    Real case: the warehouse holds 0.0 interest for AAPL FY2024-25 against >$100B
    of debt, because the filer nets interest inside "other income". Taken at face
    value the spread would swallow the entire ROIC and the leverage gain would be
    wildly overstated, so the rate must come back unknown instead.
    """
    row = _row(0.60, 1.52, 0.03, 0.156)
    row["Interest Expense"] = 0.0          # vendor gap, debt is still ~1.5x equity
    out = ia._leverage_roe([row])
    terms = out["terms"]
    assert terms["bookInterestRate"] is None      # never a fabricated 0.00%
    assert terms["afterTaxDebtCost"] is None
    assert terms["spread"] is None                # would otherwise equal the full ROIC
    assert terms["leverageGain"] is None          # would otherwise be ~91%
    # The known terms still survive for the reader.
    assert terms["roic"] is not None
    assert terms["debtEquity"] is not None


def test_zero_interest_guard_does_not_fire_for_a_genuinely_debt_free_company():
    """Debt-free is a real state, not missing data: the gain stays a defined 0."""
    row = _row(0.2789, 0.0, 0.0, 0.2855)
    row["Interest Expense"] = 0.0
    out = ia._leverage_roe([row])
    assert out["terms"]["leverageGain"] == 0.0
    assert out["roeModel"] is not None


def test_interest_expense_sign_is_normalised():
    """Vendors store interest expense with either sign; the rate stays positive."""
    row = _row(0.10, 0.5, 0.05, 0.25)
    row["Interest Expense"] = -row["Interest Expense"]
    out = ia._leverage_roe([row])
    assert out["terms"]["bookInterestRate"] > 0


def test_headline_falls_back_to_latest_computable_year():
    """A vendor gap in the newest year must not blank a company with good history."""
    good = _row(0.10, 0.5, 0.05, 0.25, year=2023)
    broken = _row(0.10, 0.5, 0.05, 0.25, year=2024)
    broken["Interest Expense"] = 0.0          # the AAPL FY2024-25 shape
    out = ia._leverage_roe([good, broken])
    assert out["applicable"] is True
    assert out["latestYear"] == 2023          # headline on the year that computes
    assert out["dataThroughYear"] == 2024     # but the reader is told data runs to 2024
    assert out["staleLatest"] is True
    assert len(out["rows"]) == 2              # both years still charted


def test_not_stale_when_the_newest_year_computes():
    rows = [_row(0.10, 0.5, 0.05, 0.25, year=y) for y in (2023, 2024)]
    out = ia._leverage_roe(rows)
    assert out["staleLatest"] is False
    assert out["latestYear"] == out["dataThroughYear"] == 2024
